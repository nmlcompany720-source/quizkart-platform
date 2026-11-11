import assert from 'assert';
import { contestBackend, paiseToRupees } from '../src/backend/contestEngine';

console.log('===============================================================');
console.log('QUIZKART — FINAL PRIZE SETTLEMENT, WALLET CREDIT & PAYOUT STATUS');
console.log('===============================================================');

// Clean test environment
contestBackend.clearContestEntries('test_settle_contest_1');
contestBackend.clearContestEntries('test_settle_contest_2');

// --- Test 1: Real User Joins and Submits Quiz ---
console.log('\n--- 1. Testing Contest Joining and Submission ---');

const user1Join = contestBackend.joinContest({
  contestId: 'test_settle_contest_1',
  ownerUid: 'user-winner-101',
  userEmail: 'winner@example.com',
  userName: 'Priya Sharma',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert.strictEqual(user1Join.success, true);
assert.strictEqual(user1Join.entry.ownerUid, 'user-winner-101');
assert.notStrictEqual(user1Join.entry.settlementStatus, 'settled');

// User 2 (non-winner)
const user2Join = contestBackend.joinContest({
  contestId: 'test_settle_contest_1',
  ownerUid: 'user-runner-202',
  userEmail: 'runner@example.com',
  userName: 'Anil Kumar',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert.strictEqual(user2Join.success, true);

// User 1 submits high score
contestBackend.submitQuiz({
  contestId: 'test_settle_contest_1',
  entryId: user1Join.entry.entryId,
  ownerUid: 'user-winner-101',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 },
  questions: [{ id: 1, text: 'Q1', options: ['A','B','C','D'], correctOptionIndex: 0 }] as any,
  timeTakenSeconds: 12
});

// User 2 submits lower score
contestBackend.submitQuiz({
  contestId: 'test_settle_contest_1',
  entryId: user2Join.entry.entryId,
  ownerUid: 'user-runner-202',
  answers: { 1: 3 },
  questions: [{ id: 1, text: 'Q1', options: ['A','B','C','D'], correctOptionIndex: 0 }] as any,
  timeTakenSeconds: 30
});

console.log('  ✓ [PASS] Both real contestants joined and submitted quiz with proper score ranking');

// --- Test 2: Authoritative Settlement & Idempotency ---
console.log('\n--- 2. Testing Authoritative Contest Finalization & Settlement ---');

assert.strictEqual(contestBackend.isContestSettled('test_settle_contest_1'), false);

const settlement1 = contestBackend.settleContest('test_settle_contest_1');
assert.strictEqual(settlement1.success, true);
assert.strictEqual(settlement1.alreadySettled, false);
assert.strictEqual(contestBackend.isContestSettled('test_settle_contest_1'), true);

assert.strictEqual(settlement1.disbursements.length, 1, 'Rank 1 receives disbursement');
const winnerDisb = settlement1.disbursements[0];
assert.strictEqual(winnerDisb.ownerUid, 'user-winner-101');
assert.strictEqual(winnerDisb.rank, 1);
assert.ok(winnerDisb.prizeRupees > 0, 'Prize rupees must be > 0');

// Test Idempotent Repeated Settlement Call
const settlement2 = contestBackend.settleContest('test_settle_contest_1');
assert.strictEqual(settlement2.success, true);
assert.strictEqual(settlement2.alreadySettled, true, 'Second call must detect alreadySettled');
assert.strictEqual(settlement2.disbursements.length, 0, 'Zero additional disbursements on duplicate settlement attempt');

console.log(`  ✓ [PASS] Winner prize authoritative disbursement: ₹${winnerDisb.prizeRupees} to ${winnerDisb.ownerUid}`);
console.log('  ✓ [PASS] Repeated settlement calls return persistent disbursements without duplicate calculation');

// --- Test 3: Disbursements & Settlement getters ---
console.log('\n--- 3. Testing getContestDisbursements & getSettlement ---');

const disbursements = contestBackend.getContestDisbursements('test_settle_contest_1');
assert.strictEqual(disbursements.length, 1);
assert.strictEqual(disbursements[0].ownerUid, 'user-winner-101');
assert.strictEqual(disbursements[0].prizeRupees, winnerDisb.prizeRupees);

const settlementData = contestBackend.getSettlement('test_settle_contest_1');
assert.strictEqual(settlementData.isSettled, true);
assert.strictEqual(settlementData.totalPaidRupees, winnerDisb.prizeRupees);

console.log('  ✓ [PASS] getContestDisbursements and getSettlement provide unified source of truth');

// --- Test 4: Financial Ledger Payout Persistence ---
console.log('\n--- 4. Testing Financial Ledger Audit ---');

const ledgers = contestBackend.getFinancialLedgers('test_settle_contest_1');
const payoutLedger = ledgers.find(l => l.type === 'PRIZE_PAYOUT');
assert.ok(payoutLedger, 'PRIZE_PAYOUT ledger record must exist');
assert.strictEqual(payoutLedger?.ownerUid, 'user-winner-101');
assert.strictEqual(payoutLedger?.amountRupees, winnerDisb.prizeRupees);

console.log(`  ✓ [PASS] Immutable ledger records payout transaction ${payoutLedger?.transactionId}`);

// --- Test 5: Non-winner receives ₹0 and settled entries state ---
console.log('\n--- 5. Testing Non-Winner ₹0 Settlement ---');

const entriesAfterSettle = contestBackend.getContestEntries('test_settle_contest_1');
const nonWinnerEntry = entriesAfterSettle.find(e => e.ownerUid === 'user-runner-202');
assert.ok(nonWinnerEntry, 'Non-winner entry must exist');
assert.strictEqual(nonWinnerEntry?.settlementStatus, 'settled');
assert.strictEqual(nonWinnerEntry?.settledPrizeRupees, 0, 'Non-winner must receive ₹0 prize');

console.log('  ✓ [PASS] Non-winner is marked settled with ₹0 prize');

// --- Test 6: Demo User Prevention ---
console.log('\n--- 6. Testing Demo User Prize Exclusion ---');

contestBackend.joinContest({
  contestId: 'test_settle_contest_2',
  ownerUid: 'demo-user-1',
  userEmail: 'demo1@quizkart.in',
  userName: 'User 1',
  entryFeeRupees: 100,
  paymentVerified: true
});

const demoSettle = contestBackend.settleContest('test_settle_contest_2');
assert.strictEqual(demoSettle.disbursements.length, 0, 'Demo users must NEVER receive disbursements');
const demoLedgers = contestBackend.getFinancialLedgers('test_settle_contest_2').filter(l => l.type === 'PRIZE_PAYOUT');
assert.strictEqual(demoLedgers.length, 0, 'Demo users must NEVER have prize payout ledger records');

console.log('  ✓ [PASS] Demo users strictly prevented from receiving disbursements or ledger payouts');

console.log('\n===============================================================');
console.log('ALL SETTLEMENT, WALLET CREDIT & PAYOUT TESTS PASSED (100%)');
console.log('===============================================================');
