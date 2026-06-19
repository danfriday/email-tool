// Email template(s) for the queue worker (Deno / Edge runtime).
// Kept in sync with the app's catalogue in lib/emailTemplates.ts.

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const PRAISE_PARTY_TEMPLATE: EmailTemplate = {
  subject: "Praise Party 3.0 - You're Invited! VICTORY Concert",
  html: `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Praise Party 3.0 Invitation</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#333333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;padding:0;background:#f7f7f7;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr><td>
        <img src="{{FLYER_IMAGE_URL}}" alt="Praise Party 3.0 - Victory" width="100%"
             style="display:block;width:100%;max-width:600px;height:auto;border:0;text-decoration:none;-ms-interpolation-mode:bicubic;">
    </td></tr>
    <tr><td style="padding:24px 20px;">
        <p style="margin:0 0 20px;font-size:18px;">Dear <strong>{{NAME}}</strong>,</p>
        <p style="margin:0 0 20px;line-height:1.7;font-size:16px;">Come and praise, thank, and worship our Maker with us!</p>
        <p style="margin:0 0 20px;line-height:1.7;font-size:16px;"><strong>Praise Party 3.0 Concert</strong> is here again, and this year's theme is <strong>VICTORY</strong>.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:25px 0;">
            <tr><td style="padding:15px;background:#fafafa;border-left:4px solid #6a35ff;">
                <p style="margin:0 0 10px;"><strong>📅 Date:</strong> Friday, 26th June 2026</p>
                <p style="margin:0 0 10px;"><strong>🕖 Time:</strong> 7:00 PM (Red Carpet Begins)</p>
                <p style="margin:0;"><strong>📍 Venue:</strong><br>
                    RCCG Floodgates of Heaven Parish<br>
                    Plot 9, The Rock Drive, off C&I Leasing Street,<br>
                    off Bisola Durosinmi Etti Drive,<br>
                    Lekki Phase 1, Lagos.
                </p>
            </td></tr>
        </table>
        <p style="margin:0 0 20px;line-height:1.7;font-size:16px;">You are specially invited to join us for an unforgettable evening of praise, thanksgiving, worship, and celebration.</p>
        <p style="margin:0 0 30px;line-height:1.7;font-size:16px;">Attendance is free, but registration is required.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 24px;width:auto;">
            <tr><td align="center" bgcolor="#6a35ff" style="border-radius:4px;">
                <a href="https://rccglp20youths.com/register.php" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;border-radius:4px;">Register Now</a>
            </td></tr>
        </table>
        <p style="margin:0 0 20px;line-height:1.7;font-size:16px;">Let's fill the house with praise and dance the Victory Dance together. Bring your family, friends, and anyone ready for a night of thanksgiving.</p>
        <p style="margin:0 0 25px;line-height:1.7;font-size:16px;">We look forward to celebrating with you.</p>
        <p style="margin:0;font-size:16px;">Blessings,<br><br><strong>Bukola Onaolapo</strong><br>Program Director<br>Praise Party 3.0</p>
    </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  text: `Dear {{NAME}},

Come and praise, thank, and worship our Maker with us!

Praise Party 3.0 Concert is here again, and this year's theme is VICTORY.

📅 Date: Friday, 26th June 2026
🕖 Time: 7:00 PM (Red Carpet Begins)
📍 Venue:
RCCG Floodgates of Heaven Parish
Plot 9, The Rock Drive, off C&I Leasing Street,
off Bisola Durosinmi Etti Drive,
Lekki Phase 1, Lagos.

You are specially invited to join us for an unforgettable evening of praise, thanksgiving, worship, and celebration.

Attendance is free, but registration is required.

Let's fill the house with praise and dance the Victory Dance together. Bring your family, friends, and anyone ready for a night of thanksgiving.

We look forward to celebrating with you.

Blessings,

Bukola Onaolapo
Program Director
Praise Party 3.0

Register here: https://rccglp20youths.com/register.php`,
};

const TEMPLATES: Record<string, EmailTemplate> = {
  "praise-party": PRAISE_PARTY_TEMPLATE,
};

export function getEmailTemplate(name = "praise-party"): EmailTemplate {
  return TEMPLATES[name] ?? PRAISE_PARTY_TEMPLATE;
}

function escapeName(name: string): string {
  // Names are interpolated into HTML — neutralise angle brackets.
  return String(name).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function interpolate(
  tpl: EmailTemplate,
  name: string,
  email: string,
  flyerImageUrl: string,
): EmailTemplate {
  const safeName = escapeName(name);
  return {
    subject: tpl.subject.replace(/\{\{NAME\}\}/gi, name),
    html: tpl.html
      .replace(/\{\{NAME\}\}/gi, safeName)
      .replace(/\{\{EMAIL\}\}/gi, email)
      .replace(/\{\{FLYER_IMAGE_URL\}\}/g, flyerImageUrl),
    text: tpl.text
      .replace(/\{\{NAME\}\}/gi, name)
      .replace(/\{\{EMAIL\}\}/gi, email),
  };
}
