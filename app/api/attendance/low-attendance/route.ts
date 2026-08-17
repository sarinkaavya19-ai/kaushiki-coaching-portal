import { NextResponse } from 'next/server';
import { withRole } from '@/lib/auth/middleware';
import { lowAttendanceQuerySchema } from '@/lib/validators/attendance';
import {
  findLowAttendanceStudents,
  processLowAttendanceWarnings,
  parseMonthKey,
} from '@/lib/attendance/low-attendance';

function parseQuery(req: Request) {
  const url = new URL(req.url);
  return lowAttendanceQuerySchema.safeParse({
    month: url.searchParams.get('month') || undefined,
    threshold: url.searchParams.get('threshold') || undefined,
  });
}

export const GET = withRole('ADMIN', async (req) => {
  const parsed = parseQuery(req);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
      { status: 400 }
    );
  }

  const { month, threshold } = parsed.data;
  const date = month ? parseMonthKey(month) : new Date();

  try {
    const check = await findLowAttendanceStudents(date, threshold);
    return NextResponse.json({ data: check });
  } catch (err) {
    console.error('[Low Attendance] Error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to compute low attendance' } },
      { status: 500 }
    );
  }
});

export const POST = withRole('ADMIN', async (req) => {
  const parsed = parseQuery(req);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
      { status: 400 }
    );
  }

  const { month, threshold } = parsed.data;
  const date = month ? parseMonthKey(month) : new Date();

  try {
    const result = await processLowAttendanceWarnings({ date, threshold });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[Low Attendance] Warning dispatch error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to dispatch attendance warnings' } },
      { status: 500 }
    );
  }
});