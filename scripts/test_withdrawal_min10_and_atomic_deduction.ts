import fs from 'fs';
import path from 'path';
import { contestBackend } from '../src/backend/contestEngine';
import { WithdrawalRequest } from '../src/types';

console.log('==================================================================');
console.log('QUIZKART: WITHDRAWAL MINIMUM (₹10) & INSTANT WALLET DEDUCTION TESTS');
console.log('==================================================================\n');

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

const uid = 'TEST_USER_MIN10_DEDUCT';
const email = 'min10_user@quizkart.in';

const setupUserWinnings = (amountRupees: number) => {
  contestBackend.resetForTesting();
  contestBackend.addFinancialLedgerRecord({
    transactionId: `TX_WIN_${Date.now()}_${amountRupees}`,
    contestId: 'CONTEST_MIN10',
    entryId: 'ENTRY_MIN10',
    ownerUid: uid,
    userEmail: email,
    type: 'PRIZE_PAYOUT',
    status: 'COMPLETED',
    amountPaise: amountRupees * 100,
    amountRupees,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now() - 1000,
    notes: 'Settled prize winnings'
  });
};

// Test 1: Minimum ₹10 withdrawal accepted on backend & UI checks
setupUserWinnings(160);
const res10 = contestBackend.validateAndSubmitWithdrawal(
  { id: 'QK-WTH-9001', amount: 10 },
  uid,
  email,
  [],
  160
);
const withdrawalPageSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/WithdrawalPage.tsx'), 'utf-8');
const withdrawModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/WithdrawModal.tsx'), 'utf-8');

assert(
  res10.success === true &&
  res10.withdrawableBalance === 150 &&
  withdrawalPageSrc.includes('Min ₹10 - Max ₹5000') &&
  withdrawalPageSrc.includes('min={10}') &&
  withdrawModalSrc.includes('Min ₹10 - Max ₹5000') &&
  withdrawModalSrc.includes('min={10}'),
  1,
  'Minimum ₹10 withdrawal accepted cleanly on backend & UI',
  `₹10 validated with remaining withdrawable ₹${res10.withdrawableBalance}; UI limits & inputs set to ₹10 min.`
);

// Test 2: Withdrawal below ₹10 (₹9, ₹5, ₹0, -10) is rejected
const res9 = contestBackend.validateAndSubmitWithdrawal({ amount: 9 }, uid, email, [], 160);
const res5 = contestBackend.validateAndSubmitWithdrawal({ amount: 5 }, uid, email, [], 160);
const res0 = contestBackend.validateAndSubmitWithdrawal({ amount: 0 }, uid, email, [], 160);
const resNeg = contestBackend.validateAndSubmitWithdrawal({ amount: -10 }, uid, email, [], 160);

assert(
  !res9.success &&
  res9.error?.includes('₹10') &&
  !res5.success &&
  !res0.success &&
  !resNeg.success,
  2,
  'Withdrawals below ₹10 (₹9, ₹5, ₹0, -₹10) are strictly rejected',
  `₹9 rejected with: "${res9.error}"`
);

// Test 3: Wallet balance ₹160 with ₹60 withdrawal -> wallet becomes ₹100 immediately
setupUserWinnings(160);
let walletBalance = 160;
const w60: WithdrawalRequest = {
  id: 'QK-WTH-9002',
  requestId: 'QK-WTH-9002',
  ownerUid: uid,
  userId: uid,
  userName: 'Tester',
  userEmail: email,
  email,
  phone: '9876543210',
  accountHolderName: 'Tester',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  amount: 60,
  timestamp: '2026-11-13 10:00 AM',
  status: 'pending'
};
const valid60 = contestBackend.validateAndSubmitWithdrawal(w60, uid, email, [], 160);
const deduct60 = contestBackend.applyWithdrawalDeduction(walletBalance, w60);
walletBalance = deduct60.nextWalletBalance;

assert(
  valid60.success &&
  deduct60.success &&
  !deduct60.alreadyDeducted &&
  walletBalance === 100 &&
  deduct60.updatedWithdrawal.walletDeducted === true &&
  deduct60.updatedWithdrawal.walletDeductedAmount === 60,
  3,
  'Wallet ₹160 after ₹60 withdrawal immediately becomes ₹100',
  `Pre-wallet: ₹160 -> Post-wallet: ₹${walletBalance}; walletDeducted=${deduct60.updatedWithdrawal.walletDeducted}`
);

// Test 4: Header (Navbar) & ProfileWallet read the exact same userProfile.walletBalance + live profile sync
const navbarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Navbar.tsx'), 'utf-8');
const profileWalletSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ProfileWallet.tsx'), 'utf-8');
const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');

assert(
  navbarSrc.includes('walletBalance') &&
  profileWalletSrc.includes('const currentWalletBalance = Number(userProfile.walletBalance) || 0;') &&
  appSrc.includes('submitWithdrawalTransaction') &&
  appSrc.includes('subscribeToUserProfileFromFirestore') &&
  appSrc.includes('const optimisticBalance = Math.max(0, preTxBalance - reqAmt);'),
  4,
  'Header balance and Profile Wallet Credits synchronize immediately from unified walletBalance',
  'App.tsx deducts userProfile.walletBalance synchronously on submit and subscribes to Firestore user profile updates.'
);

// Test 5: Refresh and re-login preserve ₹100 (updatedAt timestamp & Firestore precedence)
const hasTimestampedUpdates =
  appSrc.includes('updatedAt: nowIso') &&
  appSrc.includes('updatedAt: updatedRaw.updatedAt || new Date().toISOString()') &&
  appSrc.includes('subscribeToUserProfileFromFirestore(targetUid, cleanEmail, applyRemoteProfile)');

