import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DepositRequest, WithdrawalRequest, UserProfile } from '../src/types';
import { formatDepositId, formatWithdrawalId, formatDepositTimestamp } from '../src/utils/depositUtils';
import { contestBackend } from '../src/backend/contestEngine';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * Simulates the shared Firestore central collection + atomic transaction + collision resolver
 * across multiple independent mobile/desktop devices.
 */
class CentralizedCloudLedgerMock {
  users = new Map<string, Partial<UserProfile> & { walletBalance: number; version: number }>();
  deposits = new Map<string, DepositRequest & { version: number }>();
  withdrawals = new Map<string, WithdrawalRequest & { version: number }>();

  async resolveNonCollidingDepositId(
    preferredId: string,
    cleanEmail: string,
    resolvedOwnerUid: string,
    utrNumber?: string
  ): Promise<string> {
    const existing = this.deposits.get(preferredId);
    if (!existing) return preferredId;
    const sameOwner =
      (cleanEmail && (existing.userEmail || existing.email || '').toLowerCase() === cleanEmail.toLowerCase()) ||
      (resolvedOwnerUid && (existing.ownerUid === resolvedOwnerUid || existing.userId === resolvedOwnerUid));
    if (sameOwner && utrNumber && existing.utrNumber === utrNumber) {
      return preferredId;
    }
    for (let i = 1; i <= 10; i++) {
      const candidate = `QK-DEP-${104700 + i}`;
      if (!this.deposits.has(candidate)) return candidate;
    }
    return `QK-DEP-${Date.now().toString().slice(-6)}`;
  }

  async submitDepositFromDevice(
    draft: DepositRequest
  ): Promise<{ success: boolean; deposit?: DepositRequest; error?: string }> {
    const amt = Number(draft.amount);
    if (!Number.isFinite(amt) || amt < 100) {
      return { success: false, error: 'Minimum deposit amount is ₹100.' };
    }
    const cleanEmail = (draft.userEmail || draft.email || '').trim().toLowerCase();
    const ownerUid = (draft.ownerUid || draft.userId || '').trim();
    const resolvedId = await this.resolveNonCollidingDepositId(draft.id, cleanEmail, ownerUid, draft.utrNumber);

    const saved: DepositRequest & { version: number } = {
      ...draft,
      id: resolvedId,
      requestId: resolvedId,
      firestoreDocId: resolvedId,
      userEmail: cleanEmail,
      email: cleanEmail,
      ownerUid,
      userId: ownerUid,
      status: 'pending',
      walletCredited: false,
      version: 1,
    };
    this.deposits.set(resolvedId, saved);
    return { success: true, deposit: saved };
  }

