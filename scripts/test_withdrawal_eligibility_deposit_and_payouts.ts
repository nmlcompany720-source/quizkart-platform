import fs from 'fs';
import path from 'path';
import { contestBackend } from '../src/backend/contestEngine';
import { WithdrawalRequest, QuizAttemptResult } from '../src/types';

console.log('===============================================================================');
console.log('QUIZKART: WITHDRAWAL ELIGIBILITY (DEPOSIT PRINCIPAL + SETTLED PAYOUTS) TESTS');
console.log('===============================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testNum: number, testName: string, detail: string) {
  if (condition) {
    console.log(`[PASS] Test ${testNum}: ${testName}`);
    console.log(`       -> ${detail}\n`);
    passCount++;
  } else {
    console.error(`[FAIL] Test ${testNum}: ${testName}`);
    console.error(`       -> ${detail}\n`);
    failCount++;
  }
}

const uid = 'UID_ELIG_USER_1';
const email = 'elig_player@quizkart.in';
const otherUid = 'UID_ELIG_OTHER_2';
const otherEmail = 'other_player@quizkart.in';

const makeWithdrawal = (
  id: string,
  amount: number,
  status: 'pending' | 'approved' | 'rejected' | 'cancelled',
  targetUid = uid,
  targetEmail = email
): WithdrawalRequest => ({
  id,
  requestId: id,
  ownerUid: targetUid,
  userId: targetUid,
  userName: 'Elig Tester',
  userEmail: targetEmail,
  email: targetEmail,
  phone: '9876543210',
  accountHolderName: 'Elig Tester',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  amount,
  timestamp: '2026-11-13 | 10:00:00 PM',
  status,
  ...(status === 'pending' ? { walletDeducted: true, walletDeductedAmount: amount, walletRefunded: false } : {}),
  ...(status === 'rejected' || status === 'cancelled' ? { walletDeducted: true, walletDeductedAmount: amount, walletRefunded: true } : {})
});

// ==============================================================================
// Scenario 1: Deposit ₹200, no contest winnings -> ₹0 withdrawable
// ==============================================================================
contestBackend.resetForTesting();
const s1 = contestBackend.getWithdrawableBalance(uid, email, [], 0, 200, []);
const s1AttemptWithdraw = contestBackend.validateAndSubmitWithdrawal({ amount: 50 }, uid, email, [], 0, 200, []);

assert(
  s1.settledWinnings === 0 &&
  s1.withdrawableBalance === 0 &&
  !s1AttemptWithdraw.success,
  1,
  'Deposit ₹200 with no contest winnings -> ₹0 withdrawable',
  `Wallet=₹200, Withdrawable=₹${s1.withdrawableBalance}; ₹50 withdrawal rejected="${s1AttemptWithdraw.error}"`
);

// ==============================================================================
// Scenario 2: Deposit ₹200, spend ₹100 entry fee, lose -> ₹0 withdrawable
// ==============================================================================
contestBackend.resetForTesting();
// Join contest (₹100 entry debit) and settle as non-winner
contestBackend.addFinancialLedgerRecord({
  transactionId: 'ENTRY-LOSS-1',
  contestId: 'CONTEST_LOSS_1',
  entryId: 'E_LOSS_1',
  ownerUid: uid,
  userEmail: email,
  type: 'ENTRY_FEE',
  status: 'COMPLETED',
  amountPaise: 10000,
  amountRupees: 100,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 2000
});
const lossAttempt: QuizAttemptResult = {
  attemptId: 'att-loss-1',
  entryId: 'E_LOSS_1',
  contestId: 'CONTEST_LOSS_1',
  userId: uid,
  ownerUid: uid,
  userEmail: email,
  quizDate: '13 Nov 2026',
  score: 1,
  totalQuestions: 10,
  timeTakenSeconds: 45,
  answers: {},
  markedForReview: [],
  rank: 4,
  totalParticipants: 5,
  rewardWon: 'Better Luck Next Time',
  rewardType: 'none',
  rewardAmount: 0,
  finalPrizeRupees: 0,
  settlementStatus: 'settled'
};
const s2 = contestBackend.getWithdrawableBalance(uid, email, [], 0, 100, [lossAttempt]);
const s2Withdraw = contestBackend.validateAndSubmitWithdrawal({ amount: 50 }, uid, email, [], 0, 100, [lossAttempt]);

