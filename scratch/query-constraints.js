const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  // Query pg_constraint for check constraints on ambulance_trips
  const { data, error } = await supabase.rpc('get_constraints')
  if (error) {
    console.log('RPC get_constraints not found, trying query...')
    
    // Since we cannot run raw SQL select on system catalogs due to RLS or permissions, 
    // let's try calling a common query or reading from schema if possible.
    // Let's try to query a system table if Postgres REST API allows it (usually it doesn't).
    const { data: catData, error: catError } = await supabase
      .from('pg_constraint')
      .select('*')
    
    console.log('System catalog query error:', catError)
    console.log('System catalog query data:', catData)
  } else {
    console.log('Constraints:', data)
  }
}

run()
