-- Vínculos empregatícios persistentes. Expansiva e reexecutável.
CREATE TABLE IF NOT EXISTS employments (
  user_id text PRIMARY KEY,
  job_id text NOT NULL,
  status text NOT NULL DEFAULT 'hired',
  hired_at timestamptz NOT NULL DEFAULT now(),
  resigned_at timestamptz,
  cooldown_until timestamptz,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employments_status CHECK (status IN ('hired','resigned','dismissed'))
);
CREATE INDEX IF NOT EXISTS employments_job_status_idx ON employments (job_id,status);

CREATE TABLE IF NOT EXISTS employment_shifts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  job_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  earned integer NOT NULL DEFAULT 0,
  station text NOT NULL DEFAULT '',
  request_id text NOT NULL UNIQUE,
  CONSTRAINT employment_shift_earned CHECK (earned >= 0)
);
CREATE INDEX IF NOT EXISTS employment_shifts_user_started_idx ON employment_shifts (user_id,started_at DESC);

CREATE TABLE IF NOT EXISTS employment_events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  job_id text NOT NULL,
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employment_events_user_created_idx ON employment_events (user_id,created_at DESC);
