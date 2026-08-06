export interface LowAttendanceTemplateData {
  studentName: string;
  batchName: string;
  monthLabel: string;
  attended: number;
  held: number;
  threshold?: number;
}

const DEFAULT_THRESHOLD = 75;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercentage(attended: number, held: number): string {
  const pct = held > 0 ? (attended / held) * 100 : 0;
  return `${Math.round(pct * 100) / 100}%`;
}

export function lowAttendanceWarningTemplate(data: LowAttendanceTemplateData): { html: string; text: string } {
  const { studentName, batchName, monthLabel, attended, held } = data;
  const threshold = data.threshold ?? DEFAULT_THRESHOLD;

  const safeName = escapeHtml(studentName);
  const safeBatch = escapeHtml(batchName);
  const safeMonth = escapeHtml(monthLabel);
  const percentage = formatPercentage(attended, held);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Low Attendance Warning – Kaushiki Classes</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Kaushiki Classes</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">Low Attendance Warning</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:20px;font-weight:600;">Hi ${safeName},</h2>
              <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
                Your attendance in <strong style="color:#1f2937;">${safeBatch}</strong> for the month of
                <strong style="color:#1f2937;">${safeMonth}</strong> has dropped below the
                <strong style="color:#ef4444;">${threshold}%</strong> requirement. Please ensure regular attendance.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;margin:0 0 20px;">
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Batch / Subject</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:14px;color:#1f2937;font-weight:600;">${safeBatch}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Month</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:14px;color:#1f2937;font-weight:600;">${safeMonth}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Classes Attended</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:16px;color:#1f2937;font-weight:700;">${attended}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Classes Held</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:16px;color:#1f2937;font-weight:700;">${held}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="font-size:13px;color:#6b7280;">Attendance Percentage</span>
                  </td>
                  <td align="right" style="padding:14px 18px;">
                    <span style="font-size:18px;color:#ef4444;font-weight:800;">${percentage}</span>
                  </td>
                </tr>
              </table>
              <p style="font-size:14px;color:#6b7280;margin:0;">If you believe this is incorrect, please contact the faculty or the coaching office.</p>
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

Your attendance in ${batchName} for the month of ${monthLabel} has dropped below the ${threshold}% requirement.

Classes Attended: ${attended}
Classes Held: ${held}
Attendance Percentage: ${percentage}

If you believe this is incorrect, please contact the faculty or the coaching office.

---
Kaushiki Classes | Near Khandoba Temple, Dahigaon Phata, Moshi 412105 | +919175498572`;

  return { html, text };
}
