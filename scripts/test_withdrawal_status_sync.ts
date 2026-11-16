import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contestBackend } from '../src/backend/contestEngine';
import {
  fetchWithdrawalsFromFirestore,
  subscribeToWithdrawalsFromFirestore
} from '../src/firebase';
import { formatWithdrawalId, formatDepositTimestamp } from '../src/utils/depositUtils';
import { WithdrawalRequest } from '../src/types';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * Pure simulation of TransactionHistoryPage's authoritative Firestore reconciliation logic
 * so we can deterministically verify stale localStorage cache handling without DOM mocks.
 */
function reconcileUserWithdrawals(
  localPermList: WithdrawalRequest[],
  propsList: WithdrawalRequest[],
  cloudList: WithdrawalRequest[],
  hasLoadedCloud: boolean,
  syncError: string | null,
  currentUserEmail: string,
  currentUid: string
): WithdrawalRequest[] {
  const cleanEmail = currentUserEmail.trim().toLowerCase();
  const belongsToCurrentUser = (w: WithdrawalRequest) => {
    if (!w) return false;
    const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
    if (wEmail && cleanEmail && wEmail !== cleanEmail) return false;
    if (currentUid && (w.ownerUid === currentUid || w.userId === currentUid)) return true;
    if (!cleanEmail || !wEmail) return false;
    return wEmail === cleanEmail;
  };

  const getCanonicalWthKey = (w: WithdrawalRequest): string => {
    const raw = String(w.id || w.requestId || '').trim();
    if (!raw) return '';
    if (/^QK-WTH-\d{4,6}$/i.test(raw)) return raw.toUpperCase();
    return raw;
  };

  const matchingFromProps = propsList.filter(belongsToCurrentUser);
  const matchingFromCloud = cloudList.filter(belongsToCurrentUser);

  const cloudKeys = new Set<string>();
  matchingFromCloud.forEach((item) => {
    const k = getCanonicalWthKey(item);
    if (k) cloudKeys.add(k);
    if (item.id) cloudKeys.add(String(item.id).trim());
    if (item.requestId) cloudKeys.add(String(item.requestId).trim());
    if (item.firestoreDocId) cloudKeys.add(String(item.firestoreDocId).trim());
  });

  const isCloudAuthoritative = hasLoadedCloud && !syncError;
  const isPhantomCachedPending = (item: WithdrawalRequest) => {
    if (!isCloudAuthoritative) return false;
    const st = String(item.status || 'pending').toLowerCase();
    if (st !== 'pending') return false;
    const key = getCanonicalWthKey(item);
    const idMatch =
      (key && cloudKeys.has(key)) ||
      (item.id && cloudKeys.has(String(item.id).trim())) ||
      (item.requestId && cloudKeys.has(String(item.requestId).trim()));
    return !idMatch;
  };

  const map = new Map<string, WithdrawalRequest>();
  localPermList.filter(belongsToCurrentUser).forEach((item) => {
    if (!item || !item.id || isPhantomCachedPending(item)) return;
    const key = getCanonicalWthKey(item);
    if (key) {
      map.set(key, {
        ...item,
        status: String(item.status || 'pending').toLowerCase() as WithdrawalRequest['status']
      });
    }
  });

  const mergeRecord = (item: WithdrawalRequest, preferItemStatus: boolean) => {
    if (!item || !item.id) return;
    if (!preferItemStatus && isPhantomCachedPending(item)) return;
    const key = getCanonicalWthKey(item);
    if (!key) return;
    const existing = map.get(key);
    const itemStatus = String(item.status || 'pending').toLowerCase() as WithdrawalRequest['status'];
    const existingStatus = String(existing?.status || 'pending').toLowerCase() as WithdrawalRequest['status'];
    const resolvedStatus = preferItemStatus
      ? itemStatus
      : ((existing && existingStatus !== 'pending') ? existingStatus : itemStatus);
    map.set(key, {
      ...existing,
      ...item,
      id: item.id || existing?.id || key,
      requestId: item.requestId || existing?.requestId || item.id || key,
      status: resolvedStatus
    });
  };

  matchingFromProps.forEach((item) => mergeRecord(item, false));
  matchingFromCloud.forEach((item) => mergeRecord(item, true));

  return Array.from(map.values()).map((w) => ({
    ...w,
    timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
  }));
}

