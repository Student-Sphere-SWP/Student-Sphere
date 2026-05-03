require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const session = require('express-session');

const app = express();

// ── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ── Session (flash messages only — auth uses JWT cookies) ─────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));

// ── Flash message locals ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.success = req.session.success || null;
  res.locals.error   = req.session.error   || null;
  res.locals.info    = req.session.info    || null;
  req.session.success = null;
  req.session.error   = null;
  req.session.info    = null;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/',         require('./src/routes/auth'));
app.use('/admin',    require('./src/routes/admin'));
app.use('/lecturer', require('./src/routes/lecturer'));
app.use('/student',  require('./src/routes/student'));
app.use('/mentor',   require('./src/routes/mentor'));

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/login'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('errors/404', { user: null });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('errors/500', { user: req.user || null, error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Student Sphere running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
