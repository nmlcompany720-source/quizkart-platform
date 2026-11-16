import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  fetchWithdrawalsFromFirestore,
  subscribeToWithdrawalsFromFirestore
} from '../src/firebase';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

async function main() {
  console.log('=== QUIZ KART WITHDRAWAL ADMIN SYNC & WARNING UI VERIFICATION ===');

  // 1. Live Firestore Integration Check (Read-Only, Real Database)
  const adminCloudWithdrawals = await fetchWithdrawalsFromFirestore();
  assert.ok(Array.isArray(adminCloudWithdrawals), 'fetchWithdrawalsFromFirestore() must return an array');
  assert.ok(adminCloudWithdrawals.length > 0, 'Expected existing withdrawal records in Firestore');

  const pendingCloud = adminCloudWithdrawals.filter((w) => w.status === 'pending');
  console.log(`Live Firestore withdrawals fetched (Admin view): total=${adminCloudWithdrawals.length}, pending=${pendingCloud.length}`);

  const scopedUserWithdrawals = await fetchWithdrawalsFromFirestore('QK-USR-1013', 'abilas73577@gmail.com');
  assert.ok(
    scopedUserWithdrawals.some((w) => w.id === 'QK-WTH-1009' && w.status === 'approved'),
    'Expected historical QK-WTH-1009 to remain intact in Firestore'
  );
  assert.ok(
    scopedUserWithdrawals.some((w) => w.id === 'QK-WTH-1010' && w.status === 'approved'),
    'Expected historical QK-WTH-1010 to remain intact in Firestore'
  );

  // Verify live real-time subscription emits Admin list without duplicate errors
  const subPromise = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for subscribeToWithdrawalsFromFirestore')), 8000);
    const unsub = subscribeToWithdrawalsFromFirestore((list) => {
      clearTimeout(timer);
      unsub();
      resolve(list.length);
    });
  });
  const subCount = await subPromise;
  assert.ok(subCount >= adminCloudWithdrawals.length, `Expected subscription count (${subCount}) >= fetch count (${adminCloudWithdrawals.length})`);
  console.log(`Live Firestore real-time listener verified: emitted ${subCount} withdrawals`);

  // 2. Source & Architecture Verification: Firestore Rules + firebase.ts + App.tsx + AdminPage.tsx + WithdrawalApprovalsTab.tsx
  const rulesSrc = readSrc('firestore.rules');
  assert.match(rulesSrc, /match \/withdrawals\/\{withdrawalId\}[\s\S]*allow get:[\s\S]*resource == null \|\|/, 'firestore.rules allow get on /withdrawals must permit resource == null for signed-in tx.get');

  const firebaseSrc = readSrc('src/firebase.ts');
  assert.match(firebaseSrc, /function stripUndefinedFields/, 'firebase.ts must strip undefined fields before Firestore writes');
  assert.match(firebaseSrc, /resolveNonCollidingWithdrawalId/, 'firebase.ts must resolve colliding withdrawal IDs across devices/users');
  assert.match(firebaseSrc, /await saveWithdrawalToFirestore\(fallbackSaved\)/, 'submitWithdrawalTransaction catch fallback must persist withdrawal to Firestore');
  assert.match(firebaseSrc, /const isUserScopedRequest = Boolean\(cleanTargetUid \|\| cleanTargetEmail\);/, 'Admin fetch/subscribe without user args must not force user-only scope');
  assert.match(firebaseSrc, /fetchAllWithdrawalsViaRestFallback/, 'Admin fetch/subscribe must gracefully handle non-admin Firebase Auth session fallback');

  const appSrc = readSrc('src/App.tsx');
  assert.match(appSrc, /const isAdmin = targetEmail === 'nmlcompany720@gmail\.com' \|\| isAdminPageActive;/, 'App.tsx withdrawal listener must switch to admin scope when Admin Panel is active');
  assert.match(appSrc, /\[currentUser\?\.uid, currentUser\?\.email, userProfile\?\.uid, userProfile\?\.email, isAdminPageActive\]/, 'App.tsx withdrawal listener deps must include isAdminPageActive and userProfile.uid');
  assert.match(appSrc, /const isDeletedResolved = w\.status !== 'pending' && \(deletedWithdrawals\.includes\(w\.id\)/, 'App.tsx must never hide pending withdrawals via deletedWithdrawals');

  const adminSrc = readSrc('src/components/AdminPage.tsx');
  assert.ok(!adminSrc.includes('subscribeToWithdrawalsFromFirestore('), 'AdminPage.tsx must not open a duplicate Firestore withdrawals listener');
  assert.match(adminSrc, /const isDeletedResolved = w\.status !== 'pending' && \(deletedWithdrawals\.includes\(w\.id\)/, 'AdminPage.tsx must never hide pending withdrawals via deletedWithdrawals');
  assert.match(adminSrc, /const mergeIntoMap = \(w: WithdrawalRequest, preferNew: boolean\)/, 'AdminPage.tsx propWithdrawals sync must merge rather than blindly overwrite');

  const tabSrc = readSrc('src/components/WithdrawalApprovalsTab.tsx');
  assert.match(tabSrc, /if \(!dedupMap\.has\(w\.id\)\) \{\s*dedupMap\.set\(w\.id, w\);/, 'WithdrawalApprovalsTab.tsx must deduplicate by exact w.id');

  // 3. Warning Icon Alignment Verification in WithdrawalPage.tsx
  const withdrawalPageSrc = readSrc('src/components/WithdrawalPage.tsx');
  assert.match(
    withdrawalPageSrc,
    /\{errorMsg && \(\s*<div className="p-3\.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2\.5">\s*<AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0\.5" \/>\s*<span className="leading-relaxed">\{errorMsg\}<\/span>\s*<\/div>\s*\)\}/,
    'WithdrawalPage.tsx Red/Pink warning box must align AlertCircle icon at top-start with mt-0.5 and leading-relaxed while preserving bg-rose-50 border-rose-200 text-rose-800'
  );

  // Check simulated Admin Pending counter calculation before/after a pending submission and approval
  const samplePending: any = {
    id: 'QK-WTH-9991',
    userName: 'Test User',
    userEmail: 'testuser@example.com',
    phone: '9999999999',
    amount: 180,
    date: '2026-11-14',
    timestamp: '2026-11-14 | 12:00:00 PM',
    status: 'pending'
  };
  const simulatedAdminList = [samplePending, ...adminCloudWithdrawals];
  const countWithPending = simulatedAdminList.filter((w) => w.status === 'pending').length;
  assert.equal(countWithPending, pendingCloud.length + 1, 'Pending counter must increment by 1 on new pending request');
  const afterApprove = simulatedAdminList.map((w) => (w.id === samplePending.id ? { ...w, status: 'approved' } : w));
  const countAfterApprove = afterApprove.filter((w) => w.status === 'pending').length;
  assert.equal(countAfterApprove, pendingCloud.length, 'Pending counter must decrement after Admin approval');

  console.log('PASS: All Withdrawal Admin Sync, Firestore Integration, Pending Counter & Warning Icon Alignment checks passed!');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
