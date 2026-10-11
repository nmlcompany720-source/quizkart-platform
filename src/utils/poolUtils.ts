/**
 * DYNAMIC CAPACITY AUTO-EXPANSION ALGORITHM & DELAYED SMOOTH RANDOM BASE LOGIC
 *
 * Requirements:
 * 1. INITIAL STATE & ZERO-DATA DELAY RULE:
 *    - PRE-START / UPCOMING ZERO STATE: While a contest is in "UPCOMING" status or before it goes live,
 *      display Participants as "0 / Max" and Pool Filling as "0%".
 *    - 30-SECOND DELAY TRIGGER: When the contest transitions to "LIVE", keep Pool Filling and Participants
 *      at 0% for the first 30 seconds.
 *    - ADMIN PANEL METRICS: Keep internal Admin Panel metrics completely separate, showing actual real user joins.
 *
 * 2. SMOOTH ANIMATED BASE GENERATION (AFTER 30 SECONDS):
 *    - RANDOM BASE DECISION: Exactly 30 seconds after going LIVE, select a single RANDOM base percentage
 *      between 25% and 45% (e.g., 32%, 35%, or 41%) once per contest.
 *    - SMOOTH INCREMENT ANIMATION: Do NOT jump directly from 0% to the generated base percentage.
 *      Smoothly animate and increment the Pool Filling progress bar and Participant count starting from 0
 *      up to the generated base value over a duration of 5 to 8 seconds (ticking up continuously).
 *
 * 3. DYNAMIC REAL-JOIN INCREMENT LOGIC:
 *    - As real users join the contest after the initial base is populated, increment the displayed participant
 *      count on the public UI by adding real joins onto the animated base:
 *      Formula: Display Count = Generated Base + Real Joins Count.
 *      Example: If a 35% base (35/100) is set and 10 real users join, UI displays "45 / 100" (45%),
 *      while Admin Panel shows "Real Joins: 10 / 100".
 *
 * 4. AUTO-CAPACITY EXPANSION TRIGGER (AT 100% TOUCH):
 *    - The exact moment the public UI Display Count touches 100% of the initial target capacity:
 *      (e.g., Display Count reaches 100 / 100 while Real Joins reach [100 - Generated Base]):
 *      - Automatically expand the displayed maximum capacity cap on the UI by adding the difference
 *        of the generated random base (New UI Max Cap = 100 + Generated Base).
 *      - Immediately update the UI display to "100 / New Max Cap Joined" without resetting or interrupting active joins.
 *      - This allows the remaining real seats in the admin target to be filled smoothly.
 *
 * 5. FINAL LOCK & EXPIRATION RULE:
 *    - Continue tracking until Real Joins reach the true admin target (100% real capacity)
 *      and public UI reaches full capacity (Max UI Cap / Max UI Cap).
 *    - Once Real Joins reach 100% of the admin target, mark the contest status as "FULL",
 *      disable/lock new join attempts, and preserve all recorded join metrics in the Admin Panel.
 */

export interface DynamicPoolOptions {
  maxParticipants?: number;
  realJoinsCount?: number;
  isUpcoming?: boolean;
  contestId?: string;
  activatedAt?: string | number;
  randomBasePercent?: number;
  nowMs?: number;
}

export interface DynamicPoolMetrics {
  basePercent: number;          // Target random base % (25% - 45%)
  currentBaseCount: number;     // Animated base count ticking 0 -> targetBase
  realJoins: number;            // Actual real joins recorded
  displayCount: number;         // Public UI participant count (e.g. 45 / 100 or 100 / 135)
  adminTargetMax: number;       // Admin initial target capacity (e.g. 100)
  maxCapacity: number;          // Displayed maximum capacity (expanded to adminTarget + base on 100% touch)
  progressPercent: number;      // 0 - 100% progress for pool fill bar
  isPoolFull: boolean;          // True when real joins reach 100% of admin target
  isExpanded: boolean;          // True when auto-capacity expansion has triggered
  phase: 'upcoming_zero' | 'delay_zero' | 'animating_base' | 'active_stable' | 'full' | 'expanded_real_fill';
}

