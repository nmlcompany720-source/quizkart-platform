import { Question, ActiveContest, AutoPilotSettings, LeaderboardEntry, UserProfile, DailyPrizeItem } from '../types';
import { sanitizeContestSynchronous } from './imageCompressor';

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
 * Strictly selects 10 questions according to the 3-3-3-1 Skill-Based Rule:
 * 3 Easy, 3 Medium, 3 Hard, 1 Expert Tie-Breaker.
 * Enforces USER ROTATION LOCK: skips previously answered question IDs unless pool exhausted.
 */
export const selectSkillBasedQuestions = (
  pool: Question[],
  answeredIds: number[] = getAnsweredQuestionIds()
): Question[] => {
  if (!pool || pool.length === 0) return [];

  const answeredSet = new Set(answeredIds);

  const easyPool = pool.filter(q => q.difficulty === 'Easy');
  const mediumPool = pool.filter(q => q.difficulty === 'Medium');
  const hardPool = pool.filter(q => q.difficulty === 'Hard');
  const expertPool = pool.filter(q => q.difficulty === 'Expert');

  // Helper to pick N items prioritizing un-answered questions
  const pickFromTier = (tierPool: Question[], count: number, fallbackLabel: Question['difficulty']): Question[] => {
    if (!tierPool || tierPool.length === 0) {
      // Fallback: pick from any available question in pool, mapped to that difficulty
      const anyPool = (pool || []).filter(q => q && q.difficulty !== fallbackLabel);
      const safePool = (anyPool.length > 0 ? shuffleArray(anyPool) : shuffleArray(pool || [])) || [];
      return safePool.slice(0, count);
    }

    // 1. Unused questions for this user
    const unused = (tierPool || []).filter(q => q && q.id != null && !answeredSet.has(q.id));
    const shuffledUnused = shuffleArray(unused) || [];

    if (shuffledUnused.length >= count) {
      return shuffledUnused.slice(0, count);
    }

    // 2. If unused is less than count, fill remainder with previously answered from same tier
    const used = (tierPool || []).filter(q => q && q.id != null && answeredSet.has(q.id));
    const shuffledUsed = shuffleArray(used) || [];
    const combined = [...shuffledUnused, ...shuffledUsed];
    return combined.slice(0, count);
  };

  const selectedEasy = pickFromTier(easyPool, 3, 'Easy');
  const selectedMedium = pickFromTier(mediumPool, 3, 'Medium');
  const selectedHard = pickFromTier(hardPool, 3, 'Hard');
  const selectedExpert = pickFromTier(expertPool, 1, 'Expert');

  // Progressive difficulty sequence: Easy -> Medium -> Hard -> Expert Tie-Breaker
  return [...selectedEasy, ...selectedMedium, ...selectedHard, ...selectedExpert];
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
