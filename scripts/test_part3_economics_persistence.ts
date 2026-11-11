import { 
  contestBackend, 
  mapEntriesToLeaderboard, 
  calculateContestPool,
  rupeesToPaise,
  paiseToRupees
} from '../src/backend/contestEngine';
import { ContestEntry } from '../src/types';

console.log('===================================================================');
console.log('QUIZKART — PART 3: ECONOMICS BREAKDOWN, RESET & REAL JOINS TESTS');
console.log('===================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
    process.exitCode = 1;
  }
}

contestBackend.resetForTesting();

// ============================================================================
// TEST SUITE 1: ECONOMICS BREAKDOWN — TOTAL CARD & MATHEMATICAL FORMULAS
// ============================================================================
console.log('--- Test Suite 1: Economics Breakdown & Total Card ---');

// Case 1A: 6 confirmed paid entries at ₹100 entry fee
const pool6 = calculateContestPool(6, rupeesToPaise(100));
const totalRevenue6 = 6 * 100;
const winnerPool6 = pool6.prizePoolRupees;
const referralPool6 = pool6.referralPoolRupees;
const platformMargin6 = pool6.platformMarginRupees;
const total6 = winnerPool6 + referralPool6 + platformMargin6;

assert(winnerPool6 === 360, '1.1: 6 entries at ₹100 -> Winner Prize Pool is exactly ₹360 (60%)', `Got ₹${winnerPool6}`);
assert(referralPool6 === 60, '1.2: 6 entries at ₹100 -> Referral & Affiliates is exactly ₹60 (10%)', `Got ₹${referralPool6}`);
assert(platformMargin6 === 180, '1.3: 6 entries at ₹100 -> Platform Margin is exactly ₹180 (30%)', `Got ₹${platformMargin6}`);
assert(total6 === 600, '1.4: 6 entries at ₹100 -> Total is combined amount of all three (₹600)', `Got ₹${total6}`);
assert(total6 === totalRevenue6, '1.5: Total matches total collected revenue (6 * ₹100 = ₹600)');

// Case 1B: Dynamic calculation for arbitrary entry count (e.g., 7 entries at ₹100)
const pool7 = calculateContestPool(7, rupeesToPaise(100));
const winnerPool7 = pool7.prizePoolRupees;
const referralPool7 = pool7.referralPoolRupees;
const platformMargin7 = pool7.platformMarginRupees;
const total7 = winnerPool7 + referralPool7 + platformMargin7;

assert(winnerPool7 === 420, '1.6: 7 entries at ₹100 -> Winner Pool is ₹420 (60%)', `Got ₹${winnerPool7}`);
assert(referralPool7 === 70, '1.7: 7 entries at ₹100 -> Referral Pool is ₹70 (10%)', `Got ₹${referralPool7}`);
assert(platformMargin7 === 210, '1.8: 7 entries at ₹100 -> Platform Margin is ₹210 (30%)', `Got ₹${platformMargin7}`);
assert(total7 === 700, '1.9: 7 entries at ₹100 -> Total is ₹700 (100%)', `Got ₹${total7}`);

// Case 1C: Dynamic calculation for different entry fees (e.g., 4 entries at ₹50)
const pool4_50 = calculateContestPool(4, rupeesToPaise(50));
const totalRevenue4_50 = 4 * 50;
const total4_50 = pool4_50.prizePoolRupees + pool4_50.referralPoolRupees + pool4_50.platformMarginRupees;
assert(pool4_50.prizePoolRupees === 120, '1.10: 4 entries at ₹50 -> Prize Pool is ₹120 (60%)');
assert(pool4_50.referralPoolRupees === 20, '1.11: 4 entries at ₹50 -> Referral is ₹20 (10%)');
assert(pool4_50.platformMarginRupees === 60, '1.12: 4 entries at ₹50 -> Platform is ₹60 (30%)');
assert(total4_50 === 200, '1.13: 4 entries at ₹50 -> Total is ₹200 (100%)');

// ============================================================================
// TEST SUITE 2: EMPTY, ACTIVE & COMPLETED STATES
// ============================================================================
console.log('\n--- Test Suite 2: Empty, Active & Completed States ---');

