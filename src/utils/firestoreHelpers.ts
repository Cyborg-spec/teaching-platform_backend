import { db, Timestamp } from '../config/firebase';
import { WriteBatch } from 'firebase-admin/firestore';

/**
 * Convert a Firestore document to a plain object with ID
 */
export function docToObject<T>(doc: FirebaseFirestore.DocumentSnapshot): T & { id: string } {
  return { id: doc.id, ...doc.data() } as T & { id: string };
}

/**
 * Convert an array of Firestore documents to plain objects with IDs
 */
export function docsToObjects<T>(snapshot: FirebaseFirestore.QuerySnapshot): (T & { id: string })[] {
  return snapshot.docs.map((doc) => docToObject<T>(doc));
}

/**
 * Execute batch writes in chunks of 500 (Firestore limit)
 */
export async function batchWrite(
  operations: ((batch: WriteBatch) => void)[]
): Promise<void> {
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = operations.slice(i, i + BATCH_SIZE);
    chunk.forEach((op) => op(batch));
    await batch.commit();
  }
}

/**
 * Get current Firestore timestamp
 */
export function now(): FirebaseFirestore.Timestamp {
  return Timestamp.now();
}

/**
 * Convert a Date to Firestore Timestamp
 */
export function dateToTimestamp(date: Date): FirebaseFirestore.Timestamp {
  return Timestamp.fromDate(date);
}

/**
 * Paginate a Firestore query
 */
export async function paginateQuery<T>(
  query: FirebaseFirestore.Query,
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: (T & { id: string })[]; total: number; page: number; pageSize: number }> {
  // Get total count (note: this is expensive on Firestore free tier)
  const countSnapshot = await query.count().get();
  const total = countSnapshot.data().count;

  // Get paginated results
  const snapshot = await query
    .offset((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    data: docsToObjects<T>(snapshot),
    total,
    page,
    pageSize,
  };
}
