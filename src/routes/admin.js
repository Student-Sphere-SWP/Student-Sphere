const express        = require('express');
const bcrypt         = require('bcrypt');
const { body, validationResult } = require('express-validator');

const pool    = require('../config/database');
const upload  = require('../middleware/upload');
const { requireRole }  = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../helpers/storage');

const router = express.Router();
const adminOnly = requireRole('admin');

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', adminOnly, async (req, res) => {
  try {
    const [users, modules, enrollments, ai_attempts] = await Promise.all([
      pool.query(`SELECT role, COUNT(*) as count FROM "user" WHERE deleted_at IS NULL GROUP BY role`),
      pool.query(`SELECT COUNT(*) as count FROM module WHERE deleted_at IS NULL`),
      pool.query(`SELECT COUNT(*) as count FROM student_enrollment`),
      pool.query(`SELECT COUNT(*) as count FROM ai_quiz_attempt`)
    ]);

    const roleCounts = { admin: 0, lecturer: 0, student: 0, mentor: 0 };
    users.rows.forEach(r => { roleCounts[r.role] = parseInt(r.count); });

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      roleCounts,
      moduleCount:     parseInt(modules.rows[0].count),
      enrollmentCount: parseInt(enrollments.rows[0].count),
      quizCount:       parseInt(ai_attempts.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load dashboard data.';
    res.redirect('/admin/dashboard');
  }
});

// ── Users: list ───────────────────────────────────────────────────────────────
router.get('/users', adminOnly, async (req, res) => {
  try {
    const { role = '', search = '' } = req.query;
    let query = `SELECT id, email, name, role, profile_picture, created_at
                 FROM "user" WHERE deleted_at IS NULL`;
    const params = [];

    if (role) { params.push(role); query += ` AND role = $${params.length}`; }
    if (search) { params.push(`%${search}%`); query += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})`; }
    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.render('admin/users', {
      title: 'Manage Users',
      user: req.user,
      users: rows,
      filter: { role, search }
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load users.';
    res.redirect('/admin/dashboard');
  }
});

// ── Users: create ─────────────────────────────────────────────────────────────
router.post('/users',
  adminOnly,
  upload.single('profile_picture'),
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'lecturer', 'student', 'mentor']),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/admin/users');
    }

    const { name, email, role, password, bio } = req.body;
    try {
      const existing = await pool.query(
        'SELECT id FROM "user" WHERE email = $1 AND deleted_at IS NULL', [email]
      );
      if (existing.rows.length > 0) {
        req.session.error = 'A user with that email already exists.';
        return res.redirect('/admin/users');
      }

      let profilePictureUrl = null;
      if (req.file) {
        profilePictureUrl = await uploadFile(
          req.file.buffer, req.file.originalname, 'avatars', req.file.mimetype
        );
      }

      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO "user" (email, password_hash, role, name, bio, profile_picture)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [email, hash, role, name, bio || null, profilePictureUrl]
      );

      req.session.success = `User "${name}" created successfully.`;
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to create user.';
      res.redirect('/admin/users');
    }
  }
);

// ── Users: edit form ─────────────────────────────────────────────────────────
router.get('/users/:userId/edit', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, bio, profile_picture FROM "user" WHERE id = $1 AND deleted_at IS NULL',
      [req.params.userId]
    );
    if (!rows[0]) { req.session.error = 'User not found.'; return res.redirect('/admin/users'); }
    res.render('admin/user-edit', { title: 'Edit User', user: req.user, editUser: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load user.';
    res.redirect('/admin/users');
  }
});

// ── Users: update ─────────────────────────────────────────────────────────────
router.put('/users/:userId',
  adminOnly,
  upload.single('profile_picture'),
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'lecturer', 'student', 'mentor']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/admin/users/${req.params.userId}/edit`);
    }

    const { name, email, role, bio, password } = req.body;
    try {
      const current = await pool.query(
        'SELECT * FROM "user" WHERE id = $1 AND deleted_at IS NULL', [req.params.userId]
      );
      if (!current.rows[0]) { req.session.error = 'User not found.'; return res.redirect('/admin/users'); }

      let profilePictureUrl = current.rows[0].profile_picture;
      if (req.file) {
        if (profilePictureUrl) await deleteFile(profilePictureUrl);
        profilePictureUrl = await uploadFile(
          req.file.buffer, req.file.originalname, 'avatars', req.file.mimetype
        );
      }

      const fields = [name, email, role, bio || null, profilePictureUrl, req.params.userId];
      let query = `UPDATE "user" SET name=$1, email=$2, role=$3, bio=$4, profile_picture=$5 WHERE id=$6`;

      if (password && password.length >= 8) {
        const hash = await bcrypt.hash(password, 12);
        fields.splice(5, 0, hash);
        query = `UPDATE "user" SET name=$1, email=$2, role=$3, bio=$4, profile_picture=$5, password_hash=$6 WHERE id=$7`;
      }

      await pool.query(query, fields);
      req.session.success = 'User updated successfully.';
      res.redirect('/admin/users');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update user.';
      res.redirect(`/admin/users/${req.params.userId}/edit`);
    }
  }
);