// Helper simulating AdminPage.tsx financial cards resolution logic
function computeAdminFinancialCards(activeContest: { id: string; status: string; entryFee: number; confirmedPaidEntries?: number; realJoins?: number } | null) {
  const hasActiveContest = Boolean(activeContest && activeContest.status === 'active');
  const feeRupees = hasActiveContest ? (activeContest!.entryFee || 100) : 100;
  const poolCalc = hasActiveContest ? contestBackend.getPoolCalculation(activeContest!.id, feeRupees) : null;
  const confirmedPaidCount = hasActiveContest
    ? (activeContest!.confirmedPaidEntries !== undefined
        ? activeContest!.confirmedPaidEntries
        : (activeContest!.realJoins !== undefined
            ? activeContest!.realJoins
            : (poolCalc?.confirmedPaidEntries || 0)))
    : 0;

  const hasPaidJoins = hasActiveContest && confirmedPaidCount > 0;
  const totalRevenue = confirmedPaidCount * feeRupees;
  const winnerPoolAmount = hasPaidJoins ? Math.floor(totalRevenue * 0.60) : 0;
  const referralPoolAmount = hasPaidJoins ? Math.floor(totalRevenue * 0.10) : 0;
  const platformMarginAmount = hasPaidJoins ? (totalRevenue - winnerPoolAmount - referralPoolAmount) : 0;
  const totalAmount = hasPaidJoins ? (winnerPoolAmount + referralPoolAmount + platformMarginAmount) : 0;

  return {
    winnerPoolAmount,
    referralPoolAmount,
    platformMarginAmount,
    totalAmount,
    hasPaidJoins
  };
}

// 2A: No contest exists (activeContest is null)
const stateNoContest = computeAdminFinancialCards(null);
assert(stateNoContest.winnerPoolAmount === 0, '2.1: No contest exists -> Winner Prize Pool is ₹0');
assert(stateNoContest.referralPoolAmount === 0, '2.2: No contest exists -> Referral & Affiliates is ₹0');
assert(stateNoContest.platformMarginAmount === 0, '2.3: No contest exists -> Platform Margin is ₹0');
assert(stateNoContest.totalAmount === 0, '2.4: No contest exists -> Total is ₹0');

// 2B: Contest exists with 0 confirmed paid joins
const contestIdEmpty = 'CNT-EMPTY-001';
const stateZeroJoins = computeAdminFinancialCards({
  id: contestIdEmpty,
  status: 'active',
  entryFee: 100,
  confirmedPaidEntries: 0
});
assert(stateZeroJoins.winnerPoolAmount === 0, '2.5: 0 paid joins -> Winner Prize Pool is ₹0');
assert(stateZeroJoins.referralPoolAmount === 0, '2.6: 0 paid joins -> Referral & Affiliates is ₹0');
assert(stateZeroJoins.platformMarginAmount === 0, '2.7: 0 paid joins -> Platform Margin is ₹0');
assert(stateZeroJoins.totalAmount === 0, '2.8: 0 paid joins -> Total is ₹0');

// 2C: Active joins occur in contest
const contestIdActive = 'CNT-LIVE-100';
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u1', userName: 'User 1', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u2', userName: 'User 2', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u3', userName: 'User 3', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u4', userName: 'User 4', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u5', userName: 'User 5', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestIdActive, ownerUid: 'u6', userName: 'User 6', entryFeeRupees: 100 });

const activeEntriesCount = contestBackend.getActiveEntries(contestIdActive).length;
assert(activeEntriesCount === 6, '2.9: 6 active entries joined CNT-LIVE-100');

const state6Joins = computeAdminFinancialCards({
  id: contestIdActive,
  status: 'active',
  entryFee: 100,
  confirmedPaidEntries: activeEntriesCount
});
assert(state6Joins.winnerPoolAmount === 360, '2.10: Active 6 joins -> Winner Pool is ₹360');
assert(state6Joins.referralPoolAmount === 60, '2.11: Active 6 joins -> Referral Pool is ₹60');
assert(state6Joins.platformMarginAmount === 180, '2.12: Active 6 joins -> Platform Margin is ₹180');
assert(state6Joins.totalAmount === 600, '2.13: Active 6 joins -> Total is ₹600');

