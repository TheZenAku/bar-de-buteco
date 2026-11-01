-- PNGs sent in the administration to serve as a badge's icon (apps/api/src/profile-service.ts). The id is the file's SHA-256.
CREATE TABLE IF NOT EXISTS badge_images (
  id text PRIMARY KEY CHECK(length(id)=64),
  bytes bytea NOT NULL,
  size integer NOT NULL CHECK(size>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE badges ADD COLUMN IF NOT EXISTS image_id text REFERENCES badge_images(id) ON DELETE SET NULL;
