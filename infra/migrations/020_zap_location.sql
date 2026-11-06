-- Fixed game positions shared in a Highzap conversation. Existing clients can read the body as a preview.
ALTER TABLE phone_messages ADD COLUMN IF NOT EXISTS location jsonb;
