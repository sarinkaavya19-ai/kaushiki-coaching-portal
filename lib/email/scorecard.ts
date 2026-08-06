import { prisma } from '@/lib/db/prisma';
import { sendEmailWithFallback, isEmailConfigured } from '@/lib/email';
import { testScorecardTemplate } from '@/lib/email/scorecard-templates';
import { logEmailDelivery } from '@/lib/email/email-log';

export interface ScorecardDispatchInput {
  studentId: string;
  testTitle: string;
  totalMarks: number;
  score: number;
  remarks?: string | null;
}

export interface ScorecardDispatchResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  recipients: string[];
  errors: string[];
}

const SCORECARD_TEMPLATE = 'TEST_SCORECARD';

export async function dispatchTestScorecard(input: ScorecardDispatchInput): Promise<ScorecardDispatchResult> {
  const result: ScorecardDispatchResult = { success: false, total: 0, sent: 0, failed: 0, recipients: [], errors: [] };

  try {
    if (!isEmailConfigured()) {
      result.success = true;
      return result;
    }

    const student = await prisma.user.findUnique({
      where: { id: input.studentId },
      select: { name: true, email: true },
    });

    const links = await prisma.parentStudentLink.findMany({
      where: { studentId: input.studentId, status: 'APPROVED' },
      include: { parent: { select: { name: true, email: true } } },
    });

    const recipients = new Map<string, string>();
    if (student?.email) recipients.set(student.email, student.name || 'Student');
    for (const link of links) {
      if (link.parent.email) recipients.set(link.parent.email, link.parent.name || 'Parent');
    }

    if (recipients.size === 0) {
      result.success = true;
      return result;
    }

    const template = testScorecardTemplate({
      studentName: student?.name || 'Student',
      testTitle: input.testTitle,
      score: input.score,
      totalMarks: input.totalMarks,
      facultyRemarks: input.remarks ?? null,
    });

    const subject = `Your scorecard for ${input.testTitle} – Kaushiki Classes`;
    const recipientList = [...recipients.entries()];
    result.recipients = recipientList.map(([email]) => email);
    result.total = result.recipients.length;

    const outcomes = await Promise.allSettled(
      recipientList.map(([email]) =>
        sendEmailWithFallback({
          to: email,
          subject,
          html: template.html,
          text: template.text,
        })
      )
    );

    outcomes.forEach((outcome, index) => {
      const email = result.recipients[index];
      if (outcome.status === 'fulfilled' && outcome.value.success) {
        result.sent += 1;
        void logEmailDelivery({
          recipient: email,
          subject,
          template: SCORECARD_TEMPLATE,
          html: template.html,
          text: template.text,
          status: 'SENT',
          providerResponse: outcome.value.data,
          sentAt: new Date(),
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

      result.errors.push(`${email}: ${errorMessage}`);
      void logEmailDelivery({
        recipient: email,
        subject,
        template: SCORECARD_TEMPLATE,
        html: template.html,
        text: template.text,
        status: 'FAILED',
        errorMessage,
      });
    });

    result.success = result.failed === 0;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    console.error('[Scorecard Email] Failed to dispatch scorecard:', message);
    return result;
  }
}