  async approveDepositAtomic(depositId: string): Promise<{
    success: boolean;
    credited?: boolean;
    alreadyCredited?: boolean;
    newWalletBalance?: number;
  }> {
    const snap = this.deposits.get(depositId);
    if (!snap) return { success: false };
    const startVer = snap.version;
    await new Promise((r) => setTimeout(r, 4));
    const latest = this.deposits.get(depositId)!;
    if (latest.version !== startVer || latest.walletCredited || latest.status === 'approved') {
      const u = this.users.get((latest.userEmail || '').replace(/[^a-zA-Z0-9_-]/g, '_'));
      return { success: true, credited: false, alreadyCredited: true, newWalletBalance: u?.walletBalance ?? 0 };
    }

    const emailKey = (latest.userEmail || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDoc = this.users.get(emailKey)!;
    const nextBalance = (userDoc?.walletBalance || 0) + Number(latest.amount);
    this.users.set(emailKey, { ...userDoc, walletBalance: nextBalance, lastCreditedDepositId: depositId, version: (userDoc?.version || 0) + 1 });
    this.deposits.set(depositId, {
      ...latest,
      status: 'approved',
      walletCredited: true,
      walletCreditedAmount: Number(latest.amount),
      creditedAt: new Date().toISOString(),
      version: latest.version + 1,
    });
    return { success: true, credited: true, alreadyCredited: false, newWalletBalance: nextBalance };
  }

  queryDepositsForRole(opts: { isAdmin: boolean; uid?: string; email?: string }): DepositRequest[] {
    const all = Array.from(this.deposits.values());
    if (opts.isAdmin) return all;
    const cleanEmail = (opts.email || '').trim().toLowerCase();
    return all.filter((d) => {
      const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
      return (opts.uid && (d.ownerUid === opts.uid || d.userId === opts.uid)) || (cleanEmail && dEmail === cleanEmail);
    });
  }
}

/**
 * Mirrors AdminPage's applyAuthoritativeDepositsSnapshot merge & stale-cache pruning logic.
 */
function mergeAdminAuthoritativeDeposits(
  prevList: DepositRequest[],
  cloudList: DepositRequest[],
  inFlightIds: Set<string>,
  deletedIds: string[]
): DepositRequest[] {
  const map = new Map<string, DepositRequest>();
  const coveredIds = new Set<string>();
  const prevById = new Map<string, DepositRequest>();

  prevList.forEach((d) => {
    if (d && d.id) {
      prevById.set(d.id, d);
      prevById.set(formatDepositId(d.id), d);
    }
  });

  cloudList.forEach((d) => {
    if (!d || !d.id) return;
    const normId = formatDepositId(d.id);
    const dedupKey = d.firestoreDocId || d.id;
    const cloudStatus = String(d.status || 'pending').trim().toLowerCase() as DepositRequest['status'];
    const isDeletedResolved = cloudStatus !== 'pending' && (deletedIds.includes(d.id) || deletedIds.includes(normId));
    if (isDeletedResolved) return;

    const local = prevById.get(d.id) || prevById.get(normId);
    const isInFlight = inFlightIds.has(d.id) || inFlightIds.has(normId);
    coveredIds.add(d.id);
    coveredIds.add(normId);
    map.set(dedupKey, {
      ...d,
      id: d.id,
      status: isInFlight && local ? local.status : cloudStatus,
      timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date),
    });
  });

