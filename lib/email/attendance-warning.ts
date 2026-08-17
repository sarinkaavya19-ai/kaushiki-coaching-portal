import { prisma } from '@/lib/db/prisma';
import { sendEmailWithFallback, isEmailConfigured } from '@/lib/email';
import { logEmailDispatch } from '@/lib/email/audit';
import { attendanceWarningTemplate } from '@/lib/email/attendance-warning-templates';
import type { LowAttendanceDispatchResult, AttendanceWarningRecipient } from '@/types/attendance-email';

export interface LowAttendanceDispatchInput {
  studentId: string;
  attendancePercentage: number;
  threshold: number;
  presentSessions: number;
  totalSessions: number;
  monthLabel: string;
}

const ATTENDANCE_WARNING_TEMPLATE = 'attendance_warning';

/**
 * Dispatches low-attendance warning emails to all approved parents of a
 * flagged student. Never throws — delivery failures are counted, logged and
 * returned in the result so callers can continue the main flow.
 */
export async function dispatchLowAttendanceWarning(input: LowAttendanceDispatchInput): Promise<LowAttendanceDispatchResult> {
  const result: LowAttendanceDispatchResult = { success: false, total: 0, sent: 0, failed: 0, recipients: [], errors: [] };

  try {
    if (!isEmailConfigured()) {
      result.success = true;
      return result;
    }

    const [student, links] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.studentId },
        select: { name: true, email: true },
      }),
      prisma.parentStudentLink.findMany({
        where: { studentId: input.studentId, status: 'APPROVED' },
        include: { parent: { select: { name: true, email: true } } },
      }),
    ]);

    const recipients = new Map<string, AttendanceWarningRecipient>();
    for (const link of links) {
      if (link.parent.email) {
        recipients.set(link.parent.email, {
          name: link.parent.name || 'Parent',
          email: link.parent.email,
          relation: 'PARENT',
        });
      }
    }

    if (recipients.size === 0) {
      result.success = true;
      return result;
    }

    const studentName = student?.name || 'Student';
    const subject = `Attendance Alert: ${studentName} below ${input.threshold}% – Kaushiki Classes`;
    const recipientList = [...recipients.values()];
    result.recipients = recipientList.map((r) => r.email);
    result.total = result.recipients.length;

    const template = attendanceWarningTemplate({
      studentName,
      attendancePercentage: input.attendancePercentage,
      threshold: input.threshold,
      presentSessions: input.presentSessions,
      totalSessions: input.totalSessions,
      monthLabel: input.monthLabel,
      recipientRole: 'PARENT',
    });

    const outcomes = await Promise.allSettled(
      recipientList.map((recipient) =>
        sendEmailWithFallback({
          to: recipient.email,
          subject,
          html: template.html,
          text: template.text,
        })
      )
    );

    outcomes.forEach((outcome, index) => {
      const recipient = recipientList[index];

      if (outcome.status === 'fulfilled' && outcome.value.success) {
        result.sent += 1;
        console.log(`[Attendance Warning Email] Sent to ${recipient.email} for student ${input.studentId}`);
        void logEmailDispatch({
          recipientEmail: recipient.email,
          subject,
          emailType: 'ATTENDANCE_WARNING',
          template: ATTENDANCE_WARNING_TEMPLATE,
          status: 'SENT',
          providerResponse: outcome.value.data,
          payloadData: {
            to: recipient.email,
            subject,
            html: template.html,
            text: template.text,
          },
        });
        return;
      }

      result.failed += 1;
      const errorMessage =
        outcome.status === 'rejected'
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason)
          : outcome.value.error?.message || 'Unknown email error';

      result.errors.push(`${recipient.email}: ${errorMessage}`);
      console.error(`[Attendance Warning Email] Failed to send to ${recipient.email} for student ${input.studentId}: ${errorMessage}`);
      void logEmailDispatch({
        recipientEmail: recipient.email,
        subject,
        emailType: 'ATTENDANCE_WARNING',
        template: ATTENDANCE_WARNING_TEMPLATE,
        status: 'FAILED',
        errorMessage,
        payloadData: {
          to: recipient.email,
          subject,
          html: template.html,
          text: template.text,
        },
      });
    });

    result.success = result.failed === 0;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    console.error('[Attendance Warning Email] Failed to dispatch warnings:', message);
    return result;
  }
}