import { 
  contestBackend, 
  calculateContestPool, 
  calculateTrustedScore, 
  rankActiveEntries, 
  mapEntriesToLeaderboard,
  rupeesToPaise,
  paiseToRupees,
  DEFAULT_ENTRY_FEE_PAISE,
  MAX_PRIZE_LIMIT_PAISE
} from '../src/backend/contestEngine';
import { Question, ContestEntry } from '../src/types';

console.log('===============================================================');
console.log('QUIZKART - JOIN, LIVE RANKING & PRIZE CALCULATION BACKEND TESTS');
console.log('===============================================================\n');

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

// Reset backend state before starting tests
contestBackend.resetForTesting();

// ============================================================================
// REQUIREMENT 1: FIRST USER JOIN & WINNER LEADER
// ============================================================================
console.log('\n--- 1. Testing Requirement 1: First User Join & Winner Leader ---');

const contestId = 'CNT-TEST-001';
const entryFeeRupees = 100;

// User 1 joins
const join1 = contestBackend.joinContest({
  contestId,
  ownerUid: 'usr-1001',
  userEmail: 'rahul.sen@example.com',
  userName: 'Rahul Sen',
  entryFeeRupees,
  paymentVerified: true
});

assert(join1.success === true, 'Req 1.1: First user successfully joins contest');
assert(join1.entry.entryId === 'ENTRY-001', 'Req 1.2: Unique entry ID ENTRY-001 created for first user', `got ${join1.entry.entryId}`);
assert(join1.entry.isActive === true && join1.entry.isValid === true, 'Req 1.3: First entry is active and valid');
assert(join1.poolCalculation.confirmedPaidEntries === 1, 'Req 1.4: Real Joins updated to 1', `got ${join1.poolCalculation.confirmedPaidEntries}`);

// Check 60% Prize Pool, 10% Referral Pool, 30% Platform Margin (Integer Paise)
assert(join1.poolCalculation.entryFeePaise === 10000, 'Req 1.5: Entry fee stored as 10,000 paise (₹100)');
assert(join1.poolCalculation.totalRevenuePaise === 10000, 'Req 1.6: Total revenue is 10,000 paise (₹100)');
assert(join1.poolCalculation.prizePoolPaise === 6000, 'Req 1.7: Prize Pool is exactly 60% = 6,000 paise (₹60)', `got ${join1.poolCalculation.prizePoolPaise}`);
assert(join1.poolCalculation.prizePoolRupees === 60, 'Req 1.8: Prize Pool in Rupees is ₹60');
assert(join1.poolCalculation.referralPoolPaise === 1000, 'Req 1.9: Referral Pool is exactly 10% = 1,000 paise (₹10)');
assert(join1.poolCalculation.referralPoolRupees === 10, 'Req 1.10: Referral Pool in Rupees is ₹10');
assert(join1.poolCalculation.platformMarginPaise === 3000, 'Req 1.11: Platform Margin is exactly 30% = 3,000 paise (₹30)');
assert(join1.poolCalculation.platformMarginRupees === 30, 'Req 1.12: Platform Margin in Rupees is ₹30');
assert(join1.poolCalculation.winnerSlots === 1, 'Req 1.13: Winner Slots is 1 for 1 entry');
assert(join1.poolCalculation.slotPayoutsRupees[1] === 60, 'Req 1.14: Rank 1 projected prize is ₹60', `got ${join1.poolCalculation.slotPayoutsRupees[1]}`);
assert(join1.ledgerRecord.type === 'ENTRY_FEE' && join1.ledgerRecord.amountRupees === 100, 'Req 1.15: Payment logged in financial audit ledger');

// ============================================================================
// REQUIREMENT 2: SECOND USER JOIN & AUTOMATIC RANKING
// ============================================================================
console.log('\n--- 2. Testing Requirement 2: Second User Join & Automatic Ranking ---');

