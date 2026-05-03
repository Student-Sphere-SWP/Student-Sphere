const express        = require('express');
const bcrypt         = require('bcrypt');
const { body, validationResult } = require('express-validator');

const pool    = require('../config/database');
const upload  = require('../middleware/upload');
const { requireRole }            = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../helpers/storage');

const router   = express.Router();
const lecturerOnly = requireRole('lecturer');

// Helper: verify the lecturer is assigned to the given moduleId
async function assertLecturerModule(lecturerId, moduleId, res, redirectPath) {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_module um
     JOIN "user" u ON u.id = um.user_id
     WHERE um.user_id = $1 AND um.module_id = $2 AND u.role = 'lecturer'`,
    [lecturerId, moduleId]
  );
  if (!rows.length) {
    res.locals._forbidden = true;
    return false;
  }
  return true;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', lecturerOnly, async (req, res) => {
  try {
    const { rows: modules } = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM student_enrollment se WHERE se.module_id = m.id) AS student_count,
         (SELECT COUNT(*) FROM pdf_note p WHERE p.module_id = m.id AND p.is_tutor_note = false AND p.deleted_at IS NULL) AS pdf_count
       FROM user_module um
       JOIN module m ON m.id = um.module_id
       WHERE um.user_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.module_name`,
      [req.user.id]
    );
    res.render('lecturer/dashboard', { title: 'Lecturer Dashboard', user: req.user, modules });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load dashboard.';
    res.redirect('/lecturer/dashboard');
  }
});

