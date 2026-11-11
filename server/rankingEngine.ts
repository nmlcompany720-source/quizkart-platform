/**
 * QuizKart Server-Authoritative Ranking & Waterfall Prize Engine
 * 
 * Strict Deterministic Rules:
 * - 1 Firebase UID can own multiple separately paid entries; each entry competes independently.
 * - Winner Slots: winnerSlots = Math.ceil(confirmedPaidEntries / 3)
 * - Prize Pool: 60% User Prize Pool, 10% Referral, 30% Platform Margin (Integer Paise)
 * - Max prize cap per winning rank = ₹180 (18,000 paise).
 * - Waterfall engine fills Rank 1 up to ₹180, then Rank 2 up to ₹180, etc.
 * - Approved Option A Tie-Breaker Ordering:
 *   1. submissionStatus === 'SUBMITTED' (Unsubmitted/abandoned get rank: null, 0 prize)
 *   2. finalCentipoints DESC (higher score first)
 *   3. timeTakenMs ASC (faster elapsed time first)
 *   4. submittedAtMs ASC (earlier submission timestamp first)
 *   5. ownerUid ASC (deterministic UID tie-breaker)
 *   6. entryId ASC (unique entry ID tie-breaker)
 * - Versioned audit history stored at /contests/{contestId}/rankings_history/v_{version}
 */

import { 
  serverDb, 
  doc, 
  getDoc, 
  setDoc,
  updateDoc, 
  collection, 
  getDocs, 
  writeBatch 
} from './db.ts';
import { calculateWaterfallPrizes, calculateWinnerSlots, type PrizeCalculationResult } from './prizeEngine.ts';

export interface EntryDataModel {
  entryId: string;
  contestId: string;
  ownerUid: string;
  customUserId?: string;
  paymentId: string;
  paymentMethod: 'WALLET' | 'GATEWAY';
  paymentStatus: 'CONFIRMED' | 'PENDING' | 'FAILED';
  entryStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  amountPaise: number;
  joinedAt: string;
  submissionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';
  score: number;
  centipoints?: number;
  accuracy?: number;
  timeTakenMs?: number;
  submittedAt?: string | null;
  submittedAtMs?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
  rank: number | null;
  projectedPrizePaise?: number;
  projectedPrizeRupees?: number;
  isEligibleForPayout?: boolean;
  projectionVersion?: number;
  projectionTimestamp?: string;
}

export interface SanitizedLeaderboardItem {
  rank: number | null;
  entryId: string;
  customUserId: string;
  score: number;
  accuracy: number;
  timeTakenMs: number;
  formattedTime: string;
  projectedPrizeRupees: number;
  projectedPrizePaise: number;
  submissionStatus: string;
  submittedAt: string | null;
  joinedAt: string;
  isEligibleForPayout: boolean;
}

export interface EntryPayoutStatus {
  entryId: string;
  contestId: string;
  ownerUid: string;
  customUserId: string;
  rank: number | null;
  score: number;
  accuracy: number;
  timeTakenMs: number;
  submissionStatus: string;
  winnerSlots: number;
  projectedPrizePaise: number;
  projectedPrizeRupees: number;
  isEligibleForPayout: boolean;
  projectionVersion: number;
  projectionTimestamp: string;
}

export interface RecalculationSummary {
  contestId: string;
  rankingVersion: number;
  confirmedPaidEntries: number;
  submittedEntriesCount: number;
  winnerSlots: number;
  userPrizePoolPaise: number;
  totalRevenuePaise: number;
  calculatedAt: string;
  rankedCount: number;
}

/**
 * Format milliseconds into human readable 'Xm Ys' or 'Xs'
 */
export function formatMilliseconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

/**
 * Sorts and evaluates ranks, projected waterfall prizes, and eligibility for all contest entries.
 * Pure function: deterministic given entries and prizePlan.
 */
