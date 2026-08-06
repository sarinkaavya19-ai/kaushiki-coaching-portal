import { lowAttendanceWarningTemplate } from '@/lib/email/attendance-templates';

describe('lowAttendanceWarningTemplate', () => {
  const base = {
    studentName: 'Rohan Kadam',
    batchName: 'Mathematics',
    monthLabel: 'July 2026',
    attended: 6,
    held: 10,
    threshold: 75,
  };

  it('renders student name, batch name and month', () => {
    const { html } = lowAttendanceWarningTemplate(base);
    expect(html).toContain('Rohan Kadam');
    expect(html).toContain('Mathematics');
    expect(html).toContain('July 2026');
  });

  it('renders attended, held and calculated percentage', () => {
    const { html } = lowAttendanceWarningTemplate(base);
    expect(html).toContain('>6</span>');
    expect(html).toContain('>10</span>');
    expect(html).toContain('60%');
  });

  it('renders the warning threshold', () => {
    const { html, text } = lowAttendanceWarningTemplate(base);
    expect(html).toContain('75%');
    expect(text).toContain('75%');
  });

  it('uses a 75% default threshold when not provided', () => {
    const { html } = lowAttendanceWarningTemplate({ ...base, threshold: undefined });
    expect(html).toContain('75%');
  });

  it('escapes HTML in user-provided fields', () => {
    const { html } = lowAttendanceWarningTemplate({
      ...base,
      studentName: '<script>alert(1)</script>',
      batchName: '<b>Math</b>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>Math</b>');
  });

  it('produces a plain-text version with the same values', () => {
    const { text } = lowAttendanceWarningTemplate(base);
    expect(text).toContain('Rohan Kadam');
    expect(text).toContain('Mathematics');
    expect(text).toContain('Classes Attended: 6');
    expect(text).toContain('Classes Held: 10');
    expect(text).toContain('60%');
  });

  it('handles held of zero without dividing by zero', () => {
    const { html, text } = lowAttendanceWarningTemplate({ ...base, attended: 0, held: 0 });
    expect(html).toContain('0%');
    expect(text).toContain('0%');
  });
});
