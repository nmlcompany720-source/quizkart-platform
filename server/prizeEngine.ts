/**
 * QuizKart Waterfall Prize Distribution Engine
 * 
 * Rules:
 * 1. Winner Slots:
 *    winnerSlots = Math.ceil(confirmedPaidEntries / 3)
 * 2. Prize Pool:
 *    60% User Prize Pool, 10% Referral Pool, 30% Platform Margin.
 *    Only the 60% User Prize Pool is distributed to winning ranks.
 * 3. Waterfall Distribution:
 *    Maximum prize per winning entry = ₹180 (18,000 paise).
 *    For each rank from 1 to winnerSlots:
 *      prize = Math.min(18000, remainingPrizePool)
 *      remainingPrizePool -= prize
 */

export interface PrizeCalculationResult {
  confirmedPaidEntries: number;
  entryFeePaise: number;
  totalRevenuePaise: number;
  userPrizePoolPaise: number;
  referralPoolPaise: number;
  platformMarginPaise: number;
  winnerSlots: number;
  maxPrizePerRankPaise: number;
  rankPrizesPaise: Record<number, number>; // rank (1-indexed) -> prize in paise
  rankPrizesRupees: Record<number, number>; // rank (1-indexed) -> prize in rupees
  totalDistributedPaise: number;
  unallocatedPrizePoolPaise: number;
}

export const MAX_PRIZE_PER_RANK_PAISE = 18000; // ₹180 in paise

/**
 * Calculates dynamic winner slots: Math.ceil(confirmedPaidEntries / 3)
 */
export function calculateWinnerSlots(confirmedPaidEntries: number): number {
  if (confirmedPaidEntries <= 0) return 0;
  return Math.ceil(confirmedPaidEntries / 3);
}

/**
 * Calculates complete waterfall prize breakdown in deterministic integer paise
 */
export function calculateWaterfallPrizes(
  confirmedPaidEntries: number, 
  entryFeePaise = 10000 // default ₹100
): PrizeCalculationResult {
  const safeCount = Math.max(0, Math.floor(confirmedPaidEntries));
  const totalRevenuePaise = safeCount * entryFeePaise;
  const userPrizePoolPaise = Math.floor(totalRevenuePaise * 0.60);
  const referralPoolPaise = Math.floor(totalRevenuePaise * 0.10);
  const platformMarginPaise = totalRevenuePaise - userPrizePoolPaise - referralPoolPaise;

  const winnerSlots = calculateWinnerSlots(safeCount);

  let remainingPrizePool = userPrizePoolPaise;
  const rankPrizesPaise: Record<number, number> = {};
  const rankPrizesRupees: Record<number, number> = {};
  let totalDistributedPaise = 0;

  for (let rank = 1; rank <= winnerSlots; rank++) {
    const prizePaise = Math.min(MAX_PRIZE_PER_RANK_PAISE, remainingPrizePool);
    rankPrizesPaise[rank] = prizePaise;
    rankPrizesRupees[rank] = Math.floor(prizePaise / 100);
    remainingPrizePool -= prizePaise;
    totalDistributedPaise += prizePaise;
  }

  return {
    confirmedPaidEntries: safeCount,
    entryFeePaise,
    totalRevenuePaise,
    userPrizePoolPaise,
    referralPoolPaise,
    platformMarginPaise,
    winnerSlots,
    maxPrizePerRankPaise: MAX_PRIZE_PER_RANK_PAISE,
    rankPrizesPaise,
    rankPrizesRupees,
    totalDistributedPaise,
    unallocatedPrizePoolPaise: Math.max(0, remainingPrizePool)
  };
}