export function sortAndRankEntries(
  entries: EntryDataModel[],
  prizePlan: PrizeCalculationResult,
  projectionVersion: number,
  projectionTimestamp = new Date().toISOString()
): EntryDataModel[] {
  // 1. Separate submitted vs unsubmitted entries
  const submittedEntries: EntryDataModel[] = [];
  const unsubmittedEntries: EntryDataModel[] = [];

  for (const entry of entries) {
    if (entry.submissionStatus === 'SUBMITTED') {
      submittedEntries.push({ ...entry });
    } else {
      unsubmittedEntries.push({ ...entry });
    }
  }

  // 2. Strict Approved Option A Tie-Breaker Sort for Submitted Entries
  submittedEntries.sort((a, b) => {
    // 1. finalCentipoints DESC (highest score first)
    const centiA = a.centipoints ?? Math.round((a.score || 0) * 100);
    const centiB = b.centipoints ?? Math.round((b.score || 0) * 100);
    if (centiB !== centiA) {
      return centiB - centiA;
    }

    // 2. timeTakenMs ASC (fastest elapsed time first)
    const timeA = a.timeTakenMs ?? 0;
    const timeB = b.timeTakenMs ?? 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // 3. submittedAtMs ASC (earlier submission timestamp first)
    const submitA = a.submittedAtMs ?? (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
    const submitB = b.submittedAtMs ?? (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
    if (submitA !== submitB) {
      return submitA - submitB;
    }

    // 4. ownerUid ASC (deterministic UID tie-breaker)
    const uidCompare = (a.ownerUid || '').localeCompare(b.ownerUid || '');
    if (uidCompare !== 0) {
      return uidCompare;
    }

    // 5. entryId ASC (unique entry ID tie-breaker)
    return (a.entryId || '').localeCompare(b.entryId || '');
  });

  // 3. Assign sequential unique ordinal ranks (1..N) and waterfall prizes
  const rankedSubmitted: EntryDataModel[] = submittedEntries.map((entry, index) => {
    const rank = index + 1;
    let projectedPrizePaise = 0;

    if (rank <= prizePlan.winnerSlots) {
      projectedPrizePaise = prizePlan.rankPrizesPaise[rank] || 0;
    }

    const projectedPrizeRupees = Math.floor(projectedPrizePaise / 100);
    const isEligibleForPayout = rank <= prizePlan.winnerSlots && projectedPrizePaise > 0;

    return {
      ...entry,
      rank,
      centipoints: entry.centipoints ?? Math.round((entry.score || 0) * 100),
      projectedPrizePaise,
      projectedPrizeRupees,
      isEligibleForPayout,
      projectionVersion,
      projectionTimestamp
    };
  });

  // 4. Unsubmitted / in-progress / abandoned entries receive null rank, 0 prize, not eligible
  const rankedUnsubmitted: EntryDataModel[] = unsubmittedEntries.map(entry => {
    return {
      ...entry,
      rank: null,
      centipoints: entry.centipoints ?? Math.round((entry.score || 0) * 100),
      projectedPrizePaise: 0,
      projectedPrizeRupees: 0,
      isEligibleForPayout: false,
      projectionVersion,
      projectionTimestamp
    };
  });

  return [...rankedSubmitted, ...rankedUnsubmitted];
}

/**
 * Recalculates contest rankings and waterfall prizes authoritatively.
 * Batches writes safely up to 450 per commit to avoid Firestore write limits.
 * Writes audit history record to /contests/{contestId}/rankings_history/v_{newVersion}.
 */
export async function recalculateContestRankings(contestId: string): Promise<RecalculationSummary> {
  if (!contestId) {
    throw new Error('INVALID_ARGUMENT: contestId is required');
  }

  // 1. Fetch contest document
  const contestRef = doc(serverDb, 'contests', contestId);
  const contestSnap = await getDoc(contestRef);
  if (!contestSnap.exists()) {
    throw new Error(`CONTEST_NOT_FOUND: Contest ${contestId} does not exist`);
  }

  const contestData = contestSnap.data();
  const entryFeeRupees = Number(contestData.entryFee) || 100;
  const entryFeePaise = entryFeeRupees * 100;
  const currentVersion = Number(contestData.rankingVersion) || 0;
  const nextRankingVersion = currentVersion + 1;
  const timestampStr = new Date().toISOString();

  // 2. Fetch all entries for this contest
  const entriesColl = collection(serverDb, 'contests', contestId, 'entries');
  const entriesSnap = await getDocs(entriesColl);

  const allEntries: EntryDataModel[] = [];
  let confirmedPaidCount = 0;

  entriesSnap.forEach(d => {
    const data = d.data() as EntryDataModel;
    allEntries.push(data);
    if (data.paymentStatus === 'CONFIRMED') {
      confirmedPaidCount++;
    }
  });

  // 3. Compute Waterfall Prize Plan
  const prizePlan = calculateWaterfallPrizes(confirmedPaidCount, entryFeePaise);

  // 4. Rank and allocate prizes to entries
  const evaluatedEntries = sortAndRankEntries(
    allEntries,
    prizePlan,
    nextRankingVersion,
    timestampStr
  );

  const submittedCount = evaluatedEntries.filter(e => e.submissionStatus === 'SUBMITTED').length;

  // 5. Update contest document
  await updateDoc(contestRef, {
    rankingVersion: nextRankingVersion,
    winnerSlots: prizePlan.winnerSlots,
    realJoins: confirmedPaidCount,
    totalRevenue: Math.floor(prizePlan.totalRevenuePaise / 100),
    totalRevenuePaise: prizePlan.totalRevenuePaise,
    userPrizePoolPaise: prizePlan.userPrizePoolPaise,
    referralPoolPaise: prizePlan.referralPoolPaise,
    platformMarginPaise: prizePlan.platformMarginPaise,
    lastRecalculatedAt: timestampStr,
    updatedAt: timestampStr
  });

  // 6. Write entry updates in batches (<= 450 per batch)
  const BATCH_SIZE = 400;
  for (let i = 0; i < evaluatedEntries.length; i += BATCH_SIZE) {
    const batch = writeBatch(serverDb);
    const chunk = evaluatedEntries.slice(i, i + BATCH_SIZE);

    for (const entry of chunk) {
      const entryRef = doc(serverDb, 'contests', contestId, 'entries', entry.entryId);
      batch.update(entryRef, {
        rank: entry.rank ?? null,
        score: entry.score ?? 0,
        centipoints: entry.centipoints ?? 0,
        accuracy: entry.accuracy ?? 0,
        timeTakenMs: entry.timeTakenMs ?? 0,
        projectedPrizePaise: entry.projectedPrizePaise ?? 0,
        projectedPrizeRupees: entry.projectedPrizeRupees ?? 0,
        isEligibleForPayout: Boolean(entry.isEligibleForPayout),
        projectionVersion: nextRankingVersion,
        projectionTimestamp: timestampStr
      });
    }

    await batch.commit();
  }

  // 7. Write immutable audit history record: /contests/{contestId}/rankings_history/v_{nextRankingVersion}
  const historyRef = doc(serverDb, 'contests', contestId, 'rankings_history', `v_${nextRankingVersion}`);
  const auditSnapshot = evaluatedEntries.map(e => ({
    entryId: e.entryId,
    ownerUid: e.ownerUid,
    customUserId: e.customUserId || '',
    rank: e.rank ?? null,
    score: e.score ?? 0,
    centipoints: e.centipoints ?? 0,
    accuracy: e.accuracy ?? 0,
    timeTakenMs: e.timeTakenMs ?? 0,
    projectedPrizePaise: e.projectedPrizePaise ?? 0,
    projectedPrizeRupees: e.projectedPrizeRupees ?? 0,
    isEligibleForPayout: Boolean(e.isEligibleForPayout),
    submissionStatus: e.submissionStatus ?? 'NOT_STARTED'
  }));

  await setDoc(historyRef, {
    contestId,
    rankingVersion: nextRankingVersion,
    prizePlanVersion: 1,
    confirmedPaidEntryCount: confirmedPaidCount,
    submittedEntryCount: submittedCount,
    userPrizePoolPaise: prizePlan.userPrizePoolPaise,
    referralPoolPaise: prizePlan.referralPoolPaise,
    platformMarginPaise: prizePlan.platformMarginPaise,
    winnerSlots: prizePlan.winnerSlots,
    calculationTimestamp: timestampStr,
    entriesSnapshot: auditSnapshot
  });

  return {
    contestId,
    rankingVersion: nextRankingVersion,
    confirmedPaidEntries: confirmedPaidCount,
    submittedEntriesCount: submittedCount,
    winnerSlots: prizePlan.winnerSlots,
    userPrizePoolPaise: prizePlan.userPrizePoolPaise,
    totalRevenuePaise: prizePlan.totalRevenuePaise,
    calculatedAt: timestampStr,
    rankedCount: evaluatedEntries.length
  };
}

/**
 * Sanitizes entries for public leaderboard consumption.
 * Eliminates private payment IDs, gateway secrets, and private contact info.
 */
export async function getSanitizedLeaderboard(contestId: string): Promise<SanitizedLeaderboardItem[]> {
  const entriesColl = collection(serverDb, 'contests', contestId, 'entries');
  const snap = await getDocs(entriesColl);

  const list: SanitizedLeaderboardItem[] = [];

  snap.forEach(d => {
    const data = d.data() as EntryDataModel;
    if (data.submissionStatus === 'SUBMITTED' && data.rank !== null && data.rank > 0) {
      list.push({
        rank: data.rank,
        entryId: data.entryId,
        customUserId: data.customUserId || `QK-USR-${data.ownerUid.slice(0, 6)}`,
        score: Number(data.score) || 0,
        accuracy: Number(data.accuracy) || 0,
        timeTakenMs: Number(data.timeTakenMs) || 0,
        formattedTime: formatMilliseconds(Number(data.timeTakenMs) || 0),
        projectedPrizeRupees: Number(data.projectedPrizeRupees) || 0,
        projectedPrizePaise: Number(data.projectedPrizePaise) || 0,
        submissionStatus: data.submissionStatus,
        submittedAt: data.submittedAt || null,
        joinedAt: data.joinedAt,
        isEligibleForPayout: Boolean(data.isEligibleForPayout)
      });
    }
  });

  // Sort by rank ascending (1, 2, 3...)
  list.sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
  return list;
}

/**
 * Returns authoritative dynamic payout status for a specific entry
 */
export async function getEntryPayoutStatus(contestId: string, entryId: string): Promise<EntryPayoutStatus> {
  const entryRef = doc(serverDb, 'contests', contestId, 'entries', entryId);
  const snap = await getDoc(entryRef);

  if (!snap.exists()) {
    throw new Error(`ENTRY_NOT_FOUND: Entry ${entryId} does not exist in contest ${contestId}`);
  }

  const data = snap.data() as EntryDataModel;

  // Also fetch contest winner slots for context
  const contestRef = doc(serverDb, 'contests', contestId);
  const contestSnap = await getDoc(contestRef);
  const contestData = contestSnap.exists() ? contestSnap.data() : {};
  const winnerSlots = Number(contestData.winnerSlots) || calculateWinnerSlots(Number(contestData.realJoins) || 0);

  return {
    entryId: data.entryId,
    contestId: data.contestId,
    ownerUid: data.ownerUid,
    customUserId: data.customUserId || `QK-USR-${data.ownerUid.slice(0, 6)}`,
    rank: data.rank ?? null,
    score: Number(data.score) || 0,
    accuracy: Number(data.accuracy) || 0,
    timeTakenMs: Number(data.timeTakenMs) || 0,
    submissionStatus: data.submissionStatus,
    winnerSlots,
    projectedPrizePaise: Number(data.projectedPrizePaise) || 0,
    projectedPrizeRupees: Number(data.projectedPrizeRupees) || 0,
    isEligibleForPayout: Boolean(data.isEligibleForPayout),
    projectionVersion: Number(data.projectionVersion) || Number(contestData.rankingVersion) || 1,
    projectionTimestamp: data.projectionTimestamp || contestData.lastRecalculatedAt || new Date().toISOString()
  };
}
