const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  const email = `test_assigned_${Date.now()}@test.com`
  const password = 'TestPassword123!'

  console.log('Signing up...')
  const { data: u } = await supabase.auth.signUp({ email, password })

  console.log('Inserting with status "assigned"...')
  const { data, error } = await supabase.from('ambulance_trips').insert({
    driver_id: u.user.id,
    ambulance_id: 'AMB-ASSIGNED-TEST',
    source: 'Koramangala',
    destination: 'Apollo Hospital',
    source_lat: 12.9352,
    source_lng: 77.6245,
    dest_lat: 12.9141,
    dest_lng: 77.5950,
    current_lat: 12.9352,
    current_lng: 77.6245,
    status: 'assigned',
  }).select()

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Success!', data)
    await supabase.from('ambulance_trips').delete().eq('id', data[0].id)
  }
}

run()
