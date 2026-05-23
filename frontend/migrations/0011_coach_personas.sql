-- Optional per-user coach persona. Reps can pick a sales-coach archetype
-- (Andy Elliott, Chris Voss, Tony Robbins, etc.) during onboarding and
-- the copilot adopts that voice. The catalog itself lives in app code
-- (frontend/src/lib/coach-personas.ts + backend mirror); this
-- column just stores which slug the user picked. NULL = no coach picked
-- (or "Skip" during onboarding).

ALTER TABLE users ADD COLUMN coach_persona_slug TEXT;
