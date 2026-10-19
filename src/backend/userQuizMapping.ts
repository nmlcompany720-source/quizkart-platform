import { Question, QuestionCategory } from '../types';
import { normalizeCategory } from '../utils/aiQuestionParser';
import { questionPoolManager } from '../utils/questionPoolManager';

/**
 * USER REGISTRATION ID TRACKING & MAPPING BACKEND
 * 
 * Step 1: User Registration ID Tracking & Mapping
 * Links each active player's unique registration ID (e.g., Reg ID: 1001 / USR-1001)
 * to their live quiz session.
 * Tracks and stores a permanent history log of question IDs already attempted and seen
 * by each specific User ID to prevent duplicate question delivery across sessions.
 * 
 * Step 2: 10-Question Balanced Set Generation Algorithm (No-Repeat Pool)
 * Queries the massive question pool (up to 30,000+ items) and filters out all questions
 * previously attempted by that specific User ID.
 * Strictly generates a 10-question set with:
 *   - 2 Maths Questions
 *   - 2 Reasoning Questions
 *   - 2 Science Questions
 *   - 2 GK Questions
 *   - 2 English Questions
 * Tags each question uniquely to that User ID's active session (Question #1 to #10).
 * 
 * Step 3: Smart Fallback Shuffle (Exhaustion Handling)
 * If a user has attempted all available questions in the database (or category),
 * automatically activates Smart Randomization Shuffle mode.
 * Securely reuses questions in randomized slot order, shuffling options (A, B, C, D)
 * and dynamically re-mapping correctIndex & correctKey so no two consecutive attempts
 * feel identical while preserving 100% answer correctness.
 */

export interface LiveQuizSession {
  sessionId: string;
  registrationId: string;       // e.g., "USR-1001"
  numericRegId: number;         // e.g., 1001
  rawUserId: string;
  contestId?: string;
  isPractice: boolean;
  startedAt: string;
  startTimestampMs: number;
  questionIds: number[];
  questions: Question[];
  isExhaustionFallbackActive: boolean;
  status: 'active' | 'completed' | 'abandoned';
  completedAt?: string;
}

export const BALANCED_SUBJECT_ROTATION: { category: QuestionCategory; count: number }[] = [
  { category: 'Maths', count: 2 },
  { category: 'Reasoning', count: 2 },
  { category: 'Science', count: 2 },
  { category: 'GK', count: 2 },
  { category: 'English', count: 2 }
];

const USER_HISTORY_STORAGE_PREFIX = 'quizkart_user_seen_q_history_';
const ACTIVE_SESSION_STORAGE_PREFIX = 'quizkart_user_active_session_';

class UserQuizMappingStateManager {
  // In-memory quick lookup cache: Canonical User ID -> Set of attempted question IDs
  private userHistoryCache: Map<string, Set<number>> = new Map();
  // In-memory live sessions: Canonical User ID -> LiveQuizSession
  private activeSessionsCache: Map<string, LiveQuizSession> = new Map();

  constructor() {
    this.hydrateFromStorage();
  }

  /**
   * Normalizes any incoming user identifier (e.g. "QK-USR-1001", "USR-1001", "1001", "Reg ID: 1001")
   * into a canonical Registration ID string (strictly "QK-USR-1001")
   */
  public normalizeRegistrationId(id?: string | number): string {
    if (id == null || id === '') return 'QK-USR-1001';
    
    const str = String(id).trim();

    // Check if format is "QK-USR-1001" or "qk-usr-1001"
    const qkUsrMatch = str.match(/qk-usr-(\d+)/i);
    if (qkUsrMatch) {
      return `QK-USR-${qkUsrMatch[1]}`;
    }
    
    // Check if format is "Reg ID: 1001" or "Reg ID 1001"
    const regMatch = str.match(/reg\s*(?:id)?[:\s-]*(\d+)/i);
    if (regMatch) {
      return `QK-USR-${regMatch[1]}`;
    }

    // Check if format is "USR-1001" or "usr-1001"
    const usrMatch = str.match(/usr-(\d+)/i);
    if (usrMatch) {
      return `QK-USR-${usrMatch[1]}`;
    }

    // Pure number like 1001 or "1001"
    if (/^\d+$/.test(str)) {
      return `QK-USR-${str}`;
    }

    // Fallback: If alphanumeric string, sanitize with QK- prefix
    return str.startsWith('QK-') ? str.toUpperCase() : `QK-${str.toUpperCase()}`;
  }

