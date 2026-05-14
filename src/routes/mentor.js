const express        = require('express');
const bcrypt         = require('bcrypt');
const { body, validationResult } = require('express-validator');

const pool    = require('../config/database');
const upload  = require('../middleware/upload');
const { requireRole }            = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../helpers/storage');

const router     = express.Router();
const mentorOnly = requireRole('mentor');

// Helper: verify mentor is assigned to the module
async function assertMentorModule(mentorId, moduleId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_module um JOIN "user" u ON u.id = um.user_id
     WHERE um.user_id = $1 AND um.module_id = $2 AND u.role = 'mentor'`,
    [mentorId, moduleId]
  );
  return rows.length > 0;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', mentorOnly, async (req, res) => {
  try {
    const [modules, sessionsCount, upcomingSessions, avgRating] = await Promise.all([
      pool.query(
        `SELECT m.*,
           (SELECT COUNT(*) FROM student_enrollment se WHERE se.module_id = m.id) AS student_count
         FROM user_module um JOIN module m ON m.id = um.module_id
         WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
        [req.user.id]
      ),
      pool.query(
        'SELECT COUNT(*) AS count FROM tutorial_session WHERE tutor_id = $1', [req.user.id]
      ),
      pool.query(
        `SELECT ts.id, ts.topic, ts.date_time, ts.capacity, m.module_name,
          (SELECT COUNT(*) FROM session_rsvp WHERE session_id = ts.id) as rsvp_count
         FROM tutorial_session ts JOIN module m ON m.id = ts.module_id
         WHERE ts.tutor_id = $1 AND ts.date_time >= NOW() ORDER BY ts.date_time ASC LIMIT 5`,
        [req.user.id]
      ),
      pool.query(
        'SELECT ROUND(AVG(rating),1) AS avg, COUNT(*) AS count FROM tutor_rating WHERE tutor_id = $1',
        [req.user.id]
      )
    ]);

    res.render('mentor/dashboard', {
      title:           'Mentor Dashboard',
      user:            req.user,
      modules:         modules.rows,
      upcomingSessions: upcomingSessions.rows,
      stats: {
        moduleCount:    modules.rows.length,
        sessionCount:   parseInt(sessionsCount.rows[0].count),
        upcomingCount:  upcomingSessions.rows.length,
        avgRating:      avgRating.rows[0].avg,
        ratingCount:    parseInt(avgRating.rows[0].count)
      }
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load dashboard.';
    res.redirect('/mentor/dashboard');
  }
});

