import { initializeApp } from 'firebase/app';
import { 
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  getRedirectResult,
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
import { ensureLocalStorageHeadroomForAuth, isStorageQuotaError } from './utils/storageHygiene';
import { contestBackend } from './backend/contestEngine';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with specific database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Silence Firestore internal SDK logs (e.g., maximum backoff retry notices and quota warnings)
try {
  setLogLevel('silent');
} catch {}

// Reclaim only redundant bloated cache mirrors if localStorage is near quota (never clearing user data or IndexedDB)
ensureLocalStorageHeadroomForAuth();

// Designated Admin account authorized for central Firestore Registered Users access
export const AUTHORIZED_ADMIN_EMAIL = 'nmlcompany720@gmail.com';

export type AuthPersistenceMode =
  | 'indexedDBLocalPersistence'
  | 'browserSessionPersistence'
  | 'inMemoryPersistence'
  | 'failed';

export interface AuthPersistenceStatus {
  mode: AuthPersistenceMode;
  isPersistentAcrossRefresh: boolean;
  warning?: string;
  error?: string;
}

// Initialize Firebase Authentication with IndexedDB persistence FIRST (avoids 5MB localStorage quota limit)
export const auth = (() => {
  if (typeof window !== 'undefined') {
    try {
      return initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserSessionPersistence, inMemoryPersistence],
        popupRedirectResolver: browserPopupRedirectResolver
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
})();

// Clean Identity-only Google Auth Provider (NO restricted Workspace scopes so standard Admin & User login never triggers unverified Workspace App Verification warnings)
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Google Chat OAuth Scopes for Workspace integration (isolated to explicit Google Chat requests only)
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

export const googleChatProvider = new GoogleAuthProvider();
GOOGLE_CHAT_SCOPES.forEach((scope) => {
  googleChatProvider.addScope(scope);
});

// In-memory access token cache (NOT stored in localStorage or sessionStorage per security requirements)
let cachedAccessToken: string | null = null;

let authPersistenceStatus: AuthPersistenceStatus = {
  mode: typeof window !== 'undefined' && typeof indexedDB !== 'undefined' ? 'indexedDBLocalPersistence' : 'inMemoryPersistence',
  isPersistentAcrossRefresh: typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
};

export function getAuthPersistenceStatus(): AuthPersistenceStatus {
  return { ...authPersistenceStatus };
}

async function ensureBestAuthPersistence(): Promise<AuthPersistenceStatus> {
  if (typeof window === 'undefined') {
    authPersistenceStatus = { mode: 'inMemoryPersistence', isPersistentAcrossRefresh: false };
    return authPersistenceStatus;
  }

  let idbError: unknown = null;
  if (typeof window.indexedDB !== 'undefined') {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      authPersistenceStatus = {
        mode: 'indexedDBLocalPersistence',
        isPersistentAcrossRefresh: true
      };
      return authPersistenceStatus;
    } catch (err) {
      idbError = err;
      console.warn('IndexedDB Auth persistence unavailable, falling back to browserSessionPersistence:', err);
    }
  }

  let sessionError: unknown = null;
  try {
    await setPersistence(auth, browserSessionPersistence);
    authPersistenceStatus = {
      mode: 'browserSessionPersistence',
      isPersistentAcrossRefresh: true,
      warning: idbError
        ? 'IndexedDB storage was unavailable; Admin session is using tab sessionStorage fallback.'
        : 'IndexedDB not supported in this browser; Admin session is using tab sessionStorage fallback.'
    };
    return authPersistenceStatus;
  } catch (err) {
    sessionError = err;
    console.warn('browserSessionPersistence unavailable, falling back to inMemoryPersistence:', err);
  }

  try {
    await setPersistence(auth, inMemoryPersistence);
    authPersistenceStatus = {
      mode: 'inMemoryPersistence',
      isPersistentAcrossRefresh: false,
      warning: 'Browser persistent storage (IndexedDB & sessionStorage) is restricted or full; session will stay active in memory until tab reload.'
    };
    return authPersistenceStatus;
  } catch (memErr: any) {
    const idbMsg = idbError instanceof Error ? idbError.message : String(idbError || 'unavailable');
    const sessMsg = sessionError instanceof Error ? sessionError.message : String(sessionError || 'unavailable');
    const memMsg = memErr instanceof Error ? memErr.message : String(memErr || 'unavailable');
    const errorMsg = `Firebase Auth persistence failed across IndexedDB (${idbMsg}), SessionStorage (${sessMsg}), and In-Memory (${memMsg}).`;
    console.error(errorMsg);
    authPersistenceStatus = {
      mode: 'failed',
      isPersistentAcrossRefresh: false,
      error: errorMsg
    };
    return authPersistenceStatus;
  }
}

// Initialize persistence priority chain immediately before redirect recovery or Firestore listeners
const authPersistencePromise: Promise<AuthPersistenceStatus> = ensureBestAuthPersistence();

let redirectRecoveryError: { code: string; message: string } | null = null;
const authRedirectRecoveryPromise: Promise<User | null> =
  typeof window !== 'undefined'
    ? authPersistencePromise
        .then((status) => {
          if (status.mode === 'failed') return null;
          return getRedirectResult(auth);
        })
        .then((result) => {
          if (result) {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
              cachedAccessToken = credential.accessToken;
            }
            return result.user;
          }
          return null;
        })
        .catch((err: any) => {
          redirectRecoveryError = {
            code: String(err?.code || 'auth/redirect-error'),
            message: err?.message || 'Google sign-in redirect did not complete.'
          };
          return null;
        })
    : Promise.resolve(null);

export async function waitForFirebaseAuthReady(): Promise<User | null> {
  await authPersistencePromise;
  try {
    await authRedirectRecoveryPromise;
  } catch {}
  try {
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
  } catch {}
  return auth.currentUser;
}

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
let activeSignInPromise: Promise<{ user: User | null; accessToken: string | null; errorCode?: string; errorMessage?: string }> | null = null;

export interface AdminAuthVerificationResult {
  status: 'authorized' | 'unauthenticated' | 'unauthorized_account' | 'unverified_email' | 'permission_denied' | 'cancelled' | 'error';
  user: User | null;
  users?: UserProfile[];
  errorCode?: string;
  errorMessage?: string;
}

function formatGoogleAuthErrorMessage(errorCode: string, rawMessage: string): string {
  if (errorCode === 'auth/popup-blocked') {
    return 'Browser blocked the Google Sign-In popup. Please allow popups for this site and try again.';
  }
  if (errorCode === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
    return `Domain "${host}" is not authorized in Firebase Authentication Authorized Domains.`;
  }
  if (errorCode === 'auth/operation-not-allowed') {
    return 'Google Sign-In provider is not enabled in Firebase Authentication.';
  }
  if (errorCode === 'auth/network-request-failed') {
    return 'Unable to connect to Google Sign-In. Please check your connection and try again.';
  }
  if (errorCode === 'auth/web-storage-unsupported' || rawMessage.toLowerCase().includes('exceeded the quota') || rawMessage.toLowerCase().includes('quotaexceeded')) {
    return `Browser storage quota prevented saving the Auth session (${rawMessage}). IndexedDB or memory fallback is required.`;
  }
  return rawMessage || 'Google Authentication failed.';
}

export async function signInWithGoogle(options?: { selectAccount?: boolean }): Promise<{
  user: User | null;
  accessToken: string | null;
  errorCode?: string;
  errorMessage?: string;
}> {
  if (activeSignInPromise) {
    return await activeSignInPromise;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  if (options?.selectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }

  activeSignInPromise = (async () => {
    try {
      const persistenceStatus = await authPersistencePromise;
      if (persistenceStatus.mode === 'failed') {
        return {
          user: null,
          accessToken: null,
          errorCode: 'auth/persistence-failed',
          errorMessage: persistenceStatus.error || 'Firebase Auth storage persistence initialization failed.'
        };
      }

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        cachedAccessToken = token;
      }
      redirectRecoveryError = null;
      return { user: result.user, accessToken: token };
    } catch (error: any) {
      const rawMsg = error?.message || String(error || '');
      const errorCode = String(error?.code || (isStorageQuotaError(error) ? 'auth/storage-quota-exceeded' : 'auth/unknown'));
      if (
        errorCode === 'auth/cancelled-popup-request' ||
        errorCode === 'auth/popup-closed-by-user'
      ) {
        return {
          user: null,
          accessToken: null,
          errorCode,
          errorMessage: 'Google Sign-In window was closed before completing login.'
        };
      }

      if (isStorageQuotaError(error) || errorCode === 'auth/web-storage-unsupported') {
        ensureLocalStorageHeadroomForAuth();
        try {
          await setPersistence(auth, indexedDBLocalPersistence);
          authPersistenceStatus = { mode: 'indexedDBLocalPersistence', isPersistentAcrossRefresh: true };
        } catch {
          try {
            await setPersistence(auth, inMemoryPersistence);
            authPersistenceStatus = {
              mode: 'inMemoryPersistence',
              isPersistentAcrossRefresh: false,
              warning: 'Using in-memory Auth persistence after browser storage quota error.'
            };
          } catch (fallbackErr: any) {
            const failMsg = `Auth storage quota exceeded (${rawMsg}) and fallback persistence failed (${fallbackErr?.message || fallbackErr}).`;
            authPersistenceStatus = { mode: 'failed', isPersistentAcrossRefresh: false, error: failMsg };
            return {
              user: null,
              accessToken: null,
              errorCode: 'auth/persistence-failed',
              errorMessage: failMsg
            };
          }
        }
      }

      const errorMessage = formatGoogleAuthErrorMessage(errorCode, rawMsg);
      console.warn('Google Sign In notice:', errorCode, errorMessage);
      return {
        user: null,
        accessToken: null,
        errorCode,
        errorMessage
      };
    } finally {
      activeSignInPromise = null;
    }
  })();

  return await activeSignInPromise;
}