// User 2 joins
const join2 = contestBackend.joinContest({
  contestId,
  ownerUid: 'usr-1002',
  userEmail: 'priya.sundar@example.com',
  userName: 'Priya Sundaram',
  entryFeeRupees,
  paymentVerified: true
});

assert(join2.success === true, 'Req 2.1: Second user successfully joins contest');
assert(join2.entry.entryId === 'ENTRY-002', 'Req 2.2: Separate entry ID ENTRY-002 created for second user', `got ${join2.entry.entryId}`);
assert(join2.poolCalculation.confirmedPaidEntries === 2, 'Req 2.3: Confirmed entries updated to 2', `got ${join2.poolCalculation.confirmedPaidEntries}`);
assert(join2.poolCalculation.prizePoolPaise === 12000, 'Req 2.4: Prize Pool recalculated to 12,000 paise (₹120)', `got ${join2.poolCalculation.prizePoolPaise}`);
assert(join2.poolCalculation.prizePoolRupees === 120, 'Req 2.5: Prize Pool in Rupees is ₹120');
assert(join2.poolCalculation.winnerSlots === 1, 'Req 2.6: Winner Slots remains 1 for 2 entries (CEIL(2/3) = 1)');
assert(join2.poolCalculation.slotPayoutsRupees[1] === 120, 'Req 2.7: Rank 1 receives ₹120, subject to max limit of ₹180', `got ${join2.poolCalculation.slotPayoutsRupees[1]}`);

// ============================================================================
// REQUIREMENT 3: LIVE PRIZE RECALCULATION & TRUSTED SCORING
// ============================================================================
console.log('\n--- 3. Testing Requirement 3: Live Prize Recalculation & Trusted Scoring ---');

