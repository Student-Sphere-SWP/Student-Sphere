const express = require('express');
const { body, validationResult } = require('express-validator');

const pool = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { createNotification } = require('../helpers/notifications');

const router = express.Router();
const studentOnly = requireRole('student');

// ═══════════════════════════════════════════════════════════════════════════════
// FRIEND SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

// GET /social/friends — friends list + pending requests + search results
router.get('/friends', studentOnly, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    const [friends, incoming, outgoing, searchResults] = await Promise.all([
      // Accepted friends
      pool.query(
        `SELECT
           CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS friend_id,
           u.name, u.profile_picture, u.email, f.id AS friendship_id
         FROM friendship f
         JOIN "user" u ON u.id = CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id=$1 OR f.addressee_id=$1) AND f.status='accepted'
           AND u.deleted_at IS NULL ORDER BY u.name`,
        [req.user.id]
      ),
      // Incoming pending
      pool.query(
        `SELECT f.id AS friendship_id, u.id AS requester_id, u.name, u.profile_picture, f.created_at
         FROM friendship f JOIN "user" u ON u.id = f.requester_id
         WHERE f.addressee_id=$1 AND f.status='pending' AND u.deleted_at IS NULL
         ORDER BY f.created_at DESC`,
        [req.user.id]
      ),
      // Outgoing pending
      pool.query(
        `SELECT f.id AS friendship_id, u.id AS addressee_id, u.name, u.profile_picture
         FROM friendship f JOIN "user" u ON u.id = f.addressee_id
         WHERE f.requester_id=$1 AND f.status='pending' AND u.deleted_at IS NULL
         ORDER BY f.created_at DESC`,
        [req.user.id]
      ),
      // Search other students
      q.length >= 2
        ? pool.query(
            `SELECT u.id, u.name, u.profile_picture,
               (SELECT f2.status FROM friendship f2
                WHERE (f2.requester_id=$1 AND f2.addressee_id=u.id)
                   OR (f2.requester_id=u.id AND f2.addressee_id=$1)
                LIMIT 1) AS friendship_status,
               (SELECT f2.requester_id FROM friendship f2
                WHERE (f2.requester_id=$1 AND f2.addressee_id=u.id)
                   OR (f2.requester_id=u.id AND f2.addressee_id=$1)
                LIMIT 1) AS friendship_requester
             FROM "user" u
             WHERE u.role='student' AND u.deleted_at IS NULL AND u.id <> $1
               AND (u.name ILIKE $2 OR u.email ILIKE $2)
             ORDER BY u.name LIMIT 20`,
            [req.user.id, `%${q}%`]
          )
        : { rows: [] }
    ]);

    res.render('student/friends', {
      title: 'Friends',
      user: req.user,
      friends: friends.rows,
      incoming: incoming.rows,
      outgoing: outgoing.rows,
      searchResults: searchResults.rows,
      q
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load friends.';
    res.redirect('/student/dashboard');
  }
});

// POST /social/friends/request/:targetId — send friend request
router.post('/friends/request/:targetId', studentOnly, async (req, res) => {
  const { targetId } = req.params;
  if (targetId === req.user.id) {
    req.session.error = 'You cannot add yourself.';
    return res.redirect('/social/friends');
  }
  try {
    // Ensure target exists, is a student, and hasn't blocked us
    const { rows: target } = await pool.query(
      `SELECT id FROM "user" WHERE id=$1 AND role='student' AND deleted_at IS NULL`,
      [targetId]
    );
    if (!target.length) {
      req.session.error = 'User not found.';
      return res.redirect('/social/friends');
    }

    // Check for a block in either direction
    const { rows: block } = await pool.query(
      `SELECT 1 FROM friendship WHERE status='blocked'
       AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
      [req.user.id, targetId]
    );
    if (block.length) {
      req.session.error = 'Cannot send a friend request.';
      return res.redirect('/social/friends');
    }

    await pool.query(
      `INSERT INTO friendship (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
      [req.user.id, targetId]
    );

    await createNotification(
      targetId,
      'friend_request',
      `${req.user.name} sent you a friend request`,
      null,
      '/social/friends',
      `friend_req:${req.user.id}`
    );

    req.session.success = 'Friend request sent.';
    res.redirect('/social/friends');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to send request.';
    res.redirect('/social/friends');
  }
});

// POST /social/friends/:friendshipId/accept
router.post('/friends/:friendshipId/accept', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE friendship SET status='accepted', updated_at=NOW()
       WHERE id=$1 AND addressee_id=$2 AND status='pending'
       RETURNING requester_id`,
      [req.params.friendshipId, req.user.id]
    );
    if (rows.length) {
      await createNotification(
        rows[0].requester_id,
        'friend_accepted',
        `${req.user.name} accepted your friend request`,
        null,
        '/social/friends'
      );
      req.session.success = 'Friend request accepted.';
    }
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to accept request.';
  }
  res.redirect('/social/friends');
});

// POST /social/friends/:friendshipId/reject
router.post('/friends/:friendshipId/reject', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM friendship WHERE id=$1 AND addressee_id=$2 AND status='pending'`,
      [req.params.friendshipId, req.user.id]
    );
    req.session.info = 'Request declined.';
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed.';
  }
  res.redirect('/social/friends');
});

