import nodemailer from 'nodemailer';

const EMAIL_API_KEY = process.env.EMAIL_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

export async function sendReportEmail(
  recipientEmail: string,
  subject: string,
  body: string,
  attachments: { filename: string; content: Buffer | string; contentType: string }[]
) {
  let transporter;

  if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  } else {
    // Mock for development if no credentials
    console.log('No SMTP credentials found, mocking email send.');
    console.log(`To: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);
    console.log(`Attachments: ${attachments.length}`);
    return;
  }

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: subject,
    text: body,
    attachments: attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
  } catch (error: any) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email report: ${error.message || 'Unknown error'}`);
  }
}