// ── Users: soft-delete ────────────────────────────────────────────────────────
router.delete('/users/:userId', adminOnly, async (req, res) => {
  try {
    // Don't allow deleting yourself
    if (req.params.userId === req.user.id) {
      req.session.error = 'You cannot delete your own account.';
      return res.redirect('/admin/users');
    }
    await pool.query(
      'UPDATE "user" SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.userId]
    );
    req.session.success = 'User deleted.';
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete user.';
    res.redirect('/admin/users');
  }
});

// ── User-Modules: assign/view ─────────────────────────────────────────────────
router.get('/users/:userId/modules', adminOnly, async (req, res) => {
  try {
    const userRes = await pool.query(
      `SELECT id, name, role FROM "user" WHERE id = $1 AND deleted_at IS NULL AND role IN ('lecturer','mentor')`,
      [req.params.userId]
    );
    if (!userRes.rows[0]) {
      req.session.error = 'User not found or not a lecturer/mentor.';
      return res.redirect('/admin/users');
    }

    const [assigned, allModules] = await Promise.all([
      pool.query(
        `SELECT m.* FROM user_module um JOIN module m ON m.id = um.module_id
         WHERE um.user_id = $1 AND m.deleted_at IS NULL`,
        [req.params.userId]
      ),
      pool.query('SELECT * FROM module WHERE deleted_at IS NULL ORDER BY module_name')
    ]);

    const assignedIds = new Set(assigned.rows.map(m => m.id));

    res.render('admin/user-modules', {
      title: 'Assign Modules',
      user: req.user,
      targetUser:     userRes.rows[0],
      assigned:       assigned.rows,
      allModules:     allModules.rows,
      assignedIds
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load module assignments.';
    res.redirect('/admin/users');
  }
});

router.post('/users/:userId/modules', adminOnly, async (req, res) => {
  const { module_id, action } = req.body;
  try {
    if (action === 'assign') {
      await pool.query(
        `INSERT INTO user_module (user_id, module_id, assigned_by) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, module_id) DO NOTHING`,
        [req.params.userId, module_id, req.user.id]
      );
      req.session.success = 'Module assigned.';
    } else if (action === 'remove') {
      await pool.query(
        'DELETE FROM user_module WHERE user_id = $1 AND module_id = $2',
        [req.params.userId, module_id]
      );
      req.session.success = 'Module removed.';
    }
    res.redirect(`/admin/users/${req.params.userId}/modules`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to update module assignment.';
    res.redirect(`/admin/users/${req.params.userId}/modules`);
  }
});

// ── Modules CRUD ──────────────────────────────────────────────────────────────
router.get('/modules', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM student_enrollment se WHERE se.module_id = m.id) AS student_count
       FROM module m WHERE m.deleted_at IS NULL ORDER BY m.module_name`
    );
    res.render('admin/modules', { title: 'Manage Modules', user: req.user, modules: rows });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load modules.';
    res.redirect('/admin/dashboard');
  }
});

router.post('/modules',
  adminOnly,
  body('module_code').trim().isLength({ min: 2, max: 20 }).toUpperCase(),
  body('module_name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('colour').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/admin/modules');
    }
    const { module_code, module_name, colour, description } = req.body;
    try {
      await pool.query(
        'INSERT INTO module (module_code, module_name, colour, description) VALUES ($1, $2, $3, $4)',
        [module_code.toUpperCase(), module_name, colour || '#6366F1', description || null]
      );
      req.session.success = `Module "${module_name}" created.`;
      res.redirect('/admin/modules');
    } catch (err) {
      if (err.code === '23505') {
        req.session.error = 'Module code already exists.';
      } else {
        req.session.error = 'Failed to create module.';
        console.error(err);
      }
      res.redirect('/admin/modules');
    }
  }
);

router.put('/modules/:moduleId',
  adminOnly,
  body('module_name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('colour').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect('/admin/modules');
    }
    const { module_name, colour, description } = req.body;
    try {
      await pool.query(
        'UPDATE module SET module_name=$1, colour=$2, description=$3 WHERE id=$4 AND deleted_at IS NULL',
        [module_name, colour || '#6366F1', description || null, req.params.moduleId]
      );
      req.session.success = 'Module updated.';
      res.redirect('/admin/modules');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update module.';
      res.redirect('/admin/modules');
    }
  }
);

router.delete('/modules/:moduleId', adminOnly, async (req, res) => {
  try {
    await pool.query(
      'UPDATE module SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.moduleId]
    );
    req.session.success = 'Module deleted.';
    res.redirect('/admin/modules');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete module.';
    res.redirect('/admin/modules');
  }
});

// ── Enrollments ───────────────────────────────────────────────────────────────
router.get('/enrollments', adminOnly, async (req, res) => {
  try {
    const [students, modules, enrollments] = await Promise.all([
      pool.query(`SELECT id, name, email FROM "user" WHERE role='student' AND deleted_at IS NULL ORDER BY name`),
      pool.query(`SELECT id, module_code, module_name FROM module WHERE deleted_at IS NULL ORDER BY module_name`),
      pool.query(`SELECT se.*, u.name as student_name, m.module_name, m.module_code
                  FROM student_enrollment se
                  JOIN "user" u ON u.id = se.student_id
                  JOIN module m ON m.id = se.module_id
                  WHERE m.deleted_at IS NULL AND u.deleted_at IS NULL
                  ORDER BY se.enrolled_at DESC LIMIT 100`)
    ]);
    res.render('admin/enrollments', {
      title: 'Manage Enrollments',
      user: req.user, students: students.rows, modules: modules.rows, enrollments: enrollments.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load enrollments.';
    res.redirect('/admin/dashboard');
  }
});

router.post('/enrollments', adminOnly, async (req, res) => {
  const { student_id, module_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO student_enrollment (student_id, module_id, enrolled_by)
       VALUES ($1, $2, $3) ON CONFLICT (student_id, module_id) DO NOTHING`,
      [student_id, module_id, req.user.id]
    );
    req.session.success = 'Student enrolled.';
    res.redirect('/admin/enrollments');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to enroll student.';
    res.redirect('/admin/enrollments');
  }
});

