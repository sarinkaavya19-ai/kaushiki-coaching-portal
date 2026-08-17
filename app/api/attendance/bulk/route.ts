import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withRole, type AuthenticatedRequest } from '@/lib/auth/middleware';
import { bulkAttendanceSchema } from '@/lib/validators/attendance';
import { processLowAttendanceWarnings } from '@/lib/attendance/low-attendance';

export const POST = withRole(['FACULTY', 'ADMIN'], async (req) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
      { status: 400 }
    );
  }

  const parsed = bulkAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { batchId, sessionDate, records } = parsed.data;

  try {
    if (user.role === 'FACULTY') {
      const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { facultyId: true } });
      if (!batch || batch.facultyId !== user.id) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Not your batch' } },
          { status: 403 }
        );
      }
    }

    const date = new Date(sessionDate);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findMany({
        where: { batchId, sessionDate: date, studentId: { in: records.map((r) => r.studentId) } },
        select: { id: true, studentId: true },
      });
      const existingByStudent = new Map(existing.map((e) => [e.studentId, e.id]));

      const toCreate = records.filter((r) => !existingByStudent.has(r.studentId));
      const toUpdate = records.filter((r) => existingByStudent.has(r.studentId));

      let created = 0;
      let updated = 0;

      if (toCreate.length > 0) {
        await tx.attendance.createMany({
          data: toCreate.map((r) => ({
            batchId,
            studentId: r.studentId,
            sessionDate: date,
            present: r.present,
            markedById: user.id,
          })),
        });
        created += toCreate.length;
      }

      for (const record of toUpdate) {
        await tx.attendance.update({
          where: { id: existingByStudent.get(record.studentId)! },
          data: { present: record.present, markedById: user.id },
        });
        updated += 1;
      }

      return { created, updated };
    });

    processLowAttendanceWarnings({ date }).catch((err) => {
      console.error('[Bulk Attendance] Low attendance check failed:', err);
    });

    return NextResponse.json({ ...result, lowAttendanceCheckTriggered: true }, { status: 201 });
  } catch (err) {
    console.error('[Bulk Attendance] Error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to mark attendance' } },
      { status: 500 }
    );
  }
});
