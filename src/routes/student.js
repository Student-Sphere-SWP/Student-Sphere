const express        = require('express');
const bcrypt         = require('bcrypt');
const { body, validationResult } = require('express-validator');

const pool    = require('../config/database');
const upload  = require('../middleware/upload');
const { requireRole }            = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../helpers/storage');
const { extractPdfText }         = require('../helpers/pdfExtract');
const { generateQuiz, generateAdaptiveQuiz } = require('../helpers/gemini');

const router      = express.Router();
const studentOnly = requireRole('student');

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', studentOnly, async (req, res) => {
  try {
    const [enrolledModules, recentScores, progressSummary] = await Promise.all([
      pool.query(
        `SELECT m.*,
           (SELECT COUNT(*) FROM pdf_note p WHERE p.module_id = m.id AND p.is_tutor_note = false AND p.deleted_at IS NULL) AS pdf_count,
           (SELECT COUNT(*) FROM announcement a WHERE a.module_id = m.id) AS announcement_count
         FROM student_enrollment se JOIN module m ON m.id = se.module_id
         WHERE se.student_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
        [req.user.id]
      ),
      pool.query(
        `SELECT a.topic_name, a.score_percentage, a.attempted_at, m.module_name
         FROM ai_quiz_attempt a JOIN module m ON m.id = a.module_id
         WHERE a.student_id = $1 ORDER BY a.attempted_at DESC LIMIT 5`,
        [req.user.id]
      ),
      pool.query(
        `SELECT topic_name, module_id, ROUND(AVG(score_percentage),1) AS avg_score
         FROM ai_quiz_attempt WHERE student_id = $1 GROUP BY topic_name, module_id`,
        [req.user.id]
      )
    ]);

    // Calculate overall mastery
    const totalTopics = progressSummary.rows.length;
    const masteredTopics = progressSummary.rows.filter(t => t.avg_score >= 85).length;

    res.render('student/dashboard', {
      title: 'My Dashboard',
      user:             req.user,
      modules:          enrolledModules.rows,
      recentScores:     recentScores.rows,
      totalTopics,
      masteredTopics,
      overallAvg: totalTopics
        ? Math.round(progressSummary.rows.reduce((sum, t) => sum + parseFloat(t.avg_score), 0) / totalTopics)
        : 0
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load dashboard.';
    res.redirect('/student/dashboard');
  }
});

// ── Browse & self-enroll modules ──────────────────────────────────────────────
router.get('/modules', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM student_enrollment se WHERE se.module_id = m.id) AS student_count,
         EXISTS(
           SELECT 1 FROM student_enrollment se2
           WHERE se2.module_id = m.id AND se2.student_id = $1
         ) AS enrolled
       FROM module m WHERE m.deleted_at IS NULL ORDER BY m.module_name`,
      [req.user.id]
    );
    res.render('student/modules', { title: 'All Modules', user: req.user, modules: rows });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load modules.';
    res.redirect('/student/dashboard');
  }
});

router.post('/modules/:moduleId/enroll', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO student_enrollment (student_id, module_id, enrolled_by) VALUES ($1, $2, $1)
       ON CONFLICT (student_id, module_id) DO NOTHING`,
      [req.user.id, req.params.moduleId]
    );
    req.session.success = 'You have enrolled in this module.';
    res.redirect(`/student/modules/${req.params.moduleId}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to enroll.';
    res.redirect('/student/modules');
  }
});

router.post('/modules/:moduleId/unenroll', studentOnly, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM student_enrollment WHERE student_id = $1 AND module_id = $2',
      [req.user.id, req.params.moduleId]
    );
    req.session.success = 'You have unenrolled from this module.';
    res.redirect('/student/modules');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to unenroll.';
    res.redirect('/student/modules');
  }
});