router.delete('/enrollments/:enrollmentId', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM student_enrollment WHERE id = $1', [req.params.enrollmentId]);
    req.session.success = 'Enrollment removed.';
    res.redirect('/admin/enrollments');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to remove enrollment.';
    res.redirect('/admin/enrollments');
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics', adminOnly, async (req, res) => {
  try {
    const [activityByDay, topModules, roleDistrib, avgScores] = await Promise.all([
      pool.query(`SELECT DATE(attempted_at) as day, COUNT(*) as quiz_count
                  FROM ai_quiz_attempt
                  WHERE attempted_at >= NOW() - INTERVAL '30 days'
                  GROUP BY DATE(attempted_at) ORDER BY day`),
      pool.query(`SELECT m.module_name, COUNT(se.id) as enrollments
                  FROM module m LEFT JOIN student_enrollment se ON se.module_id = m.id
                  WHERE m.deleted_at IS NULL GROUP BY m.id ORDER BY enrollments DESC LIMIT 8`),
      pool.query(`SELECT role, COUNT(*) as count FROM "user" WHERE deleted_at IS NULL GROUP BY role`),
      pool.query(`SELECT m.module_name, ROUND(AVG(a.score_percentage),1) as avg_score
                  FROM ai_quiz_attempt a JOIN module m ON m.id = a.module_id
                  WHERE m.deleted_at IS NULL GROUP BY m.id ORDER BY avg_score DESC LIMIT 8`)
    ]);

    res.render('admin/analytics', {
      title: 'System Analytics',
      user: req.user,
      activityByDay: activityByDay.rows,
      topModules:    topModules.rows,
      roleDistrib:   roleDistrib.rows,
      avgScores:     avgScores.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load analytics.';
    res.redirect('/admin/dashboard');
  }
});

// ── Admin Profile ─────────────────────────────────────────────────────────────
router.get('/profile', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, profile_picture, bio FROM "user" WHERE id = $1', [req.user.id]
    );
    res.render('shared/profile', { title: 'My Profile', user: req.user, profile: rows[0] });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load profile.';
    res.redirect('/admin/dashboard');
  }
});

router.post('/profile',
  adminOnly,
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
          return res.redirect('/admin/profile');
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

      req.session.success = 'Profile updated successfully.';
      res.redirect('/admin/profile');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to update profile.';
      res.redirect('/admin/profile');
    }
  }
);

module.exports = router;

