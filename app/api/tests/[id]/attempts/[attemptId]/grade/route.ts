import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withRole, type AuthenticatedRequest } from '@/lib/auth/middleware';
import { manualGradeSchema } from '@/lib/validators/tests';
import { dispatchTestScorecard } from '@/lib/email/scorecard';

export const PATCH = withRole(['FACULTY', 'ADMIN'], async (req, { params }) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 });
  const { id: testId, attemptId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
      { status: 400 }
    );
  }

  const parsed = manualGradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } },
      { status: 400 }
    );
  }

  try {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { questions: true },
    });

    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!test || !attempt) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Test or Attempt not found' } },
        { status: 404 }
      );
    }

    const { grades, globalFeedback } = parsed.data;

    if (user.role === 'FACULTY') {
      const batch = await prisma.batch.findUnique({ where: { id: test.batchId }, select: { facultyId: true } });
      if (test.facultyId !== user.id && batch?.facultyId !== user.id) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have grading permissions for this batch' } },
          { status: 403 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const entry of grades) {
        const question = test.questions.find(q => q.id === entry.questionId);
        if (!question) continue;

        if (entry.marksObtained > question.marks) {
          throw new Error(`Marks obtained (${entry.marksObtained}) cannot exceed question maximum marks (${question.marks})`);
        }

        await tx.testAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId: entry.questionId } },
          update: {
            marksObtained: entry.marksObtained,
            feedback: entry.feedback || null,
            isGraded: true,
            gradedAt: new Date(),
          },
          create: {
            attemptId,
            questionId: entry.questionId,
            marksObtained: entry.marksObtained,
            feedback: entry.feedback || null,
            isGraded: true,
            gradedAt: new Date(),
          },
        });
      }

      const dbAnswers = await tx.testAnswer.findMany({
        where: { attemptId },
      });

      let totalScore = 0;
      let allGraded = true;

      for (const q of test.questions) {
        const ans = dbAnswers.find(a => a.questionId === q.id);
        if (!ans || !ans.isGraded) {
          allGraded = false;
        } else {
          totalScore += ans.marksObtained || 0;
        }
      }

      const updatedAttempt = await tx.testAttempt.update({
        where: { id: attemptId },
        data: {
          score: allGraded ? totalScore : null,
          feedback: globalFeedback ?? (allGraded ? 'All items graded by faculty' : null),
        },
      });

      if (allGraded) {
        const existingScore = await tx.testScore.findFirst({
          where: { batchId: test.batchId, studentId: attempt.studentId, testName: test.title },
        });
        if (existingScore) {
          await tx.testScore.update({
            where: { id: existingScore.id },
            data: { score: totalScore, maxScore: test.totalMarks },
          });
        } else {
          await tx.testScore.create({
            data: {
              batchId: test.batchId,
              studentId: attempt.studentId,
              testName: test.title,
              score: totalScore,
              maxScore: test.totalMarks,
              testDate: new Date(),
              remark: 'Graded by faculty',
            },
          });
        }
      }

      return { updatedAttempt, totalScore, allGraded };
    });

    const { updatedAttempt, totalScore, allGraded } = result;

    if (allGraded) {
      void dispatchTestScorecard({
        studentId: attempt.studentId,
        testTitle: test.title,
        totalMarks: test.totalMarks,
        score: totalScore,
        remarks: updatedAttempt.feedback,
      }).catch((err) => console.error('[Scorecard Email] Dispatch failed:', err));
    }

    return NextResponse.json(updatedAttempt);
  } catch (err: any) {
    console.error('[Manual Grade Attempt] Error:', err);
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: err.message || 'Failed to grade attempt' } },
      { status: 400 }
    );
  }
});
