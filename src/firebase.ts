import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Question, ActiveContest, LeaderboardEntry, UserProfile, QuizAttemptResult, DepositRequest, WithdrawalRequest, SupportTicket, BannerSlide, ContestEntry, FinancialLedgerRecord } from './types';
import { isDemoSeedUser } from './data/quizData';
import { prepareContestForFirestore, sanitizeContestSynchronous } from './utils/imageCompressor';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with specific database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Silence Firestore internal SDK logs (e.g., maximum backoff retry notices and quota warnings)
try {
  setLogLevel('silent');
} catch {}

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Google Chat OAuth Scopes for Workspace integration
export const GOOGLE_CHAT_SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.spaces.create',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/chat.memberships',
  'https://www.googleapis.com/auth/chat.memberships.readonly',
  'https://www.googleapis.com/auth/chat.messages.reactions',
  'https://www.googleapis.com/auth/chat.messages.reactions.readonly',
  'https://www.googleapis.com/auth/chat.messages.reactions.create',
];

GOOGLE_CHAT_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

// In-memory access token cache (NOT stored in localStorage or sessionStorage per security requirements)
let cachedAccessToken: string | null = null;

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

// Error handling conforming to skill specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Quota and write throttling circuit breaker
const QUOTA_STORAGE_KEY = 'quizkart_firestore_quota_exceeded';
const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours cooldown

let firestoreQuotaExceeded = false;
let quotaExceededTimestamp = 0;

try {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && Date.now() - ts < QUOTA_COOLDOWN_MS) {
        firestoreQuotaExceeded = true;
        quotaExceededTimestamp = ts;
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  }
} catch {}

// Client console safeguard against Firebase SDK quota & retry backoff logs
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const fullText = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (
      fullText.includes('resource-exhausted') ||
      fullText.includes('Quota limit exceeded') ||
      fullText.includes('Quota exceeded') ||
      fullText.includes('Free daily write units per project') ||
      fullText.includes('Using maximum backoff delay to prevent overloading the backend')
    ) {
      handlePossibleQuotaError(fullText);
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || '');
    if (
      msg.includes('resource-exhausted') ||
      msg.includes('Quota limit exceeded') ||
      msg.includes('Quota exceeded') ||
      msg.includes('Free daily write units per project') ||
      msg.includes('maximum backoff delay')
    ) {
      handlePossibleQuotaError(reason);
      event.preventDefault();
    }
  });
}

export function isFirestoreQuotaExceeded(): boolean {
  if (firestoreQuotaExceeded) {
    if (Date.now() - quotaExceededTimestamp > QUOTA_COOLDOWN_MS) {
      firestoreQuotaExceeded = false;
      try {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      } catch {}
    }
  }
  return firestoreQuotaExceeded;
}

export function handlePossibleQuotaError(error: unknown): boolean {
  const errMsg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code;
  if (
    code === 'resource-exhausted' ||
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Quota limit exceeded') ||
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('Free daily write units per project') ||
    errMsg.includes('maximum backoff delay')
  ) {
    firestoreQuotaExceeded = true;
    quotaExceededTimestamp = Date.now();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(QUOTA_STORAGE_KEY, String(quotaExceededTimestamp));
      }
    } catch {}
    return true;
  }
  return false;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  if (handlePossibleQuotaError(error)) {
    return;
  }

  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.includes('insufficient permissions') || errMsg.includes('permission-denied') || (error as any)?.code === 'permission-denied') {
    const errInfo: FirestoreErrorInfo = {
      error: errMsg,
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        emailVerified: auth.currentUser?.emailVerified || null,
        isAnonymous: auth.currentUser?.isAnonymous || null,
        tenantId: auth.currentUser?.tenantId || null,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email || null,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  console.warn(`Firestore operation '${operationType}' notice on '${path}':`, errMsg);
}

// Test Firestore connection on boot
export async function testConnection() {
  try {
    if (isFirestoreQuotaExceeded()) return;
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase connection notice: client is currently offline or warming up.');
    }
  }
}
testConnection();

// Authentication helpers
let activeSignInPromise: Promise<User | null> | null = null;

export async function signInWithGoogle(): Promise<{ user: User | null; accessToken: string | null }> {
  // Prevent duplicate concurrent popup requests
  if (activeSignInPromise) {
    const user = await activeSignInPromise;
    return { user, accessToken: cachedAccessToken };
  }

  activeSignInPromise = (async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return result.user;
    } catch (error: any) {
      const errorCode = error?.code || '';
      // Gracefully handle expected user cancellations and duplicate requests
      if (
        errorCode === 'auth/cancelled-popup-request' ||
        errorCode === 'auth/popup-closed-by-user'
      ) {
        // Benign: User closed the window or clicked again
        return null;
      }

      if (errorCode === 'auth/popup-blocked') {
        console.warn('Google Sign In popup was blocked by browser. Please allow popups.');
        return null;
      }

      console.warn('Google Sign In notice:', error?.message || error);
      return null;
    } finally {
      activeSignInPromise = null;
    }
  })();

  const user = await activeSignInPromise;
  return { user, accessToken: cachedAccessToken };
}

export async function logOutUser(): Promise<void> {
  await signOut(auth);
  cachedAccessToken = null;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    }
    callback(user);
  });
}

// Helper to extract numeric userNumber (1001, 1002, ...)
export function extractNumericUserNumber(u?: Partial<UserProfile> | null): number {
  if (!u) return 999999;
  if (typeof u.userNumber === 'number' && u.userNumber >= 1000) {
    return u.userNumber;
  }
  const idStr = (u.customUserId || u.id || '').trim();
  const match = idStr.match(/(\d+)/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val >= 1000) return val;
  }
  return 999999;
}

/**
 * Assigns a permanent, unique sequential customUserId (QK-USR-1001, 1002, 1003...)
 * using Firestore runTransaction on 'settings/user_counter'.
 * Once assigned, the ID never changes, swaps, or regenerates.
 */
