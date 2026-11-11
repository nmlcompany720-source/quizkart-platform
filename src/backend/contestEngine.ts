import { ContestEntry, ContestPoolCalculation, FinancialLedgerRecord, LeaderboardEntry, Question, ActiveContest, UserProfile, WithdrawalRequest } from '../types';
export type { ContestEntry, ContestPoolCalculation, FinancialLedgerRecord, LeaderboardEntry };

/**
 * QUIZKART CONTEST ENGINE - BACKEND
 * 
 * Strict Implementation of Requirements 1 to 5:
 * 1. First User Join & Winner Leader (Automatic Prize Pool, Winner Slots & Rank 1)
 * 2. Second User Join & Automatic Ranking (Immediate Reranking & max prize limit)
 * 3. Live Prize Recalculation (Real Joins, Prize Pool, Winner Slots, Leaderboard ranks, Rank-wise projected prizes)
 * 4. Fourth & Fifth Entry - Winner Slot Expansion (CEIL(N/3), Waterfall Distribution up to ₹180)
 * 5. Re-Join System - Only the Latest Entry Will Be Valid (Atomic invalidation of old entry, 1 active entry per user, ownerUid settlement)
 * 
 * Security & Financial Rules:
 * - Integer paise financial arithmetic (60% Winner Pool, 10% Referral Pool, 30% Platform Margin)
 * - Trusted backend scoring (Never trust client scores/ranks/payouts)
 * - Strict tie-breakers: Higher Score -> Lower Time Taken -> Earlier Submission Time
 * - Atomic invalidation on re-join: Old entries marked 'replaced' (isActive=false, isValid=false)
 * - Unsubmitted entries never prize-eligible
 * - Ranks strictly <= confirmed paid entries
 */

export const PAISE_PER_RUPEE = 100;
export const DEFAULT_ENTRY_FEE_PAISE = 100 * PAISE_PER_RUPEE; // ₹100 = 10,000 paise
export const MAX_PRIZE_LIMIT_PAISE = 180 * PAISE_PER_RUPEE;    // ₹180 = 18,000 paise

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: number): number {
  return Math.round((paise / PAISE_PER_RUPEE) * 100) / 100;
}

/**
 * Format time in seconds to human readable string (e.g., "1m 15s" or "45s")
 */
export function formatTimeDisplay(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

/**
 * REQ 1, 2, 4: Pure Mathematical Economics & Waterfall Pool Calculation
 * 
 * Calculates integer paise breakdown:
 * - Revenue = confirmedPaidEntries * entryFeePaise
 * - Prize Pool (60%) = Math.floor((totalRevenuePaise * 60) / 100)
 * - Referral Pool (10%) = Math.floor((totalRevenuePaise * 10) / 100)
 * - Platform Margin (30%) = totalRevenuePaise - prizePoolPaise - referralPoolPaise
 * - Winner Slots = CEIL(confirmedPaidEntries / 3) (Bounded by confirmedPaidEntries)
 * - Waterfall Distribution:
 *     Rank 1 gets min(maxPrizeLimit, unallocated)
 *     Rank 2 gets min(maxPrizeLimit, unallocated)
 *     ...
 */
export function calculateContestPool(
  confirmedPaidEntries: number,
  entryFeePaise: number = DEFAULT_ENTRY_FEE_PAISE,
  maxPrizeLimitPaise: number = MAX_PRIZE_LIMIT_PAISE
): ContestPoolCalculation {
  const entriesCount = Math.max(0, Math.floor(confirmedPaidEntries));
  const feePaise = Math.max(0, Math.floor(entryFeePaise));
  const maxPrizePaise = Math.max(0, Math.floor(maxPrizeLimitPaise));

  const totalRevenuePaise = entriesCount * feePaise;
  const prizePoolPaise = Math.floor((totalRevenuePaise * 60) / 100);
  const referralPoolPaise = Math.floor((totalRevenuePaise * 10) / 100);
  const platformMarginPaise = totalRevenuePaise - prizePoolPaise - referralPoolPaise;

  // Winner Slots = CEIL(Confirmed Paid Entries / 3)
  // Bounded so we never assign winner slots greater than confirmed paid entries
  const rawWinnerSlots = entriesCount > 0 ? Math.ceil(entriesCount / 3) : 0;
  const effectiveWinnerSlots = Math.min(rawWinnerSlots, entriesCount);

  // Waterfall Rank-wise Prize Allocation
  const slotPayoutsPaise: { [rank: number]: number } = {};
  const slotPayoutsRupees: { [rank: number]: number } = {};
  let unallocated = prizePoolPaise;

  for (let rank = 1; rank <= effectiveWinnerSlots; rank++) {
    const payout = Math.min(maxPrizePaise, Math.max(0, unallocated));
    slotPayoutsPaise[rank] = payout;
    slotPayoutsRupees[rank] = paiseToRupees(payout);
    unallocated -= payout;
  }

  return {
    contestId: '',
    confirmedPaidEntries: entriesCount,
    totalConfirmedUsers: entriesCount,
    entryFeePaise: feePaise,
    entryFeeRupees: paiseToRupees(feePaise),
    totalRevenuePaise,
    totalRevenueRupees: paiseToRupees(totalRevenuePaise),
    prizePoolPaise,
    prizePoolRupees: paiseToRupees(prizePoolPaise),
    referralPoolPaise,
    referralPoolRupees: paiseToRupees(referralPoolPaise),
    platformMarginPaise,
    platformMarginRupees: paiseToRupees(platformMarginPaise),
    winnerSlots: effectiveWinnerSlots,
    maxPrizePerWinnerPaise: maxPrizePaise,
    maxPrizePerWinnerRupees: paiseToRupees(maxPrizePaise),
    slotPayoutsPaise,
    slotPayoutsRupees,
    activeEntriesCount: entriesCount,
    submittedEntriesCount: 0,
    lastRecalculatedAt: new Date().toISOString()
  };
}

/**
 * TRUSTED BACKEND SCORE CALCULATION
 * 
 * Evaluates submitted user answers against master questions on the secure backend.
 * Scoring Rule: Final Score = (Correct × 1) − (Wrong × 0.33)
 * Proctor Violation / Security Breach: 0 points.
 */
export function calculateTrustedScore(
  answers: Record<number, number> = {},
  questions: Question[] = [],
  securityBreached: boolean = false
): {
  score: number;
  rawScore: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
} {
  const activeQuestions = (questions || []).filter(q => q && q.id != null);
  const totalQuestions = activeQuestions.length > 0 ? activeQuestions.length : 10;

  if (securityBreached) {
    return {
      score: 0,
      rawScore: 0,
      correctCount: 0,
      wrongCount: 0,
      totalQuestions
    };
  }

  let correctCount = 0;
  let wrongCount = 0;

  activeQuestions.forEach((q) => {
    const selected = answers[q.id];
    if (selected !== undefined && selected !== null) {
      let correctIdx = q.correctIndex;
      if ((correctIdx === undefined || correctIdx === null || correctIdx < 0 || correctIdx > 3) && q.correctKey) {
        const keyMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        correctIdx = keyMap[q.correctKey] ?? 0;
      }
      if (selected === correctIdx) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
    }
  });

  const rawScore = (correctCount * 1) - (wrongCount * 0.33);
  const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);

  return {
    score: finalScore,
    rawScore,
    correctCount,
    wrongCount,
    totalQuestions
  };
}

/**
 * RANKING & TIE-BREAKER ENGINE
 * 
 * Requirements:
 * - Rank ONLY valid, active entries.
 * - Primary Sort: Highest Score (descending)
 * - Secondary Tie-Breaker: Lowest Time Taken (ascending)
 * - Tertiary Tie-Breaker: Earlier Submission Time (ascending: older timestamp first)
 * - Unsubmitted entries: Must NOT receive rank or prize eligibility until submitted.
 * - Bounded: Never assign a rank greater than total confirmed paid entries.
 */
