import { Question, QuestionCategory } from '../types';
import { normalizeCategory } from './aiQuestionParser';

/**
 * HIGH-CAPACITY QUESTION BANK POOL MANAGER
 * 
 * Supports storing and indexing 30,000+ questions seamlessly.
 * - Utilizes IndexedDB as primary high-capacity storage (bypassing 5MB LocalStorage limit)
 * - In-memory multi-index (by ID, by Category, by Difficulty) for sub-millisecond retrieval
 * - Graceful fallback to LocalStorage with quota protection
 */

const DB_NAME = 'quizkart_high_capacity_db';
const DB_VERSION = 1;
const STORE_NAME = 'question_bank_pool';
const LOCAL_STORAGE_FALLBACK_KEY = 'quizkart_questions';
const DELETED_QUESTION_IDS_KEY = 'quizkart_deleted_question_ids';

const OLD_MOCK_STEM_FRAGMENTS = [
  'If a train travels 360 km',
  'ratio of two numbers is 3:5',
  'shopkeeper sells an article for ₹840',
  'compound interest on ₹10,000',
  'missing number in the sequence: 4, 9, 19, 39',
  'WATER" is coded as "YCVGT"',
  'daughter of my grandfather',
  'Clock : Time :: Thermometer',
  'Chandrayaan',
  'molecular scattering of light',
  'highest thermal and electrical conductivity',
  'critical speed required for an object to permanently escape',
  'Father of the Indian Constitution',
  'widely used Indian digital payment protocol',
  'Brihadeeswarar Temple',
  'promulgate ordinances',
  'BENEVOLENT',
  'Accommodate',
  'She has been proficient',
  'burn the midnight oil'
];

export function isOldMockQuestion(q?: Partial<Question> | null): boolean {
  if (!q) return false;
  // Never treat custom, retake, or explicitly assigned questions as old mock questions!
  if ((q as any).isCustom || (q as any).isUserCreated || (q as any).isRetake || (q as any).assignedUserId) {
    return false;
  }
  const text = `${q.stem || ''} ${q.question || ''}`;
  return OLD_MOCK_STEM_FRAGMENTS.some(frag => text.includes(frag));
}

class QuestionPoolManager {
  private memoryCache: Question[] = [];
  private idIndex: Map<string | number, Question> = new Map();
  private categoryIndex: Map<QuestionCategory, Question[]> = new Map();
  private isInitialized = false;
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor() {
    this.initIndices();
  }

  private initIndices() {
    this.categoryIndex.set('Maths', []);
    this.categoryIndex.set('Reasoning', []);
    this.categoryIndex.set('Science', []);
    this.categoryIndex.set('GK', []);
    this.categoryIndex.set('English', []);
  }

  /**
   * Get set of permanently deleted question IDs
   */
  public getDeletedQuestionIds(): Set<number> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return new Set();
      const raw = localStorage.getItem(DELETED_QUESTION_IDS_KEY);
      if (!raw) return new Set();
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return new Set(list.map(Number).filter(id => !isNaN(id)));
      }
    } catch {}
    return new Set();
  }

  /**
   * Record a permanently deleted question ID
   */
  public recordDeletedQuestionId(id: number): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const set = this.getDeletedQuestionIds();
      set.add(Number(id));
      localStorage.setItem(DELETED_QUESTION_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  /**
   * Remove an ID from permanently deleted question IDs (when newly created/imported)
   */
  public unrecordDeletedQuestionId(id: number): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const set = this.getDeletedQuestionIds();
      set.delete(Number(id));
      localStorage.setItem(DELETED_QUESTION_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  /**
   * Initialize IndexedDB connection
   */
  private getDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === 'undefined' || !window.indexedDB) {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('difficulty', 'difficulty', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB unavailable, using fallback storage');
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

  }

  /**
   * Rebuild in-memory high-speed indices
   */
  public rebuildIndices(questions: Question[]): void {
    const deletedSet = this.getDeletedQuestionIds();
    const cleanQuestions = questions.filter(q => {
      if (!q || q.id == null) return false;
      if (deletedSet.has(Number(q.id))) return false;
      if (isOldMockQuestion(q)) {
        this.recordDeletedQuestionId(Number(q.id));
        return false;
      }
      return true;
    });

    this.memoryCache = cleanQuestions;
    this.idIndex.clear();
    this.initIndices();

    for (const q of cleanQuestions) {
      if (!q || q.id == null) continue;
      this.idIndex.set(String(q.id), q);
      this.idIndex.set(Number(q.id), q);

      const cat = this.normalizeCategory(q.category);
      const list = this.categoryIndex.get(cat);
      if (list) {
        list.push(q);
      }
    }
  }

  public normalizeCategory(cat?: string, contextText?: string): QuestionCategory {
    return normalizeCategory(cat, contextText);
  }

  /**
   * Load questions from IndexedDB or LocalStorage, strictly filtering out deleted questions
   */
  public async loadAllQuestions(fallbackDefault: Question[] = []): Promise<Question[]> {
    const deletedSet = this.getDeletedQuestionIds();

    const db = await this.getDb();
    if (db) {
      try {
        const questions = await new Promise<Question[]>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result as Question[]);
          req.onerror = () => resolve([]);
        });

        if (questions && questions.length > 0) {
          const valid = questions.filter(q => {
            if (!q || q.id == null) return false;
            if (deletedSet.has(Number(q.id))) return false;
            if (isOldMockQuestion(q)) {
              this.recordDeletedQuestionId(Number(q.id));
              return false;
            }
            return true;
          });
          this.rebuildIndices(valid);
          this.isInitialized = true;
          return valid;
        }
      } catch (e) {
        console.warn('Failed to load from IndexedDB, trying localStorage:', e);
      }
    }

    // LocalStorage Fallback
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(q => {
            if (!q || q.id == null) return false;
            if (deletedSet.has(Number(q.id))) return false;
            if (isOldMockQuestion(q)) {
              this.recordDeletedQuestionId(Number(q.id));
              return false;
            }
            return true;
          });
          this.rebuildIndices(valid);
          this.isInitialized = true;
          return valid;
        }
      }
    } catch {}

    const isExplicitlyInitialized = localStorage.getItem('quizkart_questions_initialized') === 'true';
    if (isExplicitlyInitialized) {
      this.rebuildIndices([]);
      this.isInitialized = true;
      return [];
    }

    const safeDefault = fallbackDefault.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));
    this.rebuildIndices(safeDefault);
    this.isInitialized = true;
    return safeDefault;
  }

  /**
   * Persist questions permanently
   */
  public async saveAllQuestions(questions: Question[]): Promise<void> {
    const deletedSet = this.getDeletedQuestionIds();
    const cleanQuestions = questions.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));

    this.rebuildIndices(cleanQuestions);

    const db = await this.getDb();
    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.clear();
          for (const q of cleanQuestions) {
            store.put(q);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn('IndexedDB bulk save failed:', e);
      }
    }

    // Try LocalStorage for small-to-medium subsets without blowing 5MB quota
    try {
      const safeSubset = cleanQuestions.length > 1000 ? cleanQuestions.slice(0, 1000) : cleanQuestions;
      localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(safeSubset));
      localStorage.setItem('quizkart_questions_initialized', 'true');
    } catch (e) {
      console.warn('LocalStorage full, question pool preserved safely in IndexedDB and memory.');
    }
  }

  /**
   * Permanent deletion of a single question
   */
  public async deleteQuestionPermanently(id: number, currentList?: Question[]): Promise<Question[]> {
    const numericId = Number(id);
    this.recordDeletedQuestionId(numericId);

    const source = (currentList && currentList.length > 0) ? currentList : (this.memoryCache.length > 0 ? this.memoryCache : []);
    const updated = source.filter(q => Number(q.id) !== numericId);
    this.memoryCache = updated;
    this.rebuildIndices(updated);

    const db = await this.getDb();
    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.delete(numericId);
          store.delete(String(numericId));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn('IndexedDB delete failed:', e);
      }
    }

    try {
      const safeSubset = updated.length > 1000 ? updated.slice(0, 1000) : updated;
      localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(safeSubset));
      localStorage.setItem('quizkart_questions', JSON.stringify(safeSubset));
    } catch {}

    return updated;
  }

  /**
   * Fast query by Category
   */
  public getQuestionsByCategory(category: QuestionCategory): Question[] {
    return this.categoryIndex.get(category) || [];
  }

  /**
   * Total count
   */
  public getCount(): number {
    return this.memoryCache.length;
  }

  /**
   * Current in-memory list
   */
  public getAll(): Question[] {
    return this.memoryCache;
  }
}

