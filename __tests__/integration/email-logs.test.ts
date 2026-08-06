/**
 * @jest-environment node
 */
let mockAuthRole = 'ADMIN';
let mockAuthId = 'admin-id';

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

const mockSendEmailWithFallback = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockGroupBy = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/email', () => ({
  sendEmailWithFallback: (...args: any[]) => mockSendEmailWithFallback(...args),
}));

jest.mock('@/lib/generated/prisma/client', () => ({
  Prisma: { DbNull: 'PRISMA_DB_NULL', JsonNull: 'PRISMA_JSON_NULL' },
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailLog: {
      findMany: (...args: any[]) => mockFindMany(...args),
      count: (...args: any[]) => mockCount(...args),
      groupBy: (...args: any[]) => mockGroupBy(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

const failedLog = {
  id: 'log-1',
  recipient: 'rohan@test.com',
  subject: 'Attendance Warning',
  template: 'ATTENDANCE_WARNING',
  status: 'FAILED',
  retryCount: 2,
  errorMessage: 'smtp timeout',
  html: '<p>Low attendance</p>',
  text: 'Low attendance',
  sentAt: null,
  createdAt: '2026-07-01T10:00:00.000Z',
};

describe('GET /api/email-logs — admin email audit log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthRole = 'ADMIN';
    mockFindMany.mockResolvedValue([failedLog]);
    mockCount.mockResolvedValue(1);
    mockGroupBy.mockResolvedValue([
      { status: 'SENT', _count: { status: 5 } },
      { status: 'FAILED', _count: { status: 1 } },
    ]);
  });

  it('returns paginated logs with a summary grouped by status', async () => {
    const { GET } = await import('@/app/api/email-logs/route');
    const res = await GET(new Request('http://localhost/api/email-logs?page=1&limit=20') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([failedLog]);
    expect(json.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(json.summary).toEqual({ SENT: 5, FAILED: 1 });
  });

  it('passes status, template and search filters into the query', async () => {
    const { GET } = await import('@/app/api/email-logs/route');
    await GET(new Request('http://localhost/api/email-logs?status=FAILED&template=ATTENDANCE_WARNING&search=rohan') as any);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'FAILED',
          template: 'ATTENDANCE_WARNING',
          OR: [
            { recipient: { contains: 'rohan', mode: 'insensitive' } },
            { subject: { contains: 'rohan', mode: 'insensitive' } },
          ],
        },
      })
    );
    expect(mockCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
  });

  it('applies date range filters when provided', async () => {
    const { GET } = await import('@/app/api/email-logs/route');
    await GET(new Request('http://localhost/api/email-logs?dateFrom=2026-07-01&dateTo=2026-07-31') as any);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-07-01'));
    expect(where.createdAt.lte).toEqual(new Date('2026-07-31'));
  });

  it('returns 403 for non-admin roles', async () => {
    mockAuthRole = 'FACULTY';

    const { GET } = await import('@/app/api/email-logs/route');
    const res = await GET(new Request('http://localhost/api/email-logs') as any);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns 500 when the database query fails', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));

    const { GET } = await import('@/app/api/email-logs/route');
    const res = await GET(new Request('http://localhost/api/email-logs') as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/email-logs/[id]/retry — admin email retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthRole = 'ADMIN';
    mockFindUnique.mockResolvedValue(failedLog);
    mockSendEmailWithFallback.mockResolvedValue({ success: true, data: { id: 'msg-new' } });
    mockUpdate.mockResolvedValue({});
  });

  const postRetry = async () => {
    const { POST } = await import('@/app/api/email-logs/[id]/retry/route');
    return POST(
      new Request('http://localhost/api/email-logs/log-1/retry', { method: 'POST' }) as any,
      { params: Promise.resolve({ id: 'log-1' }) }
    );
  };

  it('re-sends a failed email and marks it sent', async () => {
    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockSendEmailWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rohan@test.com',
        subject: 'Attendance Warning',
        html: '<p>Low attendance</p>',
        text: 'Low attendance',
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({ status: 'SENT', retryCount: { increment: 1 } }),
      })
    );
  });

  it('returns 404 when the log does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
  });

  it('returns 400 when the email is not in FAILED status', async () => {
    mockFindUnique.mockResolvedValue({ ...failedLog, status: 'SENT' });

    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('INVALID_STATUS');
    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
  });

  it('returns 400 when no stored payload exists to resend', async () => {
    mockFindUnique.mockResolvedValue({ ...failedLog, html: null, text: null });

    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('NO_PAYLOAD');
    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
  });

  it('keeps the log failed with an incremented retry count when the resend fails', async () => {
    mockSendEmailWithFallback.mockResolvedValue({ success: false, error: new Error('still down') });

    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe('RETRY_FAILED');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'still down',
          retryCount: { increment: 1 },
        }),
      })
    );
  });

  it('returns 403 for non-admin roles', async () => {
    mockAuthRole = 'FACULTY';

    const res = await postRetry();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
  });
});
