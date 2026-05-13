import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'
import { usesGoogleProvider, usesPasswordProvider } from './authUtils'
import { ensureUserProfile } from './userProfile'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export type SignInMethodsHint = { hasPassword: boolean; hasGoogle: boolean }

export async function getSignInMethodsForEmail(email: string): Promise<SignInMethodsHint> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) {
    return { hasPassword: false, hasGoogle: false }
  }
  const methods = await fetchSignInMethodsForEmail(auth, trimmed)
  return {
    hasPassword: methods.includes('password'),
    hasGoogle: methods.includes('google.com'),
  }
}

function assertPasswordUserVerified(user: User): void {
  if (usesPasswordProvider(user) && !user.emailVerified) {
    throw new Error('Please verify your email. We sent you a link — check your inbox.')
  }
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const normalized = email.trim().toLowerCase()
  const name = displayName.trim() || normalized.split('@')[0] || 'User'

  const hint = await getSignInMethodsForEmail(normalized)
  if (hint.hasGoogle && !hint.hasPassword) {
    throw new Error('This email is already registered with Google. Use “Continue with Google”.')
  }
  if (hint.hasPassword) {
    throw new Error('This email already has an account. Sign in instead.')
  }

  const cred = await createUserWithEmailAndPassword(auth, normalized, password)
  const user = cred.user
  await updateProfile(user, { displayName: name })
  await ensureUserProfile(user)
  await sendEmailVerification(user)
  return user
}

export async function loginWithEmailPassword(email: string, password: string): Promise<User> {
  const normalized = email.trim().toLowerCase()
  const hint = await getSignInMethodsForEmail(normalized)
  if (hint.hasGoogle && !hint.hasPassword) {
    throw new Error('This email is registered with Google. Use “Continue with Google”.')
  }

  const cred = await signInWithEmailAndPassword(auth, normalized, password)
  const user = cred.user
  await ensureUserProfile(user)
  assertPasswordUserVerified(user)
  return user
}

export async function loginWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider)
  const user = cred.user
  if (!user.emailVerified) {
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    throw new Error('Google did not return a verified email. Try another account.')
  }
  await ensureUserProfile(user)
  return user
}

export async function sendVerificationAgain(user: User): Promise<void> {
  if (!usesPasswordProvider(user)) return
  await sendEmailVerification(user)
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

export async function reloadFirebaseUser(user: User): Promise<void> {
  await user.reload()
}

/**
 * Sends a password reset email. Does not reveal whether the email is registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Enter your email address.')
  }
  try {
    await sendPasswordResetEmail(auth, normalized)
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'auth/user-not-found') {
      return
    }
    throw e
  }
}

/** Links Google sign-in to the current user (same email as the Google account). */
export async function linkGoogleToCurrentUser(currentUser: User): Promise<User> {
  if (!currentUser.email) {
    throw new Error('Your account needs an email address before linking Google.')
  }
  if (usesGoogleProvider(currentUser)) {
    throw new Error('Google is already connected to this account.')
  }
  if (usesPasswordProvider(currentUser) && !currentUser.emailVerified) {
    throw new Error('Verify your email before linking Google.')
  }

  const cred = await linkWithPopup(currentUser, googleProvider)
  await ensureUserProfile(cred.user)
  await cred.user.reload()
  return cred.user
}