// ── Module view ───────────────────────────────────────────────────────────────
router.get('/modules/:moduleId', lecturerOnly, async (req, res) => {
  try {
    const ok = await assertLecturerModule(req.user.id, req.params.moduleId, res, '/lecturer/dashboard');
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

    const [moduleRes, pdfs, announcements, messages] = await Promise.all([
      pool.query('SELECT * FROM module WHERE id = $1 AND deleted_at IS NULL', [req.params.moduleId]),
      pool.query(
        `SELECT pn.*, u.name as uploader_name FROM pdf_note pn
         JOIN "user" u ON u.id = pn.uploaded_by_user_id
         WHERE pn.module_id = $1 AND pn.is_tutor_note = false AND pn.deleted_at IS NULL
         ORDER BY pn.created_at DESC`,
        [req.params.moduleId]
      ),
      pool.query(
        `SELECT a.*, u.name as lecturer_name FROM announcement a
         JOIN "user" u ON u.id = a.lecturer_id
         WHERE a.module_id = $1 ORDER BY a.is_pinned DESC, a.created_at DESC`,
        [req.params.moduleId]
      ),
      pool.query(
        `SELECT mm.*, u.name, u.role, u.profile_picture FROM module_message mm
         JOIN "user" u ON u.id = mm.user_id
         WHERE mm.module_id = $1 ORDER BY mm.created_at ASC LIMIT 100`,
        [req.params.moduleId]
      )
    ]);

    if (!moduleRes.rows[0]) { req.session.error = 'Module not found.'; return res.redirect('/lecturer/dashboard'); }

    res.render('lecturer/module', {
      title: moduleRes.rows[0].module_name,
      user:          req.user,
      module:        moduleRes.rows[0],
      pdfs:          pdfs.rows,
      announcements: announcements.rows,
      messages:      messages.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load module.';
    res.redirect('/lecturer/dashboard');
  }
});

// ── Announcements: create page ────────────────────────────────────────────────
router.get('/announcements/create', lecturerOnly, async (req, res) => {
  try {
    const { rows: modules } = await pool.query(
      `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
       WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
      [req.user.id]
    );
    res.render('lecturer/create-announcement', {
      title: 'Post Announcement', user: req.user, modules,
      selected_module: req.query.moduleId || null
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load form.';
    res.redirect('/lecturer/dashboard');
  }
});

router.post('/announcements/create',
  lecturerOnly,
  body('title').trim().isLength({ min: 2, max: 255 }).escape(),
  body('content').trim().isLength({ min: 5 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/lecturer/announcements/create');
    }
    const { module_id, title, content, is_pinned } = req.body;
    try {
      const ok = await assertLecturerModule(req.user.id, module_id, res, '/lecturer/dashboard');
      if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

      await pool.query(
        `INSERT INTO announcement (module_id, lecturer_id, title, content, is_pinned)
         VALUES ($1, $2, $3, $4, $5)`,
        [module_id, req.user.id, title, content, is_pinned === 'on']
      );
      req.session.success = 'Announcement posted.';
      res.redirect(`/lecturer/modules/${module_id}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to post announcement.';
      res.redirect('/lecturer/announcements/create');
    }
  }
);

router.delete('/announcements/:id', lecturerOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM announcement WHERE id = $1 AND lecturer_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) { req.session.error = 'Announcement not found.'; return res.redirect('/lecturer/dashboard'); }
    await pool.query('DELETE FROM announcement WHERE id = $1', [req.params.id]);
    req.session.success = 'Announcement deleted.';
    res.redirect(`/lecturer/modules/${rows[0].module_id}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete announcement.';
    res.redirect('/lecturer/dashboard');
  }
});

// ── PDF upload ────────────────────────────────────────────────────────────────
router.post('/upload-pdf',
  lecturerOnly,
  upload.single('pdf'),
  body('topic_name').trim().isLength({ min: 2, max: 255 }).escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/lecturer/modules/${req.body.module_id}`);
    }
    if (!req.file) {
      req.session.error = 'Please select a PDF file.';
      return res.redirect(`/lecturer/modules/${req.body.module_id}`);
    }

    const { module_id, topic_name } = req.body;
    try {
      const ok = await assertLecturerModule(req.user.id, module_id, res, '/lecturer/dashboard');
      if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

      const fileUrl = await uploadFile(
        req.file.buffer, req.file.originalname, 'pdfs', req.file.mimetype
      );

      await pool.query(
        `INSERT INTO pdf_note (module_id, uploaded_by_user_id, topic_name, file_url, file_name, file_size, is_tutor_note)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [module_id, req.user.id, topic_name, fileUrl, req.file.originalname, req.file.size]
      );

      req.session.success = `"${topic_name}" uploaded successfully.`;
      res.redirect(`/lecturer/modules/${module_id}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to upload PDF.';
      res.redirect(`/lecturer/modules/${module_id}`);
    }
  }
);

// ── Edit PDF topic name ───────────────────────────────────────────────────────
router.get('/edit-pdf/:pdfId', lecturerOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pn.*, m.module_name FROM pdf_note pn JOIN module m ON m.id = pn.module_id
       WHERE pn.id = $1 AND pn.uploaded_by_user_id = $2 AND pn.deleted_at IS NULL`,
      [req.params.pdfId, req.user.id]
    );
    if (!rows[0]) { req.session.error = 'Note not found.'; return res.redirect('/lecturer/dashboard'); }
    res.render('lecturer/edit-pdf', { title: 'Edit Topic', user: req.user, pdf: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load note.';
    res.redirect('/lecturer/dashboard');
  }
});

router.put('/edit-pdf/:pdfId',
  lecturerOnly,
  body('topic_name').trim().isLength({ min: 2, max: 255 }).escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/lecturer/edit-pdf/${req.params.pdfId}`);
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM pdf_note WHERE id = $1 AND uploaded_by_user_id = $2 AND deleted_at IS NULL',
        [req.params.pdfId, req.user.id]
      );
      if (!rows[0]) { req.session.error = 'Note not found.'; return res.redirect('/lecturer/dashboard'); }

      await pool.query(
        'UPDATE pdf_note SET topic_name = $1 WHERE id = $2',
        [req.body.topic_name, req.params.pdfId]
      );
      req.session.success = 'Topic name updated.';
      res.redirect(`/lecturer/modules/${rows[0].module_id}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update topic name.';
      res.redirect(`/lecturer/edit-pdf/${req.params.pdfId}`);
    }
  }
);

router.delete('/edit-pdf/:pdfId', lecturerOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pdf_note WHERE id = $1 AND uploaded_by_user_id = $2 AND deleted_at IS NULL',
      [req.params.pdfId, req.user.id]
    );
    if (!rows[0]) { req.session.error = 'Note not found.'; return res.redirect('/lecturer/dashboard'); }
    await deleteFile(rows[0].file_url);
    await pool.query('UPDATE pdf_note SET deleted_at = NOW() WHERE id = $1', [req.params.pdfId]);
    req.session.success = 'Note deleted.';
    res.redirect(`/lecturer/modules/${rows[0].module_id}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete note.';
    res.redirect('/lecturer/dashboard');
  }
});