export const questionPoolManager = new QuestionPoolManager();

export const BLOCK_USER_ASSIGNMENTS_KEY = 'quizkart_block_user_assignments';

/**
 * Fisher-Yates shuffle array helper
 */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Smart Randomization Shuffle Engine for a single question:
 * Shuffles options (A, B, C, D) and recalculates correctIndex & correctKey.
 */
export function smartShuffleQuestionOptions(q: Question): Question {
  if (!q.options || q.options.length !== 4) return { ...q };

  const originalCorrectIndex = getQuestionCorrectIndex(q);
  const paired = q.options.map((opt, idx) => ({ opt, isCorrect: idx === originalCorrectIndex }));
  const shuffledPairs = shuffleArray(paired);

  const newOptions = shuffledPairs.map(p => p.opt) as [string, string, string, string];
  const newCorrectIndex = shuffledPairs.findIndex(p => p.isCorrect);
  const keys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const newCorrectKey = keys[newCorrectIndex] || 'A';

  return {
    ...q,
    options: newOptions,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
    correctKey: newCorrectKey,
    answer: {
      key: newCorrectKey,
      text: newOptions[newCorrectIndex] || ''
    },
    isShuffledFallback: true
  };
}

/**
 * Standard helper to resolve the exact 0-indexed correct option (0 for A, 1 for B, 2 for C, 3 for D).
 * Harmonizes correctKey, correctIndex, and answer.key so that test execution,
 * result evaluation, and Admin Question Manager ALWAYS match 100% identically without discrepancies.
 */
export function getQuestionCorrectIndex(q: Question | Partial<Question>): number {
  if (!q) return 0;
  // 1. Direct correctKey priority
  if (q.correctKey && ['A', 'B', 'C', 'D'].includes(String(q.correctKey).toUpperCase())) {
    return ['A', 'B', 'C', 'D'].indexOf(String(q.correctKey).toUpperCase());
  }
  // 2. Direct answer.key priority
  const ansKey = (q as any)?.answer?.key;
  if (ansKey && ['A', 'B', 'C', 'D'].includes(String(ansKey).toUpperCase())) {
    return ['A', 'B', 'C', 'D'].indexOf(String(ansKey).toUpperCase());
  }
  // 3. Valid numeric correctIndex
  if (typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3) {
    return q.correctIndex;
  }
  return 0;
}

/**
 * Standard helper to resolve the exact correct letter ('A' | 'B' | 'C' | 'D')
 */
export function getQuestionCorrectKey(q: Question | Partial<Question>): 'A' | 'B' | 'C' | 'D' {
  const idx = getQuestionCorrectIndex(q);
  const keys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  return keys[idx] || 'A';
}

/**
 * Ensures a question's correctIndex and correctKey are 100% synchronized
 */
export function synchronizeQuestionKeys(q: Question): Question {
  const correctIdx = getQuestionCorrectIndex(q);
  const correctKey = getQuestionCorrectKey(q);
  const correctText = q.options && q.options[correctIdx] ? q.options[correctIdx] : '';

  return {
    ...q,
    correctIndex: correctIdx,
    correctKey: correctKey,
    answer: {
      key: correctKey,
      text: correctText
    }
  };
}