const testQuestions: Question[] = [
  { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
  { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' },
  { id: 3, question: 'Q3', options: ['A', 'B', 'C', 'D'], correctIndex: 2, category: 'GK', difficulty: 'Easy', explanation: '' },
  { id: 4, question: 'Q4', options: ['A', 'B', 'C', 'D'], correctIndex: 3, category: 'GK', difficulty: 'Easy', explanation: '' },
  { id: 5, question: 'Q5', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
];

// User 1 (Rahul) submits quiz with 4 correct, 1 wrong: Score = 4 - (1 * 0.33) = 3.67, Time = 45s
const submit1 = contestBackend.submitQuiz({
  contestId,
  entryId: 'ENTRY-001',
  ownerUid: 'usr-1001',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 1 }, // Q5 wrong
  questions: testQuestions,
  timeTakenSeconds: 45
});

assert(submit1.success === true, 'Req 3.1: User 1 quiz successfully submitted');
assert(submit1.scoreResult?.score === 3.67, 'Req 3.2: Score calculated accurately on trusted backend: 4 - 0.33 = 3.67', `got ${submit1.scoreResult?.score}`);
assert(submit1.entry?.rank === 1, 'Req 3.3: User 1 holds Rank 1');
assert(submit1.entry?.projectedPrizeRupees === 120, 'Req 3.4: User 1 holds projected prize of ₹120', `got ${submit1.entry?.projectedPrizeRupees}`);

// User 2 (Priya) submits quiz with 5 correct, 0 wrong: Score = 5, Time = 50s
const submit2 = contestBackend.submitQuiz({
  contestId,
  entryId: 'ENTRY-002',
  ownerUid: 'usr-1002',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 }, // All 5 correct
  questions: testQuestions,
  timeTakenSeconds: 50
});

assert(submit2.success === true, 'Req 3.5: User 2 quiz successfully submitted');
assert(submit2.scoreResult?.score === 5, 'Req 3.6: User 2 score calculated as 5');
assert(submit2.entry?.rank === 1, 'Req 3.7: User 2 with score 5 overtakes User 1 (score 3.67) and takes Rank 1');
assert(submit2.entry?.projectedPrizeRupees === 120, 'Req 3.8: User 2 now receives Rank 1 prize of ₹120');

// Verify User 1 was reranked to Rank 2
const currentEntries = contestBackend.getContestEntries(contestId);
const rahulEntry = currentEntries.find(e => e.entryId === 'ENTRY-001');
assert(rahulEntry?.rank === 2, 'Req 3.9: User 1 reranked to Rank 2 automatically', `got ${rahulEntry?.rank}`);
assert(rahulEntry?.projectedPrizeRupees === 0, 'Req 3.10: Rank 2 receives ₹0 because Winner Slots = 1');

// ============================================================================
// REQUIREMENT 4: FOURTH & FIFTH ENTRY - WINNER SLOT EXPANSION & WATERFALL
// ============================================================================
console.log('\n--- 4. Testing Requirement 4: Winner Slot Expansion & Waterfall System ---');

// Test Pure Waterfall Math across all required table examples
// 3 entries: 1 winner -> ₹180
const pool3 = calculateContestPool(3, 10000, 18000);
assert(pool3.winnerSlots === 1, 'Req 4.1: 3 entries -> 1 winner slot');
assert(pool3.prizePoolRupees === 180, 'Req 4.2: 3 entries -> ₹180 Prize Pool (60% of ₹300)');
assert(pool3.slotPayoutsRupees[1] === 180, 'Req 4.3: 3 entries -> Rank 1 receives ₹180');

// 4 entries: 2 winners -> ₹180 + ₹60
const pool4 = calculateContestPool(4, 10000, 18000);
assert(pool4.winnerSlots === 2, 'Req 4.4: 4 entries -> CEIL(4/3) = 2 winner slots');
assert(pool4.prizePoolRupees === 240, 'Req 4.5: 4 entries -> ₹240 Prize Pool (60% of ₹400)');
assert(pool4.slotPayoutsRupees[1] === 180, 'Req 4.6: 4 entries -> Rank 1 receives ₹180 (hit ₹180 cap)');
assert(pool4.slotPayoutsRupees[2] === 60, 'Req 4.7: 4 entries -> Rank 2 receives remaining ₹60', `got ${pool4.slotPayoutsRupees[2]}`);

// 5 entries: 2 winners -> ₹180 + ₹120
const pool5 = calculateContestPool(5, 10000, 18000);
assert(pool5.winnerSlots === 2, 'Req 4.8: 5 entries -> CEIL(5/3) = 2 winner slots');
assert(pool5.prizePoolRupees === 300, 'Req 4.9: 5 entries -> ₹300 Prize Pool (60% of ₹500)');
assert(pool5.slotPayoutsRupees[1] === 180, 'Req 4.10: 5 entries -> Rank 1 receives ₹180');
assert(pool5.slotPayoutsRupees[2] === 120, 'Req 4.11: 5 entries -> Rank 2 receives ₹120', `got ${pool5.slotPayoutsRupees[2]}`);

// 6 entries: 2 winners -> ₹180 + ₹180
const pool6 = calculateContestPool(6, 10000, 18000);
assert(pool6.winnerSlots === 2, 'Req 4.12: 6 entries -> CEIL(6/3) = 2 winner slots');
assert(pool6.prizePoolRupees === 360, 'Req 4.13: 6 entries -> ₹360 Prize Pool (60% of ₹600)');
assert(pool6.slotPayoutsRupees[1] === 180, 'Req 4.14: 6 entries -> Rank 1 receives ₹180');
assert(pool6.slotPayoutsRupees[2] === 180, 'Req 4.15: 6 entries -> Rank 2 receives ₹180');

// 7 entries: 3 winners -> ₹180 + ₹180 + ₹60
const pool7 = calculateContestPool(7, 10000, 18000);
assert(pool7.winnerSlots === 3, 'Req 4.16: 7 entries -> CEIL(7/3) = 3 winner slots');
assert(pool7.prizePoolRupees === 420, 'Req 4.17: 7 entries -> ₹420 Prize Pool (60% of ₹700)');
assert(pool7.slotPayoutsRupees[1] === 180, 'Req 4.18: 7 entries -> Rank 1 receives ₹180');
assert(pool7.slotPayoutsRupees[2] === 180, 'Req 4.19: 7 entries -> Rank 2 receives ₹180');
assert(pool7.slotPayoutsRupees[3] === 60, 'Req 4.20: 7 entries -> Rank 3 receives ₹60');

// Bounded Ranks Check: Ranks never greater than total confirmed paid entries
assert(pool4.winnerSlots <= 4, 'Req 4.21: Winner slots bounded by total confirmed paid entries');
assert(pool5.winnerSlots <= 5, 'Req 4.22: Winner slots bounded by total confirmed paid entries');

// Add users 3, 4, 5 to live contest to verify live waterfall allocation
contestBackend.joinContest({ contestId, ownerUid: 'usr-1003', userEmail: 'user3@test.com', userName: 'User 3', entryFeeRupees });
contestBackend.joinContest({ contestId, ownerUid: 'usr-1004', userEmail: 'user4@test.com', userName: 'User 4', entryFeeRupees });
const join5Live = contestBackend.joinContest({ contestId, ownerUid: 'usr-1005', userEmail: 'user5@test.com', userName: 'User 5', entryFeeRupees });

assert(join5Live.poolCalculation.confirmedPaidEntries === 5, 'Req 4.23: 5 live entries confirmed');
assert(join5Live.poolCalculation.winnerSlots === 2, 'Req 4.24: 5 live entries -> 2 winner slots');
assert(join5Live.poolCalculation.slotPayoutsRupees[1] === 180, 'Req 4.25: Live Rank 1 gets ₹180');
assert(join5Live.poolCalculation.slotPayoutsRupees[2] === 120, 'Req 4.26: Live Rank 2 gets ₹120');

// Submit User 3 with score 4.5, User 4 with score 4.0, User 5 unsubmitted
contestBackend.submitQuiz({
  contestId,
  entryId: 'ENTRY-003',
  ownerUid: 'usr-1003',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3 }, // score around 4
  questions: testQuestions,
  timeTakenSeconds: 30
});
contestBackend.submitQuiz({
  contestId,
  entryId: 'ENTRY-004',
  ownerUid: 'usr-1004',
  answers: { 1: 0, 2: 1, 3: 2 }, // score around 3
  questions: testQuestions,
  timeTakenSeconds: 40
});

