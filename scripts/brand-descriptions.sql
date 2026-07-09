-- Replace supplier name in stored game/offer descriptions (one-time white-label cleanup).
UPDATE public.games
SET
  description_en = regexp_replace(description_en, '\mG2\s*Bulk\M', 'EchoCore', 'gi'),
  description_ar = regexp_replace(description_ar, '\mG2\s*Bulk\M', 'EchoCore', 'gi')
WHERE description_en ~* 'g2\s*bulk' OR description_ar ~* 'g2\s*bulk';

UPDATE public.offers
SET
  description_en = regexp_replace(description_en, '\mG2\s*Bulk\M', 'EchoCore', 'gi'),
  description_ar = regexp_replace(description_ar, '\mG2\s*Bulk\M', 'EchoCore', 'gi')
WHERE description_en ~* 'g2\s*bulk' OR description_ar ~* 'g2\s*bulk';