  /**
   * Extracts the pure numeric registration ID (e.g. 1001 from "USR-1001" or "Reg ID: 1001")
   */
  public extractNumericRegId(id?: string | number): number {
    if (typeof id === 'number') return id;
    if (!id) return 1001;
    const match = String(id).match(/\d+/);
    return match ? parseInt(match[0], 10) : 1001;
  }

  /**
   * Hydrates memory cache from persistent localStorage on init
   */
  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(USER_HISTORY_STORAGE_PREFIX)) {
          const userId = key.replace(USER_HISTORY_STORAGE_PREFIX, '');
          const raw = localStorage.getItem(key);
          if (raw) {
            const ids: number[] = JSON.parse(raw);
            if (Array.isArray(ids)) {
              this.userHistoryCache.set(userId, new Set(ids));
            }
          }
        } else if (key && key.startsWith(ACTIVE_SESSION_STORAGE_PREFIX)) {
          const userId = key.replace(ACTIVE_SESSION_STORAGE_PREFIX, '');
          const raw = localStorage.getItem(key);
          if (raw) {
            const session: LiveQuizSession = JSON.parse(raw);
            if (session && session.status === 'active') {
              this.activeSessionsCache.set(userId, session);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[UserQuizMapping] Storage hydration warning:', err);
    }
  }

  /**
   * Retrieve the permanent history log of question IDs already attempted and seen by specific User ID
   */
  public getAttemptedQuestionIds(userId: string | number): number[] {
    const canonicalId = this.normalizeRegistrationId(userId);
    
    // Check in-memory cache first
    let set = this.userHistoryCache.get(canonicalId);
    if (!set) {
      // Read from persistent storage
      try {
        const raw = localStorage.getItem(`${USER_HISTORY_STORAGE_PREFIX}${canonicalId}`);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            set = new Set<number>(list.map(Number));
            this.userHistoryCache.set(canonicalId, set);
          }
        }
      } catch {}
    }

    // Also check global legacy key for backward compatibility if empty
    if (!set || set.size === 0) {
      try {
        const legacyRaw = localStorage.getItem('quizkart_user_answered_q_ids');
        if (legacyRaw) {
          const legacyIds: number[] = JSON.parse(legacyRaw);
          if (Array.isArray(legacyIds) && legacyIds.length > 0) {
            set = new Set<number>(legacyIds.map(Number));
            this.userHistoryCache.set(canonicalId, set);
            this.persistUserHistory(canonicalId, Array.from(set));
          }
        }
      } catch {}
    }

    return set ? Array.from(set) : [];
  }

  /**
   * Track and store a permanent history log of question IDs already attempted and seen by each specific User ID
   */
  public recordAttemptedQuestionIds(userId: string | number, newQuestionIds: (number | string)[]): void {
    if (!newQuestionIds || newQuestionIds.length === 0) return;
    const canonicalId = this.normalizeRegistrationId(userId);
    
    let set = this.userHistoryCache.get(canonicalId);
    if (!set) {
      set = new Set<number>(this.getAttemptedQuestionIds(canonicalId));
      this.userHistoryCache.set(canonicalId, set);
    }

    for (const qid of newQuestionIds) {
      const num = Number(qid);
      if (!isNaN(num)) {
        set.add(num);
      }
    }

    const fullList = Array.from(set);
    this.persistUserHistory(canonicalId, fullList);
  }

  /**
   * Persists history to storage
   */
  private persistUserHistory(canonicalId: string, ids: number[]): void {
    try {
      localStorage.setItem(`${USER_HISTORY_STORAGE_PREFIX}${canonicalId}`, JSON.stringify(ids));
      // Also update legacy key to maintain app-wide compatibility
      localStorage.setItem('quizkart_user_answered_q_ids', JSON.stringify(ids));
    } catch (err) {
      console.warn('[UserQuizMapping] LocalStorage full when saving history for', canonicalId, err);
    }
  }

  /**
   * Check if a specific question has already been attempted by User ID
   */
  public hasUserAttempted(userId: string | number, questionId: number | string): boolean {
    const canonicalId = this.normalizeRegistrationId(userId);
    const set = this.userHistoryCache.get(canonicalId);
    const num = Number(questionId);
    if (set) {
      return set.has(num);
    }
    const list = this.getAttemptedQuestionIds(canonicalId);
    return list.includes(num);
  }

  /**
   * Clear question history for a user (useful for admin testing)
   */
  public clearUserHistory(userId: string | number): void {
    const canonicalId = this.normalizeRegistrationId(userId);
    this.userHistoryCache.delete(canonicalId);
    try {
      localStorage.removeItem(`${USER_HISTORY_STORAGE_PREFIX}${canonicalId}`);
    } catch {}
  }

  /**
   * Creates and links an active live quiz session to the user's registration ID
   */
  public createLiveQuizSession(params: {
    userId: string | number;
    questions: Question[];
    contestId?: string;
    isPractice?: boolean;
    isExhaustionFallbackActive?: boolean;
  }): LiveQuizSession {
    const canonicalId = this.normalizeRegistrationId(params.userId);
    const numericRegId = this.extractNumericRegId(params.userId);
    const timestamp = Date.now();
    const sessionId = `QZ-SESS-${numericRegId}-${timestamp}`;

    const session: LiveQuizSession = {
      sessionId,
      registrationId: canonicalId,
      numericRegId,
      rawUserId: String(params.userId),
      contestId: params.contestId,
      isPractice: !!params.isPractice,
      startedAt: new Date(timestamp).toISOString(),
      startTimestampMs: timestamp,
      questionIds: params.questions.map(q => Number(q.id)),
      questions: params.questions,
      isExhaustionFallbackActive: !!params.isExhaustionFallbackActive,
      status: 'active'
    };

    this.activeSessionsCache.set(canonicalId, session);

    try {
      sessionStorage.setItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`, JSON.stringify(session));
      localStorage.setItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`, JSON.stringify(session));
    } catch {}

    return session;
  }

  /**
   * Retrieves current active live quiz session for User ID
   */
  public getActiveQuizSession(userId: string | number): LiveQuizSession | null {
    const canonicalId = this.normalizeRegistrationId(userId);
    
    const inMem = this.activeSessionsCache.get(canonicalId);
    if (inMem && inMem.status === 'active') {
      return inMem;
    }

    try {
      const raw = sessionStorage.getItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`) ||
                  localStorage.getItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`);
      if (raw) {
        const session: LiveQuizSession = JSON.parse(raw);
        if (session && session.status === 'active') {
          this.activeSessionsCache.set(canonicalId, session);
          return session;
        }
      }
    } catch {}

    return null;
  }

  /**
   * Marks a session as completed and persists attempted questions permanently
   */
  public completeLiveQuizSession(userId: string | number, sessionId?: string): void {
    const canonicalId = this.normalizeRegistrationId(userId);
    const session = this.getActiveQuizSession(canonicalId);

    if (session && (!sessionId || session.sessionId === sessionId)) {
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      this.activeSessionsCache.delete(canonicalId);

      // Record questions as attempted in permanent history
      this.recordAttemptedQuestionIds(canonicalId, session.questionIds);

      try {
        sessionStorage.removeItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`);
        localStorage.removeItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`);
      } catch {}
    }
  }

  /**
   * Abandons an active session
   */
  public abandonLiveQuizSession(userId: string | number): void {
    const canonicalId = this.normalizeRegistrationId(userId);
    this.activeSessionsCache.delete(canonicalId);
    try {
      sessionStorage.removeItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`);
      localStorage.removeItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${canonicalId}`);
    } catch {}
  }
}

