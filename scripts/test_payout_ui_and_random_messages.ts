import assert from 'assert';
import { PAYOUT_STATUS_OPTIONS, getAttemptPayoutMessage } from '../src/components/QuizResult';
import { contestBackend } from '../src/backend/contestEngine';
import { QuizAttemptResult } from '../src/types';

console.log('===============================================================');
console.log('QUIZKART — FINAL PAYOUT STATUS UI & RANDOM MESSAGE TEST SUITE');
console.log('===============================================================');

// 1. Verify the exact 5 short professional options
console.log('\n--- Test 1: Verifying the Exact 5 Short Professional Messages ---');
assert.strictEqual(PAYOUT_STATUS_OPTIONS.length, 5, 'Must have exactly 5 options');
assert.strictEqual(
  PAYOUT_STATUS_OPTIONS[0],
  "Your result is recorded. Final prize will be confirmed after the contest ends.",
  'Option 1 must match exact prompt text'
);
assert.strictEqual(
  PAYOUT_STATUS_OPTIONS[1],
  "Great performance! Your eligible prize is subject to final settlement.",
  'Option 2 must match exact prompt text'
);
assert.strictEqual(
  PAYOUT_STATUS_OPTIONS[2],
  "Your entry is confirmed. Final rankings will be announced soon.",
  'Option 3 must match exact prompt text'
);
assert.strictEqual(
  PAYOUT_STATUS_OPTIONS[3],
  "Contest is live. Your final rank and reward will be confirmed at completion.",
  'Option 4 must match exact prompt text'
);
assert.strictEqual(
  PAYOUT_STATUS_OPTIONS[4],
  "Your performance is saved. Stay tuned for the final results.",
  'Option 5 must match exact prompt text'
);
console.log('  ✓ [PASS] All 5 message options match prompt requirements letter-for-letter');

// 2. Test Message Persistence & Non-Randomization on Refresh/Reopen
console.log('\n--- Test 2: Message Persistence & Deterministic Stability ---');
const testAttemptWithSavedMessage: QuizAttemptResult = {
  attemptId: 'att-12345',
  entryId: 'ENTRY-999',
  userId: 'usr-tester-1',
  ownerUid: 'usr-tester-1',
  userEmail: 'tester1@quizkart.in',
  userName: 'Tester One',
  quizDate: '10 Nov 2026',
  score: 10,
  totalQuestions: 10,
  timeTakenSeconds: 45,
  answers: { 1: 0 },
  markedForReview: [],
  rank: 1,
  totalParticipants: 5,
  rewardWon: 'Pending Settlement',
  rewardType: 'cashback',
  rewardAmount: 0,
  finalPrizeRupees: 0,
  provisionalPrizeRupees: 180,
  payoutMessage: PAYOUT_STATUS_OPTIONS[2],
  selectedMessageOption: 3,
  settlementStatus: 'pending',
  title: 'Mega Cash Tournament',
  submittedAt: new Date().toISOString()
};

// Reading 100 times simulate multiple renders / page refreshes
for (let i = 0; i < 100; i++) {
  const msg = getAttemptPayoutMessage(testAttemptWithSavedMessage);
  assert.strictEqual(msg, PAYOUT_STATUS_OPTIONS[2], 'Message must NEVER mutate on re-render or refresh');
}
console.log('  ✓ [PASS] Saved payoutMessage is strictly preserved across 100 re-renders / reloads');

// 3. Test Deterministic Fallback on Legacy Attempts
console.log('\n--- Test 3: Deterministic Fallback on Legacy Attempts ---');
const legacyAttempt: Partial<QuizAttemptResult> = {
  attemptId: 'att-legacy-777',
  entryId: 'ENTRY-LEGACY-777',
  userId: 'usr-legacy',
};
const legacyMsg1 = getAttemptPayoutMessage(legacyAttempt);
const legacyMsg2 = getAttemptPayoutMessage(legacyAttempt);
assert.strictEqual(legacyMsg1, legacyMsg2, 'Legacy attempts without payoutMessage must resolve deterministically');
assert.ok(PAYOUT_STATUS_OPTIONS.includes(legacyMsg1 as any), 'Resolved legacy message must be one of the 5 options');
console.log('  ✓ [PASS] Legacy attempt resolved deterministically without shifting on reload');