// ── Module detail view ─────────────────────────────────────────────────────────
router.get('/modules/:moduleId', studentOnly, async (req, res) => {
  try {
    // Confirm student is enrolled
    const enroll = await pool.query(
      'SELECT 1 FROM student_enrollment WHERE student_id = $1 AND module_id = $2',
      [req.user.id, req.params.moduleId]
    );
    if (!enroll.rows.length) {
      req.session.error = 'You are not enrolled in this module.';
      return res.redirect('/student/modules');
    }

    const [moduleRes, pdfs, announcements, messages, manualQuizzes] = await Promise.all([
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
      ),
      pool.query(
        `SELECT mq.*, COUNT(mqq.id) AS question_count FROM manual_quiz mq
         LEFT JOIN manual_quiz_question mqq ON mqq.quiz_id = mq.id
         WHERE mq.module_id = $1 GROUP BY mq.id ORDER BY mq.created_at DESC`,
        [req.params.moduleId]
      )
    ]);

    if (!moduleRes.rows[0]) {
      req.session.error = 'Module not found.';
      return res.redirect('/student/dashboard');
    }

    res.render('student/module', {
      title: moduleRes.rows[0].module_name,
      user:          req.user,
      module:        moduleRes.rows[0],
      pdfs:          pdfs.rows,
      announcements: announcements.rows,
      messages:      messages.rows,
      manualQuizzes: manualQuizzes.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load module.';
    res.redirect('/student/dashboard');
  }
});

// ── Module chat: post message ─────────────────────────────────────────────────
router.post('/modules/:moduleId/messages', studentOnly, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    req.session.error = 'Message cannot be empty.';
    return res.redirect(`/student/modules/${req.params.moduleId}`);
  }
  try {
    const enroll = await pool.query(
      'SELECT 1 FROM student_enrollment WHERE student_id = $1 AND module_id = $2',
      [req.user.id, req.params.moduleId]
    );
    if (!enroll.rows.length) {
      req.session.error = 'Not enrolled in this module.';
      return res.redirect('/student/modules');
    }
    await pool.query(
      'INSERT INTO module_message (module_id, user_id, message) VALUES ($1, $2, $3)',
      [req.params.moduleId, req.user.id, message.trim()]
    );
    res.redirect(`/student/modules/${req.params.moduleId}#chat`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to send message.';
    res.redirect(`/student/modules/${req.params.moduleId}`);
  }
});

// ── Generate AI Quiz ──────────────────────────────────────────────────────────
router.post('/generate-quiz', studentOnly, async (req, res) => {
  const { pdf_note_id, questions_count } = req.body;
  const count = parseInt(questions_count) || 10;

  try {
    // Get PDF details and check enrollment
    const { rows } = await pool.query(
      `SELECT pn.*, m.id AS module_id FROM pdf_note pn
       JOIN module m ON m.id = pn.module_id
       JOIN student_enrollment se ON se.module_id = pn.module_id AND se.student_id = $2
       WHERE pn.id = $1 AND pn.deleted_at IS NULL AND pn.is_tutor_note = false`,
      [pdf_note_id, req.user.id]
    );

    if (!rows[0]) {
      req.session.error = 'PDF not found or you are not enrolled in this module.';
      return res.redirect('/student/dashboard');
    }

    const pdf = rows[0];

    // Extract text from the PDF
    const text = await extractPdfText(pdf.file_url);

    // Generate questions via Gemini
    const questions = await generateQuiz(text, count);

    // Temporarily store quiz data in session for the quiz page
    req.session.pendingQuiz = {
      questions,
      pdfNoteId:  pdf.id,
      moduleId:   pdf.module_id,
      topicName:  pdf.topic_name
    };

    res.render('student/quiz', {
      title:    `Quiz: ${pdf.topic_name}`,
      user:     req.user,
      questions,
      pdfNoteId:  pdf.id,
      topicName:  pdf.topic_name,
      moduleId:   pdf.module_id
    });
  } catch (err) {
    console.error('Generate quiz error:', err);
    req.session.error = `Failed to generate quiz: ${err.message}`;
    res.redirect('/student/dashboard');
  }
});

