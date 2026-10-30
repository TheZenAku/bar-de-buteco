-- The phone's social side (apps/api/src/phone-service.ts): Highgram profiles (handle, name, bio, photo) and follows,
-- and Highzap attachments (photos, voice notes and videos) kept apart from the messages that carry them.
CREATE TABLE IF NOT EXISTS gram_profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE CHECK(handle ~ '^[a-z0-9._]{3,24}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  bio text NOT NULL DEFAULT '' CHECK(length(bio) <= 150),
  photo text,
  photo_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gram_follows (
  follower_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(follower_id,followed_id),
  CHECK(follower_id<>followed_id)
);
CREATE INDEX IF NOT EXISTS gram_follows_followed_idx ON gram_follows(followed_id,created_at DESC);
CREATE TABLE IF NOT EXISTS phone_media (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('photo','audio','video')),
  mime text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL CHECK(size > 0),
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_media_owner_idx ON phone_media(owner_id,created_at);
-- The kind stays on the message when the file is gone, so the conversation still says what was sent.
ALTER TABLE phone_messages ADD COLUMN IF NOT EXISTS media_id text REFERENCES phone_media(id) ON DELETE SET NULL;
ALTER TABLE phone_messages ADD COLUMN IF NOT EXISTS media_kind text CHECK(media_kind IN ('photo','audio','video'));
ALTER TABLE phone_messages ADD COLUMN IF NOT EXISTS media_ms integer;
-- A message with an attachment may have no text.
ALTER TABLE phone_messages DROP CONSTRAINT IF EXISTS phone_messages_body_check;
ALTER TABLE phone_messages DROP CONSTRAINT IF EXISTS phone_messages_body_media_check;
ALTER TABLE phone_messages ADD CONSTRAINT phone_messages_body_media_check CHECK(length(body) <= 500 AND (length(body) >= 1 OR media_kind IS NOT NULL));
