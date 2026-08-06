import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/lib/generated/prisma/client';
import { withRole } from '@/lib/auth/middleware';
import { sendEmailWithFallback } from '@/lib/email';

export const POST = withRole('ADMIN', async (req, { params }) => {
  const { id } = await params;

  try {
    const log = await prisma.emailLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Email log not found' } },
        { status: 404 }
      );
    }

    if (log.status !== 'FAILED') {
      return NextResponse.json(
        { error: { code: 'INVALID_STATUS', message: `Cannot retry email with status ${log.status}` } },
        { status: 400 }
      );
    }

    if (!log.html && !log.text) {
      return NextResponse.json(
        { error: { code: 'NO_PAYLOAD', message: 'No stored email payload available for retry' } },
        { status: 400 }
      );
    }

    const outcome = await sendEmailWithFallback({
      to: log.recipient,
      subject: log.subject || 'Kaushiki Classes',
      html: log.html || '',
      text: log.text || undefined,
    });

    if (outcome.success) {
      await prisma.emailLog.update({
        where: { id },
        data: {
          status: 'SENT',
          errorMessage: null,
          providerResponse: outcome.data ? (outcome.data as object) : Prisma.DbNull,
          sentAt: new Date(),
          retryCount: { increment: 1 },
        },
      });
      return NextResponse.json({ success: true, message: 'Email retried successfully' });
    }

    await prisma.emailLog.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: outcome.error?.message || 'Retry failed',
        providerResponse: Prisma.DbNull,
        sentAt: null,
        retryCount: { increment: 1 },
      },
    });

    return NextResponse.json(
      { error: { code: 'RETRY_FAILED', message: outcome.error?.message || 'Retry failed' } },
      { status: 502 }
    );
  } catch (err) {
    console.error('[Retry Email Log] Error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retry email' } },
      { status: 500 }
    );
  }
});
