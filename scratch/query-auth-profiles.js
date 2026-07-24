const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  // Try to sign in with one of the test emails we generated
  // Since we don't know the exact timestamp in the file, we can look up the user by signing up or we can sign up and then sign in.
  const email = `querydriver_${Date.now()}@test.com`
  const password = 'TestPassword123!'

  await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'driver',
        full_name: 'Query Driver',
      }
    }
  })

  // Sign in
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (signInError) {
    console.error('Sign in error:', signInError)
    return
  }

  console.log('Logged in as:', signInData.user.email)

  // Query profiles now that we are authenticated
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) {
    console.error('Error querying profiles:', error)
  } else {
    console.log('Profiles returned when authenticated:', data)
  }
}

run()
