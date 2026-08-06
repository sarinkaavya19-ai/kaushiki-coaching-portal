/**
 * @jest-environment node
 */
let mockAuthRole = 'FACULTY';
let mockAuthId = 'fac-id';

jest.mock('@/lib/auth/middleware', () => {
  const { NextResponse } = require('next/server');
  const authenticateRequest = jest.fn().mockImplementation(() => ({
    user: { id: mockAuthId, role: mockAuthRole, sessionId: 'sess-1' },
  }));
  return {
    authenticateRequest,
    getTokenFromRequest: jest.fn().mockReturnValue('mock-token'),
    withRole: jest.fn().mockImplementation((roles: string | string[], handler: (...args: any[]) => any) => {
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      if (handler.length > 1) {
        return async (req: any, ctx: any) => {
          const result = await authenticateRequest(req);
          if (result instanceof NextResponse) return result;
          req.user = result.user;
          if (allowedRoles.length > 0 && !allowedRoles.includes(result.user.role)) {
            return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, { status: 403 });
          }
          return handler(req, ctx);
        };
      }
      return async (req: any) => {
        const result = await authenticateRequest(req);
        if (result instanceof NextResponse) return result;
        req.user = result.user;
        if (allowedRoles.length > 0 && !allowedRoles.includes(result.user.role)) {
          return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, { status: 403 });
        }
        return handler(req);
      };
    }),
  };
});

const mockDispatchScorecard = jest.fn();

jest.mock('@/lib/email/scorecard', () => ({
  dispatchTestScorecard: (...args: any[]) => mockDispatchScorecard(...args),
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrisma = {
    test: {
      findUnique: jest.fn(),
    },
    batch: {
      findUnique: jest.fn(),
    },
    testAttempt: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    testAnswer: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    testScore: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

const { prisma } = require('@/lib/db/prisma');

describe('PATCH /api/tests/[id]/attempts/[attemptId]/grade — scorecard email dispatch', () => {
  const testWithQuestions = {
    id: 'test-1',
    title: 'Chapter 1 MCQ',
    totalMarks: 10,
    batchId: 'batch-1',
    facultyId: 'fac-id',
    questions: [
      { id: 'q-1', marks: 5 },
      { id: 'q-2', marks: 5 },
    ],
  };

  const attempt = { id: 'attempt-1', studentId: 'student-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthRole = 'FACULTY';
    mockAuthId = 'fac-id';
    prisma.test.findUnique.mockResolvedValue(testWithQuestions);
    prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', facultyId: 'fac-id' });
    prisma.testAttempt.findUnique.mockResolvedValue(attempt);
    prisma.testAnswer.upsert.mockResolvedValue({});
    prisma.testScore.findFirst.mockResolvedValue(null);
    prisma.testScore.create.mockResolvedValue({});
    mockDispatchScorecard.mockResolvedValue({ success: true, sent: 2, failed: 0, recipients: [], errors: [] });
  });

  it('dispatches a scorecard email when the attempt is fully graded', async () => {
    prisma.testAnswer.findMany.mockResolvedValue([
      { questionId: 'q-1', isGraded: true, marksObtained: 4 },
      { questionId: 'q-2', isGraded: true, marksObtained: 3 },
    ]);
    prisma.testAttempt.update.mockResolvedValue({
      ...attempt,
      feedback: 'Well done',
      score: 7,
    });

    const { PATCH } = await import('@/app/api/tests/[id]/attempts/[attemptId]/grade/route');
    const req = new Request('http://localhost/api/tests/test-1/attempts/attempt-1/grade', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grades: [
          { questionId: 'q-1', marksObtained: 4 },
          { questionId: 'q-2', marksObtained: 3 },
        ],
        globalFeedback: 'Well done',
      }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'test-1', attemptId: 'attempt-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.score).toBe(7);
    expect(mockDispatchScorecard).toHaveBeenCalledTimes(1);
    expect(mockDispatchScorecard).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        testTitle: 'Chapter 1 MCQ',
        totalMarks: 10,
        score: 7,
        remarks: 'Well done',
      })
    );
  });

  it('does not dispatch a scorecard while the attempt is still partially graded', async () => {
    prisma.testAnswer.findMany.mockResolvedValue([
      { questionId: 'q-1', isGraded: true, marksObtained: 4 },
      { questionId: 'q-2', isGraded: false, marksObtained: null },
    ]);
    prisma.testAttempt.update.mockResolvedValue({ ...attempt, feedback: null, score: null });

    const { PATCH } = await import('@/app/api/tests/[id]/attempts/[attemptId]/grade/route');
    const req = new Request('http://localhost/api/tests/test-1/attempts/attempt-1/grade', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grades: [{ questionId: 'q-1', marksObtained: 4 }],
      }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'test-1', attemptId: 'attempt-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.score).toBeNull();
    expect(mockDispatchScorecard).not.toHaveBeenCalled();
  });

  it('still grades the attempt when email dispatch fails (non-blocking)', async () => {
    prisma.testAnswer.findMany.mockResolvedValue([
      { questionId: 'q-1', isGraded: true, marksObtained: 4 },
      { questionId: 'q-2', isGraded: true, marksObtained: 3 },
    ]);
    prisma.testAttempt.update.mockResolvedValue({
      ...attempt,
      feedback: 'Well done',
      score: 7,
    });
    mockDispatchScorecard.mockRejectedValue(new Error('email provider down'));

    const { PATCH } = await import('@/app/api/tests/[id]/attempts/[attemptId]/grade/route');
    const req = new Request('http://localhost/api/tests/test-1/attempts/attempt-1/grade', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grades: [
          { questionId: 'q-1', marksObtained: 4 },
          { questionId: 'q-2', marksObtained: 3 },
        ],
        globalFeedback: 'Well done',
      }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'test-1', attemptId: 'attempt-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.score).toBe(7);
    expect(mockDispatchScorecard).toHaveBeenCalledTimes(1);
  });
});
