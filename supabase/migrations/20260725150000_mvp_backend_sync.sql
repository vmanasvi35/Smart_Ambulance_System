-- =============================================================================
-- Smart Ambulance Clearance System — MVP Backend Sync
-- Idempotent migration: safe to re-run.
-- Apply via Supabase SQL Editor or: supabase db push
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: current user's role (SECURITY DEFINER avoids RLS recursion)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Profiles: support dispatcher + optional fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS hospital text,
  ADD COLUMN IF NOT EXISTS experience_years integer,
  ADD COLUMN IF NOT EXISTS driving_license text,
  ADD COLUMN IF NOT EXISTS police_id text,
  ADD COLUMN IF NOT EXISTS police_station text,
  ADD COLUMN IF NOT EXISTS badge_number text;

-- Expand role check to include dispatcher
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'profiles'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%role%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['driver'::text, 'police'::text, 'dispatcher'::text]));
END $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auth signup trigger: create profile for every new user (incl. dispatcher)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role text;
BEGIN
  selected_role := COALESCE(NEW.raw_user_meta_data->>'role', 'driver');

  IF selected_role NOT IN ('driver', 'police', 'dispatcher') THEN
    selected_role := 'driver';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    age,
    hospital,
    experience_years,
    driving_license,
    police_id,
    police_station,
    badge_number,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'User'),
    COALESCE(NEW.email, ''),
    selected_role,
    NULLIF(NEW.raw_user_meta_data->>'age', '')::integer,
    NEW.raw_user_meta_data->>'hospital',
    NULLIF(NEW.raw_user_meta_data->>'experience_years', '')::integer,
    NEW.raw_user_meta_data->>'driving_license',
    NEW.raw_user_meta_data->>'police_id',
    NEW.raw_user_meta_data->>'police_station',
    NEW.raw_user_meta_data->>'badge_number',
    timezone('utc', now()),
    timezone('utc', now())
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    age = COALESCE(EXCLUDED.age, public.profiles.age),
    hospital = COALESCE(EXCLUDED.hospital, public.profiles.hospital),
    experience_years = COALESCE(EXCLUDED.experience_years, public.profiles.experience_years),
    driving_license = COALESCE(EXCLUDED.driving_license, public.profiles.driving_license),
    police_id = COALESCE(EXCLUDED.police_id, public.profiles.police_id),
    police_station = COALESCE(EXCLUDED.police_station, public.profiles.police_station),
    badge_number = COALESCE(EXCLUDED.badge_number, public.profiles.badge_number),
    updated_at = timezone('utc', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. Ambulances registry (optional fleet table; trips.ambulance_id remains source of truth for active ops)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ambulances (
  id text PRIMARY KEY,
  unit_number text,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available'
    CHECK (status = ANY (ARRAY['available'::text, 'assigned'::text, 'en_route'::text, 'offline'::text])),
  current_lat double precision,
  current_lng double precision,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ambulances_driver_id_idx ON public.ambulances(driver_id);

DROP TRIGGER IF EXISTS ambulances_set_updated_at ON public.ambulances;
CREATE TRIGGER ambulances_set_updated_at
  BEFORE UPDATE ON public.ambulances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Emergency requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_location text NOT NULL,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_hospital text NOT NULL,
  dest_lat double precision,
  dest_lng double precision,
  priority text NOT NULL DEFAULT 'critical'
    CHECK (priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'cancelled'::text, 'completed'::text])),
  patient_name text,
  notes text,
  emergency_type text,
  assigned_trip_id uuid REFERENCES public.ambulance_trips(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS emergency_requests_status_idx ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS emergency_requests_created_at_idx ON public.emergency_requests(created_at DESC);

DROP TRIGGER IF EXISTS emergency_requests_set_updated_at ON public.emergency_requests;
CREATE TRIGGER emergency_requests_set_updated_at
  BEFORE UPDATE ON public.emergency_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link trips back to emergencies when column missing
ALTER TABLE public.ambulance_trips
  ADD COLUMN IF NOT EXISTS emergency_id uuid REFERENCES public.emergency_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ambulance_trips_emergency_id_idx ON public.ambulance_trips(emergency_id);
CREATE INDEX IF NOT EXISTS ambulance_trips_driver_id_idx ON public.ambulance_trips(driver_id);
CREATE INDEX IF NOT EXISTS ambulance_trips_status_idx ON public.ambulance_trips(status);

-- -----------------------------------------------------------------------------
-- 5. Notifications (persisted; broadcast remains for live toasts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.ambulance_trips(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS notifications_recipient_id_idx ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Activity logs (feeds Recent Activity timelines)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  message text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES public.ambulance_trips(id) ON DELETE SET NULL,
  emergency_id uuid REFERENCES public.emergency_requests(id) ON DELETE SET NULL,
  ambulance_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_trip_id_idx ON public.activity_logs(trip_id);

CREATE OR REPLACE FUNCTION public.write_activity_log(
  p_event_type text,
  p_message text,
  p_actor_id uuid DEFAULT NULL,
  p_trip_id uuid DEFAULT NULL,
  p_emergency_id uuid DEFAULT NULL,
  p_ambulance_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (
    event_type, message, actor_id, trip_id, emergency_id, ambulance_id, metadata
  ) VALUES (
    p_event_type, p_message, p_actor_id, p_trip_id, p_emergency_id, p_ambulance_id, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_activity_log(text, text, uuid, uuid, uuid, text, jsonb) TO authenticated;

-- Emergency created
CREATE OR REPLACE FUNCTION public.log_emergency_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_activity_log(
    'emergency_created',
    format('Emergency created at %s → %s', NEW.pickup_location, NEW.destination_hospital),
    COALESCE(NEW.created_by, auth.uid()),
    NULL,
    NEW.id,
    NULL,
    jsonb_build_object('priority', NEW.priority, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_emergency_created ON public.emergency_requests;
CREATE TRIGGER trg_log_emergency_created
  AFTER INSERT ON public.emergency_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_emergency_created();

-- Trip lifecycle + clearance activity
CREATE OR REPLACE FUNCTION public.log_trip_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_workflow text;
  new_workflow text;
  old_clearance text;
  new_clearance text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_log(
      'ambulance_assigned',
      format('Ambulance %s assigned (%s → %s)', NEW.ambulance_id, NEW.source, NEW.destination),
      auth.uid(),
      NEW.id,
      NEW.emergency_id,
      NEW.ambulance_id,
      jsonb_build_object('status', NEW.status)
    );

    INSERT INTO public.ambulances (id, unit_number, driver_id, status, current_lat, current_lng)
    VALUES (
      NEW.ambulance_id,
      NEW.ambulance_id,
      NEW.driver_id,
      'assigned',
      NEW.current_lat,
      NEW.current_lng
    )
    ON CONFLICT (id) DO UPDATE SET
      driver_id = EXCLUDED.driver_id,
      status = 'assigned',
      current_lat = EXCLUDED.current_lat,
      current_lng = EXCLUDED.current_lng,
      updated_at = timezone('utc', now());

    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, trip_id, event_type, title, message, payload)
      VALUES (
        NEW.driver_id,
        NEW.id,
        'dispatch_assigned',
        'New Dispatch Assignment',
        format('Assigned: %s → %s', NEW.source, NEW.destination),
        jsonb_build_object('ambulanceId', NEW.ambulance_id, 'pickup', NEW.source, 'destination', NEW.destination)
      );
    END IF;

    RETURN NEW;
  END IF;

  old_workflow := COALESCE(OLD.route_data->>'status', '');
  new_workflow := COALESCE(NEW.route_data->>'status', '');
  old_clearance := COALESCE(OLD.route_data->>'clearanceStatus', '');
  new_clearance := COALESCE(NEW.route_data->>'clearanceStatus', '');

  IF old_workflow IS DISTINCT FROM new_workflow THEN
    IF new_workflow ILIKE 'Accepted' THEN
      PERFORM public.write_activity_log('driver_accepted', format('Driver accepted assignment for %s', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    ELSIF new_workflow ILIKE 'Going to Pickup' THEN
      PERFORM public.write_activity_log('going_to_pickup', format('Ambulance %s going to pickup', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    ELSIF new_workflow ILIKE 'Patient Onboard' THEN
      PERFORM public.write_activity_log('patient_onboard', format('Patient onboard %s', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    ELSIF new_workflow ILIKE 'En Route Hospital' THEN
      PERFORM public.write_activity_log('en_route_hospital', format('Ambulance %s en route to hospital', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    ELSIF new_workflow ILIKE 'Completed' THEN
      PERFORM public.write_activity_log('trip_completed', format('Ambulance %s reached hospital', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    END IF;
  END IF;

  IF old_clearance IS DISTINCT FROM new_clearance THEN
    IF new_clearance = 'clearing' THEN
      PERFORM public.write_activity_log('traffic_clearing_started', format('Traffic clearing started for %s', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    ELSIF new_clearance = 'cleared' THEN
      PERFORM public.write_activity_log('traffic_cleared', format('Traffic cleared for %s', NEW.ambulance_id), auth.uid(), NEW.id, NEW.emergency_id, NEW.ambulance_id, '{}'::jsonb);
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    PERFORM public.write_activity_log(
      'trip_completed',
      format('Ambulance %s trip completed at %s', NEW.ambulance_id, NEW.destination),
      auth.uid(),
      NEW.id,
      NEW.emergency_id,
      NEW.ambulance_id,
      '{}'::jsonb
    );

    UPDATE public.ambulances
    SET status = 'available', updated_at = timezone('utc', now())
    WHERE id = NEW.ambulance_id;
  END IF;

  -- Keep ambulance GPS registry in sync when driver updates location
  IF NEW.current_lat IS DISTINCT FROM OLD.current_lat
     OR NEW.current_lng IS DISTINCT FROM OLD.current_lng THEN
    UPDATE public.ambulances
    SET current_lat = NEW.current_lat,
        current_lng = NEW.current_lng,
        updated_at = timezone('utc', now())
    WHERE id = NEW.ambulance_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_trip_activity ON public.ambulance_trips;
CREATE TRIGGER trg_log_trip_activity
  AFTER INSERT OR UPDATE ON public.ambulance_trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_activity();

-- Prevent police from changing dispatch assignment fields
CREATE OR REPLACE FUNCTION public.enforce_trip_role_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role text := public.current_user_role();
BEGIN
  IF role = 'police' THEN
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.ambulance_id IS DISTINCT FROM OLD.ambulance_id
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.emergency_id IS DISTINCT FROM OLD.emergency_id THEN
      RAISE EXCEPTION 'Police cannot modify dispatch assignments';
    END IF;
  END IF;

  IF role = 'driver' AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    RAISE EXCEPTION 'Drivers cannot reassign trips';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_trip_role_guards ON public.ambulance_trips;
CREATE TRIGGER trg_enforce_trip_role_guards
  BEFORE UPDATE ON public.ambulance_trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_role_guards();

-- -----------------------------------------------------------------------------
-- 7. RLS policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Police can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Dispatchers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_user_role() IN ('police', 'dispatcher')
  );

CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'dispatcher')
  WITH CHECK (id = auth.uid() OR public.current_user_role() = 'dispatcher');

-- Ambulance trips
DROP POLICY IF EXISTS "Drivers manage own trips" ON public.ambulance_trips;
DROP POLICY IF EXISTS "Police can view all trips" ON public.ambulance_trips;
DROP POLICY IF EXISTS "Police can update trips" ON public.ambulance_trips;
DROP POLICY IF EXISTS "trips_select_policy" ON public.ambulance_trips;
DROP POLICY IF EXISTS "trips_insert_policy" ON public.ambulance_trips;
DROP POLICY IF EXISTS "trips_update_policy" ON public.ambulance_trips;
DROP POLICY IF EXISTS "trips_delete_policy" ON public.ambulance_trips;

CREATE POLICY trips_select_policy ON public.ambulance_trips
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.current_user_role() IN ('police', 'dispatcher')
  );

CREATE POLICY trips_insert_policy ON public.ambulance_trips
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    OR public.current_user_role() = 'dispatcher'
  );

CREATE POLICY trips_update_policy ON public.ambulance_trips
  FOR UPDATE TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.current_user_role() IN ('police', 'dispatcher')
  )
  WITH CHECK (
    driver_id = auth.uid()
    OR public.current_user_role() IN ('police', 'dispatcher')
  );

CREATE POLICY trips_delete_policy ON public.ambulance_trips
  FOR DELETE TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.current_user_role() = 'dispatcher'
  );

-- Police alerts
DROP POLICY IF EXISTS "Police manage alerts" ON public.police_alerts;
DROP POLICY IF EXISTS "alerts_select_policy" ON public.police_alerts;
DROP POLICY IF EXISTS "alerts_insert_policy" ON public.police_alerts;
DROP POLICY IF EXISTS "alerts_update_policy" ON public.police_alerts;
DROP POLICY IF EXISTS "alerts_delete_policy" ON public.police_alerts;

CREATE POLICY alerts_select_policy ON public.police_alerts
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('police', 'dispatcher')
    OR EXISTS (
      SELECT 1 FROM public.ambulance_trips t
      WHERE t.id = police_alerts.trip_id AND t.driver_id = auth.uid()
    )
  );

CREATE POLICY alerts_insert_policy ON public.police_alerts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('police', 'dispatcher')
    OR EXISTS (
      SELECT 1 FROM public.ambulance_trips t
      WHERE t.id = trip_id AND t.driver_id = auth.uid()
    )
  );

CREATE POLICY alerts_update_policy ON public.police_alerts
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('police', 'dispatcher'))
  WITH CHECK (public.current_user_role() IN ('police', 'dispatcher'));

CREATE POLICY alerts_delete_policy ON public.police_alerts
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('police', 'dispatcher'));

-- Emergency requests
DROP POLICY IF EXISTS "emergencies_select_policy" ON public.emergency_requests;
DROP POLICY IF EXISTS "emergencies_insert_policy" ON public.emergency_requests;
DROP POLICY IF EXISTS "emergencies_update_policy" ON public.emergency_requests;
DROP POLICY IF EXISTS "emergencies_delete_policy" ON public.emergency_requests;

CREATE POLICY emergencies_select_policy ON public.emergency_requests
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('dispatcher', 'police', 'driver'));

CREATE POLICY emergencies_insert_policy ON public.emergency_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'dispatcher');

CREATE POLICY emergencies_update_policy ON public.emergency_requests
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'dispatcher')
  WITH CHECK (public.current_user_role() = 'dispatcher');

CREATE POLICY emergencies_delete_policy ON public.emergency_requests
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'dispatcher');

-- Ambulances
DROP POLICY IF EXISTS "ambulances_select_policy" ON public.ambulances;
DROP POLICY IF EXISTS "ambulances_write_policy" ON public.ambulances;

CREATE POLICY ambulances_select_policy ON public.ambulances
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ambulances_write_policy ON public.ambulances
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('dispatcher', 'police', 'driver'))
  WITH CHECK (public.current_user_role() IN ('dispatcher', 'police', 'driver'));

-- Notifications
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;

CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.current_user_role() IN ('dispatcher', 'police')
  );

CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('dispatcher', 'police', 'driver')
  );

CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR public.current_user_role() = 'dispatcher')
  WITH CHECK (recipient_id = auth.uid() OR public.current_user_role() = 'dispatcher');

