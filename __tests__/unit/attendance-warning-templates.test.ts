import { attendanceWarningTemplate } from '@/lib/email/attendance-warning-templates';

describe('attendanceWarningTemplate', () => {
  const base = {
    studentName: 'Arjun Patil',
    attendancePercentage: 60,
    threshold: 75,
    presentSessions: 6,
    totalSessions: 10,
    monthLabel: 'August 2026',
  };

  it('renders student name, month and attendance percentage', () => {
    const { html } = attendanceWarningTemplate(base);
    expect(html).toContain('Arjun Patil');
    expect(html).toContain('August 2026');
    expect(html).toContain('60%');
    expect(html).toContain('6 / 10');
  });

  it('warns about the 75% threshold', () => {
    const { html, text } = attendanceWarningTemplate(base);
    expect(html).toContain('75%');
    expect(html).toContain('dropped below the required');
    expect(text).toContain('75%');
  });

  it('includes coaching portal details and contact info', () => {
    const { html, text } = attendanceWarningTemplate(base);
    expect(html).toContain('Visit Coaching Portal');
    expect(html).toContain('Kaushiki Classes');
    expect(html).toContain('+91 9175498572');
    expect(text).toContain('Kaushiki Classes');
  });

  it('uses a parent-specific greeting', () => {
    const { html, text } = attendanceWarningTemplate({ ...base, recipientRole: 'PARENT' });
    expect(html).toContain('Your ward');
    expect(text).toContain('Your ward Arjun Patil');
  });

  it('escapes HTML in user-provided fields', () => {
    const { html } = attendanceWarningTemplate({
      ...base,
      studentName: '<script>alert(1)</script>',
      monthLabel: '<b>August</b>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>August</b>');
    expect(html).toContain('&lt;b&gt;August&lt;/b&gt;');
  });

  it('formats non-integer percentages to two decimals', () => {
    const { html } = attendanceWarningTemplate({ ...base, attendancePercentage: 23.3333 });
    expect(html).toContain('23.33%');
  });

  it('produces a plain-text version with the same values', () => {
    const { text } = attendanceWarningTemplate(base);
    expect(text).toContain('Arjun Patil');
    expect(text).toContain('August 2026');
    expect(text).toContain('Monthly Attendance: 60%');
    expect(text).toContain('6 / 10');
    expect(text).toContain('75%');
  });
});