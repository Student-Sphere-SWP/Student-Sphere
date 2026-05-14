const express = require('express');
const { body, validationResult } = require('express-validator');

const pool = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { createNotification } = require('../helpers/notifications');

const router = express.Router();
const studentOnly = requireRole('student');

// ── List peer sessions for enrolled modules ───────────────────────────────────
router.get('/', studentOnly, async (req, res) => {
  try {
    const { rows: sessions } = await pool.query(
      `SELECT ps.*, m.module_name, m.module_code, m.colour,
         u.name AS host_name, u.profile_picture AS host_pic,
         (SELECT COUNT(*) FROM peer_session_participant psp WHERE psp.session_id = ps.id) AS participant_count,
         EXISTS(SELECT 1 FROM peer_session_participant psp2
                WHERE psp2.session_id = ps.id AND psp2.student_id = $1) AS joined
       FROM peer_session ps
       JOIN module m ON m.id = ps.module_id
       JOIN "user" u ON u.id = ps.host_id
       JOIN student_enrollment se ON se.module_id = ps.module_id AND se.student_id = $1
       WHERE ps.status = 'active' AND ps.date_time >= NOW() AND m.deleted_at IS NULL
       ORDER BY ps.date_time ASC`,
      [req.user.id]
    );

    const { rows: myHosted } = await pool.query(
      `SELECT ps.*, m.module_name,
         (SELECT COUNT(*) FROM peer_session_participant psp WHERE psp.session_id = ps.id) AS participant_count
       FROM peer_session ps JOIN module m ON m.id = ps.module_id
       WHERE ps.host_id = $1 ORDER BY ps.date_time DESC LIMIT 10`,
      [req.user.id]
    );

    // Enrolled modules for the create form
    const { rows: modules } = await pool.query(
      `SELECT m.* FROM student_enrollment se JOIN module m ON m.id = se.module_id
       WHERE se.student_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
      [req.user.id]
    );

    res.render('student/peer-sessions', {
      title: 'Study Sessions',
      user: req.user,
      sessions,
      myHosted,
      modules
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load study sessions.';
    res.redirect('/student/dashboard');
  }
});

// ── Create a peer session ─────────────────────────────────────────────────────
router.post('/',
  studentOnly,
  body('title').trim().isLength({ min: 3, max: 255 }),
  body('date_time').isISO8601().toDate(),
  body('max_participants').isInt({ min: 2, max: 100 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg || 'Invalid input.';
      return res.redirect('/student/peer-sessions');
    }

    const { module_id, title, description, date_time, max_participants, meeting_link_or_location } = req.body;
    try {
      // Must be enrolled
      const { rows: enroll } = await pool.query(
        'SELECT 1 FROM student_enrollment WHERE student_id=$1 AND module_id=$2',
        [req.user.id, module_id]
      );
      if (!enroll.length) {
        req.session.error = 'You are not enrolled in that module.';
        return res.redirect('/student/peer-sessions');
      }

      const { rows } = await pool.query(
        `INSERT INTO peer_session (host_id, module_id, title, description, date_time, max_participants, meeting_link_or_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [req.user.id, module_id, title, description || null, date_time, max_participants, meeting_link_or_location || null]
      );

      // Auto-join the host
      await pool.query(
        `INSERT INTO peer_session_participant (session_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, req.user.id]
      );

      req.session.success = `Study session "${title}" created.`;
      res.redirect('/student/peer-sessions');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to create session.';
      res.redirect('/student/peer-sessions');
    }
  }
);

// ── Join a session ────────────────────────────────────────────────────────────
router.post('/:sessionId/join', studentOnly, async (req, res) => {
  try {
    const { rows: session } = await pool.query(
      `SELECT ps.*, m.module_name,
         (SELECT COUNT(*) FROM peer_session_participant psp WHERE psp.session_id = ps.id) AS participant_count
       FROM peer_session ps JOIN module m ON m.id = ps.module_id
       WHERE ps.id=$1 AND ps.status='active'`,
      [req.params.sessionId]
    );
    if (!session[0]) {
      req.session.error = 'Session not found or cancelled.';
      return res.redirect('/student/peer-sessions');
    }
    if (parseInt(session[0].participant_count, 10) >= session[0].max_participants) {
      req.session.error = 'This session is full.';
      return res.redirect('/student/peer-sessions');
    }
    // Must be enrolled
    const { rows: enroll } = await pool.query(
      'SELECT 1 FROM student_enrollment WHERE student_id=$1 AND module_id=$2',
      [req.user.id, session[0].module_id]
    );
    if (!enroll.length) {
      req.session.error = 'You must be enrolled in the module to join.';
      return res.redirect('/student/peer-sessions');
    }

    await pool.query(
      `INSERT INTO peer_session_participant (session_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.sessionId, req.user.id]
    );

    // Notify the host
    if (session[0].host_id !== req.user.id) {
      await createNotification(
        session[0].host_id,
        'session_join',
        `${req.user.name} joined your study session`,
        session[0].title,
        '/student/peer-sessions'
      );
    }

    req.session.success = `You joined "${session[0].title}".`;
    res.redirect('/student/peer-sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to join session.';
    res.redirect('/student/peer-sessions');
  }
});

// ── Leave a session ───────────────────────────────────────────────────────────
router.delete('/:sessionId/join', studentOnly, async (req, res) => {
  try {
    const { rows: session } = await pool.query(
      'SELECT host_id FROM peer_session WHERE id=$1', [req.params.sessionId]
    );
    if (session[0] && session[0].host_id === req.user.id) {
      req.session.error = 'Hosts must cancel the session, not leave it.';
      return res.redirect('/student/peer-sessions');
    }
    await pool.query(
      'DELETE FROM peer_session_participant WHERE session_id=$1 AND student_id=$2',
      [req.params.sessionId, req.user.id]
    );
    req.session.info = 'You left the session.';
    res.redirect('/student/peer-sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed.';
    res.redirect('/student/peer-sessions');
  }
});

// ── Cancel a session (host only) ──────────────────────────────────────────────
router.post('/:sessionId/cancel', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE peer_session SET status='cancelled' WHERE id=$1 AND host_id=$2 RETURNING title`,
      [req.params.sessionId, req.user.id]
    );
    if (!rows.length) {
      req.session.error = 'Session not found or permission denied.';
      return res.redirect('/student/peer-sessions');
    }

    // Notify participants
    const { rows: participants } = await pool.query(
      `SELECT student_id FROM peer_session_participant WHERE session_id=$1 AND student_id <> $2`,
      [req.params.sessionId, req.user.id]
    );
    for (const p of participants) {
      await createNotification(
        p.student_id,
        'session_cancelled',
        `Study session "${rows[0].title}" was cancelled`,
        null,
        '/student/peer-sessions'
      );
    }

    req.session.success = `Session "${rows[0].title}" cancelled.`;
    res.redirect('/student/peer-sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to cancel session.';
    res.redirect('/student/peer-sessions');
  }
});

module.exports = router;