// ── Analytics per module ──────────────────────────────────────────────────────
router.get('/analytics/:moduleId', mentorOnly, async (req, res) => {
  try {
    const ok = await assertMentorModule(req.user.id, req.params.moduleId);
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/mentor/dashboard'); }

    const mid = req.params.moduleId;
    const tid = req.user.id;

    const [moduleRes, statsRes, ratingRes, topicStats, recentScores, sessionSummary, recentSessions] = await Promise.all([
      pool.query('SELECT * FROM module WHERE id = $1', [mid]),

      // Quiz stats for this module
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM student_enrollment WHERE module_id = $1) AS total_students,
           (SELECT COUNT(*) FROM ai_quiz_attempt WHERE module_id = $1)    AS total_attempts,
           (SELECT ROUND(AVG(score_percentage),1) FROM ai_quiz_attempt WHERE module_id = $1) AS avg_score`,
        [mid]
      ),

      // This tutor's average rating
      pool.query(
        `SELECT ROUND(AVG(rating),1) AS avg_rating FROM tutor_rating WHERE tutor_id = $1`,
        [tid]
      ),

      // Topic breakdown
      pool.query(
        `SELECT topic_name,
           ROUND(AVG(score_percentage), 1) AS avg_score,
           COUNT(*) AS attempts,
           MAX(score_percentage) AS top_score
         FROM ai_quiz_attempt WHERE module_id = $1
         GROUP BY topic_name ORDER BY avg_score ASC`,
        [mid]
      ),

      // Recent quiz scores
      pool.query(
        `SELECT a.attempted_at, a.score_percentage, a.topic_name, u.name AS student_name
         FROM ai_quiz_attempt a JOIN "user" u ON u.id = a.student_id
         WHERE a.module_id = $1 ORDER BY a.attempted_at DESC LIMIT 10`,
        [mid]
      ),

      // Session totals for this tutor + module
      pool.query(
        `SELECT
           COUNT(*)                                                              AS total_sessions,
           COALESCE(SUM(rsvp_count), 0)                                         AS total_rsvps,
           COALESCE(SUM(attended_count), 0)                                     AS total_attended
         FROM (
           SELECT ts.id,
             COUNT(sr.id) FILTER (WHERE sr.rsvp_status = 'rsvpd') AS rsvp_count,
             COUNT(sr.id) FILTER (WHERE sr.attended = true)        AS attended_count
           FROM tutorial_session ts
           LEFT JOIN session_rsvp sr ON sr.session_id = ts.id
           WHERE ts.tutor_id = $1 AND ts.module_id = $2
           GROUP BY ts.id
         ) sub`,
        [tid, mid]
      ),

      // Per-session breakdown
      pool.query(
        `SELECT ts.topic, ts.date_time, ts.capacity,
           COUNT(sr.id) FILTER (WHERE sr.rsvp_status = 'rsvpd') AS rsvp_count,
           COUNT(sr.id) FILTER (WHERE sr.attended = true)        AS attended_count
         FROM tutorial_session ts
         LEFT JOIN session_rsvp sr ON sr.session_id = ts.id
         WHERE ts.tutor_id = $1 AND ts.module_id = $2
         GROUP BY ts.id, ts.topic, ts.date_time, ts.capacity
         ORDER BY ts.date_time DESC LIMIT 10`,
        [tid, mid]
      )
    ]);

    const s = statsRes.rows[0];
    res.render('mentor/analytics', {
      title:          'Module Analytics',
      user:           req.user,
      module:         moduleRes.rows[0],
      moduleName:     moduleRes.rows[0]?.module_name,
      stats: {
        totalStudents: s.total_students,
        totalAttempts: s.total_attempts,
        avgScore:      s.avg_score,
        avgRating:     ratingRes.rows[0]?.avg_rating
      },
      sessionSummary: sessionSummary.rows[0],
      topicStats:     topicStats.rows,
      recentScores:   recentScores.rows,
      recentSessions: recentSessions.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load analytics.';
    res.redirect('/mentor/dashboard');
  }
});

// ── Upload tutor note ─────────────────────────────────────────────────────────
router.post('/upload-note',
  mentorOnly,
  upload.single('pdf'),
  body('topic_name').trim().isLength({ min: 2, max: 255 }).escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/mentor/my-notes');
    }
    if (!req.file) {
      req.session.error = 'Please select a PDF file.';
      return res.redirect('/mentor/my-notes');
    }

    const { module_id, topic_name } = req.body;
    try {
      const ok = await assertMentorModule(req.user.id, module_id);
      if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/mentor/dashboard'); }

      const fileUrl = await uploadFile(
        req.file.buffer, req.file.originalname, 'tutor-notes', req.file.mimetype
      );

      await pool.query(
        `INSERT INTO pdf_note (module_id, uploaded_by_user_id, topic_name, file_url, file_name, file_size, is_tutor_note)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [module_id, req.user.id, topic_name, fileUrl, req.file.originalname, req.file.size]
      );

      req.session.success = `"${topic_name}" uploaded.`;
      res.redirect('/mentor/my-notes');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to upload note.';
      res.redirect('/mentor/my-notes');
    }
  }
);

