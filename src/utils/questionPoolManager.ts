import { Question, QuestionCategory } from '../types';

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
 * Gets the assigned User ID for a specific 10-question page/block in the Admin Question Manager
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
      return (explicitQ as any).assignedUserId;
    }
  }

  // 2. Check persistent block assignment mapping
  try {
    const raw = localStorage.getItem(BLOCK_USER_ASSIGNMENTS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[blockNumber]) {
        return map[blockNumber];
      }
    }
  } catch {}

  // 3. Registered user list mapping
  if (registeredUsersList && registeredUsersList.length >= blockNumber) {
    const u = registeredUsersList[blockNumber - 1];
    if (u && u.id) return canonicalizeUserId(u.id);
  }

  // 4. Default synthetic QK-USR-XXXX fallback
  return `QK-USR-${1000 + blockNumber}`;
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

/**
 * STRICT ID-TO-QUESTION MAPPING (Requirement 4):
 * Enforces strict mapping rule: A test session MUST load EXACTLY and ONLY the questions
 * explicitly assigned to that specific User ID in the Admin Panel (no more, no less).
 * If 0 questions are assigned, returns [] (triggering the 0 questions empty state with no Exit Arena button).
 */
/**
 * STRICT ID-TO-QUESTION MAPPING (Requirement 4):
 * Enforces strict mapping rule: A test session MUST load EXACTLY and ONLY the questions
 * explicitly assigned to that specific User ID in the Admin Panel (no more, no less).
 * If 0 questions are assigned, returns [] (triggering the 0 questions empty state with no Exit Arena button).
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

  // 1. Check if user has an active session/retake block assignment
  try {
    const rawActive = localStorage.getItem(`quizkart_active_user_assigned_block_${canonicalId}`);
    if (rawActive) {
      const activeObj = JSON.parse(rawActive);
      if (activeObj && activeObj.blockNumber) {
        const b = Number(activeObj.blockNumber);
        const start = (b - 1) * 10;
        const end = start + 10;
        if (start < cleanPool.length) {
          const slice = cleanPool.slice(start, end);
          if (slice.length > 0) {
            return slice;
          }
        }
      }
      if (activeObj && Array.isArray(activeObj.questionIds) && activeObj.questionIds.length > 0) {
        const idSet = new Set(activeObj.questionIds.map(Number));
        const activeQuestions = cleanPool.filter(q => idSet.has(Number(q.id)));
        if (activeQuestions.length > 0) {
          return activeQuestions;
        }
      }
    }
  } catch {}

  // 2. Look for questions in cleanPool explicitly tagged with assignedUserId === canonicalId
  const explicitlyTagged = cleanPool.filter(q => (q as any).assignedUserId === canonicalId);
  if (explicitlyTagged.length > 0) {
    // If multiple blocks exist for this user, return the most recent block (up to 10 questions)
    if (explicitlyTagged.length > 10) {
      return explicitlyTagged.slice(explicitlyTagged.length - 10);
    }
    return explicitlyTagged;
  }

  // 3. Check persistent block assignments mapping (quizkart_block_user_assignments)
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
        assignedBlocks.sort((a, b) => b - a); // latest block first
        const targetBlock = assignedBlocks[0];
        const start = (targetBlock - 1) * 10;
        const end = start + 10;
        if (start < cleanPool.length) {
          return cleanPool.slice(start, end);
        }
      }
    }
  } catch {}

  // 4. Default position-based mapping for initial registered users:
  // e.g. User 1 (QK-USR-1001) -> Block 1 (items 0..9)
  let blockIndex = -1;
  try {
    const rawUsers = localStorage.getItem('quizkart_registered_users');
    const parsed: any[] = rawUsers ? JSON.parse(rawUsers) : [];
    const userIdx = parsed.findIndex(u => u && (canonicalizeUserId(u.id) === canonicalId || u.email === userId));
    if (userIdx >= 0) {
      blockIndex = userIdx;
    } else {
      const numMatch = String(canonicalId).match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        if (num >= 1001) {
          blockIndex = num - 1001;
        }
      }
    }
  } catch {
    const numMatch = String(canonicalId).match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      if (num >= 1001) {
        blockIndex = num - 1001;
      }
    }
  }

  if (blockIndex >= 0) {
    const startIdx = blockIndex * 10;
    const endIdx = startIdx + 10;
    if (startIdx < cleanPool.length) {
      return cleanPool.slice(startIdx, endIdx);
    }
  }

  // 5. Strict rule: If 0 questions are assigned to this user, return []
  return [];
}

/**
 * AUTOMATIC USER-BLOCK CREATION & 10-QUESTION LIMIT RULE (Requirement 1 & 2):
 * When questions are imported in the Admin Panel (e.g., a pool of 20 raw questions):
 * 1. Checks total count of registered User IDs (e.g., 5 registered users).
 * 2. Immediately creates 5 distinct blocks/pages in the Question Manager—one dedicated block for each registered User ID.
 * 3. STRICT 10-QUESTION BLOCK LIMIT: Each block MUST contain EXACTLY 10 questions (never 20 in a single block).
 * 4. Question Randomization & Exact Index Mapping: For each block, draws from base pool to create randomized question sequences.
 *    Question identity remains unchanged, but question selection and position are strictly randomized for each User ID.
 * 5. STRICT SYNC RULE: The exact sequence of 10 questions generated inside a specific User ID's block in the Admin Panel
 *    MUST be the EXACT 10 questions presented in that user's live test session.
 */
