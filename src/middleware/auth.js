const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_EXPIRY = '7d';

/**
 * Sign a JWT and set it as an httpOnly cookie on the response.
 */
function signAndSetCookie(res, user) {
  const payload = {
    id:   user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    profile_picture: user.profile_picture || null
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000 // 7 days
  });
  return token;
}

/**
 * Middleware: parse JWT from cookie, attach req.user if valid.
 * Does NOT reject unauthenticated requests — use requireAuth for that.
 */
function parseUser(req, res, next) {
  try {
    const token = req.cookies && req.cookies.token;
    if (token) {
      req.user = jwt.verify(token, JWT_SECRET);
    }
  } catch {
    // invalid/expired token — clear it
    res.clearCookie('token');
    req.user = null;
  }
  next();
}

/**
 * Middleware: require a valid authenticated user.
 * Redirects to /login if not authenticated.
 */
function requireAuth(req, res, next) {
  parseUser(req, res, () => {
    if (!req.user) {
      req.session.error = 'Please log in to continue.';
      return res.redirect('/login');
    }
    next();
  });
}

/**
 * Middleware factory: require a specific role (or array of roles).
 */
function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        req.session.error = 'You do not have permission to access that page.';
        return res.redirect(`/${req.user.role}/dashboard`);
      }
      next();
    }
  ];
}

/**
 * Middleware: redirect already-logged-in users away from public pages.
 */
function redirectIfAuthenticated(req, res, next) {
  parseUser(req, res, () => {
    if (req.user) {
      return res.redirect(`/${req.user.role}/dashboard`);
    }
    next();
  });
}

module.exports = {
  signAndSetCookie,
  parseUser,
  requireAuth,
  requireRole,
  redirectIfAuthenticated
};