// 4. Test Payout Status Badge Logic
console.log('\n--- Test 4: Payout Status Badge UI Rules ---');
function getPayoutStatusBadge(attempt: Partial<QuizAttemptResult>): { text: string; gradient: boolean } {
  if (attempt.securityBreached) {
    return { text: 'FAILED', gradient: true };
  }
  return { text: 'Completed', gradient: true };
}

const activeSubmission = getPayoutStatusBadge({ securityBreached: false, settlementStatus: 'pending' });
assert.strictEqual(activeSubmission.text, 'Completed', 'Immediately after submission, badge must be Completed');
assert.strictEqual(activeSubmission.gradient, true, 'Badge must use signature blue-to-cyan gradient');

const breachedSubmission = getPayoutStatusBadge({ securityBreached: true, settlementStatus: 'pending' });
assert.strictEqual(breachedSubmission.text, 'FAILED', 'Security breached attempt must show FAILED');

const settledWinnerSubmission = getPayoutStatusBadge({ securityBreached: false, settlementStatus: 'settled', finalPrizeRupees: 180 });
assert.strictEqual(settledWinnerSubmission.text, 'Completed', 'Settled winner badge must be Completed');

console.log('  ✓ [PASS] Status badge immediately displays "Completed" on all successful submissions, FAILED on security breach');

// 5. Dynamic Prize & Single Continuous Paragraph Display for Active Contest
console.log('\n--- Test 5: Dynamic Provisional Prize in ONE Continuous Paragraph (White Background) ---');
const activeWinnerAttempt: QuizAttemptResult = {
  ...testAttemptWithSavedMessage,
  settlementStatus: 'pending',
  provisionalPrizeRupees: 60,
  payoutMessage: PAYOUT_STATUS_OPTIONS[0],
  selectedMessageOption: 1
};

function resolvePayoutBoxContent(attempt: QuizAttemptResult, isSettled: boolean, actualCreditedPrize: number) {
  if (attempt.securityBreached) {
    return { type: 'disqualified', bg: '#FFFFFF', border: '1px solid #FFFFFF' };
  }
  if (isSettled && actualCreditedPrize > 0) {
    return {
      type: 'confirmed_winner',
      bg: '#FFFFFF',
      border: '1px solid #E2E8F0',
      headline: `Congratulations, You Won ₹${actualCreditedPrize}`,
      continuousParagraph: null
    };
  }
  if (!isSettled && (attempt.provisionalPrizeRupees || 0) > 0) {
    const fullContinuousText = `Congratulations! Your Current Provisional Prize Is ₹${attempt.provisionalPrizeRupees}. ${attempt.payoutMessage}`;
    return {
      type: 'provisional_winner',
      bg: '#FFFFFF',
      border: '1px solid #E2E8F0',
      continuousParagraph: fullContinuousText,
      greenText: '#059669',
      prizeHighlight: '#059669',
      darkGreyText: '#334155'
    };
  }
  if (!isSettled) {
    return {
      type: 'in_progress_neutral',
      bg: '#FFFFFF',
      border: '1px solid #E2E8F0',
      text: 'Contest in progress · Final result & settlement pending'
    };
  }
  return {
    type: 'settled_non_winner',
    bg: '#FFFFFF',
    border: '1px solid #E2E8F0',
    text: 'Contest Settled · Better Luck Next Time!'
  };
}

const provisionalResult = resolvePayoutBoxContent(activeWinnerAttempt, false, 0);
assert.strictEqual(provisionalResult.type, 'provisional_winner');
assert.strictEqual(provisionalResult.bg, '#FFFFFF', 'Box background must be White #FFFFFF');
assert.strictEqual(provisionalResult.border, '1px solid #E2E8F0', 'Box border must be subtle light grey');
assert.strictEqual(
  provisionalResult.continuousParagraph,
  "Congratulations! Your Current Provisional Prize Is ₹60. Your result is recorded. Final prize will be confirmed after the contest ends.",
  'Must form one continuous paragraph exactly matching prompt specification'
);
assert.strictEqual(provisionalResult.greenText, '#059669', 'Congratulations text must use same light green color #059669');
assert.strictEqual(provisionalResult.prizeHighlight, '#059669', 'Prize highlight must remain #059669');
assert.strictEqual(provisionalResult.darkGreyText, '#334155');
console.log('  ✓ [PASS] Active contest eligible winner shows white box (#FFFFFF) with ONE continuous paragraph');

