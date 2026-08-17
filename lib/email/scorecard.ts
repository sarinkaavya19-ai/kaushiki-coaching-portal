import { prisma } from '@/lib/db/prisma';
import { sendEmailWithFallback, isEmailConfigured } from '@/lib/email';
import { testScorecardTemplate } from '@/lib/email/scorecard-templates';
import type { ScorecardDispatchResult, ScorecardRecipient, TestResultPayload } from '@/types/scorecard';

export interface ScorecardDispatchInput extends TestResultPayload {}

const SCORECARD_TEMPLATE = 'TEST_SCORECARD';

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function logEmailDelivery(args: {
  recipient: string;
  subject: string;
  status: 'SENT' | 'FAILED';
  errorMessage?: string;
  providerResponse?: unknown;
  sentAt?: Date;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        recipientEmail: args.recipient,
        subject: args.subject,
        template: SCORECARD_TEMPLATE,
        status: args.status,
        errorMessage: args.errorMessage || null,
        providerResponse: args.providerResponse ? (args.providerResponse as object) : undefined,
        sentAt: args.sentAt,
      },
    });
  } catch (err) {
    console.error('[Scorecard Email] Failed to write email log:', err);
  }
}

export async function dispatchTestScorecard(input: ScorecardDispatchInput): Promise<ScorecardDispatchResult> {
  const result: ScorecardDispatchResult = { success: false, total: 0, sent: 0, failed: 0, recipients: [], errors: [] };

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

    const recipients = new Map<string, ScorecardRecipient>();
    if (student?.email) {
      recipients.set(student.email, { name: student.name || 'Student', email: student.email, relation: 'STUDENT' });
    }
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

    const subject = `Your scorecard for ${input.testTitle} – Kaushiki Classes`;
    const recipientList = [...recipients.values()];
    result.recipients = recipientList.map((r) => r.email);
    result.total = result.recipients.length;

    const templateByRelation = new Map<string, { html: string; text: string }>();
    const getTemplate = (relation: ScorecardRecipient['relation']) => {
      const key = relation;
      if (!templateByRelation.has(key)) {
        templateByRelation.set(key, testScorecardTemplate({
          studentName: student?.name || 'Student',
          testTitle: input.testTitle,
          score: input.score,
          totalMarks: input.totalMarks,
          facultyRemarks: input.remarks ?? null,
          dateLabel: input.gradedAt ? formatDateLabel(input.gradedAt) : null,
          recipientRole: relation,
        }));
      }
      return templateByRelation.get(key)!;
    };

    const outcomes = await Promise.allSettled(
      recipientList.map((recipient) => {
        const template = getTemplate(recipient.relation);
        return sendEmailWithFallback({
          to: recipient.email,
          subject,
          html: template.html,
          text: template.text,
        });
      })
    );

    outcomes.forEach((outcome, index) => {
      const recipient = recipientList[index];

      if (outcome.status === 'fulfilled' && outcome.value.success) {
        result.sent += 1;
        void logEmailDelivery({
          recipient: recipient.email,
          subject,
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

      result.errors.push(`${recipient.email}: ${errorMessage}`);
      void logEmailDelivery({
        recipient: recipient.email,
        subject,
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
