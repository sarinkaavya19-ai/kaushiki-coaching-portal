const mockAttendanceFindMany = jest.fn();
const mockDispatchLowAttendanceWarning = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendance: { findMany: (...args: any[]) => mockAttendanceFindMany(...args) },
  },
}));

jest.mock('@/lib/email/attendance-warning', () => ({
  dispatchLowAttendanceWarning: (...args: any[]) => mockDispatchLowAttendanceWarning(...args),
}));

import {
  getMonthRange,
  formatMonthKey,
  monthLabelFor,
  parseMonthKey,
  calculateMonthlyAttendance,
  findLowAttendanceStudents,
  processLowAttendanceWarnings,
} from '@/lib/attendance/low-attendance';

describe('low-attendance helpers', () => {
  it('getMonthRange returns the whole month as a UTC range', () => {
    const { from, to } = getMonthRange(new Date('2026-08-15T12:00:00Z'));
    expect(from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it('formatMonthKey and parseMonthKey round-trip', () => {
    const date = parseMonthKey('2026-08');
    expect(formatMonthKey(date)).toBe('2026-08');
  });

  it('monthLabelFor renders a friendly month label', () => {
    expect(monthLabelFor(new Date('2026-08-15T00:00:00Z'))).toContain('August');
  });
});

describe('calculateMonthlyAttendance', () => {
  it('aggregates present/total per student', async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's1', present: true, student: { name: 'Arjun' } },
      { studentId: 's1', present: false, student: { name: 'Arjun' } },
      { studentId: 's2', present: true, student: { name: 'Neha' } },
    ]);

    const result = await calculateMonthlyAttendance(new Date('2026-08-15T00:00:00Z'));

    expect(result).toEqual([
      { studentId: 's1', studentName: 'Arjun', totalSessions: 2, presentSessions: 1, percentage: 50 },
      { studentId: 's2', studentName: 'Neha', totalSessions: 1, presentSessions: 1, percentage: 100 },
    ]);
  });

  it('returns an empty list when there is no attendance', async () => {
    mockAttendanceFindMany.mockResolvedValue([]);
    const result = await calculateMonthlyAttendance(new Date('2026-08-15T00:00:00Z'));
    expect(result).toEqual([]);
  });
});

describe('findLowAttendanceStudents', () => {
  beforeEach(() => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's1', present: true, student: { name: 'Arjun' } },
      { studentId: 's1', present: false, student: { name: 'Arjun' } },
      { studentId: 's2', present: true, student: { name: 'Neha' } },
      { studentId: 's3', present: true, student: { name: 'Rahul' } },
    ]);
  });

  it('flags students below the threshold and sorts ascending', async () => {
    const result = await findLowAttendanceStudents(new Date('2026-08-15T00:00:00Z'), 75);

    expect(result.flagged.map((s) => s.studentId)).toEqual(['s1']);
    expect(result.checked).toBe(3);
    expect(result.month).toBe('2026-08');
  });

  it('honours a custom threshold', async () => {
    const result = await findLowAttendanceStudents(new Date('2026-08-15T00:00:00Z'), 100);

    expect(result.flagged.map((s) => s.studentId)).toEqual(['s1']);
    expect(result.threshold).toBe(100);
  });

  it('excludes students with no sessions', async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's1', present: true, student: { name: 'Arjun' } },
      { studentId: 's1', present: false, student: { name: 'Arjun' } },
    ]);

    const result = await findLowAttendanceStudents(new Date('2026-08-15T00:00:00Z'), 75);
    expect(result.flagged.map((s) => s.studentId)).toEqual(['s1']);
  });
});

describe('processLowAttendanceWarnings', () => {
  beforeEach(() => {
    mockAttendanceFindMany.mockResolvedValue([
      { studentId: 's1', present: true, student: { name: 'Arjun' } },
      { studentId: 's1', present: false, student: { name: 'Arjun' } },
      { studentId: 's2', present: true, student: { name: 'Neha' } },
    ]);
    mockDispatchLowAttendanceWarning.mockResolvedValue({
      success: true,
      total: 1,
      sent: 1,
      failed: 0,
      recipients: ['parent@example.com'],
      errors: [],
    });
  });

  it('dispatches warnings for every flagged student and returns a summary', async () => {
    const result = await processLowAttendanceWarnings({ date: new Date('2026-08-15T00:00:00Z') });

    expect(mockDispatchLowAttendanceWarning).toHaveBeenCalledTimes(1);
    expect(mockDispatchLowAttendanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 's1',
        attendancePercentage: 50,
        threshold: 75,
        monthLabel: expect.stringContaining('August'),
      })
    );
    expect(result.flagged.length).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.emailsSent).toBe(1);
    expect(result.students[0].dispatch.success).toBe(true);
  });

  it('counts delivery failures as failed without throwing', async () => {
    mockDispatchLowAttendanceWarning.mockResolvedValue({
      success: false,
      total: 1,
      sent: 0,
      failed: 1,
      recipients: ['parent@example.com'],
      errors: ['resend down'],
    });

    const result = await processLowAttendanceWarnings({ date: new Date('2026-08-15T00:00:00Z') });

    expect(result.dispatched).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.students[0].dispatch.errors[0]).toContain('resend down');
  });

  it('never rejects even when dispatch rejects', async () => {
    mockDispatchLowAttendanceWarning.mockRejectedValue(new Error('boom'));

    const result = await processLowAttendanceWarnings({ date: new Date('2026-08-15T00:00:00Z') });

    expect(result.failed).toBe(1);
    expect(result.students[0].dispatch.errors[0]).toContain('boom');
  });
});