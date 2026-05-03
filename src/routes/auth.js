const express        = require('express');
const bcrypt         = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');

const pool   = require('../config/database');
const upload = require('../middleware/upload');
const { signAndSetCookie, redirectIfAuthenticated } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../helpers/mailer');
const { uploadFile }             = require('../helpers/storage');

const router = express.Router();

// ── GET /login ────────────────────────────────────────────────────────────────
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login',
  redirectIfAuthenticated,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = 'Please enter a valid email and password.';
      return res.redirect('/login');
    }

    const { email, password } = req.body;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM "user" WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );
      const user = rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        req.session.error = 'Invalid email or password.';
        return res.redirect('/login');
      }

      signAndSetCookie(res, user);
      req.session.success = `Welcome back, ${user.name}!`;
      res.redirect(`/${user.role}/dashboard`);
    } catch (err) {
      console.error('Login error:', err);
      req.session.error = 'A server error occurred. Please try again.';
      res.redirect('/login');
    }
  }
);

// ── GET /register ─────────────────────────────────────────────────────────────
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('auth/register', { title: 'Register' });
});

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register',
  redirectIfAuthenticated,
  upload.single('profile_picture'),
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.'),
  body('confirm_password').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/register');
    }

    const { name, email, password } = req.body;

    try {
      // Check duplicate email
      const existing = await pool.query(
        'SELECT id FROM "user" WHERE email = $1 AND deleted_at IS NULL', [email]
      );
      if (existing.rows.length > 0) {
        req.session.error = 'An account with that email already exists.';
        return res.redirect('/register');
      }

      let profilePictureUrl = null;
      if (req.file) {
        profilePictureUrl = await uploadFile(
          req.file.buffer, req.file.originalname, 'avatars', req.file.mimetype
        );
      }

      const hash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `INSERT INTO "user" (email, password_hash, role, name, profile_picture)
         VALUES ($1, $2, 'student', $3, $4) RETURNING *`,
        [email, hash, name, profilePictureUrl]
      );

      signAndSetCookie(res, rows[0]);
      req.session.success = `Welcome to Student Sphere, ${name}!`;
      res.redirect('/student/dashboard');
    } catch (err) {
      console.error('Register error:', err);
      req.session.error = 'A server error occurred. Please try again.';
      res.redirect('/register');
    }
  }
);

// ── GET /logout ───────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  req.session.success = 'You have been logged out.';
  res.redirect('/login');
});

// ── GET /forgot-password ──────────────────────────────────────────────────────
router.get('/forgot-password', redirectIfAuthenticated, (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
});

// ── POST /forgot-password ─────────────────────────────────────────────────────
router.post('/forgot-password',
  redirectIfAuthenticated,
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = 'Please enter a valid email.';
      return res.redirect('/forgot-password');
    }

    const { email } = req.body;
    // Always show the same message regardless of whether email exists (prevents enumeration)
    req.session.info = 'If that email is registered, you will receive a reset link shortly.';

    try {
      const { rows } = await pool.query(
        'SELECT id FROM "user" WHERE email = $1 AND deleted_at IS NULL', [email]
      );
      if (rows.length === 0) return res.redirect('/forgot-password');

      const userId = rows[0].id;
      const token  = uuidv4();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate previous tokens
      await pool.query(
        'DELETE FROM password_reset_token WHERE user_id = $1', [userId]
      );
      await pool.query(
        'INSERT INTO password_reset_token (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiry]
      );

      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password/${token}`;
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      console.error('Forgot password error:', err);
      // Don't leak the error to the user
    }

    res.redirect('/forgot-password');
  }
);

// ── GET /reset-password/:token ────────────────────────────────────────────────
router.get('/reset-password/:token', redirectIfAuthenticated, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT prt.*, u.email FROM password_reset_token prt
       JOIN "user" u ON u.id = prt.user_id
       WHERE prt.token = $1 AND prt.expires_at > NOW()`,
      [req.params.token]
    );

    if (rows.length === 0) {
      req.session.error = 'This reset link is invalid or has expired.';
      return res.redirect('/forgot-password');
    }

    res.render('auth/reset-password', {
      title: 'Reset Password',
      token: req.params.token,
      email: rows[0].email
    });
  } catch (err) {
    console.error('Reset password GET error:', err);
    req.session.error = 'An error occurred. Please try again.';
    res.redirect('/forgot-password');
  }
});

// ── POST /reset-password/:token ───────────────────────────────────────────────
router.post('/reset-password/:token',
  redirectIfAuthenticated,
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('confirm_password').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/reset-password/${req.params.token}`);
    }

    try {
      const { rows } = await pool.query(
        `SELECT * FROM password_reset_token WHERE token = $1 AND expires_at > NOW()`,
        [req.params.token]
      );
      if (rows.length === 0) {
        req.session.error = 'This reset link is invalid or has expired.';
        return res.redirect('/forgot-password');
      }

      const hash = await bcrypt.hash(req.body.password, 12);
      await pool.query(
        'UPDATE "user" SET password_hash = $1 WHERE id = $2',
        [hash, rows[0].user_id]
      );
      await pool.query(
        'DELETE FROM password_reset_token WHERE user_id = $1', [rows[0].user_id]
      );

      req.session.success = 'Password reset successfully. Please log in.';
      res.redirect('/login');
    } catch (err) {
      console.error('Reset password POST error:', err);
      req.session.error = 'An error occurred. Please try again.';
      res.redirect(`/reset-password/${req.params.token}`);
    }
  }
);

module.exports = router;

