-- Freeze XP already earned from time connected, using the previous effective rate (60 XP/hour by default).
-- The original presence counter keeps progressing towards badges, but no longer contributes to XP.
INSERT INTO user_achievements (user_id, series, value)
SELECT user_id, 'presenca-xp-legado',
  floor(value::numeric * coalesce((SELECT value FROM economy_prices WHERE key = 'xp:frequentador'), 60) / 3600)::integer
FROM user_achievements
WHERE series = 'frequentador'
ON CONFLICT (user_id, series) DO NOTHING;

DELETE FROM economy_prices WHERE key = 'xp:frequentador';
