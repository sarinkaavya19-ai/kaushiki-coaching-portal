import { prisma } from '@/lib/db/prisma';

export async function logEmailDelivery(args: {
  recipient: string;
  subject: string;
  template: string;
  html?: string | null;
  text?: string | null;
  status: 'SENT' | 'FAILED';
  errorMessage?: string;
  providerResponse?: unknown;
  sentAt?: Date;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        recipient: args.recipient,
        subject: args.subject,
        template: args.template,
        html: args.html || null,
        text: args.text || null,
        status: args.status,
        errorMessage: args.errorMessage || null,
        providerResponse: args.providerResponse ? (args.providerResponse as object) : undefined,
        sentAt: args.sentAt,
      },
    });
  } catch (err) {
    console.error('[EmailLog] Failed to write email log:', err);
  }
}