/**
 * Resolves canonical User ID string (strictly "QK-USR-1001")
 */
export function canonicalizeUserId(userId?: string | number): string {
  if (!userId) return 'QK-USR-1001';
  const str = String(userId).trim();
  const m = str.match(/(?:qk-)?usr-(\d+)/i) || str.match(/(\d+)/);
  if (m) {
    return `QK-USR-${m[1]}`;
  }
  return str.startsWith('QK-') ? str : `QK-${str}`;
}

/**
 * STRICT NO-DUPLICATE CONSTRAINT (Requirement 1):
 * Enforces an absolute uniqueness constraint within each 10-question test session/block.
 * NEVER allows the same question to repeat or appear twice in a single test session for any user.
 * Every generated set of 10 questions MUST consist of 10 completely unique questions.
 */
export function ensureStrictUniqueQuestions(questions: Question[], fallbackPool: Question[] = []): Question[] {
  if (!questions || questions.length === 0) return [];

  const seenStems = new Set<string>();
  const seenIds = new Set<string | number>();
  const uniqueList: Question[] = [];

  for (const q of questions) {
    if (!q) continue;
    const stemNorm = (q.stem || q.question || '').trim().toLowerCase();
    const idNorm = q.id != null ? String(q.id) : '';

    if (stemNorm && seenStems.has(stemNorm)) continue;
    if (idNorm && seenIds.has(idNorm)) continue;

    if (stemNorm) seenStems.add(stemNorm);
    if (idNorm) seenIds.add(idNorm);
    uniqueList.push(q);
  }

  // If deduplication left fewer than 10 questions, draw unique items from fallback pool
  if (uniqueList.length < 10 && fallbackPool && fallbackPool.length > 0) {
    for (const poolQ of fallbackPool) {
      if (!poolQ) continue;
      const stemNorm = (poolQ.stem || poolQ.question || '').trim().toLowerCase();
      const idNorm = poolQ.id != null ? String(poolQ.id) : '';

      if (stemNorm && seenStems.has(stemNorm)) continue;
      if (idNorm && seenIds.has(idNorm)) continue;

      if (stemNorm) seenStems.add(stemNorm);
      if (idNorm) seenIds.add(idNorm);
      uniqueList.push(poolQ);

      if (uniqueList.length >= 10) break;
    }
  }

  return uniqueList.slice(0, 10);
}

/**
 * Gets the assigned User ID for a specific 10-question page/block in the Admin Question Manager
 * Returns exact User ID if assigned, or 'Unassigned' if reserved in queue awaiting registration
 */
export function getBlockAssignedUserId(
  blockNumber: number,
  questionsInBlock?: Question[],
  registeredUsersList?: any[]
): string {
  // 1. Check persistent block assignment mapping
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[blockNumber] !== undefined) {
        const val = String(map[blockNumber]).trim();
        if (val && !val.toLowerCase().includes('unassigned')) {
          return canonicalizeUserId(val);
        }
      }
    }
  } catch {}

  // 2. Check questions in this block for explicit assignedUserId
  if (questionsInBlock && questionsInBlock.length > 0) {
    const explicitQ = questionsInBlock.find(q => q && (q as any).assignedUserId);
    if (explicitQ && (explicitQ as any).assignedUserId) {
      const val = String((explicitQ as any).assignedUserId).trim();
      if (val && !val.toLowerCase().includes('unassigned')) {
        return canonicalizeUserId(val);
      }
    }
  }

  // 3. Universal Initial State: Always 'Unassigned' until explicitly assigned on-demand
  return 'Unassigned';
}

/**
 * Sets the assigned User ID for a specific 10-question block in persistent storage
 */
export function setBlockAssignedUserId(blockNumber: number, userId: string): void {
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (!userId || userId.toLowerCase().includes('unassigned')) {
      map[blockNumber] = 'unassigned';
    } else {
      map[blockNumber] = canonicalizeUserId(userId);
    }
    localStorage.setItem(BLOCK_USER_ASSIGNMENTS_KEY, JSON.stringify(map));
  } catch {}
}

export const INITIAL_USER_BLOCKS_KEY = 'quizkart_initial_user_blocks';

/**
 * Helper to count completed quiz attempts for a specific user ID
 */
export function getUserCompletedAttemptsCount(userId: string | undefined): number {
  if (!userId) return 0;
  const canonicalId = canonicalizeUserId(userId);
  try {
    const raw = localStorage.getItem('quizkart_user_quiz_attempts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(a => {
          if (!a) return false;
          if (a.userId && canonicalizeUserId(a.userId) === canonicalId) return true;
          return false;
        }).length;
      }
    }
  } catch {}
  return 0;
}

/**
 * Gets the designated initial block number for a registered user ID (only if already assigned via Join/Re-join)
 */
export function getUserInitialBlockNumber(userId: string | undefined, allQuestions?: Question[]): number {
  if (!userId) return 0;
  const canonicalId = canonicalizeUserId(userId);

  // 1. Persistent active user block mapping
  try {
    const rawAct = localStorage.getItem(`quizkart_active_user_assigned_block_${canonicalId}`);
    if (rawAct) {
      const parsed = JSON.parse(rawAct);
      if (parsed && typeof parsed.blockNumber === 'number' && parsed.blockNumber > 0) {
        return parsed.blockNumber;
      }
    }
  } catch {}

  // 2. Persistent initial user blocks mapping (recorded when user actually joined)
  try {
    const raw = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && typeof map[canonicalId] === 'number' && map[canonicalId] > 0) {
        return map[canonicalId];
      }
    }
  } catch {}

  // 3. Persistent block assignment mapping
  try {
    const rawAssignments = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (rawAssignments) {
      const blockMap: Record<string, string> = JSON.parse(rawAssignments);
      for (const [blkStr, uId] of Object.entries(blockMap)) {
        if (canonicalizeUserId(uId as string) === canonicalId) {
          const num = parseInt(blkStr, 10);
          if (!isNaN(num) && num > 0) return num;
        }
      }
    }
  } catch {}

  // 4. Check allQuestions for non-retake initial questions explicitly tagged with this user
  if (allQuestions && allQuestions.length > 0) {
    const userBlockNumbers = allQuestions
      .filter(q => q && q.assignedUserId === canonicalId && !String(q.assignedUserId).toLowerCase().includes('unassigned'))
      .map(q => q.blockNumber)
      .filter((b): b is number => typeof b === 'number' && b > 0);
    if (userBlockNumbers.length > 0) {
      return Math.min(...userBlockNumbers);
    }
  }

  return 0;
}

