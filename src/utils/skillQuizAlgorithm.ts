import { Question, QuestionCategory, ActiveContest, AutoPilotSettings, LeaderboardEntry, UserProfile, DailyPrizeItem } from '../types';
import { sanitizeContestSynchronous } from './imageCompressor';
import { normalizeCategory } from './aiQuestionParser';

/**
 * SKILL-BASED QUIZ ENGINE (3-3-3-1 RULE):
 * - 3 Easy Questions (Basic GK / Current Affairs - 10s per question)
 * - 3 Medium Questions (Concepts / Science - 10s per question)
 * - 3 Hard Questions (Deep Knowledge - 8s per question)
 * - 1 Expert Tie-Breaker Question (Tricky / Mastery - 5s strict timer)
 */
export const getQuestionTimerSeconds = (_difficulty?: Question['difficulty']): number => {
  return 59;
};

/**
 * LocalStorage keys for persistence
 */
const ANSWERED_QUESTIONS_STORAGE_KEY = 'quizkart_user_answered_q_ids';
const ACTIVE_CONTESTS_STORAGE_KEY = 'quizkart_active_contests';
const AUTO_PILOT_SETTINGS_KEY = 'quizkart_autopilot_settings';
export const AUTOPILOT_ACTIVE_STORAGE_KEY = 'quizkart_autopilot_active';

/**
 * Retrieve user's answered question IDs for user rotation lock
 */