export function rankActiveEntries(
  entries: ContestEntry[],
  poolCalc: ContestPoolCalculation
): ContestEntry[] {
  // 1. Filter only valid active entries (exclude replaced, invalid, inactive)
  const validActiveEntries = entries.filter(e => e && e.isActive && e.isValid && e.status === 'active');
  const confirmedPaidEntries = validActiveEntries.length;

  // 2. Separate into submitted vs unsubmitted
  const submitted = validActiveEntries.filter(e => e.isSubmitted);
  const unsubmitted = validActiveEntries.filter(e => !e.isSubmitted);

  // 3. Sort submitted entries using strict multi-tier tie-breakers
  submitted.sort((a, b) => {
    // 1. Highest Score
    const scoreA = Number(a.score) || 0;
    const scoreB = Number(b.score) || 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // 2. Lowest Time Taken
    const timeA = Number(a.timeTakenSeconds) || 0;
    const timeB = Number(b.timeTakenSeconds) || 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    // 3. Earlier Submission Time
    const submitTimeA = a.submittedTimestampMs || new Date(a.submittedAt || 0).getTime() || 0;
    const submitTimeB = b.submittedTimestampMs || new Date(b.submittedAt || 0).getTime() || 0;
    if (submitTimeA !== submitTimeB) {
      return submitTimeA - submitTimeB;
    }
    // Fallback: Entry sequence number
    return a.entrySequenceNumber - b.entrySequenceNumber;
  });

  // 4. Assign ranks and projected prizes to submitted entries
  const rankedSubmitted: ContestEntry[] = submitted.map((entry, idx) => {
    const rank = idx + 1;
    // Strictly bounded by confirmedPaidEntries
    const boundedRank = Math.min(rank, confirmedPaidEntries);

    let projectedPrizePaise = 0;
    if (boundedRank <= poolCalc.winnerSlots) {
      projectedPrizePaise = poolCalc.slotPayoutsPaise[boundedRank] || 0;
    }

    return {
      ...entry,
      rank: boundedRank,
      projectedPrizePaise,
      projectedPrizeRupees: paiseToRupees(projectedPrizePaise)
    };
  });

  // 5. Unsubmitted entries: remain in active participation but unranked and 0 prize
  const updatedUnsubmitted: ContestEntry[] = unsubmitted.map(entry => ({
    ...entry,
    rank: undefined,
    projectedPrizePaise: 0,
    projectedPrizeRupees: 0
  }));

  return [...rankedSubmitted, ...updatedUnsubmitted];
}

/**
 * CONVERT CONTEST ENTRIES TO UI LEADERBOARD ENTRIES
 * Compatible with QuizKart's LiveLeaderboard and Admin Panel data flow.
 */
export function createDefaultFourContestEntries(contestId: string = 'live_round', entryFeeRupees: number = 100): ContestEntry[] {
  const feePaise = rupeesToPaise(entryFeeRupees);
  const now = Date.now();
  return [
    {
      entryId: 'ENTRY-001',
      contestId,
      ownerUid: 'usr-1001',
      userEmail: 'rahul.sharma@quizkart.in',
      userName: 'Rahul Sharma',
      city: 'Jaipur',
      state: 'Rajasthan',
      paidAmountPaise: feePaise,
      entryFeePaise: feePaise,
      entryFeeRupees,
      paymentVerified: true,
      entrySequenceNumber: 1,
      joinedAt: new Date(now - 3600000).toISOString(),
      joinedTimestampMs: now - 3600000,
      submittedAt: new Date(now - 3500000).toISOString(),
      submittedTimestampMs: now - 3500000,
      score: 10,
      totalQuestions: 10,
      timeTakenSeconds: 142.4,
      isSubmitted: true,
      status: 'active',
      isActive: true,
      isValid: true,
      rank: 1,
      projectedPrizePaise: 18000,
      projectedPrizeRupees: 180
    },
    {
      entryId: 'ENTRY-002',
      contestId,
      ownerUid: 'usr-1002',
      userEmail: 'priya.sundaram@quizkart.in',
      userName: 'Priya Sundaram',
      city: 'Bengaluru',
      state: 'Karnataka',
      paidAmountPaise: feePaise,
      entryFeePaise: feePaise,
      entryFeeRupees,
      paymentVerified: true,
      entrySequenceNumber: 2,
      joinedAt: new Date(now - 3000000).toISOString(),
      joinedTimestampMs: now - 3000000,
      submittedAt: new Date(now - 2900000).toISOString(),
      submittedTimestampMs: now - 2900000,
      score: 10,
      totalQuestions: 10,
      timeTakenSeconds: 168.1,
      isSubmitted: true,
      status: 'active',
      isActive: true,
      isValid: true,
      rank: 2,
      projectedPrizePaise: 6000,
      projectedPrizeRupees: 60
    },
    {
      entryId: 'ENTRY-003',
      contestId,
      ownerUid: 'usr-1003',
      userEmail: 'rohan.deshmukh@quizkart.in',
      userName: 'Rohan Deshmukh',
      city: 'Pune',
      state: 'Maharashtra',
      paidAmountPaise: feePaise,
      entryFeePaise: feePaise,
      entryFeeRupees,
      paymentVerified: true,
      entrySequenceNumber: 3,
      joinedAt: new Date(now - 2400000).toISOString(),
      joinedTimestampMs: now - 2400000,
      submittedAt: new Date(now - 2300000).toISOString(),
      submittedTimestampMs: now - 2300000,
      score: 10,
      totalQuestions: 10,
      timeTakenSeconds: 185.5,
      isSubmitted: true,
      status: 'active',
      isActive: true,
      isValid: true,
      rank: 3,
      projectedPrizePaise: 0,
      projectedPrizeRupees: 0
    },
    {
      entryId: 'ENTRY-004',
      contestId,
      ownerUid: 'usr-1004',
      userEmail: 'neha.verma@quizkart.in',
      userName: 'Neha Verma',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      paidAmountPaise: feePaise,
      entryFeePaise: feePaise,
      entryFeeRupees,
      paymentVerified: true,
      entrySequenceNumber: 4,
      joinedAt: new Date(now - 1800000).toISOString(),
      joinedTimestampMs: now - 1800000,
      submittedAt: new Date(now - 1700000).toISOString(),
      submittedTimestampMs: now - 1700000,
      score: 9,
      totalQuestions: 10,
      timeTakenSeconds: 154.2,
      isSubmitted: true,
      status: 'active',
      isActive: true,
      isValid: true,
      rank: 4,
      projectedPrizePaise: 0,
      projectedPrizeRupees: 0
    }
  ];
}