const liveEntriesAfterSubmits = contestBackend.getContestEntries(contestId);
const unsubmittedUser5 = liveEntriesAfterSubmits.find(e => e.entryId === 'ENTRY-005');
assert(unsubmittedUser5?.isSubmitted === false, 'Req 4.27: User 5 is unsubmitted');
assert(unsubmittedUser5?.rank === undefined, 'Req 4.28: Unsubmitted User 5 receives no rank');
assert(unsubmittedUser5?.projectedPrizeRupees === 0, 'Req 4.29: Unsubmitted User 5 receives ₹0 prize eligibility');

// ============================================================================
// REQUIREMENT 5: RE-JOIN SYSTEM - ONLY THE LATEST ENTRY WILL BE VALID
// ============================================================================
console.log('\n--- 5. Testing Requirement 5: Re-Join System - Only Latest Entry Valid ---');

// Test specific scenario from prompt:
// "Rahul joins for the first time. His Entry ID is 'ENTRY-001' and his score is '10/5'.
//  Rahul successfully joins the same contest again after making another verified payment. A new Entry ID 'ENTRY-002' is created.
//  Immediately after the second join succeeds, 'ENTRY-001' must become invalid and must be removed from active participation, leaderboard ranking and prize calculations.
//  Only 'ENTRY-002' will remain Rahul's active and valid entry..."

const rejoinContestId = 'CNT-REJOIN-TEST';
contestBackend.resetForTesting();

