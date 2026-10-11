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
  query,
  where,
  onSnapshot,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Question, ActiveContest, LeaderboardEntry, UserProfile, QuizAttemptResult, DepositRequest, WithdrawalRequest, SupportTicket, BannerSlide } from './types';
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

// Firestore persistence helpers for QuizKart
export async function syncUserProfile(profile: UserProfile): Promise<void> {
  if (!profile || isDemoSeedUser(profile) || isFirestoreQuotaExceeded()) return;
  const currentUser = auth.currentUser;
  const docId = currentUser?.uid || profile.uid || profile.id || (profile.email ? profile.email.replace(/[^a-zA-Z0-9_-]/g, '_') : null);
  if (!docId) return;

  const path = `users/${docId}`;
  try {
    await setDoc(doc(db, 'users', docId), {
      uid: docId,
      id: profile.id || docId,
      name: profile.name || currentUser?.displayName || 'Player',
      email: profile.email || currentUser?.email || '',
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
      registrationDate: profile.registrationDate || new Date().toISOString(),
      passwordStatus: (profile.passwordStatus && !profile.passwordStatus.includes('••••') && !profile.passwordStatus.includes('Secured')) ? profile.passwordStatus : 'player@123',
      hasPassword: profile.hasPassword ?? true,
      kycStatus: profile.kycStatus || 'Unverified',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    // Gracefully log if unauthenticated in preview mode
    console.warn('Firestore user sync notice:', error);
  }
}

export async function fetchAllUsersFromFirestore(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list: UserProfile[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data() as UserProfile;
      if (data && (data.name || data.email) && !isDemoSeedUser(data)) {
        list.push({
          ...data,
          id: data.id || data.uid || docItem.id,
          uid: data.uid || docItem.id
        });
      }
    });
    return list;
  } catch (error) {
    return [];
  }
}

export function subscribeToAllUsersFromFirestore(callback: (users: UserProfile[]) => void): () => void {
  const path = 'users';
  try {
    return onSnapshot(
      collection(db, path),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data() as UserProfile;
          if (data && (data.name || data.email) && !isDemoSeedUser(data)) {
            list.push({
              ...data,
              id: data.id || data.uid || docItem.id,
              uid: data.uid || docItem.id
            });
          }
        });
        callback(list);
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}

export async function fetchUserProfile(uid: string): Promise<Partial<UserProfile> | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as Partial<UserProfile>;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
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

export async function recordQuizAttemptInFirestore(attempt: QuizAttemptResult): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || isFirestoreQuotaExceeded()) return;

  const path = `quiz_attempts/${attempt.attemptId}`;
  try {
    await setDoc(doc(db, 'quiz_attempts', attempt.attemptId), {
      attemptId: attempt.attemptId,
      userId: currentUser.uid,
      quizDate: attempt.quizDate,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      timeTakenSeconds: attempt.timeTakenSeconds,
      rank: attempt.rank,
      rewardWon: attempt.rewardWon,
      rewardType: attempt.rewardType,
      rewardAmount: attempt.rewardAmount || 0,
      title: attempt.title || 'Cash Tournament',
      submittedAt: attempt.submittedAt || new Date().toISOString()
    });
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserQuizAttemptsFromFirestore(userId: string): Promise<QuizAttemptResult[]> {
  if (!userId) return [];
  const path = 'quiz_attempts';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snap = await getDocs(q);
    const list: QuizAttemptResult[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({
          attemptId: data.attemptId || docItem.id,
          quizDate: data.quizDate || '',
          score: data.score || 0,
          totalQuestions: data.totalQuestions || 10,
          timeTakenSeconds: data.timeTakenSeconds || 0,
          answers: data.answers || {},
          markedForReview: data.markedForReview || [],
          rank: data.rank || 1,
          totalParticipants: data.totalParticipants || 100,
          rewardWon: data.rewardWon || '',
          rewardType: data.rewardType || 'none',
          rewardAmount: data.rewardAmount || 0,
          title: data.title || 'Cash Tournament',
          submittedAt: data.submittedAt || new Date().toISOString()
        } as QuizAttemptResult);
      }
    });
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
  userId: string,
  onUpdate: (attempts: QuizAttemptResult[]) => void
): () => void {
  if (!userId) return () => {};
  const path = 'quiz_attempts';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    return onSnapshot(q, (snap) => {
      const list: QuizAttemptResult[] = [];
      snap.forEach((docItem) => {
        const data = docItem.data();
        if (data) {
          list.push({
            attemptId: data.attemptId || docItem.id,
            quizDate: data.quizDate || '',
            score: data.score || 0,
            totalQuestions: data.totalQuestions || 10,
            timeTakenSeconds: data.timeTakenSeconds || 0,
            answers: data.answers || {},
            markedForReview: data.markedForReview || [],
            rank: data.rank || 1,
            totalParticipants: data.totalParticipants || 100,
            rewardWon: data.rewardWon || '',
            rewardType: data.rewardType || 'none',
            rewardAmount: data.rewardAmount || 0,
            title: data.title || 'Cash Tournament',
            submittedAt: data.submittedAt || new Date().toISOString()
          } as QuizAttemptResult);
        }
      });
      list.sort((a, b) => {
        const timeA = new Date(a.submittedAt || 0).getTime();
        const timeB = new Date(b.submittedAt || 0).getTime();
        return timeB - timeA;
      });
      onUpdate(list);
    }, (error) => {
      console.warn('Error in quiz attempts subscription:', error);
    });
  } catch (err) {
    console.warn('Snapshot listener error for quiz attempts:', err);
    return () => {};
  }
}