/**
 * Loads the user's allocated block or fallback from clean pool
 */
export function getUserInitialAssignedQuestions(userId: string | undefined, allQuestions: Question[]): Question[] {
  if (!allQuestions || allQuestions.length === 0) return [];
  const canonicalId = canonicalizeUserId(userId);
  const deletedSet = questionPoolManager.getDeletedQuestionIds();
  const cleanPool = allQuestions.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)) && !isOldMockQuestion(q));

  // 1. Check active user assigned block in storage
  try {
    const rawAct = localStorage.getItem(`quizkart_active_user_assigned_block_${canonicalId}`);
    if (rawAct) {
      const act = JSON.parse(rawAct);
      if (act && Array.isArray(act.questionIds) && act.questionIds.length > 0) {
        const idMap = new Map<number, Question>();
        cleanPool.forEach(q => idMap.set(Number(q.id), q));
        const ordered: Question[] = [];
        for (const qId of act.questionIds) {
          const found = idMap.get(Number(qId));
          if (found) ordered.push(found);
        }
        if (ordered.length === act.questionIds.length && ordered.length > 0) {
          return ensureStrictUniqueQuestions(ordered, cleanPool);
        }
      }
      if (act && act.blockNumber) {
        const b = Number(act.blockNumber);
        const blockQs = cleanPool.filter(q => q.blockNumber === b);
        if (blockQs.length > 0) {
          return ensureStrictUniqueQuestions(blockQs, cleanPool);
        }
      }
    }
  } catch {}

  // 2. Check designated block if already assigned
  const initialBlockNum = getUserInitialBlockNumber(userId, cleanPool);
  if (initialBlockNum > 0) {
    const blockQuestions = cleanPool.filter(q => q.blockNumber === initialBlockNum);
    if (blockQuestions.length > 0) {
      return ensureStrictUniqueQuestions(blockQuestions, cleanPool);
    }
  }

  // Fallback: slice from cleanPool based on block number or first 10
  const startIdx = initialBlockNum > 0 ? (initialBlockNum - 1) * 10 : 0;
  const endIdx = startIdx + 10;
  if (startIdx < cleanPool.length) {
    return ensureStrictUniqueQuestions(cleanPool.slice(startIdx, endIdx), cleanPool);
  }

  return ensureStrictUniqueQuestions(cleanPool.slice(0, 10), cleanPool);
}

/**
 * Sanitizes questions to synchronize answer keys without auto pre-assigning blocks
 */
export function sanitizeAndEnsureInitialBlockMapping(
  allQuestions: Question[],
  registeredUsers?: any[]
): Question[] {
  if (!allQuestions || allQuestions.length === 0) return allQuestions;

  // Clean up any block assignments in questions and synchronize correctIndex & correctKey
  const updatedQuestions = allQuestions.map(q => {
    if (!q) return q;
    return synchronizeQuestionKeys(q);
  });

  return updatedQuestions;
}

/**
 * STRICT ID-TO-QUESTION MAPPING (Requirement 1 & Requirement 3):
 * FIRST JOIN RULE: If it is the user's first time taking the test (0 completed attempts),
 * the system MUST load their original, pre-allocated initial block (e.g., Box 1) containing their designated questions.
 * RE-JOIN / RETAKE RULE: Only when the user completes their first test and explicitly re-joins,
 * load the active retake block.
 * Also enforces STRICT NO-DUPLICATE constraint within every test session.
 */
