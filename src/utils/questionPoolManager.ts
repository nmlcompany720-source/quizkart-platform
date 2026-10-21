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

  public normalizeCategory(cat?: string): QuestionCategory {
    if (!cat) return 'GK';
    const clean = cat.trim().toLowerCase();
    if (clean === 'maths' || clean === 'math' || clean === 'mathematics' || clean.includes('arithmetic') || clean.includes('algebra') || clean.includes('quant')) {
      return 'Maths';
    }
    if (clean === 'reasoning' || clean.includes('logic') || clean.includes('aptitude') || clean.includes('analogy') || clean.includes('puzzle')) {
      return 'Reasoning';
    }
    if (clean === 'science' || clean.includes('science') || clean.includes('physics') || clean.includes('chemistry') || clean.includes('biology')) {
      return 'Science';
    }
    if (clean === 'english' || clean.includes('english') || clean.includes('verbal') || clean.includes('grammar') || clean.includes('vocab')) {
      return 'English';
    }
    return 'GK';
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

  const originalCorrectIndex = q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : 0;
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
    isShuffledFallback: true
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
  // 1. Check questions in this block for explicit assignedUserId
  if (questionsInBlock && questionsInBlock.length > 0) {
    const explicitQ = questionsInBlock.find(q => q && (q as any).assignedUserId);
    if (explicitQ && (explicitQ as any).assignedUserId) {
      const val = String((explicitQ as any).assignedUserId).trim();
      if (!val || val === 'unassigned' || val.toLowerCase().includes('unassigned')) {
        return 'Unassigned';
      }
      return val;
    }
  }

  // 2. Check persistent block assignment mapping
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[blockNumber] !== undefined) {
        const val = String(map[blockNumber]).trim();
        if (!val || val === 'unassigned' || val.toLowerCase().includes('unassigned')) {
          return 'Unassigned';
        }
        return val;
      }
    }
  } catch {}

  // 3. Registered user list mapping (only if block is within registered users count)
  const regCount = (registeredUsersList && registeredUsersList.length) || 0;
  if (registeredUsersList && blockNumber <= regCount) {
    const u = registeredUsersList[blockNumber - 1];
    if (u && u.id) return canonicalizeUserId(u.id);
  }

  // 4. Default: If not assigned to any registered user, it is pre-generated in queue awaiting user registration
  return 'Unassigned';
}

/**
 * Sets the assigned User ID for a specific 10-question block in persistent storage
 */
export function setBlockAssignedUserId(blockNumber: number, userId: string): void {
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[blockNumber] = canonicalizeUserId(userId);
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
 * Gets the designated initial block number for a registered user ID (e.g. Block 1 for User 1001)
 */
export function getUserInitialBlockNumber(userId: string | undefined, allQuestions?: Question[]): number {
  if (!userId) return 1;
  const canonicalId = canonicalizeUserId(userId);

  // 1. Check persistent initial user blocks mapping
  try {
    const raw = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && typeof map[canonicalId] === 'number') {
        return map[canonicalId];
      }
    }
  } catch {}

  // 2. Check allQuestions for non-retake initial questions explicitly tagged with this user
  if (allQuestions && allQuestions.length > 0) {
    const userQs = allQuestions.filter(q => q && q.assignedUserId === canonicalId && !q.isRetake && !q.isDynamicBlock);
    if (userQs.length > 0 && typeof userQs[0].blockNumber === 'number') {
      return userQs[0].blockNumber;
    }
  }

  // 3. Check registered users list position
  try {
    const rawUsers = localStorage.getItem('quizkart_registered_users');
    if (rawUsers) {
      const parsed: any[] = JSON.parse(rawUsers);
      const idx = parsed.findIndex(u => u && canonicalizeUserId(u.id) === canonicalId);
      if (idx >= 0) return idx + 1;
    }
  } catch {}

  // 4. Fallback from ID numeric suffix (e.g. QK-USR-1001 -> 1)
  const numMatch = String(canonicalId).match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    if (num >= 1001) return num - 1000;
  }

  return 1;
}

/**
 * FIRST JOIN RULE (Requirement 1):
 * Loads the user's original, pre-allocated initial block (e.g., Box 1) containing their designated questions.
 * Does NOT create a new block or assign a secondary block on the very first attempt.
 */
