-- ============================================================
-- Student Sphere — Migration 003: Class Tests
-- Run AFTER 001_initial.sql
-- ============================================================

-- ── class_test ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_test (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id           UUID         NOT NULL REFERENCES module(id)    ON DELETE CASCADE,
  pdf_note_id         UUID         NOT NULL REFERENCES pdf_note(id)  ON DELETE CASCADE,
  created_by_user_id  UUID         NOT NULL REFERENCES "user"(id)   ON DELETE CASCADE,
  title               VARCHAR(255) NOT NULL,
  total_marks         NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (total_marks > 0),
  test_date           DATE,
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_test_module  ON class_test(module_id);
CREATE INDEX IF NOT EXISTS idx_class_test_pdf     ON class_test(pdf_note_id);
CREATE INDEX IF NOT EXISTS idx_class_test_creator ON class_test(created_by_user_id);

-- ── class_test_mark ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_test_mark (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  class_test_id  UUID         NOT NULL REFERENCES class_test(id) ON DELETE CASCADE,
  student_id     UUID         NOT NULL REFERENCES "user"(id)     ON DELETE CASCADE,
  marks_obtained NUMERIC(6,2) NOT NULL CHECK (marks_obtained >= 0),
  recorded_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(class_test_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_test_mark_test    ON class_test_mark(class_test_id);
CREATE INDEX IF NOT EXISTS idx_class_test_mark_student ON class_test_mark(student_id);
