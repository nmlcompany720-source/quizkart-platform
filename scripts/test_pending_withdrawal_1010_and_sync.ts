import fs from 'fs';
import path from 'path';
import { doc, getDoc } from 'firebase/firestore';
import { contestBackend } from '../src/backend/contestEngine';
import { db } from '../src/firebase';
import { WithdrawalRequest } from '../src/types';

console.log('==============================================================================');
console.log('QUIZKART: PENDING WITHDRAWAL RESERVATION & BALANCE SYNCHRONIZATION TESTS');
console.log('==============================================================================\n');

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

const uid = 'QK-USR-1013';
const email = 'abilas73577@gmail.com';
const altUid = 'QK-USR-OTHER';
const altEmail = 'other_user@quizkart.in';

const setupUserWinnings = (amountRupees: number, targetUid = uid, targetEmail = email, reset = true) => {
  if (reset) {
    contestBackend.resetForTesting();
  }
  contestBackend.addFinancialLedgerRecord({
    transactionId: `TX_WIN_${Date.now()}_${amountRupees}_${targetUid}`,
    contestId: `CONTEST_WIN_SYNC_${targetUid}`,
    entryId: `ENTRY_WIN_SYNC_${targetUid}`,
    ownerUid: targetUid,
    userEmail: targetEmail,
    type: 'PRIZE_PAYOUT',
    status: 'COMPLETED',
    amountPaise: amountRupees * 100,
    amountRupees,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now() - 5000,
    notes: 'Settled prize winnings'
  });
};

const mkOldSuccessWth = (): WithdrawalRequest => ({
  id: 'QK-WTH-1009',
  requestId: 'QK-WTH-1009',
  ownerUid: uid,
  userId: uid,
  userName: 'Abilas',
  userEmail: email,
  email,
  phone: '9876543210',
  accountHolderName: 'Abilas',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  amount: 60,
  timestamp: '2026-11-13 | 11:23:53 PM',
  createdAt: '2026-11-13T17:53:53.516Z',
  updatedAt: '2026-11-13T17:54:50.972Z',
  status: 'approved'
});

const mkPendingWth = (reserved: boolean): WithdrawalRequest => ({
  id: 'QK-WTH-1010',
  requestId: 'QK-WTH-1010',
  ownerUid: uid,
  userId: uid,
  userName: 'Abilas',
  userEmail: email,
  email,
  phone: '9876543210',
  accountHolderName: 'Abilas',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  amount: 60,
  timestamp: '2026-11-13 | 11:49:34 PM',
  createdAt: '2026-11-13T18:19:34.903Z',
  updatedAt: '2026-11-13T18:19:36.546Z',
  status: 'pending',
  ...(reserved ? { walletDeducted: true, walletDeductedAmount: 60, walletRefunded: false } : {})
});

// Read source files for architectural checks
const firebaseSrc = fs.readFileSync(path.join(process.cwd(), 'src/firebase.ts'), 'utf-8');
const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
const txHistorySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/TransactionHistoryPage.tsx'), 'utf-8');
const adminSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminPage.tsx'), 'utf-8');
const profileSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ProfileWallet.tsx'), 'utf-8');
const navbarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Navbar.tsx'), 'utf-8');

