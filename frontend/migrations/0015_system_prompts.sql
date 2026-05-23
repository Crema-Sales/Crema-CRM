-- Optional system-prompt overlays for the rep's copilot.
--
-- The agent composes its system prompt as:
--   [Crema lead-in] → [org] → [coach overlay] → [user]
-- Org sets house style ("we sell to security teams; never promise a demo
-- in week one"). Per-user lets a rep add their own working preferences
-- ("answer in bullets," "I'm dyslexic — keep sentences short"). Both are
-- NULL by default and threaded into the JWT alongside coach_persona_slug
-- so the backend agent reads them as session claims, same as the coach.

ALTER TABLE organizations ADD COLUMN system_prompt TEXT;
ALTER TABLE users ADD COLUMN system_prompt TEXT;
