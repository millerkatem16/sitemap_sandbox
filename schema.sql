-- Run this once in your Vercel Postgres query console
-- (Dashboard → Storage → your DB → Query)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS venues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  city             TEXT,
  venue_data       JSONB       NOT NULL,
  pin_hash         TEXT        NOT NULL,
  preview_image_url TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
