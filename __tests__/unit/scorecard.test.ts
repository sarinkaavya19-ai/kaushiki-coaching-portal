const mockSendEmailWithFallback = jest.fn();
const mockIsEmailConfigured = jest.fn().mockReturnValue(true);
const mockUserFindUnique = jest.fn();
const mockParentLinkFindMany = jest.fn();
const mockEmailLogCreate = jest.fn();

jest.mock('@/lib/email', () => ({
  sendEmailWithFallback: (...args: any[]) => mockSendEmailWithFallback(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
    parentStudentLink: { findMany: (...args: any[]) => mockParentLinkFindMany(...args) },
    emailLog: { create: (...args: any[]) => mockEmailLogCreate(...args) },
  },
}));

import { dispatchTestScorecard } from '@/lib/email/scorecard';

describe('dispatchTestScorecard', () => {
  const baseInput = {
    attemptId: 'attempt-1',
    studentId: 'student-1',
    testTitle: 'Chapter 1 – MCQ',
    totalMarks: 10,
    score: 7,
    remarks: 'Good attempt',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEmailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ name: 'Arjun Patil', email: 'arjun@example.com' });
    mockParentLinkFindMany.mockResolvedValue([]);
    mockSendEmailWithFallback.mockResolvedValue({ success: true, data: { id: 'msg-1', provider: 'resend' } });
    mockEmailLogCreate.mockResolvedValue({ id: 'log-1' });
  });

  it('sends to the student and all linked parents', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
      { parent: { name: 'Anita Patil', email: 'anita@example.com' } },
    ]);

    const result = await dispatchTestScorecard(baseInput);

    expect(mockSendEmailWithFallback).toHaveBeenCalledTimes(3);
    const recipients = mockSendEmailWithFallback.mock.calls.map(([options]) => options.to);
    expect(recipients).toEqual(expect.arrayContaining(['arjun@example.com', 'suresh@example.com', 'anita@example.com']));
    expect(mockSendEmailWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `Your scorecard for ${baseInput.testTitle} – Kaushiki Classes`,
        html: expect.stringContaining('Arjun Patil'),
        text: expect.stringContaining('70%'),
      })
    );
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('only queries approved parent links for the student', async () => {
    mockParentLinkFindMany.mockResolvedValue([]);

    await dispatchTestScorecard(baseInput);

    expect(mockParentLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'student-1', status: 'APPROVED' },
      })
    );
  });

  it('skips parents without an email address', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
      { parent: { name: 'Anita Patil', email: null } },
    ]);

    const result = await dispatchTestScorecard(baseInput);

    expect(mockSendEmailWithFallback).toHaveBeenCalledTimes(2);
    expect(result.recipients).toEqual(['arjun@example.com', 'suresh@example.com']);
  });

  it('does not send anything when there are no email addresses', async () => {
    mockUserFindUnique.mockResolvedValue({ name: 'Arjun Patil', email: null });
    mockParentLinkFindMany.mockResolvedValue([]);

    const result = await dispatchTestScorecard(baseInput);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.success).toBe(true);
  });

  it('writes an email log for every recipient', async () => {
    mockParentLinkFindMany.mockResolvedValue([
      { parent: { name: 'Suresh Patil', email: 'suresh@example.com' } },
    ]);

    await dispatchTestScorecard(baseInput);

    expect(mockEmailLogCreate).toHaveBeenCalledTimes(2);
    expect(mockEmailLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipient: 'arjun@example.com',
          template: 'TEST_SCORECARD',
          status: 'SENT',
        }),
      })
    );
  });

  it('counts failed deliveries without throwing', async () => {
    mockSendEmailWithFallback.mockResolvedValue({ success: false, error: new Error('resend down') });

    const result = await dispatchTestScorecard(baseInput);

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('resend down');
  });

  it('never rejects even when the email provider rejects', async () => {
    mockSendEmailWithFallback.mockRejectedValue(new Error('network error'));

    const result = await dispatchTestScorecard(baseInput);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('network error');
  });

  it('never rejects when the database lookups fail', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('db down'));

    await expect(dispatchTestScorecard(baseInput)).resolves.toMatchObject({
      success: false,
      errors: ['db down'],
    });
  });

  it('skips dispatch when email is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);

    const result = await dispatchTestScorecard(baseInput);

    expect(mockSendEmailWithFallback).not.toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