// 2D: Contest timer expires or contest is completed
const stateCompleted = computeAdminFinancialCards({
  id: contestIdActive,
  status: 'completed',
  entryFee: 100,
  confirmedPaidEntries: 6
});
assert(stateCompleted.winnerPoolAmount === 0, '2.14: Completed contest -> Winner Pool resets to ₹0');
assert(stateCompleted.referralPoolAmount === 0, '2.15: Completed contest -> Referral Pool resets to ₹0');
assert(stateCompleted.platformMarginAmount === 0, '2.16: Completed contest -> Platform Margin resets to ₹0');
assert(stateCompleted.totalAmount === 0, '2.17: Completed contest -> Total resets to ₹0');

// 2E: Admin deletes contest
const deletionAudit = contestBackend.handleAdminContestDeletion(contestIdActive);
assert(deletionAudit.preservedEntriesCount === 6, '2.18: Deletion audit preserves all 6 entry records');
assert(deletionAudit.preservedLedgersCount >= 6, '2.19: Deletion audit preserves all financial ledger records');

// When deleted from UI, active contest is cleared (activeContest = null)
const stateDeleted = computeAdminFinancialCards(null);
assert(stateDeleted.totalAmount === 0, '2.20: After admin contest deletion, UI cards reset to ₹0');

// 2F: New contest is created (CNT-NEW-200) with 0 joins
const contestIdNew = 'CNT-NEW-200';
const stateNewContest = computeAdminFinancialCards({
  id: contestIdNew,
  status: 'active',
  entryFee: 100,
  confirmedPaidEntries: 0
});
assert(stateNewContest.winnerPoolAmount === 0, '2.21: Newly created contest starts with ₹0 Winner Pool');
assert(stateNewContest.totalAmount === 0, '2.22: Newly created contest starts with ₹0 Total (no leak from CNT-LIVE-100)');

// ============================================================================
// TEST SUITE 3: REAL JOINS PERSISTENCE & FIRESTORE SYNCHRONIZATION
// ============================================================================
console.log('\n--- Test Suite 3: Real Joins Persistence & Synchronization ---');

// Case 3A: Simulate 7 confirmed paid entries saved in persistent Firestore storage
const contestIdPersist = 'CNT-PERSIST-300';
const now = Date.now();
const cloudEntriesFromFirestore: ContestEntry[] = [
  {
    entryId: 'ENTRY-001',
    entrySequenceNumber: 1,
    contestId: contestIdPersist,
    ownerUid: 'uid-alice',
    userEmail: 'alice@example.com',
    userName: 'Alice Smith',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 8,
    timeTakenSeconds: 32.5,
    joinedAt: new Date(now - 60000).toISOString(),
    joinedTimestampMs: now - 60000
  },
  {
    entryId: 'ENTRY-002',
    entrySequenceNumber: 2,
    contestId: contestIdPersist,
    ownerUid: 'uid-bob',
    userEmail: 'bob@example.com',
    userName: 'Bob Jones',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 9,
    timeTakenSeconds: 28.1,
    joinedAt: new Date(now - 55000).toISOString(),
    joinedTimestampMs: now - 55000
  },
  {
    entryId: 'ENTRY-003',
    entrySequenceNumber: 3,
    contestId: contestIdPersist,
    ownerUid: 'uid-carol',
    userEmail: 'carol@example.com',
    userName: 'Carol White',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 7,
    timeTakenSeconds: 40.0,
    joinedAt: new Date(now - 50000).toISOString(),
    joinedTimestampMs: now - 50000
  },
  {
    entryId: 'ENTRY-004',
    entrySequenceNumber: 4,
    contestId: contestIdPersist,
    ownerUid: 'uid-david',
    userEmail: 'david@example.com',
    userName: 'David Brown',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 6,
    timeTakenSeconds: 45.2,
    joinedAt: new Date(now - 45000).toISOString(),
    joinedTimestampMs: now - 45000
  },
  {
    entryId: 'ENTRY-005',
    entrySequenceNumber: 5,
    contestId: contestIdPersist,
    ownerUid: 'uid-emma',
    userEmail: 'emma@example.com',
    userName: 'Emma Watson',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 10,
    timeTakenSeconds: 22.0,
    joinedAt: new Date(now - 40000).toISOString(),
    joinedTimestampMs: now - 40000
  },
  {
    entryId: 'ENTRY-006',
    entrySequenceNumber: 6,
    contestId: contestIdPersist,
    ownerUid: 'uid-frank',
    userEmail: 'frank@example.com',
    userName: 'Frank Castle',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 5,
    timeTakenSeconds: 50.0,
    joinedAt: new Date(now - 35000).toISOString(),
    joinedTimestampMs: now - 35000
  },
  {
    entryId: 'ENTRY-007',
    entrySequenceNumber: 7,
    contestId: contestIdPersist,
    ownerUid: 'uid-grace',
    userEmail: 'grace@example.com',
    userName: 'Grace Hopper',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'active',
    isActive: true,
    isValid: true,
    paymentVerified: true,
    isSubmitted: true,
    score: 8,
    timeTakenSeconds: 31.0,
    joinedAt: new Date(now - 30000).toISOString(),
    joinedTimestampMs: now - 30000
  }
];