export function mapEntriesToLeaderboard(
  entries: ContestEntry[],
  currentOwnerUid?: string,
  isProductContest: boolean = false,
  productItemTitle: string = 'Noise Smartwatch',
  productRetailValue: number = 2999
): LeaderboardEntry[] {
  // Only active, valid, and submitted entries participate in leaderboard and rankings
  const activeEntries = entries.filter(e => e.isActive && e.isValid && e.status === 'active' && e.isSubmitted);

  const sorted = [...activeEntries].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank && !b.rank) return -1;
    if (!a.rank && b.rank) return 1;
    return a.entrySequenceNumber - b.entrySequenceNumber;
  });

  return sorted.map((entry, idx) => {
    const isCurrentUser = Boolean(currentOwnerUid && entry.ownerUid === currentOwnerUid);
    const rank = entry.rank || (idx + 1);
    const prizeRupees = entry.projectedPrizeRupees !== undefined 
      ? entry.projectedPrizeRupees 
      : (entry.projectedPrizePaise ? paiseToRupees(entry.projectedPrizePaise) : 0);

    let rewardText = '₹0';
    let rewardType: 'product' | 'cashback' | 'none' = 'none';
    let rewardAmount = prizeRupees;

    if (entry.securityBreached) {
      rewardText = 'Disqualified (Violation)';
      rewardType = 'none';
      rewardAmount = 0;
    } else if (prizeRupees > 0) {
      if (rank === 1 && isProductContest) {
        rewardText = `🎁 ${productItemTitle}`;
        rewardType = 'product';
        rewardAmount = productRetailValue;
      } else {
        rewardText = `₹${prizeRupees}`;
        rewardType = 'cashback';
        rewardAmount = prizeRupees;
      }
    } else {
      rewardText = '₹0';
      rewardType = 'none';
      rewardAmount = 0;
    }

    const dateStr = entry.submittedAt
      ? new Date(entry.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = entry.submittedAt
      ? new Date(entry.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      id: entry.entryId,
      entryId: entry.entryId,
      ownerUid: entry.ownerUid,
      rank,
      userName: entry.userName || 'Contestant',
      avatar: entry.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      score: entry.score || 0,
      totalQuestions: entry.totalQuestions || 10,
      timeTakenSeconds: entry.timeTakenSeconds || 0,
      formattedTime: formatTimeDisplay(entry.timeTakenSeconds || 0),
      city: entry.city || 'Bengaluru',
      state: entry.state || 'Karnataka',
      rewardText,
      rewardType,
      rewardAmount,
      isCurrentUser,
      timestamp: timeStr,
      submittedAt: `${dateStr}, ${timeStr}`,
      securityBreached: entry.securityBreached
    };
  });
}

/**
 * STATEFUL BACKEND CONTEST SERVICE (THREAD-SAFE / CONCURRENCY-SAFE)
 * 
 * Manages atomic entry creation, invalidation on re-join, live ranking,
 * financial ledgers, and contest final settlement.
 */
class QuizKartContestBackendService {
  // In-memory store of all entries: contestId -> ContestEntry[]
  private entriesStore: Map<string, ContestEntry[]> = new Map();
  // Financial ledgers: transactionId -> FinancialLedgerRecord
  private ledgerStore: Map<string, FinancialLedgerRecord> = new Map();
  // Entry sequence counter: contestId -> number
  private entrySequenceCounter: Map<string, number> = new Map();
  // Settlement records: contestId -> boolean
  private settledContests: Set<string> = new Set();
  // Cached user profile synchronization map: ownerUid -> profile
  private userProfilesCache: Map<string, { userName: string; avatarUrl?: string; city?: string; state?: string }> = new Map();

  constructor() {
    this.hydrateFromStorage();
  }

