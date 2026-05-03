const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send a password-reset email.
 *
 * @param {string} toEmail  – Recipient email address
 * @param {string} resetUrl – Full URL for the reset link
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'Student Sphere <no-reply@studentsphere.com>',
    to:      toEmail,
    subject: 'Password Reset — Student Sphere',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#6366F1">Student Sphere — Password Reset</h2>
        <p>We received a request to reset your password. Click the button below to set a new password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#6366F1;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Reset my password
          </a>
        </p>
        <p style="color:#555;font-size:13px">This link expires in 1 hour. If you did not request a password reset, please ignore this email.</p>
        <hr style="border:none;border-top:1px solid #eee"/>
        <p style="color:#999;font-size:12px">Student Sphere LMS</p>
      </div>
    `
  });
}

module.exports = { sendPasswordResetEmail };