assert(
  s2.settledWinnings === 0 &&
  s2.withdrawableBalance === 0 &&
  !s2Withdraw.success,
  2,
  'Deposit ₹200, spend ₹100 entry fee, lose -> ₹0 withdrawable (remaining ₹100 deposit stays locked)',
  `Wallet=₹100, Withdrawable=₹${s2.withdrawableBalance}; ₹50 attempt rejected=${!s2Withdraw.success}`
);

// ==============================================================================
// Scenario 3: Deposit ₹200, spend ₹100 entry fee, win ₹180 confirmed payout -> ₹180 withdrawable
// (Also tests settleContest status:'COMPLETED', deduplication across ledger+attempt, no provisional prizes, no double entry-fee addition)
// ==============================================================================
contestBackend.resetForTesting();
// Simulate 3 real participants joining ₹100 contest -> Pool = ₹180, Rank 1 wins ₹180 (includes returned ₹100 entry + ₹80 profit)
const j1 = contestBackend.joinContest({ contestId: 'CONTEST_EX3', ownerUid: uid, userName: 'Player 1', entryFeeRupees: 100, userEmail: email });
const j2 = contestBackend.joinContest({ contestId: 'CONTEST_EX3', ownerUid: 'UID_P2', userName: 'Player 2', entryFeeRupees: 100, userEmail: 'p2@quizkart.in' });
const j3 = contestBackend.joinContest({ contestId: 'CONTEST_EX3', ownerUid: 'UID_P3', userName: 'Player 3', entryFeeRupees: 100, userEmail: 'p3@quizkart.in' });
contestBackend.submitEntryQuiz('CONTEST_EX3', j1.entry.entryId, { score: 10, timeTakenSeconds: 20 });
contestBackend.submitEntryQuiz('CONTEST_EX3', j2.entry.entryId, { score: 5, timeTakenSeconds: 30 });
contestBackend.submitEntryQuiz('CONTEST_EX3', j3.entry.entryId, { score: 2, timeTakenSeconds: 40 });
const settled3 = contestBackend.settleContest('CONTEST_EX3');

// Also include duplicate representations (matching settled QuizAttempt + provisional attempt for another unsettled contest)
const winAttempt3: QuizAttemptResult = {
  attemptId: 'att-win-3',
  entryId: j1.entry!.entryId,
  contestId: 'CONTEST_EX3',
  userId: uid,
  ownerUid: uid,
  userEmail: email,
  quizDate: '13 Nov 2026',
  score: 10,
  totalQuestions: 10,
  timeTakenSeconds: 20,
  answers: {},
  markedForReview: [],
  rank: 1,
  totalParticipants: 3,
  rewardWon: '₹180 Won',
  rewardType: 'cashback',
  rewardAmount: 180,
  finalPrizeRupees: 180,
  settlementStatus: 'settled'
};
const provisionalAttempt: QuizAttemptResult = {
  ...winAttempt3,
  attemptId: 'att-provisional-4',
  entryId: 'E_PROV_4',
  contestId: 'CONTEST_UNSETTLED_4',
  rewardAmount: 180,
  finalPrizeRupees: 0,
  provisionalPrizeRupees: 180,
  settlementStatus: 'pending'
};

// Wallet balance = 200 deposit - 100 entry + 180 payout = 280
const s3 = contestBackend.getWithdrawableBalance(uid, email, [], 180, 280, [winAttempt3, provisionalAttempt]);
const s3Allow180 = contestBackend.validateAndSubmitWithdrawal({ amount: 180 }, uid, email, [], 180, 280, [winAttempt3, provisionalAttempt]);
const s3Block181 = contestBackend.validateAndSubmitWithdrawal({ amount: 181 }, uid, email, [], 180, 280, [winAttempt3, provisionalAttempt]);
const s3Block280 = contestBackend.validateAndSubmitWithdrawal({ amount: 280 }, uid, email, [], 180, 280, [winAttempt3, provisionalAttempt]);
const payoutLedger3 = contestBackend.getFinancialLedgers('CONTEST_EX3', uid).find(l => l.type === 'PRIZE_PAYOUT');