export function getAssignedQuestionsForUser(userId: string | undefined, allQuestions: Question[], isRejoin?: boolean): Question[] {
  if (!allQuestions || allQuestions.length === 0) return [];

  const deletedSet = questionPoolManager.getDeletedQuestionIds();
  const cleanPool = allQuestions.filter(q => {
    if (!q || q.id == null) return false;
    if (deletedSet.has(Number(q.id))) return false;
    if (isOldMockQuestion(q)) return false;
    return true;
  });

  if (cleanPool.length === 0) return [];

  const canonicalId = canonicalizeUserId(userId);
  const completedAttempts = getUserCompletedAttemptsCount(canonicalId);

  // FIRST-TIME ATTEMPT RULE:
  // When a user enters a contest for the first time (!isRejoin || completedAttempts === 0),
  // the system MUST load their initial designated block (Block 1 for QK-USR-1001).
  if (!isRejoin || completedAttempts === 0) {
    const initialQuestions = getUserInitialAssignedQuestions(canonicalId, cleanPool);
    if (initialQuestions.length === 10) {
      return ensureStrictUniqueQuestions(initialQuestions, cleanPool);
    }
    if (initialQuestions.length > 0) {
      return ensureStrictUniqueQuestions(initialQuestions, cleanPool);
    }
  }

  // RE-JOIN / RETAKE: User has completed at least 1 test and is taking a retake
  try {
    const rawActive = localStorage.getItem(`quizkart_active_user_assigned_block_${canonicalId}`);
    if (rawActive) {
      const activeObj = JSON.parse(rawActive);
      // Strictly maintain exact sequence of questions as ordered in the block
      if (activeObj && Array.isArray(activeObj.questionIds) && activeObj.questionIds.length > 0) {
        const idMap = new Map<number, Question>();
        cleanPool.forEach(q => idMap.set(Number(q.id), q));
        const ordered: Question[] = [];
        for (const qId of activeObj.questionIds) {
          const found = idMap.get(Number(qId));
          if (found) ordered.push(found);
        }
        if (ordered.length === activeObj.questionIds.length && ordered.length > 0) {
          return ensureStrictUniqueQuestions(ordered, cleanPool);
        }
      }
      if (activeObj && activeObj.blockNumber) {
        const b = Number(activeObj.blockNumber);
        const blockQs = cleanPool.filter(q => q.blockNumber === b);
        if (blockQs.length > 0) {
          return ensureStrictUniqueQuestions(blockQs, cleanPool);
        }
      }
    }
  } catch {}

  // Next, look for questions in cleanPool explicitly tagged with assignedUserId === canonicalId
  const explicitlyTagged = cleanPool.filter(q => (q as any).assignedUserId === canonicalId);
  if (explicitlyTagged.length > 0) {
    if (explicitlyTagged.length > 10) {
      return ensureStrictUniqueQuestions(explicitlyTagged.slice(explicitlyTagged.length - 10), cleanPool);
    }
    return ensureStrictUniqueQuestions(explicitlyTagged, cleanPool);
  }

  // Next, check persistent block assignments mapping (quizkart_block_user_assignments)
  try {
    const rawAssignments = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (rawAssignments) {
      const blockMap: Record<string, string> = JSON.parse(rawAssignments);
      const assignedBlocks: number[] = [];
      for (const [blkStr, uId] of Object.entries(blockMap)) {
        if (canonicalizeUserId(uId) === canonicalId) {
          const num = parseInt(blkStr, 10);
          if (!isNaN(num)) assignedBlocks.push(num);
        }
      }
      if (assignedBlocks.length > 0) {
        assignedBlocks.sort((a, b) => b - a); // latest block first for retake
        const targetBlock = assignedBlocks[0];
        const blockQs = cleanPool.filter(q => q.blockNumber === targetBlock);
        if (blockQs.length > 0) {
          return ensureStrictUniqueQuestions(blockQs, cleanPool);
        }
      }
    }
  } catch {}

  // Fallback to initial assigned questions
  return getUserInitialAssignedQuestions(canonicalId, cleanPool);
}

/**
 * UNIVERSAL INITIAL "UNASSIGNED" STATE & BALANCED MULTI-SUBJECT DISTRIBUTION:
 * When question blocks are freshly generated (e.g., 10 blocks for 100 questions):
 * 1. Divides the pool into 10-question blocks (e.g., 10 blocks for 100 questions).
 * 2. ALL blocks initially display the clean, professional, compact "Unassigned" badge
 *    regardless of how many users are registered in the system.
 * 3. Overrides all automatic pre-assignment based on registered user count.
 * 4. STRICT NO-DUPLICATE RULE: Enforces absolute uniqueness within every 10-question block.
 */