-- Activity logs
DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_policy" ON public.activity_logs;

CREATE POLICY activity_logs_select_policy ON public.activity_logs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY activity_logs_insert_policy ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 8. Realtime publication
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ambulance_trips;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.police_alerts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ambulances;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 9. Optional cleanup of obvious audit/test profile rows (keeps real accounts)
-- Does NOT delete auth.users — run optional auth cleanup in dashboard if desired.
-- -----------------------------------------------------------------------------
DELETE FROM public.profiles p
WHERE (
    p.email LIKE '%@example.com'
    OR p.email LIKE '%@test.com'
    OR p.email LIKE 'testdriver_%@%'
    OR p.email LIKE 'testuser%@%'
    OR p.email LIKE 'querydriver_%@%'
    OR p.email LIKE 'test_assigned_%@%'
    OR p.email LIKE 'audit_%@%'
    OR p.email LIKE 'driver_audit_%@%'
    OR p.email LIKE 'police_audit_%@%'
    OR p.email LIKE 'driver_schema_%@%'
    OR p.email LIKE 'police_schema_%@%'
    OR p.email LIKE 'drvA%@%'
    OR p.email LIKE 'drvB%@%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.ambulance_trips t WHERE t.driver_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.police_alerts a WHERE a.assigned_police = p.id
  );

-- NOTE: Matching auth.users rows may remain until removed in the Auth admin UI
-- (or via service-role SQL). Production Gmail accounts are not touched.