export const userQuizMapping = new UserQuizMappingStateManager();

/**
 * Helper: In-place Fisher-Yates shuffle
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Smart Randomization Shuffle Engine for a single question:
 * - Shuffles the 4 options (A, B, C, D)
 * - Dynamically re-maps `correctIndex` and `correctKey` so that the correct answer remains 100% mathematically accurate.
 * - Prevents identical question presentation on repeated quiz attempts.
 */
export function smartShuffleQuestionOptions(q: Question): Question {
  if (!q.options || q.options.length !== 4) return { ...q };

  const originalCorrectAnswer = q.options[q.correctIndex];
  
  // Create indexed option pairs to trace positions
  const paired = q.options.map((opt, idx) => ({ opt, isCorrect: idx === q.correctIndex }));
  const shuffledPairs = shuffle(paired);

  const newOptions = shuffledPairs.map(p => p.opt) as [string, string, string, string];
  const newCorrectIndex = shuffledPairs.findIndex(p => p.isCorrect);
  const keys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const newCorrectKey = keys[newCorrectIndex] || 'A';

  return {
    ...q,
    options: newOptions,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
    correctKey: newCorrectKey,
    isShuffledFallback: true
  };
}

/**
 * 10-QUESTION BALANCED SET GENERATION ALGORITHM (NO-REPEAT POOL & SMART FALLBACK)
 * 
 * Rules:
 * 1. Filter out all questions previously attempted by the specific User ID.
 * 2. Balance strictly across 5 subjects:
 *    - 2 Maths Questions
 *    - 2 Reasoning Questions
 *    - 2 Science Questions
 *    - 2 GK Questions
 *    - 2 English Questions
 * 3. Tag each generated question uniquely to that User ID's active session from Question #1 to #10.
 * 4. Smart Fallback Shuffle (Exhaustion Handling):
 *    If unseen questions are exhausted (overall or in a subject), securely reuse previously attempted
 *    questions in randomized slot order, shuffling options and slot positions so no two consecutive
 *    attempts feel identical.
 */