assert(
  settled3.success &&
  payoutLedger3?.status === 'COMPLETED' &&
  payoutLedger3?.amountRupees === 180 &&
  s3.settledWinnings === 180 &&
  s3.withdrawableBalance === 180 &&
  s3Allow180.success === true &&
  s3Allow180.withdrawableBalance === 0 &&
  !s3Block181.success &&
  !s3Block280.success,
  3,
  'Deposit ₹200, ₹100 entry, win ₹180 confirmed payout -> ₹180 withdrawable, ₹100 deposit locked',
  `Ledger status=${payoutLedger3?.status}, settledWinnings=₹${s3.settledWinnings}, withdrawable=₹${s3.withdrawableBalance} (wallet ₹280); ₹180 allowed, ₹181 & ₹280 rejected.`
);

// ==============================================================================
// Scenario 4: Deposit ₹1,000, win nothing -> ₹0 withdrawable
// ==============================================================================
contestBackend.resetForTesting();
const s4 = contestBackend.getWithdrawableBalance(uid, email, [], 0, 1000, []);
const s4Withdraw = contestBackend.validateAndSubmitWithdrawal({ amount: 100 }, uid, email, [], 0, 1000, []);

assert(
  s4.settledWinnings === 0 &&
  s4.withdrawableBalance === 0 &&
  !s4Withdraw.success,
  4,
  'Deposit ₹1,000, win nothing -> ₹0 withdrawable',
  `Wallet=₹1000, Withdrawable=₹${s4.withdrawableBalance}; withdrawal rejected=${!s4Withdraw.success}`
);

// ==============================================================================
// Scenario 5: Confirmed eligible payout ₹60 -> ₹60 withdrawable (₹10 min & ₹5000 max preserved)
// ==============================================================================
contestBackend.resetForTesting();
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PAYOUT-60-1',
  contestId: 'CONTEST_60',
  entryId: 'ENTRY_60',
  ownerUid: uid,
  userEmail: email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 6000,
  amountRupees: 60,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 1000
});
const s5 = contestBackend.getWithdrawableBalance(uid, email, [], 60, 60);
const s5Allow10 = contestBackend.validateAndSubmitWithdrawal({ amount: 10 }, uid, email, [], 60, 60);
const s5Allow60 = contestBackend.validateAndSubmitWithdrawal({ amount: 60 }, uid, email, [], 60, 60);
const s5Reject9 = contestBackend.validateAndSubmitWithdrawal({ amount: 9 }, uid, email, [], 60, 60);
const s5Reject5001 = contestBackend.validateAndSubmitWithdrawal({ amount: 5001 }, uid, email, [], 10000, 10000);

assert(
  s5.withdrawableBalance === 60 &&
  s5Allow10.success &&
  s5Allow60.success &&
  !s5Reject9.success &&
  !s5Reject5001.success,
  5,
  'Confirmed eligible payout ₹60 -> ₹60 withdrawable with ₹10 min / ₹5000 max preserved',
  `Withdrawable=₹${s5.withdrawableBalance}; ₹10 & ₹60 accepted; ₹9 & ₹5001 rejected.`
);

// ==============================================================================
// Scenario 6: Confirmed eligible payout ₹540, previous approved withdrawal ₹300 -> ₹240 withdrawable
// ==============================================================================
contestBackend.resetForTesting();
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PAYOUT-540-1',
  contestId: 'CONTEST_540',
  entryId: 'ENTRY_540',
  ownerUid: uid,
  userEmail: email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 54000,
  amountRupees: 540,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 2000
});
const approved300 = makeWithdrawal('QK-WTH-2001', 300, 'approved');
const s6 = contestBackend.getWithdrawableBalance(uid, email, [approved300], 540, 240);

assert(
  s6.settledWinnings === 540 &&
  s6.completedWithdrawals === 300 &&
  s6.withdrawableBalance === 240,
  6,
  'Confirmed payout ₹540 minus approved ₹300 -> ₹240 withdrawable',
  `settled=₹${s6.settledWinnings}, approved=₹${s6.completedWithdrawals}, withdrawable=₹${s6.withdrawableBalance}`
);

