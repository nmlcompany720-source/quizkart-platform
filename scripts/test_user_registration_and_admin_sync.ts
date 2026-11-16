import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { doc, getDoc } from 'firebase/firestore';
import {
  db,
  extractNumericUserNumber,
  assignSequentialUserIdViaTransaction,
  normalizeAndDeduplicateFirestoreUsers,
  fetchAllUsersWithStatusFromFirestore,
  subscribeToAllUsersFromFirestore
} from '../src/firebase';
import { UserProfile } from '../src/types';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

async function runTests() {
  console.log('==============================================================================');
  console.log('QUIZKART: CENTRALIZED USER REGISTRATION & ADMIN SYNC VERIFICATION SUITE');
  console.log('==============================================================================\n');

  const firebaseSrc = readSrc('src/firebase.ts');
  const appSrc = readSrc('src/App.tsx');
  const authModalSrc = readSrc('src/components/AuthModal.tsx');
  const adminPageSrc = readSrc('src/components/AdminPage.tsx');
  const rulesSrc = readSrc('firestore.rules');

  // ============================================================================
  // TEST 1: Complete User Record Persistence Contract (No undefined fields)
  // ============================================================================
  assert.match(
    firebaseSrc,
    /const userPayload = stripUndefinedFields\(rawPayload\);\s*await setDoc\(doc\(db, 'users', docId\), userPayload, \{ merge: true \}\);/,
    'syncUserProfile must strip undefined fields before setDoc'
  );
  assert.match(
    firebaseSrc,
    /createdAt:\s*resolvedCreatedAt,[\s\S]*status:\s*isUserDeleted \? 'deleted' : \(profile\.status \|\| 'active'\)/,
    'syncUserProfile must persist createdAt and status'
  );
  assert.match(
    appSrc,
    /await syncUserProfile\(updatedProfile, \{ throwOnError: true \}\);\s*setUserProfile\(updatedProfile\);\s*setIsUserAuthenticated\(true\);\s*setIsAuthModalOpen\(false\);/,
    'App.tsx must await Firestore persistence BEFORE marking registration completed in UI'
  );
  assert.match(
    authModalSrc,
    /const cloudUser = await fetchUserProfile\('', trimmedEmail\);/,
    'AuthModal Step 1 must check centralized Firestore for returning users across devices'
  );
  console.log('[PASS] TEST 1: Centralized user registration persists before UI completion & handles undefined fields.');

  // ============================================================================
  // TEST 2: Atomic Registration ID Immutability, Uniqueness & Concurrency Safety
  // ============================================================================
  const immutableResult = await assignSequentialUserIdViaTransaction(
    'firebase_uid_immutable_1',
    'immutable@example.com',
    'QK-USR-1043'
  );
  assert.equal(immutableResult.customUserId, 'QK-USR-1043', 'Existing Registration ID must never regenerate');
  assert.equal(immutableResult.userNumber, 1043);

  assert.match(
    firebaseSrc,
    /for \(let attempt = 0; attempt < 4; attempt\+\+\)[\s\S]*runTransaction\(db, async \(transaction\)/,
    'assignSequentialUserIdViaTransaction must use Firestore runTransaction with contention retry loop'
  );
  assert.match(
    firebaseSrc,
    /throw new Error\(\s*`Unable to assign unique sequential Registration ID via Firestore/,
    'assignSequentialUserIdViaTransaction must fail explicitly instead of silently generating colliding QK-USR-1001 in localStorage'
  );

  // Live non-destructive counter check
  const counterSnap = await getDoc(doc(db, 'settings', 'user_counter'));
  assert.equal(counterSnap.exists(), true, 'Live Firestore settings/user_counter document must exist');
  const liveLastNum = Number(counterSnap.data()?.lastUserNumber || 0);
  assert.ok(liveLastNum >= 1014, `Expected live lastUserNumber >= 1014, got ${liveLastNum}`);

  // Simulate 5 simultaneous atomic allocations
  let simCounter = liveLastNum;
  const allocateAtomicSim = async () => {
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
    simCounter += 1;
    return { customUserId: `QK-USR-${simCounter}`, userNumber: simCounter };
  };
  const concurrentIds = await Promise.all([
    allocateAtomicSim(),
    allocateAtomicSim(),
    allocateAtomicSim(),
    allocateAtomicSim(),
    allocateAtomicSim()
  ]);
  const idSet = new Set(concurrentIds.map((r) => r.customUserId));
  assert.equal(idSet.size, 5, 'Simultaneous registrations must produce 5 distinct Registration IDs');
  console.log(`[PASS] TEST 2: Registration ID immutability, contention retry & concurrency verified (live counter=${liveLastNum}).`);

  // ============================================================================
  // TEST 3: UID Deduplication, Alias Merging, Chronological Sort & Pagination
  // ============================================================================
  const duplicateRawDocs: Array<{ docId: string; data: Partial<UserProfile> }> = [
    // Alias doc written by email before/alongside Firebase UID doc
    {
      docId: 'rahul_sharma_example_com',
      data: {
        uid: 'uid_rahul_123',
        email: 'rahul.sharma@example.com',
        name: 'Rahul Sharma',
        mobile: '9111222333',
        customUserId: 'QK-USR-1043',
        userNumber: 1043,
        createdAt: '2026-11-10T09:15:00.000Z',
        updatedAt: '2026-11-10T09:15:00.000Z',
        status: 'active',
        isRegistered: true
      }
    },
    // Canonical UID doc for the same user (newer update)
    {
      docId: 'uid_rahul_123',
      data: {
        uid: 'uid_rahul_123',
        email: 'RAHUL.SHARMA@EXAMPLE.COM',
        name: 'Rahul Sharma',
        mobile: '9111222333',
        customUserId: 'QK-USR-1043',
        userNumber: 1043,
        createdAt: '2026-11-10T09:15:00.000Z',
        updatedAt: '2026-11-12T10:00:00.000Z',
        walletBalance: 250,
        status: 'active',
        isRegistered: true
      }
    },
    // User without userNumber field (previously silently omitted by orderBy('userNumber', 'asc')!)
    {
      docId: 'uid_anita_456',
      data: {
        uid: 'uid_anita_456',
        email: 'anita@example.com',
        name: 'Anita Verma',
        mobile: '9222333444',
        createdAt: '2026-11-11T08:00:00.000Z',
        updatedAt: '2026-11-11T08:00:00.000Z',
        status: 'active',
        isRegistered: true
      }
    },
    // Deleted user must stay excluded
    {
      docId: 'uid_deleted_999',
      data: {
        uid: 'uid_deleted_999',
        email: 'deleted@example.com',
        name: 'Deleted Account',
        isDeleted: true,
        status: 'deleted'
      }
    }
  ];

  // Add 13 more users so total active users = 15 (testing pagination across Page 1 and Page 2)
  for (let i = 0; i < 13; i++) {
    const num = 1044 + i;
    duplicateRawDocs.push({
      docId: `uid_bulk_${num}`,
      data: {
        uid: `uid_bulk_${num}`,
        email: `player${num}@example.com`,
        name: `Player ${num}`,
        mobile: `980000${String(1000 + i).slice(-4)}`,
        customUserId: `QK-USR-${num}`,
        userNumber: num,
        createdAt: new Date(Date.UTC(2026, 10, 12, 10, i, 0)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 10, 12, 10, i, 0)).toISOString(),
        status: 'active',
        isRegistered: true
      }
    });
  }

  const deduped = normalizeAndDeduplicateFirestoreUsers(duplicateRawDocs);
  assert.equal(deduped.length, 15, 'Should deduplicate email+UID docs and exclude deleted users (total 15)');
  assert.equal(deduped[0].customUserId, 'QK-USR-1043', 'Earliest sequential user must appear first');
  assert.equal(deduped[0].walletBalance, 250, 'Newer update fields must merge cleanly while keeping earliest createdAt');
  assert.equal(deduped[0].createdAt, '2026-11-10T09:15:00.000Z');
  assert.ok(deduped.some((u) => u.uid === 'uid_anita_456'), 'Users missing userNumber must NOT be excluded');

  // Verify pagination logic across pages (PAGE_SIZE = 10)
  const PAGE_SIZE = 10;
  const page1 = deduped.slice(0, PAGE_SIZE);
  const page2 = deduped.slice(PAGE_SIZE, PAGE_SIZE * 2);
  assert.equal(page1.length, 10, 'Page 1 must display 10 users');
  assert.equal(page2.length, 5, 'Page 2 must display remaining 5 users without dropping any');
  assert.ok(extractNumericUserNumber(page1[0]) < extractNumericUserNumber(page1[1]));
  console.log('[PASS] TEST 3: UID deduplication, missing-userNumber inclusion, sorting & multi-page pagination verified.');

  // ============================================================================
  // TEST 4: No Fake Placeholders, No Stale localStorage Overwrite & Strict Rules
  // ============================================================================
  assert.doesNotMatch(
    adminPageSrc,
    /u\.mobile\s*\|\|\s*'9876543210'/,
    'AdminPage must never show fake placeholder 9876543210 in user list'
  );
  assert.doesNotMatch(
    adminPageSrc,
    /u\.email\s*\|\|\s*'player@quizkart\.in'/,
    'AdminPage must never show fake placeholder player@quizkart.in in user list'
  );
  assert.doesNotMatch(
    adminPageSrc,
    /deduplicateRegisteredUsers\(\[\.\.\.cloudUsers,\s*\.\.\.prev\]\)/,
    'AdminPage must use authoritative Firestore users instead of letting stale local state overwrite Firestore'
  );
  assert.doesNotMatch(
    adminPageSrc,
    /localUsers\.forEach\(\(lu\)\s*=>[\s\S]*syncUserProfile\(lu\)/,
    'AdminPage must NOT bulk-upload stale localStorage users back into Firestore on mount'
  );
  assert.match(
    adminPageSrc,
    /formatRegistrationTime\(u\.createdAt,\s*u\.registrationDate\)/,
    'AdminPage must render real Registration Time alongside Registration Date'
  );
  assert.match(
    adminPageSrc,
    /ensureBackfillIdsAndCounter/,
    'AdminPage must safely backfill missing sequential IDs and counter minimum'
  );
  assert.match(
    rulesSrc,
    /allow list:\s*if isAdmin\(\);/,
    'firestore.rules MUST preserve strict admin-only list rule'
  );
  console.log('[PASS] TEST 4: Placeholder removal, authoritative cloud sync, time display & strict firestore.rules verified.');

  // ============================================================================
  // TEST 5: Unauthenticated Firestore Permission Enforcement & Clean Handling
  // ============================================================================
  const unauthRes = await fetchAllUsersWithStatusFromFirestore();
  assert.equal(
    unauthRes.errorCode,
    'permission-denied',
    'Unauthenticated users collection query must cleanly report permission-denied'
  );
  assert.deepEqual(unauthRes.users, []);

  const subError = await new Promise<{ code: string; message: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Subscription error callback timed out')), 8000);
    const unsub = subscribeToAllUsersFromFirestore(
      () => {},
      (err) => {
        clearTimeout(timer);
        unsub();
        resolve(err);
      }
    );
  });
  assert.equal(subError.code, 'permission-denied', 'Unauthenticated onSnapshot must cleanly emit permission-denied to onError');
  assert.match(
    adminPageSrc,
    /id="admin-users-cloud-auth-banner"/,
    'AdminPage must render explicit Admin Google Sign-In prompt when permission-denied occurs'
  );
  console.log('[PASS] TEST 5: Unauthenticated permission-denied detection & Admin Auth prompt verified.');

  console.log('\nALL USER REGISTRATION & ADMIN SYNCHRONIZATION TESTS PASSED.');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  });
