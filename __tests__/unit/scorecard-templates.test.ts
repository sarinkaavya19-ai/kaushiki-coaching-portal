import { testScorecardTemplate } from '@/lib/email/scorecard-templates';

describe('testScorecardTemplate', () => {
  const base = {
    studentName: 'Arjun Patil',
    testTitle: 'Chapter 1 – MCQ',
    score: 7,
    totalMarks: 10,
    facultyRemarks: 'Good attempt, revise algebra.',
  };

  it('renders student name and test title', () => {
    const { html } = testScorecardTemplate(base);
    expect(html).toContain('Arjun Patil');
    expect(html).toContain('Chapter 1');
  });

  it('renders score, total marks and calculated percentage', () => {
    const { html } = testScorecardTemplate(base);
    expect(html).toContain('>7</span>');
    expect(html).toContain('>10</span>');
    expect(html).toContain('70%');
  });

  it('renders faculty remarks', () => {
    const { html, text } = testScorecardTemplate(base);
    expect(html).toContain('Good attempt, revise algebra.');
    expect(text).toContain('Good attempt, revise algebra.');
  });

  it('shows a fallback message when no remarks are provided', () => {
    const { html } = testScorecardTemplate({ ...base, facultyRemarks: null });
    expect(html).toContain('No remarks were provided by the faculty.');
  });

  it('renders an optional graded date', () => {
    const { html } = testScorecardTemplate({ ...base, dateLabel: '05 Aug 2026' });
    expect(html).toContain('Graded on');
    expect(html).toContain('05 Aug 2026');
  });

  it('escapes HTML in user-provided fields', () => {
    const { html } = testScorecardTemplate({
      ...base,
      studentName: '<script>alert(1)</script>',
      testTitle: '<b>Test</b>',
      facultyRemarks: '<img onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>Test</b>');
    expect(html).toContain('&lt;b&gt;Test&lt;/b&gt;');
    expect(html).not.toContain('<img');
  });

  it('produces a plain-text version with the same values', () => {
    const { text } = testScorecardTemplate(base);
    expect(text).toContain('Arjun Patil');
    expect(text).toContain('Chapter 1');
    expect(text).toContain('Score Obtained: 7');
    expect(text).toContain('70%');
  });

  it('handles totalMarks of zero without dividing by zero', () => {
    const { html, text } = testScorecardTemplate({ ...base, score: 0, totalMarks: 0 });
    expect(html).toContain('0%');
    expect(text).toContain('0%');
  });
});
