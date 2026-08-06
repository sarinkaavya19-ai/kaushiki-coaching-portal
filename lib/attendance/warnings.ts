import { prisma } from '@/lib/db/prisma';
import { sendEmailWithFallback, isEmailConfigured } from '@/lib/email';
import { lowAttendanceWarningTemplate } from '@/lib/email/attendance-templates';
import { logEmailDelivery } from '@/lib/email/email-log';

export const ATTENDANCE_THRESHOLD = 75;
const ATTENDANCE_WARNING_TEMPLATE = 'ATTENDANCE_WARNING';

export interface MonthlyAttendance {
  studentId: string;
  studentName: string;
  email: string | null;
  attended: number;
  held: number;
  percentage: number;
}

export interface AttendanceWarningDispatchResult {
  success: boolean;
  checked: number;
  warned: number;
  sent: number;
  failed: number;
  recipients: string[];
  errors: string[];
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function evaluateMonthlyAttendance(args: {
  batchId: string;
  month: string;
}): Promise<MonthlyAttendance[]> {
  const { start, end } = monthBounds(args.month);

  const records = await prisma.attendance.findMany({
    where: {
      batchId: args.batchId,
      sessionDate: { gte: start, lt: end },
    },
    include: { student: { select: { id: true, name: true, email: true } } },
  });

  const heldDates = new Set<string>();
  const byStudent = new Map<string, { name: string; email: string | null; attended: number }>();

  for (const record of records) {
    const key = record.sessionDate.toISOString().slice(0, 10);
    heldDates.add(key);

    const entry = byStudent.get(record.studentId) || {
      name: record.student.name,
      email: record.student.email,
      attended: 0,
    };
    if (record.present) entry.attended += 1;
    byStudent.set(record.studentId, entry);
  }

  const held = heldDates.size;

  return [...byStudent.entries()].map(([studentId, entry]) => ({
    studentId,
    studentName: entry.name,
    email: entry.email,
    attended: entry.attended,
    held,
    percentage: held > 0 ? Math.round((entry.attended / held) * 10000) / 100 : 0,
  }));
}

export async function dispatchAttendanceWarnings(args: {
  batchId: string;
  month: string;
}): Promise<AttendanceWarningDispatchResult> {
  const result: AttendanceWarningDispatchResult = {
    success: false,
    checked: 0,
    warned: 0,
    sent: 0,
    failed: 0,
    recipients: [],
    errors: [],
  };

  try {
    if (!isEmailConfigured()) {
      result.success = true;
      return result;
    }

    const attendance = await evaluateMonthlyAttendance(args);
    result.checked = attendance.length;

    const lowAttendance = attendance.filter((a) => a.held > 0 && a.percentage < ATTENDANCE_THRESHOLD);
    if (lowAttendance.length === 0) {
      result.success = true;
      return result;
    }

    const [batch, links] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: args.batchId },
        include: { subject: { select: { name: true } } },
      }),
      prisma.parentStudentLink.findMany({
        where: { studentId: { in: lowAttendance.map((a) => a.studentId) }, status: 'APPROVED' },
        include: { parent: { select: { name: true, email: true } } },
      }),
    ]);

    if (!batch) {
      result.success = true;
      return result;
    }

    const batchName = batch.subject?.name || 'Batch';
    const month = monthLabel(args.month);
    const linksByStudent = new Map<string, string[]>();
    for (const link of links) {
      if (!link.parent.email) continue;
      const list = linksByStudent.get(link.studentId) || [];
      list.push(link.parent.email);
      linksByStudent.set(link.studentId, list);
    }

    const sends: Promise<void>[] = [];

    for (const entry of lowAttendance) {
      const recipients = new Map<string, string>();
      if (entry.email) recipients.set(entry.email, entry.studentName);
      for (const email of linksByStudent.get(entry.studentId) || []) {
        recipients.set(email, entry.studentName);
      }

      if (recipients.size === 0) continue;

      result.warned += 1;
      const template = lowAttendanceWarningTemplate({
        studentName: entry.studentName,
        batchName,
        monthLabel: month,
        attended: entry.attended,
        held: entry.held,
        threshold: ATTENDANCE_THRESHOLD,
      });

      const subject = `Low attendance warning for ${batchName} (${month}) – Kaushiki Classes`;

      for (const [email] of recipients) {
        result.recipients.push(email);
        sends.push(
          sendEmailWithFallback({
            to: email,
            subject,
            html: template.html,
            text: template.text,
          })
            .then((outcome) => {
              if (outcome.success) {
                result.sent += 1;
                void logEmailDelivery({
                  recipient: email,
                  subject,
                  template: ATTENDANCE_WARNING_TEMPLATE,
                  html: template.html,
                  text: template.text,
                  status: 'SENT',
                  providerResponse: outcome.data,
                  sentAt: new Date(),
                });
                return;
              }
              result.failed += 1;
              result.errors.push(`${email}: ${outcome.error?.message || 'Unknown email error'}`);
              void logEmailDelivery({
                recipient: email,
                subject,
                template: ATTENDANCE_WARNING_TEMPLATE,
                html: template.html,
                text: template.text,
                status: 'FAILED',
                errorMessage: outcome.error?.message,
              });
            })
            .catch((err) => {
              result.failed += 1;
              const message = err instanceof Error ? err.message : String(err);
              result.errors.push(`${email}: ${message}`);
              void logEmailDelivery({
                recipient: email,
                subject,
                template: ATTENDANCE_WARNING_TEMPLATE,
                html: template.html,
                text: template.text,
                status: 'FAILED',
                errorMessage: message,
              });
            })
        );
      }
    }

    await Promise.all(sends);
    result.success = result.failed === 0;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    console.error('[Attendance Warning] Failed to dispatch warnings:', message);
    return result;
  }
}