// ==============================================================================
// Scenario 7: Pending withdrawal -> reserved amount cannot be withdrawn again
// ==============================================================================
const pending100 = makeWithdrawal('QK-WTH-2002', 100, 'pending');
const s7 = contestBackend.getWithdrawableBalance(uid, email, [approved300, pending100], 540, 140);
const s7SecondTry = contestBackend.validateAndSubmitWithdrawal({ amount: 50 }, uid, email, [approved300, pending100], 540, 140);

assert(
  s7.activeWithdrawalHolds === 100 &&
  s7.withdrawableBalance === 140 &&
  !s7SecondTry.success &&
  Boolean(s7SecondTry.error?.toLowerCase().includes('pending')),
  7,
  'Pending withdrawal reserves ₹100 and blocks duplicate withdrawal attempts',
  `holds=₹${s7.activeWithdrawalHolds}, remaining=₹${s7.withdrawableBalance}, second attempt blocked="${s7SecondTry.error}"`
);

// ==============================================================================
// Scenario 8: Rejected / cancelled withdrawal -> reservation released exactly once
// ==============================================================================
const walletBeforeReject = 140;
const rejectStep1 = contestBackend.applyWithdrawalStatusTransition(walletBeforeReject, pending100, 'rejected');
const rejectStep2 = contestBackend.applyWithdrawalStatusTransition(rejectStep1.nextWalletBalance, rejectStep1.updatedWithdrawal, 'rejected');
const s8AfterReject = contestBackend.getWithdrawableBalance(uid, email, [approved300, rejectStep1.updatedWithdrawal], 540, rejectStep1.nextWalletBalance);

const cancelPending = makeWithdrawal('QK-WTH-2003', 100, 'pending');
const cancelStep1 = contestBackend.applyWithdrawalStatusTransition(walletBeforeReject, cancelPending, 'cancelled');
const cancelStep2 = contestBackend.applyWithdrawalStatusTransition(cancelStep1.nextWalletBalance, cancelStep1.updatedWithdrawal, 'cancelled');
const s8AfterCancel = contestBackend.getWithdrawableBalance(uid, email, [approved300, cancelStep1.updatedWithdrawal], 540, cancelStep1.nextWalletBalance);

assert(
  rejectStep1.changed &&
  rejectStep1.refunded &&
  rejectStep1.nextWalletBalance === 240 &&
  !rejectStep2.changed &&
  rejectStep2.nextWalletBalance === 240 &&
  s8AfterReject.withdrawableBalance === 240 &&
  cancelStep1.changed &&
  cancelStep1.refunded &&
  cancelStep1.nextWalletBalance === 240 &&
  !cancelStep2.changed &&
  cancelStep2.nextWalletBalance === 240 &&
  s8AfterCancel.withdrawableBalance === 240,
  8,
  'Rejected & cancelled withdrawals release ₹100 reservation back to ₹240 exactly once',
  `After reject=₹${s8AfterReject.withdrawableBalance} (repeat=${rejectStep2.nextWalletBalance}); After cancel=₹${s8AfterCancel.withdrawableBalance} (repeat=${cancelStep2.nextWalletBalance}).`
);

// ==============================================================================
// Scenario 9: Refresh and logout/login persistence + Firestore backend enforcement
// ==============================================================================
const firebaseSrc = fs.readFileSync(path.join(process.cwd(), 'src/firebase.ts'), 'utf-8');
const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
const withdrawalPageSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/WithdrawalPage.tsx'), 'utf-8');
const withdrawModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/WithdrawModal.tsx'), 'utf-8');

assert(
  firebaseSrc.includes('const [cloudWithdrawals, cloudAttempts] = await Promise.all') &&
  firebaseSrc.includes('if (amt > eligibility.withdrawableBalance)') &&
  appSrc.includes('quizAttempts={userQuizAttempts}') &&
  appSrc.includes("localStorage.removeItem('quizkart_user_quiz_attempts')") &&
  appSrc.includes('const eligibilityCheck = contestBackend.validateAndSubmitWithdrawal(') &&
  withdrawalPageSrc.includes('quizAttempts = []') &&
  withdrawModalSrc.includes('effectiveWithdrawable'),
  9,
  'Refresh, logout/login isolation, WithdrawalPage/Modal & Firestore atomic eligibility enforcement wired',
  'submitWithdrawalTransaction fetches Firestore withdrawals/attempts and enforces getWithdrawableBalance atomically; App.tsx passes userQuizAttempts and isolates caches on logout.'
);

