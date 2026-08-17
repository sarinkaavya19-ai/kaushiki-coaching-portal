const INSTITUTION_NAME = 'Kaushiki Classes';
const INSTITUTION_ADDRESS = 'Near Khandoba Temple, Dahigaon Phata, Moshi 412105';
const INSTITUTION_PHONE = '+91 9175498572';
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kaushikiclasses.in';

export interface AttendanceWarningTemplateData {
  studentName: string;
  attendancePercentage: number;
  threshold: number;
  presentSessions: number;
  totalSessions: number;
  monthLabel: string;
  recipientRole?: 'PARENT' | 'STUDENT';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercentage(percentage: number): string {
  const rounded = Math.round(percentage * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

export function attendanceWarningTemplate(data: AttendanceWarningTemplateData): { html: string; text: string } {
  const {
    studentName,
    attendancePercentage,
    threshold,
    presentSessions,
    totalSessions,
    monthLabel,
    recipientRole,
  } = data;

  const safeName = escapeHtml(studentName);
  const safeMonth = escapeHtml(monthLabel);
  const percentage = formatPercentage(attendancePercentage);
  const greeting = recipientRole === 'PARENT' ? `Your ward <strong>${safeName}</strong>` : `<strong>${safeName}</strong>`;
  const greetingText = recipientRole === 'PARENT' ? `Your ward ${studentName}` : studentName;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Attendance Warning – ${INSTITUTION_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${INSTITUTION_NAME}</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">Attendance Warning Notice</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px;">
              <h2 style="margin:0 0 12px;color:#1f2937;font-size:20px;font-weight:600;">Hi ${greeting},</h2>
              <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
                We are concerned that your ward's attendance for <strong style="color:#1f2937;">${safeMonth}</strong>
                has dropped below the required <strong style="color:#ef4444;">${threshold}%</strong> threshold.
                Regular attendance is essential for keeping up with the course material and exam preparation.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;margin:0 0 20px;">
                <tr>
                  <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#6b7280;">Student Name</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:14px;color:#1f2937;font-weight:600;">${safeName}</span>
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
                    <span style="font-size:13px;color:#6b7280;">Sessions Attended</span>
                  </td>
                  <td align="right" style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:14px;color:#1f2937;font-weight:600;">${presentSessions} / ${totalSessions}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="font-size:13px;color:#6b7280;">Monthly Attendance</span>
                  </td>
                  <td align="right" style="padding:14px 18px;">
                    <span style="font-size:18px;color:#ef4444;font-weight:800;">${percentage}</span>
                  </td>
                </tr>
              </table>
              <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 20px;">
                <p style="font-size:12px;color:#ef4444;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Minimum Requirement</p>
                <p style="font-size:14px;color:#374151;margin:0;">
                  A minimum of <strong>${threshold}%</strong> monthly attendance is required. Please ensure regular
                  attendance for the remainder of the month to avoid falling behind.
                </p>
              </div>
              <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
                You can track attendance and academic progress on the coaching portal.
              </p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Visit Coaching Portal</a>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;text-align:center;">${INSTITUTION_NAME} &bull; ${INSTITUTION_ADDRESS}</p>
              <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">${INSTITUTION_PHONE} &bull; &copy; ${new Date().getFullYear()} All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${greetingText},

We are concerned that attendance for ${monthLabel} has dropped below the required ${threshold}% threshold. Regular attendance is essential for keeping up with the course material and exam preparation.

Student Name: ${studentName}
Month: ${monthLabel}
Sessions Attended: ${presentSessions} / ${totalSessions}
Monthly Attendance: ${percentage}

A minimum of ${threshold}% monthly attendance is required. Please ensure regular attendance for the remainder of the month to avoid falling behind.

You can track attendance and academic progress on the coaching portal: ${PORTAL_URL}

---
${INSTITUTION_NAME} | ${INSTITUTION_ADDRESS} | ${INSTITUTION_PHONE}`;

  return { html, text };
}