// DELETE /social/friends/:friendshipId — remove friend
router.delete('/friends/:friendshipId', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM friendship
       WHERE id=$1 AND (requester_id=$2 OR addressee_id=$2) AND status='accepted'`,
      [req.params.friendshipId, req.user.id]
    );
    req.session.info = 'Friend removed.';
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed.';
  }
  res.redirect('/social/friends');
});

// POST /social/friends/block/:targetId — block a user
router.post('/friends/block/:targetId', studentOnly, async (req, res) => {
  const { targetId } = req.params;
  if (targetId === req.user.id) return res.redirect('/social/friends');
  try {
    // Remove any existing friendship row, then insert a block
    await pool.query(
      `DELETE FROM friendship
       WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [req.user.id, targetId]
    );
    await pool.query(
      `INSERT INTO friendship (requester_id, addressee_id, status)
       VALUES ($1, $2, 'blocked')
       ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status='blocked', updated_at=NOW()`,
      [req.user.id, targetId]
    );
    req.session.success = 'User blocked.';
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to block user.';
  }
  res.redirect('/social/friends');
});

// POST /social/friends/unblock/:targetId
router.post('/friends/unblock/:targetId', studentOnly, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM friendship WHERE requester_id=$1 AND addressee_id=$2 AND status='blocked'`,
      [req.user.id, req.params.targetId]
    );
    req.session.info = 'User unblocked.';
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed.';
  }
  res.redirect('/social/friends');
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECT MESSAGING
// ═══════════════════════════════════════════════════════════════════════════════

// GET /social/messages — inbox (list of conversations)
router.get('/messages', studentOnly, async (req, res) => {
  try {
    // Latest message per conversation partner
    const { rows: conversations } = await pool.query(
      `SELECT DISTINCT ON (partner_id)
         partner_id,
         u.name AS partner_name,
         u.profile_picture AS partner_pic,
         dm.content AS last_message,
         dm.created_at AS last_at,
         dm.sender_id,
         (SELECT COUNT(*) FROM direct_message
          WHERE recipient_id=$1 AND sender_id=partner_id AND read_at IS NULL) AS unread_count
       FROM (
         SELECT
           CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS partner_id,
           content, created_at, sender_id
         FROM direct_message WHERE sender_id=$1 OR recipient_id=$1
       ) dm
       JOIN "user" u ON u.id = dm.partner_id
       WHERE u.deleted_at IS NULL
       ORDER BY partner_id, dm.created_at DESC`,
      [req.user.id]
    );

    // Sort conversations by most recent
    conversations.sort((a, b) => new Date(b.last_at) - new Date(a.last_at));

    const totalUnread = conversations.reduce((s, c) => s + parseInt(c.unread_count, 10), 0);

    res.render('student/messages', {
      title: 'Messages',
      user: req.user,
      conversations,
      totalUnread
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load messages.';
    res.redirect('/student/dashboard');
  }
});

// GET /social/messages/:partnerId — conversation thread
router.get('/messages/:partnerId', studentOnly, async (req, res) => {
  const { partnerId } = req.params;
  try {
    // Check they are friends (no messaging strangers or blocked users)
    const { rows: fr } = await pool.query(
      `SELECT status FROM friendship
       WHERE ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
      [req.user.id, partnerId]
    );
    const rel = fr[0];
    if (!rel || rel.status !== 'accepted') {
      req.session.error = 'You can only message friends.';
      return res.redirect('/social/messages');
    }

    const [partnerRes, messages] = await Promise.all([
      pool.query(
        `SELECT id, name, profile_picture FROM "user" WHERE id=$1 AND deleted_at IS NULL`,
        [partnerId]
      ),
      pool.query(
        `SELECT * FROM direct_message
         WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
         ORDER BY created_at ASC`,
        [req.user.id, partnerId]
      )
    ]);

    if (!partnerRes.rows[0]) {
      req.session.error = 'User not found.';
      return res.redirect('/social/messages');
    }

    // Mark all received messages as read
    await pool.query(
      `UPDATE direct_message SET read_at=NOW()
       WHERE sender_id=$2 AND recipient_id=$1 AND read_at IS NULL`,
      [req.user.id, partnerId]
    );

    res.render('student/conversation', {
      title: `Chat with ${partnerRes.rows[0].name}`,
      user: req.user,
      partner: partnerRes.rows[0],
      messages: messages.rows
    });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load conversation.';
    res.redirect('/social/messages');
  }
});

