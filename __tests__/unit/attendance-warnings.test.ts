const mockSendEmailWithFallback = jest.fn();
const mockIsEmailConfigured = jest.fn().mockReturnValue(true);
const mockAttendanceFindMany = jest.fn();
const mockBatchFindUnique = jest.fn();
const mockParentLinkFindMany = jest.fn();
const mockEmailLogCreate = jest.fn();

jest.mock('@/lib/email', () => ({
  sendEmailWithFallback: (...args: any[]) => mockSendEmailWithFallback(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendance: { findMany: (...args: any[]) => mockAttendanceFindMany(...args) },
    batch: { findUnique: (...args: any[]) => mockBatchFindUnique(...args) },
    parentStudentLink: { findMany: (...args: any[]) => mockParentLinkFindMany(...args) },
    emailLog: { create: (...args: any[]) => mockEmailLogCreate(...args) },
  },
}));

import { dispatchAttendanceWarnings, evaluateMonthlyAttendance, ATTENDANCE_THRESHOLD } from '@/lib/attendance/warnings';

function date(day: number): Date {
  return new Date(Date.UTC(2026, 6, day));
}

describe('evaluateMonthlyAttendance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes held classes and per-student percentage for a month', async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(1), present: true },
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(2), present: true },
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(3), present: false },
      { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(1), present: true },
      { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(2), present: true },
      { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(3), present: true },
    ]);

    const result = await evaluateMonthlyAttendance({ batchId: 'batch-1', month: '2026-07' });

    expect(result).toEqual([
      expect.objectContaining({ studentId: 's-1', attended: 2, held: 3, percentage: 66.67 }),
      expect.objectContaining({ studentId: 's-2', attended: 3, held: 3, percentage: 100 }),
    ]);
  });

  it('queries attendance within the month bounds only', async () => {
    mockAttendanceFindMany.mockResolvedValue([]);

    await evaluateMonthlyAttendance({ batchId: 'batch-1', month: '2026-07' });

    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batchId: 'batch-1',
          sessionDate: {
            gte: new Date(Date.UTC(2026, 6, 1)),
            lt: new Date(Date.UTC(2026, 7, 1)),
          },
        },
      })
    );
  });

  it('returns zero percentage when no classes were held', async () => {
    mockAttendanceFindMany.mockResolvedValue([]);

    const result = await evaluateMonthlyAttendance({ batchId: 'batch-1', month: '2026-07' });

    expect(result).toEqual([]);
  });
});

describe('dispatchAttendanceWarnings', () => {
  const baseArgs = { batchId: 'batch-1', month: '2026-07' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEmailConfigured.mockReturnValue(true);
    mockBatchFindUnique.mockResolvedValue({ id: 'batch-1', subject: { name: 'Mathematics' } });
    mockParentLinkFindMany.mockResolvedValue([]);
    mockSendEmailWithFallback.mockResolvedValue({ success: true, data: { id: 'msg-1', provider: 'resend' } });
    mockEmailLogCreate.mockResolvedValue({ id: 'log-1' });
  });

  const threeClasses = () => [
    { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(1), present: true },
    { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(2), present: true },
    { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(3), present: false },
    { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(1), present: true },
    { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(2), present: true },
    { studentId: 's-2', student: { name: 'Sneha', email: 'sneha@test.com' }, sessionDate: date(3), present: true },
  ];

  it('warns students below the threshold and their linked parents', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());
    mockParentLinkFindMany.mockResolvedValue([
      { studentId: 's-1', parent: { name: 'Suresh', email: 'suresh@test.com' } },
    ]);

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(result.warned).toBe(1);
    expect(result.checked).toBe(2);
    expect(mockSendEmailWithFallback).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmailWithFallback.mock.calls.map(([options]) => options.to);
    expect(recipients).toEqual(expect.arrayContaining(['rohan@test.com', 'suresh@test.com']));
    expect(mockSendEmailWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Mathematics'),
        html: expect.stringContaining('Rohan'),
        text: expect.stringContaining('66.67%'),
      })
    );
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('does not warn students whose attendance is at or above the threshold', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(result.warned).toBe(1);
    expect(mockSendEmailWithFallback.mock.calls.map(([options]) => options.to)).not.toContain('sneha@test.com');
  });

  it('only looks up approved parent links for flagged students', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());
    mockParentLinkFindMany.mockResolvedValue([]);

    await dispatchAttendanceWarnings(baseArgs);

    expect(mockParentLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: { in: ['s-1'] }, status: 'APPROVED' },
      })
    );
  });

  it('skips flagged students that have no email addresses anywhere', async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's-1', student: { name: 'Rohan', email: null }, sessionDate: date(1), present: false },
    ]);
    mockParentLinkFindMany.mockResolvedValue([
      { studentId: 's-1', parent: { name: 'Suresh', email: null } },
    ]);

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(result.warned).toBe(0);
    expect(result.success).toBe(true);
  });

  it('sends nothing when no students fall below the threshold', async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(1), present: true },
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(2), present: true },
      { studentId: 's-1', student: { name: 'Rohan', email: 'rohan@test.com' }, sessionDate: date(3), present: true },
    ]);

    await dispatchAttendanceWarnings(baseArgs);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
  });

  it('logs a delivery record per recipient', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());
    mockParentLinkFindMany.mockResolvedValue([
      { studentId: 's-1', parent: { name: 'Suresh', email: 'suresh@test.com' } },
    ]);

    await dispatchAttendanceWarnings(baseArgs);

    expect(mockEmailLogCreate).toHaveBeenCalledTimes(2);
    expect(mockEmailLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          template: 'ATTENDANCE_WARNING',
          status: 'SENT',
          html: expect.stringContaining('Rohan'),
        }),
      })
    );
  });

  it('counts failed deliveries without throwing', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());
    mockSendEmailWithFallback.mockResolvedValue({ success: false, error: new Error('smtp down') });

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('smtp down');
  });

  it('never rejects even when the email provider rejects', async () => {
    mockAttendanceFindMany.mockResolvedValue(threeClasses());
    mockSendEmailWithFallback.mockRejectedValue(new Error('network error'));

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('network error');
  });

  it('never rejects when database lookups fail', async () => {
    mockAttendanceFindMany.mockRejectedValue(new Error('db down'));

    await expect(dispatchAttendanceWarnings(baseArgs)).resolves.toMatchObject({
      success: false,
      errors: ['db down'],
    });
  });

  it('skips dispatch when email is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);

    const result = await dispatchAttendanceWarnings(baseArgs);

    expect(mockAttendanceFindMany).not.toHaveBeenCalled();
    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('exposes the configured threshold', () => {
    expect(ATTENDANCE_THRESHOLD).toBe(75);
  });
});
