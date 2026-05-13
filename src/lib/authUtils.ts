import type { User } from 'firebase/auth'

export function usesPasswordProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password')
}

export function usesGoogleProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'google.com')
}

/** Google accounts are pre-verified; email/password users need Firebase `emailVerified`. */
export function canAccessApp(user: User | null): boolean {
  if (!user) return false
  if (usesPasswordProvider(user) && !user.emailVerified) return false
  return true
}