export async function assignSequentialUserIdViaTransaction(
  targetUid: string,
  targetEmail: string,
  existingAssignedId?: string
): Promise<{ customUserId: string; userNumber: number }> {
  // 1. Strict Immutability Guard: If existingAssignedId is already a valid sequential ID, lock and return it immediately
  if (existingAssignedId && /^(?:QK-)?USR-\d+$/i.test(existingAssignedId.trim())) {
    const clean = existingAssignedId.trim().toUpperCase();
    const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
    const numMatch = idStr.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 1001;
    return { customUserId: idStr, userNumber: num };
  }

  const cleanEmail = (targetEmail || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : null;

  // 2. Prevent ID Hijacking & Reassignment: Check if user already has an assigned ID in Firestore
  try {
    if (safeEmailDocId) {
      const snap = await getDoc(doc(db, 'users', safeEmailDocId));
      if (snap.exists()) {
        const d = snap.data();
        const foundId = d?.customUserId || d?.id;
        if (foundId && /^(?:QK-)?USR-\d+$/i.test(foundId)) {
          const clean = String(foundId).trim().toUpperCase();
          const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
          const num = typeof d?.userNumber === 'number' && d.userNumber >= 1000
            ? d.userNumber
            : (idStr.match(/(\d+)/) ? parseInt(idStr.match(/(\d+)/)![1], 10) : 1001);
          return { customUserId: idStr, userNumber: num };
        }
      }
    }
    if (targetUid) {
      const snap = await getDoc(doc(db, 'users', targetUid));
      if (snap.exists()) {
        const d = snap.data();
        const foundId = d?.customUserId || d?.id;
        if (foundId && /^(?:QK-)?USR-\d+$/i.test(foundId)) {
          const clean = String(foundId).trim().toUpperCase();
          const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
          const num = typeof d?.userNumber === 'number' && d.userNumber >= 1000
            ? d.userNumber
            : (idStr.match(/(\d+)/) ? parseInt(idStr.match(/(\d+)/)![1], 10) : 1001);
          return { customUserId: idStr, userNumber: num };
        }
      }
    }
  } catch (e) {
    console.warn('Check existing user before transaction notice:', e);
  }

  // Find maximum existing user number across local and known registered users to prevent reuse/collision
  let maxKnownNum = 1000;
  try {
    const raw = localStorage.getItem('quizkart_registered_users');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((u: any) => {
          const num = extractNumericUserNumber(u);
          if (num >= 1000 && num < 999999 && num > maxKnownNum) {
            maxKnownNum = num;
          }
        });
      }
    }
  } catch {}

  // Check deleted users archive in localStorage as well to ensure deleted user numbers are never recycled or collided
  try {
    const rawDel = localStorage.getItem('quizkart_deleted_users');
    if (rawDel) {
      const delList = JSON.parse(rawDel);
      if (Array.isArray(delList)) {
        delList.forEach((u: any) => {
          const num = extractNumericUserNumber(u);
          if (num >= 1000 && num < 999999 && num > maxKnownNum) {
            maxKnownNum = num;
          }
        });
      }
    }
  } catch {}

  // 3. Atomic transaction on 'settings/user_counter' and permanent binding to the user's Firestore document
  try {
    const counterRef = doc(db, 'settings', 'user_counter');
    const userDocRef = safeEmailDocId ? doc(db, 'users', safeEmailDocId) : (targetUid ? doc(db, 'users', targetUid) : null);
    const uidDocRef = (targetUid && safeEmailDocId && targetUid !== safeEmailDocId) ? doc(db, 'users', targetUid) : null;

    const result = await runTransaction(db, async (transaction) => {
      // All transaction reads first
      const counterDoc = await transaction.get(counterRef);
      const existingUserDoc = userDocRef ? await transaction.get(userDocRef) : null;
      const existingUidDoc = uidDocRef ? await transaction.get(uidDocRef) : null;

      // Check UID doc first (highest confidence permanent binding)
      if (existingUidDoc && existingUidDoc.exists()) {
        const d = existingUidDoc.data();
        const foundId = d?.customUserId || d?.id;
        if (foundId && /^(?:QK-)?USR-\d+$/i.test(foundId)) {
          const clean = String(foundId).trim().toUpperCase();
          const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
          const num = typeof d?.userNumber === 'number' && d.userNumber >= 1000
            ? d.userNumber
            : (idStr.match(/(\d+)/) ? parseInt(idStr.match(/(\d+)/)![1], 10) : 1001);
          return { customUserId: idStr, userNumber: num };
        }
      }

      // Check email userDoc (verify account ownership before restoring)
      if (existingUserDoc && existingUserDoc.exists()) {
        const d = existingUserDoc.data();
        const foundId = d?.customUserId || d?.id;
        const isVerifiedOwner = !targetUid || !d?.uid || d.uid === targetUid;
        if (isVerifiedOwner && foundId && /^(?:QK-)?USR-\d+$/i.test(foundId) && !d?.isDeleted) {
          const clean = String(foundId).trim().toUpperCase();
          const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
          const num = typeof d?.userNumber === 'number' && d.userNumber >= 1000
            ? d.userNumber
            : (idStr.match(/(\d+)/) ? parseInt(idStr.match(/(\d+)/)![1], 10) : 1001);
          return { customUserId: idStr, userNumber: num };
        }
      }

      let currentCounter = 1000;
      if (counterDoc.exists()) {
        const data = counterDoc.data();
        if (typeof data?.lastUserNumber === 'number' && data.lastUserNumber >= 1000) {
          currentCounter = data.lastUserNumber;
        } else if (typeof data?.count === 'number' && data.count >= 1000) {
          currentCounter = data.count;
        }
      }

      const baseline = Math.max(1000, currentCounter, maxKnownNum);
      const nextUserNumber = baseline + 1;
      const newCustomUserId = `QK-USR-${nextUserNumber}`;

      // Transaction writes:
      // 1. Update atomic counter
      transaction.set(counterRef, {
        lastUserNumber: nextUserNumber,
        lastAssignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Permanently bind customUserId and userNumber to user's Firestore document
      if (uidDocRef) {
        transaction.set(uidDocRef, {
          customUserId: newCustomUserId,
          id: newCustomUserId,
          userNumber: nextUserNumber,
          email: cleanEmail,
          uid: targetUid,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      if (userDocRef) {
        const canWriteEmailDoc = !existingUserDoc?.exists() || !existingUserDoc.data()?.uid || existingUserDoc.data()?.uid === targetUid;
        if (canWriteEmailDoc) {
          transaction.set(userDocRef, {
            customUserId: newCustomUserId,
            id: newCustomUserId,
            userNumber: nextUserNumber,
            email: cleanEmail,
            uid: targetUid || newCustomUserId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      return { customUserId: newCustomUserId, userNumber: nextUserNumber };
    });

    return result;
  } catch (txErr) {
    console.warn('runTransaction user counter notice, computing next safe sequence:', txErr);
    let maxNum = Math.max(1000, maxKnownNum);
    const nextNum = maxNum + 1;
    const fallbackId = `QK-USR-${nextNum}`;

    // Ensure fallback is also stored if possible
    if (targetUid) {
      setDoc(doc(db, 'users', targetUid), {
        customUserId: fallbackId,
        id: fallbackId,
        userNumber: nextNum,
        email: cleanEmail,
        uid: targetUid,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }
    if (safeEmailDocId && safeEmailDocId !== targetUid) {
      setDoc(doc(db, 'users', safeEmailDocId), {
        customUserId: fallbackId,
        id: fallbackId,
        userNumber: nextNum,
        email: cleanEmail,
        uid: targetUid || fallbackId,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }

    return { customUserId: fallbackId, userNumber: nextNum };
  }
}

// Dedicated single-user block/unblock status update to ensure ONLY the selected user is affected
export async function updateUserBlockStatusInFirestore(
  targetUid: string,
  targetEmail: string,
  isBlocked: boolean,
  blockReason: string = ''
): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const updates: Record<string, any> = {
    isBlocked: Boolean(isBlocked),
    blockReason: isBlocked ? (blockReason || 'Account Blocked by Admin') : '',
    updatedAt: new Date().toISOString()
  };

  const tasks: Promise<any>[] = [];
  if (targetUid) {
    tasks.push(setDoc(doc(db, 'users', targetUid), updates, { merge: true }));
  }
  const cleanEmail = (targetEmail || '').trim().toLowerCase();
  if (cleanEmail) {
    const safeEmailDocId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeEmailDocId !== targetUid) {
      tasks.push(setDoc(doc(db, 'users', safeEmailDocId), updates, { merge: true }));
    }
  }
  try {
    await Promise.all(tasks);
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn('updateUserBlockStatusInFirestore notice:', error);
  }
}

// Firestore persistence helpers for QuizKart
export async function syncUserProfile(profile: UserProfile): Promise<void> {
  if (!profile || isDemoSeedUser(profile) || isFirestoreQuotaExceeded()) return;
  const currentUser = auth.currentUser;
  const cleanEmail = (profile.email || currentUser?.email || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
  const docId = safeEmailDocId || profile.uid || profile.id || (currentUser?.uid ?? null);
  if (!docId) return;

  const derivedUserNumber = extractNumericUserNumber(profile);
  const resolvedCustomId = profile.customUserId || profile.id || (derivedUserNumber < 999999 ? `QK-USR-${derivedUserNumber}` : docId);

  const path = `users/${docId}`;
  try {
    const isUserDeleted = Boolean(profile.isDeleted) || profile.status === 'deleted' || Boolean(profile.deletedAt);
    const userPayload: Record<string, any> = {
      uid: profile.uid || currentUser?.uid || docId,
      id: resolvedCustomId,
      customUserId: resolvedCustomId,
      userNumber: derivedUserNumber < 999999 ? derivedUserNumber : undefined,
      name: profile.name || currentUser?.displayName || 'Player',
      email: cleanEmail,
      mobile: profile.mobile || '',
      countryCode: profile.countryCode || '+91',
      avatarUrl: profile.avatarUrl || currentUser?.photoURL || '',
      upiId: profile.upiId || '',
      walletBalance: Number(profile.walletBalance) || 0,
      quizzesPlayed: Number(profile.quizzesPlayed) || 0,
      totalWonAmount: Number(profile.totalWonAmount) || 0,
      productsWonCount: Number(profile.productsWonCount) || 0,
      isRegistered: profile.isRegistered ?? true,
      isBlocked: Boolean(profile.isBlocked),
      blockReason: profile.blockReason || '',
      registrationDate: profile.registrationDate || new Date().toISOString().split('T')[0],
      passwordStatus: (profile.passwordStatus && !profile.passwordStatus.includes('••••') && !profile.passwordStatus.includes('Secured')) ? profile.passwordStatus : 'player@123',
      hasPassword: profile.hasPassword ?? true,
      kycStatus: profile.kycStatus || 'Unverified',
      isDeleted: isUserDeleted,
      status: isUserDeleted ? 'deleted' : (profile.status || 'active'),
      updatedAt: new Date().toISOString()
    };
    if (isUserDeleted) {
      userPayload.deletedAt = profile.deletedAt || new Date().toISOString().split('T')[0];
      userPayload.deletedTimestampMs = profile.deletedTimestampMs || Date.now();
    }
    await setDoc(doc(db, 'users', docId), userPayload, { merge: true });
    // ONLY mirror to currentUser.uid if the profile being synced actually belongs to the current user
    if (
      currentUser?.uid &&
      currentUser.uid !== docId &&
      (profile.uid === currentUser.uid || cleanEmail === (currentUser.email || '').toLowerCase())
    ) {
      await setDoc(doc(db, 'users', currentUser.uid), userPayload, { merge: true });
    }
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn('Firestore user sync notice:', error);
  }
}

export async function deleteUserProfileFromFirestore(emailOrId: string): Promise<void> {
  if (!emailOrId || isFirestoreQuotaExceeded()) return;
  const cleanEmail = emailOrId.trim().toLowerCase();
  const safeDocId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    await setDoc(doc(db, 'users', safeDocId), {
      isDeleted: true,
      status: 'deleted',
      deletedAt: new Date().toISOString().split('T')[0],
      deletedTimestampMs: Date.now(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await deleteDoc(doc(db, 'users', safeDocId));
    if (auth.currentUser?.uid) {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid)).catch(() => {});
    }
  } catch (error) {
    handlePossibleQuotaError(error);
  }
}

// Helper to check if a user is recorded in deleted list
function isAccountDeleted(u: any): boolean {
  if (!u) return true;
  if (u.isDeleted === true || u.status === 'deleted' || Boolean(u.deletedAt) || Boolean(u.deletedTimestampMs)) {
    return true;
  }
  const email = (u.email || '').trim().toLowerCase();
  const id = (u.customUserId || u.id || '').trim();
  try {
    const raw = localStorage.getItem('quizkart_deleted_users');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.some((d: any) => 
          (d && d.email && (d.email || '').trim().toLowerCase() === email) ||
          (d && d.id && (d.id || '').trim() === id)
        );
      }
    }
  } catch {}
  return false;
}

export async function fetchAllUsersFromFirestore(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    let snap;
    try {
      const q = query(collection(db, path), orderBy('userNumber', 'asc'));
      snap = await getDocs(q);
    } catch {
      snap = await getDocs(collection(db, path));
    }
    const userMap = new Map<string, UserProfile>();
    snap.forEach((docItem) => {
      const data = docItem.data() as UserProfile;
      if (!data || isDemoSeedUser(data)) return;
      if (isAccountDeleted(data)) return; // Exclude deleted users

      if (data.name || data.email) {
        const uNum = extractNumericUserNumber(data);
        const cId = data.customUserId || data.id || (uNum < 999999 ? `QK-USR-${uNum}` : docItem.id);
        const resolvedUid = (data.uid && !data.uid.startsWith('QK-USR-')) 
          ? data.uid 
          : (docItem.id && !docItem.id.startsWith('QK-USR-') ? docItem.id : (data.uid || docItem.id));
        const userObj: UserProfile = {
          ...data,
          id: cId,
          customUserId: cId,
          userNumber: uNum < 999999 ? uNum : undefined,
          uid: resolvedUid
        };

        const cleanEmail = (data.email || '').trim().toLowerCase();
        const primaryKey = cleanEmail || resolvedUid || cId;

        if (userMap.has(primaryKey)) {
          const existing = userMap.get(primaryKey)!;
          userMap.set(primaryKey, {
            ...existing,
            ...userObj,
            uid: (existing.uid && !existing.uid.startsWith('QK-USR-')) ? existing.uid : userObj.uid,
            customUserId: existing.customUserId || userObj.customUserId,
            userNumber: existing.userNumber || userObj.userNumber
          });
        } else {
          userMap.set(primaryKey, userObj);
        }
      }
    });
    const list = Array.from(userMap.values());
    // Strict ascending numeric order (1001, 1002, 1003... 1010)
    list.sort((a, b) => {
      const numA = extractNumericUserNumber(a);
      const numB = extractNumericUserNumber(b);
      if (numA !== numB) return numA - numB;
      const timeA = new Date(a.registrationDate || a.createdAt || 0).getTime();
      const timeB = new Date(b.registrationDate || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.uid || a.id || '').localeCompare(b.uid || b.id || '');
    });
    return list;
  } catch (error) {
    console.warn('fetchAllUsersFromFirestore error:', error);
    return [];
  }
}

export function subscribeToAllUsersFromFirestore(callback: (users: UserProfile[]) => void): () => void {
  const path = 'users';
  try {
    const handleSnap = (snap: any) => {
      const userMap = new Map<string, UserProfile>();
      snap.forEach((docItem: any) => {
        const data = docItem.data() as UserProfile;
        if (!data || isDemoSeedUser(data)) return;
        if (isAccountDeleted(data)) return; // Exclude deleted users

        if (data.name || data.email) {
          const uNum = extractNumericUserNumber(data);
          const cId = data.customUserId || data.id || (uNum < 999999 ? `QK-USR-${uNum}` : docItem.id);
          const resolvedUid = (data.uid && !data.uid.startsWith('QK-USR-')) 
            ? data.uid 
            : (docItem.id && !docItem.id.startsWith('QK-USR-') ? docItem.id : (data.uid || docItem.id));
          const userObj: UserProfile = {
            ...data,
            id: cId,
            customUserId: cId,
            userNumber: uNum < 999999 ? uNum : undefined,
            uid: resolvedUid
          };

          const cleanEmail = (data.email || '').trim().toLowerCase();
          const primaryKey = cleanEmail || resolvedUid || cId;

          if (userMap.has(primaryKey)) {
            const existing = userMap.get(primaryKey)!;
            userMap.set(primaryKey, {
              ...existing,
              ...userObj,
              uid: (existing.uid && !existing.uid.startsWith('QK-USR-')) ? existing.uid : userObj.uid,
              customUserId: existing.customUserId || userObj.customUserId,
              userNumber: existing.userNumber || userObj.userNumber
            });
          } else {
            userMap.set(primaryKey, userObj);
          }
        }
      });
      const list = Array.from(userMap.values());
      // Stable ascending numeric order (1001, 1002, 1003... 1010)
      list.sort((a, b) => {
        const numA = extractNumericUserNumber(a);
        const numB = extractNumericUserNumber(b);
        if (numA !== numB) return numA - numB;
        const timeA = new Date(a.registrationDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.registrationDate || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.uid || a.id || '').localeCompare(b.uid || b.id || '');
      });
      callback(list);
    };

    try {
      const q = query(collection(db, path), orderBy('userNumber', 'asc'));
      return onSnapshot(
        q,
        handleSnap,
        () => {
          // Fallback to plain collection listener if orderBy index not yet provisioned
          return onSnapshot(collection(db, path), handleSnap, (err) => console.warn('Users subscription fallback warning:', err));
        }
      );
    } catch {
      return onSnapshot(collection(db, path), handleSnap, (error) => {
        console.warn('Firestore users subscription warning:', error);
      });
    }
  } catch {
    return () => {};
  }
}

// Global Real-Time User Presence Management (Firebase Firestore)
export async function updateUserPresenceInFirestore(
  user: { email?: string; id?: string; uid?: string; name?: string } | null,
  isOnline: boolean
): Promise<void> {
  if (!user || !user.email || isFirestoreQuotaExceeded()) return;
  const cleanEmail = user.email.trim().toLowerCase();
  if (!cleanEmail || cleanEmail === 'player@quizkart.in') return;
  const docId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    const presenceRef = doc(db, 'user_presence', docId);
    if (!isOnline) {
      await setDoc(
        presenceRef,
        {
          email: cleanEmail,
          userId: user.id || user.uid || '',
          name: user.name || '',
          isOnline: false,
          lastSeen: Date.now(),
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } else {
      await setDoc(
        presenceRef,
        {
          email: cleanEmail,
          userId: user.id || user.uid || '',
          name: user.name || '',
          isOnline: true,
          lastSeen: Date.now(),
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  } catch (error) {
    handlePossibleQuotaError(error);
  }
}

export function subscribeToUserPresenceFromFirestore(
  callback: (presenceMap: Record<string, { isOnline: boolean; lastSeen: number }>) => void
): () => void {
  const path = 'user_presence';
  try {
    return onSnapshot(
      collection(db, path),
      (snap) => {
        const map: Record<string, { isOnline: boolean; lastSeen: number }> = {};
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data && data.email) {
            const emailKey = String(data.email).trim().toLowerCase();
            map[emailKey] = {
              isOnline: Boolean(data.isOnline),
              lastSeen: Number(data.lastSeen) || 0
            };
          }
        });
        callback(map);
      },
      (error) => {
        console.warn('User presence subscription warning:', error);
      }
    );
  } catch {
    return () => {};
  }
}

export async function fetchUserProfile(uid: string, email?: string): Promise<Partial<UserProfile> | null> {
  try {
    if (!uid && !email) return null;
    let dataFromUid: Partial<UserProfile> | null = null;
    // 1. Direct doc lookup by UID as the primary single source of truth: "users/{auth.currentUser.uid}"
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        dataFromUid = snap.data() as Partial<UserProfile>;
        const validId = (dataFromUid?.customUserId || dataFromUid?.id || '').trim();
        if (validId && /^(?:QK-)?USR-\d+$/i.test(validId)) {
          return dataFromUid;
        }
      }
    }

    // 2. Safe email doc lookup if email provided or if uid contains '@' or via currentUser
    const targetEmail = email || (uid && uid.includes('@') ? uid : auth.currentUser?.email) || dataFromUid?.email;
    if (targetEmail) {
      const cleanEmail = targetEmail.trim().toLowerCase();
      const safeEmailDocId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (safeEmailDocId !== uid) {
        const snapEmail = await getDoc(doc(db, 'users', safeEmailDocId));
        if (snapEmail.exists()) {
          const emailData = snapEmail.data() as Partial<UserProfile>;
          const validEmailId = (emailData?.customUserId || emailData?.id || '').trim();
          if (validEmailId && /^(?:QK-)?USR-\d+$/i.test(validEmailId)) {
            // Mirror to users/{uid} so users/{uid} is permanently populated
            if (uid && uid !== safeEmailDocId) {
              setDoc(doc(db, 'users', uid), {
                ...emailData,
                uid,
                updatedAt: new Date().toISOString()
              }, { merge: true }).catch(() => {});
            }
            return {
              ...(dataFromUid || {}),
              ...emailData,
              uid: uid || emailData.uid || safeEmailDocId
            };
          }
          return { ...(dataFromUid || {}), ...emailData };
        }
      }
    }
    return dataFromUid;
  } catch (error) {
    if (handlePossibleQuotaError(error)) return null;
    return null;
  }
}

// Questions Sync
export async function fetchQuestionsFromFirestore(): Promise<Question[]> {
  const path = 'questions';
  try {
    const snap = await getDocs(collection(db, path));
    const list: Question[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        const id = data.id != null ? Number(data.id) : Number(docItem.id);
        list.push({ ...data, id: !isNaN(id) ? id : Math.floor(1000 + Math.random() * 9000) } as Question);
      }
    });
    return list.filter(q => q && q.id != null);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {}
    return [];
  }
}

export async function saveQuestionToFirestore(q: Question): Promise<void> {
  if (!q || q.id == null || isFirestoreQuotaExceeded()) return;
  const path = `questions/${q.id}`;
  try {
    await setDoc(doc(db, 'questions', String(q.id)), q);
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeQuestionFromFirestore(qId: number): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `questions/${qId}`;
  try {
    await deleteDoc(doc(db, 'questions', String(qId)));
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


// Contests Sync
export async function fetchContestsFromFirestore(): Promise<ActiveContest[]> {
  const path = 'contests';
  try {
    const snap = await getDocs(collection(db, path));
    const list: ActiveContest[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as ActiveContest);
      }
    });
    return list.filter(c => c && c.id != null);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {}
    return [];
  }
}

export async function saveContestToFirestore(contest: ActiveContest): Promise<void> {
  if (!contest || !contest.id || isFirestoreQuotaExceeded()) return;
  const path = `contests/${contest.id}`;
  try {
    const safeContest = await prepareContestForFirestore(contest);
    const writePromise = setDoc(doc(db, 'contests', safeContest.id), safeContest);
    // Timeout safeguard: max 3.5 seconds so Firestore never blocks the UI
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore save timed out')), 3500)
    );
    await Promise.race([writePromise, timeoutPromise]);
  } catch (error: any) {
    if (handlePossibleQuotaError(error)) {
      return;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    if ((errMsg.includes('exceeds the maximum allowed size') || errMsg.includes('1,048,576') || errMsg.includes('payload')) && !errMsg.includes('resource-exhausted') && !errMsg.includes('Quota')) {
      try {
        const fallback = sanitizeContestSynchronous(contest);
        await setDoc(doc(db, 'contests', fallback.id), fallback);
        return;
      } catch (retryErr) {
        if (!handlePossibleQuotaError(retryErr)) {
          console.warn('Firestore retry save notice:', retryErr);
        }
      }
    }
    console.warn('Firestore save notice for contest:', contest.id, errMsg);
  }
}

export async function removeContestFromFirestore(contestId: string): Promise<void> {
  if (!contestId || isFirestoreQuotaExceeded()) return;
  const path = `contests/${contestId}`;
  try {
    const deletePromise = deleteDoc(doc(db, 'contests', contestId));
    // Timeout safeguard: max 3.5 seconds
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore delete timed out')), 3500)
    );
    await Promise.race([deletePromise, timeoutPromise]);
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn('Firestore remove contest notice:', contestId, error);
  }
}

// Banner Slides Cloud Persistence (Permanent storage under /settings/banners)
export async function saveBannerSlidesToFirestore(slides: BannerSlide[]): Promise<void> {
  if (!slides || !Array.isArray(slides) || isFirestoreQuotaExceeded()) return;
  const path = 'settings/banners';
  try {
    // Only upload compact slides to Firestore to fit well within 1MB document limit
    const safeSlides = slides.map(s => {
      if (s.imageUrl && s.imageUrl.startsWith('data:image/') && s.imageUrl.length > 500_000) {
        return { ...s, imageUrl: '' };
      }
      return s;
    });
    const writePromise = setDoc(doc(db, 'settings', 'banners'), {
      slides: safeSlides,
      updatedAt: new Date().toISOString()
    });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Banner save timed out')), 3500)
    );
    await Promise.race([writePromise, timeoutPromise]);
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn('Firestore banner save notice:', error);
  }
}

export async function fetchBannerSlidesFromFirestore(): Promise<BannerSlide[] | null> {
  const path = 'settings/banners';
  try {
    const snapPromise = getDoc(doc(db, 'settings', 'banners'));
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('Banner fetch timed out')), 3500)
    );
    const snap = await Promise.race([snapPromise, timeoutPromise]);
    if (snap && snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.slides)) {
        return data.slides as BannerSlide[];
      }
    }
  } catch (error) {
    console.warn('Firestore banner fetch notice:', error);
  }
  return null;
}

