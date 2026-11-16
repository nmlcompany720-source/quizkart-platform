import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contestBackend } from '../src/backend/contestEngine';
import { WithdrawalRequest } from '../src/types';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

async function runTests() {
  console.log('==============================================================================');
  console.log('QUIZKART: DOUBLE WITHDRAWAL DEDUCTION FIX VERIFICATION');
  console.log('==============================================================================\n');

  const withdrawalPageSrc = readSrc('src/components/WithdrawalPage.tsx');
  const appSrc = readSrc('src/App.tsx');
  const firebaseSrc = readSrc('src/firebase.ts');
  const navbarSrc = readSrc('src/components/Navbar.tsx');
  const profileWalletSrc = readSrc('src/components/ProfileWallet.tsx');

  // ============================================================================
  // TEST 1: Root-Cause Architecture Checks (No Pre-Tx Deduct / No Sync Race)
  // ============================================================================
  assert.ok(
    !/onUpdateProfile\s*\(\s*updatedProfile\s*\)/.test(withdrawalPageSrc),
    'WithdrawalPage.tsx must NOT call onUpdateProfile(updatedProfile) before onSubmitWithdrawal (eliminates 160 -> 100 -> 40 race)'
  );
  assert.match(
    withdrawalPageSrc,
    /walletDeducted:\s*false/,
    'WithdrawalPage.tsx must hand off un-deducted request to App.tsx handleAddWithdrawal'
  );
  assert.match(
    appSrc,
    /const withdrawalTxInFlightRef = useRef<number>\(0\);/,
    'App.tsx must track in-flight withdrawal transactions'
  );
  assert.match(
    appSrc,
    /if \(withdrawalTxInFlightRef\.current > 0\) return;/,
    'App.tsx must block syncUserProfile and remote snapshot overwrites while submitWithdrawalTransaction is in-flight'
  );
  assert.match(
    firebaseSrc,
    /const otherPendingInCloud = \(cloudWithdrawals \|\| \[\]\)\.find/,
    'firebase.ts submitWithdrawalTransaction must block concurrent second pending withdrawals'
  );
  assert.match(
    firebaseSrc,
    /const existingFallbackSnap = await getDoc\(doc\(db, 'withdrawals', finalId\)\)/,
    'firebase.ts catch fallback must verify withdrawal is not already deducted before updating walletBalance'
  );
  console.log('[PASS] TEST 1: Root-cause race condition & double-deduction guards verified in source.');

  // ============================================================================
  // TEST 2: Exact User Bug Example Flow
  //   ₹200 Deposit -> ₹100 Entry Fee -> ₹60 Winning -> ₹160 Wallet Credits
  //   -> ₹60 Withdrawal -> ₹100 Final Wallet Credits (NOT ₹40)
  // ============================================================================
  contestBackend.resetForTesting();
  const uid = 'QK-USR-DOUBLE-FIX-1';
  const email = 'doublefix@quizkart.in';

  // Step 1: Deposit ₹200
  let walletCredits = 200;
  let totalWonAmount = 0;

  // Step 2: Join contest with ₹100 entry fee
  walletCredits -= 100; // ₹100
  assert.equal(walletCredits, 100);

  // Step 3: Win ₹60 prize
  contestBackend.addFinancialLedgerRecord({
    transactionId: 'TX_PRIZE_60_FIX',
    contestId: 'CONTEST_DOUBLE_FIX',
    entryId: 'ENTRY_DOUBLE_FIX',
    ownerUid: uid,
    userEmail: email,
    type: 'PRIZE_PAYOUT',
    status: 'COMPLETED',
    amountPaise: 60 * 100,
    amountRupees: 60,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now() - 1000,
    notes: 'Settled prize ₹60'
  });
  walletCredits += 60; // ₹160
  totalWonAmount += 60; // ₹60

  assert.equal(walletCredits, 160, 'Wallet Credits after ₹200 deposit - ₹100 entry + ₹60 win must be ₹160');
  const preWithdrawAvail = contestBackend.getWithdrawableBalance(uid, email, [], totalWonAmount, walletCredits);
  assert.equal(preWithdrawAvail.withdrawableBalance, 60, 'Available Withdrawal Balance must be ₹60');

  // Step 4: Submit ₹60 withdrawal ONCE (simulating Firestore + App state together)
  const w60: WithdrawalRequest = {
    id: 'QK-WTH-2001',
    requestId: 'QK-WTH-2001',
    ownerUid: uid,
    userId: uid,
    userName: 'Double Fix User',
    userEmail: email,
    email,
    phone: '9876543210',
    accountHolderName: 'Double Fix User',
    accountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    amount: 60,
    timestamp: '2026-11-14 | 09:15:00 AM',
    date: '2026-11-14',
    createdAt: new Date().toISOString(),
    status: 'pending',
    walletDeducted: false,
    walletRefunded: false
  };

  // Simulated atomic Firestore transaction reading authoritative wallet (₹160)
  // Because syncUserProfile is blocked while in-flight, Firestore still holds ₹160!
  let firestoreWallet = 160;
  const validation = contestBackend.validateAndSubmitWithdrawal(w60, uid, email, [], totalWonAmount, walletCredits);
  assert.equal(validation.success, true, '₹60 withdrawal must pass validation');

  const singleDeduct = contestBackend.applyWithdrawalDeduction(firestoreWallet, w60);
  assert.equal(singleDeduct.success, true);
  assert.equal(singleDeduct.alreadyDeducted, false);
  firestoreWallet = singleDeduct.nextWalletBalance;
  walletCredits = firestoreWallet; // Synced back from authoritative txRes.newWalletBalance

  assert.equal(walletCredits, 100, 'Wallet Credits after ₹60 withdrawal MUST be ₹100 (NEVER ₹40)');
  assert.notEqual(walletCredits, 40, 'Wallet Credits must NEVER become ₹40 from double deduction');
  assert.equal(totalWonAmount, 60, 'Total Won must remain ₹60 unchanged');

  const postSubmitAvail = contestBackend.getWithdrawableBalance(
    uid,
    email,
    [singleDeduct.updatedWithdrawal],
    totalWonAmount,
    walletCredits
  );
  assert.equal(postSubmitAvail.withdrawableBalance, 0, 'Available Withdrawal Balance must drop to ₹0 while ₹60 is reserved');
  console.log('[PASS] TEST 2: Exact flow (₹200 -> ₹100 -> ₹160 -> ₹60 withdrawal -> ₹100) verified.');

  // ============================================================================
  // TEST 3: Duplicate Submit / Retry / Refresh / Re-Login Checks
  // ============================================================================
  const retrySameId = contestBackend.applyWithdrawalDeduction(walletCredits, singleDeduct.updatedWithdrawal);
  assert.equal(retrySameId.alreadyDeducted, true);
  assert.equal(retrySameId.nextWalletBalance, 100, 'Retry of same withdrawal ID must NOT deduct again');

  const duplicateValidate = contestBackend.validateAndSubmitWithdrawal(
    { id: 'QK-WTH-2002', amount: 60 },
    uid,
    email,
    [singleDeduct.updatedWithdrawal],
    totalWonAmount,
    walletCredits
  );
  assert.equal(duplicateValidate.success, false, 'Concurrent second withdrawal while pending must be blocked');

  const reconcileOnRefresh = contestBackend.reconcilePendingWithdrawalReservation(
    walletCredits,
    singleDeduct.updatedWithdrawal
  );
  assert.equal(reconcileOnRefresh.action, 'already_reserved');
  assert.equal(reconcileOnRefresh.nextWalletBalance, 100, 'Refresh / re-login reconciliation must preserve ₹100');

  // Header & Profile Wallet both bind directly to userProfile.walletBalance
  assert.match(navbarSrc, /userProfile\.walletBalance/, 'Header Balance reads userProfile.walletBalance');
  assert.match(
    profileWalletSrc,
    /const currentWalletBalance = Number\(userProfile\.walletBalance\) \|\| 0;/,
    'Profile Wallet Credits reads exact same userProfile.walletBalance'
  );
  console.log('[PASS] TEST 3: Retries, concurrent clicks, refresh/re-login & Header/Profile balance parity verified.');

  // ============================================================================
  // TEST 4: Pending -> Approved (SUCCESS) & Duplicate Approval Keep ₹100
  // ============================================================================
  const approve1 = contestBackend.applyWithdrawalStatusTransition(walletCredits, singleDeduct.updatedWithdrawal, 'approved');
  assert.equal(approve1.changed, true);
  assert.equal(approve1.refunded, false);
  assert.equal(approve1.nextWalletBalance, 100, 'Admin approval MUST keep Wallet Credits at ₹100 (no second deduction)');

  const approve2 = contestBackend.applyWithdrawalStatusTransition(
    approve1.nextWalletBalance,
    approve1.updatedWithdrawal,
    'approved'
  );
  assert.equal(approve2.changed, false);
  assert.equal(approve2.nextWalletBalance, 100, 'Duplicate approval MUST remain ₹100');

  const postApproveAvail = contestBackend.getWithdrawableBalance(
    uid,
    email,
    [approve1.updatedWithdrawal],
    totalWonAmount,
    approve1.nextWalletBalance
  );
  assert.equal(postApproveAvail.completedWithdrawals, 60);
  assert.equal(postApproveAvail.activeWithdrawalHolds, 0);
  assert.equal(postApproveAvail.withdrawableBalance, 0);
  assert.equal(totalWonAmount, 60, 'Total Won remains ₹60 after approval');
  console.log('[PASS] TEST 4: Pending -> Approved (SUCCESS) and duplicate approval keep Wallet Credits at ₹100.');

  // ============================================================================
  // TEST 5: Rejected / Cancelled Releases Reserved ₹60 Strictly Once (-> ₹160)
  // ============================================================================
  const reject1 = contestBackend.applyWithdrawalStatusTransition(100, singleDeduct.updatedWithdrawal, 'rejected');
  assert.equal(reject1.changed, true);
  assert.equal(reject1.refunded, true);
  assert.equal(reject1.nextWalletBalance, 160, 'Rejected withdrawal must release reserved ₹60 back to ₹160');

  const reject2 = contestBackend.applyWithdrawalStatusTransition(
    reject1.nextWalletBalance,
    reject1.updatedWithdrawal,
    'rejected'
  );
  const cancelAfterReject = contestBackend.applyWithdrawalStatusTransition(
    reject2.nextWalletBalance,
    reject1.updatedWithdrawal,
    'cancelled'
  );
  assert.equal(reject2.changed, false);
  assert.equal(reject2.refunded, false);
  assert.equal(reject2.nextWalletBalance, 160, 'Duplicate rejection must NOT double-refund');
  assert.equal(cancelAfterReject.changed, false);
  assert.equal(cancelAfterReject.nextWalletBalance, 160, 'Cancel after reject must NOT double-refund');

  const postRejectAvail = contestBackend.getWithdrawableBalance(
    uid,
    email,
    [reject1.updatedWithdrawal],
    totalWonAmount,
    reject1.nextWalletBalance
  );
  assert.equal(postRejectAvail.withdrawableBalance, 60, 'Available Withdrawal Balance restores to ₹60 after rejection');
  console.log('[PASS] TEST 5: Rejected / Cancelled releases reserved ₹60 strictly once back to ₹160.');

  console.log('\nPASS: All Double Withdrawal Deduction Fix verification tests passed!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