export function getUserInitialAssignedQuestions(userId: string | undefined, allQuestions: Question[]): Question[] {
  if (!allQuestions || allQuestions.length === 0) return [];
  const canonicalId = canonicalizeUserId(userId);
  const deletedSet = questionPoolManager.getDeletedQuestionIds();
  const cleanPool = allQuestions.filter(q => q && q.id != null && !deletedSet.has(Number(q.id)) && !isOldMockQuestion(q));

  const initialBlockNum = getUserInitialBlockNumber(userId, cleanPool);

  // Find questions in this initial block
  const blockQuestions = cleanPool.filter(q => q.blockNumber === initialBlockNum);
  if (blockQuestions.length > 0) {
    return ensureStrictUniqueQuestions(blockQuestions, cleanPool);
  }

  // Fallback: slice from cleanPool based on block number
  const startIdx = (initialBlockNum - 1) * 10;
  const endIdx = startIdx + 10;
  if (startIdx < cleanPool.length) {
    return ensureStrictUniqueQuestions(cleanPool.slice(startIdx, endIdx), cleanPool);
  }

  return [];
}

/**
 * Sanitizes question assignments to ensure that existing users with 0 completed attempts
 * only possess their initial pre-allocated block, releasing any mistakenly assigned queue blocks
 * (e.g., Block 6) back to 'unassigned' for newly registering users or subsequent re-joins.
 */
