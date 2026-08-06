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

const mockDispatchWarnings = jest.fn();

jest.mock('@/lib/attendance/warnings', () => ({
  dispatchAttendanceWarnings: (...args: any[]) => mockDispatchWarnings(...args),
}));

jest.mock('@/lib/db/prisma', () => {
  const mockPrisma = {
    batch: {
      findUnique: jest.fn(),
    },
    attendance: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

const { prisma } = require('@/lib/db/prisma');

describe('POST /api/attendance/bulk — bulk attendance entry', () => {
  const body = {
    batchId: 'batch-1',
    sessionDate: '2026-07-15',
    records: [
      { studentId: 'student-1', present: true },
      { studentId: 'student-2', present: false },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthRole = 'FACULTY';
    mockAuthId = 'fac-id';
    prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', facultyId: 'fac-id' });
    prisma.attendance.findUnique.mockResolvedValue(null);
    prisma.attendance.create.mockResolvedValue({});
    prisma.attendance.update.mockResolvedValue({});
    mockDispatchWarnings.mockResolvedValue({ success: true, checked: 2, warned: 1, sent: 2, failed: 0, recipients: [], errors: [] });
  });

  it('saves bulk attendance records and dispatches low-attendance warnings', async () => {
    const { POST } = await import('@/app/api/attendance/bulk/route');
    const req = new Request('http://localhost/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ created: 2, updated: 0 });
    expect(prisma.attendance.create).toHaveBeenCalledTimes(2);
    expect(mockDispatchWarnings).toHaveBeenCalledTimes(1);
    expect(mockDispatchWarnings).toHaveBeenCalledWith({
      batchId: 'batch-1',
      month: '2026-07',
    });
  });

  it('updates existing records instead of duplicating', async () => {
    prisma.attendance.findUnique.mockResolvedValue({ id: 'att-1' });

    const { POST } = await import('@/app/api/attendance/bulk/route');
    const req = new Request('http://localhost/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ created: 0, updated: 2 });
    expect(prisma.attendance.update).toHaveBeenCalledTimes(2);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('still saves attendance when warning dispatch fails (non-blocking)', async () => {
    mockDispatchWarnings.mockRejectedValue(new Error('email provider down'));

    const { POST } = await import('@/app/api/attendance/bulk/route');
    const req = new Request('http://localhost/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ created: 2, updated: 0 });
    expect(mockDispatchWarnings).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when a faculty member marks another batch', async () => {
    prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', facultyId: 'other-fac' });

    const { POST } = await import('@/app/api/attendance/bulk/route');
    const req = new Request('http://localhost/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(mockDispatchWarnings).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payloads', async () => {
    const { POST } = await import('@/app/api/attendance/bulk/route');
    const req = new Request('http://localhost/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'batch-1', sessionDate: '2026-07-15', records: [] }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