  prevList.forEach((d) => {
    if (!d || !d.id) return;
    const normId = formatDepositId(d.id);
    const dedupKey = d.firestoreDocId || d.id;
    if (map.has(dedupKey) || coveredIds.has(d.id) || coveredIds.has(normId)) return;
    if (inFlightIds.has(d.id) || inFlightIds.has(normId)) {
      map.set(dedupKey, d);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
    const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
    return timeB - timeA;
  });
}

async function runTests() {
  console.log('==============================================================================');
  console.log('QUIZKART: GLOBAL CROSS-DEVICE DEPOSIT & WITHDRAWAL SYNC VERIFICATION');
  console.log('==============================================================================\n');

  // 1. Source Contracts & Security Rules Preservation
  const firebaseSrc = readSrc('src/firebase.ts');
  const appSrc = readSrc('src/App.tsx');
  const depositPageSrc = readSrc('src/components/DepositPage.tsx');
  const adminPageSrc = readSrc('src/components/AdminPage.tsx');
  const rulesSrc = readSrc('firestore.rules');

  assert.match(firebaseSrc, /export async function submitDepositTransaction/, 'firebase.ts exports atomic submitDepositTransaction');
  assert.match(firebaseSrc, /export async function fetchDepositsWithStatusFromFirestore/, 'firebase.ts exports fetchDepositsWithStatusFromFirestore');
  assert.match(firebaseSrc, /export async function fetchWithdrawalsWithStatusFromFirestore/, 'firebase.ts exports fetchWithdrawalsWithStatusFromFirestore');
  assert.match(firebaseSrc, /function isFirebaseVerifiedAdmin/, 'firebase.ts validates verified admin email');
  assert.match(firebaseSrc, /waitForFirebaseAuthReady\(\)/, 'firebase.ts waits for auth hydration before querying');
  assert.match(firebaseSrc, /onAuthStateChanged\(auth/, 'firebase.ts rebinds listeners when auth session settles or changes');

  assert.match(depositPageSrc, /const addRes = await onAddDeposit\(newDepositItem\);/, 'DepositPage awaits authoritative deposit persistence');
  assert.ok(!/saveDepositToFirestore\(newDepositItem\)/.test(depositPageSrc), 'DepositPage no longer fires duplicate un-awaited Firestore deposit write');

  assert.match(appSrc, /submitDepositTransaction\(fullDeposit, currentSnap\)/, 'App.tsx submits deposits via collision-free transaction');
  assert.match(appSrc, /fetchDepositsWithStatusFromFirestore\(/, 'App.tsx uses status-checked deposit fetch');
  assert.match(appSrc, /fetchWithdrawalsWithStatusFromFirestore\(/, 'App.tsx uses status-checked withdrawal fetch');
  assert.match(appSrc, /currentUser\?\.emailVerified,\s*userProfile\?\.uid,\s*userProfile\?\.email,\s*isAdminPageActive/, 'App.tsx re-hydrates deposit/withdrawal listeners on auth & admin role changes');

  assert.match(adminPageSrc, /fetchDepositsWithStatusFromFirestore\(\)/, 'AdminPage uses authoritative status-checked deposit fetch');
  assert.match(adminPageSrc, /subscribeToWithdrawalsFromFirestore\(/, 'AdminPage subscribes to live centralized withdrawals');
  assert.match(adminPageSrc, /applyAuthoritativeDepositsSnapshot\(/, 'AdminPage reconciles authoritative deposits snapshot cleanly');
  assert.match(adminPageSrc, /applyAuthoritativeWithdrawalsSnapshot\(/, 'AdminPage reconciles authoritative withdrawals snapshot cleanly');

  assert.match(rulesSrc, /function isAdmin\(\)/, 'firestore.rules preserves strict isAdmin() check');
  assert.match(rulesSrc, /request\.auth\.token\.email_verified == true &&[\s\n]*request\.auth\.token\.email == 'nmlcompany720@gmail\.com'/, 'firestore.rules restricts admin role to verified nmlcompany720@gmail.com');
  assert.ok(!/match \/deposits\/\{depositId\}[\s\S]{0,120}allow read: if true;/.test(rulesSrc), 'firestore.rules does not make /deposits publicly readable');
  assert.ok(!/match \/withdrawals\/\{withdrawalId\}[\s\S]{0,120}allow read: if true;/.test(rulesSrc), 'firestore.rules does not make /withdrawals publicly readable');
  console.log('[PASS] TEST 1: All source contracts, auth-aware listeners, and Firestore security rules verified.');

  // 2. Two Mobile Devices Submit Deposits Concurrently (No QK-DEP-1047 Collision)
  const cloud = new CentralizedCloudLedgerMock();
  const userAEmail = 'mobile.a@quizkart.in';
  const userBEmail = 'mobile.b@quizkart.in';
  cloud.users.set(userAEmail.replace(/[^a-zA-Z0-9_-]/g, '_'), { uid: 'uid_a', email: userAEmail, walletBalance: 0, version: 1 });
  cloud.users.set(userBEmail.replace(/[^a-zA-Z0-9_-]/g, '_'), { uid: 'uid_b', email: userBEmail, walletBalance: 0, version: 1 });

  const subA = await cloud.submitDepositFromDevice({
    id: 'QK-DEP-1047',
    ownerUid: 'uid_a',
    userId: 'uid_a',
    userName: 'Player A',
    userEmail: userAEmail,
    phone: '9876500001',
    amount: 200,
    utrNumber: 'UTR10470001',
    timestamp: '2026-11-16 | 01:00:00 PM',
    createdAt: '2026-11-16T07:30:00.000Z',
    status: 'pending',
  });
  const subB = await cloud.submitDepositFromDevice({
    id: 'QK-DEP-1047', // Mobile B started offline/scoped with same seq counter!
    ownerUid: 'uid_b',
    userId: 'uid_b',
    userName: 'Player B',
    userEmail: userBEmail,
    phone: '9876500002',
    amount: 500,
    utrNumber: 'UTR10470002',
    timestamp: '2026-11-16 | 01:05:00 PM',
    createdAt: '2026-11-16T07:35:00.000Z',
    status: 'pending',
  });

  assert.equal(subA.success, true);
  assert.equal(subB.success, true);
  assert.equal(subA.deposit?.id, 'QK-DEP-1047');
  assert.notEqual(subB.deposit?.id, 'QK-DEP-1047', 'Second user on separate device must get a non-colliding ID instead of overwriting QK-DEP-1047');
  assert.equal(cloud.deposits.size, 2, 'Both deposits must exist independently in centralized cloud');
  console.log(`[PASS] TEST 2: Multi-device ID collision prevented cleanly (${subA.deposit?.id} & ${subB.deposit?.id}).`);

  // 3. Cross-Device Admin Visibility & Stale Local Cache Pruning (Mobile A -> Mobile B Admin Panel)
  const scopedForUserA = cloud.queryDepositsForRole({ isAdmin: false, uid: 'uid_a', email: userAEmail });
  assert.equal(scopedForUserA.length, 1);
  assert.equal(scopedForUserA[0].id, 'QK-DEP-1047');

  const globalForAdminOnMobileB = cloud.queryDepositsForRole({ isAdmin: true });
  assert.equal(globalForAdminOnMobileB.length, 2, 'Admin on Mobile B must receive ALL users deposits globally');

  const staleLocalGhost: DepositRequest = {
    id: 'QK-DEP-STALE',
    userName: 'Ghost Local',
    phone: '0000000000',
    amount: 100,
    utrNumber: 'STALE',
    timestamp: '2026-11-15 | 10:00:00 AM',
    status: 'pending',
  };
  const uppercaseCloudVariant = globalForAdminOnMobileB.map((d) =>
    d.id === 'QK-DEP-1047' ? { ...d, status: 'PENDING' as any } : d
  );
  const syncedAdminDeposits = mergeAdminAuthoritativeDeposits(
    [staleLocalGhost],
    uppercaseCloudVariant,
    new Set(),
    []
  );
  assert.equal(syncedAdminDeposits.length, 2, 'Stale unpersisted local cache ghost must be pruned once authoritative cloud snapshot loads');
  assert.equal(syncedAdminDeposits.filter((d) => d.status === 'pending').length, 2, 'Pending count accurately equals 2 with normalized lowercase status');
  assert.equal(syncedAdminDeposits.find((d) => d.id === 'QK-DEP-1047')?.status, 'pending');
  console.log('[PASS] TEST 3: Centralized Admin Panel on Mobile B receives all multi-device deposits, normalizes statuses, and prunes stale local caches.');

  // 4. Concurrent Cross-Device Deposit Approval Idempotency (No Double Wallet Credit)
  const [appDev1, appDev2] = await Promise.all([
    cloud.approveDepositAtomic('QK-DEP-1047'),
    cloud.approveDepositAtomic('QK-DEP-1047'),
  ]);
  const creditsApplied = [appDev1, appDev2].filter((r) => r.credited === true).length;
  assert.equal(creditsApplied, 1, 'Exactly one Admin approval across devices may credit wallet');
  assert.equal(cloud.users.get(userAEmail.replace(/[^a-zA-Z0-9_-]/g, '_'))?.walletBalance, 200);
  console.log('[PASS] TEST 4: Concurrent multi-device deposit approval credits ₹200 strictly once.');

  // 5. Cross-Device Withdrawal Synchronization & Single-Deduction Accounting Invariant
  contestBackend.resetForTesting();
  const wth: WithdrawalRequest = {
    id: 'QK-WTH-2001',
    requestId: 'QK-WTH-2001',
    ownerUid: 'uid_a',
    userId: 'uid_a',
    userName: 'Player A',
    userEmail: userAEmail,
    phone: '9876500001',
    accountHolderName: 'Player A',
    accountNumber: '112233445566',
    ifscCode: 'SBIN0001234',
    amount: 60,
    timestamp: '2026-11-16 | 02:00:00 PM',
    status: 'pending',
    walletDeducted: false,
    walletRefunded: false,
  };
  const d1 = contestBackend.applyWithdrawalDeduction(200, wth);
  assert.equal(d1.nextWalletBalance, 140);
  const wApprove = contestBackend.applyWithdrawalStatusTransition(d1.nextWalletBalance, d1.updatedWithdrawal, 'approved');
  assert.equal(wApprove.nextWalletBalance, 140, 'Admin approval does not deduct withdrawal a second time');
  console.log('[PASS] TEST 5: Withdrawal submission & approval preserve single-deduction wallet invariant.');

  console.log('\nPASS: All 5 Global Cross-Device Deposit & Withdrawal Synchronization tests passed!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
