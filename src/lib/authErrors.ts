import type { AuthError } from 'firebase/auth'

export function formatAuthError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err
    ? String((err as AuthError).code)
    : ''

  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Sign in instead.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
      return 'No account found for this email.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in was closed before finishing.'
    case 'auth/account-exists-with-different-credential':
      return 'This email is already used with a different sign-in method. Use the original method.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is disabled in Firebase. Enable Email/Password and Google in the console.'
    case 'auth/credential-already-in-use':
      return 'This Google account is already linked to another user. Try a different Google account.'
    case 'auth/provider-already-linked':
      return 'Google is already connected to this account.'
    case 'auth/requires-recent-login':
      return 'For security, sign out, sign in again, and then try linking.'
    case 'auth/email-change-needs-verification':
      return 'Check your email to confirm this change.'
    default:
      if (err instanceof Error && err.message) return err.message
      return 'Something went wrong. Please try again.'
  }
}