// Leaderboard Sync
export async function fetchLeaderboardFromFirestore(): Promise<LeaderboardEntry[]> {
  const path = 'leaderboard';
  try {
    const snap = await getDocs(collection(db, path));
    const list: LeaderboardEntry[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as LeaderboardEntry);
      }
    });
    return list.filter(e => e && e.id != null);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {}
    return [];
  }
}

export async function saveLeaderboardEntryToFirestore(entry: LeaderboardEntry): Promise<void> {
  if (!entry || !entry.id || isFirestoreQuotaExceeded()) return;
  const path = `leaderboard/${entry.id}`;
  try {
    await setDoc(doc(db, 'leaderboard', entry.id), {
      ...entry,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore leaderboard save notice (${entry.id}):`, error);
  }
}

export function subscribeToLeaderboardFromFirestore(
  callback: (entries: LeaderboardEntry[]) => void
): () => void {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'leaderboard';
  try {
    return onSnapshot(
      collection(db, path),
      (snap) => {
        const list: LeaderboardEntry[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data && data.userName) {
            list.push({ ...data, id: data.id || docItem.id } as LeaderboardEntry);
          }
        });
        callback(list.filter(e => e && e.id != null));
      },
      (error) => {
        handlePossibleQuotaError(error);
      }
    );
  } catch {
    return () => {};
  }
}

// 30-Day Rolling Data Retention Window for Tournament History / Activity Logs
export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isWithinRetentionWindow(submittedAt?: string): boolean {
  if (!submittedAt) return true;
  const time = new Date(submittedAt).getTime();
  if (isNaN(time) || time <= 0) return true;
  return (Date.now() - time) <= RETENTION_MS;
}

// Automatically prune/remove records crossing 31 days (older than 30 days) from backend storage
export async function pruneExpiredUserQuizAttempts(userId: string): Promise<void> {
  if (!userId || isFirestoreQuotaExceeded()) return;
  try {
    const q = query(collection(db, 'quiz_attempts'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const now = Date.now();
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        const submittedTime = new Date(data.submittedAt || 0).getTime();
        if (!isNaN(submittedTime) && submittedTime > 0 && (now - submittedTime > RETENTION_MS)) {
          deleteDoc(doc(db, 'quiz_attempts', docItem.id)).catch(() => {});
        }
      }
    });
  } catch (err) {
    console.warn('Error pruning expired quiz attempts:', err);
  }
}

export async function recordQuizAttemptInFirestore(attempt: QuizAttemptResult): Promise<void> {
  if (!attempt || !attempt.attemptId || isFirestoreQuotaExceeded()) return;

  const currentUser = auth.currentUser;
  const resolvedUserId = attempt.userId || attempt.ownerUid || currentUser?.uid || '';
  const resolvedOwnerUid = attempt.ownerUid || attempt.userId || currentUser?.uid || '';
  const resolvedEmail = (attempt.userEmail || currentUser?.email || '').trim().toLowerCase();

  if (!resolvedOwnerUid && !resolvedUserId && !resolvedEmail) {
    return;
  }

  const path = `quiz_attempts/${attempt.attemptId}`;
  try {
    await setDoc(doc(db, 'quiz_attempts', attempt.attemptId), {
      attemptId: attempt.attemptId,
      entryId: attempt.entryId || '',
      userId: resolvedUserId || resolvedOwnerUid,
      ownerUid: resolvedOwnerUid || resolvedUserId,
      userEmail: resolvedEmail,
      userName: attempt.userName || currentUser?.displayName || 'Contestant',
      contestId: attempt.contestId || '',
      title: attempt.title || 'Cash Tournament',
      quizDate: attempt.quizDate || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      submittedAt: attempt.submittedAt || new Date().toISOString(),
      score: attempt.score || 0,
      totalQuestions: attempt.totalQuestions || 10,
      timeTakenSeconds: attempt.timeTakenSeconds || 0,
      rank: attempt.rank || 1,
      totalParticipants: attempt.totalParticipants || 1,
      rewardWon: attempt.rewardWon || '',
      rewardType: attempt.rewardType || 'none',
      rewardAmount: attempt.rewardAmount || 0,
      finalPrizeRupees: attempt.finalPrizeRupees !== undefined ? attempt.finalPrizeRupees : (attempt.rewardAmount || 0),
      settlementStatus: attempt.settlementStatus || 'pending',
      provisionalPrizeRupees: attempt.provisionalPrizeRupees !== undefined ? attempt.provisionalPrizeRupees : 0,
      payoutMessage: attempt.payoutMessage || '',
      selectedMessageOption: attempt.selectedMessageOption || 0
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserQuizAttemptsFromFirestore(
  identifier: string | { ownerUid?: string; userId?: string; userEmail?: string }
): Promise<QuizAttemptResult[]> {
  if (!identifier) return [];
  const path = 'quiz_attempts';
  const targetId = typeof identifier === 'string' ? identifier : (identifier.ownerUid || identifier.userId || auth.currentUser?.uid || '');
  const targetEmail = typeof identifier === 'object' && identifier.userEmail ? identifier.userEmail.trim().toLowerCase() : '';

  if (!targetId && !targetEmail) return [];

  try {
    const listMap = new Map<string, QuizAttemptResult>();

    // 1. Query by ownerUid
    if (targetId) {
      try {
        const q1 = query(collection(db, path), where('ownerUid', '==', targetId));
        const snap1 = await getDocs(q1);
        snap1.forEach((docItem) => {
          const data = docItem.data() as Record<string, any> | undefined;
          if (data && (data.attemptId || docItem.id)) {
            const attId = data.attemptId || docItem.id;
            listMap.set(attId, {
              attemptId: attId,
              entryId: data.entryId || '',
              userId: data.userId || targetId,
              ownerUid: data.ownerUid || targetId,
              userEmail: data.userEmail || targetEmail,
              userName: data.userName,
              quizDate: data.quizDate || '',
              score: data.score || 0,
              totalQuestions: data.totalQuestions || 10,
              timeTakenSeconds: data.timeTakenSeconds || 0,
              answers: data.answers || {},
              markedForReview: data.markedForReview || [],
              rank: data.rank || 1,
              totalParticipants: data.totalParticipants || 1,
              rewardWon: data.rewardWon || '',
              rewardType: data.rewardType || 'none',
              rewardAmount: data.rewardAmount || 0,
              finalPrizeRupees: data.finalPrizeRupees !== undefined ? data.finalPrizeRupees : (data.rewardAmount || 0),
              settlementStatus: data.settlementStatus || 'pending',
              title: data.title || 'Cash Tournament',
              submittedAt: data.submittedAt || new Date().toISOString(),
              contestId: data.contestId || ''
            } as QuizAttemptResult);
          }
        });
      } catch (err) {
        console.warn('Error querying attempts by ownerUid:', err);
      }

      // Also query by userId if distinct
      try {
        const qUser = query(collection(db, path), where('userId', '==', targetId));
        const snapUser = await getDocs(qUser);
        snapUser.forEach((docItem) => {
          const data = docItem.data() as Record<string, any> | undefined;
          if (data && (data.attemptId || docItem.id)) {
            const attId = data.attemptId || docItem.id;
            if (!listMap.has(attId)) {
              listMap.set(attId, {
                attemptId: attId,
                entryId: data.entryId || '',
                userId: data.userId || targetId,
                ownerUid: data.ownerUid || targetId,
                userEmail: data.userEmail || targetEmail,
                userName: data.userName,
                quizDate: data.quizDate || '',
                score: data.score || 0,
                totalQuestions: data.totalQuestions || 10,
                timeTakenSeconds: data.timeTakenSeconds || 0,
                answers: data.answers || {},
                markedForReview: data.markedForReview || [],
                rank: data.rank || 1,
                totalParticipants: data.totalParticipants || 1,
                rewardWon: data.rewardWon || '',
                rewardType: data.rewardType || 'none',
                rewardAmount: data.rewardAmount || 0,
                finalPrizeRupees: data.finalPrizeRupees !== undefined ? data.finalPrizeRupees : (data.rewardAmount || 0),
                settlementStatus: data.settlementStatus || 'pending',
                title: data.title || 'Cash Tournament',
                submittedAt: data.submittedAt || new Date().toISOString(),
                contestId: data.contestId || ''
              } as QuizAttemptResult);
            }
          }
        });
      } catch (err) {
        console.warn('Error querying attempts by userId:', err);
      }
    }

    // 2. Query by userEmail if present
    if (targetEmail) {
      try {
        const q2 = query(collection(db, path), where('userEmail', '==', targetEmail));
        const snap2 = await getDocs(q2);
        snap2.forEach((docItem) => {
          const data = docItem.data() as Record<string, any> | undefined;
          if (data && (data.attemptId || docItem.id)) {
            const attId = data.attemptId || docItem.id;
            if (!listMap.has(attId)) {
              listMap.set(attId, {
                attemptId: attId,
                entryId: data.entryId || '',
                userId: data.userId || targetId,
                ownerUid: data.ownerUid || targetId,
                userEmail: data.userEmail || targetEmail,
                userName: data.userName,
                quizDate: data.quizDate || '',
                score: data.score || 0,
                totalQuestions: data.totalQuestions || 10,
                timeTakenSeconds: data.timeTakenSeconds || 0,
                answers: data.answers || {},
                markedForReview: data.markedForReview || [],
                rank: data.rank || 1,
                totalParticipants: data.totalParticipants || 1,
                rewardWon: data.rewardWon || '',
                rewardType: data.rewardType || 'none',
                rewardAmount: data.rewardAmount || 0,
                finalPrizeRupees: data.finalPrizeRupees !== undefined ? data.finalPrizeRupees : (data.rewardAmount || 0),
                settlementStatus: data.settlementStatus || 'pending',
                title: data.title || 'Cash Tournament',
                submittedAt: data.submittedAt || new Date().toISOString(),
                contestId: data.contestId || ''
              } as QuizAttemptResult);
            }
          }
        });
      } catch (err) {
        console.warn('Error querying attempts by userEmail:', err);
      }
    }

    const list = Array.from(listMap.values());
    list.sort((a, b) => {
      const timeA = new Date(a.submittedAt || 0).getTime();
      const timeB = new Date(b.submittedAt || 0).getTime();
      return timeB - timeA;
    });
    return list;
  } catch (error) {
    console.warn('Could not fetch quiz attempts from Firestore:', error);
    return [];
  }
}

export function subscribeToUserQuizAttempts(
  identifier: string | { ownerUid?: string; userId?: string; userEmail?: string },
  onUpdate: (attempts: QuizAttemptResult[]) => void
): () => void {
  if (!identifier) return () => {};
  const path = 'quiz_attempts';
  const targetId = typeof identifier === 'string' ? identifier : (identifier.ownerUid || identifier.userId || auth.currentUser?.uid || '');
  const targetEmail = typeof identifier === 'object' && identifier.userEmail ? identifier.userEmail.trim().toLowerCase() : '';

  if (!targetId && !targetEmail) return () => {};

  try {
    const q = targetId 
      ? query(collection(db, path), where('ownerUid', '==', targetId))
      : query(collection(db, path), where('userEmail', '==', targetEmail));

    return onSnapshot(q, (snap) => {
      const list: QuizAttemptResult[] = [];

      snap.forEach((docItem) => {
        const data = docItem.data() as Record<string, any> | undefined;
        if (data) {
          const matchesUser = 
            (targetId && (data.userId === targetId || data.ownerUid === targetId)) ||
            (targetEmail && data.userEmail && data.userEmail.toLowerCase() === targetEmail);

          if (!matchesUser) return;

          list.push({
            attemptId: data.attemptId || docItem.id,
            entryId: data.entryId || '',
            userId: data.userId || targetId,
            ownerUid: data.ownerUid || targetId,
            userEmail: data.userEmail || targetEmail,
            userName: data.userName,
            quizDate: data.quizDate || '',
            score: data.score || 0,
            totalQuestions: data.totalQuestions || 10,
            timeTakenSeconds: data.timeTakenSeconds || 0,
            answers: data.answers || {},
            markedForReview: data.markedForReview || [],
            rank: data.rank || 1,
            totalParticipants: data.totalParticipants || 1,
            rewardWon: data.rewardWon || '',
            rewardType: data.rewardType || 'none',
            rewardAmount: data.rewardAmount || 0,
            finalPrizeRupees: data.finalPrizeRupees !== undefined ? data.finalPrizeRupees : (data.rewardAmount || 0),
            settlementStatus: data.settlementStatus || 'pending',
            title: data.title || 'Cash Tournament',
            submittedAt: data.submittedAt || new Date().toISOString(),
            contestId: data.contestId || ''
          } as QuizAttemptResult);
        }
      });

      list.sort((a, b) => {
        const timeA = new Date(a.submittedAt || 0).getTime();
        const timeB = new Date(b.submittedAt || 0).getTime();
        return timeB - timeA;
      });

      onUpdate(list);
    }, (err) => {
      console.warn('Quiz attempts subscription notice:', err);
    });
  } catch (err) {
    console.warn('Quiz attempts setup notice:', err);
    return () => {};
  }
}

// Deposit Requests Cloud Database Sync
export async function saveDepositToFirestore(deposit: DepositRequest): Promise<void> {
  if (!deposit || !deposit.id || isFirestoreQuotaExceeded()) return;
  const path = `deposits/${deposit.id}`;
  const cleanEmail = (deposit.userEmail || deposit.email || auth.currentUser?.email || '').trim().toLowerCase();
  const resolvedOwnerUid = deposit.ownerUid || deposit.userId || auth.currentUser?.uid || (cleanEmail ? `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : `usr-${deposit.id}`);
  const persistentRequestId = deposit.requestId || deposit.id;

  try {
    await setDoc(doc(db, 'deposits', deposit.id), {
      id: deposit.id,
      requestId: persistentRequestId,
      ownerUid: resolvedOwnerUid,
      userId: resolvedOwnerUid,
      userName: deposit.userName || '',
      userEmail: cleanEmail,
      email: cleanEmail,
      phone: deposit.phone || '',
      upiId: deposit.upiId || '',
      amount: Number(deposit.amount),
      utrNumber: deposit.utrNumber || '',
      screenshotUrl: deposit.screenshotUrl || '',
      app: deposit.app || 'PhonePe',
      timestamp: deposit.timestamp || new Date().toISOString(),
      date: deposit.date || new Date().toISOString().split('T')[0],
      createdAt: deposit.createdAt || new Date().toISOString(),
      status: deposit.status || 'pending',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (auth.currentUser && !isFirestoreQuotaExceeded()) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        pendingDepositId: deposit.status === 'pending' ? deposit.id : null,
        pendingDepositStatus: deposit.status,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateDepositStatusInFirestore(depositId: string, status: 'pending' | 'approved' | 'rejected' | 'cancelled'): Promise<void> {
  if (!depositId || isFirestoreQuotaExceeded()) return;
  const path = `deposits/${depositId}`;
  try {
    await setDoc(doc(db, 'deposits', depositId), {
      status,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (auth.currentUser && !isFirestoreQuotaExceeded()) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        pendingDepositId: status === 'pending' ? depositId : null,
        pendingDepositStatus: status,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchDepositsFromFirestore(ownerUid?: string, userEmail?: string): Promise<DepositRequest[]> {
  if (isFirestoreQuotaExceeded()) return [];

  const path = 'deposits';
  try {
    const q = collection(db, path);
    const snap = await getDocs(q);
    const list: DepositRequest[] = [];
    const cleanTargetUid = (ownerUid || '').trim();
    const cleanTargetEmail = (userEmail || '').trim().toLowerCase();

    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        const item: DepositRequest = {
          ...data,
          id: data.id || docItem.id,
          requestId: data.requestId || data.id || docItem.id,
          status: (data.status as any) || 'pending'
        } as DepositRequest;

        if (!cleanTargetUid && !cleanTargetEmail) {
          list.push(item);
        } else {
          const itemUid = (item.ownerUid || item.userId || '').trim();
          const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
          const isMatch = (cleanTargetUid && (itemUid === cleanTargetUid || itemUid.replace(/^usr-/, '') === cleanTargetUid.replace(/^usr-/, ''))) ||
                          (cleanTargetEmail && itemEmail === cleanTargetEmail);
          if (isMatch) {
            list.push(item);
          }
        }
      }
    });

    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    handlePossibleQuotaError(error);
    return [];
  }
}

export function subscribeToDepositsFromFirestore(
  callback: (deposits: DepositRequest[]) => void,
  ownerUid?: string,
  userEmail?: string
): () => void {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'deposits';
  const cleanTargetUid = (ownerUid || '').trim();
  const cleanTargetEmail = (userEmail || '').trim().toLowerCase();

  try {
    const unsubscribe = onSnapshot(collection(db, path), (snap) => {
      const list: DepositRequest[] = [];
      snap.forEach((docItem) => {
        const data = docItem.data();
        if (data) {
          const item: DepositRequest = {
            ...data,
            id: data.id || docItem.id,
            requestId: data.requestId || data.id || docItem.id,
            status: (data.status as any) || 'pending'
          } as DepositRequest;

          if (!cleanTargetUid && !cleanTargetEmail) {
            list.push(item);
          } else {
            const itemUid = (item.ownerUid || item.userId || '').trim();
            const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
            const isMatch = (cleanTargetUid && (itemUid === cleanTargetUid || itemUid.replace(/^usr-/, '') === cleanTargetUid.replace(/^usr-/, ''))) ||
                            (cleanTargetEmail && itemEmail === cleanTargetEmail);
            if (isMatch) {
              list.push(item);
            }
          }
        }
      });

      list.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      callback(list);
    }, (err) => {
      handlePossibleQuotaError(err);
    });

    return unsubscribe;
  } catch {
    return () => {};
  }
}

export async function deleteDepositFromFirestore(depositId: string): Promise<void> {
  // STRICT ZERO-DELETION POLICY:
  // Historical financial records are never deleted from Firestore.
  // When an admin or user cancels a record, its status is updated to 'cancelled'.
  await updateDepositStatusInFirestore(depositId, 'cancelled');
}

export async function saveDepositQrToFirestore(qrDataUrl: string): Promise<void> {
  if (!qrDataUrl || isFirestoreQuotaExceeded()) return;
  const path = 'settings/deposit_qr';
  try {
    await setDoc(doc(db, 'settings', 'deposit_qr'), {
      qrDataUrl,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchDepositQrFromFirestore(): Promise<string | null> {
  const path = 'settings/deposit_qr';
  try {
    const snap = await getDoc(doc(db, 'settings', 'deposit_qr'));
    if (snap.exists() && snap.data()?.qrDataUrl) {
      return snap.data().qrDataUrl as string;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Global Quiz Arena Timer Persistence & Realtime Cloud Lock
export async function saveQuizTimerToFirestore(seconds: number): Promise<void> {
  if (!seconds || seconds <= 0 || isFirestoreQuotaExceeded()) return;
  const path = 'settings/quiz_timer';
  try {
    await setDoc(doc(db, 'settings', 'quiz_timer'), {
      key: 'quiz_timer',
      seconds,
      data: seconds.toString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchQuizTimerFromFirestore(): Promise<number | null> {
  const path = 'settings/quiz_timer';
  try {
    const snap = await getDoc(doc(db, 'settings', 'quiz_timer'));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data?.seconds === 'number' && data.seconds > 0) {
        return data.seconds;
      }
      if (data?.data) {
        const parsed = parseInt(data.data, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function subscribeToQuizTimer(callback: (seconds: number) => void): () => void {
  try {
    const unsub = onSnapshot(doc(db, 'settings', 'quiz_timer'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data?.seconds === 'number' && data.seconds > 0) {
          callback(data.seconds);
        } else if (data?.data) {
          const parsed = parseInt(data.data, 10);
          if (!isNaN(parsed) && parsed > 0) callback(parsed);
        }
      }
    }, () => {});
    return unsub;
  } catch {
    return () => {};
  }
}

// Withdrawal Requests Cloud Database Sync
export async function saveWithdrawalToFirestore(w: WithdrawalRequest): Promise<void> {
  if (!w || !w.id || isFirestoreQuotaExceeded()) return;
  const path = `withdrawals/${w.id}`;
  const cleanEmail = (w.userEmail || w.email || auth.currentUser?.email || '').trim().toLowerCase();
  const resolvedOwnerUid = w.ownerUid || w.userId || auth.currentUser?.uid || (cleanEmail ? `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : `usr-${w.id}`);
  const persistentRequestId = w.requestId || w.id;

  try {
    await setDoc(doc(db, 'withdrawals', w.id), {
      id: w.id,
      requestId: persistentRequestId,
      ownerUid: resolvedOwnerUid,
      userId: resolvedOwnerUid,
      userName: w.userName || '',
      userEmail: cleanEmail,
      email: cleanEmail,
      phone: w.phone || '',
      accountHolderName: w.accountHolderName || '',
      accountNumber: w.accountNumber || '',
      confirmAccountNumber: w.confirmAccountNumber || '',
      ifscCode: w.ifscCode || '',
      amount: Number(w.amount),
      timestamp: w.timestamp || new Date().toISOString(),
      date: w.date || new Date().toISOString().split('T')[0],
      createdAt: w.createdAt || new Date().toISOString(),
      status: w.status || 'pending',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateWithdrawalStatusInFirestore(withdrawalId: string, status: 'pending' | 'approved' | 'rejected' | 'cancelled'): Promise<void> {
  if (!withdrawalId || isFirestoreQuotaExceeded()) return;
  const path = `withdrawals/${withdrawalId}`;
  try {
    await setDoc(doc(db, 'withdrawals', withdrawalId), {
      status,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchWithdrawalsFromFirestore(ownerUid?: string, userEmail?: string): Promise<WithdrawalRequest[]> {
  const currentUser = auth.currentUser;
  if (isFirestoreQuotaExceeded()) return [];

  const isAdmin = currentUser?.email === 'nmlcompany720@gmail.com';
  const path = 'withdrawals';
  try {
    const q = collection(db, path);
    const snap = await getDocs(q);
    const list: WithdrawalRequest[] = [];
    const cleanTargetUid = (ownerUid || currentUser?.uid || '').trim();
    const cleanTargetEmail = (userEmail || currentUser?.email || '').trim().toLowerCase();

    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        const item: WithdrawalRequest = {
          ...data,
          id: data.id || docItem.id,
          requestId: data.requestId || data.id || docItem.id,
          status: (data.status as any) || 'pending'
        } as WithdrawalRequest;

        if (isAdmin || (!cleanTargetUid && !cleanTargetEmail)) {
          list.push(item);
        } else {
          const itemUid = (item.ownerUid || item.userId || '').trim();
          const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
          const isMatch = (cleanTargetUid && (itemUid === cleanTargetUid || itemUid.replace(/^usr-/, '') === cleanTargetUid.replace(/^usr-/, ''))) ||
                          (cleanTargetEmail && itemEmail === cleanTargetEmail);
          if (isMatch) {
            list.push(item);
          }
        }
      }
    });

    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    handlePossibleQuotaError(error);
    return [];
  }
}

export function subscribeToWithdrawalsFromFirestore(
  callback: (withdrawals: WithdrawalRequest[]) => void,
  ownerUid?: string,
  userEmail?: string
): () => void {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'withdrawals';
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'nmlcompany720@gmail.com';
  const cleanTargetUid = (ownerUid || currentUser?.uid || '').trim();
  const cleanTargetEmail = (userEmail || currentUser?.email || '').trim().toLowerCase();

  try {
    const unsubscribe = onSnapshot(collection(db, path), (snap) => {
      const list: WithdrawalRequest[] = [];
      snap.forEach((docItem) => {
        const data = docItem.data();
        if (data) {
          const item: WithdrawalRequest = {
            ...data,
            id: data.id || docItem.id,
            requestId: data.requestId || data.id || docItem.id,
            status: (data.status as any) || 'pending'
          } as WithdrawalRequest;

          if (isAdmin || (!cleanTargetUid && !cleanTargetEmail)) {
            list.push(item);
          } else {
            const itemUid = (item.ownerUid || item.userId || '').trim();
            const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
            const isMatch = (cleanTargetUid && (itemUid === cleanTargetUid || itemUid.replace(/^usr-/, '') === cleanTargetUid.replace(/^usr-/, ''))) ||
                            (cleanTargetEmail && itemEmail === cleanTargetEmail);
            if (isMatch) {
              list.push(item);
            }
          }
        }
      });

      list.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      callback(list);
    }, (err) => {
      handlePossibleQuotaError(err);
    });

    return unsubscribe;
  } catch {
    return () => {};
  }
}

export async function deleteWithdrawalFromFirestore(withdrawalId: string): Promise<void> {
  // STRICT ZERO-DELETION POLICY:
  // Update status to 'cancelled' to preserve ledger and audit history.
  await updateWithdrawalStatusInFirestore(withdrawalId, 'cancelled');
}

// Support Tickets Cloud Database Sync
export async function saveSupportTicketToFirestore(ticket: SupportTicket): Promise<void> {
  if (!ticket || !ticket.id || isFirestoreQuotaExceeded()) return;
  const path = `support_tickets/${ticket.id}`;
  try {
    await setDoc(doc(db, 'support_tickets', ticket.id), {
      ...ticket,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore ticket save notice (${ticket.id}):`, error);
  }
}

export async function fetchSupportTicketsFromFirestore(): Promise<SupportTicket[]> {
  const currentUser = auth.currentUser;
  if (!currentUser || isFirestoreQuotaExceeded()) return [];

  const isAdmin = currentUser.email === 'nmlcompany720@gmail.com';
  const path = 'support_tickets';
  try {
    const q = isAdmin 
      ? collection(db, path) 
      : query(collection(db, path), where('userEmail', '==', (currentUser.email || '').toLowerCase()));
    const snap = await getDocs(q);
    const list: SupportTicket[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as SupportTicket);
      }
    });
    return list;
  } catch (error) {
    handlePossibleQuotaError(error);
    return [];
  }
}

export async function deleteSupportTicketFromFirestore(ticketId: string): Promise<void> {
  if (!ticketId || isFirestoreQuotaExceeded()) return;
  try {
    await deleteDoc(doc(db, 'support_tickets', ticketId));
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore ticket deletion notice (${ticketId}):`, error);
  }
  try {
    if (!isFirestoreQuotaExceeded()) {
      const q = query(collection(db, 'support_tickets'), where('id', '==', ticketId));
      const snap = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      snap.forEach((docItem) => {
        deletePromises.push(deleteDoc(docItem.ref));
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    }
  } catch {}
}

// Contest Entries Firestore Cloud Database Persistence
export async function saveContestEntryToFirestore(entry: ContestEntry): Promise<void> {
  if (!entry || !entry.entryId || isFirestoreQuotaExceeded()) return;
  const path = `contest_entries/${entry.entryId}`;
  try {
    await setDoc(doc(db, 'contest_entries', entry.entryId), {
      ...entry,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore contest entry save notice (${entry.entryId}):`, error);
  }
}

export async function fetchContestEntriesFromFirestore(contestId: string): Promise<ContestEntry[]> {
  if (!contestId || isFirestoreQuotaExceeded()) return [];
  const path = 'contest_entries';
  try {
    const q = query(collection(db, path), where('contestId', '==', contestId));
    const snap = await getDocs(q);
    const list: ContestEntry[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data && data.entryId) {
        list.push(data as ContestEntry);
      }
    });
    return list;
  } catch (error) {
    return [];
  }
}

export function subscribeToContestEntriesFromFirestore(
  contestId: string,
  callback: (entries: ContestEntry[]) => void
): () => void {
  if (!contestId || isFirestoreQuotaExceeded()) return () => {};
  const path = 'contest_entries';
  try {
    const q = query(collection(db, path), where('contestId', '==', contestId));
    return onSnapshot(
      q,
      (snap) => {
        const list: ContestEntry[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data && data.entryId) {
            list.push(data as ContestEntry);
          }
        });
        callback(list);
      },
      (error) => {
        handlePossibleQuotaError(error);
        console.warn(`Firestore contest entries subscription notice (${contestId}):`, error);
      }
    );
  } catch (err) {
    return () => {};
  }
}

export async function fetchAllContestEntriesFromFirestore(): Promise<ContestEntry[]> {
  if (isFirestoreQuotaExceeded()) return [];
  const path = 'contest_entries';
  try {
    const snap = await getDocs(collection(db, path));
    const list: ContestEntry[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data && data.entryId) {
        list.push(data as ContestEntry);
      }
    });
    return list;
  } catch (error) {
    return [];
  }
}


// Financial Ledger Audit Records Persistence
export async function saveFinancialLedgerToFirestore(record: FinancialLedgerRecord): Promise<void> {
  if (!record || !record.transactionId || isFirestoreQuotaExceeded()) return;
  const path = `financial_ledgers/${record.transactionId}`;
  try {
    await setDoc(doc(db, 'financial_ledgers', record.transactionId), {
      ...record,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore ledger save notice (${record.transactionId}):`, error);
  }
}

export async function fetchFinancialLedgersFromFirestore(contestId?: string, ownerUid?: string): Promise<FinancialLedgerRecord[]> {
  if (isFirestoreQuotaExceeded()) return [];
  const path = 'financial_ledgers';
  try {
    let q = query(collection(db, path));
    if (contestId) {
      q = query(collection(db, path), where('contestId', '==', contestId));
    } else if (ownerUid) {
      q = query(collection(db, path), where('ownerUid', '==', ownerUid));
    }
    const snap = await getDocs(q);
    const list: FinancialLedgerRecord[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data && data.transactionId) {
        list.push(data as FinancialLedgerRecord);
      }
    });
    list.sort((a, b) => b.timestampMs - a.timestampMs);
    return list;
  } catch (error) {
    return [];
  }
}

// Contest Final Settlement Wallet Credit Helper with strict Idempotency Guard
export async function creditWalletForSettlement(
  ownerUid: string, 
  amountRupees: number, 
  contestId?: string,
  fallbackUserId?: string,
  userEmail?: string
): Promise<boolean> {
  if (!ownerUid || amountRupees <= 0 || isFirestoreQuotaExceeded()) return false;
  try {
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const strippedOwnerUid = ownerUid.replace(/^usr-/, '');

    const userDocRef = doc(db, 'users', ownerUid);
    const strippedDocRef = strippedOwnerUid !== ownerUid ? doc(db, 'users', strippedOwnerUid) : null;
    const emailDocRef = safeEmailDocId ? doc(db, 'users', safeEmailDocId) : null;
    const fallbackDocRef = fallbackUserId && fallbackUserId !== ownerUid ? doc(db, 'users', fallbackUserId) : null;
    const settlementDocId = contestId ? `settlement_${contestId}_${ownerUid}` : null;
    const settlementDocRef = settlementDocId ? doc(db, 'contest_settlements', settlementDocId) : null;

    let credited = false;
    await runTransaction(db, async (transaction) => {
      if (settlementDocRef) {
        const existingSettlement = await transaction.get(settlementDocRef);
        if (existingSettlement.exists()) {
          // Idempotency: Already credited for this contest and user
          return;
        }
      }

      let targetRef = userDocRef;
      let userDoc = await transaction.get(userDocRef);

      if (!userDoc.exists() && strippedDocRef) {
        const snap = await transaction.get(strippedDocRef);
        if (snap.exists()) {
          userDoc = snap;
          targetRef = strippedDocRef;
        }
      }

      if (!userDoc.exists() && emailDocRef) {
        const snap = await transaction.get(emailDocRef);
        if (snap.exists()) {
          userDoc = snap;
          targetRef = emailDocRef;
        }
      }

      if (!userDoc.exists() && fallbackDocRef) {
        const fallbackSnap = await transaction.get(fallbackDocRef);
        if (fallbackSnap.exists()) {
          userDoc = fallbackSnap;
          targetRef = fallbackDocRef;
        }
      }

      if (!userDoc.exists() && auth.currentUser?.uid && auth.currentUser.uid !== ownerUid) {
        const authDocRef = doc(db, 'users', auth.currentUser.uid);
        const authSnap = await transaction.get(authDocRef);
        if (authSnap.exists()) {
          userDoc = authSnap;
          targetRef = authDocRef;
        }
      }

      if (userDoc.exists()) {
        const data = userDoc.data();
        const currentBal = Number(data?.walletBalance) || 0;
        const currentWon = Number(data?.totalWonAmount) || 0;

        transaction.update(targetRef, {
          walletBalance: currentBal + amountRupees,
          totalWonAmount: currentWon + amountRupees,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Initialize user doc if not yet created in Firestore
        const chosenRef = emailDocRef || (auth.currentUser?.uid ? doc(db, 'users', auth.currentUser.uid) : targetRef);
        transaction.set(chosenRef, {
          id: fallbackUserId || ownerUid,
          uid: auth.currentUser?.uid || ownerUid,
          email: cleanEmail,
          walletBalance: amountRupees,
          totalWonAmount: amountRupees,
          quizzesPlayed: 1,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      if (settlementDocRef) {
        transaction.set(settlementDocRef, {
          contestId: contestId || '',
          ownerUid,
          prizeRupees: amountRupees,
          creditedAt: new Date().toISOString()
        });
      }
      credited = true;
    });
    return credited;
  } catch (err) {
    console.warn(`Wallet credit transaction notice for ${ownerUid}:`, err);
    return false;
  }
}

export async function updateQuizAttemptPrizeInFirestore(
  contestId: string,
  ownerUid: string,
  finalPrizeRupees: number,
  finalRank?: number,
  entryId?: string,
  fallbackUserId?: string,
  userEmail?: string
): Promise<void> {
  if (!contestId || (!ownerUid && !fallbackUserId && !userEmail) || isFirestoreQuotaExceeded()) return;
  try {
    const targetUids = Array.from(new Set([ownerUid, fallbackUserId, auth.currentUser?.uid].filter(Boolean))) as string[];
    for (const uid of targetUids) {
      const q = query(collection(db, 'quiz_attempts'), where('ownerUid', '==', uid));
      const snap = await getDocs(q);
      snap.forEach((docItem) => {
        const data = docItem.data();
        if (data && (data.contestId === contestId || docItem.id.includes(contestId))) {
          if (!entryId || !data.entryId || data.entryId === entryId) {
            updateDoc(doc(db, 'quiz_attempts', docItem.id), {
              finalPrizeRupees,
              rewardAmount: finalPrizeRupees,
              rewardWon: finalPrizeRupees > 0 ? `₹${finalPrizeRupees} Won` : 'Better Luck Next Time',
              settlementStatus: 'settled',
              ...(finalRank ? { rank: finalRank } : {}),
              ...(entryId ? { entryId } : {}),
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
        }
      });

      // Also check where userId == uid
      const qUser = query(collection(db, 'quiz_attempts'), where('userId', '==', uid));
      const snapUser = await getDocs(qUser);
      snapUser.forEach((docItem) => {
        const data = docItem.data();
        if (data && (data.contestId === contestId || docItem.id.includes(contestId))) {
          if (!entryId || !data.entryId || data.entryId === entryId) {
            updateDoc(doc(db, 'quiz_attempts', docItem.id), {
              finalPrizeRupees,
              rewardAmount: finalPrizeRupees,
              rewardWon: finalPrizeRupees > 0 ? `₹${finalPrizeRupees} Won` : 'Better Luck Next Time',
              settlementStatus: 'settled',
              ...(finalRank ? { rank: finalRank } : {}),
              ...(entryId ? { entryId } : {}),
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
        }
      });
    }

    const cleanEmail = (userEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      const qEmail = query(collection(db, 'quiz_attempts'), where('userEmail', '==', cleanEmail));
      const snapEmail = await getDocs(qEmail);
      snapEmail.forEach((docItem) => {
        const data = docItem.data();
        if (data && (data.contestId === contestId || docItem.id.includes(contestId))) {
          if (!entryId || !data.entryId || data.entryId === entryId) {
            updateDoc(doc(db, 'quiz_attempts', docItem.id), {
              finalPrizeRupees,
              rewardAmount: finalPrizeRupees,
              rewardWon: finalPrizeRupees > 0 ? `₹${finalPrizeRupees} Won` : 'Better Luck Next Time',
              settlementStatus: 'settled',
              ...(finalRank ? { rank: finalRank } : {}),
              ...(entryId ? { entryId } : {}),
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to update quiz attempt prize in Firestore:', err);
  }
}

export async function syncUserNameAcrossContestEntriesInFirestore(
  ownerUid: string,
  newUserName: string
): Promise<void> {
  if (!ownerUid || !newUserName || !newUserName.trim() || isFirestoreQuotaExceeded()) return;
  const cleanName = newUserName.trim();
  try {
    // 1. Synchronize name on all active contest entries for this ownerUid
    const qEntries = query(collection(db, 'contest_entries'), where('ownerUid', '==', ownerUid));
    const snapEntries = await getDocs(qEntries);
    snapEntries.forEach((docItem) => {
      const data = docItem.data();
      if (data && data.isActive && data.status === 'active') {
        updateDoc(doc(db, 'contest_entries', docItem.id), {
          userName: cleanName,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }
    });

    // 2. Synchronize name on active/pending quiz attempts for this ownerUid
    const qAttempts = query(collection(db, 'quiz_attempts'), where('ownerUid', '==', ownerUid));
    const snapAttempts = await getDocs(qAttempts);
    snapAttempts.forEach((docItem) => {
      updateDoc(doc(db, 'quiz_attempts', docItem.id), {
        userName: cleanName,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    });
  } catch (err) {
    console.warn('Failed to sync user name across contest entries in Firestore:', err);
  }
}