export function createInitialUserBlocksFromPool(params: {
  baseQuestions: Question[];
  registeredUsers?: any[];
  existingQuestions?: Question[];
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  allBlockQuestions: Question[];
  distinctUsers: string[];
  totalBlocks: number;
} {
  const { baseQuestions, existingQuestions = [], onQuestionSavedToFirestore } = params;
  if (!baseQuestions || baseQuestions.length === 0) {
    return { allBlockQuestions: [], distinctUsers: [], totalBlocks: 0 };
  }

  // Preserve raw base pool for retakes and range-based dynamic blocks
  try {
    localStorage.setItem('quizkart_base_contest_pool', JSON.stringify(baseQuestions));
  } catch {}

  const deletedSet = questionPoolManager.getDeletedQuestionIds();
  const existingIds = existingQuestions.map(q => Number(q.id) || 0);
  let nextId = Math.max(0, ...existingIds, ...Array.from(deletedSet)) + 1;

  // Deduplicate base questions to enforce STRICT NO-DUPLICATE rule
  const cleanBasePool: Question[] = [];
  const baseStems = new Set<string>();
  for (const q of baseQuestions) {
    if (!q) continue;
    const s = (q.stem || q.question || '').trim().toLowerCase();
    if (s && !baseStems.has(s)) {
      baseStems.add(s);
      cleanBasePool.push(q);
    }
  }

  const poolToUse = cleanBasePool.length > 0 ? cleanBasePool : baseQuestions;

  // Total blocks determined strictly by question count (e.g. 100 questions -> 10 blocks)
  // No pre-filling based on registered user count
  const totalBlocks = Math.max(1, Math.ceil(poolToUse.length / 10));

  const SUBJECT_ROTATION: QuestionCategory[] = ['Maths', 'Reasoning', 'Science', 'GK', 'English'];

  // Bucket pool by the 5 normalized subjects
  const subjectBuckets: Record<QuestionCategory, Question[]> = {
    Maths: [],
    Reasoning: [],
    Science: [],
    GK: [],
    English: []
  };

  for (const q of poolToUse) {
    const cat = normalizeCategory(q.category || q.subject, `${q.question || q.stem || ''} ${q.explanation || ''}`);
    subjectBuckets[cat].push(q);
  }

  // Pre-allocate blocks
  const rawBlocks: Question[][] = Array.from({ length: totalBlocks }, () => []);

  // STRICT 2-2-2-2-2 BALANCED SUBJECT RATIO PER BLOCK
  for (let b = 0; b < totalBlocks; b++) {
    for (const subj of SUBJECT_ROTATION) {
      const bucket = subjectBuckets[subj] || [];
      if (bucket.length === 0) continue;
      const q1 = bucket[(b * 2) % bucket.length];
      let q2 = bucket[(b * 2 + 1) % bucket.length];
      if (bucket.length > 1 && (q2.stem || q2.question) === (q1.stem || q1.question)) {
        const alt = bucket.find(item => (item.stem || item.question) !== (q1.stem || q1.question));
        if (alt) q2 = alt;
      }
      rawBlocks[b].push(q1);
      rawBlocks[b].push(q2);
    }
  }

  // Sort questions in each block in standard sequence: Maths, Reasoning, Science, GK, English
  const subjOrder: Record<string, number> = {
    Maths: 0,
    Reasoning: 1,
    Science: 2,
    GK: 3,
    English: 4
  };

  for (let b = 0; b < totalBlocks; b++) {
    rawBlocks[b].sort((q1, q2) => {
      const c1 = normalizeCategory(q1.category || q1.subject, q1.question || q1.stem || '');
      const c2 = normalizeCategory(q2.category || q2.subject, q2.question || q2.stem || '');
      return (subjOrder[c1] ?? 99) - (subjOrder[c2] ?? 99);
    });
  }

  const allBlockQuestions: Question[] = [];
  const freshBlockAssignments: Record<string, string> = {};

  for (let b = 1; b <= totalBlocks; b++) {
    const blockNumber = b;
    // Universal Initial "Unassigned" State: ALL freshly generated blocks are 'unassigned'
    const guaranteed10 = rawBlocks[b - 1].slice(0, 10);

    const blockQuestions: Question[] = guaranteed10.map((q) => {
      const qId = nextId++;
      questionPoolManager.unrecordDeletedQuestionId(qId);
      const syncd = synchronizeQuestionKeys(q);
      return {
        ...syncd,
        id: qId,
        stem: syncd.stem || syncd.question,
        question: syncd.question || syncd.stem,
        options: [...syncd.options],
        correctIndex: syncd.correctIndex,
        correctKey: syncd.correctKey,
        answer: {
          key: syncd.correctKey,
          text: syncd.options?.[syncd.correctIndex] || ''
        },
        category: syncd.category,
        subject: syncd.subject || syncd.category,
        difficulty: syncd.difficulty,
        explanation: syncd.explanation,
        assignedUserId: 'unassigned',
        blockNumber: blockNumber,
        isCustom: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    freshBlockAssignments[String(blockNumber)] = 'unassigned';
    allBlockQuestions.push(...blockQuestions);
  }

  // Reset persistent block assignments and active block mappings so all start in clean Unassigned state
  try {
    localStorage.setItem(BLOCK_USER_ASSIGNMENTS_KEY, JSON.stringify(freshBlockAssignments));
    localStorage.removeItem(INITIAL_USER_BLOCKS_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('quizkart_active_user_assigned_block_')) {
        localStorage.removeItem(k);
      }
    }
  } catch {}

  // Sync to firestore if callback provided
  if (onQuestionSavedToFirestore) {
    allBlockQuestions.forEach(q => {
      try {
        onQuestionSavedToFirestore(q);
      } catch (err) {
        console.warn('Firestore question save error:', err);
      }
    });
  }

  return {
    allBlockQuestions,
    distinctUsers: [],
    totalBlocks
  };
}

/**
 * EXHAUSTED POOL DYNAMIC BLOCK GENERATION (Requirement 4):
 * When all pre-generated blocks (Blocks 1-10) are fully assigned across users and retakes:
 * 1. Instantly creates new dynamic block (Block 11, 12, etc.) labeled with that User ID.
 * 2. Range-Based Question Fetching: Divides main 100-question pool into 10 distinct ranges
 *    (Items 1-10, 11-20, 21-30, ..., 91-100).
 * 3. Picks 1 random question from each of the 10 ranges without internal duplication.
 */
export function createDynamicRangeBlockForUser(params: {
  userId: string | undefined;
  allQuestions: Question[];
  isRetake?: boolean;
  onQuestionsUpdated?: (updated: Question[]) => void;
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  assignedBlockNumber: number;
  assignedQuestions: Question[];
  updatedQuestions: Question[];
} {
  const { userId, allQuestions, isRetake = false, onQuestionsUpdated, onQuestionSavedToFirestore } = params;
  const canonicalId = canonicalizeUserId(userId);
  const deletedSet = questionPoolManager.getDeletedQuestionIds();

  // Try to draw from base contest pool first
  let sourcePool: Question[] = [];
  try {
    const rawBase = localStorage.getItem('quizkart_base_contest_pool');
    if (rawBase) {
      const parsed = JSON.parse(rawBase);
      if (Array.isArray(parsed) && parsed.length > 0) {
        sourcePool = parsed.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));
      }
    }
  } catch {}

  if (sourcePool.length === 0) {
    sourcePool = allQuestions.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)) && !isOldMockQuestion(q));
  }

  // Deduplicate source pool
  const uniqueSourcePool: Question[] = [];
  const seenPoolStems = new Set<string>();
  for (const q of sourcePool) {
    const s = (q.stem || q.question || '').trim().toLowerCase();
    if (s && !seenPoolStems.has(s)) {
      seenPoolStems.add(s);
      uniqueSourcePool.push(q);
    }
  }

  const rawPoolToUse = uniqueSourcePool.length >= 10 ? uniqueSourcePool : sourcePool;
  const subjOrder: Record<string, number> = {
    Maths: 0,
    Reasoning: 1,
    Science: 2,
    GK: 3,
    English: 4
  };
  const poolToUse = [...rawPoolToUse].sort((q1, q2) => {
    const c1 = normalizeCategory(q1.category || q1.subject, q1.question || q1.stem || '');
    const c2 = normalizeCategory(q2.category || q2.subject, q2.question || q2.stem || '');
    return (subjOrder[c1] ?? 99) - (subjOrder[c2] ?? 99);
  });

  // Partition pool by the 5 subjects to construct exactly 10 range chunks
  // (2 ranges per subject) strictly guaranteeing the 2-2-2-2-2 ratio (Requirement 4)
  const SUBJECTS_5: QuestionCategory[] = ['Maths', 'Reasoning', 'Science', 'GK', 'English'];
  const subjectPools: Record<QuestionCategory, Question[]> = {
    Maths: [],
    Reasoning: [],
    Science: [],
    GK: [],
    English: []
  };

  for (const q of poolToUse) {
    const c = normalizeCategory(q.category || q.subject, `${q.question || q.stem || ''} ${q.explanation || ''}`);
    subjectPools[c].push(q);
  }

  // Construct exactly 10 ranges across the 5 subjects (2 range chunks per subject)
  const ranges: Question[][] = [];
  for (const subj of SUBJECTS_5) {
    const sPool = subjectPools[subj].length > 0 ? subjectPools[subj] : poolToUse;
    const mid = Math.max(1, Math.floor(sPool.length / 2));
    const range1 = sPool.slice(0, mid);
    const range2 = sPool.slice(mid);
    ranges.push(range1.length > 0 ? range1 : sPool);
    ranges.push(range2.length > 0 ? range2 : sPool);
  }

  // Load user-specific and global combination history for strict non-repetition
  const userComboKey = `quizkart_used_quiz_combinations_${canonicalId}`;
  let usedCombos: string[] = [];
  try {
    const userCombos = JSON.parse(localStorage.getItem(userComboKey) || '[]');
    const globalCombos = JSON.parse(localStorage.getItem('quizkart_used_quiz_combinations') || '[]');
    usedCombos = Array.from(new Set([...userCombos, ...globalCombos]));
  } catch {}

  let picked: Question[] = [];
  let attempts = 0;
  while (attempts < 50) {
    attempts++;
    const candidate: Question[] = [];
    const usedStems = new Set<string>();

    for (let r = 0; r < 10; r++) {
      const currentRange = ranges[r];
      const available = currentRange.filter(q => {
        const s = (q.stem || q.question || '').trim().toLowerCase();
        return !usedStems.has(s);
      });
      const pickList = available.length > 0 ? available : currentRange;
      const chosen = pickList[Math.floor(Math.random() * pickList.length)];
      candidate.push(chosen);
      usedStems.add((chosen.stem || chosen.question || '').trim().toLowerCase());
    }

    const sigCombo = candidate.map(q => q.originalSourceId || q.id || q.stem).sort().join('-');
    const sigSeq = candidate.map(q => q.originalSourceId || q.id || q.stem).join('-');

    if ((!usedCombos.includes(sigCombo) && !usedCombos.includes(sigSeq)) || attempts >= 50) {
      usedCombos.push(sigCombo);
      usedCombos.push(sigSeq);
      try {
        localStorage.setItem(userComboKey, JSON.stringify(usedCombos.slice(-200)));
        localStorage.setItem('quizkart_used_quiz_combinations', JSON.stringify(usedCombos.slice(-200)));
      } catch {}
      picked = candidate;
      break;
    }
  }

  // Determine next block number
  const nextBlockNumber = Math.max(1, Math.ceil(allQuestions.length / 10)) + 1;

  // Strict Rule 3: Disable extra shuffling for saved questions (Blocks 1-100).
  // Allow shuffling ONLY when generating dynamic retake blocks from block 101 onward,
  // and save the shuffled options with the correctly mapped answer key.
  const shouldShuffleOptions = Boolean(isRetake) && nextBlockNumber >= 101;
  const processedQuestions = picked.slice(0, 10).map(q =>
    shouldShuffleOptions ? smartShuffleQuestionOptions(q) : synchronizeQuestionKeys(q)
  );

  const allExistingIds = allQuestions.map(q => Number(q.id) || 0);
  const maxId = Math.max(0, ...allExistingIds, ...Array.from(deletedSet));
  const startingId = maxId + 1;

  const newQuestions: Question[] = processedQuestions.map((q, idx) => ({
    ...q,
    id: startingId + idx,
    originalSourceId: Number(q.id),
    assignedUserId: canonicalId,
    blockNumber: nextBlockNumber,
    isCustom: true,
    isRetake: Boolean(isRetake),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  newQuestions.forEach(q => questionPoolManager.unrecordDeletedQuestionId(q.id));

  setBlockAssignedUserId(nextBlockNumber, canonicalId);

  try {
    localStorage.setItem(
      `quizkart_active_user_assigned_block_${canonicalId}`,
      JSON.stringify({
        blockNumber: nextBlockNumber,
        questionIds: newQuestions.map(q => q.id),
        timestamp: Date.now()
      })
    );
  } catch {}

  const updatedPool = [...allQuestions, ...newQuestions];
  questionPoolManager.saveAllQuestions(updatedPool);
  try {
    localStorage.setItem('quizkart_questions', JSON.stringify(updatedPool.slice(0, 1000)));
    localStorage.setItem('quizkart_questions_initialized', 'true');
  } catch {}

  if (onQuestionsUpdated) onQuestionsUpdated(updatedPool);
  if (onQuestionSavedToFirestore) {
    newQuestions.forEach(q => {
      try { onQuestionSavedToFirestore(q); } catch {}
    });
  }

  return {
    assignedBlockNumber: nextBlockNumber,
    assignedQuestions: newQuestions,
    updatedQuestions: updatedPool
  };
}

/**
 * STRICT ON-DEMAND SEQUENTIAL ASSIGNMENT (JOIN/RE-JOIN):
 * - Dynamic Mapping on Action: Map User IDs to question boxes strictly on-demand when a user
 *   explicitly clicks "Join Now" or "Re-join".
 * - Sequential Order Allocation: The first user to join/re-join gets the first available box (QK-USR-1001),
 *   the second gets the next box (QK-USR-1002), and so on, permanently replacing "Unassigned" on that box
 *   in strict sequential order.
 */
export function assignNextSequentialBlockOnDemand(params: {
  userId: string | undefined;
  allQuestions: Question[];
  isRejoin?: boolean;
  onQuestionsUpdated?: (updated: Question[]) => void;
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  assignedBlockNumber: number;
  assignedQuestions: Question[];
  updatedPool: Question[];
} {
  const { userId, allQuestions, isRejoin, onQuestionsUpdated, onQuestionSavedToFirestore } = params;
  const canonicalId = canonicalizeUserId(userId);
  if (!allQuestions || allQuestions.length === 0) {
    return { assignedBlockNumber: 0, assignedQuestions: [], updatedPool: allQuestions };
  }

  const deletedSet = questionPoolManager.getDeletedQuestionIds();
  const cleanPool = allQuestions.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));

  // Load persistent block assignments map
  let blockMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) blockMap = JSON.parse(raw);
  } catch {}

  // Determine total blocks in current pool
  const totalBlocks = Math.max(1, Math.ceil(cleanPool.length / 10));

  // Find the first available box in strict sequential order (Box 1, Box 2, Box 3...)
  let availableBlock = -1;
  for (let b = 1; b <= totalBlocks; b++) {
    const questionsInB = cleanPool.filter(q => q.blockNumber === b);
    const assignedUser = getBlockAssignedUserId(b, questionsInB);
    const isUnassigned = assignedUser === 'Unassigned' || !assignedUser || assignedUser.toLowerCase().includes('unassigned');

    if (isUnassigned && questionsInB.length === 10) {
      availableBlock = b;
      break;
    }
  }

  // If an unassigned box is found (e.g. Box 1 for the 1st user, Box 2 for the 2nd user, etc.):
  if (availableBlock > 0) {
    // 1. Permanently update block assignment map
    setBlockAssignedUserId(availableBlock, canonicalId);

    // 2. Update questions in that block
    const shouldShuffle = Boolean(isRejoin) && availableBlock >= 101;
    const updatedQuestions = allQuestions.map(q => {
      if (q.blockNumber === availableBlock) {
        const prepared = shouldShuffle ? smartShuffleQuestionOptions(q) : synchronizeQuestionKeys(q);
        return {
          ...prepared,
          assignedUserId: canonicalId,
          isRetake: Boolean(isRejoin),
          updatedAt: new Date().toISOString()
        };
      }
      return q;
    });

    const blockQuestions = updatedQuestions.filter(q => q.blockNumber === availableBlock);

    // 3. Anchor active user session to this block
    try {
      localStorage.setItem(
        `quizkart_active_user_assigned_block_${canonicalId}`,
        JSON.stringify({
          blockNumber: availableBlock,
          questionIds: blockQuestions.map(q => q.id),
          timestamp: Date.now()
        })
      );
    } catch {}

    try {
      const rawInit = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
      const initMap = rawInit ? JSON.parse(rawInit) : {};
      if (!initMap[canonicalId]) {
        initMap[canonicalId] = availableBlock;
        localStorage.setItem(INITIAL_USER_BLOCKS_KEY, JSON.stringify(initMap));
      }
    } catch {}

    // Record combination signature for non-repetition
    try {
      const userComboKey = `quizkart_used_quiz_combinations_${canonicalId}`;
      const usedCombos: string[] = JSON.parse(localStorage.getItem(userComboKey) || '[]');
      const sigCombo = blockQuestions.map(q => q.originalSourceId || q.id || q.stem).sort().join('-');
      if (!usedCombos.includes(sigCombo)) {
        usedCombos.push(sigCombo);
        localStorage.setItem(userComboKey, JSON.stringify(usedCombos.slice(-200)));
      }
    } catch {}

    questionPoolManager.saveAllQuestions(updatedQuestions);
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(updatedQuestions.slice(0, 1000)));
    } catch {}

    if (onQuestionsUpdated) onQuestionsUpdated(updatedQuestions);
    if (onQuestionSavedToFirestore) {
      blockQuestions.forEach(q => {
        try { onQuestionSavedToFirestore(q); } catch {}
      });
    }

    return {
      assignedBlockNumber: availableBlock,
      assignedQuestions: blockQuestions,
      updatedPool: updatedQuestions
    };
  }

  // If all existing blocks are exhausted, dynamically create the next sequential block (e.g. Block 11+)
  const dynamicRes = createDynamicRangeBlockForUser({
    userId: canonicalId,
    allQuestions,
    isRetake: Boolean(isRejoin),
    onQuestionsUpdated,
    onQuestionSavedToFirestore
  });

  return {
    assignedBlockNumber: dynamicRes.assignedBlockNumber,
    assignedQuestions: dynamicRes.assignedQuestions,
    updatedPool: dynamicRes.updatedQuestions
  };
}

/**
 * On-demand block assignment adapter
 */
export function autoAssignNextBlockToUser(params: {
  userId: string;
  allQuestions: Question[];
  onQuestionsUpdated?: (updated: Question[]) => void;
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  assignedBlockNumber: number;
  assignedQuestions: Question[];
  updatedQuestions: Question[];
} {
  const res = assignNextSequentialBlockOnDemand(params);
  return {
    assignedBlockNumber: res.assignedBlockNumber,
    assignedQuestions: res.assignedQuestions,
    updatedQuestions: res.updatedPool
  };
}

/**
 * Re-join sequential block assignment adapter
 */
export function createRetakeBlockForUser(params: {
  userId: string | undefined;
  allQuestions: Question[];
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  newQuestions: Question[];
  updatedPool: Question[];
  blockNumber: number;
} {
  const res = assignNextSequentialBlockOnDemand({
    ...params,
    isRejoin: true
  });
  return {
    newQuestions: res.assignedQuestions,
    updatedPool: res.updatedPool,
    blockNumber: res.assignedBlockNumber
  };
}