/**
 * Persist or retrieve the single random base percentage between 25% and 45% for a contest.
 */
export function getOrInitContestBasePercent(contestId: string, existingPercent?: number): number {
  if (typeof existingPercent === 'number' && existingPercent >= 25 && existingPercent <= 45) {
    return existingPercent;
  }
  const key = `quizkart_contest_base_${contestId}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= 25 && val <= 45) {
        return val;
      }
    }
  } catch {}

  // Generate a random integer between 25 and 45 inclusive (e.g., 28, 32, 35, 41)
  const picked = Math.floor(Math.random() * (45 - 25 + 1)) + 25;
  try {
    localStorage.setItem(key, String(picked));
  } catch {}
  return picked;
}

/**
 * Retrieve or initialize the activation timestamp (when the contest went LIVE).
 */
export function getContestActivatedAt(contestId: string, contestActivatedAt?: string | number): number {
  if (contestActivatedAt) {
    const t = typeof contestActivatedAt === 'number' ? contestActivatedAt : new Date(contestActivatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const key = `quizkart_contest_activated_${contestId}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}

  const now = Date.now();
  try {
    localStorage.setItem(key, String(now));
  } catch {}
  return now;
}

/**
 * Explicitly record the activation time of a contest when it transitions to LIVE.
 */
export function recordContestActivation(contestId: string, timestampMs: number = Date.now()): void {
  try {
    localStorage.setItem(`quizkart_contest_activated_${contestId}`, String(timestampMs));
  } catch {}
}

/**
 * Dynamic Capacity Auto-Expansion & Delayed Smooth Random Base Calculation
 */