export const getAnsweredQuestionIds = (): number[] => {
  try {
    const saved = localStorage.getItem(ANSWERED_QUESTIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

/**
 * Record newly answered question IDs to maintain user rotation lock
 */
export const recordAnsweredQuestionIds = (newIds: number[]): void => {
  try {
    const current = getAnsweredQuestionIds();
    const merged = Array.from(new Set([...current, ...newIds]));
    localStorage.setItem(ANSWERED_QUESTIONS_STORAGE_KEY, JSON.stringify(merged));
  } catch {}
};

/**
 * Reset answered rotation lock (admin or testing utility)
 */
export const resetAnsweredQuestionIds = (): void => {
  try {
    localStorage.removeItem(ANSWERED_QUESTIONS_STORAGE_KEY);
  } catch {}
};

/**
 * Shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
 
/**
 * 10-QUESTION BALANCED SUBJECT ROTATION ENGINE:
 * Strictly samples:
 * - 2 Maths Questions
 * - 2 Reasoning Questions
 * - 2 Science Questions
 * - 2 GK Questions
 * - 2 English Questions
 *
 * Enforces USER ROTATION LOCK: skips previously answered question IDs unless pool exhausted.
 */
export const BALANCED_SUBJECT_CONFIG: { category: QuestionCategory; count: number }[] = [
  { category: 'Maths', count: 2 },
  { category: 'Reasoning', count: 2 },
  { category: 'Science', count: 2 },
  { category: 'GK', count: 2 },
  { category: 'English', count: 2 }
];

export const selectSkillBasedQuestions = (
  pool: Question[],
  answeredIds: number[] = getAnsweredQuestionIds()
): Question[] => {
  if (!pool || pool.length === 0) return [];

  const answeredSet = new Set(answeredIds);
  const selectedQuestions: Question[] = [];
  const selectedIdSet = new Set<string | number>();

  // Group pool by the 5 strict subjects
  const subjectBuckets: Record<QuestionCategory, Question[]> = {
    Maths: [],
    Reasoning: [],
    Science: [],
    GK: [],
    English: []
  };

  for (const q of pool) {
    if (!q || q.id == null) continue;
    const cat = normalizeCategory(q.category, `${q.question || q.stem || ''} ${q.explanation || ''}`);
    subjectBuckets[cat].push(q);
  }

  // Sample exactly 2 questions per subject
  for (const { category, count } of BALANCED_SUBJECT_CONFIG) {
    const bucket = subjectBuckets[category] || [];
    
    // 1. Separate into unused (un-answered) vs previously answered
    const unused = bucket.filter(q => !answeredSet.has(Number(q.id)) && !selectedIdSet.has(q.id));
    const used = bucket.filter(q => answeredSet.has(Number(q.id)) && !selectedIdSet.has(q.id));

    const shuffledUnused = shuffleArray(unused);
    const shuffledUsed = shuffleArray(used);

    const candidates = [...shuffledUnused, ...shuffledUsed];
    const picked = candidates.slice(0, count);

    for (const q of picked) {
      selectedQuestions.push(q);
      selectedIdSet.add(q.id);
    }
  }

  // If pool was sparse in any subject and we have fewer than 10, backfill with remaining available questions
  if (selectedQuestions.length < 10) {
    const remainingPool = shuffleArray(pool.filter(q => q && q.id != null && !selectedIdSet.has(q.id)));
    for (const q of remainingPool) {
      if (selectedQuestions.length >= 10) break;
      selectedQuestions.push(q);
      selectedIdSet.add(q.id);
    }
  }

  // Return exactly 10 questions in balanced subject rotation
  return selectedQuestions.slice(0, 10);
};

/**
 * Default Auto-Pilot Settings
 */
export const DEFAULT_AUTO_PILOT_SETTINGS: AutoPilotSettings = {
  isEnabled: true,
  dailyTime: '8:00 PM Daily Blitz',
  contestType: 'product',
  entryFee: 100,
  cashPrizePool: 10000,
  productItemTitle: 'Noise ColorFit Ultra 3 AMOLED Bluetooth Calling Smartwatch',
  productMarketValue: 7999,
  productImageUrl: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&auto=format&fit=crop&q=80',
  ecommerceFulfillmentLink: 'https://www.amazon.in/dp/B0C8V73TQR',
  nextRunTimeDisplay: 'Tonight at 8:00 PM IST'
};

/**
 * Default Active Contests for Contest Manager (Clean empty start - no hardcoded dummy items)
 */
export const DEFAULT_ACTIVE_CONTESTS: ActiveContest[] = [];

export const getSavedContests = (): ActiveContest[] => {
  try {
    const saved = localStorage.getItem(ACTIVE_CONTESTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        let deletedList: string[] = [];
        try {
          deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
        } catch {}
        // Filter out invalid items, deleted items, and legacy dummy items
        const cleaned = parsed
          .filter((c: any) => 
            c && 
            typeof c === 'object' &&
            c.id &&
            !deletedList.includes(c.id) &&
            c.id !== 'CNT-PROD-101' && 
            c.id !== 'CNT-CASH-202'
          );
        return cleaned;
      }
    }
  } catch {}
  return DEFAULT_ACTIVE_CONTESTS;
};

export const saveActiveContests = (contests: ActiveContest[]): void => {
  try {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    const filtered = (contests || [])
      .filter(c => c && c.id && !deletedList.includes(c.id));
    localStorage.setItem(ACTIVE_CONTESTS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('LocalStorage save active contests error:', err);
  }
};

export const getAutoPilotSettings = (): AutoPilotSettings => {
  let settings = DEFAULT_AUTO_PILOT_SETTINGS;
  try {
    const saved = localStorage.getItem(AUTO_PILOT_SETTINGS_KEY);
    if (saved) {
      settings = JSON.parse(saved);
    }
  } catch {}

  try {
    const activeStored = localStorage.getItem(AUTOPILOT_ACTIVE_STORAGE_KEY);
    if (activeStored !== null) {
      settings.isEnabled = activeStored === 'true';
    }
  } catch {}

  return settings;
};

export const saveAutoPilotSettings = (settings: AutoPilotSettings): void => {
  try {
    localStorage.setItem(AUTO_PILOT_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(AUTOPILOT_ACTIVE_STORAGE_KEY, String(settings.isEnabled));
  } catch {}
};