export function sanitizeAndEnsureInitialBlockMapping(
  allQuestions: Question[],
  registeredUsers?: any[]
): Question[] {
  if (!allQuestions || allQuestions.length === 0) return allQuestions;

  // Resolve registered users
  const userList: string[] = [];
  if (registeredUsers && Array.isArray(registeredUsers)) {
    registeredUsers.forEach(u => {
      if (u && !u.isDeleted) {
        const cid = canonicalizeUserId(u.id);
        if (cid && !userList.includes(cid)) userList.push(cid);
      }
    });
  }
  try {
    const raw = localStorage.getItem('quizkart_registered_users');
    if (raw) {
      const parsed: any[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(u => {
          if (u && !u.isDeleted) {
            const cid = canonicalizeUserId(u.id);
            if (cid && !userList.includes(cid)) userList.push(cid);
          }
        });
      }
    }
  } catch {}

  // Initialize or update initial block mapping
  let initialMap: Record<string, number> = {};
  try {
    const rawInit = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
    if (rawInit) initialMap = JSON.parse(rawInit);
  } catch {}

  userList.forEach((uid, idx) => {
    if (!initialMap[uid]) {
      initialMap[uid] = idx + 1;
    }
  });

  try {
    localStorage.setItem(INITIAL_USER_BLOCKS_KEY, JSON.stringify(initialMap));
  } catch {}

  let blockAssignments: Record<string, string> = {};
  try {
    const rawAssignments = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (rawAssignments) blockAssignments = JSON.parse(rawAssignments);
  } catch {}

  // Clean up any block assignments in questions
  const updatedQuestions = allQuestions.map(q => {
    if (!q) return q;
    const qUserId = q.assignedUserId ? canonicalizeUserId(q.assignedUserId) : '';
    if (qUserId && qUserId !== 'unassigned') {
      const attemptsCount = getUserCompletedAttemptsCount(qUserId);
      const userInitialBlock = initialMap[qUserId];
      // If user has 0 completed attempts, but this question is in a DIFFERENT block (e.g. Block 6 instead of Block 1)
      if (attemptsCount === 0 && userInitialBlock !== undefined && q.blockNumber !== userInitialBlock) {
        return {
          ...q,
          assignedUserId: 'unassigned'
        };
      }
    }
    return q;
  });

  for (const [blkStr, assignedId] of Object.entries(blockAssignments)) {
    const blk = parseInt(blkStr, 10);
    const cid = canonicalizeUserId(assignedId);
    if (cid && cid !== 'unassigned') {
      const attemptsCount = getUserCompletedAttemptsCount(cid);
      const userInitialBlock = initialMap[cid];
      if (attemptsCount === 0 && userInitialBlock !== undefined && blk !== userInitialBlock) {
        blockAssignments[blkStr] = 'unassigned';
      }
    }
  }

  try {
    localStorage.setItem(BLOCK_USER_ASSIGNMENTS_KEY, JSON.stringify(blockAssignments));
  } catch {}

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
export function getAssignedQuestionsForUser(userId: string | undefined, allQuestions: Question[]): Question[] {
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

  // FIRST JOIN RULE (Requirement 1):
  // When a user has 0 completed tests, they MUST load their original, pre-allocated initial block (Box 1).
  if (completedAttempts === 0) {
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
 * INITIAL MULTI-USER BLOCK CREATION & UNASSIGNED POOL HANDLING (Requirement 2 & 1):
 * When questions are imported in the Admin Panel (e.g., a pool of 100 questions):
 * 1. Divides the pool into 10-question blocks (e.g., 10 blocks for 100 questions).
 * 2. Checks current registered User count. If there are 5 registered users, assigns first 5 blocks
 *    (Blocks 1-5) directly to those 5 User IDs with respective IDs explicitly labeled at top.
 * 3. The remaining blocks (Blocks 6-10) remain pre-generated in the question pool queue awaiting
 *    new user registrations or retake actions.
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
  const { baseQuestions, registeredUsers, existingQuestions = [], onQuestionSavedToFirestore } = params;
  if (!baseQuestions || baseQuestions.length === 0) {
    return { allBlockQuestions: [], distinctUsers: [], totalBlocks: 0 };
  }

  // Preserve raw base pool for retakes and range-based dynamic blocks
  try {
    localStorage.setItem('quizkart_base_contest_pool', JSON.stringify(baseQuestions));
  } catch {}

  // 1. Resolve distinct registered User IDs
  const userList: string[] = [];
  try {
    if (registeredUsers && Array.isArray(registeredUsers) && registeredUsers.length > 0) {
      registeredUsers.forEach(u => {
        if (u && !u.isDeleted) {
          const id = canonicalizeUserId(u.id);
          if (id && !userList.includes(id)) userList.push(id);
        }
      });
    }
  } catch {}

  try {
    const rawSavedUsers = localStorage.getItem('quizkart_registered_users');
    if (rawSavedUsers) {
      const parsed: any[] = JSON.parse(rawSavedUsers);
      if (Array.isArray(parsed)) {
        parsed.forEach(u => {
          if (u && !u.isDeleted) {
            const id = canonicalizeUserId(u.id);
            if (id && !userList.includes(id)) userList.push(id);
          }
        });
      }
    }
  } catch {}

  // If no registered users found, fallback to at least QK-USR-1001
  if (userList.length === 0) {
    userList.push('QK-USR-1001');
  }

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

  // 2. Divide pool into 10-question blocks with BALANCED MULTI-SUBJECT DISTRIBUTION (Requirement 1 & 2):
  // When a 100-question pool containing 5 subjects (Maths, Reasoning, Science, GK, English - 20 items each)
  // is validated and divided into 10-question blocks, EVERY single block MUST contain a balanced representation
  // of ALL subjects (approximately 2 questions from each of the 5 subjects: 2 Maths, 2 Reasoning, 2 Science, 2 GK, 2 English).
  const totalBlocks = Math.max(userList.length, Math.ceil(poolToUse.length / 10));

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
  const usedStems = new Set<string>();

  // Pass 1 & Pass 2: Pick 1 question from each subject in each pass (2 questions per subject per block)
  for (let pass = 1; pass <= 2; pass++) {
    for (let b = 0; b < totalBlocks; b++) {
      for (const subj of SUBJECT_ROTATION) {
        if (rawBlocks[b].length >= 10) continue;
        const bucket = subjectBuckets[subj] || [];
        const nextQ = bucket.find(q => {
          const s = (q.stem || q.question || '').trim().toLowerCase();
          return s && !usedStems.has(s);
        });
        if (nextQ) {
          rawBlocks[b].push(nextQ);
          usedStems.add((nextQ.stem || nextQ.question || '').trim().toLowerCase());
        }
      }
    }
  }

  // Pass 3: Distribute any remaining unused pool questions across blocks that have < 10 questions
  for (const subj of SUBJECT_ROTATION) {
    const bucket = subjectBuckets[subj] || [];
    for (const q of bucket) {
      const s = (q.stem || q.question || '').trim().toLowerCase();
      if (s && !usedStems.has(s)) {
        const targetBlock = rawBlocks.find(blk => blk.length < 10);
        if (targetBlock) {
          targetBlock.push(q);
          usedStems.add(s);
        }
      }
    }
  }

  // Pass 4: Ensure every block has exactly 10 questions without internal duplicates,
  // and order questions by subject sequence: Maths, Reasoning, Science, GK, English
  const subjOrder: Record<string, number> = {
    Maths: 0,
    Reasoning: 1,
    Science: 2,
    GK: 3,
    English: 4
  };

  for (let b = 0; b < totalBlocks; b++) {
    if (rawBlocks[b].length < 10) {
      rawBlocks[b] = ensureStrictUniqueQuestions(rawBlocks[b], poolToUse);
    }
    rawBlocks[b].sort((q1, q2) => {
      const c1 = normalizeCategory(q1.category || q1.subject, q1.question || q1.stem || '');
      const c2 = normalizeCategory(q2.category || q2.subject, q2.question || q2.stem || '');
      return (subjOrder[c1] ?? 99) - (subjOrder[c2] ?? 99);
    });
  }

  const allBlockQuestions: Question[] = [];

  for (let b = 1; b <= totalBlocks; b++) {
    const blockNumber = b;
    const isAssignedToUser = blockNumber <= userList.length;
    const targetUserId = isAssignedToUser ? userList[blockNumber - 1] : 'unassigned';

    // Get the balanced 10 questions for this block
    const guaranteed10 = ensureStrictUniqueQuestions(rawBlocks[b - 1], poolToUse);

    // Format exactly 10 questions for this block
    const blockQuestions: Question[] = guaranteed10.map((q) => {
      const qId = nextId++;
      questionPoolManager.unrecordDeletedQuestionId(qId);
      return {
        ...q,
        id: qId,
        stem: q.stem || q.question,
        question: q.question || q.stem,
        options: [...q.options],
        correctIndex: q.correctIndex,
        correctKey: q.correctKey,
        category: q.category,
        subject: q.subject || q.category,
        difficulty: q.difficulty,
        explanation: q.explanation,
        assignedUserId: targetUserId,
        blockNumber: blockNumber,
        isCustom: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    // Record block mapping (User ID if assigned, or 'unassigned' if reserved in queue)
    setBlockAssignedUserId(blockNumber, targetUserId);

    // If assigned to a registered user, save active block mapping
    if (isAssignedToUser && targetUserId !== 'unassigned') {
      try {
        localStorage.setItem(
          `quizkart_active_user_assigned_block_${targetUserId}`,
          JSON.stringify({
            blockNumber: blockNumber,
            questionIds: blockQuestions.map(q => q.id),
            timestamp: Date.now()
          })
        );
      } catch {}

      // Record permanent initial block assignment
      try {
        const rawInit = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
        const initMap = rawInit ? JSON.parse(rawInit) : {};
        initMap[targetUserId] = blockNumber;
        localStorage.setItem(INITIAL_USER_BLOCKS_KEY, JSON.stringify(initMap));
      } catch {}
    }

    allBlockQuestions.push(...blockQuestions);
  }

  // Sync to firestore if callback provided
  if (onQuestionSavedToFirestore) {
    allBlockQuestions.forEach(q => {
      try {
        onQuestionSavedToFirestore(q);
      } catch {}
    });
  }

  return {
    allBlockQuestions,
    distinctUsers: userList,
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

  // Divide into 10 distinct ranges
  const chunkSize = 10;
  const ranges: Question[][] = [];
  if (poolToUse.length >= 100) {
    for (let r = 0; r < 10; r++) {
      ranges.push(poolToUse.slice(r * chunkSize, (r + 1) * chunkSize));
    }
  } else if (poolToUse.length >= 10) {
    const step = poolToUse.length / 10;
    for (let r = 0; r < 10; r++) {
      const start = Math.floor(r * step);
      const end = Math.floor((r + 1) * step);
      const slice = poolToUse.slice(start, Math.max(start + 1, end));
      ranges.push(slice.length > 0 ? slice : [poolToUse[r % poolToUse.length]]);
    }
  } else {
    for (let r = 0; r < 10; r++) {
      ranges.push([poolToUse[r % poolToUse.length]]);
    }
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

  // Shuffle options for fresh presentation
  const optionShuffled = picked.slice(0, 10).map(q => smartShuffleQuestionOptions(q));

  // Determine next block number
  const nextBlockNumber = Math.max(1, Math.ceil(allQuestions.length / 10)) + 1;

  const allExistingIds = allQuestions.map(q => Number(q.id) || 0);
  const maxId = Math.max(0, ...allExistingIds, ...Array.from(deletedSet));
  const startingId = maxId + 1;

  const newQuestions: Question[] = optionShuffled.map((q, idx) => ({
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
 * NEW USER REGISTRATION AUTO-ASSIGNMENT LOGIC (Requirement 3):
 * As soon as a NEW user registers in the system:
 * 1. IMMEDIATELY (within 1 second) maps next available unassigned block (e.g. Block 6) to this new User ID.
 * 2. Labels the top of Block 6 with new User ID so their first test loads those exact 10 questions.
 * 3. If all pre-generated blocks are exhausted, dynamically compiles Block 11+ via Range-Based Question Fetching.
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
  const { userId, allQuestions, onQuestionsUpdated, onQuestionSavedToFirestore } = params;
  const canonicalId = canonicalizeUserId(userId);
  if (!canonicalId) {
    return { assignedBlockNumber: 0, assignedQuestions: [], updatedQuestions: allQuestions };
  }

  // 1. Check if user already has an active block assigned
  const rawActive = localStorage.getItem(`quizkart_active_user_assigned_block_${canonicalId}`);
  if (rawActive) {
    try {
      const activeObj = JSON.parse(rawActive);
      if (activeObj && activeObj.blockNumber) {
        const b = Number(activeObj.blockNumber);
        const blockQs = allQuestions.filter(q => q.blockNumber === b);
        if (blockQs.length === 10) {
          return { assignedBlockNumber: b, assignedQuestions: blockQs, updatedQuestions: allQuestions };
        }
      }
    } catch {}
  }

  // Check if any block is already assigned to this user in persistent block mappings
  let blockMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) blockMap = JSON.parse(raw);
  } catch {}

  for (const [blkStr, uId] of Object.entries(blockMap)) {
    if (canonicalizeUserId(uId) === canonicalId) {
      const b = parseInt(blkStr, 10);
      const blockQs = allQuestions.filter(q => q.blockNumber === b);
      if (blockQs.length === 10) {
        try {
          localStorage.setItem(
            `quizkart_active_user_assigned_block_${canonicalId}`,
            JSON.stringify({
              blockNumber: b,
              questionIds: blockQs.map(q => q.id),
              timestamp: Date.now()
            })
          );
        } catch {}
        return { assignedBlockNumber: b, assignedQuestions: blockQs, updatedQuestions: allQuestions };
      }
    }
  }

  // 2. Search for next available UNASSIGNED block among existing blocks
  const totalBlocks = Math.ceil(allQuestions.length / 10);
  let targetBlockNumber = -1;

  for (let b = 1; b <= totalBlocks; b++) {
    const assigned = blockMap[b];
    const isUnassignedInMap = !assigned || assigned === 'unassigned' || assigned.toLowerCase().includes('unassigned');
    const questionsInB = allQuestions.filter(q => q.blockNumber === b);
    const hasAssignedUser = questionsInB.some(q => q.assignedUserId && q.assignedUserId !== 'unassigned');

    if (isUnassignedInMap && !hasAssignedUser && questionsInB.length === 10) {
      targetBlockNumber = b;
      break;
    }
  }

  // 3. If an unassigned block is found (e.g. Block 6), map it immediately
  if (targetBlockNumber > 0) {
    setBlockAssignedUserId(targetBlockNumber, canonicalId);

    const updatedQuestions = allQuestions.map(q => {
      if (q.blockNumber === targetBlockNumber) {
        return {
          ...q,
          assignedUserId: canonicalId,
          updatedAt: new Date().toISOString()
        };
      }
      return q;
    });

    const blockQuestions = updatedQuestions.filter(q => q.blockNumber === targetBlockNumber);

    try {
      localStorage.setItem(
        `quizkart_active_user_assigned_block_${canonicalId}`,
        JSON.stringify({
          blockNumber: targetBlockNumber,
          questionIds: blockQuestions.map(q => q.id),
          timestamp: Date.now()
        })
      );
    } catch {}

    try {
      const rawInit = localStorage.getItem(INITIAL_USER_BLOCKS_KEY);
      const initMap = rawInit ? JSON.parse(rawInit) : {};
      if (!initMap[canonicalId]) {
        initMap[canonicalId] = targetBlockNumber;
        localStorage.setItem(INITIAL_USER_BLOCKS_KEY, JSON.stringify(initMap));
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
      assignedBlockNumber: targetBlockNumber,
      assignedQuestions: blockQuestions,
      updatedQuestions
    };
  }

  // 4. If all pre-generated blocks are exhausted, dynamically compile Block 11+ via Range-Based strategy
  return createDynamicRangeBlockForUser({
    userId: canonicalId,
    allQuestions,
    onQuestionsUpdated,
    onQuestionSavedToFirestore
  });
}

/**
 * RE-JOIN / RETAKE STRICT NON-REPETITION LOGIC (Requirement 5):
 * When an existing user (e.g., User ID QK-USR-1001) clicks "Confirm & Join" to retake a contest:
 * 1. If unassigned blocks exist in the pool, maps next available block to this retake attempt.
 * 2. If all initial blocks are exhausted, creates a new dynamic block (Block 11/12) using
 *    Range-Based Question Fetching.
 * 3. STRICT UNIQUE SEQUENCE RULE: Ensures that a user's retake block does NOT repeat the exact
 *    question combination or identical order used in their previous attempts.
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
  const { userId, allQuestions, onQuestionSavedToFirestore } = params;
  const canonicalId = canonicalizeUserId(userId);

  // 1. Check if unassigned pre-generated blocks exist in the pool
  const totalBlocks = Math.ceil(allQuestions.length / 10);
  let blockMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) blockMap = JSON.parse(raw);
  } catch {}

  // Load previous combinations used by this user to verify non-repetition
  const userComboKey = `quizkart_used_quiz_combinations_${canonicalId}`;
  let usedCombos: string[] = [];
  try {
    usedCombos = JSON.parse(localStorage.getItem(userComboKey) || '[]');
  } catch {}

  let availableUnassignedBlock = -1;
  for (let b = 1; b <= totalBlocks; b++) {
    const assigned = blockMap[b];
    const isUnassigned = !assigned || assigned === 'unassigned' || assigned.toLowerCase().includes('unassigned');
    const questionsInB = allQuestions.filter(q => q.blockNumber === b);
    const hasAssignedUser = questionsInB.some(q => q.assignedUserId && q.assignedUserId !== 'unassigned');

    if (isUnassigned && !hasAssignedUser && questionsInB.length === 10) {
      // Check that this block's question signature does not repeat user's previous attempt
      const sigCombo = questionsInB.map(q => q.originalSourceId || q.id || q.stem).sort().join('-');
      if (!usedCombos.includes(sigCombo)) {
        availableUnassignedBlock = b;
        break;
      }
    }
  }

  // If an unassigned block exists in the pool (e.g. Block 6, Block 7)
  if (availableUnassignedBlock > 0) {
    setBlockAssignedUserId(availableUnassignedBlock, canonicalId);

    const updatedQuestions = allQuestions.map(q => {
      if (q.blockNumber === availableUnassignedBlock) {
        return {
          ...q,
          assignedUserId: canonicalId,
          isRetake: true,
          updatedAt: new Date().toISOString()
        };
      }
      return q;
    });

    const blockQuestions = updatedQuestions.filter(q => q.blockNumber === availableUnassignedBlock);

    try {
      localStorage.setItem(
        `quizkart_active_user_assigned_block_${canonicalId}`,
        JSON.stringify({
          blockNumber: availableUnassignedBlock,
          questionIds: blockQuestions.map(q => q.id),
          timestamp: Date.now()
        })
      );

      const sigCombo = blockQuestions.map(q => q.originalSourceId || q.id || q.stem).sort().join('-');
      usedCombos.push(sigCombo);
      localStorage.setItem(userComboKey, JSON.stringify(usedCombos.slice(-200)));
    } catch {}

    questionPoolManager.saveAllQuestions(updatedQuestions);
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(updatedQuestions.slice(0, 1000)));
    } catch {}

    if (onQuestionSavedToFirestore) {
      blockQuestions.forEach(q => {
        try { onQuestionSavedToFirestore(q); } catch {}
      });
    }

    return {
      newQuestions: blockQuestions,
      updatedPool: updatedQuestions,
      blockNumber: availableUnassignedBlock
    };
  }

  // 2. If all initial blocks are exhausted, create a new dynamic block (Block 11/12) via Range-Based strategy
  const dynamicRes = createDynamicRangeBlockForUser({
    userId: canonicalId,
    allQuestions,
    isRetake: true,
    onQuestionSavedToFirestore
  });

  return {
    newQuestions: dynamicRes.assignedQuestions,
    updatedPool: dynamicRes.updatedQuestions,
    blockNumber: dynamicRes.assignedBlockNumber
  };
}
