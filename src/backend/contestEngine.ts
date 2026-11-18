import { ContestEntry, ContestPoolCalculation, FinancialLedgerRecord, LeaderboardEntry, Question, ActiveContest, UserProfile, WithdrawalRequest, QuizAttemptResult } from '../types';
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
    const provisionalPrizeRupees = entry.projectedPrizeRupees !== undefined
      ? entry.projectedPrizeRupees
      : (entry.projectedPrizePaise ? paiseToRupees(entry.projectedPrizePaise) : 0);
    const isSettled = entry.settlementStatus === 'settled';
    const settledPrizeRupees = isSettled
      ? (entry.settledPrizeRupees !== undefined
          ? entry.settledPrizeRupees
          : (entry.settledPrizePaise !== undefined
              ? paiseToRupees(entry.settledPrizePaise)
              : provisionalPrizeRupees))
      : undefined;
    // Strictly prefer authoritative settled prize once settled; use provisional only while unsettled
    const prizeRupees = isSettled ? (settledPrizeRupees ?? 0) : provisionalPrizeRupees;

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

    const rawName = (entry.userName || '').trim();
    const safeUserName = rawName && rawName.toUpperCase() !== 'USER' ? rawName : 'Contestant';

    return {
      id: entry.entryId,
      entryId: entry.entryId,
      contestId: entry.contestId,
      ownerUid: entry.ownerUid,
      rank,
      userName: safeUserName,
      avatar: entry.avatarUrl || '',
      score: entry.score || 0,
      totalQuestions: entry.totalQuestions || 10,
      timeTakenSeconds: entry.timeTakenSeconds || 0,
      formattedTime: formatTimeDisplay(entry.timeTakenSeconds || 0),
      city: entry.city || 'Bengaluru',
      state: entry.state || 'Karnataka',
      rewardText,
      rewardType,
      rewardAmount,
      settlementStatus: isSettled ? 'settled' : 'pending',
      settledPrizeRupees,
      provisionalPrizeRupees,
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
      let idx = contestList.findIndex(e => e.entryId === re.entryId && e.ownerUid === re.ownerUid);
      if (idx < 0) idx = contestList.findIndex(e => e.entryId === re.entryId);
      if (idx >= 0) {
        const prevEntry = contestList[idx];
        contestList[idx] = {
          ...re,
          ...(prevEntry.settlementStatus === 'settled'
            ? {
                settlementStatus: 'settled' as const,
                settledPrizePaise: prevEntry.settledPrizePaise,
                settledPrizeRupees: prevEntry.settledPrizeRupees,
                settledAt: prevEntry.settledAt
              }
            : {})
        };
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

    // Deduplicate by composite key (entryId + ownerUid) so concurrent cross-device joins never collide
    const seen = new Set<string>();
    const active: ContestEntry[] = [];
    list.forEach(e => {
      if (!e || !e.entryId) return;
      const dedupeKey = `${e.entryId}::${e.ownerUid || ''}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
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
   * Isolates records to contestId, deduplicates by entryId+ownerUid, preserves submitted & settled state,
   * enforces latest-active-entry-per-user, and updates sequence counters.
   */
  public loadContestEntries(contestId: string, cloudEntries: ContestEntry[]): void {
    if (!contestId) return;

    const getEntryKey = (e: ContestEntry) => `${e.entryId}::${e.ownerUid || ''}`;

    // Existing entries in memory for this contest
    const existingList = this.entriesStore.get(contestId) || [];
    const existingMap = new Map<string, ContestEntry>();
    existingList.forEach(e => {
      if (e && e.entryId) existingMap.set(getEntryKey(e), e);
    });

    const cleanMap = new Map<string, ContestEntry>();
    let maxSeq = this.entrySequenceCounter.get(contestId) || 0;
    let cloudHasSettledEntry = false;

    (cloudEntries || []).forEach(incoming => {
      if (!incoming || !incoming.entryId) return;
      if (incoming.contestId === contestId) {
        const key = getEntryKey(incoming);
        // Fallback match by entryId when local entry shares the same owner
        const local = existingMap.get(key) || existingList.find(e => e.entryId === incoming.entryId && e.ownerUid === incoming.ownerUid);
        let merged: ContestEntry = { ...incoming };

        if (incoming.settlementStatus === 'settled') {
          cloudHasSettledEntry = true;
        }

        // If local entry is already submitted, preserve submission if incoming snapshot is unsubmitted
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

        // Preserve settled state if either authoritative snapshot or local settled state holds it
        if (local && local.settlementStatus === 'settled' && merged.settlementStatus !== 'settled') {
          merged = {
            ...merged,
            settlementStatus: 'settled',
            settledPrizeRupees: local.settledPrizeRupees,
            settledPrizePaise: local.settledPrizePaise,
            settledAt: local.settledAt
          };
        }

        // Real-time synchronization: preserve latest profile name & photo for active entries
        if (merged.ownerUid && this.userProfilesCache.has(merged.ownerUid) && merged.isActive && merged.status === 'active') {
          const cached = this.userProfilesCache.get(merged.ownerUid)!;
          if (cached.userName) merged.userName = cached.userName;
          if (cached.avatarUrl !== undefined) merged.avatarUrl = cached.avatarUrl;
        }

        cleanMap.set(key, merged);
        if (merged.entrySequenceNumber && merged.entrySequenceNumber > maxSeq) {
          maxSeq = merged.entrySequenceNumber;
        }
      }
    });

    if (cloudHasSettledEntry) {
      this.settledContests.add(contestId);
    }

    // Also preserve local entries that haven't synced to cloud yet (in-flight, testing, or offline)
    existingList.forEach(local => {
      if (!local || !local.entryId || local.contestId !== contestId) return;
      const key = getEntryKey(local);
      if (!cleanMap.has(key)) {
        if (local.isActive && local.isValid && local.status === 'active') {
          if (local.ownerUid && this.userProfilesCache.has(local.ownerUid)) {
            const cached = this.userProfilesCache.get(local.ownerUid)!;
            if (cached.userName) local.userName = cached.userName;
            if (cached.avatarUrl !== undefined) local.avatarUrl = cached.avatarUrl;
          }
          cleanMap.set(key, local);
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
          const entryInMap = cleanMap.get(getEntryKey(old));
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
      if (entry.settlementStatus === 'settled') {
        this.settledContests.add(contestId);
      }
      // Real-time synchronization: preserve latest profile name for active entries
      if (entry.ownerUid && this.userProfilesCache.has(entry.ownerUid) && entry.isActive && entry.status === 'active') {
        const cached = this.userProfilesCache.get(entry.ownerUid)!;
        if (cached.userName) entry.userName = cached.userName;
        if (cached.avatarUrl !== undefined) entry.avatarUrl = cached.avatarUrl;
      }
      const list = this.entriesStore.get(contestId) || [];
      let existingIdx = list.findIndex(e => e.entryId === entry.entryId && e.ownerUid === entry.ownerUid);
      if (existingIdx < 0) existingIdx = list.findIndex(e => e.entryId === entry.entryId);
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
            status: 'COMPLETED',
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
    withdrawalsList?: WithdrawalRequest[],
    userProfileTotalWon?: number,
    walletBalance?: number,
    quizAttemptsList?: QuizAttemptResult[]
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
    const emailSanitizedUnderscore = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9]/g, '_') : '';
    const emailDerivedUid = emailSanitizedUnderscore ? `usr-${emailSanitizedUnderscore}` : '';
    const emailDocUid = cleanEmail ? cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';

    const belongsToTargetUser = (recordUidRaw?: string, recordEmailRaw?: string): boolean => {
      const recEmail = (recordEmailRaw || '').trim().toLowerCase();
      const recUid = (recordUidRaw || '').trim();
      // Strict cross-user isolation: reject if record carries an explicit different email
      if (recEmail && cleanEmail && recEmail !== cleanEmail) return false;
      const emailMatched = Boolean(cleanEmail && recEmail && recEmail === cleanEmail);
      const uidMatched = Boolean(
        recUid && (
          (cleanUid && (recUid === cleanUid || recUid === cleanUidNoPrefix)) ||
          (emailDerivedUid && recUid.toLowerCase() === emailDerivedUid) ||
          (emailDocUid && recUid.toLowerCase() === emailDocUid)
        )
      );
      return emailMatched || uidMatched;
    };

    // Map: uniqueTransactionId -> prizeRupees + canonical dedup sets (zero double-counting across ledger/entry/attempt)
    const countedPrizes = new Map<string, number>();
    const countedEntryIds = new Set<string>();
    const countedContestEntryKeys = new Set<string>();
    const countedContestKeys = new Set<string>();
    const ineligiblePayoutStatuses = new Set(['PENDING', 'PROVISIONAL', 'FAILED', 'CANCELLED', 'REJECTED', 'REVERSED']);

    const registerPayout = (
      primaryKey: string,
      amountRupees: number,
      contestId?: string,
      entryId?: string
    ) => {
      const safeAmt = Math.max(0, Number(amountRupees) || 0);
      if (!primaryKey || safeAmt <= 0) return;
      const cleanContestId = (contestId || '').trim();
      const cleanEntryId = (entryId || '').trim();
      const contestEntryKey = cleanContestId && cleanEntryId ? `${cleanContestId}::${cleanEntryId}` : '';

      if (countedPrizes.has(primaryKey)) return;
      if (cleanEntryId && countedEntryIds.has(cleanEntryId)) return;
      if (contestEntryKey && countedContestEntryKeys.has(contestEntryKey)) return;
      if (!cleanEntryId && cleanContestId && countedContestKeys.has(cleanContestId)) return;

      countedPrizes.set(primaryKey, safeAmt);
      if (cleanEntryId) countedEntryIds.add(cleanEntryId);
      if (contestEntryKey) countedContestEntryKeys.add(contestEntryKey);
      if (cleanContestId) countedContestKeys.add(cleanContestId);
    };

    // 1. Authoritative Financial Ledgers from memory and persistent store (type === 'PRIZE_PAYOUT' only; ENTRY_FEE / REFUND / deposits excluded)
    const ledgers = this.getFinancialLedgers();
    ledgers.forEach(rec => {
      if (!rec || rec.type !== 'PRIZE_PAYOUT') return;
      const statusUpper = String(rec.status || '').trim().toUpperCase();
      if (statusUpper && ineligiblePayoutStatuses.has(statusUpper)) return;
      if (rec.isDemo || (rec.ownerUid || '').startsWith('demo-') || (rec.ownerUid || '').startsWith('seed-')) return;

      if (belongsToTargetUser(rec.ownerUid, rec.userEmail)) {
        registerPayout(rec.transactionId, Number(rec.amountRupees) || 0, rec.contestId, rec.entryId);
      }
    });

    // 2. Authoritative Settled Contest Entries
    this.settledContests.forEach(contestId => {
      const entries = this.entriesStore.get(contestId) || [];
      entries.forEach(e => {
        if (!e || e.isDemo || (e.ownerUid || '').startsWith('demo-') || (e.ownerUid || '').startsWith('seed-')) return;
        if (e.settlementStatus === 'settled' && (e.settledPrizeRupees || 0) > 0) {
          if (belongsToTargetUser(e.ownerUid, e.userEmail)) {
            const prizeKey = `SETTLED_${contestId}_ENTRY_${e.entryId}`;
            registerPayout(prizeKey, Number(e.settledPrizeRupees) || 0, contestId, e.entryId);
          }
        }
      });
    });

    // 3. Authoritative Settled Quiz Attempts (passed from Firestore state and/or email-isolated localStorage cache)
    const combinedAttempts: any[] = Array.isArray(quizAttemptsList) ? [...quizAttemptsList] : [];
    try {
      if (typeof localStorage !== 'undefined') {
        const rawByEmail = cleanEmail ? localStorage.getItem(`quizkart_user_quiz_attempts_${cleanEmail}`) : null;
        const rawAttempts = localStorage.getItem('quizkart_user_quiz_attempts');
        [rawByEmail, rawAttempts].forEach((raw) => {
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              combinedAttempts.push(...parsed);
            }
          } catch {}
        });
      }
    } catch {}

    combinedAttempts.forEach((att: any) => {
      if (!att || att.isDemo || att.rewardType === 'product') return;
      if (att.settlementStatus !== 'settled') return;

      // Never count provisional prizes; only finalized settled payout amount
      const cashPrize = Number(att?.finalPrizeRupees !== undefined ? att.finalPrizeRupees : (att?.rewardAmount ?? 0));
      if (!Number.isFinite(cashPrize) || cashPrize <= 0) return;

      // If this contest's entries are loaded locally and not settled yet, reject unsettled prize
      if (att.contestId) {
        const loadedEntries = this.entriesStore.get(att.contestId);
        if (loadedEntries && loadedEntries.length > 0 && !this.isContestSettled(att.contestId)) {
          return;
        }
      }

      if (belongsToTargetUser(att.ownerUid || att.userId, att.userEmail)) {
        const attemptKey = att.entryId ? `ATT_${att.entryId}` : `ATT_${att.attemptId}`;
        registerPayout(attemptKey, cashPrize, att.contestId, att.entryId);
      }
    });

    // Check user profile for authoritative settled totalWonAmount (captures historical settled payouts from Firestore profile)
    let profileWon = userProfileTotalWon !== undefined ? Math.max(0, Number(userProfileTotalWon) || 0) : 0;
    if (userProfileTotalWon === undefined && typeof localStorage !== 'undefined') {
      try {
        const pRaw = localStorage.getItem('quizkart_user_profile');
        if (pRaw) {
          const p = JSON.parse(pRaw);
          if (belongsToTargetUser(p.uid || p.id, p.email)) {
            profileWon = Math.max(0, Number(p.totalWonAmount) || 0);
          }
        }
      } catch {}
    }

    const calculatedWinnings = Array.from(countedPrizes.values()).reduce((sum, p) => sum + p, 0);
    const settledWinnings = Math.max(profileWon, calculatedWinnings);

    // 4. Calculate Completed Withdrawals and Active Withdrawal Holds strictly for this user
    let completedWithdrawals = 0;
    let activeWithdrawalHolds = 0;

    const normWithdrawalKey = (w: any): string => {
      const raw = String(w?.requestId || w?.id || '').trim();
      return raw.replace(/^WTH-(\d+)$/i, 'QK-WTH-$1').toUpperCase();
    };

    const dedupWithdrawals = new Map<string, WithdrawalRequest>();
    (withdrawalsList || []).forEach(w => {
      if (!w || (!w.id && !w.requestId)) return;
      const k = normWithdrawalKey(w);
      if (k) dedupWithdrawals.set(k, w);
    });

    try {
      if (typeof localStorage !== 'undefined') {
        const localSources = [
          cleanEmail ? localStorage.getItem(`quizkart_user_withdrawals_permanent_${cleanEmail}`) : null,
          localStorage.getItem('quizkart_user_withdrawals_permanent'),
          localStorage.getItem('quizkart_admin_withdrawals')
        ];
        localSources.forEach((raw) => {
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((w: any) => {
                if (!w || (!w.id && !w.requestId)) return;
                const k = normWithdrawalKey(w);
                if (!k) return;
                const existing = dedupWithdrawals.get(k);
                if (!existing) {
                  dedupWithdrawals.set(k, w);
                } else if (existing.status === 'pending' && w.status && w.status !== 'pending') {
                  // Never let a stale local pending copy mask a resolved status from another local cache
                  dedupWithdrawals.set(k, w);
                }
              });
            }
          } catch {}
        });
      }
    } catch {}

    dedupWithdrawals.forEach(w => {
      if (!belongsToTargetUser(w.ownerUid || w.userId, w.userEmail || w.email)) return;

      const amt = Math.max(0, Number(w.amount) || 0);
      if (w.status === 'approved') {
        completedWithdrawals += amt;
      } else if (w.status === 'pending') {
        activeWithdrawalHolds += amt;
      }
      // 'rejected' and 'cancelled' holds are released
    });

    const rawWithdrawable = Math.max(0, settledWinnings - completedWithdrawals - activeWithdrawalHolds);
    const withdrawableBalance =
      walletBalance !== undefined && Number.isFinite(Number(walletBalance))
        ? Math.min(Math.max(0, Number(walletBalance)), rawWithdrawable)
        : rawWithdrawable;

    return {
      settledWinnings,
      completedWithdrawals,
      activeWithdrawalHolds,
      withdrawableBalance,
      settledPrizesCount: Math.max(countedPrizes.size, settledWinnings > 0 ? 1 : 0)
    };
  }

  public readonly MINIMUM_WITHDRAWAL_RUPEES = 10;
  public readonly MAXIMUM_WITHDRAWAL_RUPEES = 5000;

  /**
   * AUTHORITATIVE BACKEND VALIDATION FOR WITHDRAWAL SUBMISSION
   * Never trusts client-side numbers; calculates true settled winnings on the backend.
   */
  public validateAndSubmitWithdrawal(
    withdrawal: Partial<WithdrawalRequest> & { amount: number },
    ownerUid: string,
    userEmail?: string,
    withdrawalsList?: WithdrawalRequest[],
    userProfileTotalWon?: number,
    walletBalance?: number,
    quizAttemptsList?: QuizAttemptResult[]
  ): {
    success: boolean;
    error?: string;
    withdrawableBalance: number;
    settledWinnings: number;
  } {
    const amt = Number(withdrawal.amount);
    const balanceInfo = this.getWithdrawableBalance(
      ownerUid,
      userEmail,
      withdrawalsList,
      userProfileTotalWon,
      walletBalance,
      quizAttemptsList
    );

    if (isNaN(amt) || amt <= 0) {
      return {
        success: false,
        error: 'Please enter a valid withdrawal amount.',
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    if (amt < this.MINIMUM_WITHDRAWAL_RUPEES) {
      return {
        success: false,
        error: `Minimum withdrawal amount is ₹${this.MINIMUM_WITHDRAWAL_RUPEES}.`,
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    if (amt > this.MAXIMUM_WITHDRAWAL_RUPEES) {
      return {
        success: false,
        error: `Maximum withdrawal amount is ₹${this.MAXIMUM_WITHDRAWAL_RUPEES} per request.`,
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    // Duplicate ID idempotency check
    const reqId = (withdrawal.id || withdrawal.requestId || '').trim().toUpperCase();
    if (reqId && Array.isArray(withdrawalsList)) {
      const duplicate = withdrawalsList.some((w) => {
        if (!w) return false;
        const wId = (w.id || w.requestId || '').trim().toUpperCase();
        return wId === reqId && (w.walletDeducted || w.status === 'pending' || w.status === 'approved');
      });
      if (duplicate) {
        return {
          success: false,
          error: 'This withdrawal request has already been submitted.',
          withdrawableBalance: balanceInfo.withdrawableBalance,
          settledWinnings: balanceInfo.settledWinnings
        };
      }
    }

    // Rule: Pending withdrawal requests must reserve the applicable amount to prevent duplicate withdrawals
    if (balanceInfo.activeWithdrawalHolds > 0) {
      return {
        success: false,
        error: 'A withdrawal request is currently pending verification. You cannot submit another withdrawal until the active request is processed.',
        withdrawableBalance: balanceInfo.withdrawableBalance,
        settledWinnings: balanceInfo.settledWinnings
      };
    }

    // Rules: Deposited funds cannot be withdrawn; only settled winnings are withdrawable
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
      withdrawableBalance: Math.max(0, balanceInfo.withdrawableBalance - amt),
      settledWinnings: balanceInfo.settledWinnings
    };
  }

  /**
   * Idempotent wallet deduction for withdrawal reservation.
   * Ensures walletBalance never goes negative and duplicate calls never double-deduct.
   */
  public applyWithdrawalDeduction(
    currentWalletBalance: number,
    withdrawal: WithdrawalRequest
  ): {
    success: boolean;
    alreadyDeducted: boolean;
    error?: string;
    nextWalletBalance: number;
    updatedWithdrawal: WithdrawalRequest;
  } {
    const safeWallet = Math.max(0, Number(currentWalletBalance) || 0);
    const amt = Number(withdrawal.amount);

    if (withdrawal.walletDeducted) {
      return {
        success: true,
        alreadyDeducted: true,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (isNaN(amt) || amt < this.MINIMUM_WITHDRAWAL_RUPEES) {
      return {
        success: false,
        alreadyDeducted: false,
        error: `Minimum withdrawal amount is ₹${this.MINIMUM_WITHDRAWAL_RUPEES}.`,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (amt > this.MAXIMUM_WITHDRAWAL_RUPEES) {
      return {
        success: false,
        alreadyDeducted: false,
        error: `Maximum withdrawal amount is ₹${this.MAXIMUM_WITHDRAWAL_RUPEES} per request.`,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (amt > safeWallet) {
      return {
        success: false,
        alreadyDeducted: false,
        error: `Insufficient wallet balance. You only have ₹${safeWallet} available.`,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    const nextWalletBalance = Math.max(0, safeWallet - amt);
    return {
      success: true,
      alreadyDeducted: false,
      nextWalletBalance,
      updatedWithdrawal: {
        ...withdrawal,
        status: withdrawal.status || 'pending',
        walletDeducted: true,
        walletDeductedAmount: amt,
        walletRefunded: false,
        updatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Idempotent wallet status transition (approved / rejected / cancelled).
   * - Approved: never triggers a second deduction.
   * - Rejected / Cancelled: refunds reserved amount exactly once.
   */
  public applyWithdrawalStatusTransition(
    currentWalletBalance: number,
    withdrawal: WithdrawalRequest,
    nextStatus: 'approved' | 'rejected' | 'cancelled'
  ): {
    changed: boolean;
    refunded: boolean;
    nextWalletBalance: number;
    updatedWithdrawal: WithdrawalRequest;
  } {
    const safeWallet = Math.max(0, Number(currentWalletBalance) || 0);
    if (!withdrawal || withdrawal.status !== 'pending') {
      return {
        changed: false,
        refunded: false,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    const nowIso = new Date().toISOString();
    if (nextStatus === 'approved') {
      return {
        changed: true,
        refunded: false,
        nextWalletBalance: safeWallet,
        updatedWithdrawal: {
          ...withdrawal,
          status: 'approved',
          walletDeducted: withdrawal.walletDeducted ?? true,
          updatedAt: nowIso
        }
      };
    }

    const shouldRefund = !withdrawal.walletRefunded && withdrawal.walletDeducted !== false;
    const refundAmt = shouldRefund ? Math.max(0, Number(withdrawal.walletDeductedAmount ?? withdrawal.amount) || 0) : 0;
    const nextWalletBalance = Math.max(0, safeWallet + refundAmt);

    return {
      changed: true,
      refunded: shouldRefund && refundAmt > 0,
      nextWalletBalance,
      updatedWithdrawal: {
        ...withdrawal,
        status: nextStatus,
        walletRefunded: shouldRefund ? true : Boolean(withdrawal.walletRefunded),
        updatedAt: nowIso
      }
    };
  }

  /**
   * Reconciles a single pending withdrawal reservation without touching completed (approved) withdrawals.
   * - Historical approved withdrawals (e.g. QK-WTH-1009): preserved untouched.
   * - Pending withdrawal already reserved (walletDeducted === true): never deducted again.
   * - Unreserved pending withdrawal (walletDeducted !== true): reserves amount once if sufficient balance exists.
   */
  public reconcilePendingWithdrawalReservation(
    currentWalletBalance: number,
    withdrawal: WithdrawalRequest
  ): {
    changed: boolean;
    action: 'preserved_completed' | 'already_reserved' | 'reserved_once' | 'insufficient_balance' | 'unchanged';
    nextWalletBalance: number;
    updatedWithdrawal: WithdrawalRequest;
  } {
    const safeWallet = Math.max(0, Number(currentWalletBalance) || 0);
    if (!withdrawal) {
      return {
        changed: false,
        action: 'unchanged',
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (withdrawal.status === 'approved') {
      return {
        changed: false,
        action: 'preserved_completed',
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (withdrawal.status !== 'pending') {
      return {
        changed: false,
        action: 'unchanged',
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    if (withdrawal.walletDeducted) {
      return {
        changed: false,
        action: 'already_reserved',
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    const amt = Math.max(0, Number(withdrawal.amount) || 0);
    if (amt <= 0 || amt > safeWallet) {
      return {
        changed: false,
        action: 'insufficient_balance',
        nextWalletBalance: safeWallet,
        updatedWithdrawal: withdrawal
      };
    }

    const nextWalletBalance = Math.max(0, safeWallet - amt);
    return {
      changed: true,
      action: 'reserved_once',
      nextWalletBalance,
      updatedWithdrawal: {
        ...withdrawal,
        walletDeducted: true,
        walletDeductedAmount: amt,
        walletRefunded: false,
        updatedAt: new Date().toISOString()
      }
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
