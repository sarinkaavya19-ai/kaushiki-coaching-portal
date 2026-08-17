const mockSendEmailWithFallback = jest.fn();
const mockIsEmailConfigured = jest.fn().mockReturnValue(true);
const mockUserFindUnique = jest.fn();
const mockParentLinkFindMany = jest.fn();
const mockLogEmailDispatch = jest.fn();

jest.mock('@/lib/email', () => ({
  sendEmailWithFallback: (...args: any[]) => mockSendEmailWithFallback(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
    parentStudentLink: { findMany: (...args: any[]) => mockParentLinkFindMany(...args) },
  },
}));

jest.mock('@/lib/email/audit', () => ({
  logEmailDispatch: (...args: any[]) => mockLogEmailDispatch(...args),
}));

import { dispatchLowAttendanceWarning } from '@/lib/email/attendance-warning';

describe('dispatchLowAttendanceWarning', () => {
  const baseInput = {
    studentId: 'student-1',
    attendancePercentage: 60,
    threshold: 75,
    presentSessions: 6,
    totalSessions: 10,
    monthLabel: 'August 2026',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEmailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ name: 'Arjun Patil', email: 'arjun@example.com' });
    mockParentLinkFindMany.mockResolvedValue([]);
    mockSendEmailWithFallback.mockResolvedValue({ success: true, data: { id: 'msg-1', provider: 'resend' } });
    mockLogEmailDispatch.mockResolvedValue('log-1');
  });

  it('sends to all approved parents of the student', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
      { parent: { name: 'Anita Patil', email: 'anita@example.com' } },
    ]);

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(mockSendEmailWithFallback).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmailWithFallback.mock.calls.map(([options]) => options.to);
    expect(recipients).toEqual(expect.arrayContaining(['suresh@example.com', 'anita@example.com']));
    expect(mockSendEmailWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `Attendance Alert: Arjun Patil below 75% – Kaushiki Classes`,
        html: expect.stringContaining('Arjun Patil'),
        text: expect.stringContaining('60%'),
      })
    );
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('only queries approved parent links for the student', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
    ]);

    await dispatchLowAttendanceWarning(baseInput);

    expect(mockParentLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'student-1', status: 'APPROVED' },
      })
    );
  });

  it('skips parents without an email address', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
      { parent: { name: 'Anita Patil', email: null } },
    ]);

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(mockSendEmailWithFallback).toHaveBeenCalledTimes(1);
    expect(result.recipients).toEqual(['suresh@example.com']);
  });

  it('does not send anything when there are no approved parents with email', async () => {
    mockParentLinkFindMany.mockResolvedValue([]);

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.success).toBe(true);
  });

  it('logs an email audit entry with the ATTENDANCE_WARNING type', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
    ]);

    await dispatchLowAttendanceWarning(baseInput);

    expect(mockLogEmailDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'suresh@example.com',
        emailType: 'ATTENDANCE_WARNING',
        template: 'attendance_warning',
        status: 'SENT',
      })
    );
  });

  it('counts failed deliveries without throwing', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
    ]);
    mockSendEmailWithFallback.mockResolvedValue({ success: false, error: new Error('resend down') });

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('resend down');
  });

  it('never rejects even when the email provider rejects', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
    ]);
    mockSendEmailWithFallback.mockRejectedValue(new Error('network error'));

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('network error');
  });

  it('never rejects when the database lookups fail', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('db down'));

    await expect(dispatchLowAttendanceWarning(baseInput)).resolves.toMatchObject({
      success: false,
      errors: ['db down'],
    });
  });

  it('skips dispatch when email is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);

    const result = await dispatchLowAttendanceWarning(baseInput);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});