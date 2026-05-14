-- ============================================================
-- Student Sphere â€” PostgreSQL Migration
-- Run this entire file against your Supabase database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- user
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS "user" (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20)  NOT NULL CHECK (role IN ('admin','lecturer','student','mentor')),
  name            VARCHAR(255) NOT NULL,
  profile_picture VARCHAR(500),
  bio             TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_email   ON "user"(email)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_role    ON "user"(role)    WHERE deleted_at IS NULL;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- module
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS module (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code VARCHAR(50)  UNIQUE NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  colour      VARCHAR(20)  DEFAULT '#6366F1',
  description TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_module_code ON module(module_code) WHERE deleted_at IS NULL;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- user_module  (lecturers & mentors assigned to modules)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS user_module (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES "user"(id)   ON DELETE CASCADE,
  module_id   UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES "user"(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_user_module_user   ON user_module(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_module ON user_module(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- student_enrollment
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS student_enrollment (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES "user"(id)   ON DELETE CASCADE,
  module_id   UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  enrolled_by UUID        REFERENCES "user"(id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON student_enrollment(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_module  ON student_enrollment(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- announcement
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS announcement (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  lecturer_id UUID        NOT NULL REFERENCES "user"(id),
  title       VARCHAR(255) NOT NULL,
  content     TEXT        NOT NULL,
  is_pinned   BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcement_module ON announcement(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- module_message  (chat)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS module_message (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES "user"(id),
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_module ON module_message(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- pdf_note
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS pdf_note (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id           UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID        NOT NULL REFERENCES "user"(id),
  topic_name          VARCHAR(255) NOT NULL,
  file_url            VARCHAR(500) NOT NULL,
  file_name           VARCHAR(255) NOT NULL,
  file_size           BIGINT,
  is_tutor_note       BOOLEAN     DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pdf_note_module   ON pdf_note(module_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pdf_note_uploader ON pdf_note(uploaded_by_user_id) WHERE deleted_at IS NULL;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- manual_quiz  (lecturer-created)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS manual_quiz (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  created_by_user_id UUID       NOT NULL REFERENCES "user"(id),
  topic_name        VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- manual_quiz_question
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS manual_quiz_question (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID    NOT NULL REFERENCES manual_quiz(id) ON DELETE CASCADE,
  question_text  TEXT    NOT NULL,
  option_a       TEXT    NOT NULL,
  option_b       TEXT    NOT NULL,
  option_c       TEXT    NOT NULL,
  option_d       TEXT    NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D'))
);

CREATE INDEX IF NOT EXISTS idx_manual_quiz_question_quiz ON manual_quiz_question(quiz_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- manual_quiz_attempt
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS manual_quiz_attempt (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID        NOT NULL REFERENCES manual_quiz(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES "user"(id),
  score_percentage NUMERIC(5,2),
  attempted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_quiz_attempt_student ON manual_quiz_attempt(student_id);
CREATE INDEX IF NOT EXISTS idx_manual_quiz_attempt_quiz    ON manual_quiz_attempt(quiz_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- ai_quiz_attempt
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS ai_quiz_attempt (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES "user"(id),
  pdf_note_id      UUID        NOT NULL REFERENCES pdf_note(id),
  module_id        UUID        NOT NULL REFERENCES module(id),
  topic_name       VARCHAR(255) NOT NULL,
  score_percentage NUMERIC(5,2),
  questions_count  INTEGER,
  attempted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_quiz_attempt_student ON ai_quiz_attempt(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_quiz_attempt_module  ON ai_quiz_attempt(module_id);
CREATE INDEX IF NOT EXISTS idx_ai_quiz_attempt_pdf     ON ai_quiz_attempt(pdf_note_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- adaptive_quiz_attempt
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS adaptive_quiz_attempt (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module_id        UUID         NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  topic_name       VARCHAR(255) NOT NULL,
  score_percentage NUMERIC(5,2),
  questions_count  INTEGER,
  attempted_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adaptive_quiz_attempt_student ON adaptive_quiz_attempt(student_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_quiz_attempt_module  ON adaptive_quiz_attempt(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- weak_topic  (auto-maintained from quiz attempts)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS weak_topic (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module_id     UUID         NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  topic_name    VARCHAR(255) NOT NULL,
  avg_score     NUMERIC(5,2) DEFAULT 0,
  attempts      INTEGER      DEFAULT 0,
  identified_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(student_id, module_id, topic_name)
);

CREATE INDEX IF NOT EXISTS idx_weak_topic_student ON weak_topic(student_id);
CREATE INDEX IF NOT EXISTS idx_weak_topic_module  ON weak_topic(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- tutorial_session  (must be before tutor_rating)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tutorial_session (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              UUID        NOT NULL REFERENCES "user"(id),
  module_id             UUID        NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  topic                 VARCHAR(255) NOT NULL,
  description           TEXT,
  date_time             TIMESTAMPTZ NOT NULL,
  capacity              INTEGER     NOT NULL DEFAULT 30,
  meeting_link_or_location TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutorial_session_tutor  ON tutorial_session(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_session_module ON tutorial_session(module_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- tutor_rating
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS tutor_rating (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES "user"(id),
  tutor_id   UUID        NOT NULL REFERENCES "user"(id),
  rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review     TEXT,
  session_id UUID        REFERENCES tutorial_session(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_rating_tutor   ON tutor_rating(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_rating_student ON tutor_rating(student_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- session_rsvp
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS session_rsvp (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES tutorial_session(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES "user"(id),
  rsvp_status VARCHAR(20) DEFAULT 'rsvpd' CHECK (rsvp_status IN ('rsvpd','cancelled')),
  attended    BOOLEAN     DEFAULT FALSE,
  rsvp_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_rsvp_session ON session_rsvp(session_id);
CREATE INDEX IF NOT EXISTS idx_session_rsvp_student ON session_rsvp(student_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- password_reset_token
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS password_reset_token (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token      VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- FUNCTION: auto-update updated_at
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_user_updated_at
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_announcement_updated_at
  BEFORE UPDATE ON announcement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_pdf_note_updated_at
  BEFORE UPDATE ON pdf_note
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_tutor_rating_updated_at
  BEFORE UPDATE ON tutor_rating
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- SEED: default admin user
-- Password: Admin@123  (change immediately!)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO "user" (email, password_hash, role, name)
VALUES (
  'admin@studentsphere.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy',
  'admin',
  'System Administrator'
) ON CONFLICT (email) DO NOTHING;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- SEED: sample data (>= 5 rows per table)
-- Password hash below corresponds to: Admin@123
-- All inserts are idempotent via fixed UUIDs.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- user (additional sample users)
INSERT INTO "user" (id, email, password_hash, role, name, bio)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'admin2@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'admin', 'Amina Admin', 'Platform operations and quality assurance.'),
  ('11111111-1111-1111-1111-111111111201', 'lecturer1@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'lecturer', 'Liam Lecturer', 'Teaches software engineering and practical labs.'),
  ('11111111-1111-1111-1111-111111111202', 'lecturer2@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'lecturer', 'Noah Lecturer', 'Focuses on algorithms and performance optimization.'),
  ('11111111-1111-1111-1111-111111111203', 'lecturer3@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'lecturer', 'Olivia Lecturer', 'Database systems and cloud data services.'),
  ('11111111-1111-1111-1111-111111111301', 'mentor1@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'mentor', 'Mia Mentor', 'Peer tutoring for Python and study habits.'),
  ('11111111-1111-1111-1111-111111111302', 'mentor2@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'mentor', 'Ethan Mentor', 'Helps students with SQL and reporting.'),
  ('11111111-1111-1111-1111-111111111303', 'mentor3@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'mentor', 'Ava Mentor', 'Revision planning and exam technique coaching.'),
  ('11111111-1111-1111-1111-111111111401', 'student1@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'James Student', 'Enjoys building full-stack projects.'),
  ('11111111-1111-1111-1111-111111111402', 'student2@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Sophia Student', 'Interested in data science and visual analytics.'),
  ('11111111-1111-1111-1111-111111111403', 'student3@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Benjamin Student', 'Practices daily coding challenges.'),
  ('11111111-1111-1111-1111-111111111404', 'student4@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Isabella Student', 'Prefers visual learning and concept maps.'),
  ('11111111-1111-1111-1111-111111111405', 'student5@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Lucas Student', 'Working toward backend specialization.'),
  ('11111111-1111-1111-1111-111111111406', 'student6@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Charlotte Student', 'Strong interest in system design.'),
  ('11111111-1111-1111-1111-111111111407', 'student7@studentsphere.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy', 'student', 'Henry Student', 'Enjoys collaborative problem solving.')
ON CONFLICT (id) DO NOTHING;

-- module
INSERT INTO module (id, module_code, module_name, colour, description)
VALUES
  ('22222222-2222-2222-2222-222222222101', 'CS101', 'Introduction to Programming', '#6366F1', 'Programming basics with JavaScript and Python.'),
  ('22222222-2222-2222-2222-222222222102', 'CS201', 'Data Structures and Algorithms', '#10B981', 'Core structures, complexity analysis, and problem solving.'),
  ('22222222-2222-2222-2222-222222222103', 'DB202', 'Database Systems', '#F59E0B', 'Relational modeling, SQL, and indexing.'),
  ('22222222-2222-2222-2222-222222222104', 'SE301', 'Software Engineering', '#3B82F6', 'Requirements, design, testing, and delivery.'),
  ('22222222-2222-2222-2222-222222222105', 'AI305', 'Applied AI Fundamentals', '#EF4444', 'Machine learning essentials and practical AI use.')
ON CONFLICT (id) DO NOTHING;

-- user_module (lecturers and mentors assigned to modules)
INSERT INTO user_module (id, user_id, module_id, assigned_by)
VALUES
  ('33333333-3333-3333-3333-333333333101', '11111111-1111-1111-1111-111111111201', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333102', '11111111-1111-1111-1111-111111111201', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333103', '11111111-1111-1111-1111-111111111202', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333104', '11111111-1111-1111-1111-111111111203', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333105', '11111111-1111-1111-1111-111111111203', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333106', '11111111-1111-1111-1111-111111111301', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333107', '11111111-1111-1111-1111-111111111301', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333108', '11111111-1111-1111-1111-111111111302', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333109', '11111111-1111-1111-1111-111111111303', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333110', '11111111-1111-1111-1111-111111111303', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111101')
ON CONFLICT (id) DO NOTHING;

-- student_enrollment
INSERT INTO student_enrollment (id, student_id, module_id, enrolled_by)
VALUES
  ('44444444-4444-4444-4444-444444444101', '11111111-1111-1111-1111-111111111401', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444102', '11111111-1111-1111-1111-111111111401', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444103', '11111111-1111-1111-1111-111111111402', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444104', '11111111-1111-1111-1111-111111111402', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444105', '11111111-1111-1111-1111-111111111403', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444106', '11111111-1111-1111-1111-111111111404', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444107', '11111111-1111-1111-1111-111111111405', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444108', '11111111-1111-1111-1111-111111111406', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444109', '11111111-1111-1111-1111-111111111407', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111101'),
  ('44444444-4444-4444-4444-444444444110', '11111111-1111-1111-1111-111111111407', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111101')
ON CONFLICT (id) DO NOTHING;

-- announcement
INSERT INTO announcement (id, module_id, lecturer_id, title, content, is_pinned)
VALUES
  ('55555555-5555-5555-5555-555555555101', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111201', 'Welcome to CS101', 'Please review the syllabus and complete the intro task.', TRUE),
  ('55555555-5555-5555-5555-555555555102', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111202', 'Sorting Lab Released', 'Lab sheet is now available in lecture notes.', FALSE),
  ('55555555-5555-5555-5555-555555555103', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111203', 'SQL Practice Set', 'Attempt at least problems 1 through 10 before class.', FALSE),
  ('55555555-5555-5555-5555-555555555104', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111201', 'Sprint Demo Date', 'Team sprint demo is scheduled for next Friday.', TRUE),
  ('55555555-5555-5555-5555-555555555105', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111203', 'Mini Project Brief', 'Project brief uploaded. Form your teams this week.', FALSE)
ON CONFLICT (id) DO NOTHING;

-- module_message
INSERT INTO module_message (id, module_id, user_id, message)
VALUES
  ('66666666-6666-6666-6666-666666666101', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111401', 'Can we get another example on loops?'),
  ('66666666-6666-6666-6666-666666666102', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111201', 'Sure, I will upload one today.'),
  ('66666666-6666-6666-6666-666666666103', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111403', 'Is quicksort required for the quiz?'),
  ('66666666-6666-6666-6666-666666666104', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111202', 'Yes, quicksort and mergesort are both included.'),
  ('66666666-6666-6666-6666-666666666105', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111404', 'Any tips for JOIN questions?'),
  ('66666666-6666-6666-6666-666666666106', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111302', 'Start with INNER JOIN, then LEFT JOIN cases.'),
  ('66666666-6666-6666-6666-666666666107', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111405', 'Can we submit wireframes as part of sprint 1?'),
  ('66666666-6666-6666-6666-666666666108', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111406', 'Do we need Python for the AI assignment?')
ON CONFLICT (id) DO NOTHING;

-- pdf_note
INSERT INTO pdf_note (id, module_id, uploaded_by_user_id, topic_name, file_url, file_name, file_size, is_tutor_note)
VALUES
  ('77777777-7777-7777-7777-777777777101', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111201', 'Variables and Data Types', 'https://example.com/files/cs101-week1.pdf', 'cs101-week1.pdf', 245760, FALSE),
  ('77777777-7777-7777-7777-777777777102', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111301', 'Python Loops Quick Guide', 'https://example.com/files/cs101-loops-guide.pdf', 'cs101-loops-guide.pdf', 187392, TRUE),
  ('77777777-7777-7777-7777-777777777103', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111202', 'Sorting Algorithms', 'https://example.com/files/cs201-sorting.pdf', 'cs201-sorting.pdf', 334848, FALSE),
  ('77777777-7777-7777-7777-777777777104', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111203', 'Normalization and ERD', 'https://example.com/files/db202-normalization.pdf', 'db202-normalization.pdf', 276480, FALSE),
  ('77777777-7777-7777-7777-777777777105', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111201', 'Agile Fundamentals', 'https://example.com/files/se301-agile.pdf', 'se301-agile.pdf', 221184, FALSE),
  ('77777777-7777-7777-7777-777777777106', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111203', 'Intro to ML Pipelines', 'https://example.com/files/ai305-ml-pipelines.pdf', 'ai305-ml-pipelines.pdf', 311296, FALSE),
  ('77777777-7777-7777-7777-777777777107', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111302', 'SQL Cheat Sheet', 'https://example.com/files/db202-sql-cheatsheet.pdf', 'db202-sql-cheatsheet.pdf', 143360, TRUE),
  ('77777777-7777-7777-7777-777777777108', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111303', 'Sprint Planning Notes', 'https://example.com/files/se301-sprint-planning.pdf', 'se301-sprint-planning.pdf', 198656, TRUE)
ON CONFLICT (id) DO NOTHING;

-- manual_quiz
INSERT INTO manual_quiz (id, module_id, created_by_user_id, topic_name)
VALUES
  ('88888888-8888-8888-8888-888888888101', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111201', 'Programming Basics Checkpoint'),
  ('88888888-8888-8888-8888-888888888102', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111202', 'Big-O and Arrays'),
  ('88888888-8888-8888-8888-888888888103', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111203', 'SQL Core Concepts'),
  ('88888888-8888-8888-8888-888888888104', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111201', 'Agile and Testing'),
  ('88888888-8888-8888-8888-888888888105', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111203', 'AI Ethics and Evaluation')
ON CONFLICT (id) DO NOTHING;

-- manual_quiz_question (10 sample questions)
INSERT INTO manual_quiz_question (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option)
VALUES
  ('99999999-9999-9999-9999-999999999101', '88888888-8888-8888-8888-888888888101', 'Which keyword declares a constant in JavaScript?', 'var', 'let', 'const', 'define', 'C'),
  ('99999999-9999-9999-9999-999999999102', '88888888-8888-8888-8888-888888888101', 'What data type is TRUE in JavaScript?', 'string', 'boolean', 'number', 'object', 'B'),
  ('99999999-9999-9999-9999-999999999103', '88888888-8888-8888-8888-888888888102', 'Average-case complexity of binary search is:', 'O(n)', 'O(log n)', 'O(n log n)', 'O(1)', 'B'),
  ('99999999-9999-9999-9999-999999999104', '88888888-8888-8888-8888-888888888102', 'Which structure follows FIFO?', 'Stack', 'Tree', 'Queue', 'Graph', 'C'),
  ('99999999-9999-9999-9999-999999999105', '88888888-8888-8888-8888-888888888103', 'Which SQL command retrieves rows?', 'INSERT', 'DELETE', 'UPDATE', 'SELECT', 'D'),
  ('99999999-9999-9999-9999-999999999106', '88888888-8888-8888-8888-888888888103', 'A primary key must be:', 'Nullable', 'Unique and non-null', 'Text only', 'Indexed twice', 'B'),
  ('99999999-9999-9999-9999-999999999107', '88888888-8888-8888-8888-888888888104', 'Which is an Agile ceremony?', 'Compiling', 'Stand-up', 'Normalization', 'Backpropagation', 'B'),
  ('99999999-9999-9999-9999-999999999108', '88888888-8888-8888-8888-888888888104', 'Unit tests should mainly verify:', 'UI colors', 'Single component behavior', 'Database size', 'Network speed only', 'B'),
  ('99999999-9999-9999-9999-999999999109', '88888888-8888-8888-8888-888888888105', 'Bias in AI models often comes from:', 'Random numbers only', 'Training data and assumptions', 'CPU temperature', 'File naming', 'B'),
  ('99999999-9999-9999-9999-999999999110', '88888888-8888-8888-8888-888888888105', 'Which metric is common for classification?', 'RMSE', 'BLEU', 'Accuracy', 'PSNR', 'C')
ON CONFLICT (id) DO NOTHING;

-- manual_quiz_attempt
INSERT INTO manual_quiz_attempt (id, quiz_id, student_id, score_percentage)
VALUES
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaa01', '88888888-8888-8888-8888-888888888101', '11111111-1111-1111-1111-111111111401', 80.00),
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaa02', '88888888-8888-8888-8888-888888888102', '11111111-1111-1111-1111-111111111403', 70.00),
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaa03', '88888888-8888-8888-8888-888888888103', '11111111-1111-1111-1111-111111111402', 90.00),
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaa04', '88888888-8888-8888-8888-888888888104', '11111111-1111-1111-1111-111111111405', 60.00),
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaa05', '88888888-8888-8888-8888-888888888105', '11111111-1111-1111-1111-111111111406', 85.00)
ON CONFLICT (id) DO NOTHING;

-- ai_quiz_attempt
INSERT INTO ai_quiz_attempt (id, student_id, pdf_note_id, module_id, topic_name, score_percentage, questions_count)
VALUES
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbb01', '11111111-1111-1111-1111-111111111401', '77777777-7777-7777-7777-777777777101', '22222222-2222-2222-2222-222222222101', 'Variables and Data Types', 76.00, 10),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbb02', '11111111-1111-1111-1111-111111111402', '77777777-7777-7777-7777-777777777104', '22222222-2222-2222-2222-222222222103', 'Normalization and ERD', 88.00, 10),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbb03', '11111111-1111-1111-1111-111111111403', '77777777-7777-7777-7777-777777777103', '22222222-2222-2222-2222-222222222102', 'Sorting Algorithms', 69.00, 15),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbb04', '11111111-1111-1111-1111-111111111405', '77777777-7777-7777-7777-777777777105', '22222222-2222-2222-2222-222222222104', 'Agile Fundamentals', 81.00, 10),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbb05', '11111111-1111-1111-1111-111111111406', '77777777-7777-7777-7777-777777777106', '22222222-2222-2222-2222-222222222105', 'Intro to ML Pipelines', 74.00, 12)
ON CONFLICT (id) DO NOTHING;

-- tutorial_session
INSERT INTO tutorial_session (id, tutor_id, module_id, topic, description, date_time, capacity, meeting_link_or_location)
VALUES
  ('ccccccc1-cccc-cccc-cccc-cccccccccc01', '11111111-1111-1111-1111-111111111301', '22222222-2222-2222-2222-222222222101', 'Intro Coding Clinic', 'Bring your week 1 questions.', NOW() + INTERVAL '2 days', 25, 'Room A12'),
  ('ccccccc1-cccc-cccc-cccc-cccccccccc02', '11111111-1111-1111-1111-111111111301', '22222222-2222-2222-2222-222222222102', 'Algorithm Walkthrough', 'Problem solving and pseudocode session.', NOW() + INTERVAL '3 days', 30, 'https://meet.example.com/algorithms'),
  ('ccccccc1-cccc-cccc-cccc-cccccccccc03', '11111111-1111-1111-1111-111111111302', '22222222-2222-2222-2222-222222222103', 'SQL Joins Practice', 'Hands-on join exercises.', NOW() + INTERVAL '4 days', 20, 'Lab DB-02'),
  ('ccccccc1-cccc-cccc-cccc-cccccccccc04', '11111111-1111-1111-1111-111111111303', '22222222-2222-2222-2222-222222222104', 'Sprint Planning Help', 'Break down project stories effectively.', NOW() + INTERVAL '5 days', 25, 'Room B05'),
  ('ccccccc1-cccc-cccc-cccc-cccccccccc05', '11111111-1111-1111-1111-111111111303', '22222222-2222-2222-2222-222222222105', 'AI Assignment Q&A', 'Clarifications for model evaluation task.', NOW() + INTERVAL '6 days', 35, 'https://meet.example.com/ai-qna')
ON CONFLICT (id) DO NOTHING;

-- tutor_rating
INSERT INTO tutor_rating (id, student_id, tutor_id, rating, review, session_id)
VALUES
  ('ddddddd1-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111401', '11111111-1111-1111-1111-111111111301', 5, 'Very clear explanations and great pace.', 'ccccccc1-cccc-cccc-cccc-cccccccccc01'),
  ('ddddddd1-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111403', '11111111-1111-1111-1111-111111111301', 4, 'Useful examples for algorithm tracing.', 'ccccccc1-cccc-cccc-cccc-cccccccccc02'),
  ('ddddddd1-dddd-dddd-dddd-dddddddddd03', '11111111-1111-1111-1111-111111111402', '11111111-1111-1111-1111-111111111302', 5, 'SQL joins finally make sense now.', 'ccccccc1-cccc-cccc-cccc-cccccccccc03'),
  ('ddddddd1-dddd-dddd-dddd-dddddddddd04', '11111111-1111-1111-1111-111111111405', '11111111-1111-1111-1111-111111111303', 4, 'Good structure and actionable feedback.', 'ccccccc1-cccc-cccc-cccc-cccccccccc04'),
  ('ddddddd1-dddd-dddd-dddd-dddddddddd05', '11111111-1111-1111-1111-111111111406', '11111111-1111-1111-1111-111111111303', 5, 'Excellent Q&A with practical tips.', 'ccccccc1-cccc-cccc-cccc-cccccccccc05')
ON CONFLICT (id) DO NOTHING;

-- session_rsvp
INSERT INTO session_rsvp (id, session_id, student_id, rsvp_status, attended)
VALUES
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeee01', 'ccccccc1-cccc-cccc-cccc-cccccccccc01', '11111111-1111-1111-1111-111111111401', 'rsvpd', TRUE),
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeee02', 'ccccccc1-cccc-cccc-cccc-cccccccccc02', '11111111-1111-1111-1111-111111111403', 'rsvpd', FALSE),
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeee03', 'ccccccc1-cccc-cccc-cccc-cccccccccc03', '11111111-1111-1111-1111-111111111402', 'rsvpd', TRUE),
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeee04', 'ccccccc1-cccc-cccc-cccc-cccccccccc04', '11111111-1111-1111-1111-111111111405', 'cancelled', FALSE),
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeee05', 'ccccccc1-cccc-cccc-cccc-cccccccccc05', '11111111-1111-1111-1111-111111111406', 'rsvpd', FALSE)
ON CONFLICT (id) DO NOTHING;

-- password_reset_token
INSERT INTO password_reset_token (id, user_id, token, expires_at)
VALUES
  ('fffffff1-ffff-ffff-ffff-ffffffffff01', '11111111-1111-1111-1111-111111111401', 'reset-token-student1-001', NOW() + INTERVAL '30 minutes'),
  ('fffffff1-ffff-ffff-ffff-ffffffffff02', '11111111-1111-1111-1111-111111111402', 'reset-token-student2-001', NOW() + INTERVAL '45 minutes'),
  ('fffffff1-ffff-ffff-ffff-ffffffffff03', '11111111-1111-1111-1111-111111111201', 'reset-token-lecturer1-001', NOW() + INTERVAL '20 minutes'),
  ('fffffff1-ffff-ffff-ffff-ffffffffff04', '11111111-1111-1111-1111-111111111301', 'reset-token-mentor1-001', NOW() + INTERVAL '40 minutes'),
  ('fffffff1-ffff-ffff-ffff-ffffffffff05', '11111111-1111-1111-1111-111111111101', 'reset-token-admin2-001', NOW() + INTERVAL '35 minutes')
ON CONFLICT (id) DO NOTHING;

