-- Extend emergency_requests for template-driven creation fields
ALTER TABLE public.emergency_requests
  ADD COLUMN IF NOT EXISTS incident_id text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS eta integer,
  ADD COLUMN IF NOT EXISTS distance double precision;

CREATE UNIQUE INDEX IF NOT EXISTS emergency_requests_incident_id_key
  ON public.emergency_requests (incident_id)
  WHERE incident_id IS NOT NULL;