// ── My notes ──────────────────────────────────────────────────────────────────
router.get('/my-notes', mentorOnly, async (req, res) => {
  try {
    const filterModuleId = req.query.module_id || null;
    const notesQuery = filterModuleId
      ? pool.query(
          `SELECT pn.*, m.module_name FROM pdf_note pn JOIN module m ON m.id = pn.module_id
           WHERE pn.uploaded_by_user_id = $1 AND pn.is_tutor_note = true AND pn.deleted_at IS NULL
             AND pn.module_id = $2
           ORDER BY pn.created_at DESC`,
          [req.user.id, filterModuleId]
        )
      : pool.query(
          `SELECT pn.*, m.module_name FROM pdf_note pn JOIN module m ON m.id = pn.module_id
           WHERE pn.uploaded_by_user_id = $1 AND pn.is_tutor_note = true AND pn.deleted_at IS NULL
           ORDER BY pn.created_at DESC`,
          [req.user.id]
        );
    const [notes, modules] = await Promise.all([
      notesQuery,
      pool.query(
        `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
         WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
        [req.user.id]
      )
    ]);
    res.render('mentor/my-notes', { title: 'My Notes', user: req.user, notes: notes.rows, modules: modules.rows, filterModuleId });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load notes.';
    res.redirect('/mentor/dashboard');
  }
});

router.delete('/notes/:noteId', mentorOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pdf_note WHERE id = $1 AND uploaded_by_user_id = $2 AND deleted_at IS NULL',
      [req.params.noteId, req.user.id]
    );
    if (!rows[0]) { req.session.error = 'Note not found.'; return res.redirect('/mentor/my-notes'); }
    await deleteFile(rows[0].file_url);
    await pool.query('UPDATE pdf_note SET deleted_at = NOW() WHERE id = $1', [req.params.noteId]);
    req.session.success = 'Note deleted.';
    res.redirect('/mentor/my-notes');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete note.';
    res.redirect('/mentor/my-notes');
  }
});

// ── Module chat ───────────────────────────────────────────────────────────────
router.post('/modules/:moduleId/messages', mentorOnly, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    req.session.error = 'Message cannot be empty.';
    return res.redirect(`/mentor/dashboard`);
  }
  try {
    const ok = await assertMentorModule(req.user.id, req.params.moduleId);
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/mentor/dashboard'); }
    await pool.query(
      'INSERT INTO module_message (module_id, user_id, message) VALUES ($1,$2,$3)',
      [req.params.moduleId, req.user.id, message.trim()]
    );
    res.redirect(`/mentor/analytics/${req.params.moduleId}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to send message.';
    res.redirect('/mentor/dashboard');
  }
});

// ── Sessions CRUD ─────────────────────────────────────────────────────────────
router.get('/sessions', mentorOnly, async (req, res) => {
  try {
    const [sessions, modules] = await Promise.all([
      pool.query(
        `SELECT ts.*, m.module_name,
           (SELECT COUNT(*) FROM session_rsvp sr WHERE sr.session_id = ts.id AND sr.rsvp_status = 'rsvpd') AS rsvp_count
         FROM tutorial_session ts JOIN module m ON m.id = ts.module_id
         WHERE ts.tutor_id = $1 ORDER BY ts.date_time DESC`,
        [req.user.id]
      ),
      pool.query(
        `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
         WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
        [req.user.id]
      )
    ]);
    res.render('mentor/sessions', {
      title:   'My Sessions',
      user:    req.user,
      sessions: sessions.rows,
      modules:  modules.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load sessions.';
    res.redirect('/mentor/dashboard');
  }
});

router.post('/sessions',
  mentorOnly,
  body('topic').trim().isLength({ min: 2, max: 255 }).escape(),
  body('date_time').isISO8601().toDate(),
  body('capacity').isInt({ min: 1, max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/mentor/sessions');
    }
    const { module_id, topic, description, date_time, capacity, meeting_link_or_location } = req.body;
    try {
      const ok = await assertMentorModule(req.user.id, module_id);
      if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/mentor/dashboard'); }

      await pool.query(
        `INSERT INTO tutorial_session (tutor_id, module_id, topic, description, date_time, capacity, meeting_link_or_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.user.id, module_id, topic, description || null, date_time, capacity, meeting_link_or_location || null]
      );
      req.session.success = `Session "${topic}" created.`;
      res.redirect('/mentor/sessions');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to create session.';
      res.redirect('/mentor/sessions');
    }
  }
);

router.put('/sessions/:sessionId',
  mentorOnly,
  body('topic').trim().isLength({ min: 2, max: 255 }).escape(),
  body('date_time').isISO8601().toDate(),
  body('capacity').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/mentor/sessions');
    }
    const { topic, description, date_time, capacity, meeting_link_or_location } = req.body;
    try {
      await pool.query(
        `UPDATE tutorial_session SET topic=$1, description=$2, date_time=$3, capacity=$4, meeting_link_or_location=$5
         WHERE id=$6 AND tutor_id=$7`,
        [topic, description || null, date_time, capacity, meeting_link_or_location || null, req.params.sessionId, req.user.id]
      );
      req.session.success = 'Session updated.';
      res.redirect('/mentor/sessions');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update session.';
      res.redirect('/mentor/sessions');
    }
  }
);

router.delete('/sessions/:sessionId', mentorOnly, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM tutorial_session WHERE id = $1 AND tutor_id = $2',
      [req.params.sessionId, req.user.id]
    );
    req.session.success = 'Session deleted.';
    res.redirect('/mentor/sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete session.';
    res.redirect('/mentor/sessions');
  }
});

// ── Session RSVPs & attendance ────────────────────────────────────────────────
router.get('/sessions/:sessionId/rsvps', mentorOnly, async (req, res) => {
  try {
    const sessionRes = await pool.query(
      'SELECT ts.*, m.module_name FROM tutorial_session ts JOIN module m ON m.id = ts.module_id WHERE ts.id = $1 AND ts.tutor_id = $2',
      [req.params.sessionId, req.user.id]
    );
    if (!sessionRes.rows[0]) {
      req.session.error = 'Session not found.';
      return res.redirect('/mentor/sessions');
    }

    const { rows: rsvps } = await pool.query(
      `SELECT sr.*, u.name, u.email, u.profile_picture
       FROM session_rsvp sr JOIN "user" u ON u.id = sr.student_id
       WHERE sr.session_id = $1 AND sr.rsvp_status = 'rsvpd'
       ORDER BY u.name`,
      [req.params.sessionId]
    );

    res.render('mentor/session-rsvps', {
      title:   'Session RSVPs',
      user:    req.user,
      session: sessionRes.rows[0],
      rsvps
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load RSVPs.';
    res.redirect('/mentor/sessions');
  }
});

router.post('/sessions/:sessionId/attendance', mentorOnly, async (req, res) => {
  // attended_ids: array of student IDs who attended
  const { attended_ids } = req.body;
  try {
    // First verify this session belongs to the mentor
    const sessionRes = await pool.query(
      'SELECT id FROM tutorial_session WHERE id = $1 AND tutor_id = $2',
      [req.params.sessionId, req.user.id]
    );
    if (!sessionRes.rows[0]) {
      req.session.error = 'Session not found.';
      return res.redirect('/mentor/sessions');
    }

    // Reset all attendance for this session
    await pool.query(
      'UPDATE session_rsvp SET attended = false WHERE session_id = $1', [req.params.sessionId]
    );

    // Mark attended
    const ids = Array.isArray(attended_ids) ? attended_ids : (attended_ids ? [attended_ids] : []);
    for (const studentId of ids) {
      await pool.query(
        'UPDATE session_rsvp SET attended = true WHERE session_id = $1 AND student_id = $2',
        [req.params.sessionId, studentId]
      );
    }

    req.session.success = 'Attendance saved.';
    res.redirect(`/mentor/sessions/${req.params.sessionId}/rsvps`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to save attendance.';
    res.redirect(`/mentor/sessions/${req.params.sessionId}/rsvps`);
  }
});

// ── Mentor profile (edit) ─────────────────────────────────────────────────────
router.get('/profile', mentorOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, profile_picture, bio FROM "user" WHERE id = $1', [req.user.id]
    );
    res.render('shared/profile', { title: 'My Profile', user: req.user, profile: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load profile.';
    res.redirect('/mentor/dashboard');
  }
});

router.post('/profile',
  mentorOnly,
  upload.single('profile_picture'),
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  async (req, res) => {
    const { name, bio, current_password, new_password } = req.body;
    try {
      const { rows } = await pool.query('SELECT * FROM "user" WHERE id = $1', [req.user.id]);
      const dbUser = rows[0];

      let profilePictureUrl = dbUser.profile_picture;
      if (req.file) {
        if (profilePictureUrl) await deleteFile(profilePictureUrl);
        profilePictureUrl = await uploadFile(
          req.file.buffer, req.file.originalname, 'avatars', req.file.mimetype
        );
      }

      if (new_password && new_password.length >= 8) {
        if (!current_password || !(await bcrypt.compare(current_password, dbUser.password_hash))) {
          req.session.error = 'Current password is incorrect.';
          return res.redirect('/mentor/profile');
        }
        const hash = await bcrypt.hash(new_password, 12);
        await pool.query(
          'UPDATE "user" SET name=$1, bio=$2, profile_picture=$3, password_hash=$4 WHERE id=$5',
          [name, bio || null, profilePictureUrl, hash, req.user.id]
        );
      } else {
        await pool.query(
          'UPDATE "user" SET name=$1, bio=$2, profile_picture=$3 WHERE id=$4',
          [name, bio || null, profilePictureUrl, req.user.id]
        );
      }

      req.session.success = 'Profile updated.';
      res.redirect('/mentor/profile');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update profile.';
      res.redirect('/mentor/profile');
    }
  }
);

// ── Public mentor profile (viewed by students) ────────────────────────────────
router.get('/profile/:mentorId', mentorOnly, async (req, res) => {
  // Accessible to any logged-in user, but route is under /mentor — redirect students here
  res.redirect(`/student/tutors/${req.params.mentorId}`);
});

module.exports = router;

