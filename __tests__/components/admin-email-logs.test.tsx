import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard/admin/email-logs',
}));

jest.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/hooks/useRealtimeQuery', () => ({
  useRealtimeQuery: jest.fn(),
}));

import { useRealtimeQuery } from '@/lib/hooks/useRealtimeQuery';
import EmailLogsPage from '@/app/dashboard/admin/email-logs/page';

const mockLogs = [
  {
    id: 'log-1',
    recipient: 'rohan@test.com',
    subject: 'Low Attendance Warning',
    template: 'ATTENDANCE_WARNING',
    status: 'FAILED',
    retryCount: 2,
    errorMessage: 'smtp timeout',
    sentAt: null,
    createdAt: '2026-07-01T10:00:00Z',
  },
  {
    id: 'log-2',
    recipient: 'sneha@test.com',
    subject: 'Chapter 1 Scorecard',
    template: 'TEST_SCORECARD',
    status: 'SENT',
    retryCount: 0,
    errorMessage: null,
    sentAt: '2026-07-02T11:00:00Z',
    createdAt: '2026-07-02T11:00:00Z',
  },
];

const baseData = {
  data: mockLogs,
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary: { SENT: 1, PENDING: 0, FAILED: 1 },
};

let queryState: any;

beforeEach(() => {
  jest.clearAllMocks();
  queryState = { data: baseData, refetch: jest.fn() };
  (useRealtimeQuery as unknown as jest.Mock).mockReturnValue(queryState);
});

describe('EmailLogsPage (admin email audit log)', () => {
  it('renders summary cards and the log table', async () => {
    render(<EmailLogsPage />);

    expect(screen.getByRole('heading', { name: /email logs/i })).toBeInTheDocument();
    expect(screen.getAllByText('SENT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAILED').length).toBeGreaterThan(0);
    expect(screen.getByText('rohan@test.com')).toBeInTheDocument();
    expect(screen.getByText('sneha@test.com')).toBeInTheDocument();
    expect(screen.getAllByText('Attendance Warning').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Test Scorecard').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no logs', () => {
    (useRealtimeQuery as unknown as jest.Mock).mockReturnValue({
      data: { ...baseData, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      refetch: jest.fn(),
    });

    render(<EmailLogsPage />);

    expect(screen.getByText('No email logs found.')).toBeInTheDocument();
  });

  it('renders a Retry action for failed emails only', () => {
    render(<EmailLogsPage />);

    const retryButtons = screen.getAllByRole('button', { name: /retry/i });
    expect(retryButtons).toHaveLength(1);
  });

  it('refetches after a successful retry and shows a success notice', async () => {
    const refetch = jest.fn();
    (useRealtimeQuery as unknown as jest.Mock).mockReturnValue({ data: baseData, refetch });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Email retried successfully' }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<EmailLogsPage />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Email retried successfully.')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/email-logs/log-1/retry', {
      method: 'POST',
      headers: expect.any(Object),
    });
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an error notice when the retry fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Cannot retry this email' } }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<EmailLogsPage />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Cannot retry this email')).toBeInTheDocument();
    });
  });

  it('updates filters from the search box and status dropdown', async () => {
    const user = userEvent.setup();
    render(<EmailLogsPage />);

    const searchInput = screen.getByPlaceholderText('Search recipient or subject…');
    await user.type(searchInput, 'rohan{Enter}');

    const statusSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(statusSelect, 'FAILED');

    await waitFor(() => {
      expect(useRealtimeQuery).toHaveBeenLastCalledWith(
        ['admin-email-logs', 1, 'FAILED', '', 'rohan', '', ''],
        expect.any(Function),
        expect.objectContaining({ pollInterval: 20000 })
      );
    });
  });
});
