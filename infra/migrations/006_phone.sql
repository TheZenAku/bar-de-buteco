-- The in-game phone (apps/api/src/phone-service.ts): a number per account, saved contacts, Highzap messages and
-- Highgram posts, likes and comments. Pix transfers use currency_ledger (reasons pix:out:<peer> and pix:in:<peer>).
CREATE TABLE IF NOT EXISTS phone_lines (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  number text NOT NULL UNIQUE CHECK(number ~ '^9[0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phone_contacts (
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,contact_id),
  CHECK(owner_id<>contact_id)
);
CREATE TABLE IF NOT EXISTS phone_messages (
  id text PRIMARY KEY,
  sender_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK(sender_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS phone_messages_pair_idx ON phone_messages(sender_id,recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS phone_messages_unread_idx ON phone_messages(recipient_id,read_at);
CREATE TABLE IF NOT EXISTS gram_posts (
  id text PRIMARY KEY,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '' CHECK(length(caption) <= 200),
  image text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gram_posts_created_idx ON gram_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS gram_posts_author_idx ON gram_posts(author_id,created_at DESC);
CREATE TABLE IF NOT EXISTS gram_likes (
  post_id text NOT NULL REFERENCES gram_posts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS gram_comments (
  id text PRIMARY KEY,
  post_id text NOT NULL REFERENCES gram_posts(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gram_comments_post_idx ON gram_comments(post_id,created_at);