// ── Submit AI Quiz ─────────────────────────────────────────────────────────────
router.post('/submit-quiz', studentOnly, async (req, res) => {
  const { pdf_note_id, module_id, topic_name, questions_json, answers_json } = req.body;

  try {
    const questions = JSON.parse(questions_json);
    const answers   = JSON.parse(answers_json);

    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] && answers[i].toUpperCase() === q.correct.toUpperCase()) {
        correct++;
      }
    });

    const scorePct = Math.round((correct / questions.length) * 100 * 10) / 10;

    await pool.query(
      `INSERT INTO ai_quiz_attempt
         (student_id, pdf_note_id, module_id, topic_name, score_percentage, questions_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, pdf_note_id, module_id, topic_name, scorePct, questions.length]
    );

    // Keep weak_topic up to date
    await pool.query(
      `INSERT INTO weak_topic (student_id, module_id, topic_name, avg_score, attempts, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (student_id, module_id, topic_name) DO UPDATE
         SET avg_score  = ROUND((weak_topic.avg_score * weak_topic.attempts + EXCLUDED.avg_score) / (weak_topic.attempts + 1), 2),
             attempts   = weak_topic.attempts + 1,
             updated_at = NOW()`,
      [req.user.id, module_id, topic_name, scorePct]
    );

    res.render('student/quiz-result', {
      title:     'Quiz Results',
      user:      req.user,
      score:     scorePct,
      correct,
      total:     questions.length,
      topicName: topic_name,
      moduleId:  module_id,
      questions,
      answers
    });
  } catch (err) {
    console.error('Submit quiz error:', err);
    req.session.error = 'Failed to submit quiz. Please try again.';
    res.redirect('/student/dashboard');
  }
});

// ── Take manual quiz ──────────────────────────────────────────────────────────
router.get('/manual-quiz/:quizId', studentOnly, async (req, res) => {
  try {
    const quizRes = await pool.query(
      `SELECT mq.*, m.module_name FROM manual_quiz mq
       JOIN module m ON m.id = mq.module_id
       JOIN student_enrollment se ON se.module_id = mq.module_id AND se.student_id = $2
       WHERE mq.id = $1`,
      [req.params.quizId, req.user.id]
    );
    if (!quizRes.rows[0]) {
      req.session.error = 'Quiz not found.';
      return res.redirect('/student/dashboard');
    }

    const questionsRes = await pool.query(
      'SELECT * FROM manual_quiz_question WHERE quiz_id = $1',
      [req.params.quizId]
    );

    res.render('student/manual-quiz', {
      title:     quizRes.rows[0].topic_name,
      user:      req.user,
      quiz:      quizRes.rows[0],
      questions: questionsRes.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load quiz.';
    res.redirect('/student/dashboard');
  }
});

router.post('/manual-quiz/:quizId/submit', studentOnly, async (req, res) => {
  try {
    const questionsRes = await pool.query(
      'SELECT * FROM manual_quiz_question WHERE quiz_id = $1',
      [req.params.quizId]
    );
    const quizRes = await pool.query('SELECT * FROM manual_quiz WHERE id = $1', [req.params.quizId]);
    const questions = questionsRes.rows;

    let correct = 0;
    questions.forEach(q => {
      if (req.body[`answer_${q.id}`] === q.correct_option) correct++;
    });

    const scorePct = questions.length > 0
      ? Math.round((correct / questions.length) * 100 * 10) / 10
      : 0;

    await pool.query(
      'INSERT INTO manual_quiz_attempt (quiz_id, student_id, score_percentage) VALUES ($1,$2,$3)',
      [req.params.quizId, req.user.id, scorePct]
    );

    res.render('student/manual-quiz-result', {
      title:     'Practice Quiz Results',
      user:      req.user,
      score:     scorePct,
      correct,
      total:     questions.length,
      quiz:      quizRes.rows[0],
      questions,
      answers:   req.body
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to submit quiz.';
    res.redirect('/student/dashboard');
  }
});

// ── Progress ──────────────────────────────────────────────────────────────────
router.get('/progress', studentOnly, async (req, res) => {
  try {
    const [topicProgress, progressOverTime] = await Promise.all([
      pool.query(
        `SELECT a.topic_name, a.module_id, m.module_name, m.colour,
           ROUND(AVG(a.score_percentage), 1) AS avg_score,
           COUNT(*) AS attempts,
           MAX(a.attempted_at) AS last_attempt
         FROM ai_quiz_attempt a JOIN module m ON m.id = a.module_id
         WHERE a.student_id = $1
         GROUP BY a.topic_name, a.module_id, m.module_name, m.colour
         ORDER BY m.module_name, a.topic_name`,
        [req.user.id]
      ),
      pool.query(
        `SELECT DATE(attempted_at) AS day, ROUND(AVG(score_percentage), 1) AS avg_score
         FROM ai_quiz_attempt
         WHERE student_id = $1 AND attempted_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(attempted_at) ORDER BY day`,
        [req.user.id]
      )
    ]);

    const getMastery = (score) => {
      if (score >= 85) return { label: 'Mastered',      color: 'green-800',  bg: 'green-100'  };
      if (score >= 70) return { label: 'Proficient',    color: 'green-600',  bg: 'green-50'   };
      if (score >= 50) return { label: 'Getting There', color: 'yellow-600', bg: 'yellow-50'  };
      return                  { label: 'Need Practice', color: 'red-600',    bg: 'red-50'     };
    };

    const topicsWithMastery = topicProgress.rows.map(t => ({
      ...t,
      mastery: getMastery(parseFloat(t.avg_score))
    }));

    res.render('student/progress', {
      title: 'My Progress',
      user:            req.user,
      topics:          topicsWithMastery,
      progressOverTime: progressOverTime.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load progress.';
    res.redirect('/student/dashboard');
  }
});

// ── Tutors ────────────────────────────────────────────────────────────────────
router.get('/tutors', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.profile_picture, u.bio,
         ROUND(AVG(tr.rating), 1) AS avg_rating,
         COUNT(DISTINCT tr.id) AS rating_count,
         STRING_AGG(DISTINCT m.module_name, ', ' ORDER BY m.module_name) AS modules
       FROM "user" u
       JOIN user_module um ON um.user_id = u.id
       JOIN module m ON m.id = um.module_id
       JOIN student_enrollment se ON se.module_id = um.module_id AND se.student_id = $1
       LEFT JOIN tutor_rating tr ON tr.tutor_id = u.id
       WHERE u.role = 'mentor' AND u.deleted_at IS NULL AND m.deleted_at IS NULL
       GROUP BY u.id ORDER BY u.name`,
      [req.user.id]
    );
    res.render('student/tutors', { title: 'My Tutors', user: req.user, tutors: rows });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load tutors.';
    res.redirect('/student/dashboard');
  }
});