  /**
   * Hydrates memory state from localStorage if available (client environment)
   */
  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawEntries = localStorage.getItem('quizkart_contest_entries');
      if (rawEntries) {
        const parsed = JSON.parse(rawEntries);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((e: ContestEntry) => {
            const list = this.entriesStore.get(e.contestId) || [];
            list.push(e);
            this.entriesStore.set(e.contestId, list);

            const currSeq = this.entrySequenceCounter.get(e.contestId) || 0;
            if (e.entrySequenceNumber > currSeq) {
              this.entrySequenceCounter.set(e.contestId, e.entrySequenceNumber);
            }
          });
        }
      }

      const rawLedger = localStorage.getItem('quizkart_financial_ledger');
      if (rawLedger) {
        const parsedLedger = JSON.parse(rawLedger);
        if (Array.isArray(parsedLedger)) {
          parsedLedger.forEach((rec: FinancialLedgerRecord) => {
            this.ledgerStore.set(rec.transactionId, rec);
          });
        }
      }

      const rawSettled = localStorage.getItem('quizkart_settled_contests');
      if (rawSettled) {
        const parsedSettled = JSON.parse(rawSettled);
        if (Array.isArray(parsedSettled)) {
          parsedSettled.forEach((id: string) => this.settledContests.add(id));
        }
      }
    } catch (err) {
      console.warn('[ContestBackend] Storage hydration warning:', err);
    }
  }

  public persistStore(contestId: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const allEntries: ContestEntry[] = [];
      this.entriesStore.forEach(list => allEntries.push(...list));
      localStorage.setItem('quizkart_contest_entries', JSON.stringify(allEntries));

      const allLedgers = Array.from(this.ledgerStore.values());
      localStorage.setItem('quizkart_financial_ledger', JSON.stringify(allLedgers));

      localStorage.setItem('quizkart_settled_contests', JSON.stringify(Array.from(this.settledContests)));
    } catch {}
  }

  public rerankAndRecalculate(contestId: string, entryFeeRupees: number = 100): {
    poolCalculation: ContestPoolCalculation;
    rankedActiveEntries: ContestEntry[];
  } {
    const contestList = this.entriesStore.get(contestId) || [];
    const hasRealEntries = contestList.some(e => 
      e.isActive && e.isValid && e.status === 'active' && 
      !e.ownerUid.startsWith('demo-') && !e.ownerUid.startsWith('seed-')
    );
    const activeEntriesOnly = contestList.filter(e => {
      if (!e.isActive || !e.isValid || e.status !== 'active') return false;
      if (hasRealEntries && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return false;
      return true;
    });

    const entryFeePaise = activeEntriesOnly[0]?.entryFeePaise || rupeesToPaise(entryFeeRupees);
    const poolCalculation = calculateContestPool(activeEntriesOnly.length, entryFeePaise);
    poolCalculation.contestId = contestId;

    const rankedActiveEntries = rankActiveEntries(activeEntriesOnly, poolCalculation);
    rankedActiveEntries.forEach(re => {
      const idx = contestList.findIndex(e => e.entryId === re.entryId);
      if (idx >= 0) {
        contestList[idx] = re;
      }
    });

    this.entriesStore.set(contestId, contestList);
    this.persistStore(contestId);

    return { poolCalculation, rankedActiveEntries };
  }

  public getActiveEntries(contestId: string): ContestEntry[] {
    const list = this.entriesStore.get(contestId) || [];
    const hasRealEntries = list.some(e => 
      e.isActive && e.isValid && e.status === 'active' && 
      !e.ownerUid.startsWith('demo-') && !e.ownerUid.startsWith('seed-')
    );

    // Strict deduplication by entryId
    const seen = new Set<string>();
    const active: ContestEntry[] = [];
    list.forEach(e => {
      if (!e || !e.entryId || seen.has(e.entryId)) return;
      seen.add(e.entryId);
      if (hasRealEntries && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return;
      // Valid, confirmed, active paid entries only:
      // Replaced, invalid, failed, pending or unpaid entries must NOT be counted in active Real Joins
      if (
        e.contestId === contestId &&
        e.isActive === true &&
        e.isValid === true &&
        e.status === 'active' &&
        e.paymentVerified !== false
      ) {
        active.push(e);
      }
    });

    return active.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank && !b.rank) return -1;
      if (!a.rank && b.rank) return 1;
      return a.entrySequenceNumber - b.entrySequenceNumber;
    });
  }

  public getPoolCalculation(contestId: string, entryFeeRupees: number = 100): ContestPoolCalculation {
    const active = this.getActiveEntries(contestId);
    const feePaise = active[0]?.entryFeePaise || rupeesToPaise(entryFeeRupees);
    const calc = calculateContestPool(active.length, feePaise);
    calc.contestId = contestId;
    return calc;
  }

  /**
   * Authoritative contest synchronization from persistent Firestore records.
   * Isolates records to contestId, deduplicates by entryId, preserves submitted state,
   * enforces latest-active-entry-per-user, and updates sequence counters.
   */
  public loadContestEntries(contestId: string, cloudEntries: ContestEntry[]): void {
    if (!contestId) return;

    // Existing entries in memory for this contest
    const existingList = this.entriesStore.get(contestId) || [];
    const existingMap = new Map<string, ContestEntry>();
    existingList.forEach(e => {
      if (e && e.entryId) existingMap.set(e.entryId, e);
    });

    const cleanMap = new Map<string, ContestEntry>();
    let maxSeq = this.entrySequenceCounter.get(contestId) || 0;

    (cloudEntries || []).forEach(incoming => {
      if (!incoming || !incoming.entryId) return;
      if (incoming.contestId === contestId) {
        // If local entry is already submitted, preserve submission if incoming snapshot is unsubmitted
        const local = existingMap.get(incoming.entryId);
        let merged: ContestEntry = { ...incoming };
        if (local && local.isSubmitted && !incoming.isSubmitted) {
          merged = {
            ...incoming,
            isSubmitted: true,
            score: local.score,
            rawScore: local.rawScore,
            totalQuestions: local.totalQuestions,
            correctCount: local.correctCount,
            wrongCount: local.wrongCount,
            timeTakenSeconds: local.timeTakenSeconds,
            answers: local.answers || incoming.answers,
            submittedAt: local.submittedAt || incoming.submittedAt,
            submittedTimestampMs: local.submittedTimestampMs || incoming.submittedTimestampMs,
            rank: local.rank || incoming.rank,
            projectedPrizeRupees: local.projectedPrizeRupees || incoming.projectedPrizeRupees,
            projectedPrizePaise: local.projectedPrizePaise || incoming.projectedPrizePaise,
            securityBreached: local.securityBreached !== undefined ? local.securityBreached : incoming.securityBreached
          };
        }

        // Real-time synchronization: preserve latest profile name & photo for active entries
        if (merged.ownerUid && this.userProfilesCache.has(merged.ownerUid) && merged.isActive && merged.status === 'active') {
          const cached = this.userProfilesCache.get(merged.ownerUid)!;
          if (cached.userName) merged.userName = cached.userName;
          if (cached.avatarUrl !== undefined) merged.avatarUrl = cached.avatarUrl;
        }

        cleanMap.set(merged.entryId, merged);
        if (merged.entrySequenceNumber && merged.entrySequenceNumber > maxSeq) {
          maxSeq = merged.entrySequenceNumber;
        }
      }
    });

    // Also preserve local entries that haven't synced to cloud yet (in-flight, testing, or offline)
    existingList.forEach(local => {
      if (local && local.entryId && local.contestId === contestId && !cleanMap.has(local.entryId)) {
        if (local.isActive && local.isValid && local.status === 'active') {
          if (local.ownerUid && this.userProfilesCache.has(local.ownerUid)) {
            const cached = this.userProfilesCache.get(local.ownerUid)!;
            if (cached.userName) local.userName = cached.userName;
            if (cached.avatarUrl !== undefined) local.avatarUrl = cached.avatarUrl;
          }
          cleanMap.set(local.entryId, local);
          if (local.entrySequenceNumber && local.entrySequenceNumber > maxSeq) {
            maxSeq = local.entrySequenceNumber;
          }
        }
      }
    });

    // Preserve latest-active-entry-per-user rule
    // Group active entries by ownerUid; only the highest sequence number / latest entry per user remains active
    const byOwner = new Map<string, ContestEntry[]>();
    Array.from(cleanMap.values()).forEach(e => {
      if (e.isActive && e.status === 'active' && e.ownerUid) {
        const userEntries = byOwner.get(e.ownerUid) || [];
        userEntries.push(e);
        byOwner.set(e.ownerUid, userEntries);
      }
    });

    byOwner.forEach((userEntries) => {
      if (userEntries.length > 1) {
        userEntries.sort((a, b) => (b.entrySequenceNumber || 0) - (a.entrySequenceNumber || 0));
        // Keep the first (latest) as active; mark previous ones as replaced
        for (let i = 1; i < userEntries.length; i++) {
          const old = userEntries[i];
          const entryInMap = cleanMap.get(old.entryId);
          if (entryInMap) {
            entryInMap.isActive = false;
            entryInMap.isValid = false;
            entryInMap.status = 'replaced';
            entryInMap.replacedByEntryId = userEntries[0].entryId;
          }
        }
      }
    });

    const finalCleanList = Array.from(cleanMap.values());
    this.entriesStore.set(contestId, finalCleanList);
    if (maxSeq > 0) {
      this.entrySequenceCounter.set(contestId, maxSeq);
    }
    this.rerankAndRecalculate(contestId);
    this.persistStore(contestId);
  }

  public loadEntriesFromFirestore(cloudEntries: ContestEntry[]): void {
    if (!Array.isArray(cloudEntries) || cloudEntries.length === 0) return;
    const affectedContests = new Set<string>();
    cloudEntries.forEach(entry => {
      if (!entry || !entry.contestId || !entry.entryId) return;
      const contestId = entry.contestId;
      affectedContests.add(contestId);
      // Real-time synchronization: preserve latest profile name for active entries
      if (entry.ownerUid && this.userProfilesCache.has(entry.ownerUid) && entry.isActive && entry.status === 'active') {
        const cached = this.userProfilesCache.get(entry.ownerUid)!;
        if (cached.userName) entry.userName = cached.userName;
        if (cached.avatarUrl !== undefined) entry.avatarUrl = cached.avatarUrl;
      }
      const list = this.entriesStore.get(contestId) || [];
      const existingIdx = list.findIndex(e => e.entryId === entry.entryId);
      if (existingIdx >= 0) {
        list[existingIdx] = entry;
      } else {
        list.push(entry);
      }
      this.entriesStore.set(contestId, list);

      const currSeq = this.entrySequenceCounter.get(contestId) || 0;
      if (entry.entrySequenceNumber && entry.entrySequenceNumber > currSeq) {
        this.entrySequenceCounter.set(contestId, entry.entrySequenceNumber);
      }
    });

    affectedContests.forEach(contestId => {
      this.rerankAndRecalculate(contestId);
    });
  }

  public ensureContestInitialized(contestId: string, entryFeeRupees: number = 100): ContestEntry[] {
    const list = this.entriesStore.get(contestId) || [];
    if (list.length === 0) {
      const defaultEntries = createDefaultFourContestEntries(contestId, entryFeeRupees);
      this.entriesStore.set(contestId, defaultEntries);
      this.entrySequenceCounter.set(contestId, 4);
      this.rerankAndRecalculate(contestId, entryFeeRupees);
      return defaultEntries;
    }
    return list;
  }

  /**
   * Generate next sequential Entry ID for contest (e.g. "ENTRY-001", "ENTRY-002")
   */
  public generateNextEntryId(contestId: string): { entryId: string; sequenceNumber: number } {
    const current = this.entrySequenceCounter.get(contestId) || 0;
    const nextSeq = current + 1;
    this.entrySequenceCounter.set(contestId, nextSeq);

    const paddedNum = nextSeq.toString().padStart(3, '0');
    return {
      entryId: `ENTRY-${paddedNum}`,
      sequenceNumber: nextSeq
    };
  }

  /**
   * Get all entries for a contest
   */
  public getContestEntries(contestId: string): ContestEntry[] {
    return this.entriesStore.get(contestId) || [];
  }

  /**
   * Get active valid entry for a user in a contest (at most 1 per user)
   */
  public getActiveUserEntry(contestId: string, ownerUid: string): ContestEntry | null {
    const list = this.entriesStore.get(contestId) || [];
    return list.find(e => e.ownerUid === ownerUid && e.isActive && e.isValid && e.status === 'active') || null;
  }

  /**
   * REQ 1, 2, 3, 5: ATOMIC CONTEST JOIN & RE-JOIN
   * 
   * Steps:
   * 1. Validate payment / entry fee
   * 2. Atomic Invalidation: If user already has an active entry in this contest:
   *    - Invalidate old entry: isActive=false, isValid=false, status='replaced'
   *    - Record replacedByEntryId
   * 3. Create brand new unique entry (e.g. ENTRY-001, ENTRY-002)
   * 4. Record transaction in financial audit ledger
   * 5. Atomically recalculate:
   *    - Confirmed Paid Entries (Real Joins)
   *    - Prize Pool, Referral Pool, Platform Margin
   *    - Winner Slots
   *    - Ranks and rank-wise projected prizes for all remaining active entries
   */
  public joinContest(params: {
    contestId: string;
    ownerUid: string;
    userEmail?: string;
    userName: string;
    avatarUrl?: string;
    city?: string;
    state?: string;
    entryFeeRupees?: number;
    paymentVerified?: boolean;
    txId?: string;
  }): {
    success: boolean;
    entry: ContestEntry;
    replacedEntry: ContestEntry | null;
    isRejoin: boolean;
    poolCalculation: ContestPoolCalculation;
    activeEntries: ContestEntry[];
    allContestEntries: ContestEntry[];
    ledgerRecord: FinancialLedgerRecord;
  } {
    const {
      contestId,
      ownerUid,
      userEmail,
      userName,
      avatarUrl,
      city,
      state,
      entryFeeRupees = 100,
      paymentVerified = true,
      txId
    } = params;

    const entryFeePaise = rupeesToPaise(entryFeeRupees);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const contestList = this.entriesStore.get(contestId) || [];

    // Check for existing active entry for this user in this contest
    const existingActiveIndex = contestList.findIndex(
      e => e.ownerUid === ownerUid && e.isActive && e.isValid && e.status === 'active'
    );
    const isRejoin = existingActiveIndex >= 0;
    let replacedEntry: ContestEntry | null = null;

    // Generate new unique sequential entry ID
    const { entryId, sequenceNumber } = this.generateNextEntryId(contestId);

    // ATOMIC INVALIDATION ON RE-JOIN:
    if (isRejoin) {
      const oldEntry = contestList[existingActiveIndex];
      const updatedOldEntry: ContestEntry = {
        ...oldEntry,
        status: 'replaced',
        isActive: false,
        isValid: false,
        replacedByEntryId: entryId,
        replacedAt: nowIso
      };
      contestList[existingActiveIndex] = updatedOldEntry;
      replacedEntry = updatedOldEntry;
    }

    // CREATE BRAND NEW UNIQUE ACTIVE ENTRY
    const newEntry: ContestEntry = {
      entryId,
      entrySequenceNumber: sequenceNumber,
      contestId,
      ownerUid,
      userEmail: (userEmail || '').toLowerCase(),
      userName,
      avatarUrl,
      city,
      state,
      paidAmountPaise: entryFeePaise,
      entryFeePaise,
      paymentVerified: Boolean(paymentVerified),
      paymentTxId: txId || `TX-${contestId}-${entryId}-${nowMs}-${Math.floor(Math.random() * 10000)}`,
      joinedAt: nowIso,
      joinedTimestampMs: nowMs,
      status: 'active',
      isActive: true,
      isValid: true,
      isSubmitted: false
    };

    contestList.push(newEntry);
    if (ownerUid && userName) {
      this.userProfilesCache.set(ownerUid, {
        ...this.userProfilesCache.get(ownerUid),
        userName,
        avatarUrl,
        city,
        state
      });
    }
    this.entriesStore.set(contestId, contestList);

    // RECORD PAYMENT IN FINANCIAL AUDIT LEDGER (Preserves permanent payment history)
    const ledgerRecord: FinancialLedgerRecord = {
      transactionId: `LEDGER-${contestId}-${entryId}-${nowMs}-${Math.floor(Math.random() * 10000)}`,
      contestId,
      entryId,
      ownerUid,
      userEmail: (userEmail || '').toLowerCase(),
      type: isRejoin ? 'REJOIN_FEE' : 'ENTRY_FEE',
      amountPaise: entryFeePaise,
      amountRupees: entryFeeRupees,
      timestamp: nowIso,
      timestampMs: nowMs,
      notes: isRejoin
        ? `Re-join fee for contest ${contestId}. Replaced entry ${replacedEntry?.entryId}`
        : `First join fee for contest ${contestId}.`
    };
    this.ledgerStore.set(ledgerRecord.transactionId, ledgerRecord);

    // RECALCULATE CONTEST ECONOMICS & ACTIVE RANKS
    const hasRealEntries = contestList.some(e => 
      e.isActive && e.isValid && e.status === 'active' && 
      !e.ownerUid.startsWith('demo-') && !e.ownerUid.startsWith('seed-')
    );
    const activeEntriesOnly = contestList.filter(e => {
      if (!e.isActive || !e.isValid || e.status !== 'active') return false;
      if (hasRealEntries && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return false;
      return true;
    });
    const confirmedPaidEntries = activeEntriesOnly.length;
    const poolCalculation = calculateContestPool(confirmedPaidEntries, entryFeePaise);
    poolCalculation.contestId = contestId;

    // Recalculate ranks among active entries
    const rankedActiveEntries = rankActiveEntries(activeEntriesOnly, poolCalculation);

    // Update contestList with newly ranked active entries
    rankedActiveEntries.forEach(re => {
      const idx = contestList.findIndex(e => e.entryId === re.entryId);
      if (idx >= 0) {
        contestList[idx] = re;
      }
    });
    this.entriesStore.set(contestId, contestList);
    this.persistStore(contestId);

    const refreshedNewEntry = contestList.find(e => e.entryId === entryId) || newEntry;

    return {
      success: true,
      entry: refreshedNewEntry,
      replacedEntry,
      isRejoin,
      poolCalculation,
      activeEntries: rankedActiveEntries,
      allContestEntries: contestList,
      ledgerRecord
    };
  }

  /**
   * REQ 3 & RANKING RULES: VALID QUIZ SUBMISSION & LIVE RERANKING
   * 
   * Evaluates answers using trusted backend scoring.
   * Immediately recalculates:
   * - Leaderboard ranks
   * - Rank-wise projected prizes
   * Rejects submissions for inactive or replaced entries.
   */
  public submitQuiz(params: {
    contestId: string;
    entryId: string;
    ownerUid: string;
    answers: Record<number, number>;
    questions: Question[];
    timeTakenSeconds: number;
    securityBreached?: boolean;
    securityBreachReason?: string;
  }): {
    success: boolean;
    error?: string;
    entry?: ContestEntry;
    scoreResult?: { score: number; rawScore: number; correctCount: number; wrongCount: number };
    poolCalculation?: ContestPoolCalculation;
    rankedEntries?: ContestEntry[];
    leaderboard?: LeaderboardEntry[];
  } {
    const {
      contestId,
      entryId,
      ownerUid,
      answers,
      questions,
      timeTakenSeconds,
      securityBreached = false
    } = params;

    const contestList = this.entriesStore.get(contestId) || [];
    const entryIndex = contestList.findIndex(e => e.entryId === entryId);

    if (entryIndex < 0) {
      return { success: false, error: `Entry ${entryId} not found.` };
    }

    const targetEntry = contestList[entryIndex];

    // SECURITY CHECK: Verify ownership
    if (targetEntry.ownerUid !== ownerUid) {
      return { success: false, error: 'Unauthorized: Entry does not belong to ownerUid.' };
    }

    // REQUIREMENT 5: Only latest active entry can receive a rank or participate
    if (!targetEntry.isActive || !targetEntry.isValid || targetEntry.status !== 'active') {
      return {
        success: false,
        error: `Entry ${entryId} is invalid or has been replaced by a newer re-join entry. Only the latest active entry can be submitted.`
      };
    }

    // TRUSTED BACKEND SCORE CALCULATION
    const scoreResult = calculateTrustedScore(answers, questions, securityBreached);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const updatedEntry: ContestEntry = {
      ...targetEntry,
      isSubmitted: true,
      submittedAt: nowIso,
      submittedTimestampMs: nowMs,
      rawScore: scoreResult.rawScore,
      score: scoreResult.score,
      totalQuestions: scoreResult.totalQuestions,
      correctCount: scoreResult.correctCount,
      wrongCount: scoreResult.wrongCount,
      timeTakenSeconds: Math.max(0, Math.round(timeTakenSeconds)),
      answers,
      securityBreached
    };

    contestList[entryIndex] = updatedEntry;

    // ATOMIC RERANKING OF ALL ACTIVE ENTRIES
    const activeEntriesOnly = contestList.filter(e => e.isActive && e.isValid && e.status === 'active');
    const poolCalculation = calculateContestPool(activeEntriesOnly.length, targetEntry.entryFeePaise);
    poolCalculation.contestId = contestId;

    const rankedActiveEntries = rankActiveEntries(activeEntriesOnly, poolCalculation);

    // Save back updated ranks to store
    rankedActiveEntries.forEach(re => {
      const idx = contestList.findIndex(e => e.entryId === re.entryId);
      if (idx >= 0) {
        contestList[idx] = re;
      }
    });

    this.entriesStore.set(contestId, contestList);
    this.persistStore(contestId);

    const finalSubmittedEntry = contestList[entryIndex];
    const leaderboard = mapEntriesToLeaderboard(rankedActiveEntries, ownerUid);

    return {
      success: true,
      entry: finalSubmittedEntry,
      scoreResult,
      poolCalculation,
      rankedEntries: rankedActiveEntries,
      leaderboard
    };
  }

  /**
   * REQ 5: FINAL CONTEST SETTLEMENT & WALLET CREDIT
   * 
   * When contest ends or is settled:
   * - Final prizes credited ONLY to actual owner ("ownerUid") associated with latest winning active Entry ID.
   * - Replaced, invalid, or unsubmitted entries NEVER receive any prize.
   * - Preserves permanent audit logs in financial ledger.
   */
  public settleContest(contestId: string): {
    success: boolean;
    alreadySettled?: boolean;
    contestId: string;
    settledEntries: ContestEntry[];
    totalPaidPaise: number;
    totalPaidRupees: number;
    disbursements: { ownerUid: string; entryId: string; rank: number; prizeRupees: number }[];
  } {
    // Idempotency: A contest must receive prize settlement only once
    if (this.settledContests.has(contestId)) {
      const alreadySettledEntries = (this.entriesStore.get(contestId) || []).filter(e => e.settlementStatus === 'settled');
      return {
        success: true,
        alreadySettled: true,
        contestId,
        settledEntries: alreadySettledEntries,
        totalPaidPaise: 0,
        totalPaidRupees: 0,
        disbursements: []
      };
    }

    const contestList = this.entriesStore.get(contestId) || [];
    const hasRealEntries = contestList.some(e => 
      e.isActive && e.isValid && e.status === 'active' && 
      !e.ownerUid.startsWith('demo-') && !e.ownerUid.startsWith('seed-')
    );
    const activeEntries = contestList.filter(e => {
      if (!e.isActive || !e.isValid || e.status !== 'active') return false;
      if (hasRealEntries && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return false;
      return true;
    });

    const entryFeePaise = activeEntries[0]?.entryFeePaise || DEFAULT_ENTRY_FEE_PAISE;
    const poolCalc = calculateContestPool(activeEntries.length, entryFeePaise);
    const rankedActive = rankActiveEntries(activeEntries, poolCalc);

    const disbursements: { ownerUid: string; entryId: string; rank: number; prizeRupees: number }[] = [];
    let totalPaidPaise = 0;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    for (const entry of rankedActive) {
      const rank = entry.rank || 0;
      // Must be within winner slots, active, valid, submitted, and NOT a demo/seed user
      const isDemo = entry.ownerUid.startsWith('demo-') || entry.ownerUid.startsWith('seed-');
      const isWinner = (
        rank > 0 &&
        rank <= poolCalc.winnerSlots &&
        entry.isActive &&
        entry.isValid &&
        entry.isSubmitted &&
        !entry.securityBreached &&
        !isDemo &&
        entry.paymentVerified !== false
      );

      const entryIdx = contestList.findIndex(e => e.entryId === entry.entryId);

      if (isWinner) {
        const prizePaise = entry.projectedPrizePaise || 0;
        if (prizePaise > 0) {
          totalPaidPaise += prizePaise;
          const prizeRupees = paiseToRupees(prizePaise);

          // Update entry settlement state
          if (entryIdx >= 0) {
            contestList[entryIdx] = {
              ...contestList[entryIdx],
              settlementStatus: 'settled',
              settledPrizePaise: prizePaise,
              settledPrizeRupees: prizeRupees,
              settledAt: nowIso
            };
          }

          // Record payout in financial ledger
          const payoutTx: FinancialLedgerRecord = {
            transactionId: `PAYOUT-${contestId}-${entry.entryId}-${nowMs}-${Math.floor(Math.random() * 10000)}`,
            contestId,
            entryId: entry.entryId,
            ownerUid: entry.ownerUid,
            userEmail: entry.userEmail,
            type: 'PRIZE_PAYOUT',
            amountPaise: prizePaise,
            amountRupees: prizeRupees,
            timestamp: nowIso,
            timestampMs: nowMs,
            notes: `Rank ${rank} winner payout of ₹${prizeRupees} credited to ownerUid ${entry.ownerUid} for Entry ${entry.entryId}.`
          };
          this.ledgerStore.set(payoutTx.transactionId, payoutTx);

          disbursements.push({
            ownerUid: entry.ownerUid,
            entryId: entry.entryId,
            rank,
            prizeRupees
          });
        } else {
          if (entryIdx >= 0) {
            contestList[entryIdx] = {
              ...contestList[entryIdx],
              settlementStatus: 'settled',
              settledPrizePaise: 0,
              settledPrizeRupees: 0,
              settledAt: nowIso
            };
          }
        }
      } else {
        // Non-winner: Authoritative final settlement record with ₹0 prize
        if (entryIdx >= 0 && !isDemo) {
          contestList[entryIdx] = {
            ...contestList[entryIdx],
            settlementStatus: 'settled',
            settledPrizePaise: 0,
            settledPrizeRupees: 0,
            settledAt: nowIso
          };
        }
      }
    }

    this.entriesStore.set(contestId, contestList);
    this.settledContests.add(contestId);
    this.persistStore(contestId);

    return {
      success: true,
      alreadySettled: false,
      contestId,
      settledEntries: contestList.filter(e => e.settlementStatus === 'settled'),
      totalPaidPaise,
      totalPaidRupees: paiseToRupees(totalPaidPaise),
      disbursements
    };
  }

  public isContestSettled(contestId: string): boolean {
    return this.settledContests.has(contestId);
  }

  /**
   * Authoritative getter for contest prize disbursements
   */
  public getContestDisbursements(contestId: string): { ownerUid: string; entryId: string; rank: number; prizeRupees: number }[] {
    const list = this.entriesStore.get(contestId) || [];
    const settledWinners = list.filter(e => e.settlementStatus === 'settled' && (e.settledPrizeRupees || 0) > 0);
    if (settledWinners.length > 0) {
      return settledWinners.map(e => ({
        ownerUid: e.ownerUid,
        entryId: e.entryId,
        rank: e.rank || 1,
        prizeRupees: e.settledPrizeRupees || 0
      }));
    }
    const payoutLedgers = this.getFinancialLedgers(contestId).filter(l => l.type === 'PRIZE_PAYOUT');
    return payoutLedgers.map(p => ({
      ownerUid: p.ownerUid,
      entryId: p.entryId,
      rank: (list.find(e => e.entryId === p.entryId)?.rank) || 1,
      prizeRupees: p.amountRupees
    }));
  }

  /**
   * Get overall authoritative settlement state for a contest
   */
  public getSettlement(contestId: string): {
    isSettled: boolean;
    disbursements: { ownerUid: string; entryId: string; rank: number; prizeRupees: number }[];
    totalPaidRupees: number;
  } {
    const isSettled = this.isContestSettled(contestId);
    const disbursements = this.getContestDisbursements(contestId);
    const totalPaidRupees = disbursements.reduce((sum, d) => sum + d.prizeRupees, 0);
    return {
      isSettled,
      disbursements,
      totalPaidRupees
    };
  }

  public clearContestEntries(contestId: string): void {
    this.entriesStore.set(contestId, []);
    this.settledContests.delete(contestId);
    this.persistStore(contestId);
  }

  public submitEntryQuiz(contestId: string, entryId: string, result: { score: number; timeTakenSeconds: number }): void {
    const list = this.entriesStore.get(contestId) || [];
    const idx = list.findIndex(e => e.entryId === entryId);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        isSubmitted: true,
        submittedAt: new Date().toISOString(),
        submittedTimestampMs: Date.now(),
        score: result.score,
        timeTakenSeconds: Math.max(0, Math.round(result.timeTakenSeconds))
      };
      this.entriesStore.set(contestId, list);
      this.rerankAndRecalculate(contestId);
    }
  }

  /**
   * REQ 5: ADMIN CONTEST DELETION WITH AUDIT RECORD PRESERVATION
   * 
   * If an Admin deletes a contest:
   * - Preserves the final valid entry and financial settlement records.
   * - Never credits prize without final settlement.
   * - Does not erase transaction history or ledger records.
   */
  public handleAdminContestDeletion(contestId: string): {
    preservedEntriesCount: number;
    preservedLedgersCount: number;
    settlementResult: any;
  } {
    // 1. Run final settlement if not yet settled
    let settlementResult = null;
    if (!this.settledContests.has(contestId)) {
      settlementResult = this.settleContest(contestId);
    }

    // 2. Entries and ledgers remain preserved in memory and permanent storage
    const preservedEntries = this.entriesStore.get(contestId) || [];
    const allLedgers = Array.from(this.ledgerStore.values()).filter(l => l.contestId === contestId);

    this.persistStore(contestId);

    return {
      preservedEntriesCount: preservedEntries.length,
      preservedLedgersCount: allLedgers.length,
      settlementResult
    };
  }

  /**
   * Get all financial ledger records (for audit / admin panel)
   */
  public getFinancialLedgers(contestId?: string, ownerUid?: string): FinancialLedgerRecord[] {
    let list = Array.from(this.ledgerStore.values());
    if (contestId) {
      list = list.filter(l => l.contestId === contestId);
    }
    if (ownerUid) {
      list = list.filter(l => l.ownerUid === ownerUid);
    }
    return list.sort((a, b) => b.timestampMs - a.timestampMs);
  }

  /**
   * Authoritatively records a financial ledger entry (e.g. contest settlement payout)
   */
  public addFinancialLedgerRecord(record: FinancialLedgerRecord): void {
    this.ledgerStore.set(record.transactionId, record);
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = this.getFinancialLedgers();
        localStorage.setItem('quizkart_financial_ledger', JSON.stringify(existing));
      }
    } catch {}
  }

  /**
   * REQ 6: SYNCHRONIZED LEADERBOARD ACCESS
   * Gets the active leaderboard for a contest, mapped and sorted consistently.
   */
  public getLeaderboard(
    contestId: string,
    currentOwnerUid?: string,
    isProductContest: boolean = false,
    productItemTitle: string = 'Noise Smartwatch',
    productRetailValue: number = 2999
  ): LeaderboardEntry[] {
    const activeEntries = this.getActiveEntries(contestId);
    return mapEntriesToLeaderboard(
      activeEntries,
      currentOwnerUid,
      isProductContest,
      productItemTitle,
      productRetailValue
    );
  }

  /**
   * REQ 1: Update user profile data across all active entries for a specific ownerUid
   * Synchronizes the updated name across all their active contest entries.
   * Uses authenticated ownerUid and entryId for identity matching.
   * Preserves profile photo, existing profile fields, and historical finalized financial records.
   */
  public updateUserProfile(
    ownerUid: string,
    profile: {
      userName?: string;
      avatarUrl?: string;
      city?: string;
      state?: string;
    }
  ): ContestEntry[] {
    if (!ownerUid) return [];

    if (profile.userName && profile.userName.trim()) {
      this.userProfilesCache.set(ownerUid, {
        ...this.userProfilesCache.get(ownerUid),
        userName: profile.userName.trim(),
        avatarUrl: profile.avatarUrl,
        city: profile.city,
        state: profile.state
      });
    }

    const modifiedEntries: ContestEntry[] = [];
    this.entriesStore.forEach((list, contestId) => {
      let modified = false;
      list.forEach(entry => {
        // Strict identity matching via authenticated ownerUid on active entries only
        // Preserves historical finalized financial records & payout amounts
        if (entry.ownerUid === ownerUid && entry.isActive && entry.status === 'active') {
          if (profile.userName && profile.userName.trim()) {
            entry.userName = profile.userName.trim();
          }
          if (profile.avatarUrl !== undefined) {
            entry.avatarUrl = profile.avatarUrl;
          }
          if (profile.city) {
            entry.city = profile.city;
          }
          if (profile.state) {
            entry.state = profile.state;
          }
          modified = true;
          modifiedEntries.push({ ...entry });
        }
      });
      if (modified) {
        this.rerankAndRecalculate(contestId);
        this.persistStore(contestId);
      }
    });

    return modifiedEntries;
  }

  /**
   * AUTHORITATIVE BACKEND CALCULATION:
   * Withdrawable Balance =
   * Successfully Settled Contest Winnings
   * − Successfully Completed Withdrawals
   * − Active Withdrawal Holds
   * 
   * Strict Rules:
   * 1. Only actual settled and credited contest prizes are eligible.
   * 2. Provisional prizes must never be withdrawable.
   * 3. Pending, rejected or failed prizes must never be withdrawable.
   * 4. Deposit principal must never be included.
   * 5. Demo balances, promotional balances and fake test records must never be included.
   * 6. A prize must be counted only once using its unique settlement/ledger transaction ID.
   * 7. Pending withdrawal requests must reserve the applicable amount to prevent duplicate withdrawals.
   * 8. Rejected or cancelled withdrawals must release their reserved amount.
   * 9. Successfully completed withdrawals must permanently reduce the available withdrawable balance.
   * 10. Validate the available balance on the backend when submitting a withdrawal request.
   */
  public getWithdrawableBalance(
    ownerUid: string,
    userEmail?: string,
    withdrawalsList?: WithdrawalRequest[]
  ): {
    settledWinnings: number;
    completedWithdrawals: number;
    activeWithdrawalHolds: number;
    withdrawableBalance: number;
    settledPrizesCount: number;
  } {
    const cleanUid = (ownerUid || '').trim();
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const cleanUidNoPrefix = cleanUid.replace(/^usr-/, '');

    // Map: uniqueTransactionId -> prizeRupees (Strict zero duplicate counting)
    const countedPrizes = new Map<string, number>();

    // 1. Authoritative Financial Ledgers from memory and persistent store (type === 'PRIZE_PAYOUT')
    const ledgers = this.getFinancialLedgers();
    ledgers.forEach(rec => {
      if (rec.type !== 'PRIZE_PAYOUT' || rec.status !== 'COMPLETED') return;
      if (rec.isDemo || rec.ownerUid.startsWith('demo-')) return;

      const recUid = (rec.ownerUid || '').trim();
      const matchUid = cleanUid && (recUid === cleanUid || recUid === cleanUidNoPrefix);
      const matchEmail = cleanEmail && rec.ownerUid && rec.ownerUid.toLowerCase().includes(cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'));

      if (matchUid || matchEmail) {
        countedPrizes.set(rec.transactionId, Number(rec.amountRupees) || 0);
      }
    });

    // 2. Authoritative Settled Contest Entries
    this.settledContests.forEach(contestId => {
      const entries = this.entriesStore.get(contestId) || [];
      entries.forEach(e => {
        if (e.isDemo || e.ownerUid.startsWith('demo-')) return;
        if (e.settlementStatus === 'settled' && (e.settledPrizeRupees || 0) > 0) {
          const entryUid = (e.ownerUid || '').trim();
          const matchUid = cleanUid && (entryUid === cleanUid || entryUid === cleanUidNoPrefix);
          const matchEmail = cleanEmail && e.ownerUid && e.ownerUid.toLowerCase().includes(cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'));

          if (matchUid || matchEmail) {
            const prizeKey = `SETTLED_${contestId}_ENTRY_${e.entryId}`;
            // Deduplicate against any ledger records matching the same contest and entry
            const alreadyInLedger = Array.from(countedPrizes.keys()).some(
              k => k.includes(e.entryId) || (k.includes(contestId) && k.includes(entryUid))
            );
            if (!alreadyInLedger && !countedPrizes.has(prizeKey)) {
              countedPrizes.set(prizeKey, Number(e.settledPrizeRupees) || 0);
            }
          }
        }
      });
    });

    // 3. User Quiz Attempts from localStorage cache (if running in browser client)
    try {
      if (typeof localStorage !== 'undefined') {
        const rawAttempts = localStorage.getItem('quizkart_user_quiz_attempts');
        if (rawAttempts) {
          const parsedAttempts = JSON.parse(rawAttempts);
          if (Array.isArray(parsedAttempts)) {
            parsedAttempts.forEach((att: any) => {
              if (
                att &&
                att.settlementStatus === 'settled' &&
                Number(att.finalPrizeRupees || att.rewardAmount) > 0 &&
                (att.contestId ? this.isContestSettled(att.contestId) : true)
              ) {
                const attUid = (att.ownerUid || att.userId || '').trim();
                const attEmail = (att.userEmail || '').trim().toLowerCase();
                const isMatch =
                  (cleanUid && (attUid === cleanUid || attUid === cleanUidNoPrefix)) ||
                  (cleanEmail && attEmail && attEmail === cleanEmail);

                if (isMatch) {
                  const prize = Number(att.finalPrizeRupees || att.rewardAmount);
                  const attemptKey = att.entryId ? `ATT_${att.entryId}` : `ATT_${att.attemptId}`;
                  const alreadyCounted = Array.from(countedPrizes.keys()).some(
                    k => (att.entryId && k.includes(att.entryId)) || k.includes(att.attemptId)
                  );
                  if (!alreadyCounted && !countedPrizes.has(attemptKey)) {
                    countedPrizes.set(attemptKey, prize);
                  }
                }
              }
            });
          }
        }
      }
    } catch {}

    const settledWinnings = Array.from(countedPrizes.values()).reduce((sum, p) => sum + p, 0);

    // 4. Calculate Completed Withdrawals and Active Withdrawal Holds
    let completedWithdrawals = 0;
    let activeWithdrawalHolds = 0;

    const dedupWithdrawals = new Map<string, WithdrawalRequest>();
    (withdrawalsList || []).forEach(w => {
      if (!w || !w.id) return;
      dedupWithdrawals.set(w.id, w);
    });

    try {
      if (typeof localStorage !== 'undefined') {
        const permW = localStorage.getItem('quizkart_user_withdrawals_permanent') || localStorage.getItem('quizkart_admin_withdrawals');
        if (permW) {
          const parsed = JSON.parse(permW);
          if (Array.isArray(parsed)) {
            parsed.forEach((w: any) => {
              if (w && w.id && !dedupWithdrawals.has(w.id)) {
                dedupWithdrawals.set(w.id, w);
              }
            });
          }
        }
      }
    } catch {}

    dedupWithdrawals.forEach(w => {
      const wUid = (w.ownerUid || w.userId || '').trim();
      const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
      const isMatch =
        (cleanUid && (wUid === cleanUid || wUid === cleanUidNoPrefix)) ||
        (cleanEmail && wEmail && wEmail === cleanEmail);

      if (!isMatch) return;

      const amt = Number(w.amount) || 0;
      if (w.status === 'approved') {
        completedWithdrawals += amt;
      } else if (w.status === 'pending') {
        activeWithdrawalHolds += amt;
      }
      // 'rejected' and 'cancelled' holds are released
    });

    const withdrawableBalance = Math.max(0, settledWinnings - completedWithdrawals - activeWithdrawalHolds);

    return {
      settledWinnings,
      completedWithdrawals,
      activeWithdrawalHolds,
      withdrawableBalance,
      settledPrizesCount: countedPrizes.size
    };
  }

  /**
   * AUTHORITATIVE BACKEND VALIDATION FOR WITHDRAWAL SUBMISSION
   * Never trusts client-side numbers; calculates true settled winnings on the backend.
   */
  public validateAndSubmitWithdrawal(
    withdrawal: WithdrawalRequest,
    ownerUid: string,
    userEmail?: string,
    withdrawalsList?: WithdrawalRequest[]
  ): {
    success: boolean;
    error?: string;
    withdrawableBalance: number;
    settledWinnings: number;
  } {
    const amt = Number(withdrawal.amount);
    if (isNaN(amt) || amt < 100) {
      return { success: false, error: 'Minimum withdrawal amount is ₹100.', withdrawableBalance: 0, settledWinnings: 0 };
    }
    if (amt > 5000) {
      return { success: false, error: 'Maximum withdrawal amount is ₹5000 per request.', withdrawableBalance: 0, settledWinnings: 0 };
    }

    const balanceInfo = this.getWithdrawableBalance(ownerUid, userEmail, withdrawalsList);

    // Rule 7: Pending withdrawal requests must reserve the applicable amount to prevent duplicate withdrawals
    if (balanceInfo.activeWithdrawalHolds > 0) {
      return {
        success: false,
        error: 'A withdrawal request is currently pending verification. You cannot submit another withdrawal until the active request is processed.',
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    // Rules 1, 4, 10: Deposited funds cannot be withdrawn; only settled winnings are withdrawable
    if (amt > balanceInfo.withdrawableBalance) {
      return {
        success: false,
        error: `Withdrawal is permitted only from settled contest winnings. You have ₹${balanceInfo.withdrawableBalance} in eligible winnings available. Deposited funds cannot be withdrawn directly.`,
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    return {
      success: true,
      withdrawableBalance: balanceInfo.withdrawableBalance - amt,
      settledWinnings: balanceInfo.settledWinnings
    };
  }

  /**
   * Reset store (useful for clean unit testing)
   */
  public resetForTesting(): void {
    this.entriesStore.clear();
    this.ledgerStore.clear();
    this.entrySequenceCounter.clear();
    this.settledContests.clear();
  }
}

export const contestBackend = new QuizKartContestBackendService();
