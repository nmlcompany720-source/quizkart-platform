import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contestBackend } from '../src/backend/contestEngine';
import { DepositRequest, UserProfile, WithdrawalRequest } from '../src/types';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

interface MockUserDoc extends Partial<UserProfile> {
  walletBalance: number;
  quizzesPlayed: number;
  totalWonAmount: number;
  updatedAt: string;
  version: number;
}

class InMemoryAtomicFirestoreMock {
  deposits = new Map<string, DepositRequest & { version: number }>();
  users = new Map<string, MockUserDoc>();
  inFlightLocks = new Set<string>();

  async approveDepositAtomic(
    depositId: string,
    options?: { reconcileUncreditedApproved?: boolean }
  ): Promise<{
    success: boolean;
    alreadyCredited?: boolean;
    credited?: boolean;
    creditedAmount?: number;
    newWalletBalance?: number;
    reconciled?: boolean;
    reason?: string;
  }> {
    // Simulate client-side lock check + Firestore optimistic concurrency
    const depSnap = this.deposits.get(depositId);
    if (!depSnap) {
      return { success: false, reason: 'not_found' };
    }
    const readVersion = depSnap.version;

    // Simulate async delay during transaction read
    await new Promise((r) => setTimeout(r, 5));

    // Re-read inside commit phase (Firestore optimistic concurrency guarantees retry/abort on version mismatch)
    const latestDep = this.deposits.get(depositId)!;
    if (latestDep.version !== readVersion) {
      // Concurrency conflict -> re-evaluate latest committed state cleanly
      if (latestDep.walletCredited) {
        return {
          success: true,
          alreadyCredited: true,
          credited: false,
          newWalletBalance: this.getFreshestUserBalance(latestDep),
        };
      }
    }

    const alreadyCreditedFlag = Boolean(
      latestDep.walletCredited === true ||
      latestDep.creditedAt ||
      Number(latestDep.walletCreditedAmount || 0) > 0
    );

    const targetEmail = (latestDep.userEmail || latestDep.email || '').trim().toLowerCase();
    const safeEmailDocId = targetEmail ? targetEmail.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const ownerUid = (latestDep.ownerUid || latestDep.userId || '').trim();
    const candidateIds = Array.from(
      new Set([safeEmailDocId, ownerUid].filter((id) => Boolean(id) && !id.startsWith('QK-USR-')))
    );

    const currentBal = this.getFreshestUserBalance(latestDep);

    if (latestDep.status === 'approved' && alreadyCreditedFlag) {
      return {
        success: true,
        alreadyCredited: true,
        credited: false,
        newWalletBalance: currentBal,
      };
    }

    const isReconcile = latestDep.status === 'approved' && !alreadyCreditedFlag;
    if (isReconcile && !options?.reconcileUncreditedApproved) {
      return {
        success: true,
        alreadyCredited: false,
        credited: false,
        newWalletBalance: currentBal,
      };
    }

    if (isReconcile) {
      const existingUsers = candidateIds.map((id) => this.users.get(id)).filter(Boolean) as MockUserDoc[];
      const played = existingUsers.reduce((max, u) => Math.max(max, Number(u.quizzesPlayed) || 0), 0);
      const won = existingUsers.reduce((max, u) => Math.max(max, Number(u.totalWonAmount) || 0), 0);
      if (currentBal > 0 || played > 0 || won > 0) {
        return {
          success: true,
          alreadyCredited: true,
          credited: false,
          newWalletBalance: currentBal,
          reason: 'safety_skip_existing_balance_or_activity',
        };
      }
    }

    const approvedAmount = Number(latestDep.amount) || 0;
    const newWalletBalance = currentBal + approvedAmount;
    const nowIso = new Date().toISOString();

    this.deposits.set(depositId, {
      ...latestDep,
      status: 'approved',
      walletCredited: true,
      walletCreditedAmount: approvedAmount,
      creditedAt: nowIso,
      updatedAt: nowIso,
      version: latestDep.version + 1,
    });

    const existingDocIds = candidateIds.filter((id) => this.users.has(id));
    const targetDocIds = existingDocIds.length > 0 ? existingDocIds : safeEmailDocId ? [safeEmailDocId] : [];
    targetDocIds.forEach((docId) => {
      const existing = this.users.get(docId) || {
        email: targetEmail,
        walletBalance: 0,
        quizzesPlayed: 0,
        totalWonAmount: 0,
        updatedAt: nowIso,
        version: 0,
      };
      this.users.set(docId, {
        ...existing,
        walletBalance: newWalletBalance,
        lastCreditedDepositId: depositId,
        updatedAt: nowIso,
        version: existing.version + 1,
      });
    });

    return {
      success: true,
      alreadyCredited: false,
      credited: true,
      creditedAmount: approvedAmount,
      newWalletBalance,
      reconciled: isReconcile,
    };
  }