// Step 1: Rahul joins first time
const rahulJoin1 = contestBackend.joinContest({
  contestId: rejoinContestId,
  ownerUid: 'rahul-uid-123',
  userEmail: 'rahul@example.com',
  userName: 'Rahul',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(rahulJoin1.entry.entryId === 'ENTRY-001', 'Req 5.1: Rahul first entry ID is ENTRY-001', `got ${rahulJoin1.entry.entryId}`);
assert(rahulJoin1.entry.isActive === true && rahulJoin1.entry.isValid === true, 'Req 5.2: ENTRY-001 is initially active and valid');

// Rahul submits quiz with score 5
const rahulSubmit1 = contestBackend.submitQuiz({
  contestId: rejoinContestId,
  entryId: 'ENTRY-001',
  ownerUid: 'rahul-uid-123',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 },
  questions: testQuestions,
  timeTakenSeconds: 35
});
assert(rahulSubmit1.entry?.score === 5, 'Req 5.3: Rahul ENTRY-001 score is 5');
assert(rahulSubmit1.entry?.rank === 1, 'Req 5.4: Rahul ENTRY-001 holds Rank 1');

// Step 2: Rahul joins the same contest again after making another verified payment
const rahulJoin2 = contestBackend.joinContest({
  contestId: rejoinContestId,
  ownerUid: 'rahul-uid-123',
  userEmail: 'rahul@example.com',
  userName: 'Rahul',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(rahulJoin2.isRejoin === true, 'Req 5.5: System recognizes second join as Re-Join');
assert(rahulJoin2.entry.entryId === 'ENTRY-002', 'Req 5.6: New unique Entry ID ENTRY-002 created for Rahul', `got ${rahulJoin2.entry.entryId}`);
assert(rahulJoin2.replacedEntry?.entryId === 'ENTRY-001', 'Req 5.7: ENTRY-001 recognized as replaced entry');

// Verify ENTRY-001 is immediately invalid, inactive, and removed from active participation
const allRahulContestEntries = contestBackend.getContestEntries(rejoinContestId);
const oldEntry001 = allRahulContestEntries.find(e => e.entryId === 'ENTRY-001');
const newEntry002 = allRahulContestEntries.find(e => e.entryId === 'ENTRY-002');

assert(oldEntry001?.status === 'replaced', 'Req 5.8: ENTRY-001 status changed to replaced', `got ${oldEntry001?.status}`);
assert(oldEntry001?.isActive === false, 'Req 5.9: ENTRY-001 isActive is false');
assert(oldEntry001?.isValid === false, 'Req 5.10: ENTRY-001 isValid is false');
assert(oldEntry001?.replacedByEntryId === 'ENTRY-002', 'Req 5.11: ENTRY-001 records replacedByEntryId: ENTRY-002');
assert(newEntry002?.isActive === true, 'Req 5.12: ENTRY-002 isActive is true');
assert(newEntry002?.isValid === true, 'Req 5.13: ENTRY-002 isValid is true');

// Verify: At any moment, one user can have only ONE active entry per contest
const activeEntriesForRahul = allRahulContestEntries.filter(e => e.ownerUid === 'rahul-uid-123' && e.isActive);
assert(activeEntriesForRahul.length === 1, 'Req 5.14: Exactly ONE active entry for Rahul in contest');
assert(activeEntriesForRahul[0].entryId === 'ENTRY-002', 'Req 5.15: The sole active entry is ENTRY-002');

// Verify: Attempting to submit or rank old ENTRY-001 fails
const trySubmitOld = contestBackend.submitQuiz({
  contestId: rejoinContestId,
  entryId: 'ENTRY-001',
  ownerUid: 'rahul-uid-123',
  answers: {},
  questions: testQuestions,
  timeTakenSeconds: 20
});
assert(trySubmitOld.success === false, 'Req 5.16: Submitting replaced ENTRY-001 rejected by backend security');

// Verify Leaderboard excludes old ENTRY-001
const activeLeaderboard = mapEntriesToLeaderboard(allRahulContestEntries, 'rahul-uid-123');
assert(!activeLeaderboard.some(e => e.id === 'ENTRY-001'), 'Req 5.17: Replaced ENTRY-001 removed from leaderboard');

// Step 3: Rahul joins third time
const rahulJoin3 = contestBackend.joinContest({
  contestId: rejoinContestId,
  ownerUid: 'rahul-uid-123',
  userEmail: 'rahul@example.com',
  userName: 'Rahul',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(rahulJoin3.entry.entryId === 'ENTRY-003', 'Req 5.18: Third join creates ENTRY-003');
const entry002AfterThirdJoin = contestBackend.getContestEntries(rejoinContestId).find(e => e.entryId === 'ENTRY-002');
assert(entry002AfterThirdJoin?.status === 'replaced' && entry002AfterThirdJoin?.isActive === false, 'Req 5.19: ENTRY-002 invalidated upon third join');

// Rahul submits ENTRY-003 with lower score 3.0
const rahulSubmit3 = contestBackend.submitQuiz({
  contestId: rejoinContestId,
  entryId: 'ENTRY-003',
  ownerUid: 'rahul-uid-123',
  answers: { 1: 0, 2: 1, 3: 2 }, // 3 correct
  questions: testQuestions,
  timeTakenSeconds: 25
});
assert(rahulSubmit3.success === true, 'Req 5.20: ENTRY-003 successfully submitted with lower score');
assert(rahulSubmit3.entry?.score === 3, 'Req 5.21: ENTRY-003 score is 3.0 (replaces previous score of 5)');

// Add another user to verify multi-user ranking with re-joins
contestBackend.joinContest({
  contestId: rejoinContestId,
  ownerUid: 'suresh-uid-456',
  userEmail: 'suresh@example.com',
  userName: 'Suresh',
  entryFeeRupees: 100
});
contestBackend.submitQuiz({
  contestId: rejoinContestId,
  entryId: 'ENTRY-004',
  ownerUid: 'suresh-uid-456',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3 }, // 4 correct
  questions: testQuestions,
  timeTakenSeconds: 30
});

// Step 4: Final Settlement Test
console.log('\n--- Final Settlement & Wallet Credit Verification ---');
const settlementResult = contestBackend.settleContest(rejoinContestId);

assert(settlementResult.success === true, 'Req 5.22: Contest final settlement completed successfully');
// Suresh scored 4 -> Rank 1, Rahul ENTRY-003 scored 3 -> Rank 2
assert(settlementResult.disbursements.length >= 1, 'Req 5.23: Winner disbursements generated');
const winner1Disb = settlementResult.disbursements.find(d => d.rank === 1);
assert(winner1Disb?.ownerUid === 'suresh-uid-456', 'Req 5.24: Rank 1 prize credited to ownerUid of winning Entry ID ENTRY-004');

// Verify: Replaced entries NEVER credited
const invalidCredited = settlementResult.disbursements.some(d => d.entryId === 'ENTRY-001' || d.entryId === 'ENTRY-002');
assert(!invalidCredited, 'Req 5.25: Never credited any prize to old, replaced, or invalid entry (ENTRY-001, ENTRY-002)');

// Step 5: Admin Contest Deletion & Accounting Preservation Test
console.log('\n--- Admin Contest Deletion & Accounting Preservation Test ---');
const adminDeletionResult = contestBackend.handleAdminContestDeletion(rejoinContestId);

assert(adminDeletionResult.preservedEntriesCount === 4, 'Req 5.26: Preserved all 4 contest entries for audit accounting', `got ${adminDeletionResult.preservedEntriesCount}`);
assert(adminDeletionResult.preservedLedgersCount >= 4, 'Req 5.27: Preserved all financial ledger payment records without erasing history');

const ledgers = contestBackend.getFinancialLedgers(rejoinContestId);
assert(ledgers.some(l => l.entryId === 'ENTRY-001' && l.type === 'ENTRY_FEE'), 'Req 5.28: Original ENTRY-001 fee preserved in ledger');
assert(ledgers.some(l => l.entryId === 'ENTRY-002' && l.type === 'REJOIN_FEE'), 'Req 5.29: Re-join ENTRY-002 fee preserved in ledger');
assert(ledgers.some(l => l.entryId === 'ENTRY-003' && l.type === 'REJOIN_FEE'), 'Req 5.30: Re-join ENTRY-003 fee preserved in ledger');
assert(ledgers.some(l => l.type === 'PRIZE_PAYOUT'), 'Req 5.31: Settlement prize payout preserved in ledger');

// ============================================================================
// RANKING & SECURITY RULES: TIE-BREAKERS & CONCURRENCY
// ============================================================================
console.log('\n--- 6. Testing Tie-Breakers & Security Rules ---');

const tieContestId = 'CNT-TIE-TEST';
contestBackend.resetForTesting();

// Two users with EXACT SAME SCORE (5) but different time taken
contestBackend.joinContest({ contestId: tieContestId, ownerUid: 'user-a', userEmail: 'a@test.com', userName: 'Alice', entryFeeRupees: 100 });
contestBackend.joinContest({ contestId: tieContestId, ownerUid: 'user-b', userEmail: 'b@test.com', userName: 'Bob', entryFeeRupees: 100 });

// Alice takes 40s
contestBackend.submitQuiz({
  contestId: tieContestId,
  entryId: 'ENTRY-001',
  ownerUid: 'user-a',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 },
  questions: testQuestions,
  timeTakenSeconds: 40
});

// Bob takes 30s (Faster)
contestBackend.submitQuiz({
  contestId: tieContestId,
  entryId: 'ENTRY-002',
  ownerUid: 'user-b',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 },
  questions: testQuestions,
  timeTakenSeconds: 30
});

const tieEntries = contestBackend.getContestEntries(tieContestId);
const alice = tieEntries.find(e => e.ownerUid === 'user-a');
const bob = tieEntries.find(e => e.ownerUid === 'user-b');

assert(bob?.rank === 1, 'Req 6.1: Lower time taken (Bob 30s) takes higher rank over Alice (40s)', `Bob rank: ${bob?.rank}`);
assert(alice?.rank === 2, 'Req 6.2: Slower time taken (Alice 40s) gets Rank 2', `Alice rank: ${alice?.rank}`);

// Proctor violation / Security breach test: score must be forced to 0
contestBackend.joinContest({ contestId: tieContestId, ownerUid: 'user-c', userEmail: 'c@test.com', userName: 'Charlie', entryFeeRupees: 100 });
const breachSubmit = contestBackend.submitQuiz({
  contestId: tieContestId,
  entryId: 'ENTRY-003',
  ownerUid: 'user-c',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 }, // would be 5
  questions: testQuestions,
  timeTakenSeconds: 10,
  securityBreached: true,
  securityBreachReason: 'Proctor tab switch'
});
assert(breachSubmit.scoreResult?.score === 0, 'Req 6.3: Security breach forces score to 0 on trusted backend');
assert(breachSubmit.entry?.projectedPrizeRupees === 0, 'Req 6.4: Disqualified breach entry receives ₹0 prize');

// Money formatting & integer paise check: No rounding leak
const testPaiseSplit = calculateContestPool(10, 10000, 18000);
assert(
  testPaiseSplit.prizePoolPaise + testPaiseSplit.referralPoolPaise + testPaiseSplit.platformMarginPaise === testPaiseSplit.totalRevenuePaise,
  'Req 6.5: Zero rounding leakage: prizePool + referralPool + platformMargin === totalRevenue'
);

console.log('\n===============================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log('===============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
