import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { SavedDesignRecord } from './firestoreTypes'

export function savedDesignsQuery(uid: string) {
  return query(
    collection(db, 'users', uid, 'savedDesigns'),
    orderBy('updatedAt', 'desc'),
  )
}

export function mapSavedDesignDoc(id: string, data: Record<string, unknown>): SavedDesignRecord {
  const payload = data.designPayload
  return {
    id,
    name: String(data.name ?? 'Untitled'),
    notes: String(data.notes ?? ''),
    designPayload:
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
  }
}

export async function createSavedDesign(
  uid: string,
  input: { name: string; notes?: string; designPayload?: Record<string, unknown> },
): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'savedDesigns'), {
    name: input.name.trim() || 'Untitled',
    notes: input.notes?.trim() ?? '',
    designPayload: input.designPayload ?? {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateSavedDesign(
  uid: string,
  designId: string,
  patch: { name?: string; notes?: string; designPayload?: Record<string, unknown> },
): Promise<void> {
  const ref = doc(db, 'users', uid, 'savedDesigns', designId)
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (patch.name !== undefined) clean.name = patch.name.trim() || 'Untitled'
  if (patch.notes !== undefined) clean.notes = patch.notes.trim()
  if (patch.designPayload !== undefined) clean.designPayload = patch.designPayload
  await updateDoc(ref, clean)
}

export async function deleteSavedDesign(uid: string, designId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'savedDesigns', designId))
}
