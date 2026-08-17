import { prisma } from '@/lib/db/prisma';
import { dispatchLowAttendanceWarning } from '@/lib/email/attendance-warning';
import type { LowAttendanceDispatchResult } from '@/types/attendance-email';

export const DEFAULT_ATTENDANCE_THRESHOLD = 75;

export interface StudentMonthlyAttendance {
  studentId: string;
  studentName: string;
  totalSessions: number;
  presentSessions: number;
  percentage: number;
}

export interface LowAttendanceCheckResult {
  month: string;
  threshold: number;
  checked: number;
  flagged: StudentMonthlyAttendance[];
}

export interface LowAttendanceProcessResult extends LowAttendanceCheckResult {
  dispatched: number;
  failed: number;
  emailsSent: number;
  students: Array<StudentMonthlyAttendance & { dispatch: LowAttendanceDispatchResult }>;
}

export function getMonthRange(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { from, to };
}

export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function monthLabelFor(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function parseMonthKey(month: string): Date {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1));
}

export async function calculateMonthlyAttendance(date: Date): Promise<StudentMonthlyAttendance[]> {
  const { from, to } = getMonthRange(date);

  const records = await prisma.attendance.findMany({
    where: { sessionDate: { gte: from, lte: to } },
    select: { studentId: true, present: true, student: { select: { name: true } } },
  });

  const byStudent = new Map<string, { name: string; total: number; present: number }>();
  for (const record of records) {
    const entry = byStudent.get(record.studentId) || { name: record.student.name, total: 0, present: 0 };
    entry.total += 1;
    if (record.present) entry.present += 1;
    byStudent.set(record.studentId, entry);
  }

  return Array.from(byStudent.entries()).map(([studentId, stats]) => ({
    studentId,
    studentName: stats.name,
    totalSessions: stats.total,
    presentSessions: stats.present,
    percentage: stats.total > 0 ? Math.round((stats.present / stats.total) * 10000) / 100 : 0,
  }));
}

export async function findLowAttendanceStudents(
  date: Date,
  threshold = DEFAULT_ATTENDANCE_THRESHOLD
): Promise<LowAttendanceCheckResult> {
  const all = await calculateMonthlyAttendance(date);

  const flagged = all
    .filter((student) => student.totalSessions > 0 && student.percentage < threshold)
    .sort((a, b) => a.percentage - b.percentage);

  return {
    month: formatMonthKey(date),
    threshold,
    checked: all.length,
    flagged,
  };
}

/**
 * Runs the low-attendance check for a month and dispatches warning emails to
 * the parents of every flagged student. Email delivery failures are captured
 * per student and never bubble up as an exception.
 */
export async function processLowAttendanceWarnings(options?: {
  date?: Date;
  threshold?: number;
}): Promise<LowAttendanceProcessResult> {
  const date = options?.date ?? new Date();
  const threshold = options?.threshold ?? DEFAULT_ATTENDANCE_THRESHOLD;

  const check = await findLowAttendanceStudents(date, threshold);
  const monthLabel = monthLabelFor(date);

  const outcomes = await Promise.allSettled(
    check.flagged.map((student) =>
      dispatchLowAttendanceWarning({
        studentId: student.studentId,
        attendancePercentage: student.percentage,
        threshold,
        presentSessions: student.presentSessions,
        totalSessions: student.totalSessions,
        monthLabel,
      })
    )
  );

  let dispatched = 0;
  let failed = 0;
  let emailsSent = 0;
  const students: LowAttendanceProcessResult['students'] = [];

  outcomes.forEach((outcome, index) => {
    const student = check.flagged[index];

    if (outcome.status === 'rejected') {
      failed += 1;
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      console.error(`[Low Attendance] Warning dispatch rejected for ${student.studentName} (${student.studentId}): ${message}`);
      students.push({
        ...student,
        dispatch: { success: false, total: 0, sent: 0, failed: 1, recipients: [], errors: [message] },
      });
      return;
    }

    const dispatch = outcome.value;
    emailsSent += dispatch.sent;
    if (dispatch.success) {
      dispatched += 1;
    } else {
      failed += 1;
    }
    students.push({ ...student, dispatch });
  });

  console.log(
    `[Low Attendance] ${check.month} check complete: checked=${check.checked}, flagged=${check.flagged.length}, dispatched=${dispatched}, failed=${failed}, emailsSent=${emailsSent}`
  );

  return { ...check, dispatched, failed, emailsSent, students };
}