export async function signInForGoogleChat(): Promise<{ user: User | null; accessToken: string | null }> {
  try {
    await authPersistencePromise;
    const result = await signInWithPopup(auth, googleChatProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const errorCode = error?.code || '';
    if (
      errorCode !== 'auth/cancelled-popup-request' &&
      errorCode !== 'auth/popup-closed-by-user'
    ) {
      console.warn('Google Chat Sign In notice:', error?.message || error);
    }
    return { user: null, accessToken: null };
  }
}

export async function verifyAdminSessionAndLoadUsers(): Promise<AdminAuthVerificationResult> {
  const persistenceStatus = await authPersistencePromise;
  if (persistenceStatus.mode === 'failed') {
    return {
      status: 'error',
      user: null,
      errorCode: 'auth/persistence-failed',
      errorMessage: persistenceStatus.error || 'Failed to initialize Firebase Auth storage persistence.'
    };
  }

  const user = await waitForFirebaseAuthReady();

  if (!user) {
    if (redirectRecoveryError) {
      const err = redirectRecoveryError;
      redirectRecoveryError = null;
      return {
        status: 'error',
        user: null,
        errorCode: err.code,
        errorMessage: err.message
      };
    }
    return {
      status: 'unauthenticated',
      user: null
    };
  }

  const cleanEmail = (user.email || '').trim().toLowerCase();
  if (cleanEmail !== AUTHORIZED_ADMIN_EMAIL) {
    return {
      status: 'unauthorized_account',
      user,
      errorCode: 'auth/unauthorized-admin-email',
      errorMessage: `Signed in as ${user.email || user.uid}. Only the designated Admin account (${AUTHORIZED_ADMIN_EMAIL}) is authorized to sync the central Registered Users list.`
    };
  }

  if (user.emailVerified !== true) {
    return {
      status: 'unverified_email',
      user,
      errorCode: 'auth/email-not-verified',
      errorMessage: `Email ${user.email} is not verified in Firebase Authentication. Verify the Google account email to proceed.`
    };
  }

  // Ensure UID is recorded in /admins/{uid} for durable rule enforcement alongside verified email
  if (!isFirestoreQuotaExceeded() && user.uid) {
    setDoc(
      doc(db, 'admins', user.uid),
      {
        uid: user.uid,
        email: AUTHORIZED_ADMIN_EMAIL,
        emailVerified: true,
        role: 'admin',
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    ).catch(() => {});
  }

  const res = await fetchAllUsersWithStatusFromFirestore();
  if (res.errorCode === 'permission-denied') {
    return {
      status: 'permission_denied',
      user,
      errorCode: res.errorCode,
      errorMessage:
        'Authenticated as nmlcompany720@gmail.com, but Firestore denied read access to the users collection. Verify that the deployed Firestore rules allow verified Admin access.'
    };
  }
  if (res.errorCode) {
    return {
      status: 'error',
      user,
      errorCode: res.errorCode,
      errorMessage: res.errorMessage || 'Failed to load central Registered Users from Firestore.'
    };
  }

  return {
    status: 'authorized',
    user,
    users: res.users
  };
}

export async function signInAdminWithGoogle(): Promise<AdminAuthVerificationResult> {
  // 1. Synchronous fast-path: if already signed in as verified Admin, verify Firestore permissions without triggering a popup loop
  const existingUser = auth.currentUser;
  if (
    existingUser &&
    (existingUser.email || '').trim().toLowerCase() === AUTHORIZED_ADMIN_EMAIL &&
    existingUser.emailVerified === true
  ) {
    const existingCheck = await verifyAdminSessionAndLoadUsers();
    if (existingCheck.status === 'authorized') {
      return existingCheck;
    }
  }

  // 2. Launch clean Identity-only Google Popup immediately inside user gesture (with account selector)
  const signInRes = await signInWithGoogle({ selectAccount: true });
  if (!signInRes.user) {
    const code = signInRes.errorCode || 'auth/unknown';
    if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
      return {
        status: 'cancelled',
        user: auth.currentUser,
        errorCode: code,
        errorMessage: 'Google sign-in was cancelled. Click Authorize when ready.'
      };
    }
    return {
      status: 'error',
      user: auth.currentUser,
      errorCode: code,
      errorMessage: signInRes.errorMessage || 'Google Admin authorization failed.'
    };
  }

  // 3. Verify UID, email, emailVerified, and live Firestore permission
  return await verifyAdminSessionAndLoadUsers();
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

function parseValidSequentialUserId(rawId?: string | null, rawNumber?: number): { customUserId: string; userNumber: number } | null {
  if (rawId && /^(?:QK-)?USR-\d+$/i.test(String(rawId).trim())) {
    const clean = String(rawId).trim().toUpperCase();
    const idStr = clean.startsWith('QK-') ? clean : `QK-${clean}`;
    const numMatch = idStr.match(/(\d+)/);
    const num = typeof rawNumber === 'number' && rawNumber >= 1000 && rawNumber < 999999
      ? rawNumber
      : (numMatch ? parseInt(numMatch[1], 10) : 1001);
    return { customUserId: idStr, userNumber: num };
  }
  if (typeof rawNumber === 'number' && rawNumber >= 1000 && rawNumber < 999999) {
    return { customUserId: `QK-USR-${rawNumber}`, userNumber: rawNumber };
  }
  return null;
}

/**
 * Ensures settings/user_counter.lastUserNumber is at least minUserNumber so future
 * registrations never collide with any existing user ID.
 */
export async function syncUserCounterMinimum(minUserNumber: number): Promise<void> {
  if (!Number.isFinite(minUserNumber) || minUserNumber < 1000 || minUserNumber >= 999999 || isFirestoreQuotaExceeded()) {
    return;
  }
  try {
    const counterRef = doc(db, 'settings', 'user_counter');
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const existing = snap.exists() ? (Number(snap.data()?.lastUserNumber ?? snap.data()?.count) || 1000) : 1000;
      if (existing < minUserNumber) {
        tx.set(counterRef, {
          lastUserNumber: minUserNumber,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    });
  } catch (err) {
    handlePossibleQuotaError(err);
  }
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
  const preExisting = parseValidSequentialUserId(existingAssignedId);
  if (preExisting) {
    return preExisting;
  }

  const cleanEmail = (targetEmail || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
  const cleanTargetUid = (targetUid || '').trim();

  // 2. Prevent ID Hijacking & Reassignment: Check if user already has an assigned ID in Firestore
  try {
    if (cleanTargetUid) {
      const snap = await getDoc(doc(db, 'users', cleanTargetUid));
      if (snap.exists()) {
        const d = snap.data();
        if (!d?.isDeleted && d?.status !== 'deleted') {
          const parsed = parseValidSequentialUserId(d?.customUserId || d?.id, d?.userNumber);
          if (parsed) return parsed;
        }
      }
    }
    if (safeEmailDocId && safeEmailDocId !== cleanTargetUid) {
      const snap = await getDoc(doc(db, 'users', safeEmailDocId));
      if (snap.exists()) {
        const d = snap.data();
        if (!d?.isDeleted && d?.status !== 'deleted') {
          const parsed = parseValidSequentialUserId(d?.customUserId || d?.id, d?.userNumber);
          if (parsed) return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Check existing user before transaction notice:', e);
  }

  // Find maximum existing user number across local known users as an additional safety floor
  let maxKnownNum = 1000;
  try {
    if (typeof localStorage !== 'undefined') {
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
    }
  } catch {}

  if (isFirestoreQuotaExceeded()) {
    const nextNum = Math.max(1000, maxKnownNum) + 1;
    return { customUserId: `QK-USR-${nextNum}`, userNumber: nextNum };
  }

  // 3. Atomic transaction on 'settings/user_counter' with retry loop for concurrent registrations
  const counterRef = doc(db, 'settings', 'user_counter');
  const userDocRef = safeEmailDocId ? doc(db, 'users', safeEmailDocId) : (cleanTargetUid ? doc(db, 'users', cleanTargetUid) : null);
  const uidDocRef = (cleanTargetUid && safeEmailDocId && cleanTargetUid !== safeEmailDocId) ? doc(db, 'users', cleanTargetUid) : null;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await runTransaction(db, async (transaction) => {
        // All transaction reads first
        const counterDoc = await transaction.get(counterRef);
        const existingUserDoc = userDocRef ? await transaction.get(userDocRef) : null;
        const existingUidDoc = uidDocRef ? await transaction.get(uidDocRef) : null;

        // Check UID doc first (highest confidence permanent binding)
        if (existingUidDoc && existingUidDoc.exists()) {
          const d = existingUidDoc.data();
          if (!d?.isDeleted && d?.status !== 'deleted') {
            const parsed = parseValidSequentialUserId(d?.customUserId || d?.id, d?.userNumber);
            if (parsed) return parsed;
          }
        }

        // Check email userDoc (verify non-deleted user doesn't already own a sequential ID)
        if (existingUserDoc && existingUserDoc.exists()) {
          const d = existingUserDoc.data();
          const isSameAuthUid = !cleanTargetUid || !d?.uid || d.uid === cleanTargetUid || (cleanEmail && String(d?.email || '').trim().toLowerCase() === cleanEmail);
          if (isSameAuthUid && !d?.isDeleted && d?.status !== 'deleted') {
            const parsed = parseValidSequentialUserId(d?.customUserId || d?.id, d?.userNumber);
            if (parsed) return parsed;
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
        const nowIso = new Date().toISOString();

        // 1. Update atomic counter
        transaction.set(counterRef, {
          lastUserNumber: nextUserNumber,
          lastAssignedAt: nowIso,
          updatedAt: nowIso
        }, { merge: true });

        // 2. Permanently bind customUserId and userNumber to user's Firestore document
        const existingCreatedAt =
          (existingUidDoc?.exists() ? existingUidDoc.data()?.createdAt : undefined) ||
          (existingUserDoc?.exists() ? existingUserDoc.data()?.createdAt : undefined) ||
          nowIso;

        if (uidDocRef) {
          transaction.set(uidDocRef, stripUndefinedFields({
            customUserId: newCustomUserId,
            id: newCustomUserId,
            userNumber: nextUserNumber,
            email: cleanEmail,
            uid: cleanTargetUid,
            createdAt: existingCreatedAt,
            updatedAt: nowIso
          }), { merge: true });
        }

        if (userDocRef) {
          const canWriteEmailDoc = !existingUserDoc?.exists() || !existingUserDoc.data()?.uid || existingUserDoc.data()?.uid === cleanTargetUid || !cleanTargetUid;
          if (canWriteEmailDoc) {
            transaction.set(userDocRef, stripUndefinedFields({
              customUserId: newCustomUserId,
              id: newCustomUserId,
              userNumber: nextUserNumber,
              email: cleanEmail,
              uid: cleanTargetUid || existingUserDoc?.data()?.uid || safeEmailDocId || newCustomUserId,
              createdAt: existingCreatedAt,
              updatedAt: nowIso
            }), { merge: true });
          }
        }

        return { customUserId: newCustomUserId, userNumber: nextUserNumber };
      });

      return result;
    } catch (txErr: any) {
      lastError = txErr;
      if (handlePossibleQuotaError(txErr)) {
        const nextNum = Math.max(1000, maxKnownNum) + 1;
        return { customUserId: `QK-USR-${nextNum}`, userNumber: nextNum };
      }
      const code = String(txErr?.code || '');
      const msg = String(txErr?.message || '');
      const isRetryable =
        code === 'aborted' ||
        code === 'failed-precondition' ||
        code === 'unavailable' ||
        msg.includes('aborted') ||
        msg.includes('Too much contention');
      if (isRetryable && attempt < 3) {
        const delayMs = 80 + attempt * 90 + Math.floor(Math.random() * 80);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      break;
    }
  }

  throw new Error(
    `Unable to assign unique sequential Registration ID via Firestore: ${lastError instanceof Error ? lastError.message : String(lastError || 'Transaction failed')}`
  );
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
export async function syncUserProfile(
  profile: UserProfile,
  options?: { throwOnError?: boolean }
): Promise<void> {
  if (!profile || isDemoSeedUser(profile)) return;
  if (isFirestoreQuotaExceeded()) {
    if (options?.throwOnError) {
      throw new Error('Registration server quota limit reached. Please try again later.');
    }
    return;
  }
  const currentUser = auth.currentUser;
  const cleanEmail = (profile.email || currentUser?.email || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
  const currentUserMatchesEmail = Boolean(
    currentUser &&
    (!cleanEmail || (currentUser.email || '').trim().toLowerCase() === cleanEmail)
  );
  const resolvedUid = (profile.uid && !profile.uid.startsWith('QK-USR-'))
    ? profile.uid
    : (currentUserMatchesEmail && currentUser?.uid ? currentUser.uid : (safeEmailDocId || profile.id || ''));
  const docId = safeEmailDocId || resolvedUid || profile.id || null;
  if (!docId) return;

  const derivedUserNumber = extractNumericUserNumber(profile);
  const resolvedCustomId = profile.customUserId || profile.id || (derivedUserNumber < 999999 ? `QK-USR-${derivedUserNumber}` : docId);
  const nowIso = new Date().toISOString();
  const resolvedCreatedAt =
    profile.createdAt ||
    (profile.registrationDate && profile.registrationDate.includes('T') ? profile.registrationDate : undefined) ||
    nowIso;
  const resolvedRegDateOnly = (profile.registrationDate || resolvedCreatedAt.split('T')[0]).split('|')[0].trim().split('T')[0].trim();

  try {
    const isUserDeleted = Boolean(profile.isDeleted) || profile.status === 'deleted' || Boolean(profile.deletedAt);
    const rawPayload: Record<string, any> = {
      uid: resolvedUid || docId,
      id: resolvedCustomId,
      customUserId: resolvedCustomId,
      userNumber: derivedUserNumber < 999999 ? derivedUserNumber : undefined,
      name: profile.name || (currentUserMatchesEmail ? currentUser?.displayName : undefined) || 'Player',
      email: cleanEmail,
      mobile: profile.mobile || '',
      countryCode: profile.countryCode || '+91',
      avatarUrl: profile.avatarUrl || (currentUserMatchesEmail ? currentUser?.photoURL : undefined) || '',
      upiId: profile.upiId || '',
      walletBalance: Number(profile.walletBalance) || 0,
      quizzesPlayed: Number(profile.quizzesPlayed) || 0,
      totalWonAmount: Number(profile.totalWonAmount) || 0,
      productsWonCount: Number(profile.productsWonCount) || 0,
      isRegistered: profile.isRegistered ?? true,
      isBlocked: Boolean(profile.isBlocked),
      blockReason: profile.blockReason || '',
      registrationDate: resolvedRegDateOnly,
      createdAt: resolvedCreatedAt,
      passwordStatus: (profile.passwordStatus && !profile.passwordStatus.includes('••••') && !profile.passwordStatus.includes('Secured')) ? profile.passwordStatus : 'player@123',
      hasPassword: profile.hasPassword ?? true,
      kycStatus: profile.kycStatus || 'Unverified',
      isDeleted: isUserDeleted,
      status: isUserDeleted ? 'deleted' : (profile.status || 'active'),
      updatedAt: nowIso
    };
    if (isUserDeleted) {
      rawPayload.deletedAt = profile.deletedAt || nowIso.split('T')[0];
      rawPayload.deletedTimestampMs = profile.deletedTimestampMs || Date.now();
    }
    const userPayload = stripUndefinedFields(rawPayload);
    await setDoc(doc(db, 'users', docId), userPayload, { merge: true });

    // ONLY mirror to currentUser.uid if the profile being synced actually belongs to the current Firebase Auth user
    if (
      currentUser?.uid &&
      currentUser.uid !== docId &&
      (profile.uid === currentUser.uid || (cleanEmail && cleanEmail === (currentUser.email || '').toLowerCase()))
    ) {
      await setDoc(doc(db, 'users', currentUser.uid), userPayload, { merge: true });
    }
  } catch (error) {
    if (handlePossibleQuotaError(error)) {
      if (options?.throwOnError) {
        throw new Error('Registration server quota limit reached. Please try again later.');
      }
      return;
    }
    console.warn('Firestore user sync notice:', error);
    if (options?.throwOnError) {
      throw error instanceof Error ? error : new Error(String(error || 'Failed to persist user profile in Firestore'));
    }
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
    if (typeof localStorage !== 'undefined') {
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
    }
  } catch {}
  return false;
}

function toTimestampMs(val?: string | number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (!val || typeof val !== 'string') return 0;
  const parsed = new Date(val).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes, deduplicates by Firebase UID (then email alias), and sorts
 * Firestore user records in exact registration order.
 */
export function normalizeAndDeduplicateFirestoreUsers(
  rawDocs: Array<{ docId: string; data: Partial<UserProfile> }>
): UserProfile[] {
  const byUid = new Map<string, UserProfile>();
  const emailToUidKey = new Map<string, string>();

  rawDocs.forEach(({ docId, data }) => {
    if (!data || isDemoSeedUser(data as UserProfile)) return;
    if (isAccountDeleted(data)) return;
    if (!data.name && !data.email && !data.customUserId) return;

    const uNum = extractNumericUserNumber(data);
    const parsedId = parseValidSequentialUserId(data.customUserId || data.id, uNum < 999999 ? uNum : undefined);
    const cId = parsedId?.customUserId || data.customUserId || data.id || '';
    const resolvedNum = parsedId?.userNumber ?? (uNum < 999999 ? uNum : undefined);

    const rawUid = (data.uid || '').trim();
    const resolvedUid = (rawUid && !rawUid.startsWith('QK-USR-'))
      ? rawUid
      : (docId && !docId.startsWith('QK-USR-') ? docId : (rawUid || docId));
    const cleanEmail = (data.email || '').trim().toLowerCase();

    const userObj: UserProfile = {
      ...(data as UserProfile),
      id: cId || resolvedUid,
      customUserId: cId || undefined,
      userNumber: resolvedNum,
      uid: resolvedUid,
      email: cleanEmail || data.email || '',
      createdAt: data.createdAt || (data.registrationDate && String(data.registrationDate).includes('T') ? data.registrationDate : undefined)
    };

    // Primary deduplication by Firebase UID; link email-alias docs with the same owner
    let targetKey = resolvedUid;
    if (!byUid.has(targetKey) && cleanEmail && emailToUidKey.has(cleanEmail)) {
      const linkedKey = emailToUidKey.get(cleanEmail)!;
      const linkedUser = byUid.get(linkedKey);
      const isDocIdAlias = !rawUid || rawUid.startsWith('QK-USR-') || docId === cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') || linkedKey === cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (linkedUser && isDocIdAlias) {
        targetKey = linkedKey;
      }
    }

    if (byUid.has(targetKey)) {
      const existing = byUid.get(targetKey)!;
      const existingUpdated = toTimestampMs(existing.updatedAt);
      const incomingUpdated = toTimestampMs(userObj.updatedAt);
      const preferIncoming = incomingUpdated >= existingUpdated;
      const earlierCreatedAt = (() => {
        const a = toTimestampMs(existing.createdAt || existing.registrationDate);
        const b = toTimestampMs(userObj.createdAt || userObj.registrationDate);
        if (a > 0 && b > 0) return a <= b ? existing.createdAt : userObj.createdAt;
        return existing.createdAt || userObj.createdAt;
      })();
      const canonicalUid =
        (existing.uid && !existing.uid.startsWith('QK-USR-') && !existing.uid.includes('_'))
          ? existing.uid
          : ((userObj.uid && !userObj.uid.startsWith('QK-USR-') && !userObj.uid.includes('_'))
              ? userObj.uid
              : (existing.uid || userObj.uid));

      const merged: UserProfile = {
        ...(preferIncoming ? existing : userObj),
        ...(preferIncoming ? userObj : existing),
        uid: canonicalUid,
        id: existing.customUserId || userObj.customUserId || existing.id || userObj.id,
        customUserId: existing.customUserId || userObj.customUserId,
        userNumber: existing.userNumber || userObj.userNumber,
        createdAt: earlierCreatedAt,
        registrationDate: existing.registrationDate || userObj.registrationDate,
        name: (preferIncoming ? userObj.name : existing.name) || existing.name || userObj.name,
        mobile: (preferIncoming ? userObj.mobile : existing.mobile) || existing.mobile || userObj.mobile,
        email: cleanEmail || existing.email || userObj.email,
        avatarUrl: (preferIncoming ? userObj.avatarUrl : existing.avatarUrl) || existing.avatarUrl || userObj.avatarUrl
      };
      byUid.set(targetKey, merged);
      if (cleanEmail) emailToUidKey.set(cleanEmail, targetKey);
    } else {
      byUid.set(targetKey, userObj);
      if (cleanEmail && !emailToUidKey.has(cleanEmail)) {
        emailToUidKey.set(cleanEmail, targetKey);
      }
    }
  });

  const list = Array.from(byUid.values());
  list.sort((a, b) => {
    const numA = extractNumericUserNumber(a);
    const numB = extractNumericUserNumber(b);
    if (numA < 999999 && numB < 999999 && numA !== numB) {
      return numA - numB;
    }
    const timeA = toTimestampMs(a.createdAt || a.registrationDate);
    const timeB = toTimestampMs(b.createdAt || b.registrationDate);
    if (timeA > 0 && timeB > 0 && timeA !== timeB) {
      return timeA - timeB;
    }
    if (numA !== numB) return numA - numB;
    return (a.uid || a.id || '').localeCompare(b.uid || b.id || '');
  });
  return list;
}

export async function fetchAllUsersWithStatusFromFirestore(): Promise<{
  users: UserProfile[];
  errorCode?: string;
  errorMessage?: string;
}> {
  const path = 'users';
  if (isFirestoreQuotaExceeded()) {
    return { users: [], errorCode: 'resource-exhausted', errorMessage: 'Firestore quota exceeded.' };
  }
  try {
    await waitForFirebaseAuthReady();
    // Query entire users collection without orderBy exclusion so docs missing userNumber are never hidden
    const snap = await getDocs(collection(db, path));
    const rawDocs: Array<{ docId: string; data: Partial<UserProfile> }> = [];
    snap.forEach((docItem) => {
      rawDocs.push({ docId: docItem.id, data: docItem.data() as Partial<UserProfile> });
    });
    return { users: normalizeAndDeduplicateFirestoreUsers(rawDocs) };
  } catch (error: any) {
    handlePossibleQuotaError(error);
    const code = String(error?.code || '');
    const msg = error instanceof Error ? error.message : String(error || '');
    const isPerm = code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('insufficient permissions');
    if (!isPerm) {
      console.warn('fetchAllUsersFromFirestore error:', error);
    }
    return {
      users: [],
      errorCode: isPerm ? 'permission-denied' : (code || 'unknown'),
      errorMessage: msg
    };
  }
}

export async function fetchAllUsersFromFirestore(): Promise<UserProfile[]> {
  const res = await fetchAllUsersWithStatusFromFirestore();
  return res.users;
}

export function subscribeToAllUsersFromFirestore(
  callback: (users: UserProfile[]) => void,
  onError?: (err: { code: string; message: string }) => void
): () => void {
  const path = 'users';
  if (isFirestoreQuotaExceeded()) return () => {};

  let isDisposed = false;
  let activeUnsub: (() => void) | null = null;
  let lastBoundAuthKey = '__unset__';

  const cleanupListener = () => {
    if (activeUnsub) {
      try {
        activeUnsub();
      } catch {}
      activeUnsub = null;
    }
  };

  const attachListener = () => {
    if (isDisposed) return;
    if (authPersistenceStatus.mode === 'failed') {
      cleanupListener();
      onError?.({
        code: 'auth/persistence-failed',
        message: authPersistenceStatus.error || 'Firebase Auth storage persistence failed.'
      });
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      lastBoundAuthKey = 'anon';
      cleanupListener();
      onError?.({ code: 'permission-denied', message: 'Firebase Admin Google sign-in required.' });
      return;
    }
    const nextAuthKey = `${currentUser.uid}:${(currentUser.email || '').toLowerCase()}:${String(currentUser.emailVerified)}`;
    if (nextAuthKey === lastBoundAuthKey && activeUnsub) return;
    lastBoundAuthKey = nextAuthKey;
    cleanupListener();

    try {
      activeUnsub = onSnapshot(
        collection(db, path),
        (snap) => {
          if (isDisposed) return;
          const rawDocs: Array<{ docId: string; data: Partial<UserProfile> }> = [];
          snap.forEach((docItem) => {
            rawDocs.push({ docId: docItem.id, data: docItem.data() as Partial<UserProfile> });
          });
          callback(normalizeAndDeduplicateFirestoreUsers(rawDocs));
        },
        (error: any) => {
          handlePossibleQuotaError(error);
          const code = String(error?.code || '');
          const msg = error instanceof Error ? error.message : String(error || '');
          const isPerm = code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('insufficient permissions');
          if (onError) {
            onError({ code: isPerm ? 'permission-denied' : (code || 'unknown'), message: msg });
          } else if (!isPerm) {
            console.warn('Firestore users subscription warning:', error);
          }
        }
      );
    } catch (err: any) {
      onError?.({ code: String(err?.code || 'unknown'), message: err?.message || String(err) });
    }
  };

  let unsubAuth: (() => void) | null = null;
  // Strictly wait until Firebase Auth persistence + authStateReady completes BEFORE attaching Firestore listener
  waitForFirebaseAuthReady().then(() => {
    if (isDisposed) return;
    attachListener();
    try {
      unsubAuth = onAuthStateChanged(auth, () => {
        attachListener();
      });
    } catch {}
  });

  return () => {
    isDisposed = true;
    cleanupListener();
    if (unsubAuth) {
      try {
        unsubAuth();
      } catch {}
    }
  };
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
      }
    }

    // 2. Also check safe email doc so Admin-side updates/refunds written to users/{safeEmailDocId} are never missed
    const targetEmail = email || (uid && uid.includes('@') ? uid : auth.currentUser?.email) || dataFromUid?.email;
    let dataFromEmail: Partial<UserProfile> | null = null;
    let safeEmailDocId = '';
    if (targetEmail) {
      const cleanEmail = targetEmail.trim().toLowerCase();
      safeEmailDocId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (safeEmailDocId !== uid) {
        const snapEmail = await getDoc(doc(db, 'users', safeEmailDocId));
        if (snapEmail.exists()) {
          dataFromEmail = snapEmail.data() as Partial<UserProfile>;
        }
      }
    }

    if (dataFromUid && dataFromEmail) {
      const uidUpdatedMs = new Date((dataFromUid as any).updatedAt || 0).getTime();
      const emailUpdatedMs = new Date((dataFromEmail as any).updatedAt || 0).getTime();
      const merged = emailUpdatedMs >= uidUpdatedMs
        ? { ...dataFromUid, ...dataFromEmail }
        : { ...dataFromEmail, ...dataFromUid };
      const validId = (merged?.customUserId || merged?.id || '').trim();
      if (validId && /^(?:QK-)?USR-\d+$/i.test(validId) && uid && uid !== safeEmailDocId && emailUpdatedMs > uidUpdatedMs) {
        setDoc(doc(db, 'users', uid), {
          ...merged,
          uid,
          updatedAt: (dataFromEmail as any).updatedAt || new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }
      return {
        ...merged,
        uid: uid || merged.uid || safeEmailDocId
      };
    }

    if (dataFromEmail) {
      const validEmailId = (dataFromEmail?.customUserId || dataFromEmail?.id || '').trim();
      if (validEmailId && /^(?:QK-)?USR-\d+$/i.test(validEmailId) && uid && uid !== safeEmailDocId) {
        setDoc(doc(db, 'users', uid), {
          ...dataFromEmail,
          uid,
          updatedAt: (dataFromEmail as any).updatedAt || new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }
      return {
        ...dataFromEmail,
        uid: uid || dataFromEmail.uid || safeEmailDocId
      };
    }

    return dataFromUid;
  } catch (error) {
    if (handlePossibleQuotaError(error)) return null;
    return null;
  }
}

export function subscribeToUserProfileFromFirestore(
  uid: string,
  email: string | undefined,
  callback: (profile: Partial<UserProfile>) => void
): () => void {
  if ((!uid && !email) || isFirestoreQuotaExceeded()) return () => {};
  const cleanEmail = (email || (uid && uid.includes('@') ? uid : auth.currentUser?.email) || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const targetDocId = safeEmailDocId || uid;
  const unsubs: Array<() => void> = [];

  try {
    let latestByEmail: Partial<UserProfile> | null = null;
    let latestByUid: Partial<UserProfile> | null = null;

    const emitLatest = () => {
      if (latestByEmail && latestByUid) {
        const emailMs = new Date((latestByEmail as any).updatedAt || 0).getTime();
        const uidMs = new Date((latestByUid as any).updatedAt || 0).getTime();
        callback(emailMs >= uidMs ? { ...latestByUid, ...latestByEmail } : { ...latestByEmail, ...latestByUid });
      } else if (latestByEmail) {
        callback(latestByEmail);
      } else if (latestByUid) {
        callback(latestByUid);
      }
    };

    if (targetDocId) {
      unsubs.push(
        onSnapshot(
          doc(db, 'users', targetDocId),
          (snap) => {
            if (snap.exists()) {
              latestByEmail = snap.data() as Partial<UserProfile>;
              emitLatest();
            }
          },
          () => {}
        )
      );
    }

    if (uid && uid !== targetDocId) {
      unsubs.push(
        onSnapshot(
          doc(db, 'users', uid),
          (snap) => {
            if (snap.exists()) {
              latestByUid = snap.data() as Partial<UserProfile>;
              emitLatest();
            }
          },
          () => {}
        )
      );
    }
  } catch {}

  return () => {
    unsubs.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  };
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
      ...(deposit.walletCredited !== undefined ? { walletCredited: deposit.walletCredited } : (deposit.status === 'pending' ? { walletCredited: false } : {})),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    const authEmail = (auth.currentUser?.email || '').trim().toLowerCase();
    const matchesCurrentAuthOwner = Boolean(
      auth.currentUser &&
      !isFirestoreQuotaExceeded() &&
      ((cleanEmail && authEmail === cleanEmail) || resolvedOwnerUid === auth.currentUser.uid)
    );
    if (matchesCurrentAuthOwner && auth.currentUser) {
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
  if (status === 'approved' || status === 'rejected' || status === 'cancelled') {
    const res = await processDepositApprovalTransaction(depositId, status);
    if (res.success) return;
  }
  const path = `deposits/${depositId}`;
  try {
    await setDoc(doc(db, 'deposits', depositId), {
      status,
      updatedAt: new Date().toISOString()
    }, { merge: true });
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
          firestoreDocId: docItem.id,
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
            firestoreDocId: docItem.id,
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

function stripUndefinedFields<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (val !== undefined) {
      result[key] = val;
    }
  });
  return result as T;
}

function decodeFirestoreRestValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return Array.isArray(val.arrayValue?.values)
      ? val.arrayValue.values.map(decodeFirestoreRestValue)
      : [];
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    Object.keys(fields).forEach((k) => {
      out[k] = decodeFirestoreRestValue(fields[k]);
    });
    return out;
  }
  return undefined;
}

function encodeFirestoreRestValue(val: any): any {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => encodeFirestoreRestValue(v))
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    Object.keys(val).forEach((k) => {
      if (val[k] !== undefined) {
        fields[k] = encodeFirestoreRestValue(val[k]);
      }
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFirestoreRestFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) {
      fields[k] = encodeFirestoreRestValue(obj[k]);
    }
  });
  return fields;
}

function decodeFirestoreRestDoc(docObj: any): { docId: string; updateTime?: string; data: Record<string, any> } | null {
  if (!docObj || !docObj.name) return null;
  const nameParts = String(docObj.name).split('/');
  const docId = nameParts[nameParts.length - 1] || '';
  const fields = docObj.fields || {};
  const data: Record<string, any> = {};
  Object.keys(fields).forEach((k) => {
    data[k] = decodeFirestoreRestValue(fields[k]);
  });
  return { docId, updateTime: docObj.updateTime, data };
}

function getFirestoreRestBase(): string {
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
}

function getFirestoreRestDocPath(collectionName: string, docId: string): string {
  return `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collectionName}/${docId}`;
}

async function fetchWithdrawalDocViaRest(docId: string): Promise<{ docId: string; updateTime?: string; data: Record<string, any> } | null> {
  if (typeof fetch === 'undefined' || !docId) return null;
  try {
    const res = await fetch(`${getFirestoreRestBase()}/withdrawals/${encodeURIComponent(docId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return decodeFirestoreRestDoc(json);
  } catch {
    return null;
  }
}

async function findWithdrawalByIdViaRest(withdrawalId: string): Promise<{ docId: string; updateTime?: string; data: Record<string, any> } | null> {
  if (typeof fetch === 'undefined' || !withdrawalId) return null;
  // Direct doc lookup first
  const direct = await fetchWithdrawalDocViaRest(withdrawalId);
  if (direct) return direct;

  // Fallback query across withdrawals where id or requestId matches
  try {
    const res = await fetch(`${getFirestoreRestBase()}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'withdrawals' }],
          where: {
            compositeFilter: {
              op: 'OR',
              filters: [
                { fieldFilter: { field: { fieldPath: 'id' }, op: 'EQUAL', value: { stringValue: withdrawalId } } },
                { fieldFilter: { field: { fieldPath: 'requestId' }, op: 'EQUAL', value: { stringValue: withdrawalId } } }
              ]
            }
          },
          limit: 1
        }
      })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row?.document) {
          return decodeFirestoreRestDoc(row.document);
        }
      }
    }
  } catch {}
  return null;
}

async function saveWithdrawalViaRestFallback(w: WithdrawalRequest): Promise<boolean> {
  if (typeof fetch === 'undefined' || !w || !w.id) return false;
  try {
    const fields = encodeFirestoreRestFields(stripUndefinedFields({ ...w }));
    const res = await fetch(`${getFirestoreRestBase()}/withdrawals/${encodeURIComponent(w.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchUserDocViaRest(docId: string): Promise<{ docId: string; updateTime?: string; data: Record<string, any> } | null> {
  if (typeof fetch === 'undefined' || !docId) return null;
  try {
    const res = await fetch(`${getFirestoreRestBase()}/users/${encodeURIComponent(docId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return decodeFirestoreRestDoc(json);
  } catch {
    return null;
  }
}

export interface DepositTransactionResult {
  success: boolean;
  alreadyCredited?: boolean;
  alreadyResolved?: boolean;
  resolvedStatus?: DepositRequest['status'];
  credited?: boolean;
  creditedAmount?: number;
  newWalletBalance?: number;
  ownerEmail?: string;
  ownerUid?: string;
  reconciled?: boolean;
  error?: string;
}

export interface DepositTransactionFallbackInfo {
  ownerUid?: string;
  userEmail?: string;
  amount?: number;
  firestoreDocId?: string;
  reconcileUncreditedApproved?: boolean;
}

function resolveCandidateUserDocIdsForDeposit(
  targetEmail: string,
  targetUid: string,
  authMatchUid: string
): { safeEmailDocId: string; candidateIds: string[] } {
  const safeEmailDocId = targetEmail ? targetEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const candidateIds = Array.from(
    new Set(
      [safeEmailDocId, targetUid, authMatchUid]
        .map((s) => (s || '').trim())
        .filter((s) => Boolean(s) && !s.startsWith('QK-USR-'))
    )
  );
  return { safeEmailDocId, candidateIds };
}

async function fetchDepositDocViaRest(docId: string): Promise<{ docId: string; updateTime?: string; data: Record<string, any> } | null> {
  if (typeof fetch === 'undefined' || !docId) return null;
  try {
    const res = await fetch(`${getFirestoreRestBase()}/deposits/${encodeURIComponent(docId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return decodeFirestoreRestDoc(json);
  } catch {
    return null;
  }
}

async function findDepositByIdViaRest(depositId: string): Promise<{ docId: string; updateTime?: string; data: Record<string, any> } | null> {
  if (typeof fetch === 'undefined' || !depositId) return null;
  const direct = await fetchDepositDocViaRest(depositId);
  if (direct) return direct;

  try {
    const res = await fetch(`${getFirestoreRestBase()}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'deposits' }],
          where: {
            compositeFilter: {
              op: 'OR',
              filters: [
                { fieldFilter: { field: { fieldPath: 'id' }, op: 'EQUAL', value: { stringValue: depositId } } },
                { fieldFilter: { field: { fieldPath: 'requestId' }, op: 'EQUAL', value: { stringValue: depositId } } }
              ]
            }
          },
          limit: 1
        }
      })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row?.document) {
          return decodeFirestoreRestDoc(row.document);
        }
      }
    }
  } catch {}
  return null;
}