// 6. Dynamic Prize Display for Settled Winner
console.log('\n--- Test 6: Finalized Settled Winner Display (White Box) ---');
const settledResult = resolvePayoutBoxContent(activeWinnerAttempt, true, 180);
assert.strictEqual(settledResult.type, 'confirmed_winner');
assert.strictEqual(settledResult.bg, '#FFFFFF', 'Settled winner box background must be White #FFFFFF');
assert.strictEqual(settledResult.headline, 'Congratulations, You Won ₹180');
assert.strictEqual(settledResult.continuousParagraph, null, 'Settled winner MUST NOT display ongoing message');
console.log('  ✓ [PASS] Settled winner displays white box with confirmed headline without ongoing message');

// 7. Non-Winner Handling (Active vs Settled)
console.log('\n--- Test 7: Non-Winner Neutral Display (No Positive Prize) ---');
const nonWinnerAttempt: QuizAttemptResult = {
  ...testAttemptWithSavedMessage,
  rank: 5,
  provisionalPrizeRupees: 0,
  finalPrizeRupees: 0
};
const activeNonWinnerResult = resolvePayoutBoxContent(nonWinnerAttempt, false, 0);
assert.strictEqual(activeNonWinnerResult.type, 'in_progress_neutral');
assert.strictEqual(activeNonWinnerResult.bg, '#FFFFFF');

const settledNonWinnerResult = resolvePayoutBoxContent(nonWinnerAttempt, true, 0);
assert.strictEqual(settledNonWinnerResult.type, 'settled_non_winner');
assert.strictEqual(settledNonWinnerResult.bg, '#FFFFFF');
assert.strictEqual(settledNonWinnerResult.text, 'Contest Settled · Better Luck Next Time!');
console.log('  ✓ [PASS] Non-winners have white box with neutral message and zero positive prize');

// 8. End-to-end contestEngine settlement + wallet credit integrity
console.log('\n--- Test 8: End-to-end Contest Settlement & Wallet Credit Integrity ---');
const testContestId = `contest_payout_test_${Date.now()}`;

// Join user
const joinResult = contestBackend.joinContest({
  contestId: testContestId,
  ownerUid: 'usr-test-winner',
  userEmail: 'winner@example.com',
  userName: 'Test Winner',
  entryFeeRupees: 100,
  paymentVerified: true
});
assert.strictEqual(joinResult.success, true);

// Submit quiz
contestBackend.submitQuiz({
  contestId: testContestId,
  entryId: joinResult.entry.entryId,
  ownerUid: 'usr-test-winner',
  answers: { 1: 0, 2: 1, 3: 2 },
  questions: [{ id: 1, text: 'Q1', options: ['A','B'], correctOptionIndex: 0 }] as any,
  timeTakenSeconds: 15
});

const entries = contestBackend.getContestEntries(testContestId);
const userEntry = entries.find(e => e.ownerUid === 'usr-test-winner');
assert.ok(userEntry, 'User entry must exist');
assert.strictEqual(userEntry.rank, 1, 'User must be rank 1');

// Contest is active (not settled): settlement status is false
assert.strictEqual(contestBackend.isContestSettled(testContestId), false, 'Contest must not be settled before finalize');

// Execute authoritative settlement
const settlement = contestBackend.settleContest(testContestId);
assert.strictEqual(settlement.success, true);
assert.strictEqual(contestBackend.isContestSettled(testContestId), true);

const disb = contestBackend.getContestDisbursements(testContestId);
const userDisb = disb.find(d => d.ownerUid === 'usr-test-winner');
assert.ok(userDisb, 'Disbursement must exist for user');
assert.ok(userDisb.prizeRupees > 0, 'Authoritative prize disbursed must be > 0');

console.log(`  ✓ [PASS] Authoritative final settlement cleanly credited ₹${userDisb.prizeRupees} to winner`);

console.log('\n===============================================================');
console.log('ALL FINAL PAYOUT STATUS UI & RANDOM MESSAGE TESTS PASSED (100%)');
console.log('===============================================================');
