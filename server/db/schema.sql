-- Settings table (global config)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Admin users
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- Parent users
CREATE TABLE IF NOT EXISTS parents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  phone         TEXT    DEFAULT '',
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- Student users
CREATE TABLE IF NOT EXISTS students (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT    UNIQUE NOT NULL,
  display_name     TEXT    NOT NULL DEFAULT '',
  password_hash    TEXT    NOT NULL,
  grade            INTEGER NOT NULL DEFAULT 3 CHECK(grade BETWEEN 3 AND 6),
  textbook_version TEXT    NOT NULL DEFAULT '人教版',
  parent_id        INTEGER REFERENCES parents(id) ON DELETE SET NULL,
  daily_limit      INTEGER DEFAULT NULL,
  created_at       TEXT    DEFAULT (datetime('now'))
);

-- Word lists (organized by textbook/grade/unit)
CREATE TABLE IF NOT EXISTS word_lists (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  textbook_version TEXT    NOT NULL,
  grade            INTEGER NOT NULL,
  unit             INTEGER NOT NULL,
  unit_title       TEXT    NOT NULL DEFAULT '',
  UNIQUE(textbook_version, grade, unit)
);

-- Individual words
CREATE TABLE IF NOT EXISTS words (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  word_list_id INTEGER NOT NULL REFERENCES word_lists(id) ON DELETE CASCADE,
  word         TEXT    NOT NULL,
  pinyin       TEXT    NOT NULL DEFAULT '',
  audio_file   TEXT    DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

-- Dictation results
CREATE TABLE IF NOT EXISTS dictation_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word_list_id INTEGER NOT NULL REFERENCES word_lists(id),
  total_words  INTEGER NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    DEFAULT (datetime('now'))
);

-- Mistake book
CREATE TABLE IF NOT EXISTS mistakes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word          TEXT    NOT NULL,
  pinyin        TEXT    NOT NULL DEFAULT '',
  mistake_type  TEXT    NOT NULL DEFAULT 'unknown',
  mistake_count INTEGER NOT NULL DEFAULT 1,
  last_tested   TEXT    DEFAULT (datetime('now')),
  next_review   TEXT    DEFAULT (datetime('now')),
  mastered      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(student_id, word)
);

-- Recitation records
CREATE TABLE IF NOT EXISTS recitation_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text_title     TEXT    NOT NULL,
  original_text  TEXT    NOT NULL,
  recognized     TEXT    DEFAULT '',
  accuracy       REAL    NOT NULL DEFAULT 0,
  fluency        REAL    NOT NULL DEFAULT 0,
  completeness   REAL    NOT NULL DEFAULT 0,
  total_score    REAL    NOT NULL DEFAULT 0,
  details_json   TEXT    DEFAULT '{}',
  duration_sec   INTEGER NOT NULL DEFAULT 0,
  used_hints     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- Writing sessions
CREATE TABLE IF NOT EXISTS writing_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic          TEXT    NOT NULL,
  topic_type     TEXT    NOT NULL DEFAULT '记事',
  phase          TEXT    NOT NULL DEFAULT 'inspire',
  outline_json   TEXT    DEFAULT '{}',
  draft_text     TEXT    DEFAULT '',
  feedback_json  TEXT    DEFAULT '{}',
  word_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

-- Daily usage tracking (for anti-addiction)
CREATE TABLE IF NOT EXISTS usage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  minutes     REAL    NOT NULL DEFAULT 0,
  UNIQUE(student_id, date)
);

-- Recitation texts (course texts for recitation)
CREATE TABLE IF NOT EXISTS recitation_texts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  textbook_version TEXT    NOT NULL,
  grade            INTEGER NOT NULL,
  unit             INTEGER NOT NULL,
  title            TEXT    NOT NULL,
  content          TEXT    NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

-- Invitation codes (lookup_key = SHA-256 hex of normalized code; code_hash = bcrypt)
CREATE TABLE IF NOT EXISTS invitation_codes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  lookup_key         TEXT    NOT NULL UNIQUE,
  code_hash          TEXT    NOT NULL,
  note               TEXT    DEFAULT '',
  max_uses           INTEGER NOT NULL DEFAULT 1 CHECK(max_uses >= 1),
  used_count         INTEGER NOT NULL DEFAULT 0 CHECK(used_count >= 0),
  created_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  expires_at         TEXT,
  created_at         TEXT    DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_parent ON students(parent_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_student ON mistakes(student_id, mastered);
CREATE INDEX IF NOT EXISTS idx_dictation_student ON dictation_records(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recitation_student ON recitation_records(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_writing_student ON writing_sessions(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_student_date ON usage_log(student_id, date);