async function processDepositStatusViaRestFallback(
  depositId: string,
  nextStatus: 'approved' | 'rejected' | 'cancelled',
  fallbackInfo?: DepositTransactionFallbackInfo
): Promise<DepositTransactionResult> {
  if (typeof fetch === 'undefined') {
    return { success: false, error: 'Network unavailable for Firestore REST sync.' };
  }

  try {
    const lookupIds = Array.from(new Set([fallbackInfo?.firestoreDocId, depositId].filter(Boolean) as string[]));
    let foundDoc: { docId: string; updateTime?: string; data: Record<string, any> } | null = null;
    for (const candidate of lookupIds) {
      foundDoc = await findDepositByIdViaRest(candidate);
      if (foundDoc) break;
    }

    if (!foundDoc) {
      return { success: false, error: `Deposit ${depositId} not found in Firestore.` };
    }

    const dData = foundDoc.data as DepositRequest;
    const currentStatus = String(dData?.status || 'pending').toLowerCase() as DepositRequest['status'];
    const alreadyCreditedFlag = Boolean(
      dData?.walletCredited === true ||
      dData?.creditedAt ||
      Number(dData?.walletCreditedAmount || 0) > 0
    );

    const targetEmail = String(dData?.userEmail || dData?.email || fallbackInfo?.userEmail || '').trim().toLowerCase();
    const targetUid = String(dData?.ownerUid || dData?.userId || fallbackInfo?.ownerUid || '').trim();
    const { safeEmailDocId, candidateIds } = resolveCandidateUserDocIdsForDeposit(targetEmail, targetUid, '');

    if (nextStatus === 'approved') {
      if (currentStatus === 'approved' && alreadyCreditedFlag) {
        return {
          success: true,
          alreadyCredited: true,
          alreadyResolved: true,
          resolvedStatus: 'approved',
          credited: false,
          ownerEmail: targetEmail,
          ownerUid: targetUid
        };
      }
      if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
        return {
          success: true,
          alreadyResolved: true,
          resolvedStatus: currentStatus,
          credited: false,
          ownerEmail: targetEmail,
          ownerUid: targetUid
        };
      }
      if (currentStatus === 'approved' && !fallbackInfo?.reconcileUncreditedApproved) {
        return {
          success: true,
          alreadyResolved: true,
          resolvedStatus: 'approved',
          credited: false,
          ownerEmail: targetEmail,
          ownerUid: targetUid
        };
      }

      const approvedAmount = Number(dData?.amount ?? 0);
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
        return { success: false, error: `Invalid deposit amount for ${depositId}.` };
      }

      const userDocs = (await Promise.all(candidateIds.map((id) => fetchUserDocViaRest(id)))).filter(
        (d): d is { docId: string; updateTime?: string; data: Record<string, any> } => Boolean(d)
      );

      let freshestUserData: Record<string, any> | null = null;
      let freshestUpdatedMs = -1;
      userDocs.forEach((ud) => {
        const rawMs = new Date(ud.data?.updatedAt || 0).getTime();
        const ms = Number.isFinite(rawMs) ? rawMs : 0;
        if (!freshestUserData || ms >= freshestUpdatedMs) {
          freshestUserData = ud.data;
          freshestUpdatedMs = ms;
        }
      });

      const currentBal = Math.max(0, Number(freshestUserData?.walletBalance) || 0);
      const isReconcile = currentStatus === 'approved' && Boolean(fallbackInfo?.reconcileUncreditedApproved);
      if (isReconcile) {
        const played = Number(freshestUserData?.quizzesPlayed) || 0;
        const won = Number(freshestUserData?.totalWonAmount) || 0;
        if (currentBal > 0 || played > 0 || won > 0) {
          return {
            success: true,
            alreadyCredited: true,
            alreadyResolved: true,
            resolvedStatus: 'approved',
            credited: false,
            newWalletBalance: currentBal,
            ownerEmail: targetEmail,
            ownerUid: targetUid
          };
        }
      }

      const newWalletBalance = Math.max(0, currentBal + approvedAmount);
      const nowIso = new Date().toISOString();
      const canonicalDepId = dData?.id || foundDoc.docId || depositId;
      const writes: any[] = [
        {
          update: {
            name: getFirestoreRestDocPath('deposits', foundDoc.docId),
            fields: encodeFirestoreRestFields({
              status: 'approved',
              walletCredited: true,
              walletCreditedAmount: approvedAmount,
              creditedAt: nowIso,
              updatedAt: nowIso
            })
          },
          updateMask: { fieldPaths: ['status', 'walletCredited', 'walletCreditedAmount', 'creditedAt', 'updatedAt'] },
          ...(foundDoc.updateTime ? { currentDocument: { updateTime: foundDoc.updateTime } } : {})
        }
      ];

      if (userDocs.length > 0) {
        userDocs.forEach((ud) => {
          writes.push({
            update: {
              name: getFirestoreRestDocPath('users', ud.docId),
              fields: encodeFirestoreRestFields({
                walletBalance: newWalletBalance,
                lastCreditedDepositId: canonicalDepId,
                pendingDepositId: null,
                pendingDepositStatus: 'approved',
                updatedAt: nowIso
              })
            },
            updateMask: { fieldPaths: ['walletBalance', 'lastCreditedDepositId', 'pendingDepositId', 'pendingDepositStatus', 'updatedAt'] },
            ...(ud.updateTime ? { currentDocument: { updateTime: ud.updateTime } } : {})
          });
        });
      } else if (safeEmailDocId) {
        writes.push({
          update: {
            name: getFirestoreRestDocPath('users', safeEmailDocId),
            fields: encodeFirestoreRestFields({
              email: targetEmail,
              name: dData?.userName || 'Player',
              mobile: dData?.phone || '',
              walletBalance: newWalletBalance,
              lastCreditedDepositId: canonicalDepId,
              pendingDepositId: null,
              pendingDepositStatus: 'approved',
              updatedAt: nowIso
            })
          },
          updateMask: { fieldPaths: ['email', 'name', 'mobile', 'walletBalance', 'lastCreditedDepositId', 'pendingDepositId', 'pendingDepositStatus', 'updatedAt'] }
        });
      }

      const commitRes = await fetch(`${getFirestoreRestBase()}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
      });
      if (!commitRes.ok) {
        const errText = await commitRes.text().catch(() => '');
        return { success: false, error: `Firestore deposit approval commit failed (${commitRes.status}): ${errText}` };
      }

      return {
        success: true,
        alreadyCredited: false,
        alreadyResolved: false,
        resolvedStatus: 'approved',
        credited: true,
        creditedAmount: approvedAmount,
        newWalletBalance,
        ownerEmail: targetEmail,
        ownerUid: targetUid,
        reconciled: isReconcile
      };
    }

    // Rejected or Cancelled
    if (currentStatus === 'approved' && alreadyCreditedFlag) {
      return {
        success: true,
        alreadyResolved: true,
        alreadyCredited: true,
        resolvedStatus: 'approved',
        credited: false,
        ownerEmail: targetEmail,
        ownerUid: targetUid
      };
    }
    if (currentStatus && currentStatus !== 'pending') {
      return {
        success: true,
        alreadyResolved: true,
        resolvedStatus: currentStatus,
        credited: false,
        ownerEmail: targetEmail,
        ownerUid: targetUid
      };
    }

    const userDocs = (await Promise.all(candidateIds.map((id) => fetchUserDocViaRest(id)))).filter(
      (d): d is { docId: string; updateTime?: string; data: Record<string, any> } => Boolean(d)
    );
    const nowIso = new Date().toISOString();
    const writes: any[] = [
      {
        update: {
          name: getFirestoreRestDocPath('deposits', foundDoc.docId),
          fields: encodeFirestoreRestFields({
            status: nextStatus,
            updatedAt: nowIso
          })
        },
        updateMask: { fieldPaths: ['status', 'updatedAt'] },
        ...(foundDoc.updateTime ? { currentDocument: { updateTime: foundDoc.updateTime } } : {})
      }
    ];
    userDocs.forEach((ud) => {
      writes.push({
        update: {
          name: getFirestoreRestDocPath('users', ud.docId),
          fields: encodeFirestoreRestFields({
            pendingDepositId: null,
            pendingDepositStatus: nextStatus,
            updatedAt: nowIso
          })
        },
        updateMask: { fieldPaths: ['pendingDepositId', 'pendingDepositStatus', 'updatedAt'] },
        ...(ud.updateTime ? { currentDocument: { updateTime: ud.updateTime } } : {})
      });
    });

    const commitRes = await fetch(`${getFirestoreRestBase()}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    });
    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => '');
      return { success: false, error: `Firestore deposit ${nextStatus} commit failed (${commitRes.status}): ${errText}` };
    }

    return {
      success: true,
      alreadyResolved: false,
      resolvedStatus: nextStatus,
      credited: false,
      ownerEmail: targetEmail,
      ownerUid: targetUid
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Firestore deposit REST fallback failed.' };
  }
}

