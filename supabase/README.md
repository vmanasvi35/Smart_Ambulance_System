# Supabase backend

## Apply the MVP sync migration

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor**
3. Paste and run:

`supabase/migrations/20260725150000_mvp_backend_sync.sql`

Or with the Supabase CLI (if linked):

```bash
supabase db push
```

## What this migration does

- Adds `dispatcher` to `profiles.role` check + auth signup trigger
- Adds missing profile fields (`updated_at`, driver/police metadata)
- Creates `emergency_requests`, `ambulances`, `notifications`, `activity_logs`
- Fixes RLS so dispatchers can assign trips and drivers can create police alerts
- Blocks police from changing dispatch assignment fields
- Enables realtime on operational tables
- Soft-cleans obvious `@test.com` / `@example.com` audit profiles without trips

## After applying

1. Sign up a **Dispatcher** account via `/auth/signup`
2. Confirm login redirects to `/dispatch`
3. Create an emergency and assign a real driver — trip + activity log should appear live

Also apply (if not already):

- `supabase/migrations/20260725153000_emergency_template_fields.sql`  
  Adds `incident_id`, `age`, `eta`, and `distance` for template-driven emergency creation.
- `supabase/migrations/20260725154500_one_ambulance_per_emergency.sql`  
  Enforces one active ambulance trip per emergency.
