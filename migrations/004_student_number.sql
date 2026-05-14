-- ============================================================
-- Student Sphere — Migration 004: Student numbers
-- Run AFTER 001_initial.sql
-- Format: YY (last 2 digits of enrolment year) + 7 random digits
-- e.g. 262011173  →  26=2026, 2011173=random 7 digits
-- ============================================================

-- 1. Add column
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS student_number VARCHAR(20);

-- 2. Unique index (only over non-null, non-deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_student_number
  ON "user"(student_number)
  WHERE student_number IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Helper function: generate a unique student number
--    Keeps re-rolling until no collision is found (practically
--    never needs more than one iteration at realistic scales).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_student_number(enrol_year INT)
RETURNS VARCHAR(20) AS $$
DECLARE
  year_part  TEXT;
  rand_part  TEXT;
  candidate  TEXT;
BEGIN
  year_part := LPAD((enrol_year % 100)::TEXT, 2, '0');
  LOOP
    -- 7-digit zero-padded random number (0000000 – 9999999)
    rand_part := LPAD((floor(random() * 10000000))::BIGINT::TEXT, 7, '0');
    candidate := year_part || rand_part;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM "user" WHERE student_number = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger function: fires BEFORE INSERT on "user"
--    Only assigns a number when role = 'student' and none set.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_assign_student_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' AND (NEW.student_number IS NULL OR NEW.student_number = '') THEN
    NEW.student_number := generate_student_number(
      EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::INT
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach trigger (idempotent)
DROP TRIGGER IF EXISTS assign_student_number ON "user";
CREATE TRIGGER assign_student_number
  BEFORE INSERT ON "user"
  FOR EACH ROW EXECUTE FUNCTION trg_assign_student_number();

-- ─────────────────────────────────────────────────────────────
-- 6. Backfill: assign numbers to all existing students that
--    don't have one yet
-- ─────────────────────────────────────────────────────────────
UPDATE "user"
SET    student_number = generate_student_number(
                          EXTRACT(YEAR FROM created_at)::INT
                        )
WHERE  role          = 'student'
  AND  student_number IS NULL
  AND  deleted_at    IS NULL;