export async function processDepositApprovalTransaction(
  depositId: string,
  nextStatus: 'approved' | 'rejected' | 'cancelled',
  fallbackInfo?: DepositTransactionFallbackInfo
): Promise<DepositTransactionResult> {
  if (!depositId) {
    return { success: false, error: 'Invalid deposit ID.' };
  }
  if (isFirestoreQuotaExceeded()) {
    return { success: false, error: 'Firestore quota exceeded. Please try again later.' };
  }

  let targetDocId = (fallbackInfo?.firestoreDocId || depositId).trim();

  try {
    const directSnap = await getDoc(doc(db, 'deposits', targetDocId)).catch(() => null);
    if (!directSnap || !directSnap.exists()) {
      const altMatch = await findDepositByIdViaRest(depositId);
      if (altMatch?.docId) {
        targetDocId = altMatch.docId;
      } else {
        const byIdSnap = await getDocs(query(collection(db, 'deposits'), where('id', '==', depositId))).catch(() => null);
        if (byIdSnap && !byIdSnap.empty) {
          targetDocId = byIdSnap.docs[0].id;
        } else {
          const byReqSnap = await getDocs(query(collection(db, 'deposits'), where('requestId', '==', depositId))).catch(() => null);
          if (byReqSnap && !byReqSnap.empty) {
            targetDocId = byReqSnap.docs[0].id;
          }
        }
      }
    }
  } catch {}

  const dRef = doc(db, 'deposits', targetDocId);

  try {
    const txRes = await runTransaction(db, async (tx): Promise<DepositTransactionResult> => {
      const dSnap = await tx.get(dRef);
      if (!dSnap.exists()) {
        return {
          success: false,
          error: `Deposit ${depositId} not found in Firestore.`
        };
      }

      const dData = dSnap.data() as DepositRequest;
      const currentStatus = String(dData?.status || 'pending').toLowerCase() as DepositRequest['status'];
      const alreadyCreditedFlag = Boolean(
        dData?.walletCredited === true ||
        dData?.creditedAt ||
        Number(dData?.walletCreditedAmount || 0) > 0
      );

      const targetEmail = (dData?.userEmail || dData?.email || fallbackInfo?.userEmail || '').trim().toLowerCase();
      const targetUid = (dData?.ownerUid || dData?.userId || fallbackInfo?.ownerUid || '').trim();
      const authMatchUid = (auth.currentUser?.email || '').trim().toLowerCase() === targetEmail && auth.currentUser?.uid
        ? auth.currentUser.uid
        : '';

      const { safeEmailDocId, candidateIds } = resolveCandidateUserDocIdsForDeposit(
        targetEmail,
        targetUid,
        authMatchUid
      );
      const candidateRefs = candidateIds.map((docId) => doc(db, 'users', docId));
      const userSnaps = await Promise.all(candidateRefs.map((ref) => tx.get(ref).catch(() => null)));

      let freshestData: any = null;
      let freshestUpdatedMs = -1;
      const existingRefs: typeof candidateRefs = [];
      userSnaps.forEach((snap, idx) => {
        if (snap && snap.exists()) {
          existingRefs.push(candidateRefs[idx]);
          const u = snap.data();
          const rawMs = new Date(u?.updatedAt || 0).getTime();
          const ms = Number.isFinite(rawMs) ? rawMs : 0;
          if (!freshestData || ms >= freshestUpdatedMs) {
            freshestData = u;
            freshestUpdatedMs = ms;
          }
        }
      });

      const currentBal = Math.max(0, Number(freshestData?.walletBalance) || 0);
      const nowIso = new Date().toISOString();

      if (nextStatus === 'approved') {
        if (currentStatus === 'approved' && alreadyCreditedFlag) {
          return {
            success: true,
            alreadyCredited: true,
            alreadyResolved: true,
            resolvedStatus: 'approved',
            credited: false,
            newWalletBalance: currentBal,
            ownerEmail: targetEmail,
            ownerUid: targetUid
          };
        }

        if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
          return {
            success: true,
            alreadyResolved: true,
            resolvedStatus: currentStatus,
            credited: false,
            newWalletBalance: currentBal,
            ownerEmail: targetEmail,
            ownerUid: targetUid
          };
        }

        const isReconcile = currentStatus === 'approved' && !alreadyCreditedFlag;
        if (isReconcile && !fallbackInfo?.reconcileUncreditedApproved) {
          return {
            success: true,
            alreadyResolved: true,
            resolvedStatus: 'approved',
            credited: false,
            newWalletBalance: currentBal,
            ownerEmail: targetEmail,
            ownerUid: targetUid
          };
        }

        if (isReconcile) {
          const played = Number(freshestData?.quizzesPlayed) || 0;
          const won = Number(freshestData?.totalWonAmount) || 0;
          if (currentBal > 0 || played > 0 || won > 0) {
            return {
              success: true,
              alreadyCredited: true,
              alreadyResolved: true,
              resolvedStatus: 'approved',
              credited: false,
              newWalletBalance: currentBal,
              ownerEmail: targetEmail,
              ownerUid: targetUid
            };
          }
        }

        const approvedAmount = Number(dData?.amount ?? 0);
        if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
          return {
            success: false,
            error: `Invalid deposit amount for ${depositId}.`
          };
        }

        const newWalletBalance = Math.max(0, currentBal + approvedAmount);
        const canonicalDepId = dData?.id || targetDocId || depositId;

        tx.set(
          dRef,
          {
            status: 'approved',
            walletCredited: true,
            walletCreditedAmount: approvedAmount,
            creditedAt: nowIso,
            updatedAt: nowIso
          },
          { merge: true }
        );

        const targetUserRefs = existingRefs.length > 0
          ? existingRefs
          : (safeEmailDocId ? [doc(db, 'users', safeEmailDocId)] : []);

        targetUserRefs.forEach((uRef) => {
          tx.set(
            uRef,
            {
              ...(existingRefs.length === 0 && targetEmail
                ? {
                    email: targetEmail,
                    name: dData?.userName || 'Player',
                    mobile: dData?.phone || '',
                    isRegistered: true
                  }
                : {}),
              walletBalance: newWalletBalance,
              lastCreditedDepositId: canonicalDepId,
              pendingDepositId: null,
              pendingDepositStatus: 'approved',
              updatedAt: nowIso
            },
            { merge: true }
          );
        });

        return {
          success: true,
          alreadyCredited: false,
          alreadyResolved: false,
          resolvedStatus: 'approved',
          credited: true,
          creditedAmount: approvedAmount,
          newWalletBalance,
          ownerEmail: targetEmail,
          ownerUid: targetUid,
          reconciled: isReconcile
        };
      }

      // Rejected or Cancelled
      if (currentStatus === 'approved' && alreadyCreditedFlag) {
        return {
          success: true,
          alreadyResolved: true,
          alreadyCredited: true,
          resolvedStatus: 'approved',
          credited: false,
          newWalletBalance: currentBal,
          ownerEmail: targetEmail,
          ownerUid: targetUid
        };
      }

      if (currentStatus && currentStatus !== 'pending') {
        return {
          success: true,
          alreadyResolved: true,
          resolvedStatus: currentStatus,
          credited: false,
          newWalletBalance: currentBal,
          ownerEmail: targetEmail,
          ownerUid: targetUid
        };
      }

      tx.set(
        dRef,
        {
          status: nextStatus,
          updatedAt: nowIso
        },
        { merge: true }
      );

      existingRefs.forEach((uRef) => {
        tx.set(
          uRef,
          {
            pendingDepositId: null,
            pendingDepositStatus: nextStatus,
            updatedAt: nowIso
          },
          { merge: true }
        );
      });

      return {
        success: true,
        alreadyResolved: false,
        resolvedStatus: nextStatus,
        credited: false,
        ownerEmail: targetEmail,
        ownerUid: targetUid
      };
    });

    return txRes;
  } catch (error: any) {
    if (handlePossibleQuotaError(error)) {
      return { success: false, error: 'Firestore quota exceeded.' };
    }
    const errMsg = error?.message || String(error || '');
    const isPermDenied =
      error?.code === 'permission-denied' ||
      errMsg.includes('permission-denied') ||
      errMsg.includes('insufficient permissions');

    if (isPermDenied) {
      return await processDepositStatusViaRestFallback(depositId, nextStatus, {
        ...fallbackInfo,
        firestoreDocId: targetDocId
      });
    }

    console.warn('processDepositApprovalTransaction notice:', error);
    return { success: false, error: errMsg || 'Failed to update deposit status in Firestore.' };
  }
}

