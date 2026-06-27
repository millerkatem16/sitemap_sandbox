-- Run this once in your Vercel Postgres query console
-- (Dashboard → Storage → your DB → Query)
-- Can be run independently of schema.sql (no dependency on the venues table)

-- Users who can own or access events.
-- pin_hash is nullable: invited users get a placeholder row with pin_hash=NULL
-- and set their PIN the first time they log in.
CREATE TABLE IF NOT EXISTS users (
  email      TEXT        PRIMARY KEY,
  pin_hash   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saved events owned by a user.
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL,
  owner_email TEXT        NOT NULL REFERENCES users(email),
  created_at  TIMESTAMPTZ DEFAULT now(),
  data        JSONB       NOT NULL,
  edit_log    JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- Additional users granted access to an event (beyond the owner).
CREATE TABLE IF NOT EXISTS event_access (
  event_id    INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_email  TEXT        NOT NULL REFERENCES users(email),
  granted_at  TIMESTAMPTZ DEFAULT now(),
  granted_by  TEXT        NOT NULL,
  PRIMARY KEY (event_id, user_email)
);

-- Admin accounts (password-protected, not PIN-based).
CREATE TABLE IF NOT EXISTS admins (
  email         TEXT        PRIMARY KEY,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Verify: run these to confirm all four tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('users', 'events', 'event_access', 'admins');