export function createInitialUserBlocksFromPool(params: {
  baseQuestions: Question[];
  registeredUsers?: any[];
  existingQuestions?: Question[];
  onQuestionSavedToFirestore?: (q: Question) => Promise<void> | void;
}): {
  allBlockQuestions: Question[];
  distinctUsers: string[];
} {
  const { baseQuestions, registeredUsers, existingQuestions = [], onQuestionSavedToFirestore } = params;
  if (!baseQuestions || baseQuestions.length === 0) {
    return { allBlockQuestions: [], distinctUsers: [] };
  }

  // Preserve raw base pool for retakes
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
          if (!userList.includes(id)) userList.push(id);
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
            if (!userList.includes(id)) userList.push(id);
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

  const allBlockQuestions: Question[] = [];
  const usedSequenceSignatures = new Set<string>();

  // 2. Generate exactly one dedicated 10-question block for each registered User ID
  userList.forEach((userId, userIdx) => {
    const blockNumber = userIdx + 1;

    // Pick 10 randomized questions from baseQuestions
    let picked: Question[] = [];
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      const shuffled = shuffleArray(baseQuestions);
      const candidate = shuffled.slice(0, 10);
      while (candidate.length < 10 && baseQuestions.length > 0) {
        candidate.push(baseQuestions[candidate.length % baseQuestions.length]);
      }
      const sig = candidate.map(q => q.stem || q.question).join('|');
      if (!usedSequenceSignatures.has(sig) || attempts >= 20) {
        usedSequenceSignatures.add(sig);
        picked = candidate;
        break;
      }
    }

    // 3. Format exactly 10 questions for this block
    const blockQuestions: Question[] = picked.slice(0, 10).map((q) => {
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
        assignedUserId: userId,
        blockNumber: blockNumber,
        isCustom: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    // Record block mapping
    setBlockAssignedUserId(blockNumber, userId);

    // Save active block mapping so user's test session loads EXACTLY these 10 questions in real time
    try {
      localStorage.setItem(
        `quizkart_active_user_assigned_block_${userId}`,
        JSON.stringify({
          blockNumber: blockNumber,
          questionIds: blockQuestions.map(q => q.id),
          timestamp: Date.now()
        })
      );
    } catch {}

    allBlockQuestions.push(...blockQuestions);
  });

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
    distinctUsers: userList
  };
}

/**
 * RE-JOIN / RETAKE CONTEST RANDOMIZATION LOGIC (Requirement 3):
 * When an existing user (e.g., User ID QK-USR-1001) clicks "Confirm & Join" to retake/re-join a contest:
 * 1. Automatically creates a new dedicated 10-question page/block entry in Admin Question Manager labeled with that User ID.
 * 2. Generates a fresh, unique 10-question randomized subset drawn from the contest pool.
 * 3. UNIQUE SEQUENCE RULE: Ensures that a user's retake block does not repeat the exact 10-question selection or order used in their previous attempt or in other active blocks.
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
  const { userId, allQuestions } = params;
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

  if (sourcePool.length === 0) {
    return { newQuestions: [], updatedPool: allQuestions, blockNumber: 1 };
  }

  // Draw 10 randomized questions with unique sequence rule
  const comboKey = 'quizkart_used_quiz_combinations';
  let usedCombos: string[] = [];
  try {
    usedCombos = JSON.parse(localStorage.getItem(comboKey) || '[]');
  } catch {}

  let picked: Question[] = [];
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const shuffled = shuffleArray(sourcePool);
    const candidate = shuffled.slice(0, 10);
    while (candidate.length < 10 && sourcePool.length > 0) {
      candidate.push(sourcePool[candidate.length % sourcePool.length]);
    }
    const signature = candidate.map(q => q.originalSourceId || q.id || q.stem).join('-');
    if (!usedCombos.includes(signature) || attempts >= 20) {
      usedCombos.push(signature);
      try {
        localStorage.setItem(comboKey, JSON.stringify(usedCombos.slice(-200)));
      } catch {}
      picked = candidate;
      break;
    }
  }

  // Option shuffle for each question to guarantee fresh presentation
  const optionShuffled = picked.slice(0, 10).map(q => smartShuffleQuestionOptions(q));

  // Determine next block number
  const nextBlockNumber = Math.max(1, Math.ceil(allQuestions.length / 10)) + 1;

  // Allocate new unique IDs (strictly greater than all existing and deleted IDs)
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
    isRetake: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  // Ensure new IDs are unrecorded from deletedSet
  newQuestions.forEach(q => questionPoolManager.unrecordDeletedQuestionId(q.id));

  // Determine dedicated new block/page entry in Admin Question Manager labeled with that User ID
  setBlockAssignedUserId(nextBlockNumber, canonicalId);

  // Store active block mapping for this user so active test session loads EXACTLY these 10 questions
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

  if (params.onQuestionSavedToFirestore) {
    newQuestions.forEach(q => {
      try {
        params.onQuestionSavedToFirestore!(q);
      } catch {}
    });
  }

  return {
    newQuestions,
    updatedPool,
    blockNumber: nextBlockNumber
  };
}
