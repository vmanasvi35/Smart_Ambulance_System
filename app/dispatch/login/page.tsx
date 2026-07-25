import { redirect } from 'next/navigation'

/** Legacy route — dispatch now uses shared /auth/login and /auth/signup. */
export default function DispatcherLoginRedirect() {
  redirect('/auth/login')
}
