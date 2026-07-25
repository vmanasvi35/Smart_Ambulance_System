-- Clean duplicate active assignments (keep earliest trip per emergency)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY emergency_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.ambulance_trips
  WHERE emergency_id IS NOT NULL
    AND status = ANY (ARRAY['pending'::text, 'in_progress'::text])
)
UPDATE public.ambulance_trips t
SET
  status = 'cancelled',
  updated_at = timezone('utc', now())
FROM ranked
WHERE t.id = ranked.id
  AND ranked.rn > 1;

-- Point emergencies at their remaining active trip (if any)
UPDATE public.emergency_requests e
SET
  status = 'assigned',
  assigned_trip_id = t.id,
  updated_at = timezone('utc', now())
FROM public.ambulance_trips t
WHERE t.emergency_id = e.id
  AND t.status = ANY (ARRAY['pending'::text, 'in_progress'::text])
  AND (e.assigned_trip_id IS DISTINCT FROM t.id OR e.status IS DISTINCT FROM 'assigned');

-- Ensure one emergency can only have one active ambulance assignment
CREATE UNIQUE INDEX IF NOT EXISTS ambulance_trips_one_active_per_emergency
  ON public.ambulance_trips (emergency_id)
  WHERE emergency_id IS NOT NULL
    AND status = ANY (ARRAY['pending'::text, 'in_progress'::text]);

-- Prevent one trip from being linked to multiple emergencies
CREATE UNIQUE INDEX IF NOT EXISTS emergency_requests_assigned_trip_unique
  ON public.emergency_requests (assigned_trip_id)
  WHERE assigned_trip_id IS NOT NULL;