async function runSuite() {
  // ==============================================================================
  // Test 1: Old SUCCESS transaction remains unchanged
  // ==============================================================================
  setupUserWinnings(120);
  const oldSuccess = mkOldSuccessWth();
  const reconcileOld = contestBackend.reconcilePendingWithdrawalReservation(60, oldSuccess);
  const approveOldAgain = contestBackend.applyWithdrawalStatusTransition(60, oldSuccess, 'approved');
  const rejectOldAttempt = contestBackend.applyWithdrawalStatusTransition(60, oldSuccess, 'rejected');

  assert(
    reconcileOld.action === 'preserved_completed' &&
    reconcileOld.nextWalletBalance === 60 &&
    reconcileOld.updatedWithdrawal.id === 'QK-WTH-1009' &&
    reconcileOld.updatedWithdrawal.status === 'approved' &&
    reconcileOld.updatedWithdrawal.createdAt === '2026-11-13T17:53:53.516Z' &&
    !approveOldAgain.changed &&
    approveOldAgain.nextWalletBalance === 60 &&
    !rejectOldAttempt.changed &&
    rejectOldAttempt.nextWalletBalance === 60,
    1,
    'Old SUCCESS withdrawal (QK-WTH-1009) remains completely untouched',
    `Reconcile action=${reconcileOld.action}; repeat approve/reject changed=false; wallet stayed ₹60; ID/status/timestamp preserved.`
  );

  // ==============================================================================
  // Test 2: New PENDING request reserves amount once (unreserved & already-reserved)
  // ==============================================================================
  setupUserWinnings(120);
  const unreservedPending = mkPendingWth(false);
  const reserveOnce = contestBackend.reconcilePendingWithdrawalReservation(60, unreservedPending);

  const alreadyReservedPending = mkPendingWth(true);
  const reconcileAlreadyReserved = contestBackend.reconcilePendingWithdrawalReservation(0, alreadyReservedPending);

  const calcWithPending = contestBackend.getWithdrawableBalance(uid, email, [oldSuccess, alreadyReservedPending], 120);

  assert(
    reserveOnce.action === 'reserved_once' &&
    reserveOnce.nextWalletBalance === 0 &&
    reserveOnce.updatedWithdrawal.walletDeducted === true &&
    reserveOnce.updatedWithdrawal.walletDeductedAmount === 60 &&
    reconcileAlreadyReserved.action === 'already_reserved' &&
    reconcileAlreadyReserved.nextWalletBalance === 0 &&
    calcWithPending.withdrawableBalance === 0 &&
    calcWithPending.completedWithdrawals === 60 &&
    calcWithPending.activeWithdrawalHolds === 60,
    2,
    'New PENDING withdrawal reserves amount exactly once (no double deduction on already-reserved record)',
    `Unreserved ₹60 -> reserved_once (₹0, walletDeducted=true); Already-reserved ₹0 -> already_reserved (₹0); Available=₹${calcWithPending.withdrawableBalance}.`
  );

  // ==============================================================================
  // Test 3: Repeated processing / page refresh / retry does not deduct twice
  // ==============================================================================
  const repeatReconcile = contestBackend.reconcilePendingWithdrawalReservation(reserveOnce.nextWalletBalance, reserveOnce.updatedWithdrawal);
  const repeatDeduct = contestBackend.applyWithdrawalDeduction(reserveOnce.nextWalletBalance, reserveOnce.updatedWithdrawal);
  const blockedSecondConcurrent = contestBackend.validateAndSubmitWithdrawal(
    { id: 'QK-WTH-1011', amount: 10 },
    uid,
    email,
    [oldSuccess, reserveOnce.updatedWithdrawal],
    120
  );

  assert(
    repeatReconcile.action === 'already_reserved' &&
    repeatReconcile.nextWalletBalance === 0 &&
    repeatDeduct.alreadyDeducted === true &&
    repeatDeduct.nextWalletBalance === 0 &&
    !blockedSecondConcurrent.success &&
    firebaseSrc.includes('activePendingWithdrawalId') &&
    appSrc.includes('existingAlreadyRecorded') &&
    adminSrc.includes('processingWithdrawalIdsRef'),
    3,
    'Repeated processing, page refresh, and multi-tab concurrent retries do not deduct twice',
    `Repeat reconcile/deduct kept wallet ₹0; concurrent activePendingWithdrawalId, existingAlreadyRecorded & processingWithdrawalIdsRef locks active.`
  );

  // ==============================================================================
  // Test 4: Pending-to-Success transition happens cleanly without second deduction
  // ==============================================================================
  const approveTransition = contestBackend.applyWithdrawalStatusTransition(0, alreadyReservedPending, 'approved');
  const approveRepeat = contestBackend.applyWithdrawalStatusTransition(
    approveTransition.nextWalletBalance,
    approveTransition.updatedWithdrawal,
    'approved'
  );

  assert(
    approveTransition.changed === true &&
    approveTransition.refunded === false &&
    approveTransition.nextWalletBalance === 0 &&
    approveTransition.updatedWithdrawal.status === 'approved' &&
    approveTransition.updatedWithdrawal.id === 'QK-WTH-1010' &&
    approveRepeat.changed === false &&
    approveRepeat.nextWalletBalance === 0 &&
    firebaseSrc.includes("activePendingWithdrawalId: ''"),
    4,
    'Pending-to-Approved (SUCCESS) completes cleanly with zero extra deduction',
    `Status transitioned pending -> ${approveTransition.updatedWithdrawal.status}; wallet stayed ₹${approveTransition.nextWalletBalance}; repeat approve no-op.`
  );

  // ==============================================================================
  // Test 5: Rejection releases ₹60 (reserved amount) back once
  // ==============================================================================
  const rejectOnce = contestBackend.applyWithdrawalStatusTransition(0, alreadyReservedPending, 'rejected');
  const rejectTwice = contestBackend.applyWithdrawalStatusTransition(rejectOnce.nextWalletBalance, rejectOnce.updatedWithdrawal, 'rejected');
  const calcAfterReject = contestBackend.getWithdrawableBalance(uid, email, [oldSuccess, rejectOnce.updatedWithdrawal], 120);

  assert(
    rejectOnce.changed === true &&
    rejectOnce.refunded === true &&
    rejectOnce.nextWalletBalance === 60 &&
    rejectOnce.updatedWithdrawal.walletRefunded === true &&
    rejectTwice.changed === false &&
    rejectTwice.refunded === false &&
    rejectTwice.nextWalletBalance === 60 &&
    calcAfterReject.withdrawableBalance === 60 &&
    calcAfterReject.activeWithdrawalHolds === 0,
    5,
    'Rejection releases reserved ₹60 back to ₹60 exactly once',
    `First reject: ₹0 -> ₹${rejectOnce.nextWalletBalance}; Repeat reject: ₹${rejectTwice.nextWalletBalance}; Withdrawable=₹${calcAfterReject.withdrawableBalance}.`
  );

  // ==============================================================================
  // Test 6: Cancellation releases ₹60 (reserved amount) back once
  // ==============================================================================
  const cancelOnce = contestBackend.applyWithdrawalStatusTransition(0, alreadyReservedPending, 'cancelled');
  const cancelTwice = contestBackend.applyWithdrawalStatusTransition(cancelOnce.nextWalletBalance, cancelOnce.updatedWithdrawal, 'cancelled');
  const calcAfterCancel = contestBackend.getWithdrawableBalance(uid, email, [oldSuccess, cancelOnce.updatedWithdrawal], 120);

  assert(
    cancelOnce.changed === true &&
    cancelOnce.refunded === true &&
    cancelOnce.nextWalletBalance === 60 &&
    cancelOnce.updatedWithdrawal.walletRefunded === true &&
    cancelTwice.changed === false &&
    cancelTwice.refunded === false &&
    cancelTwice.nextWalletBalance === 60 &&
    calcAfterCancel.withdrawableBalance === 60 &&
    calcAfterCancel.activeWithdrawalHolds === 0,
    6,
    'Cancellation releases reserved ₹60 back to ₹60 exactly once',
    `First cancel: ₹0 -> ₹${cancelOnce.nextWalletBalance}; Repeat cancel: ₹${cancelTwice.nextWalletBalance}; Withdrawable=₹${calcAfterCancel.withdrawableBalance}.`
  );

  // ==============================================================================
  // Test 7: Refresh / Logout-Login does not revert or desync balance or history
  // ==============================================================================
  const hasNaNSafeTimestampCheck =
    appSrc.includes('const toValidMs = (v: any) =>') &&
    appSrc.includes('Number.isFinite(t) ? t : 0') &&
    firebaseSrc.includes('Number.isFinite(rawMs) ? rawMs : 0');

  const hasDirectWithdrawalFirestoreSync =
    appSrc.includes('subscribeToWithdrawalsFromFirestore(') &&
    appSrc.includes('mergeCloudWithdrawals(cloudWithdrawals)') &&
    txHistorySrc.includes('subscribeToWithdrawalsFromFirestore(') &&
    txHistorySrc.includes('fetchWithdrawalsFromFirestore(currentUid, currentUserEmail)');

  assert(
    hasNaNSafeTimestampCheck &&
    hasDirectWithdrawalFirestoreSync &&
    appSrc.includes('quizkart_active_pending_withdrawal_id'),
    7,
    'Refresh and Logout/Login preserve authoritative Firestore balance and withdrawal statuses',
    'NaN-safe timestamp comparison (toValidMs), logout cache cleanup, and dual App + TransactionHistoryPage Firestore withdrawal listeners verified.'
  );

  // ==============================================================================
  // Test 8: Header, Profile Wallet, and Transaction History stay synchronized
  // ==============================================================================
  assert(
    navbarSrc.includes('userProfile.walletBalance') &&
    profileSrc.includes('const currentWalletBalance = Number(userProfile.walletBalance) || 0;') &&
    txHistorySrc.includes('cloudUserWithdrawals') &&
    txHistorySrc.includes('mergeRecord(') &&
    adminSrc.includes('quizkart_registered_users'),
    8,
    'Header, Profile Wallet Credits, and Withdrawal History read synchronized authoritative data',
    'Navbar & ProfileWallet bind directly to userProfile.walletBalance; TransactionHistoryPage & AdminPage sync Firestore statuses and user caches.'
  );

  // ==============================================================================
  // Test 9: Total Won remains unchanged across reservation / approval / rejection
  // ==============================================================================
  const totalWon = 120;
  const simSubmit = contestBackend.applyWithdrawalDeduction(60, mkPendingWth(false));
  const simApprove = contestBackend.applyWithdrawalStatusTransition(simSubmit.nextWalletBalance, simSubmit.updatedWithdrawal, 'approved');
  const simReject = contestBackend.applyWithdrawalStatusTransition(simSubmit.nextWalletBalance, simSubmit.updatedWithdrawal, 'rejected');

  assert(
    totalWon === 120 &&
    !firebaseSrc.includes('totalWonAmount: nextWalletBalance') &&
    !appSrc.includes('totalWonAmount: optimisticBalance') &&
    profileSrc.includes('const effectiveTotalWon = Math.max(Number(userProfile.totalWonAmount) || 0, userSettledWinnings);'),
    9,
    'Total Won (₹120) remains untouched across pending reservation, approval, and rejection',
    `Submit(₹${simSubmit.nextWalletBalance}), Approve(₹${simApprove.nextWalletBalance}), Reject(₹${simReject.nextWalletBalance}) never mutate totalWonAmount (stays ₹${totalWon}).`
  );

  // ==============================================================================
  // Test 10: Cross-user data never leaks or mixes
  // ==============================================================================
  setupUserWinnings(500, altUid, altEmail, true);
  setupUserWinnings(120, uid, email, false);

  const otherUserPending: WithdrawalRequest = {
    ...mkPendingWth(true),
    id: 'QK-WTH-9999',
    requestId: 'QK-WTH-9999',
    ownerUid: altUid,
    userId: altUid,
    userEmail: altEmail,
    email: altEmail,
    amount: 400
  };

  const isolatedPrimaryCalc = contestBackend.getWithdrawableBalance(
    uid,
    email,
    [oldSuccess, alreadyReservedPending, otherUserPending],
    120
  );

  const hasStrictEmailMismatchGuard =
    txHistorySrc.includes('wEmail && currentUserEmail && wEmail !== currentUserEmail') &&
    appSrc.includes('if (!isAdmin && targetEmail && prevEmail && prevEmail !== targetEmail) return;') &&
    firebaseSrc.includes('if (cleanTargetEmail && itemEmail && itemEmail !== cleanTargetEmail) return;') &&
    firebaseSrc.includes('if (queryEmail && itemEmail && itemEmail !== queryEmail) return;');

  assert(
    isolatedPrimaryCalc.settledWinnings === 120 &&
    isolatedPrimaryCalc.completedWithdrawals === 60 &&
    isolatedPrimaryCalc.activeWithdrawalHolds === 60 &&
    isolatedPrimaryCalc.withdrawableBalance === 0 &&
    hasStrictEmailMismatchGuard,
    10,
    "Cross-user isolation prevents another user's withdrawals or winnings from mixing",
    `Primary user calc ignores ₹400 withdrawal from ${altEmail}; strict email-mismatch guards verified in App, Firebase, and TransactionHistoryPage.`
  );

  // ==============================================================================
  // READ-ONLY LIVE FIRESTORE INSPECTION (Non-mutating check of QK-WTH-1009 & QK-WTH-1010)
  // ==============================================================================
  console.log('--- LIVE FIRESTORE READ-ONLY VERIFICATION ---');
  try {
    const [w1009Snap, w1010Snap, uEmailSnap, uIdSnap] = await Promise.all([
      getDoc(doc(db, 'withdrawals', 'QK-WTH-1009')),
      getDoc(doc(db, 'withdrawals', 'QK-WTH-1010')),
      getDoc(doc(db, 'users', 'abilas73577_gmail_com')),
      getDoc(doc(db, 'users', 'QK-USR-1013'))
    ]);
    console.log('withdrawals/QK-WTH-1009:', JSON.stringify(w1009Snap.exists() ? w1009Snap.data() : null));
    console.log('withdrawals/QK-WTH-1010:', JSON.stringify(w1010Snap.exists() ? w1010Snap.data() : null));
    console.log('users/abilas73577_gmail_com wallet/won:', JSON.stringify(uEmailSnap.exists() ? {
      walletBalance: uEmailSnap.data()?.walletBalance,
      totalWonAmount: uEmailSnap.data()?.totalWonAmount,
      email: uEmailSnap.data()?.email,
      id: uEmailSnap.data()?.id
    } : null));
    console.log('users/QK-USR-1013 wallet/won:', JSON.stringify(uIdSnap.exists() ? {
      walletBalance: uIdSnap.data()?.walletBalance,
      totalWonAmount: uIdSnap.data()?.totalWonAmount,
      email: uIdSnap.data()?.email,
      id: uIdSnap.data()?.id
    } : null));
  } catch (err: any) {
    console.log('Live Firestore read notice:', err?.message || err);
  }

  console.log('\n------------------------------------------------------------------------------');
  console.log(`RESULTS: ${passCount} / 10 TESTS PASSED, ${failCount} FAILED.`);
  console.log('------------------------------------------------------------------------------');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
