export interface TestScorecardTemplateData {
  studentName: string;
  testTitle: string;
  score: number;
  totalMarks: number;
  facultyRemarks?: string | null;
  dateLabel?: string | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercentage(score: number, totalMarks: number): string {
  const pct = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  return `${Math.round(pct * 100) / 100}%`;
}

export function testScorecardTemplate(data: TestScorecardTemplateData): { html: string; text: string } {
  const { studentName, testTitle, score, totalMarks, facultyRemarks, dateLabel } = data;

  const safeName = escapeHtml(studentName);
  const safeTitle = escapeHtml(testTitle);
  const safeRemarks = escapeHtml(facultyRemarks);
  const safeDate = dateLabel ? escapeHtml(dateLabel) : '';
  const percentage = formatPercentage(score, totalMarks);

  const remarksBlock = safeRemarks
    ? `<div style="background:#f0f4ff;border-left:4px solid #6366f1;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="font-size:12px;color:#6366f1;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Faculty Remarks</p>
        <p style="font-size:14px;color:#374151;margin:0;white-space:pre-wrap;">${safeRemarks}</p>
      </div>`
    : `<div style="background:#f9fafb;border-left:4px solid #d1d5db;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="font-size:12px;color:#6b7280;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Faculty Remarks</p>
        <p style="font-size:14px;color:#9ca3af;margin:0;">No remarks were provided by the faculty.</p>
      </div>`;

  const dateLine = safeDate
    ? `<p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Graded on <strong>${safeDate}</strong></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Test Scorecard – Kaushiki Classes</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Kaushiki Classes</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Your test scorecard</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Hi ${safeName},</h2>
              <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
                Here are your results for <strong style="color:#1f2937;">${safeTitle}</strong>.
              </p>
              ${dateLine}
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;margin:0 0 20px;">
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Test Title</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:14px;color:#1f2937;font-weight:600;">${safeTitle}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Score Obtained</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:16px;color:#1f2937;font-weight:700;">${score}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Total Marks</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:16px;color:#1f2937;font-weight:700;">${totalMarks}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="font-size:13px;color:#6b7280;">Percentage</span>
                  </td>
                  <td align="right" style="padding:14px 18px;">
                    <span style="font-size:18px;color:#6366f1;font-weight:800;">${percentage}</span>
                  </td>
                </tr>
              </table>
              ${remarksBlock}
              <p style="font-size:14px;color:#6b7280;margin:0;">You can view the full breakdown in your student dashboard.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">Kaushiki Classes &bull; Near Khandoba Temple, Dahigaon Phata, Moshi 412105 &bull; +919175498572</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${studentName},

Your scorecard for ${testTitle} is ready.

Test Title: ${testTitle}
Score Obtained: ${score}
Total Marks: ${totalMarks}
Percentage: ${percentage}

Faculty Remarks:
${safeRemarks || 'No remarks were provided by the faculty.'}

You can view the full breakdown in your student dashboard.

---
Kaushiki Classes | Near Khandoba Temple, Dahigaon Phata, Moshi 412105 | +919175498572`;

  return { html, text };
}