function getUserHistoryBadgeText(status: WithdrawalRequest['status']): string {
  const s = String(status || 'pending').toLowerCase();
  return s === 'approved' ? 'SUCCESS' : s === 'rejected' ? 'REJECTED' : s === 'cancelled' ? 'CANCELLED' : 'PENDING';
}

async function runTests() {
  console.log('==============================================================================');
  console.log('QUIZKART: WITHDRAWAL STATUS SYNCHRONIZATION & SINGLE SOURCE OF TRUTH TESTS');
  console.log('==============================================================================\n');

  const firebaseSrc = readSrc('src/firebase.ts');
  const adminSrc = readSrc('src/components/AdminPage.tsx');
  const txHistorySrc = readSrc('src/components/TransactionHistoryPage.tsx');
  const appSrc = readSrc('src/App.tsx');
  const tabSrc = readSrc('src/components/WithdrawalApprovalsTab.tsx');

  const uid = 'UID_SYNC_USER_1';
  const email = 'syncuser@quizkart.in';

  const seedPrize = (amountRupees: number) => {
    contestBackend.resetForTesting();
    contestBackend.addFinancialLedgerRecord({
      transactionId: `TX_PRIZE_${Date.now()}`,
      contestId: 'CONTEST_SYNC_01',
      entryId: 'ENTRY_SYNC_01',
      ownerUid: uid,
      userEmail: email,
      type: 'PRIZE_PAYOUT',
      status: 'COMPLETED',
      amountPaise: amountRupees * 100,
      amountRupees,
      timestamp: new Date().toISOString(),
      timestampMs: Date.now() - 2000,
      notes: 'Settled prize winnings'
    });
  };

  // ============================================================================
  // TEST 1: Submit Withdrawal (PENDING) & Firestore Persistence Guarantees
  // ============================================================================
  seedPrize(200);
  const subCheck = contestBackend.validateAndSubmitWithdrawal(
    { id: 'QK-WTH-1011', amount: 60 },
    uid,
    email,
    [],
    200
  );
  assert.equal(subCheck.success, true, 'Withdrawal ₹60 must pass eligibility and minimum ₹10 validation');
  const unreservedPendingWth: WithdrawalRequest = {
    id: 'QK-WTH-1011',
    requestId: 'QK-WTH-1011',
    firestoreDocId: 'QK-WTH-1011',
    ownerUid: uid,
    userId: uid,
    userName: 'Sync User',
    userEmail: email,
    email,
    phone: '9876543210',
    accountHolderName: 'Sync User',
    accountNumber: '1234567890',
    ifscCode: 'SBIN0001234',
    amount: 60,
    timestamp: '2026-11-14 | 10:00:00 AM',
    date: '2026-11-14',
    createdAt: '2026-11-14T04:30:00.000Z',
    status: 'pending',
    walletDeducted: false,
    walletRefunded: false
  };
  const afterDeduct = contestBackend.applyWithdrawalDeduction(200, unreservedPendingWth);
  const pendingWth = afterDeduct.updatedWithdrawal;
  assert.equal(afterDeduct.nextWalletBalance, 140, 'Pending withdrawal reserves ₹60 from ₹200 -> ₹140');
  assert.equal(getUserHistoryBadgeText(pendingWth.status), 'PENDING');
  assert.match(firebaseSrc, /if \(!persistedToFirestore\)\s*\{\s*return\s*\{\s*success:\s*false/, 'submitWithdrawalTransaction must never report success if Firestore persistence failed');
  assert.match(appSrc, /localStorage\.setItem\('quizkart_user_withdrawals_permanent',\s*JSON\.stringify\(permList\.filter[\s\S]*rolledBackList/, 'App.tsx must roll back localStorage pending cache when Firestore submit fails');
  console.log('[PASS] TEST 1: Submit Withdrawal (PENDING) & non-silent Firestore persistence verified.');

  // ============================================================================
  // TEST 2: Admin Approval Synchronization (APPROVED -> User SUCCESS)
  // ============================================================================
  const approveRes = contestBackend.applyWithdrawalStatusTransition(140, pendingWth, 'approved');
  assert.equal(approveRes.changed, true);
  assert.equal(approveRes.refunded, false);
  assert.equal(approveRes.nextWalletBalance, 140, 'Approval must not double-deduct wallet');
  assert.equal(approveRes.updatedWithdrawal.status, 'approved');
  assert.equal(getUserHistoryBadgeText(approveRes.updatedWithdrawal.status), 'SUCCESS');
  assert.match(adminSrc, /const handleApproveWithdrawal = async \(id: string\)/, 'AdminPage handleApproveWithdrawal must await Firestore transaction');
  assert.match(adminSrc, /if \(!txRes\.success\)/, 'AdminPage must revert optimistic update if Firestore transaction fails');
  assert.match(firebaseSrc, /processWithdrawalStatusViaRestFallback/, 'processWithdrawalStatusTransaction must include atomic REST fallback for non-admin Auth sessions');
  console.log('[PASS] TEST 2: Admin Approval Synchronization (Admin APPROVED <-> User SUCCESS, no extra deduction) verified.');

  // ============================================================================
  // TEST 3: Admin Rejection Synchronization (REJECTED -> User REJECTED + Single Refund)
  // ============================================================================
  const rejectRes = contestBackend.applyWithdrawalStatusTransition(140, pendingWth, 'rejected');
  assert.equal(rejectRes.changed, true);
  assert.equal(rejectRes.refunded, true);
  assert.equal(rejectRes.nextWalletBalance, 200, 'Rejection must refund reserved ₹60 back to ₹200');
  assert.equal(rejectRes.updatedWithdrawal.status, 'rejected');
  assert.equal(getUserHistoryBadgeText(rejectRes.updatedWithdrawal.status), 'REJECTED');
  assert.match(adminSrc, /const handleRejectWithdrawal = async \(id: string/, 'AdminPage handleRejectWithdrawal must await Firestore transaction');
  console.log('[PASS] TEST 3: Admin Rejection Synchronization (Admin REJECTED <-> User REJECTED + single ₹60 refund) verified.');

  // ============================================================================
  // TEST 4: Refresh / Reopen Check (Firestore Overrides Stale localStorage PENDING)
  // ============================================================================
  const staleLocalPending: WithdrawalRequest[] = [
    { ...pendingWth, status: 'pending' },
    { ...pendingWth, id: 'QK-WTH-1099', requestId: 'QK-WTH-1099', status: 'pending' } // orphan unpersisted pending cache
  ];
  const cloudAuthoritative: WithdrawalRequest[] = [
    { ...pendingWth, status: 'approved', updatedAt: '2026-11-14T05:00:00.000Z' }
  ];
  const reconciledAfterRefresh = reconcileUserWithdrawals(
    staleLocalPending,
    staleLocalPending,
    cloudAuthoritative,
    true,
    null,
    email,
    uid
  );
  assert.equal(reconciledAfterRefresh.length, 1, 'Orphan unpersisted local pending cache must be pruned after authoritative Firestore load');
  assert.equal(reconciledAfterRefresh[0].id, 'QK-WTH-1011');
  assert.equal(reconciledAfterRefresh[0].status, 'approved', 'Firestore approved status must override stale localStorage PENDING');
  assert.equal(getUserHistoryBadgeText(reconciledAfterRefresh[0].status), 'SUCCESS');
  assert.match(txHistorySrc, /onAuthStateChanged\(auth,/, 'TransactionHistoryPage must react to Firebase Auth initialization');
  assert.match(txHistorySrc, /isPhantomCachedPending/, 'TransactionHistoryPage must prune phantom unpersisted PENDING cache items once Firestore loads');
  assert.match(appSrc, /if \(!\(isAdmin && isDeletedResolved\)\)/, 'App.tsx must not hide user history items when admin clears resolved view');
  console.log('[PASS] TEST 4: Refresh/Reopen overrides stale localStorage PENDING with Firestore status & prunes phantom PENDING.');

  // ============================================================================
  // TEST 5: Duplicate Action Protection (Terminal Status Immutability)
  // ============================================================================
  const dupApprove = contestBackend.applyWithdrawalStatusTransition(140, approveRes.updatedWithdrawal, 'approved');
  const flipApprovedToReject = contestBackend.applyWithdrawalStatusTransition(140, approveRes.updatedWithdrawal, 'rejected');
  assert.equal(dupApprove.changed, false);
  assert.equal(dupApprove.nextWalletBalance, 140);
  assert.equal(flipApprovedToReject.changed, false);
  assert.equal(flipApprovedToReject.refunded, false);
  assert.equal(flipApprovedToReject.updatedWithdrawal.status, 'approved', 'Approved request must never flip to rejected');

  const dupReject = contestBackend.applyWithdrawalStatusTransition(200, rejectRes.updatedWithdrawal, 'rejected');
  const flipRejectedToApprove = contestBackend.applyWithdrawalStatusTransition(200, rejectRes.updatedWithdrawal, 'approved');
  assert.equal(dupReject.changed, false);
  assert.equal(dupReject.refunded, false);
  assert.equal(dupReject.nextWalletBalance, 200, 'Rejected request must never trigger duplicate refund');
  assert.equal(flipRejectedToApprove.changed, false);
  assert.equal(flipRejectedToApprove.updatedWithdrawal.status, 'rejected', 'Rejected request must never flip to approved');

  assert.match(firebaseSrc, /if \(currentStatus && currentStatus !== 'pending'\)[\s\S]*alreadyResolved:\s*true/, 'Firestore status transaction must block duplicate terminal transitions');
  assert.match(firebaseSrc, /adminHidden:\s*true/, 'deleteWithdrawalFromFirestore must mark adminHidden without overwriting approved/rejected status to cancelled');
  assert.match(tabSrc, /if \(liveMatch && liveMatch\.status !== detailWithdrawal\.status\)/, 'WithdrawalApprovalsTab detail view must stay synced with live status');
  console.log('[PASS] TEST 5: Duplicate Action Protection & terminal status immutability verified.');

  // ============================================================================
  // TEST 6 & TEST 7: Existing Records Preservation & Live Firestore Read Verification
  // ============================================================================
  const liveAll = await fetchWithdrawalsFromFirestore();
  assert.ok(Array.isArray(liveAll) && liveAll.length >= 1, 'Live Firestore withdrawals must load non-empty list');
  assert.ok(
    liveAll.every((w) => Boolean(w.id && w.status && w.firestoreDocId)),
    'Every fetched Firestore withdrawal must carry authoritative firestoreDocId and normalized status'
  );
  assert.ok(
    liveAll.some((w) => w.id === 'QK-WTH-1009') && liveAll.some((w) => w.id === 'QK-WTH-1010'),
    'Historical records QK-WTH-1009 & QK-WTH-1010 remain preserved in live Firestore'
  );

  const liveSubCount = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Real-time withdrawal listener timeout')), 8000);
    const unsub = subscribeToWithdrawalsFromFirestore((items) => {
      clearTimeout(t);
      unsub();
      resolve(items.length);
    });
  });
  assert.ok(liveSubCount >= liveAll.length, `Real-time listener emitted ${liveSubCount} withdrawals`);

  const byId = new Map(liveAll.map((w) => [w.id, w]));
  console.log(`[PASS] TEST 6 & 7: Live Firestore verified (${liveAll.length} docs preserved; real-time listener active; QK-WTH-1009=${byId.get('QK-WTH-1009')?.status}, QK-WTH-1010=${byId.get('QK-WTH-1010')?.status}).`);
  console.log('\nALL WITHDRAWAL STATUS SYNCHRONIZATION TESTS PASSED.');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  });
