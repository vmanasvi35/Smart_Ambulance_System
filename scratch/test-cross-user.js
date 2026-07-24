const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  const email1 = `testuser1_${Date.now()}@test.com`
  const email2 = `testuser2_${Date.now()}@test.com`
  const password = 'TestPassword123!'

  console.log('Signing up User 1...')
  const { data: u1 } = await supabase.auth.signUp({ email: email1, password })
  
  console.log('Signing up User 2...')
  const { data: u2 } = await supabase.auth.signUp({ email: email2, password })

  console.log(`User 1 ID: ${u1.user.id}, User 2 ID: ${u2.user.id}`)
  
  // Try to insert a trip where driver_id is User 2, but session is User 1
  console.log('Attempting cross-user insert...')
  const { data: tripData, error: tripError } = await supabase.from('ambulance_trips').insert({
    driver_id: u2.user.id,
    ambulance_id: 'AMB-CROSS-TEST',
    source: 'Koramangala',
    destination: 'Apollo Hospital',
    source_lat: 12.9352,
    source_lng: 77.6245,
    dest_lat: 12.9141,
    dest_lng: 77.5950,
    current_lat: 12.9352,
    current_lng: 77.6245,
    status: 'pending',
  }).select()

  if (tripError) {
    console.error('Cross-user insert failed:', tripError)
  } else {
    console.log('Cross-user insert SUCCESS!', tripData)
    await supabase.from('ambulance_trips').delete().eq('id', tripData[0].id)
  }
}

run()