// Deposit Requests Cloud Database Sync
export async function saveDepositToFirestore(deposit: DepositRequest): Promise<void> {
  if (!deposit || !deposit.id || isFirestoreQuotaExceeded()) return;
  const path = `deposits/${deposit.id}`;
  const cleanEmail = (deposit.userEmail || deposit.email || auth.currentUser?.email || '').trim().toLowerCase();
  try {
    await setDoc(doc(db, 'deposits', deposit.id), {
      id: deposit.id,
      userName: deposit.userName,
      userEmail: cleanEmail,
      email: cleanEmail,
      phone: deposit.phone || '',
      upiId: deposit.upiId || '',
      amount: Number(deposit.amount),
      utrNumber: deposit.utrNumber || '',
      screenshotUrl: deposit.screenshotUrl || '',
      app: deposit.app || 'PhonePe',
      timestamp: deposit.timestamp || new Date().toISOString(),
      status: deposit.status || 'pending',
      userId: auth.currentUser?.uid || null,
      updatedAt: new Date().toISOString()
    });

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

export async function updateDepositStatusInFirestore(depositId: string, status: 'pending' | 'approved' | 'rejected'): Promise<void> {
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

export async function fetchDepositsFromFirestore(): Promise<DepositRequest[]> {
  const path = 'deposits';
  try {
    const snap = await getDocs(collection(db, path));
    const list: DepositRequest[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as DepositRequest);
      }
    });
    return list;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {}
    return [];
  }
}

export async function deleteDepositFromFirestore(depositId: string): Promise<void> {
  if (!depositId || isFirestoreQuotaExceeded()) return;
  const path = `deposits/${depositId}`;
  try {
    await deleteDoc(doc(db, 'deposits', depositId));
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore deposit deletion notice (${depositId}):`, error);
  }
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
  try {
    await setDoc(doc(db, 'withdrawals', w.id), {
      id: w.id,
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
      userId: auth.currentUser?.uid || null,
      updatedAt: new Date().toISOString()
    });
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

export async function fetchWithdrawalsFromFirestore(): Promise<WithdrawalRequest[]> {
  const path = 'withdrawals';
  try {
    const snap = await getDocs(collection(db, path));
    const list: WithdrawalRequest[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as WithdrawalRequest);
      }
    });
    return list;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {}
    return [];
  }
}

export async function deleteWithdrawalFromFirestore(withdrawalId: string): Promise<void> {
  if (!withdrawalId || isFirestoreQuotaExceeded()) return;
  const path = `withdrawals/${withdrawalId}`;
  try {
    await deleteDoc(doc(db, 'withdrawals', withdrawalId));
  } catch (error) {
    if (handlePossibleQuotaError(error)) return;
    console.warn(`Firestore withdrawal deletion notice (${withdrawalId}):`, error);
  }
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
  const path = 'support_tickets';
  try {
    const snap = await getDocs(collection(db, path));
    const list: SupportTicket[] = [];
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data) {
        list.push({ ...data, id: data.id || docItem.id } as SupportTicket);
      }
    });
    return list;
  } catch (error) {
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