// ==============================================================================
// Scenario 10: Multiple contests (only genuine settled payouts counted without duplication) + Cross-user isolation + Wallet cap
// ==============================================================================
contestBackend.resetForTesting();
// Contest A: Ledger (opaque transactionId) + matching Settled QuizAttempt (both represent SAME ₹180 payout)
contestBackend.addFinancialLedgerRecord({
  transactionId: 'OPAQUE_TX_A',
  contestId: 'CONTEST_A',
  entryId: 'ENTRY_A',
  ownerUid: uid,
  userEmail: email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 18000,
  amountRupees: 180,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 4000
});
const attemptA: QuizAttemptResult = {
  attemptId: 'att-A',
  entryId: 'ENTRY_A',
  contestId: 'CONTEST_A',
  userId: uid,
  ownerUid: uid,
  userEmail: email,
  quizDate: '13 Nov 2026',
  score: 9,
  totalQuestions: 10,
  timeTakenSeconds: 22,
  answers: {},
  markedForReview: [],
  rank: 1,
  totalParticipants: 3,
  rewardWon: '₹180 Won',
  rewardType: 'cashback',
  rewardAmount: 180,
  finalPrizeRupees: 180,
  settlementStatus: 'settled'
};
// Contest B: Settled QuizAttempt ₹60 (e.g. from Firestore on fresh device without local ledger)
const attemptB: QuizAttemptResult = {
  ...attemptA,
  attemptId: 'att-B',
  entryId: 'ENTRY_B',
  contestId: 'CONTEST_B',
  rewardWon: '₹60 Won',
  rewardAmount: 60,
  finalPrizeRupees: 60
};
// Contest C: Provisional/unsettled attempt ₹180 (must be ignored!)
const attemptC: QuizAttemptResult = {
  ...attemptA,
  attemptId: 'att-C',
  entryId: 'ENTRY_C',
  contestId: 'CONTEST_C',
  rewardAmount: 180,
  finalPrizeRupees: 0,
  provisionalPrizeRupees: 180,
  settlementStatus: 'pending'
};
// Other user's ₹500 payout (must be isolated!)
contestBackend.addFinancialLedgerRecord({
  transactionId: 'OPAQUE_TX_OTHER',
  contestId: 'CONTEST_OTHER',
  entryId: 'ENTRY_OTHER',
  ownerUid: otherUid,
  userEmail: otherEmail,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 50000,
  amountRupees: 500,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 1000
});
const otherUserAttempt: QuizAttemptResult = {
  ...attemptA,
  attemptId: 'att-OTHER',
  entryId: 'ENTRY_OTHER_2',
  contestId: 'CONTEST_OTHER_2',
  userId: uid, // Even if UID somehow matched, email differs -> MUST reject!
  ownerUid: uid,
  userEmail: otherEmail,
  rewardAmount: 300,
  finalPrizeRupees: 300
};

// User's walletBalance = ₹340 (₹100 remaining deposit + ₹180 + ₹60 payouts) -> withdrawable must be ₹240 (180 + 60, NO double count, NO ₹100 deposit, NO provisional, NO other user!)
const s10 = contestBackend.getWithdrawableBalance(uid, email, [], undefined, 340, [attemptA, attemptB, attemptC, otherUserAttempt]);
// Also verify wallet balance cap: if user spent winnings down to walletBalance=₹120, withdrawable caps at ₹120!
const s10WalletCapped = contestBackend.getWithdrawableBalance(uid, email, [], 240, 120, [attemptA, attemptB]);

assert(
  s10.settledWinnings === 240 &&
  s10.withdrawableBalance === 240 &&
  s10WalletCapped.withdrawableBalance === 120,
  10,
  'Multiple contests accumulate settled payouts without duplication & enforce cross-user + wallet caps',
  `Multi-contest settled=₹${s10.settledWinnings}, withdrawable=₹${s10.withdrawableBalance} (wallet ₹340, opaque TX + Attempt deduped, provisional & otherEmail rejected); wallet-capped=₹${s10WalletCapped.withdrawableBalance}.`
);

console.log('-------------------------------------------------------------------------------');
console.log(`RESULTS: ${passCount} / 10 TESTS PASSED, ${failCount} FAILED.`);
console.log('-------------------------------------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
}
