-- ============================================================
-- Student Sphere — Migration 002: Social Features
-- Run AFTER 001_initial.sql
-- ============================================================

-- ── friendship ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendship (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendship_requester ON friendship(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendship_addressee ON friendship(addressee_id);

-- ── direct_message ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_message (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recipient_id UUID        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL CHECK (length(trim(content)) > 0),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_sender    ON direct_message(sender_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_message(recipient_id, created_at DESC);

-- ── peer_session ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_session (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                  UUID         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module_id                UUID         NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  title                    VARCHAR(255) NOT NULL,
  description              TEXT,
  date_time                TIMESTAMPTZ  NOT NULL,
  max_participants         INTEGER      NOT NULL DEFAULT 10 CHECK (max_participants BETWEEN 2 AND 100),
  meeting_link_or_location TEXT,
  status                   VARCHAR(20)  NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'cancelled')),
  created_at               TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peer_session_host   ON peer_session(host_id);
CREATE INDEX IF NOT EXISTS idx_peer_session_module ON peer_session(module_id);
CREATE INDEX IF NOT EXISTS idx_peer_session_dt     ON peer_session(date_time) WHERE status = 'active';

-- ── peer_session_participant ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_session_participant (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        NOT NULL REFERENCES peer_session(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES "user"(id)   ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_participant_session ON peer_session_participant(session_id);
CREATE INDEX IF NOT EXISTS idx_peer_participant_student ON peer_session_participant(student_id);

-- ── in_app_notification ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS in_app_notification (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       VARCHAR(50)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  link       VARCHAR(500),
  dedup_key  VARCHAR(255),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON in_app_notification(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dedup
  ON in_app_notification(user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- ── updated_at trigger for friendship ─────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_friendship_updated_at
  BEFORE UPDATE ON friendship
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