export function calculateDynamicPool(
  maxOrOptions: number | DynamicPoolOptions = 50,
  legacyRealJoins: number = 0,
  legacyOptions: DynamicPoolOptions = {}
): DynamicPoolMetrics {
  let options: DynamicPoolOptions;
  if (typeof maxOrOptions === 'number') {
    options = {
      maxParticipants: maxOrOptions,
      realJoinsCount: legacyRealJoins,
      ...legacyOptions
    };
  } else if (maxOrOptions && typeof maxOrOptions === 'object') {
    options = maxOrOptions;
  } else {
    options = {};
  }

  const adminTargetMax = Math.max(2, Math.round(options.maxParticipants || 50));
  const realJoins = Math.max(0, Math.round(options.realJoinsCount || 0));
  const isUpcoming = Boolean(options.isUpcoming);
  const nowMs = options.nowMs || Date.now();
  const contestId = options.contestId || 'default';

  // 1. PRE-START / UPCOMING ZERO STATE:
  // While a contest is in "UPCOMING" status or before it goes live,
  // display Participants as "0 / Max" and Pool Filling as "0%".
  if (isUpcoming) {
    return {
      basePercent: 0,
      currentBaseCount: 0,
      realJoins,
      displayCount: 0,
      adminTargetMax,
      maxCapacity: adminTargetMax,
      progressPercent: 0,
      isPoolFull: false,
      isExpanded: false,
      phase: 'upcoming_zero'
    };
  }

  // Check elapsed time since contest was activated / went LIVE
  const activatedMs = getContestActivatedAt(contestId, options.activatedAt);
  const elapsedSeconds = Math.max(0, (nowMs - activatedMs) / 1000);

  // If contest has not started yet (elapsedSeconds <= 0), keep strictly at 0/Max and 0%
  if (elapsedSeconds <= 0) {
    return {
      basePercent: 0,
      currentBaseCount: 0,
      realJoins,
      displayCount: 0,
      adminTargetMax,
      maxCapacity: adminTargetMax,
      progressPercent: 0,
      isPoolFull: false,
      isExpanded: false,
      phase: 'delay_zero'
    };
  }

  // 2. GRADUAL, RANDOMIZED POOL FILLING SIMULATION ALGORITHM (POST-LAUNCH):
  // Post-launch, gradually increment 1-3% every 20-40 seconds (average ~30s interval)
  // randomly up to a defined threshold (e.g. 75%) to avoid abrupt 100% filling on launch.
  const thresholdPercent = 75; // Defined safety threshold
  const steps = Math.floor(elapsedSeconds / 30);
  let accumulatedSimPercent = 0;

  for (let i = 1; i <= steps; i++) {
    // Deterministic pseudo-random seed based on contestId and interval step
    let hash = 0;
    const str = `${contestId}_pool_step_${i}`;
    for (let j = 0; j < str.length; j++) {
      hash = (hash << 5) - hash + str.charCodeAt(j);
      hash |= 0;
    }
    const stepIncrement = 1 + (Math.abs(hash) % 3); // 1%, 2%, or 3%
    accumulatedSimPercent += stepIncrement;
    if (accumulatedSimPercent >= thresholdPercent) {
      accumulatedSimPercent = thresholdPercent;
      break;
    }
  }

  const simulatedPercent = Math.min(thresholdPercent, accumulatedSimPercent);
  const N = adminTargetMax;
  const rawSimulatedCount = Math.round(N * (simulatedPercent / 100));

  // 3. DYNAMIC REAL-TARGET CAPACITY AUTO-EXPANSION (SUPPORTING ANY SPOT COUNT N):
  // Check if expansion was already triggered for this contest
  let frozenSimCount = 0;
  try {
    const saved = localStorage.getItem(`quizkart_pool_frozen_sim_${contestId}`);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        frozenSimCount = parsed;
      }
    }
  } catch {}

  // Trigger expansion when visually filled spots reach 100% of configured Max_Spots N
  if (frozenSimCount <= 0 && (realJoins + rawSimulatedCount) >= N) {
    // Simulated_Count = Visual_Filled (N) - Real_Joins
    frozenSimCount = Math.max(1, rawSimulatedCount > 0 ? Math.min(rawSimulatedCount, N - Math.min(realJoins, N)) : Math.round(N * 0.3));
    try {
      localStorage.setItem(`quizkart_pool_frozen_sim_${contestId}`, String(frozenSimCount));
    } catch {}
  }

  let uiMaxCap = N;
  let isExpanded = false;
  let simulatedCount = rawSimulatedCount;
  let finalDisplayCount = realJoins + rawSimulatedCount;

  if (frozenSimCount > 0) {
    // Expansion active: total capacity auto-expands to N + Simulated_Count
    isExpanded = true;
    simulatedCount = frozenSimCount;
    uiMaxCap = N + frozenSimCount;
    // FREEZE SIMULATION ON EXPANDED SLOTS: simulation frozen at frozenSimCount
    // All newly added open slots are strictly reserved for Real Paid Users
    finalDisplayCount = Math.min(uiMaxCap, realJoins + simulatedCount);
  } else {
    uiMaxCap = N;
    isExpanded = false;
    simulatedCount = rawSimulatedCount;
    finalDisplayCount = Math.min(uiMaxCap, realJoins + simulatedCount);
  }

  // When Real Paid Users reach the configured target N, or absolute maximum expanded capacity is reached:
  const isPoolFull = realJoins >= N || finalDisplayCount >= uiMaxCap;
  if (isPoolFull) {
    finalDisplayCount = uiMaxCap;
  }

  const progressPercent = isPoolFull ? 100 : Math.min(100, Math.round((finalDisplayCount / uiMaxCap) * 100));

  return {
    basePercent: simulatedPercent,
    currentBaseCount: simulatedCount,
    realJoins,
    displayCount: finalDisplayCount,
    adminTargetMax: N,
    maxCapacity: uiMaxCap,
    progressPercent,
    isPoolFull,
    isExpanded,
    phase: isPoolFull ? 'full' : (isExpanded ? 'expanded_real_fill' : (steps > 0 ? 'active_stable' : 'delay_zero'))
  };
}