assert(
  hasTimestampedUpdates,
  5,
  'Refresh and logout/login preserve ₹100 without reverting to stale cache/Firestore balance',
  'Local and Firestore updates both stamp fresh ISO updatedAt so newer walletBalance ₹100 wins across reload & re-login.'
);

// Test 6: Duplicate submission / double call does not deduct twice
const duplicateDeduct = contestBackend.applyWithdrawalDeduction(walletBalance, deduct60.updatedWithdrawal);
const duplicateValidate = contestBackend.validateAndSubmitWithdrawal(
  deduct60.updatedWithdrawal,
  uid,
  email,
  [deduct60.updatedWithdrawal],
  160
);

assert(
  duplicateDeduct.alreadyDeducted === true &&
  duplicateDeduct.nextWalletBalance === 100 &&
  !duplicateValidate.success &&
  appSrc.includes('processedWithdrawalTxIdsRef.current.has(wthId)') &&
  withdrawalPageSrc.includes('submittingRef.current'),
  6,
  'Duplicate submission / rapid double click does not deduct twice',
  `Wallet remains ₹${duplicateDeduct.nextWalletBalance}; duplicate request blocked at UI, App, Backend, and Firestore tx.`
);

// Test 7: Pending withdrawal cannot be withdrawn again (reservation hold enforced)
const secondRequestWhilePending = contestBackend.validateAndSubmitWithdrawal(
  { id: 'QK-WTH-9003', amount: 20 },
  uid,
  email,
  [deduct60.updatedWithdrawal],
  160
);

assert(
  !secondRequestWhilePending.success &&
  secondRequestWhilePending.error?.toLowerCase().includes('pending'),
  7,
  'Cannot submit a second withdrawal while an active withdrawal is pending',
  `Blocked with: "${secondRequestWhilePending.error}"`
);

// Test 8: Rejected or cancelled withdrawal refunds reserved amount exactly once
const rejectTransition1 = contestBackend.applyWithdrawalStatusTransition(
  walletBalance,
  deduct60.updatedWithdrawal,
  'rejected'
);
const rejectTransition2 = contestBackend.applyWithdrawalStatusTransition(
  rejectTransition1.nextWalletBalance,
  rejectTransition1.updatedWithdrawal,
  'rejected'
);
const cancelOnAlreadyRejected = contestBackend.applyWithdrawalStatusTransition(
  rejectTransition2.nextWalletBalance,
  rejectTransition1.updatedWithdrawal,
  'cancelled'
);
const adminSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminPage.tsx'), 'utf-8');

assert(
  rejectTransition1.changed &&
  rejectTransition1.refunded &&
  rejectTransition1.nextWalletBalance === 160 &&
  !rejectTransition2.changed &&
  !rejectTransition2.refunded &&
  rejectTransition2.nextWalletBalance === 160 &&
  !cancelOnAlreadyRejected.changed &&
  adminSrc.includes('processWithdrawalStatusTransaction'),
  8,
  'Rejected/cancelled withdrawal refunds ₹60 back to ₹160 exactly once',
  `First reject: ₹100 -> ₹${rejectTransition1.nextWalletBalance}; repeated reject/cancel stays ₹${cancelOnAlreadyRejected.nextWalletBalance}.`
);

// Test 9: Approved withdrawal does NOT trigger a second deduction
setupUserWinnings(160);
const wApprove: WithdrawalRequest = { ...w60, id: 'QK-WTH-9004', requestId: 'QK-WTH-9004' };
const stepSubmit = contestBackend.applyWithdrawalDeduction(160, wApprove);
const stepApprove1 = contestBackend.applyWithdrawalStatusTransition(stepSubmit.nextWalletBalance, stepSubmit.updatedWithdrawal, 'approved');
const stepApprove2 = contestBackend.applyWithdrawalStatusTransition(stepApprove1.nextWalletBalance, stepApprove1.updatedWithdrawal, 'approved');

assert(
  stepSubmit.nextWalletBalance === 100 &&
  stepApprove1.changed &&
  !stepApprove1.refunded &&
  stepApprove1.nextWalletBalance === 100 &&
  !stepApprove2.changed &&
  stepApprove2.nextWalletBalance === 100,
  9,
  'Approved withdrawal preserves single deduction (no second deduction)',
  `After submission: ₹${stepSubmit.nextWalletBalance}; After approval: ₹${stepApprove1.nextWalletBalance}; After repeat approval: ₹${stepApprove2.nextWalletBalance}.`
);

// Test 10: Withdrawal above eligible available balance (and deposited funds protection) is rejected
setupUserWinnings(50); // User won ₹50, even if total wallet has ₹1000 deposited
const aboveEligible = contestBackend.validateAndSubmitWithdrawal({ amount: 60 }, uid, email, [], 50);
const aboveWallet = contestBackend.applyWithdrawalDeduction(40, { ...w60, id: 'QK-WTH-9005', amount: 60 });
const aboveMax = contestBackend.validateAndSubmitWithdrawal({ amount: 5001 }, uid, email, [], 10000);

assert(
  !aboveEligible.success &&
  !aboveWallet.success &&
  aboveWallet.nextWalletBalance === 40 &&
  !aboveMax.success &&
  aboveMax.error?.includes('5000'),
  10,
  'Withdrawals above eligible balance, wallet balance, or ₹5000 max limit are rejected without negative balance',
  `Over eligible (₹60 > ₹50) rejected; overdraft (₹60 > ₹40) kept ₹${aboveWallet.nextWalletBalance}; >₹5000 rejected.`
);

console.log('------------------------------------------------------------------');
console.log(`RESULTS: ${passCount} / 10 TESTS PASSED, ${failCount} FAILED.`);
console.log('------------------------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
}