// Load authoritative records from persistent Firestore storage (simulate page reload / app restart)
contestBackend.loadContestEntries(contestIdPersist, cloudEntriesFromFirestore);

const restoredEntries = contestBackend.getActiveEntries(contestIdPersist);
assert(restoredEntries.length === 7, '3.1: Persistent 7/100 entries restored accurately on page reload', `Got ${restoredEntries.length}`);

const poolCalculationPersist = contestBackend.getPoolCalculation(contestIdPersist, 100);
assert(poolCalculationPersist.confirmedPaidEntries === 7, '3.2: Confirmed paid entries equals 7');
assert(poolCalculationPersist.prizePoolRupees === 420, '3.3: Prize pool is ₹420 (60% of ₹700)');
assert(poolCalculationPersist.referralPoolRupees === 70, '3.4: Referral pool is ₹70 (10% of ₹700)');
assert(poolCalculationPersist.platformMarginRupees === 210, '3.5: Platform margin is ₹210 (30% of ₹700)');

// Case 3B: Deduplication test — passing duplicate entryId does not increase count
const duplicateBatch = [
  ...cloudEntriesFromFirestore,
  // Exact duplicate of ENTRY-001
  { ...cloudEntriesFromFirestore[0] },
  // Duplicate of ENTRY-002
  { ...cloudEntriesFromFirestore[1] }
];

contestBackend.loadContestEntries(contestIdPersist, duplicateBatch);
const deduplicatedEntries = contestBackend.getActiveEntries(contestIdPersist);
assert(deduplicatedEntries.length === 7, '3.6: Deduplication by unique entryId prevents inflating count (still 7)');

// Case 3C: Filtering invalid, pending, failed, or demo entries
const dirtyBatch: ContestEntry[] = [
  ...cloudEntriesFromFirestore,
  // Pending payment
  {
    entryId: 'ENTRY-PENDING',
    entrySequenceNumber: 8,
    contestId: contestIdPersist,
    ownerUid: 'uid-pending',
    userEmail: 'pending@example.com',
    userName: 'Pending User',
    paidAmountPaise: 0,
    entryFeePaise: 10000,
    status: 'invalid',
    isActive: true,
    isValid: false,
    paymentVerified: false,
    isSubmitted: false,
    score: 0,
    timeTakenSeconds: 0,
    joinedAt: new Date(now).toISOString(),
    joinedTimestampMs: now
  },
  // Failed payment
  {
    entryId: 'ENTRY-FAILED',
    entrySequenceNumber: 9,
    contestId: contestIdPersist,
    ownerUid: 'uid-failed',
    userEmail: 'failed@example.com',
    userName: 'Failed User',
    paidAmountPaise: 0,
    entryFeePaise: 10000,
    status: 'invalid',
    isActive: false,
    isValid: false,
    paymentVerified: false,
    isSubmitted: false,
    score: 0,
    timeTakenSeconds: 0,
    joinedAt: new Date(now).toISOString(),
    joinedTimestampMs: now
  },
  // Replaced / invalid entry from previous attempt
  {
    entryId: 'ENTRY-REPLACED',
    entrySequenceNumber: 10,
    contestId: contestIdPersist,
    ownerUid: 'uid-alice',
    userEmail: 'alice@example.com',
    userName: 'Alice Smith (Old)',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    status: 'replaced',
    isActive: false,
    isValid: false,
    paymentVerified: true,
    isSubmitted: true,
    score: 4,
    timeTakenSeconds: 55.0,
    joinedAt: new Date(now - 120000).toISOString(),
    joinedTimestampMs: now - 120000
  }
];

contestBackend.loadContestEntries(contestIdPersist, dirtyBatch);
const validFilteredEntries = contestBackend.getActiveEntries(contestIdPersist);
assert(validFilteredEntries.length === 7, '3.7: Dirty entries (pending/failed/replaced) excluded from Real Joins count');

