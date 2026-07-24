const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  const email = `testdriver_${Date.now()}@test.com`
  const password = 'TestPassword123!'

  console.log(`Signing up test user: ${email}...`)
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'driver',
        full_name: 'Test Driver',
      }
    }
  })

  if (signUpError) {
    console.error('Sign up error:', signUpError)
    return
  }

  const user = signUpData.user
  console.log('User signed up. ID:', user.id)

  // Ensure profile is created (sometimes handled by trigger, let's wait or insert manually if needed)
  console.log('Waiting 3 seconds for profile creation...')
  await new Promise(r => setTimeout(r, 3000))

  // Try to insert a trip using this driver's session
  console.log('Inserting trip as the driver...')
  const { data: tripData, error: tripError } = await supabase.from('ambulance_trips').insert({
    driver_id: user.id,
    ambulance_id: 'AMB-AUTH-TEST',
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
    console.error('Trip insert error:', tripError)
  } else {
    console.log('Trip insert SUCCESS!', tripData)
    // clean up
    await supabase.from('ambulance_trips').delete().eq('id', tripData[0].id)
  }

  // Clean up user (auth.admin.deleteUser is only available on service role, but we can leave the test user or ignore)
}

run()