// ── Tutor profile ─────────────────────────────────────────────────────────────
router.get('/tutors/:tutorId', studentOnly, async (req, res) => {
  try {
    const [tutorRes, modules, notes, sessions, ratings, myRatings, myRsvps] = await Promise.all([
      pool.query(
        `SELECT u.*, ROUND(AVG(tr.rating), 1) AS avg_rating, COUNT(DISTINCT tr.id) AS rating_count
         FROM "user" u LEFT JOIN tutor_rating tr ON tr.tutor_id = u.id
         WHERE u.id = $1 AND u.role = 'mentor' AND u.deleted_at IS NULL GROUP BY u.id`,
        [req.params.tutorId]
      ),
      pool.query(
        `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
         WHERE um.user_id = $1 AND m.deleted_at IS NULL ORDER BY m.module_name`,
        [req.params.tutorId]
      ),
      pool.query(
        `SELECT pn.*, m.module_name FROM pdf_note pn JOIN module m ON m.id = pn.module_id
         WHERE pn.uploaded_by_user_id = $1 AND pn.is_tutor_note = true AND pn.deleted_at IS NULL
         ORDER BY pn.created_at DESC`,
        [req.params.tutorId]
      ),
      pool.query(
        `SELECT ts.*, m.module_name,
           (SELECT COUNT(*) FROM session_rsvp sr WHERE sr.session_id = ts.id AND sr.rsvp_status = 'rsvpd') AS rsvp_count
         FROM tutorial_session ts JOIN module m ON m.id = ts.module_id
         WHERE ts.tutor_id = $1 AND ts.date_time >= NOW()
         ORDER BY ts.date_time ASC LIMIT 10`,
        [req.params.tutorId]
      ),
      pool.query(
        `SELECT tr.*, u.name AS student_name FROM tutor_rating tr
         JOIN "user" u ON u.id = tr.student_id
         WHERE tr.tutor_id = $1 ORDER BY tr.created_at DESC LIMIT 20`,
        [req.params.tutorId]
      ),
      pool.query(
        'SELECT * FROM tutor_rating WHERE tutor_id = $1 AND student_id = $2 ORDER BY created_at DESC',
        [req.params.tutorId, req.user.id]
      ),
      pool.query(
        `SELECT sr.session_id
         FROM session_rsvp sr
         JOIN tutorial_session ts ON ts.id = sr.session_id
         WHERE sr.student_id = $1 AND sr.rsvp_status = 'rsvpd' AND ts.tutor_id = $2`,
        [req.user.id, req.params.tutorId]
      )
    ]);

    if (!tutorRes.rows[0]) {
      req.session.error = 'Tutor not found.';
      return res.redirect('/student/tutors');
    }

    res.render('student/tutor-profile', {
      title:     tutorRes.rows[0].name,
      user:      req.user,
      tutor:     tutorRes.rows[0],
      modules:   modules.rows,
      notes:     notes.rows,
      sessions:  sessions.rows,
      ratings:   ratings.rows,
      myRatings: myRatings.rows,
      myRsvpIds: myRsvps.rows.map(r => r.session_id)
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load tutor profile.';
    res.redirect('/student/tutors');
  }
});

// ── Rate tutor ────────────────────────────────────────────────────────────────
router.post('/tutors/:tutorId/rate', studentOnly,
  body('rating').isInt({ min: 1, max: 5 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = 'Rating must be between 1 and 5.';
      return res.redirect(`/student/tutors/${req.params.tutorId}`);
    }
    const { rating, review, session_id } = req.body;
    try {
      await pool.query(
        `INSERT INTO tutor_rating (student_id, tutor_id, rating, review, session_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, req.params.tutorId, rating, review || null, session_id || null]
      );
      req.session.success = 'Rating submitted.';
      res.redirect(`/student/tutors/${req.params.tutorId}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to submit rating.';
      res.redirect(`/student/tutors/${req.params.tutorId}`);
    }
  }
);

router.put('/ratings/:ratingId', studentOnly,
  body('rating').isInt({ min: 1, max: 5 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = 'Rating must be between 1 and 5.';
      return res.redirect('/student/tutors');
    }
    const { rating, review, tutor_id } = req.body;
    try {
      await pool.query(
        'UPDATE tutor_rating SET rating=$1, review=$2 WHERE id=$3 AND student_id=$4',
        [rating, review || null, req.params.ratingId, req.user.id]
      );
      req.session.success = 'Rating updated.';
      res.redirect(`/student/tutors/${tutor_id}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update rating.';
      res.redirect('/student/tutors');
    }
  }
);

router.delete('/ratings/:ratingId', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT tutor_id FROM tutor_rating WHERE id = $1 AND student_id = $2',
      [req.params.ratingId, req.user.id]
    );
    if (!rows[0]) { req.session.error = 'Rating not found.'; return res.redirect('/student/tutors'); }
    await pool.query('DELETE FROM tutor_rating WHERE id = $1 AND student_id = $2', [req.params.ratingId, req.user.id]);
    req.session.success = 'Rating deleted.';
    res.redirect(`/student/tutors/${rows[0].tutor_id}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete rating.';
    res.redirect('/student/tutors');
  }
});

// ── Sessions (RSVP) ───────────────────────────────────────────────────────────
router.get('/sessions', studentOnly, async (req, res) => {
  try {
    const [upcomingSessions, myRsvps] = await Promise.all([
      pool.query(
        `SELECT ts.*, u.name AS tutor_name, m.module_name, m.colour,
           (SELECT COUNT(*) FROM session_rsvp sr WHERE sr.session_id = ts.id AND sr.rsvp_status = 'rsvpd') AS rsvp_count,
           EXISTS(SELECT 1 FROM session_rsvp sr2 WHERE sr2.session_id = ts.id AND sr2.student_id = $1 AND sr2.rsvp_status = 'rsvpd') AS i_rsvpd
         FROM tutorial_session ts
         JOIN "user" u ON u.id = ts.tutor_id
         JOIN module m ON m.id = ts.module_id
         JOIN student_enrollment se ON se.module_id = ts.module_id AND se.student_id = $1
         WHERE ts.date_time >= NOW() AND m.deleted_at IS NULL
         ORDER BY ts.date_time ASC`,
        [req.user.id]
      ),
      pool.query(
        `SELECT sr.*, ts.topic, ts.date_time, ts.meeting_link_or_location,
           u.name AS tutor_name, m.module_name
         FROM session_rsvp sr
         JOIN tutorial_session ts ON ts.id = sr.session_id
         JOIN "user" u ON u.id = ts.tutor_id
         JOIN module m ON m.id = ts.module_id
         WHERE sr.student_id = $1 AND sr.rsvp_status = 'rsvpd'
         ORDER BY ts.date_time ASC`,
        [req.user.id]
      )
    ]);

    res.render('student/sessions', {
      title:            'Tutorial Sessions',
      user:             req.user,
      upcomingSessions: upcomingSessions.rows,
      myRsvps:          myRsvps.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load sessions.';
    res.redirect('/student/dashboard');
  }
});

router.post('/sessions/:sessionId/rsvp', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO session_rsvp (session_id, student_id, rsvp_status)
       VALUES ($1, $2, 'rsvpd')
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET rsvp_status = 'rsvpd', rsvp_at = NOW()`,
      [req.params.sessionId, req.user.id]
    );
    req.session.success = 'RSVP confirmed!';
    res.redirect('/student/sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to RSVP.';
    res.redirect('/student/sessions');
  }
});

router.post('/sessions/:sessionId/cancel-rsvp', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `UPDATE session_rsvp SET rsvp_status = 'cancelled' WHERE session_id = $1 AND student_id = $2`,
      [req.params.sessionId, req.user.id]
    );
    req.session.success = 'RSVP cancelled.';
    res.redirect('/student/sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to cancel RSVP.';
    res.redirect('/student/sessions');
  }
});

router.post('/sessions/:sessionId/attendance', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `UPDATE session_rsvp SET attended = true WHERE session_id = $1 AND student_id = $2`,
      [req.params.sessionId, req.user.id]
    );
    req.session.success = 'Attendance marked.';
    res.redirect('/student/sessions');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to mark attendance.';
    res.redirect('/student/sessions');
  }
});

// ── Adaptive Quiz ─────────────────────────────────────────────────────────────
router.get('/adaptive-quiz', studentOnly, async (req, res) => {
  try {
    // Derive weak topics: avg score < 70 from all quiz attempts (ai + adaptive)
    const { rows: weakTopics } = await pool.query(
      `SELECT wt.id, wt.topic_name, wt.module_id, wt.avg_score, wt.attempts,
              m.module_name, m.colour
       FROM weak_topic wt
       JOIN module m ON m.id = wt.module_id
       WHERE wt.student_id = $1 AND wt.avg_score < 70
       ORDER BY wt.avg_score ASC, wt.updated_at DESC`,
      [req.user.id]
    );

    res.render('student/adaptive-quiz', {
      title:      'Adaptive Quiz',
      user:       req.user,
      weakTopics
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load adaptive quiz.';
    res.redirect('/student/dashboard');
  }
});

router.post('/adaptive-quiz/generate', studentOnly, async (req, res) => {
  const { weak_topic_id } = req.body;
  try {
    // Fetch the weak topic and verify it belongs to this student
    const { rows } = await pool.query(
      `SELECT wt.*, m.module_name FROM weak_topic wt
       JOIN module m ON m.id = wt.module_id
       WHERE wt.id = $1 AND wt.student_id = $2`,
      [weak_topic_id, req.user.id]
    );
    if (!rows[0]) {
      req.session.error = 'Weak topic not found.';
      return res.redirect('/student/adaptive-quiz');
    }
    const wt = rows[0];

    // Try to find a PDF note for this topic to give the AI richer context
    const pdfRes = await pool.query(
      `SELECT pn.file_url FROM pdf_note pn
       WHERE pn.module_id = $1 AND LOWER(pn.topic_name) = LOWER($2)
         AND pn.deleted_at IS NULL LIMIT 1`,
      [wt.module_id, wt.topic_name]
    );

    let pdfText = null;
    if (pdfRes.rows[0]) {
      try {
        const { extractPdfText } = require('../helpers/pdfExtract');
        pdfText = await extractPdfText(pdfRes.rows[0].file_url);
      } catch (_) { /* PDF extraction not critical for adaptive quiz */ }
    }

    const questions = await generateAdaptiveQuiz(
      wt.topic_name,
      wt.module_name,
      parseFloat(wt.avg_score),
      wt.attempts,
      10,
      pdfText
    );

    res.render('student/adaptive-quiz-take', {
      title:       `Adaptive Quiz: ${wt.topic_name}`,
      user:        req.user,
      questions,
      weakTopicId: wt.id,
      topicName:   wt.topic_name,
      moduleId:    wt.module_id,
      moduleName:  wt.module_name,
      avgScore:    parseFloat(wt.avg_score)
    });
  } catch (err) {
    console.error('Adaptive quiz generate error:', err);
    req.session.error = `Failed to generate adaptive quiz: ${err.message}`;
    res.redirect('/student/adaptive-quiz');
  }
});

router.post('/adaptive-quiz/submit', studentOnly, async (req, res) => {
  const { weak_topic_id, module_id, topic_name, questions_json, answers_json } = req.body;
  try {
    const questions = JSON.parse(questions_json);
    const answers   = JSON.parse(answers_json);

    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] && answers[i].toUpperCase() === q.correct.toUpperCase()) correct++;
    });
    const scorePct = Math.round((correct / questions.length) * 100 * 10) / 10;

    // Save attempt
    await pool.query(
      `INSERT INTO adaptive_quiz_attempt
         (student_id, module_id, topic_name, score_percentage, questions_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, module_id, topic_name, scorePct, questions.length]
    );

    // Update weak_topic — rolling average
    await pool.query(
      `INSERT INTO weak_topic (student_id, module_id, topic_name, avg_score, attempts, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (student_id, module_id, topic_name) DO UPDATE
         SET avg_score  = ROUND((weak_topic.avg_score * weak_topic.attempts + EXCLUDED.avg_score) / (weak_topic.attempts + 1), 2),
             attempts   = weak_topic.attempts + 1,
             updated_at = NOW()`,
      [req.user.id, module_id, topic_name, scorePct]
    );

    // Build results for display
    const results = questions.map((q, i) => {
      const userLetter  = answers[i] ? answers[i].toUpperCase() : null;
      const isCorrect   = userLetter === q.correct.toUpperCase();
      return {
        question:      q.question,
        correct:       isCorrect,
        userAnswer:    userLetter ? `${userLetter}. ${q.options[userLetter]}` : 'Not answered',
        correctAnswer: `${q.correct}. ${q.options[q.correct]}`,
        explanation:   q.explanation || ''
      };
    });

    res.render('student/adaptive-quiz-result', {
      title:       'Adaptive Quiz Results',
      user:        req.user,
      score:       correct,
      total:       questions.length,
      scorePct,
      topicName:   topic_name,
      moduleId:    module_id,
      weakTopicId: weak_topic_id,
      results,
      improved:    scorePct >= 70
    });
  } catch (err) {
    console.error('Adaptive quiz submit error:', err);
    req.session.error = 'Failed to submit adaptive quiz.';
    res.redirect('/student/adaptive-quiz');
  }
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, profile_picture, bio FROM "user" WHERE id = $1', [req.user.id]
    );
    res.render('shared/profile', { title: 'My Profile', user: req.user, profile: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load profile.';
    res.redirect('/student/dashboard');
  }
});

router.post('/profile',
  studentOnly,
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
          return res.redirect('/student/profile');
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
      res.redirect('/student/profile');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update profile.';
      res.redirect('/student/profile');
    }
  }
);

module.exports = router;