export async function reconcileUncreditedApprovedDeposit(
  depositId: string,
  fallbackInfo?: Omit<DepositTransactionFallbackInfo, 'reconcileUncreditedApproved'>
): Promise<DepositTransactionResult> {
  return processDepositApprovalTransaction(depositId, 'approved', {
    ...fallbackInfo,
    reconcileUncreditedApproved: true
  });
}

async function processWithdrawalStatusViaRestFallback(
  withdrawalId: string,
  nextStatus: 'approved' | 'rejected' | 'cancelled',
  fallbackInfo?: { ownerUid?: string; userEmail?: string; amount?: number; firestoreDocId?: string }
): Promise<{
  success: boolean;
  alreadyResolved?: boolean;
  resolvedStatus?: WithdrawalRequest['status'];
  refunded?: boolean;
  newWalletBalance?: number;
  error?: string;
}> {
  if (typeof fetch === 'undefined') {
    return { success: false, error: 'Network unavailable for Firestore REST sync.' };
  }

  try {
    const lookupIds = Array.from(new Set([fallbackInfo?.firestoreDocId, withdrawalId].filter(Boolean) as string[]));
    let foundDoc: { docId: string; updateTime?: string; data: Record<string, any> } | null = null;
    for (const candidate of lookupIds) {
      foundDoc = await findWithdrawalByIdViaRest(candidate);
      if (foundDoc) break;
    }

    if (!foundDoc) {
      return { success: false, error: `Withdrawal ${withdrawalId} not found in Firestore.` };
    }

    const wData = foundDoc.data as WithdrawalRequest;
    const currentStatus = String(wData?.status || 'pending').toLowerCase() as WithdrawalRequest['status'];
    if (currentStatus && currentStatus !== 'pending') {
      return {
        success: true,
        alreadyResolved: true,
        resolvedStatus: currentStatus,
        refunded: false
      };
    }

    const targetEmail = String(wData?.userEmail || wData?.email || fallbackInfo?.userEmail || '').trim().toLowerCase();
    const safeEmailDocId = targetEmail ? targetEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const targetUid = String(wData?.ownerUid || wData?.userId || fallbackInfo?.ownerUid || '').trim();
    const candidateUserIds = Array.from(
      new Set(
        [safeEmailDocId, targetUid]
          .map((s) => (s || '').trim())
          .filter((s) => Boolean(s) && !s.startsWith('usr-') && !s.startsWith('QK-USR-'))
      )
    );

    const userDocs = (await Promise.all(candidateUserIds.map((id) => fetchUserDocViaRest(id)))).filter(
      (d): d is { docId: string; updateTime?: string; data: Record<string, any> } => Boolean(d)
    );

    let freshestUserData: Record<string, any> | null = null;
    let freshestUpdatedMs = -1;
    userDocs.forEach((ud) => {
      const rawMs = new Date(ud.data?.updatedAt || 0).getTime();
      const ms = Number.isFinite(rawMs) ? rawMs : 0;
      if (!freshestUserData || ms >= freshestUpdatedMs) {
        freshestUserData = ud.data;
        freshestUpdatedMs = ms;
      }
    });

    const nowIso = new Date().toISOString();
    const writes: any[] = [];

    if (nextStatus === 'approved') {
      writes.push({
        update: {
          name: getFirestoreRestDocPath('withdrawals', foundDoc.docId),
          fields: encodeFirestoreRestFields({
            status: 'approved',
            walletDeducted: wData?.walletDeducted ?? true,
            updatedAt: nowIso
          })
        },
        updateMask: { fieldPaths: ['status', 'walletDeducted', 'updatedAt'] },
        ...(foundDoc.updateTime ? { currentDocument: { updateTime: foundDoc.updateTime } } : {})
      });

      userDocs.forEach((ud) => {
        writes.push({
          update: {
            name: getFirestoreRestDocPath('users', ud.docId),
            fields: encodeFirestoreRestFields({
              activePendingWithdrawalId: '',
              updatedAt: nowIso
            })
          },
          updateMask: { fieldPaths: ['activePendingWithdrawalId', 'updatedAt'] },
          ...(ud.updateTime ? { currentDocument: { updateTime: ud.updateTime } } : {})
        });
      });

      const commitRes = await fetch(`${getFirestoreRestBase()}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
      });
      if (!commitRes.ok) {
        const errText = await commitRes.text().catch(() => '');
        return { success: false, error: `Firestore approval commit failed (${commitRes.status}): ${errText}` };
      }
      return {
        success: true,
        alreadyResolved: false,
        resolvedStatus: 'approved',
        refunded: false
      };
    }

    const alreadyRefunded = Boolean(wData?.walletRefunded);
    const wasDeducted = wData ? wData.walletDeducted !== false : true;
    const refundAmt = Math.max(
      0,
      Number(wData?.walletDeductedAmount ?? wData?.amount ?? fallbackInfo?.amount ?? 0) || 0
    );
    const shouldRefund = !alreadyRefunded && wasDeducted && refundAmt > 0;
    let newWalletBalance: number | undefined;

    writes.push({
      update: {
        name: getFirestoreRestDocPath('withdrawals', foundDoc.docId),
        fields: encodeFirestoreRestFields({
          status: nextStatus,
          walletRefunded: shouldRefund ? true : Boolean(wData?.walletRefunded),
          updatedAt: nowIso
        })
      },
      updateMask: { fieldPaths: ['status', 'walletRefunded', 'updatedAt'] },
      ...(foundDoc.updateTime ? { currentDocument: { updateTime: foundDoc.updateTime } } : {})
    });

    if (shouldRefund && userDocs.length > 0) {
      const currentBal = Math.max(0, Number(freshestUserData?.walletBalance) || 0);
      newWalletBalance = Math.max(0, currentBal + refundAmt);
      userDocs.forEach((ud) => {
        writes.push({
          update: {
            name: getFirestoreRestDocPath('users', ud.docId),
            fields: encodeFirestoreRestFields({
              walletBalance: newWalletBalance,
              activePendingWithdrawalId: '',
              updatedAt: nowIso
            })
          },
          updateMask: { fieldPaths: ['walletBalance', 'activePendingWithdrawalId', 'updatedAt'] },
          ...(ud.updateTime ? { currentDocument: { updateTime: ud.updateTime } } : {})
        });
      });
    } else if (userDocs.length > 0) {
      userDocs.forEach((ud) => {
        writes.push({
          update: {
            name: getFirestoreRestDocPath('users', ud.docId),
            fields: encodeFirestoreRestFields({
              activePendingWithdrawalId: '',
              updatedAt: nowIso
            })
          },
          updateMask: { fieldPaths: ['activePendingWithdrawalId', 'updatedAt'] },
          ...(ud.updateTime ? { currentDocument: { updateTime: ud.updateTime } } : {})
        });
      });
    }

    const commitRes = await fetch(`${getFirestoreRestBase()}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    });
    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => '');
      return { success: false, error: `Firestore rejection commit failed (${commitRes.status}): ${errText}` };
    }

    return {
      success: true,
      alreadyResolved: false,
      resolvedStatus: nextStatus,
      refunded: shouldRefund,
      newWalletBalance
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Firestore REST fallback failed.' };
  }
}