// ── Create manual quiz ────────────────────────────────────────────────────────
router.get('/create-quiz', lecturerOnly, async (req, res) => {
  try {
    const { rows: modules } = await pool.query(
      `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
       WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
      [req.user.id]
    );
    res.render('lecturer/create-quiz', {
      title: 'Create Practice Quiz', user: req.user, modules,
      selected_module: req.query.moduleId || null
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load form.';
    res.redirect('/lecturer/dashboard');
  }
});

router.post('/create-quiz', lecturerOnly, async (req, res) => {
  const { module_id, topic_name, questions } = req.body;
  // questions: array of { question_text, option_a, option_b, option_c, option_d, correct_option }
  try {
    const ok = await assertLecturerModule(req.user.id, module_id, res, '/lecturer/dashboard');
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

    if (!topic_name || !questions || !Array.isArray(questions) || questions.length === 0) {
      req.session.error = 'Please provide a topic name and at least one question.';
      return res.redirect('/lecturer/create-quiz');
    }

    const { rows: [quiz] } = await pool.query(
      'INSERT INTO manual_quiz (module_id, created_by_user_id, topic_name) VALUES ($1,$2,$3) RETURNING id',
      [module_id, req.user.id, topic_name.trim()]
    );

    for (const q of questions) {
      if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_option) continue;
      await pool.query(
        `INSERT INTO manual_quiz_question 
           (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [quiz.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.toUpperCase()]
      );
    }

    req.session.success = `Quiz "${topic_name}" created.`;
    res.redirect(`/lecturer/modules/${module_id}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to create quiz.';
    res.redirect('/lecturer/create-quiz');
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics/:moduleId', lecturerOnly, async (req, res) => {
  try {
    const ok = await assertLecturerModule(req.user.id, req.params.moduleId, res, '/lecturer/dashboard');
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

    const [moduleRes, topicStats, recentScores] = await Promise.all([
      pool.query('SELECT * FROM module WHERE id = $1', [req.params.moduleId]),
      pool.query(
        `SELECT topic_name,
           ROUND(AVG(score_percentage), 1) AS avg_score,
           COUNT(*) AS attempt_count,
           ROUND(MIN(score_percentage), 1) AS min_score,
           ROUND(MAX(score_percentage), 1) AS max_score
         FROM ai_quiz_attempt
         WHERE module_id = $1
         GROUP BY topic_name ORDER BY avg_score ASC`,
        [req.params.moduleId]
      ),
      pool.query(
        `SELECT a.attempted_at, a.score_percentage, a.topic_name, u.name AS student_name
         FROM ai_quiz_attempt a JOIN "user" u ON u.id = a.student_id
         WHERE a.module_id = $1 ORDER BY a.attempted_at DESC LIMIT 50`,
        [req.params.moduleId]
      )
    ]);

    res.render('lecturer/analytics', {
      title: 'Module Analytics',
      user: req.user,
      module:       moduleRes.rows[0],
      topicStats:   topicStats.rows,
      recentScores: recentScores.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load analytics.';
    res.redirect('/lecturer/dashboard');
  }
});

// ── Post to module chat ───────────────────────────────────────────────────────
router.post('/modules/:moduleId/messages', lecturerOnly, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    req.session.error = 'Message cannot be empty.';
    return res.redirect(`/lecturer/modules/${req.params.moduleId}`);
  }
  try {
    const ok = await assertLecturerModule(req.user.id, req.params.moduleId, res, '/lecturer/dashboard');
    if (!ok) { req.session.error = 'Access denied.'; return res.redirect('/lecturer/dashboard'); }

    await pool.query(
      'INSERT INTO module_message (module_id, user_id, message) VALUES ($1, $2, $3)',
      [req.params.moduleId, req.user.id, message.trim()]
    );
    res.redirect(`/lecturer/modules/${req.params.moduleId}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to send message.';
    res.redirect(`/lecturer/modules/${req.params.moduleId}`);
  }
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile', lecturerOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, profile_picture, bio FROM "user" WHERE id = $1', [req.user.id]
    );
    res.render('shared/profile', { title: 'My Profile', user: req.user, profile: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load profile.';
    res.redirect('/lecturer/dashboard');
  }
});

router.post('/profile',
  lecturerOnly,
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
          return res.redirect('/lecturer/profile');
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
      res.redirect('/lecturer/profile');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update profile.';
      res.redirect('/lecturer/profile');
    }
  }
);

module.exports = router;