export function generateUserBalancedQuizSet(params: {
  userId: string | number;
  pool?: Question[];
  contestId?: string;
  isPractice?: boolean;
}): {
  questions: Question[];
  session: LiveQuizSession;
  isExhaustionFallbackActive: boolean;
} {
  const { userId, contestId, isPractice } = params;
  const canonicalId = userQuizMapping.normalizeRegistrationId(userId);
  const numericRegId = userQuizMapping.extractNumericRegId(userId);

  // 1. Resolve master question pool (from questionPoolManager or param)
  const masterPool = params.pool !== undefined
    ? params.pool
    : questionPoolManager.getAll();

  if (!masterPool || masterPool.length === 0) {
    const emptySession = userQuizMapping.createLiveQuizSession({
      userId,
      questions: [],
      contestId,
      isPractice,
      isExhaustionFallbackActive: false
    });
    return {
      questions: [],
      session: emptySession,
      isExhaustionFallbackActive: false
    };
  }

  // 2. Query permanent history log for this specific User ID
  const attemptedIds = userQuizMapping.getAttemptedQuestionIds(canonicalId);
  const attemptedIdSet = new Set<number>(attemptedIds);

  // 3. Group questions into 5 strict subject buckets
  const unseenBuckets: Record<QuestionCategory, Question[]> = {
    Maths: [],
    Reasoning: [],
    Science: [],
    GK: [],
    English: []
  };

  const seenBuckets: Record<QuestionCategory, Question[]> = {
    Maths: [],
    Reasoning: [],
    Science: [],
    GK: [],
    English: []
  };

  for (const q of masterPool) {
    if (!q || q.id == null) continue;
    const cat = normalizeCategory(q.category, `${q.question || q.stem || ''} ${q.explanation || ''}`);
    const numId = Number(q.id);

    if (attemptedIdSet.has(numId)) {
      seenBuckets[cat].push(q);
    } else {
      unseenBuckets[cat].push(q);
    }
  }

  const selectedQuestions: Question[] = [];
  const selectedIdSet = new Set<number>();
  let exhaustionActivated = false;

  // 4. Sample strict 2 questions per subject
  for (const { category, count } of BALANCED_SUBJECT_ROTATION) {
    const unseenList = shuffle(unseenBuckets[category].filter(q => !selectedIdSet.has(Number(q.id))));
    const seenList = shuffle(seenBuckets[category].filter(q => !selectedIdSet.has(Number(q.id))));

    const pickedForCategory: Question[] = [];

    // Step A: Pick from unseen questions first
    for (const q of unseenList) {
      if (pickedForCategory.length >= count) break;
      pickedForCategory.push({ ...q, isShuffledFallback: false });
      selectedIdSet.add(Number(q.id));
    }

    // Step B: Smart Fallback Shuffle if unseen questions in this subject are exhausted
    if (pickedForCategory.length < count) {
      exhaustionActivated = true;
      const needed = count - pickedForCategory.length;

      for (const q of seenList) {
        if (pickedForCategory.length >= count) break;
        // Apply smart option shuffle and flag as fallback
        const randomized = smartShuffleQuestionOptions(q);
        pickedForCategory.push(randomized);
        selectedIdSet.add(Number(q.id));
      }
    }

    selectedQuestions.push(...pickedForCategory);
  }

  // 5. Global Backfill if pool had fewer than 10 questions across subjects
  if (selectedQuestions.length < 10) {
    exhaustionActivated = true;
    const remainingCandidates = shuffle(
      masterPool.filter(q => q && q.id != null && !selectedIdSet.has(Number(q.id)))
    );

    for (const q of remainingCandidates) {
      if (selectedQuestions.length >= 10) break;
      const randomized = smartShuffleQuestionOptions(q);
      selectedQuestions.push(randomized);
      selectedIdSet.add(Number(q.id));
    }

    // Absolute fallback: If pool itself has fewer than 10 total distinct questions, allow smart reshuffle of selected
    if (selectedQuestions.length < 10 && masterPool.length > 0) {
      const needed = 10 - selectedQuestions.length;
      const poolShuffled = shuffle(masterPool);
      for (let i = 0; i < needed; i++) {
        const base = poolShuffled[i % poolShuffled.length];
        const randomized = smartShuffleQuestionOptions(base);
        // Tag with a temporary unique synthetic id so react keys don't clash
        selectedQuestions.push({
          ...randomized,
          id: Number(`${base.id}${Date.now() % 1000}${i}`)
        });
      }
    }
  }

  // 6. Final Randomization of slot positions (slots 1 to 10)
  // Ensures that question sequence (slot order) is also randomized
  const finalOrderedQuestions = shuffle(selectedQuestions.slice(0, 10));

  // Generate unique session ID for linking
  const timestamp = Date.now();
  const sessionId = `QZ-SESS-${numericRegId}-${timestamp}`;

  // 7. Tag the generated 10-question set uniquely to that User ID's active session from Question #1 to Question #10
  const taggedQuestions: Question[] = finalOrderedQuestions.map((q, idx) => {
    const slotIndex = idx + 1; // Question #1 to Question #10
    const cat = normalizeCategory(q.category, `${q.question || q.stem || ''} ${q.explanation || ''}`);
    return {
      ...q,
      sessionUserId: canonicalId,
      sessionId,
      slotIndex,
      category: cat
    };
  });

  // 8. Register and map live quiz session
  const session = userQuizMapping.createLiveQuizSession({
    userId: canonicalId,
    questions: taggedQuestions,
    contestId,
    isPractice,
    isExhaustionFallbackActive: exhaustionActivated
  });

  return {
    questions: taggedQuestions,
    session,
    isExhaustionFallbackActive: exhaustionActivated
  };
}