async function fetchAllWithdrawalsViaRestFallback(): Promise<WithdrawalRequest[]> {
  try {
    if (typeof fetch === 'undefined') return [];
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/withdrawals?pageSize=300`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const docs = Array.isArray(json?.documents) ? json.documents : [];
    const list: WithdrawalRequest[] = [];
    docs.forEach((docObj: any) => {
      const nameParts = String(docObj?.name || '').split('/');
      const docId = nameParts[nameParts.length - 1] || '';
      const fields = docObj?.fields || {};
      const decoded: Record<string, any> = {};
      Object.keys(fields).forEach((k) => {
        decoded[k] = decodeFirestoreRestValue(fields[k]);
      });
      const id = decoded.id || docId;
      if (id) {
        list.push({
          ...decoded,
          id,
          firestoreDocId: docId,
          requestId: decoded.requestId || id,
          status: (String(decoded.status || 'pending').toLowerCase() as any)
        } as WithdrawalRequest);
      }
    });
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch {
    return [];
  }
}

async function resolveNonCollidingWithdrawalId(
  preferredId: string,
  cleanEmail: string,
  resolvedOwnerUid: string
): Promise<string> {
  const tryAvailable = async (candidateId: string): Promise<boolean> => {
    try {
      const snap = await getDoc(doc(db, 'withdrawals', candidateId));
      if (!snap.exists()) return true;
      const existing = snap.data() as WithdrawalRequest;
      const existingEmail = (existing.userEmail || existing.email || '').trim().toLowerCase();
      const existingUid = (existing.ownerUid || existing.userId || '').trim();
      const sameOwner =
        (cleanEmail && existingEmail === cleanEmail) ||
        (resolvedOwnerUid && existingUid === resolvedOwnerUid);
      return Boolean(sameOwner);
    } catch {
      // Permission denied means doc already exists under a different owner
      return false;
    }
  };

  if (await tryAvailable(preferredId)) {
    return preferredId;
  }

  // Generate a guaranteed-unique 6-digit sequential-compatible QK-WTH ID
  for (let attempt = 0; attempt < 6; attempt++) {
    const randSuffix = 100000 + Math.floor((Date.now() % 800000) + Math.random() * 99999);
    const candidate = `QK-WTH-${String(randSuffix).slice(0, 6)}`;
    if (await tryAvailable(candidate)) {
      return candidate;
    }
  }
  return `QK-WTH-${Date.now().toString().slice(-6)}`;
}

// Withdrawal Requests Cloud Database Sync
export async function saveWithdrawalToFirestore(w: WithdrawalRequest): Promise<void> {
  if (!w || !w.id || isFirestoreQuotaExceeded()) return;
  const path = `withdrawals/${w.id}`;
  const cleanEmail = (w.userEmail || w.email || auth.currentUser?.email || '').trim().toLowerCase();
  const resolvedOwnerUid = w.ownerUid || w.userId || auth.currentUser?.uid || (cleanEmail ? `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : `usr-${w.id}`);
  const persistentRequestId = w.requestId || w.id;

  const payload = stripUndefinedFields({
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
    walletDeducted: w.walletDeducted ?? false,
    walletDeductedAmount: w.walletDeductedAmount !== undefined ? Number(w.walletDeductedAmount) : undefined,
    walletRefunded: w.walletRefunded ?? false,
    updatedAt: new Date().toISOString()
  });

  try {
    await setDoc(doc(db, 'withdrawals', w.id), payload, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
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

/**
 * Atomic Firestore Transaction for Withdrawal Submission & Single Idempotent Wallet Deduction.
 * - Enforces ₹10 minimum and ₹5000 maximum
 * - Deducts walletBalance exactly once when reserving the withdrawal
 * - Prevents duplicate deductions, double submissions, and negative balances
 */
export async function submitWithdrawalTransaction(
  w: WithdrawalRequest,
  fallbackProfile?: Partial<UserProfile>
): Promise<{
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  newWalletBalance?: number;
  withdrawal?: WithdrawalRequest;
}> {
  if (!w || !w.id) {
    return { success: false, error: 'Invalid withdrawal request.' };
  }

  const amt = Number(w.amount);
  if (isNaN(amt) || amt < 10) {
    return { success: false, error: 'Minimum withdrawal amount is ₹10.' };
  }
  if (amt > 5000) {
    return { success: false, error: 'Maximum withdrawal amount is ₹5000 per request.' };
  }

  const cleanEmail = (w.userEmail || w.email || fallbackProfile?.email || auth.currentUser?.email || '').trim().toLowerCase();
  const safeEmailDocId = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const authUid = auth.currentUser?.uid || '';
  const resolvedOwnerUid = (authUid || w.ownerUid || w.userId || fallbackProfile?.uid || (safeEmailDocId ? `usr-${safeEmailDocId}` : `usr-${w.id}`)).trim();

  const buildSavedWithdrawal = (finalId: string, nowIso: string): WithdrawalRequest =>
    stripUndefinedFields({
      ...w,
      id: finalId,
      requestId: finalId === w.id ? (w.requestId || finalId) : finalId,
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
      amount: amt,
      timestamp: w.timestamp || nowIso,
      date: w.date || nowIso.split('T')[0],
      createdAt: w.createdAt || nowIso,
      status: 'pending',
      walletDeducted: true,
      walletDeductedAmount: amt,
      walletRefunded: false,
      updatedAt: nowIso
    });

  if (isFirestoreQuotaExceeded()) {
    const safeWallet = Math.max(0, Number(fallbackProfile?.walletBalance) || 0);
    if (amt > safeWallet) {
      return { success: false, error: `Insufficient wallet balance. You only have ₹${safeWallet} available.` };
    }
    return {
      success: true,
      newWalletBalance: Math.max(0, safeWallet - amt),
      withdrawal: buildSavedWithdrawal(w.id, new Date().toISOString())
    };
  }

  // Fetch authoritative Firestore withdrawals and settled quiz attempts prior to transaction
  const [cloudWithdrawals, cloudAttempts] = await Promise.all([
    fetchWithdrawalsFromFirestore(resolvedOwnerUid, cleanEmail).catch(() => []),
    fetchUserQuizAttemptsFromFirestore({
      ownerUid: resolvedOwnerUid,
      userId: fallbackProfile?.id || resolvedOwnerUid,
      userEmail: cleanEmail || undefined
    }).catch(() => [])
  ]);

  // Ensure the withdrawal ID does not collide with another user's existing Firestore document
  const targetWithdrawalId = await resolveNonCollidingWithdrawalId(w.id, cleanEmail, resolvedOwnerUid);
  const wRef = doc(db, 'withdrawals', targetWithdrawalId);

  const candidateUserDocIds = Array.from(
    new Set(
      [safeEmailDocId, authUid, resolvedOwnerUid]
        .map((s) => (s || '').trim())
        .filter((s) => Boolean(s) && !s.startsWith('usr-') && !s.startsWith('QK-USR-'))
    )
  );
  const candidateRefs = candidateUserDocIds.map((docId) => doc(db, 'users', docId));

  try {
    const txResult = await runTransaction(db, async (tx) => {
      // 1. Perform all reads before any writes
      const wSnap = await tx.get(wRef).catch(() => null);
      const userSnaps = await Promise.all(
        candidateRefs.map((ref) =>
          tx.get(ref).catch(() => null)
        )
      );

      // Find freshest existing user doc
      let freshestData: any = null;
      let freshestUpdatedMs = -1;
      const existingRefs: typeof candidateRefs = [];
      userSnaps.forEach((snap, idx) => {
        if (snap && snap.exists()) {
          existingRefs.push(candidateRefs[idx]);
          const data = snap.data();
          const rawMs = new Date(data?.updatedAt || 0).getTime();
          const updatedMs = Number.isFinite(rawMs) ? rawMs : 0;
          if (!freshestData || updatedMs >= freshestUpdatedMs) {
            freshestData = data;
            freshestUpdatedMs = updatedMs;
          }
        }
      });

      const activePendingId = String(freshestData?.activePendingWithdrawalId || '').trim();
      const activePendingSnap = (activePendingId && activePendingId !== targetWithdrawalId)
        ? await tx.get(doc(db, 'withdrawals', activePendingId)).catch(() => null)
        : null;

      const currentAuthoritativeWallet = freshestData && freshestData.walletBalance !== undefined
        ? Math.max(0, Number(freshestData.walletBalance) || 0)
        : Math.max(0, Number(fallbackProfile?.walletBalance) || 0);

      const currentAuthoritativeTotalWon = freshestData && freshestData.totalWonAmount !== undefined
        ? Math.max(0, Number(freshestData.totalWonAmount) || 0)
        : Math.max(0, Number(fallbackProfile?.totalWonAmount) || 0);

      // 2. Idempotency check: if already created & deducted for this same user, do NOT deduct again
      if (wSnap && wSnap.exists()) {
        const existingW = wSnap.data() as WithdrawalRequest;
        const existingEmail = (existingW?.userEmail || existingW?.email || '').trim().toLowerCase();
        const sameOwner =
          (cleanEmail && existingEmail === cleanEmail) ||
          (resolvedOwnerUid && (existingW?.ownerUid === resolvedOwnerUid || existingW?.userId === resolvedOwnerUid));
        if (sameOwner && (existingW?.walletDeducted || existingW?.status !== 'pending')) {
          return {
            success: true,
            alreadyProcessed: true,
            newWalletBalance: currentAuthoritativeWallet,
            withdrawal: existingW
          };
        }
      } else if (activePendingSnap && activePendingSnap.exists() && activePendingSnap.data()?.status === 'pending') {
        return {
          success: false,
          error: 'A withdrawal request is currently pending verification. You cannot submit another withdrawal until the active request is processed.'
        };
      }

      // Also check cloudWithdrawals in case another pending withdrawal exists for this user without activePendingWithdrawalId set
      const otherPendingInCloud = (cloudWithdrawals || []).find((cw) => {
        if (!cw || cw.id === targetWithdrawalId || cw.requestId === targetWithdrawalId) return false;
        if (String(cw.status || 'pending').toLowerCase() !== 'pending') return false;
        const cwEmail = (cw.userEmail || cw.email || '').trim().toLowerCase();
        const cwUid = (cw.ownerUid || cw.userId || '').trim();
        return (cleanEmail && cwEmail === cleanEmail) || (resolvedOwnerUid && cwUid === resolvedOwnerUid);
      });
      if (otherPendingInCloud) {
        return {
          success: false,
          error: 'A withdrawal request is currently pending verification. You cannot submit another withdrawal until the active request is processed.'
        };
      }

      if (amt > currentAuthoritativeWallet) {
        return {
          success: false,
          error: `Insufficient wallet balance. You only have ₹${currentAuthoritativeWallet} available.`
        };
      }

      // 3. Authoritative eligibility guard: deposited principal is non-withdrawable unless returned via settled contest payout
      const otherCloudWithdrawals = (cloudWithdrawals || []).filter((cw) => cw && cw.id !== targetWithdrawalId);
      const eligibility = contestBackend.getWithdrawableBalance(
        resolvedOwnerUid,
        cleanEmail,
        otherCloudWithdrawals,
        currentAuthoritativeTotalWon,
        currentAuthoritativeWallet,
        cloudAttempts
      );
      if (amt > eligibility.withdrawableBalance) {
        return {
          success: false,
          error: `Withdrawal is permitted only from settled contest winnings. You have ₹${eligibility.withdrawableBalance} in eligible winnings available. Deposited funds cannot be withdrawn directly.`
        };
      }

      const nowIso = new Date().toISOString();
      const nextWalletBalance = Math.max(0, currentAuthoritativeWallet - amt);
      const savedWithdrawal = buildSavedWithdrawal(targetWithdrawalId, nowIso);

      // 4. Atomic writes: create/update withdrawal doc + deduct user wallet doc(s)
      tx.set(wRef, savedWithdrawal, { merge: true });

      if (existingRefs.length > 0) {
        existingRefs.forEach((uRef) => {
          tx.set(
            uRef,
            {
              walletBalance: nextWalletBalance,
              activePendingWithdrawalId: targetWithdrawalId,
              updatedAt: nowIso
            },
            { merge: true }
          );
        });
      } else if (safeEmailDocId || authUid) {
        const fallbackWriteRef = doc(db, 'users', safeEmailDocId || authUid);
        tx.set(
          fallbackWriteRef,
          {
            uid: authUid || resolvedOwnerUid,
            email: cleanEmail,
            name: w.userName || fallbackProfile?.name || 'Player',
            walletBalance: nextWalletBalance,
            activePendingWithdrawalId: targetWithdrawalId,
            updatedAt: nowIso
          },
          { merge: true }
        );
      }

      return {
        success: true,
        alreadyProcessed: false,
        newWalletBalance: nextWalletBalance,
        withdrawal: { ...savedWithdrawal, firestoreDocId: targetWithdrawalId }
      };
    });

    return txResult;
  } catch (error) {
    if (handlePossibleQuotaError(error)) {
      const safeWallet = Math.max(0, Number(fallbackProfile?.walletBalance) || 0);
      return {
        success: true,
        newWalletBalance: Math.max(0, safeWallet - amt),
        withdrawal: buildSavedWithdrawal(targetWithdrawalId, new Date().toISOString())
      };
    }
    console.warn('submitWithdrawalTransaction fallback save notice:', error);
    // Fallback direct write so the withdrawal request is still saved to Firestore /withdrawals
    const fallbackNowIso = new Date().toISOString();
    const finalId = await resolveNonCollidingWithdrawalId(targetWithdrawalId, cleanEmail, resolvedOwnerUid);
    const existingFallbackSnap = await getDoc(doc(db, 'withdrawals', finalId)).catch(() => null);
    if (existingFallbackSnap && existingFallbackSnap.exists()) {
      const existingData = existingFallbackSnap.data() as WithdrawalRequest;
      const existingEmail = (existingData?.userEmail || existingData?.email || '').trim().toLowerCase();
      const sameOwner =
        (cleanEmail && existingEmail === cleanEmail) ||
        (resolvedOwnerUid && (existingData?.ownerUid === resolvedOwnerUid || existingData?.userId === resolvedOwnerUid));
      if (sameOwner && (existingData?.walletDeducted || existingData?.status !== 'pending')) {
        const userDocSnap = (safeEmailDocId || authUid)
          ? await getDoc(doc(db, 'users', safeEmailDocId || authUid)).catch(() => null)
          : null;
        const authoritativeBal = userDocSnap && userDocSnap.exists() && userDocSnap.data()?.walletBalance !== undefined
          ? Math.max(0, Number(userDocSnap.data()?.walletBalance) || 0)
          : Math.max(0, (Number(fallbackProfile?.walletBalance) || 0) - amt);
        return {
          success: true,
          alreadyProcessed: true,
          newWalletBalance: authoritativeBal,
          withdrawal: { ...existingData, firestoreDocId: finalId }
        };
      }
    }
    const fallbackSaved = buildSavedWithdrawal(finalId, fallbackNowIso);
    const nextWalletBalance = Math.max(0, (Number(fallbackProfile?.walletBalance) || 0) - amt);
    let persistedToFirestore = false;
    try {
      await saveWithdrawalToFirestore(fallbackSaved);
      const verifySnap = await getDoc(doc(db, 'withdrawals', finalId)).catch(() => null);
      if (verifySnap && verifySnap.exists()) {
        persistedToFirestore = true;
      }
      if (safeEmailDocId || authUid) {
        await setDoc(
          doc(db, 'users', safeEmailDocId || authUid),
          {
            uid: authUid || resolvedOwnerUid,
            email: cleanEmail,
            walletBalance: nextWalletBalance,
            activePendingWithdrawalId: finalId,
            updatedAt: fallbackNowIso
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch (saveErr) {
      console.warn('submitWithdrawalTransaction direct save notice:', saveErr);
    }

    if (!persistedToFirestore) {
      persistedToFirestore = await saveWithdrawalViaRestFallback(fallbackSaved);
    }

    if (!persistedToFirestore) {
      return {
        success: false,
        error: 'Unable to save withdrawal request to Firestore. Please check your internet connection and try again.'
      };
    }

    return {
      success: true,
      newWalletBalance: nextWalletBalance,
      withdrawal: { ...fallbackSaved, firestoreDocId: finalId }
    };
  }
}

/**
 * Atomic Firestore Transaction for Admin Approval / Rejection / Cancellation.
 * - Approval: marks 'approved' and NEVER deducts a second time.
 * - Rejection/Cancellation: refunds reserved amount exactly once if not already refunded.
 * - Duplicate protection: already resolved withdrawals (approved/rejected/cancelled) cannot transition again.
 */
export async function processWithdrawalStatusTransaction(
  withdrawalId: string,
  nextStatus: 'approved' | 'rejected' | 'cancelled',
  fallbackInfo?: {
    ownerUid?: string;
    userEmail?: string;
    amount?: number;
    firestoreDocId?: string;
  }
): Promise<{
  success: boolean;
  alreadyResolved?: boolean;
  resolvedStatus?: WithdrawalRequest['status'];
  refunded?: boolean;
  newWalletBalance?: number;
  error?: string;
}> {
  if (!withdrawalId) {
    return { success: false, error: 'Invalid withdrawal ID.' };
  }
  if (isFirestoreQuotaExceeded()) {
    return { success: false, error: 'Firestore quota exceeded. Please try again later.' };
  }

  let targetDocId = (fallbackInfo?.firestoreDocId || withdrawalId).trim();

  // Verify the authoritative Firestore document ID before starting the transaction so we never create orphan skeleton docs
  try {
    const directSnap = await getDoc(doc(db, 'withdrawals', targetDocId)).catch(() => null);
    if (!directSnap || !directSnap.exists()) {
      const altMatch = await findWithdrawalByIdViaRest(withdrawalId);
      if (altMatch?.docId) {
        targetDocId = altMatch.docId;
      } else {
        // Check SDK query by id or requestId if signed in as admin
        const byIdSnap = await getDocs(query(collection(db, 'withdrawals'), where('id', '==', withdrawalId))).catch(() => null);
        if (byIdSnap && !byIdSnap.empty) {
          targetDocId = byIdSnap.docs[0].id;
        } else {
          const byReqSnap = await getDocs(query(collection(db, 'withdrawals'), where('requestId', '==', withdrawalId))).catch(() => null);
          if (byReqSnap && !byReqSnap.empty) {
            targetDocId = byReqSnap.docs[0].id;
          }
        }
      }
    }
  } catch {}

  const wRef = doc(db, 'withdrawals', targetDocId);

  try {
    const txRes = await runTransaction(db, async (tx) => {
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists()) {
        return {
          success: false,
          error: `Withdrawal ${withdrawalId} not found in Firestore.`
        };
      }
      const wData = wSnap.data() as WithdrawalRequest;
      const currentStatus = String(wData?.status || 'pending').toLowerCase() as WithdrawalRequest['status'];

      if (currentStatus && currentStatus !== 'pending') {
        return {
          success: true,
          alreadyResolved: true,
          resolvedStatus: currentStatus,
          refunded: false
        };
      }

      const targetEmail = (wData?.userEmail || wData?.email || fallbackInfo?.userEmail || '').trim().toLowerCase();
      const safeEmailDocId = targetEmail ? targetEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
      const targetUid = (wData?.ownerUid || wData?.userId || fallbackInfo?.ownerUid || '').trim();
      const authMatchUid = (auth.currentUser?.email || '').trim().toLowerCase() === targetEmail && auth.currentUser?.uid
        ? auth.currentUser.uid
        : '';

      const candidateIds = Array.from(
        new Set(
          [safeEmailDocId, targetUid, authMatchUid]
            .map((s) => (s || '').trim())
            .filter((s) => Boolean(s) && !s.startsWith('usr-') && !s.startsWith('QK-USR-'))
        )
      );
      const candidateRefs = candidateIds.map((docId) => doc(db, 'users', docId));
      const userSnaps = await Promise.all(candidateRefs.map((ref) => tx.get(ref).catch(() => null)));

      const nowIso = new Date().toISOString();

      let freshestData: any = null;
      let freshestUpdatedMs = -1;
      const existingRefs: typeof candidateRefs = [];
      userSnaps.forEach((snap, idx) => {
        if (snap && snap.exists()) {
          existingRefs.push(candidateRefs[idx]);
          const d = snap.data();
          const rawMs = new Date(d?.updatedAt || 0).getTime();
          const ms = Number.isFinite(rawMs) ? rawMs : 0;
          if (!freshestData || ms >= freshestUpdatedMs) {
            freshestData = d;
            freshestUpdatedMs = ms;
          }
        }
      });

      if (nextStatus === 'approved') {
        tx.set(
          wRef,
          {
            status: 'approved',
            walletDeducted: wData?.walletDeducted ?? true,
            updatedAt: nowIso
          },
          { merge: true }
        );
        // Clear active pending marker on user docs without touching walletBalance (never double-deduct)
        existingRefs.forEach((uRef) => {
          tx.set(uRef, { activePendingWithdrawalId: '', updatedAt: nowIso }, { merge: true });
        });
        return {
          success: true,
          alreadyResolved: false,
          resolvedStatus: 'approved' as const,
          refunded: false
        };
      }

      // Rejected or Cancelled: refund once if deducted and not already refunded
      const alreadyRefunded = Boolean(wData?.walletRefunded);
      const wasDeducted = wData ? wData.walletDeducted !== false : true;
      const refundAmt = Math.max(
        0,
        Number(wData?.walletDeductedAmount ?? wData?.amount ?? fallbackInfo?.amount ?? 0) || 0
      );
      const shouldRefund = !alreadyRefunded && wasDeducted && refundAmt > 0;

      let newWalletBalance: number | undefined;

      tx.set(
        wRef,
        {
          status: nextStatus,
          walletRefunded: shouldRefund ? true : Boolean(wData?.walletRefunded),
          updatedAt: nowIso
        },
        { merge: true }
      );

      if (shouldRefund && existingRefs.length > 0) {
        const currentBal = Math.max(0, Number(freshestData?.walletBalance) || 0);
        newWalletBalance = Math.max(0, currentBal + refundAmt);
        existingRefs.forEach((uRef) => {
          tx.set(
            uRef,
            {
              walletBalance: newWalletBalance,
              activePendingWithdrawalId: '',
              updatedAt: nowIso
            },
            { merge: true }
          );
        });
      } else if (existingRefs.length > 0) {
        existingRefs.forEach((uRef) => {
          tx.set(uRef, { activePendingWithdrawalId: '', updatedAt: nowIso }, { merge: true });
        });
      }

      return {
        success: true,
        alreadyResolved: false,
        resolvedStatus: nextStatus,
        refunded: shouldRefund,
        newWalletBalance
      };
    });
    return txRes;
  } catch (error: any) {
    if (handlePossibleQuotaError(error)) {
      return { success: false, error: 'Firestore quota exceeded.' };
    }
    const errMsg = error?.message || String(error || '');
    const isPermDenied =
      error?.code === 'permission-denied' ||
      errMsg.includes('permission-denied') ||
      errMsg.includes('insufficient permissions');

    // When Admin Panel is unlocked via AdminAuthModal while a non-admin Firebase user is signed in,
    // use atomic Firestore REST commit (with currentDocument.updateTime preconditions) as fallback.
    if (isPermDenied) {
      return await processWithdrawalStatusViaRestFallback(withdrawalId, nextStatus, {
        ...fallbackInfo,
        firestoreDocId: targetDocId
      });
    }

    console.warn('processWithdrawalStatusTransaction notice:', error);
    return { success: false, error: errMsg || 'Failed to update withdrawal status in Firestore.' };
  }
}

export async function fetchWithdrawalsFromFirestore(ownerUid?: string, userEmail?: string): Promise<WithdrawalRequest[]> {
  const currentUser = auth.currentUser;
  if (isFirestoreQuotaExceeded()) return [];

  const isAdmin = currentUser?.email === 'nmlcompany720@gmail.com';
  const path = 'withdrawals';
  const cleanTargetUid = (ownerUid || '').trim();
  const cleanTargetEmail = (userEmail || '').trim().toLowerCase();
  const isUserScopedRequest = Boolean(cleanTargetUid || cleanTargetEmail);

  try {
    const map = new Map<string, WithdrawalRequest>();

    if (isUserScopedRequest && currentUser && !isAdmin) {
      // User-scoped view: only query ownerUid with real Firebase Auth UID to prevent permission-denied
      const queryUid = currentUser.uid;
      const queryEmail = cleanTargetEmail || (currentUser.email || '').trim().toLowerCase();
      const snapshots = await Promise.all([
        queryUid ? getDocs(query(collection(db, path), where('ownerUid', '==', queryUid))).catch(() => null) : Promise.resolve(null),
        queryEmail ? getDocs(query(collection(db, path), where('userEmail', '==', queryEmail))).catch(() => null) : Promise.resolve(null)
      ]);
      snapshots.forEach((snap) => {
        if (!snap) return;
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data) {
            const itemEmail = String(data.userEmail || data.email || '').trim().toLowerCase();
            if (queryEmail && itemEmail && itemEmail !== queryEmail) return;
            const id = data.id || docItem.id;
            map.set(id, {
              ...data,
              id,
              firestoreDocId: docItem.id,
              requestId: data.requestId || id,
              status: (String(data.status || 'pending').toLowerCase() as any)
            } as WithdrawalRequest);
          }
        });
      });
    } else {
      try {
        const snap = await getDocs(collection(db, path));
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data) {
            const item: WithdrawalRequest = {
              ...data,
              id: data.id || docItem.id,
              firestoreDocId: docItem.id,
              requestId: data.requestId || data.id || docItem.id,
              status: (String(data.status || 'pending').toLowerCase() as any)
            } as WithdrawalRequest;

            if (!isUserScopedRequest || isAdmin) {
              map.set(item.id, item);
            } else {
              const itemUid = (item.ownerUid || item.userId || '').trim();
              const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
              if (cleanTargetEmail && itemEmail && itemEmail !== cleanTargetEmail) return;
              const isMatch = (cleanTargetUid && (itemUid === cleanTargetUid || itemUid.replace(/^usr-/, '') === cleanTargetUid.replace(/^usr-/, ''))) ||
                              (cleanTargetEmail && itemEmail === cleanTargetEmail);
              if (isMatch) {
                map.set(item.id, item);
              }
            }
          }
        });
      } catch (listErr) {
        // When Admin Panel is unlocked via AdminAuthModal while a non-admin Firebase user is signed in,
        // Firestore client rules reject unfiltered collection list; fall back to public REST list + user queries.
        if (!isUserScopedRequest) {
          const restList = await fetchAllWithdrawalsViaRestFallback();
          restList.forEach((item) => {
            if (item && item.id) map.set(item.id, item);
          });
          if (currentUser) {
            const queryEmail = (currentUser.email || '').trim().toLowerCase();
            const userSnaps = await Promise.all([
              getDocs(query(collection(db, path), where('ownerUid', '==', currentUser.uid))).catch(() => null),
              queryEmail ? getDocs(query(collection(db, path), where('userEmail', '==', queryEmail))).catch(() => null) : Promise.resolve(null)
            ]);
            userSnaps.forEach((snap) => {
              if (!snap) return;
              snap.forEach((docItem) => {
                const data = docItem.data();
                if (data) {
                  const id = data.id || docItem.id;
                  map.set(id, {
                    ...data,
                    id,
                    firestoreDocId: docItem.id,
                    requestId: data.requestId || id,
                    status: (String(data.status || 'pending').toLowerCase() as any)
                  } as WithdrawalRequest);
                }
              });
            });
          }
        } else {
          throw listErr;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
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
  userEmail?: string,
  onError?: (error: unknown) => void
): () => void {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'withdrawals';
  const cleanTargetUid = (ownerUid || '').trim();
  const cleanTargetEmail = (userEmail || '').trim().toLowerCase();
  const isUserScopedRequest = Boolean(cleanTargetUid || cleanTargetEmail);

  let isDisposed = false;
  let activeUnsubs: (() => void)[] = [];
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let lastBoundAuthKey = '__unset__';

  const cleanupActiveListeners = () => {
    activeUnsubs.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    activeUnsubs = [];
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const attachListeners = () => {
    if (isDisposed) return;
    const currentUser = auth.currentUser;
    const nextAuthKey = currentUser ? `${currentUser.uid}:${(currentUser.email || '').toLowerCase()}` : 'anon';
    if (nextAuthKey === lastBoundAuthKey) return;
    lastBoundAuthKey = nextAuthKey;
    cleanupActiveListeners();

    const isAdmin = currentUser?.email === 'nmlcompany720@gmail.com';

    try {
      if (isUserScopedRequest && currentUser && !isAdmin) {
        const queryUid = currentUser.uid;
        const queryEmail = cleanTargetEmail || (currentUser.email || '').trim().toLowerCase();
        const byUid = new Map<string, WithdrawalRequest>();
        const byEmail = new Map<string, WithdrawalRequest>();

        const emitMerged = () => {
          if (isDisposed) return;
          const merged = new Map<string, WithdrawalRequest>();
          byUid.forEach((v, k) => merged.set(k, v));
          byEmail.forEach((v, k) => merged.set(k, v));
          const list = Array.from(merged.values()).sort((a, b) => {
            const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
            const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
            return timeB - timeA;
          });
          callback(list);
        };

        if (queryUid) {
          activeUnsubs.push(onSnapshot(query(collection(db, path), where('ownerUid', '==', queryUid)), (snap) => {
            byUid.clear();
            snap.forEach((docItem) => {
              const data = docItem.data();
              if (data) {
                const itemEmail = String(data.userEmail || data.email || '').trim().toLowerCase();
                if (queryEmail && itemEmail && itemEmail !== queryEmail) return;
                const id = data.id || docItem.id;
                byUid.set(id, {
                  ...data,
                  id,
                  firestoreDocId: docItem.id,
                  requestId: data.requestId || id,
                  status: (String(data.status || 'pending').toLowerCase() as any)
                } as WithdrawalRequest);
              }
            });
            emitMerged();
          }, (err) => {
            handlePossibleQuotaError(err);
            if (!queryEmail) onError?.(err);
          }));
        }

        if (queryEmail) {
          activeUnsubs.push(onSnapshot(query(collection(db, path), where('userEmail', '==', queryEmail)), (snap) => {
            byEmail.clear();
            snap.forEach((docItem) => {
              const data = docItem.data();
              if (data) {
                const id = data.id || docItem.id;
                byEmail.set(id, {
                  ...data,
                  id,
                  firestoreDocId: docItem.id,
                  requestId: data.requestId || id,
                  status: (String(data.status || 'pending').toLowerCase() as any)
                } as WithdrawalRequest);
              }
            });
            emitMerged();
          }, (err) => {
            handlePossibleQuotaError(err);
            onError?.(err);
          }));
        }
        return;
      }

      const unsubCollection = onSnapshot(collection(db, path), (snap) => {
        if (isDisposed) return;
        const list: WithdrawalRequest[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data();
          if (data) {
            const item: WithdrawalRequest = {
              ...data,
              id: data.id || docItem.id,
              firestoreDocId: docItem.id,
              requestId: data.requestId || data.id || docItem.id,
              status: (String(data.status || 'pending').toLowerCase() as any)
            } as WithdrawalRequest;

            if (!isUserScopedRequest || isAdmin) {
              list.push(item);
            } else {
              const itemUid = (item.ownerUid || item.userId || '').trim();
              const itemEmail = (item.userEmail || item.email || '').trim().toLowerCase();
              if (cleanTargetEmail && itemEmail && itemEmail !== cleanTargetEmail) return;
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
        // If Admin Panel is active while a non-admin Firebase Auth user is signed in,
        // fallback to REST sync so Admin still receives all pending withdrawals.
        if (!isUserScopedRequest && !isDisposed && !fallbackTimer) {
          const syncAll = () => {
            fetchAllWithdrawalsViaRestFallback().then((list) => {
              if (!isDisposed && list.length > 0) {
                callback(list);
              }
            }).catch(() => {});
          };
          syncAll();
          fallbackTimer = setInterval(syncAll, 4000);
        } else if (isUserScopedRequest) {
          onError?.(err);
        }
      });

      activeUnsubs.push(unsubCollection);
    } catch (err) {
      onError?.(err);
    }
  };

  attachListeners();

  let unsubAuth: (() => void) | null = null;
  try {
    unsubAuth = onAuthStateChanged(auth, () => {
      attachListeners();
    });
  } catch {}

  return () => {
    isDisposed = true;
    cleanupActiveListeners();
    if (unsubAuth) {
      try {
        unsubAuth();
      } catch {}
    }
  };
}

export async function deleteWithdrawalFromFirestore(withdrawalId: string): Promise<void> {
  if (!withdrawalId || isFirestoreQuotaExceeded()) return;
  // STRICT ZERO-DELETION & TERMINAL STATUS PROTECTION:
  // Resolved withdrawals (approved/rejected/cancelled) must NEVER have their status overwritten to 'cancelled'
  // when hidden from the Admin ledger view; only set adminHidden: true while preserving terminal status.
  try {
    const wRef = doc(db, 'withdrawals', withdrawalId);
    const snap = await getDoc(wRef).catch(() => null);
    if (snap && snap.exists()) {
      const currentStatus = String(snap.data()?.status || 'pending').toLowerCase();
      if (currentStatus !== 'pending') {
        await setDoc(wRef, { adminHidden: true, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        return;
      }
    } else {
      const restDoc = await findWithdrawalByIdViaRest(withdrawalId);
      if (restDoc) {
        const currentStatus = String(restDoc.data?.status || 'pending').toLowerCase();
        if (currentStatus !== 'pending' && typeof fetch !== 'undefined') {
          await fetch(`${getFirestoreRestBase()}/withdrawals/${encodeURIComponent(restDoc.docId)}?updateMask.fieldPaths=adminHidden&updateMask.fieldPaths=updatedAt`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: encodeFirestoreRestFields({ adminHidden: true, updatedAt: new Date().toISOString() })
            })
          }).catch(() => {});
          return;
        }
      }
    }
  } catch {}
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



