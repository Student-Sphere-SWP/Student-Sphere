const pool = require('../config/database');

/**
 * Create an in-app notification, skipping duplicates via dedup_key.
 * @param {string} userId   - recipient UUID
 * @param {string} type     - e.g. 'friend_request', 'new_message', 'low_score'
 * @param {string} title    - short heading
 * @param {string} body     - optional longer text
 * @param {string} link     - optional href the user should navigate to
 * @param {string} dedupKey - optional; if set, only one notification with this key per user
 */
async function createNotification(userId, type, title, body = null, link = null, dedupKey = null) {
  try {
    if (dedupKey) {
      await pool.query(
        `INSERT INTO in_app_notification (user_id, type, title, body, link, dedup_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, dedup_key) DO NOTHING`,
        [userId, type, title, body, link, dedupKey]
      );
    } else {
      await pool.query(
        `INSERT INTO in_app_notification (user_id, type, title, body, link)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, title, body, link]
      );
    }
  } catch (err) {
    // Notifications are non-critical — log and continue
    console.error('Failed to create notification:', err.message);
  }
}

/**
 * Return unread notification count for a user.
 */
async function unreadCount(userId) {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS cnt FROM in_app_notification WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    return parseInt(rows[0].cnt, 10);
  } catch {
    return 0;
  }
}

/**
 * Notify all students enrolled in a module.
 * Uses dedup_key to avoid spamming if the same event fires twice.
 * @param {string} moduleId
 * @param {string} type
 * @param {string} title
 * @param {string} body
 * @param {string} link
 * @param {function(string):string} dedupKeyFn  - receives studentId, returns dedup key string
 */
async function notifyEnrolledStudents(moduleId, type, title, body, link, dedupKeyFn = null) {
  try {
    const { rows: students } = await pool.query(
      `SELECT user_id FROM student_enrollment WHERE module_id = $1`,
      [moduleId]
    );
    await Promise.all(
      students.map(s =>
        createNotification(
          s.user_id, type, title, body, link,
          dedupKeyFn ? dedupKeyFn(s.user_id) : null
        )
      )
    );
  } catch (err) {
    console.error('Failed to notify enrolled students:', err.message);
  }
}

module.exports = { createNotification, unreadCount, notifyEnrolledStudents };
