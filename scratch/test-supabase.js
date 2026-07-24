const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://fdhsrkefnpcpviaqmnaf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaHNya2VmbnBjcHZpYXFtbmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTg4NTIsImV4cCI6MjA5NDEzNDg1Mn0.Y0Vnah9Vf1_YvdQBj1JAA-U2qy47OmgbD4rVWArQt9Y'
)

async function run() {
  console.log('Testing insert with status "assigned"...')
  const { data, error } = await supabase.from('ambulance_trips').insert({
    driver_id: 'e6b8c9d0-1234-5678-abcd-ef0123456789', // arbitrary format or dummy uuid
    ambulance_id: 'AMB-TEST',
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
    console.error('Error inserting:', error)
  } else {
    console.log('Success! Data:', data)
    // clean up
    await supabase.from('ambulance_trips').delete().eq('id', data[0].id)
    console.log('Cleaned up successfully.')
  }
}

run()