// POST /social/messages/:partnerId — send a message
router.post(
  '/messages/:partnerId',
  studentOnly,
  body('content').trim().isLength({ min: 1, max: 2000 }),
  async (req, res) => {
    const { partnerId } = req.params;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = 'Message cannot be empty or too long (max 2000 chars).';
      return res.redirect(`/social/messages/${partnerId}`);
    }
    try {
      // Must be friends
      const { rows: fr } = await pool.query(
        `SELECT status FROM friendship
         WHERE ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
        [req.user.id, partnerId]
      );
      if (!fr[0] || fr[0].status !== 'accepted') {
        req.session.error = 'You can only message friends.';
        return res.redirect('/social/messages');
      }

      const { content } = req.body;
      await pool.query(
        `INSERT INTO direct_message (sender_id, recipient_id, content) VALUES ($1, $2, $3)`,
        [req.user.id, partnerId, content]
      );

      // Notify recipient (dedup: one notification per sender per day)
      const today = new Date().toISOString().slice(0, 10);
      await createNotification(
        partnerId,
        'new_message',
        `New message from ${req.user.name}`,
        content.length > 80 ? content.slice(0, 80) + '…' : content,
        `/social/messages/${req.user.id}`,
        `msg:${req.user.id}:${today}`
      );

      res.redirect(`/social/messages/${partnerId}`);
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to send message.';
      res.redirect(`/social/messages/${partnerId}`);
    }
  }
);

// ── Polling endpoint: GET /social/messages/:partnerId/poll?after=<timestamp>
// Returns JSON new messages since `after` (ISO string or empty for all)
router.get('/messages/:partnerId/poll', studentOnly, async (req, res) => {
  const { partnerId } = req.params;
  const after = req.query.after || '1970-01-01T00:00:00Z';
  try {
    const { rows: fr } = await pool.query(
      `SELECT status FROM friendship
       WHERE ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
      [req.user.id, partnerId]
    );
    if (!fr[0] || fr[0].status !== 'accepted') return res.json({ messages: [] });

    const { rows } = await pool.query(
      `SELECT id, sender_id, content, created_at FROM direct_message
       WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1))
         AND created_at > $3
       ORDER BY created_at ASC`,
      [req.user.id, partnerId, after]
    );

    // Mark new incoming as read
    await pool.query(
      `UPDATE direct_message SET read_at=NOW()
       WHERE sender_id=$2 AND recipient_id=$1 AND read_at IS NULL AND created_at > $3`,
      [req.user.id, partnerId, after]
    );

    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.json({ messages: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /social/notifications — list all
router.get('/notifications', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM in_app_notification WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    // Mark all as read
    await pool.query(
      `UPDATE in_app_notification SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.render('student/notifications', { title: 'Notifications', user: req.user, notifications: rows });
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to load notifications.';
    res.redirect('/student/dashboard');
  }
});

// GET /social/notifications/count — JSON unread count (for navbar badge)
router.get('/notifications/count', studentOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM in_app_notification WHERE user_id=$1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].cnt, 10) });
  } catch {
    res.json({ count: 0 });
  }
});

module.exports = router;