// Case 3D: Re-Join Latest Active Entry Rule
// Suppose Alice re-joins CNT-PERSIST-300: her old entry (ENTRY-001) is invalidated and replaced by ENTRY-001-V2
const aliceRejoin = contestBackend.joinContest({
  contestId: contestIdPersist,
  ownerUid: 'uid-alice',
  userEmail: 'alice@example.com',
  userName: 'Alice Smith',
  entryFeeRupees: 100
});

assert(aliceRejoin.success, '3.8: Alice successfully re-joins contest');
const afterRejoinEntries = contestBackend.getActiveEntries(contestIdPersist);
assert(afterRejoinEntries.length === 7, '3.9: Re-join retains exactly 7 active entries (does NOT inflate to 8)');

const aliceActiveEntries = afterRejoinEntries.filter(e => e.ownerUid === 'uid-alice');
assert(aliceActiveEntries.length === 1, '3.10: Exactly 1 active entry exists for Alice in contest rankings');
assert(aliceActiveEntries[0].entryId === aliceRejoin.entry.entryId, '3.11: Latest entry participates in ranking and prize eligibility');

// Case 3E: Simulated browser close & reopen
// Serialize entries to JSON (simulating Firestore/persistent offline storage roundtrip) and reload into fresh instance
const serializedStorage = JSON.stringify(dirtyBatch.filter(e => e.isActive && e.isValid && e.status === 'active'));
const rehydratedFromCloud: ContestEntry[] = JSON.parse(serializedStorage);

contestBackend.resetForTesting();
contestBackend.loadContestEntries(contestIdPersist, rehydratedFromCloud);
const reloadedEntries = contestBackend.getActiveEntries(contestIdPersist);
assert(reloadedEntries.length === 7, '3.12: Simulated browser close/reopen retains 7/100 confirmed joins');

// ============================================================================
// TEST SUITE 4: CONTEST ISOLATION & AUDIT LEDGER PRESERVATION
// ============================================================================
console.log('\n--- Test Suite 4: Contest Isolation & Historical Ledgers ---');

const contestAlpha = 'CNT-ALPHA';
const contestBeta = 'CNT-BETA';

contestBackend.joinContest({ contestId: contestAlpha, ownerUid: 'userA1', userName: 'Alpha User 1', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: contestAlpha, ownerUid: 'userA2', userName: 'Alpha User 2', entryFeeRupees: 100 });

contestBackend.joinContest({ contestId: contestBeta, ownerUid: 'userB1', userName: 'Beta User 1', entryFeeRupees: 100 });

const alphaEntries = contestBackend.getActiveEntries(contestAlpha);
const betaEntries = contestBackend.getActiveEntries(contestBeta);

assert(alphaEntries.length === 2, '4.1: Contest Alpha has exactly 2 entries');
assert(betaEntries.length === 1, '4.2: Contest Beta has exactly 1 entry');

const alphaPool = contestBackend.getPoolCalculation(contestAlpha, 100);
const betaPool = contestBackend.getPoolCalculation(contestBeta, 100);

assert(alphaPool.totalRevenueRupees === 200, '4.3: Alpha revenue is ₹200 (isolated)');
assert(betaPool.totalRevenueRupees === 100, '4.4: Beta revenue is ₹100 (isolated)');
assert(alphaPool.prizePoolRupees === 120, '4.5: Alpha prize pool is ₹120');
assert(betaPool.prizePoolRupees === 60, '4.6: Beta prize pool is ₹60');

// Historical audit ledgers test
const allLedgers = contestBackend.getFinancialLedgers();
assert(allLedgers.length >= 3, '4.7: Historical financial audit records exist in ledger');

// Deleting Alpha contest does not affect Beta
contestBackend.handleAdminContestDeletion(contestAlpha);
const betaEntriesAfter = contestBackend.getActiveEntries(contestBeta);
assert(betaEntriesAfter.length === 1, '4.8: Beta contest entries untouched after Alpha deletion');

// Ledgers for Alpha remain preserved
const alphaLedgers = contestBackend.getFinancialLedgers(contestAlpha);
assert(alphaLedgers.length === 2, '4.9: Alpha financial ledgers remain preserved for audit compliance');

console.log(`\n===================================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(`===================================================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