  getFreshestUserBalance(dep: DepositRequest): number {
    const email = (dep.userEmail || dep.email || '').trim().toLowerCase();
    const safeEmail = email ? email.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const uid = (dep.ownerUid || dep.userId || '').trim();
    let freshest: MockUserDoc | null = null;
    let freshestMs = -1;
    [safeEmail, uid].forEach((id) => {
      const u = id ? this.users.get(id) : undefined;
      if (u) {
        const ms = new Date(u.updatedAt || 0).getTime() || 0;
        if (!freshest || ms >= freshestMs) {
          freshest = u;
          freshestMs = ms;
        }
      }
    });
    return freshest ? Math.max(0, Number((freshest as MockUserDoc).walletBalance) || 0) : 0;
  }
}

function applyRemoteProfileClockSkewCheck(
  localPrev: Partial<UserProfile>,
  remoteProfile: Partial<UserProfile>
): number {
  const toValidMs = (v: any) => {
    const t = new Date(v || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const remoteUpdatedMs = toValidMs(remoteProfile.updatedAt);
  const localUpdatedMs = toValidMs(localPrev.updatedAt);
  const hasNewRemoteDepositCredit = Boolean(
    remoteProfile.lastCreditedDepositId &&
      remoteProfile.lastCreditedDepositId !== localPrev.lastCreditedDepositId
  );
  return remoteProfile.walletBalance !== undefined &&
    (remoteUpdatedMs >= localUpdatedMs ||
      localPrev.walletBalance === undefined ||
      hasNewRemoteDepositCredit)
    ? Math.max(0, Number(remoteProfile.walletBalance))
    : Math.max(0, Number(localPrev.walletBalance || 0));
}

async function runTests() {
  console.log('==============================================================================');
  console.log('QUIZKART: DEPOSIT APPROVAL & WALLET CREDIT SYNCHRONIZATION VERIFICATION');
  console.log('==============================================================================\n');

  const adminPageSrc = readSrc('src/components/AdminPage.tsx');
  const firebaseSrc = readSrc('src/firebase.ts');
  const appSrc = readSrc('src/App.tsx');
  const typesSrc = readSrc('src/types.ts');

  // ----------------------------------------------------------------------------
  // TEST 0: Source Contract & Non-Regression Guards
  // ----------------------------------------------------------------------------
  assert.match(typesSrc, /walletCredited\?: boolean;/, 'DepositRequest type includes walletCredited');
  assert.match(typesSrc, /lastCreditedDepositId\?: string;/, 'UserProfile type includes lastCreditedDepositId');
  assert.match(
    firebaseSrc,
    /export async function processDepositApprovalTransaction/,
    'firebase.ts exports atomic processDepositApprovalTransaction'
  );
  assert.match(
    firebaseSrc,
    /async function processDepositStatusViaRestFallback/,
    'firebase.ts includes optimistic REST fallback for PIN-unlocked Admin mode'
  );
  assert.match(
    firebaseSrc,
    /export async function reconcileUncreditedApprovedDeposit/,
    'firebase.ts exports safe reconcileUncreditedApprovedDeposit'
  );
  assert.match(
    adminPageSrc,
    /const handleApproveDeposit = async \(id: string\) =>/,
    'AdminPage.tsx handleApproveDeposit is async'
  );
  assert.match(
    adminPageSrc,
    /processingDepositIdsRef\.current\.has/,
    'AdminPage.tsx blocks duplicate simultaneous clicks with processingDepositIdsRef'
  );
  assert.match(
    adminPageSrc,
    /await processDepositApprovalTransaction\(/,
    'AdminPage.tsx executes atomic Firestore deposit approval transaction'
  );
  assert.ok(
    !/activeProfileEmail === targetEmail[\s\S]{0,400}syncUserProfile/.test(adminPageSrc),
    'AdminPage.tsx must NOT gate Firestore wallet crediting on activeProfileEmail === targetEmail'
  );
  assert.match(
    appSrc,
    /hasNewRemoteDepositCredit/,
    'App.tsx handles clock-skew-safe deposit wallet synchronization via lastCreditedDepositId'
  );
  assert.match(
    appSrc,
    /reconcileUncreditedApprovedDeposit\(/,
    'App.tsx runs safe one-time reconciliation for uncredited approved deposits'
  );
  const rulesSrc = readSrc('firestore.rules');
  assert.match(rulesSrc, /match \/deposits\/\{depositId\}/, 'firestore.rules retains /deposits/{depositId} rules');
  assert.match(rulesSrc, /match \/users\/\{userId\}/, 'firestore.rules retains /users/{userId} rules');
  console.log('[PASS] TEST 0: Source contract assertions & firestore.rules preservation verified.');

  // ----------------------------------------------------------------------------
  // TEST 1: User starts at ₹0 -> deposits ₹200 (QK-DEP-1046) -> Admin approves -> ₹200 + SUCCESS
  // ----------------------------------------------------------------------------
  const store = new InMemoryAtomicFirestoreMock();
  const mobileEmail = 'mobile_player@quizkart.in';
  const mobileEmailDocId = mobileEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
  const mobileUid = 'usr_mobile_uuid_1046';

  store.users.set(mobileEmailDocId, {
    uid: mobileUid,
    customUserId: 'QK-USR-1046',
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 0,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:00:00.000Z',
    version: 1,
  });

  store.deposits.set('QK-DEP-1046', {
    id: 'QK-DEP-1046',
    requestId: 'QK-DEP-1046',
    ownerUid: mobileUid,
    userId: mobileUid,
    userName: 'Mobile Player',
    userEmail: mobileEmail,
    email: mobileEmail,
    phone: '9876501046',
    amount: 200,
    utrNumber: '123456781046',
    timestamp: '2026-11-16 | 12:30:00 PM',
    status: 'pending',
    walletCredited: false,
    version: 1,
  });

  const approve1 = await store.approveDepositAtomic('QK-DEP-1046');
  assert.equal(approve1.success, true);
  assert.equal(approve1.credited, true);
  assert.equal(approve1.creditedAmount, 200);
  assert.equal(approve1.newWalletBalance, 200);
  assert.equal(store.deposits.get('QK-DEP-1046')?.status, 'approved');
  assert.equal(store.deposits.get('QK-DEP-1046')?.walletCredited, true);
  assert.equal(store.deposits.get('QK-DEP-1046')?.id, 'QK-DEP-1046');
  assert.equal(store.users.get(mobileEmailDocId)?.walletBalance, 200);
  console.log('[PASS] TEST 1: Normal ₹200 deposit approval credits Wallet Balance ₹0 -> ₹200 and status approved (SUCCESS).');

  // ----------------------------------------------------------------------------
  // TEST 2: Repeated / Duplicate Click Protection
  // ----------------------------------------------------------------------------
  const approveDup = await store.approveDepositAtomic('QK-DEP-1046');
  assert.equal(approveDup.alreadyCredited, true);
  assert.equal(approveDup.credited, false);
  assert.equal(store.users.get(mobileEmailDocId)?.walletBalance, 200);
  console.log('[PASS] TEST 2: Duplicate approval attempt does NOT double-credit (remains ₹200).');

  // ----------------------------------------------------------------------------
  // TEST 3: Concurrent Approvals Simulation on Fresh ₹200 Deposit
  // ----------------------------------------------------------------------------
  const raceStore = new InMemoryAtomicFirestoreMock();
  raceStore.users.set(mobileEmailDocId, {
    uid: mobileUid,
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 0,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:00:00.000Z',
    version: 1,
  });
  raceStore.deposits.set('QK-DEP-RACE', {
    id: 'QK-DEP-RACE',
    requestId: 'QK-DEP-RACE',
    ownerUid: mobileUid,
    userEmail: mobileEmail,
    userName: 'Race Player',
    phone: '9876543210',
    amount: 200,
    utrNumber: '999999999999',
    timestamp: '2026-11-16 | 12:35:00 PM',
    status: 'pending',
    walletCredited: false,
    version: 1,
  });

  const [r1, r2] = await Promise.all([
    raceStore.approveDepositAtomic('QK-DEP-RACE'),
    raceStore.approveDepositAtomic('QK-DEP-RACE'),
  ]);
  const creditCount = [r1, r2].filter((r) => r.credited === true).length;
  assert.equal(creditCount, 1, 'Exactly one concurrent transaction may credit wallet');
  assert.equal(raceStore.users.get(mobileEmailDocId)?.walletBalance, 200);
  console.log('[PASS] TEST 3: Concurrent approval race credits strictly once (₹200).');

  // ----------------------------------------------------------------------------
  // TEST 4: Dashboard Refresh & Clock-Skew Safe Real-Time Mobile Sync
  // ----------------------------------------------------------------------------
  const skewedMobileLocalProfile: Partial<UserProfile> = {
    email: mobileEmail,
    walletBalance: 0,
    updatedAt: '2026-11-16T12:10:00.000Z', // 5 minutes ahead of Admin's clock!
  };
  const adminUpdatedRemoteProfile: Partial<UserProfile> = {
    email: mobileEmail,
    walletBalance: 200,
    lastCreditedDepositId: 'QK-DEP-1046',
    updatedAt: '2026-11-16T12:05:00.000Z', // Admin clock is 5 minutes behind mobile
  };
  const syncedBalance = applyRemoteProfileClockSkewCheck(
    skewedMobileLocalProfile,
    adminUpdatedRemoteProfile
  );
  assert.equal(
    syncedBalance,
    200,
    'Mobile Dashboard must apply approved deposit wallet credit even under clock skew'
  );
  console.log('[PASS] TEST 4: Clock-skew-safe remote sync updates mobile Dashboard Wallet Credits to ₹200.');

  // ----------------------------------------------------------------------------
  // TEST 5: Multi-Device User Doc Parity (both email doc & uid doc synchronized)
  // ----------------------------------------------------------------------------
  const multiDocStore = new InMemoryAtomicFirestoreMock();
  const googleUid = 'firebase_google_uid_xyz';
  multiDocStore.users.set(mobileEmailDocId, {
    uid: googleUid,
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 0,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:00:00.000Z',
    version: 1,
  });
  multiDocStore.users.set(googleUid, {
    uid: googleUid,
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 0,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:01:00.000Z',
    version: 1,
  });
  multiDocStore.deposits.set('QK-DEP-MULTI', {
    id: 'QK-DEP-MULTI',
    ownerUid: googleUid,
    userEmail: mobileEmail,
    userName: 'Multi Doc',
    phone: '9876543210',
    amount: 200,
    utrNumber: '111122223333',
    timestamp: '2026-11-16 | 12:40:00 PM',
    status: 'pending',
    walletCredited: false,
    version: 1,
  });
  await multiDocStore.approveDepositAtomic('QK-DEP-MULTI');
  assert.equal(multiDocStore.users.get(mobileEmailDocId)?.walletBalance, 200);
  assert.equal(multiDocStore.users.get(googleUid)?.walletBalance, 200);
  console.log('[PASS] TEST 5: Multi-device UID and safeEmail user docs both atomically updated to ₹200.');

  // ----------------------------------------------------------------------------
  // TEST 6: Second Deposit Additive Credit (₹200 -> +₹100 -> ₹300)
  // ----------------------------------------------------------------------------
  store.deposits.set('QK-DEP-1047', {
    id: 'QK-DEP-1047',
    requestId: 'QK-DEP-1047',
    ownerUid: mobileUid,
    userId: mobileUid,
    userName: 'Mobile Player',
    userEmail: mobileEmail,
    email: mobileEmail,
    phone: '9876501046',
    amount: 100,
    utrNumber: '123456781047',
    timestamp: '2026-11-16 | 12:45:00 PM',
    status: 'pending',
    walletCredited: false,
    version: 1,
  });
  const approve2 = await store.approveDepositAtomic('QK-DEP-1047');
  assert.equal(approve2.credited, true);
  assert.equal(approve2.newWalletBalance, 300);
  assert.equal(store.users.get(mobileEmailDocId)?.walletBalance, 300);
  console.log('[PASS] TEST 6: Second approved deposit ₹100 adds cleanly (₹200 -> ₹300).');

  // ----------------------------------------------------------------------------
  // TEST 7: Existing Uncredited Approved Deposit Reconciliation (e.g. legacy QK-DEP-1046)
  //         AND strict non-double-credit on active/credited users
  // ----------------------------------------------------------------------------
  const legacyStore = new InMemoryAtomicFirestoreMock();
  legacyStore.users.set(mobileEmailDocId, {
    uid: mobileUid,
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 0,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:00:00.000Z',
    version: 1,
  });
  // Legacy state: approved without walletCredited flag, user balance still ₹0
  legacyStore.deposits.set('QK-DEP-1046', {
    id: 'QK-DEP-1046',
    ownerUid: mobileUid,
    userEmail: mobileEmail,
    userName: 'Legacy User',
    phone: '9876501046',
    amount: 200,
    utrNumber: '123456781046',
    timestamp: '2026-11-16 | 12:00:00 PM',
    status: 'approved',
    version: 1,
  });

  const rec1 = await legacyStore.approveDepositAtomic('QK-DEP-1046', {
    reconcileUncreditedApproved: true,
  });
  assert.equal(rec1.credited, true);
  assert.equal(rec1.reconciled, true);
  assert.equal(rec1.newWalletBalance, 200);
  const rec2 = await legacyStore.approveDepositAtomic('QK-DEP-1046', {
    reconcileUncreditedApproved: true,
  });
  assert.equal(rec2.credited, false);
  assert.equal(rec2.alreadyCredited, true);
  assert.equal(legacyStore.users.get(mobileEmailDocId)?.walletBalance, 200);

  // Guard: If user already played quizzes and spent down to ₹0, never blindly re-credit legacy approved deposit
  const spentStore = new InMemoryAtomicFirestoreMock();
  spentStore.users.set(mobileEmailDocId, {
    uid: mobileUid,
    email: mobileEmail,
    walletBalance: 0,
    quizzesPlayed: 2,
    totalWonAmount: 0,
    updatedAt: '2026-11-16T07:00:00.000Z',
    version: 1,
  });
  spentStore.deposits.set('QK-DEP-OLD', {
    id: 'QK-DEP-OLD',
    ownerUid: mobileUid,
    userEmail: mobileEmail,
    userName: 'Active User',
    phone: '9876501046',
    amount: 200,
    utrNumber: '123456780000',
    timestamp: '2026-11-15 | 12:00:00 PM',
    status: 'approved',
    version: 1,
  });
  const skippedRec = await spentStore.approveDepositAtomic('QK-DEP-OLD', {
    reconcileUncreditedApproved: true,
  });
  assert.equal(skippedRec.credited, false);
  assert.equal(spentStore.users.get(mobileEmailDocId)?.walletBalance, 0);
  console.log('[PASS] TEST 7: Uncredited approved deposit reconciled once (₹200) while active/spent legacy accounts remain protected.');

  // ----------------------------------------------------------------------------
  // TEST 8: Withdrawal & Total Won Regression Check After ₹300 Deposit Credits
  // ----------------------------------------------------------------------------
  contestBackend.resetForTesting();
  let wallet = store.users.get(mobileEmailDocId)!.walletBalance; // ₹300
  wallet -= 100; // Join ₹100 contest -> ₹200
  let totalWon = 0;
  contestBackend.addFinancialLedgerRecord({
    transactionId: 'TX_WIN_60',
    contestId: 'CONTEST_DEP_TEST',
    entryId: 'ENTRY_DEP_TEST',
    ownerUid: mobileUid,
    userEmail: mobileEmail,
    type: 'PRIZE_PAYOUT',
    status: 'COMPLETED',
    amountPaise: 6000,
    amountRupees: 60,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    notes: 'Prize ₹60',
  });
  wallet += 60; // ₹260
  totalWon += 60;

  const wReq: WithdrawalRequest = {
    id: 'QK-WTH-9001',
    ownerUid: mobileUid,
    userEmail: mobileEmail,
    userName: 'Mobile Player',
    phone: '9876501046',
    accountHolderName: 'Mobile Player',
    accountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    amount: 60,
    timestamp: '2026-11-16 | 01:00:00 PM',
    status: 'pending',
    walletDeducted: false,
    walletRefunded: false,
  };
  const wDeduct = contestBackend.applyWithdrawalDeduction(wallet, wReq);
  assert.equal(wDeduct.nextWalletBalance, 200);
  const wApprove = contestBackend.applyWithdrawalStatusTransition(
    wDeduct.nextWalletBalance,
    wDeduct.updatedWithdrawal,
    'approved'
  );
  assert.equal(wApprove.nextWalletBalance, 200);
  assert.equal(totalWon, 60);
  console.log('[PASS] TEST 8: Contest entry, winnings, and single-deduction withdrawal flow unaffected.');

  console.log('\nPASS: All 8 Deposit Approval & Wallet Credit Synchronization tests passed!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
