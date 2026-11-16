import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { doc, getDoc } from 'firebase/firestore';
import {
  app,
  auth,
  db,
  AUTHORIZED_ADMIN_EMAIL,
  googleProvider,
  googleChatProvider,
  GOOGLE_CHAT_SCOPES,
  getAuthPersistenceStatus,
  waitForFirebaseAuthReady,
  verifyAdminSessionAndLoadUsers,
  fetchAllUsersWithStatusFromFirestore,
  subscribeToAllUsersFromFirestore,
  normalizeAndDeduplicateFirestoreUsers
} from '../src/firebase';
import { isDemoSeedUser, isConfirmedFakeDisplayUser } from '../src/data/quizData';
import {
  compactBannerSlidesForLocalCache,
  compactContestsForLocalCache,
  compactDepositsForLocalCache,
  compactRegisteredUsersForLocalCache,
  isStorageQuotaError
} from '../src/utils/storageHygiene';

const rootDir = process.cwd();

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  const check = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  const checkAsync = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  console.log('\n=== QUIZKART ADMIN GOOGLE AUTH, INDEXEDDB PERSISTENCE & STORAGE QUOTA VERIFICATION ===\n');

  const firebaseTs = readFile('src/firebase.ts');
  const rulesText = readFile('firestore.rules');
  const appTsx = readFile('src/App.tsx');
  const adminPageTsx = readFile('src/components/AdminPage.tsx');
  const poolManagerTs = readFile('src/utils/questionPoolManager.ts');
  const googleChatModalTsx = readFile('src/components/GoogleChatModal.tsx');
  const googleChatServiceTs = readFile('src/services/googleChatService.ts');
  const configJson = JSON.parse(readFile('firebase-applet-config.json'));

  // 1. Firebase & OAuth Configuration Sanity
  check('Firebase project, authDomain, oAuthClientId & databaseId match project config', () => {
    assert.strictEqual(app.options.projectId, 'quantum-tomorrow-r0bnn');
    assert.strictEqual(app.options.authDomain, 'quantum-tomorrow-r0bnn.firebaseapp.com');
    assert.strictEqual(configJson.oAuthClientId, '357659413011-afv4jch26vr7ocsjtsedo9ip6qe81udh.apps.googleusercontent.com');
    assert.strictEqual(configJson.firestoreDatabaseId, 'ai-studio-quizkartin-d9963b2a-d309-41d1-80a3-29d8999e847f');
    assert.strictEqual(AUTHORIZED_ADMIN_EMAIL, 'nmlcompany720@gmail.com');
  });

  // 2. Clean Google Identity Provider (NO restricted Workspace Chat scopes on googleProvider)
  check('googleProvider uses only clean OpenID scopes (email, profile) without restricted Workspace Chat scopes', () => {
    // @ts-ignore inspect internal provider scopes
    const providerScopes: string[] = (googleProvider as any).getScopes ? (googleProvider as any).getScopes() : [];
    const hasChatScopeOnIdentityProvider = providerScopes.some((s) => s.includes('chat.') || s.includes('googleapis.com/auth/chat'));
    assert.strictEqual(hasChatScopeOnIdentityProvider, false, `Unexpected chat scopes on googleProvider: ${providerScopes.join(', ')}`);
    assert.ok(providerScopes.includes('email'), 'googleProvider should include email scope');
    assert.ok(providerScopes.includes('profile'), 'googleProvider should include profile scope');

    // @ts-ignore verify isolated chat provider retains chat scopes
    const chatScopes: string[] = (googleChatProvider as any).getScopes ? (googleChatProvider as any).getScopes() : [];
    assert.ok(chatScopes.length >= GOOGLE_CHAT_SCOPES.length, 'googleChatProvider should retain Workspace Chat scopes');
    assert.ok(!googleChatModalTsx.includes('signInWithGoogle'), 'GoogleChatModal should use signInForGoogleChat');
    assert.ok(googleChatModalTsx.includes('signInForGoogleChat'), 'GoogleChatModal must import/call signInForGoogleChat');
    assert.ok(!googleChatServiceTs.includes('signInWithGoogle'), 'googleChatService should use signInForGoogleChat');
    assert.ok(googleChatServiceTs.includes('signInForGoogleChat'), 'googleChatService must call signInForGoogleChat');
  });

  // 3. IndexedDB Persistence Priority & Fallbacks (NO localStorage browserLocalPersistence!)
  check('Firebase Auth uses indexedDBLocalPersistence -> browserSessionPersistence -> inMemoryPersistence (never localStorage browserLocalPersistence)', () => {
    assert.ok(!firebaseTs.includes('browserLocalPersistence'), 'Must NOT use localStorage browserLocalPersistence for Admin Auth');
    assert.ok(firebaseTs.includes('initializeAuth('), 'Must initialize Auth with explicit persistence priority list');
    assert.ok(firebaseTs.includes('indexedDBLocalPersistence'), 'Must prioritize indexedDBLocalPersistence');
    assert.ok(firebaseTs.includes('browserSessionPersistence'), 'Must provide browserSessionPersistence fallback');
    assert.ok(firebaseTs.includes('inMemoryPersistence'), 'Must provide inMemoryPersistence fallback');
    assert.ok(firebaseTs.includes("mode: 'failed'"), 'Must surface explicit error state if all persistence modes fail');
    assert.ok(firebaseTs.includes('getRedirectResult(auth)'), 'Missing getRedirectResult recovery');
    assert.ok(firebaseTs.includes('authStateReady'), 'Missing waitForFirebaseAuthReady authStateReady call');
    assert.ok(firebaseTs.includes('await authPersistencePromise;') && firebaseTs.includes('waitForFirebaseAuthReady().then'), 'Must await persistence before Firestore users listener');
  });

  // 4. Storage Quota Error Detection & Hygiene Compaction Tests (without deleting user data)
  check('Storage hygiene compacts oversized Base64 images in cache mirrors while preserving all real user, deposit, contest & banner records', () => {
    const quotaErr = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'firebase:authUser:...' exceeded the quota.");
    assert.strictEqual(isStorageQuotaError(quotaErr), true);

    const bigAvatar = 'data:image/png;base64,' + 'A'.repeat(25_000);
    const smallAvatar = 'https://example.com/avatar.jpg';
    const compactedUsers = compactRegisteredUsersForLocalCache([
      { id: 'QK-USR-1001', customUserId: 'QK-USR-1001', name: 'Alice', email: 'alice@test.com', walletBalance: 500, avatarUrl: bigAvatar } as any,
      { id: 'QK-USR-1002', customUserId: 'QK-USR-1002', name: 'Bob', email: 'bob@test.com', walletBalance: 120, avatarUrl: smallAvatar } as any
    ]);
    assert.strictEqual(compactedUsers.length, 2);
    assert.strictEqual(compactedUsers[0].id, 'QK-USR-1001');
    assert.strictEqual(compactedUsers[0].walletBalance, 500);
    assert.strictEqual(compactedUsers[0].avatarUrl, '');
    assert.strictEqual(compactedUsers[1].avatarUrl, smallAvatar);

    const bigScreenshot = 'data:image/jpeg;base64,' + 'B'.repeat(50_000);
    const compactedDeposits = compactDepositsForLocalCache([
      { id: 'QK-DEP-1001', amount: 200, status: 'approved', screenshotUrl: bigScreenshot } as any
    ]);
    assert.strictEqual(compactedDeposits.length, 1);
    assert.strictEqual(compactedDeposits[0].amount, 200);
    assert.strictEqual(compactedDeposits[0].status, 'approved');
    assert.strictEqual(compactedDeposits[0].screenshotUrl, '');

    const bigContestImg = 'data:image/gif;base64,' + 'C'.repeat(80_000);
    const compactedContests = compactContestsForLocalCache([
      { id: 'CNT-1', title: 'Grand Blitz', entryFee: 100, status: 'active', cashConfig: { cashImageUrl: bigContestImg } } as any
    ]);
    assert.strictEqual(compactedContests[0].title, 'Grand Blitz');
    assert.strictEqual(compactedContests[0].cashConfig?.cashImageUrl, '');

    const bigBannerImg = 'data:image/png;base64,' + 'D'.repeat(450_000);
    const compactedBanners = compactBannerSlidesForLocalCache([
      { id: 'slot-1', title: 'Banner 1', imageUrl: bigBannerImg, isEnabled: true } as any
    ]);
    assert.strictEqual(compactedBanners[0].title, 'Banner 1');
    assert.strictEqual(compactedBanners[0].imageUrl, '');

    assert.ok(!poolManagerTs.includes("localStorage.setItem('quizkart_questions', JSON.stringify(updatedPool"), 'questionPoolManager must not blindly write bloated quizkart_questions');
    assert.ok(!firebaseTs.includes('localStorage.clear()') && !appTsx.includes('localStorage.clear()') && !adminPageTsx.includes('localStorage.clear()'), 'Must NEVER blindly call localStorage.clear()');
  });

  // 5. Admin Auth Verification State Machine & Anti-Loop Guards
  check('verifyAdminSessionAndLoadUsers & signInAdminWithGoogle validate UID, exact email, emailVerified, persistence, and surface errors', () => {
    assert.ok(firebaseTs.includes("cleanEmail !== AUTHORIZED_ADMIN_EMAIL"), 'Must compare against AUTHORIZED_ADMIN_EMAIL');
    assert.ok(firebaseTs.includes("status: 'unauthorized_account'"), 'Must return unauthorized_account for wrong Google email');
    assert.ok(firebaseTs.includes("user.emailVerified !== true"), 'Must check user.emailVerified === true');
    assert.ok(firebaseTs.includes("status: 'unverified_email'"), 'Must return unverified_email when unverified');
    assert.ok(firebaseTs.includes("status: 'permission_denied'"), 'Must return permission_denied on Firestore rule denial');
    assert.ok(firebaseTs.includes("status: 'cancelled'"), 'Must return cancelled when user closes popup');
    assert.ok(firebaseTs.includes("errorCode: 'auth/persistence-failed'"), 'Must surface persistence failures clearly');
    assert.ok(firebaseTs.includes("doc(db, 'admins', user.uid)"), 'Must persist verified admin UID in /admins/{uid}');
    assert.ok(firebaseTs.includes('formatGoogleAuthErrorMessage'), 'Must translate auth error codes to actionable messages');
  });

  // 6. Firestore Security Rules Verification (Zero-Regression)
  check('firestore.rules enforces verified Admin email/record for /users list and protects normal user privacy', () => {
    assert.ok(rulesText.includes("request.auth.token.email_verified == true"), 'isAdmin() must enforce email_verified == true');
    assert.ok(rulesText.includes("request.auth.token.email == 'nmlcompany720@gmail.com'"), 'isAdmin() must restrict to designated admin email');
    assert.ok(rulesText.includes('allow list: if isAdmin();'), '/users collection list must remain restricted to isAdmin()');
    assert.ok(rulesText.includes('match /{document=**} {\n      allow read, write: if false;'), 'Default deny all unknown paths must remain in place');
  });

  // 7. Admin Session Persistence & Player Registration Isolation in App.tsx & AdminPage.tsx
  check('App.tsx persists Admin Panel session cleanly and AdminPage surfaces persistence/storage errors without loops', () => {
    assert.ok(appTsx.includes("quizkart_admin_authenticated") && appTsx.includes("sessionStorage.getItem('quizkart_admin_authenticated') === 'true'"));
    assert.ok(appTsx.includes('isAdminAuthSession'), 'subscribeToAuth must skip player profile overwrite during active Admin Google session');
    assert.ok(adminPageTsx.includes("useState<") && adminPageTsx.includes("'checking'"), 'AdminPage must initialize in checking state while Auth hydrates');
    assert.ok(adminPageTsx.includes("isUsersCloudAuthRequired && adminCloudAuthStatus !== 'checking'"), 'Banner must not flash before Auth hydration');
    assert.ok(adminPageTsx.includes('Admin Sign-In Error'), 'AdminPage must surface Admin Sign-In Error heading');
    assert.ok(adminPageTsx.includes('Switch to Admin Account'), 'AdminPage must offer account switch when wrong Gmail is signed in');
  });

  // 8. Live Firebase Client SDK Checks against Database
  await checkAsync('waitForFirebaseAuthReady initializes persistence cleanly and unauthenticated session rejects /users list with permission-denied', async () => {
    const user = await waitForFirebaseAuthReady();
    const persistence = getAuthPersistenceStatus();
    assert.notStrictEqual(persistence.mode, 'failed', `Unexpected persistence failure: ${persistence.error}`);
    assert.strictEqual(user, auth.currentUser);
    const verifyRes = await verifyAdminSessionAndLoadUsers();
    assert.strictEqual(verifyRes.status, 'unauthenticated', `Expected unauthenticated status in headless CLI, got ${verifyRes.status}`);

    const listRes = await fetchAllUsersWithStatusFromFirestore();
    assert.strictEqual(listRes.errorCode, 'permission-denied', `Expected permission-denied for anonymous /users list, got ${listRes.errorCode}`);
    assert.deepStrictEqual(listRes.users, []);
  });

  await checkAsync('subscribeToAllUsersFromFirestore waits for Auth readiness & guards unauthenticated attaches cleanly', async () => {
    let receivedErrorCode = '';
    await new Promise<void>((resolve) => {
      const unsub = subscribeToAllUsersFromFirestore(
        () => {},
        (err) => {
          receivedErrorCode = err.code;
          unsub();
          resolve();
        }
      );
      setTimeout(() => {
        unsub();
        resolve();
      }, 2500);
    });
    assert.strictEqual(receivedErrorCode, 'permission-denied');
  });

  await checkAsync('Non-PII Firestore reads (settings/user_counter) remain functional alongside hardened /users rules', async () => {
    const snap = await getDoc(doc(db, 'settings', 'user_counter'));
    assert.strictEqual(typeof snap.exists(), 'boolean', 'settings/user_counter read succeeded cleanly without rule blockage');
  });

  // 9. Task 1 — Refined Admin Sign-In Error Card & Preserved Error Classification
  check('Task 1: Admin Sign-In Error card uses concise heading/description while keeping storage quota & error handling separate', () => {
    const bannerStart = adminPageTsx.indexOf('id="admin-users-cloud-auth-banner"');
    const bannerEnd = adminPageTsx.indexOf('{!isUsersCloudAuthRequired && adminCloudAuthStatus', bannerStart);
    assert.ok(bannerStart > -1 && bannerEnd > bannerStart, 'Could not locate admin-users-cloud-auth-banner block');
    const bannerBlock = adminPageTsx.slice(bannerStart, bannerEnd);

    assert.ok(bannerBlock.includes("'Admin Verification Required'"), 'Missing Admin Verification Required heading');
    assert.ok(bannerBlock.includes("'Admin Sign-In Error'"), 'Missing updated Admin Sign-In Error heading');
    assert.ok(!bannerBlock.includes('Admin Authentication / Storage Error'), 'Old verbose error heading should be replaced');
    assert.ok(
      bannerBlock.includes('Unable to connect to Google Sign-In. Please check your connection and try again.'),
      'Missing concise network error description'
    );
    assert.ok(
      firebaseTs.includes("if (errorCode === 'auth/network-request-failed') {\n    return 'Unable to connect to Google Sign-In. Please check your connection and try again.';"),
      'firebase.ts must map auth/network-request-failed to concise message without misclassifying storage errors'
    );
    assert.ok(
      firebaseTs.includes('Browser storage quota prevented saving the Auth session'),
      'Storage quota error handling must remain intact and distinct from network errors'
    );
    assert.ok(bannerBlock.includes("'Authorize Google Sync'"), 'Missing Authorize Google Sync button label');
    assert.ok(bannerBlock.includes('<ShieldCheck className="w-4 h-4" />'), 'ShieldCheck icon in left card badge must be preserved');
    assert.ok(bannerBlock.includes('<Loader2 className="w-3.5 h-3.5 animate-spin" />'), 'Loading spinner must be preserved');
    assert.ok(!bannerBlock.includes('<Lock '), 'Lock icon before button text must be removed');
  });

  // 10. Task 2 — Confirmed Demo/Test User Filtering (Zero Deletion, Photo-less Genuine Users Preserved)
  check('Task 2: Confirmed seeded Demo/Test users are excluded from display while genuine users (with or without photos) remain visible', () => {
    const mixedDocs = [
      // Confirmed seeded test_batch2 / test_batch3 / demo records
      {
        docId: 'test_uid_user_alpha_1760000000000',
        data: {
          uid: 'test_uid_user_alpha_1760000000000',
          name: 'Alpha Contestant',
          email: 'alpha@quizkart.in',
          customUserId: 'QK-USR-9001',
          walletBalance: 500
        }
      },
      {
        docId: 'test_uid_user_beta_1760000000000',
        data: {
          uid: 'test_uid_user_beta_1760000000000',
          name: 'Beta Contestant',
          email: 'beta@quizkart.in',
          customUserId: 'QK-USR-9002',
          walletBalance: 50
        }
      },
      {
        docId: 'uid_multientry_player_1760000000000',
        data: {
          uid: 'uid_multientry_player_1760000000000',
          name: 'Multi Entry Master',
          customUserId: 'QK-USR-MULTI',
          walletBalance: 1000
        }
      },
      {
        docId: 'uid_competitor_1760000000000',
        data: {
          uid: 'uid_competitor_1760000000000',
          name: 'Single Entry Challenger',
          customUserId: 'QK-USR-COMPETITOR',
          walletBalance: 500
        }
      },
      {
        docId: 'demo-bot-123',
        data: {
          uid: 'demo-bot-123',
          name: 'Demo Player',
          email: 'demo@quizkart.in',
          isRegistered: true
        }
      },
      {
        docId: 'flagged_demo',
        data: {
          uid: 'uid_flagged_demo',
          name: 'Seeded Account',
          email: 'seeded@example.com',
          isRegistered: true,
          isDemo: true
        } as any
      },
      // Genuine registered user WITH profile photo
      {
        docId: 'real_uid_1001',
        data: {
          uid: 'real_uid_1001',
          name: 'Aarav Sharma',
          email: 'aarav.sharma@gmail.com',
          mobile: '9876543210',
          customUserId: 'QK-USR-1001',
          userNumber: 1001,
          avatarUrl: 'https://example.com/aarav.jpg',
          walletBalance: 280,
          isRegistered: true,
          createdAt: '2026-11-01T10:00:00.000Z'
        }
      },
      // Genuine registered user WITHOUT profile photo (MUST NEVER be treated as fake!)
      {
        docId: 'real_uid_1002',
        data: {
          uid: 'real_uid_1002',
          name: 'Meera Nair',
          email: 'meera.nair@gmail.com',
          mobile: '9811122233',
          customUserId: 'QK-USR-1002',
          userNumber: 1002,
          avatarUrl: '',
          walletBalance: 150,
          isRegistered: true,
          createdAt: '2026-11-02T10:00:00.000Z'
        }
      },
      // Unconfirmed record with real registration fields (preserved for manual review rather than blindly dropped)
      {
        docId: 'unclear_uid_9005',
        data: {
          uid: 'unclear_uid_9005',
          name: 'Test',
          email: 'manual.review.user@gmail.com',
          customUserId: 'QK-USR-9005',
          userNumber: 9005,
          isRegistered: true,
          createdAt: '2026-11-03T10:00:00.000Z'
        }
      }
    ];

    const filtered = normalizeAndDeduplicateFirestoreUsers(mixedDocs);
    const ids = filtered.map((u) => u.customUserId || u.id);

    assert.strictEqual(ids.includes('QK-USR-9001'), false, 'Alpha Contestant / QK-USR-9001 must be excluded');
    assert.strictEqual(ids.includes('QK-USR-9002'), false, 'Beta Contestant / QK-USR-9002 must be excluded');
    assert.strictEqual(ids.includes('QK-USR-MULTI'), false, 'Multi Entry Master must be excluded');
    assert.strictEqual(ids.includes('QK-USR-COMPETITOR'), false, 'Single Entry Challenger must be excluded');
    assert.strictEqual(filtered.some((u) => u.email === 'demo@quizkart.in'), false, 'demo-bot-123 must be excluded');
    assert.strictEqual(filtered.some((u) => u.email === 'seeded@example.com'), false, 'isDemo: true must be excluded');

    assert.strictEqual(ids.includes('QK-USR-1001'), true, 'Genuine user with photo must be preserved');
    assert.strictEqual(ids.includes('QK-USR-1002'), true, 'Genuine user WITHOUT photo must be preserved');
    assert.strictEqual(
      filtered.find((u) => u.customUserId === 'QK-USR-1002')?.walletBalance,
      150,
      'Photo-less genuine user balance and metadata must stay intact'
    );
    assert.strictEqual(ids.includes('QK-USR-9005'), true, 'Other QK-USR records must remain preserved');
    assert.strictEqual(isDemoSeedUser({ email: 'player@quizkart.in', isRegistered: true }), true);
    assert.strictEqual(isDemoSeedUser({ name: 'Meera Nair', email: 'meera.nair@gmail.com', avatarUrl: '', isRegistered: true }), false);

    // Explicitly verify ONLY QK-USR-9009 (Test) and QK-USR-9012 (U) are caught by isConfirmedFakeDisplayUser
    assert.strictEqual(isConfirmedFakeDisplayUser({ name: 'Test', customUserId: 'QK-USR-9009' }), true);
    assert.strictEqual(isConfirmedFakeDisplayUser({ name: 'U', customUserId: 'QK-USR-9012' }), true);
    for (const genuine of [
      { name: 'Abilas', email: 'abilas73577@gmail.com', customUserId: 'QK-USR-1013', isRegistered: true, avatarUrl: '' },
      { name: 'Shakti Singh', email: 'shakti@gmail.com', customUserId: 'QK-USR-1001', isRegistered: true, mobile: '' },
      { name: 'Anjukanwar', email: 'anjukanwar@gmail.com', customUserId: 'QK-USR-1002', isRegistered: true, avatarUrl: '' },
      { name: 'Apponly', email: 'apponly@gmail.com', customUserId: 'QK-USR-1003', isRegistered: false },
      { name: 'Chinusingh', email: 'chinusingh@gmail.com', customUserId: 'QK-USR-1004', isRegistered: true },
      { name: 'Nmlcompany', email: 'nmlcompany720@gmail.com', customUserId: 'QK-USR-1005', isRegistered: true },
      { name: 'Rahul', email: 'rahul@gmail.com', customUserId: 'QK-USR-1006', isRegistered: true, avatarUrl: '', mobile: '' }
    ]) {
      assert.strictEqual(isConfirmedFakeDisplayUser(genuine), false, `${genuine.name} must NOT be marked fake`);
      assert.strictEqual(isDemoSeedUser(genuine), false, `${genuine.name} must NOT be excluded by isDemoSeedUser`);
    }
    assert.strictEqual(isDemoSeedUser({ name: '', email: '', mobile: '', isRegistered: false }), false, 'Incomplete profile fields must NOT hide a user');
  });

  // 11. Task 3 — Green Active Badge Removed, Theme-Colored ACTIVE Badge Preserved
  check('Task 3: Green Active badge removed from Registered Users rows while theme-colored ACTIVE badge is preserved', () => {
    const tableStart = adminPageTsx.indexOf('paginatedRealUsers.map');
    const tableEnd = adminPageTsx.indexOf('Mobile Number (Real Firestore Data Only)', tableStart);
    assert.ok(tableStart > -1 && tableEnd > tableStart, 'Could not locate Registered Users name cell');
    const nameCell = adminPageTsx.slice(tableStart, tableEnd);

    assert.ok(
      nameCell.includes('isActiveCurrentUser && !u.isBlocked') &&
      nameCell.includes("background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)'") &&
      nameCell.includes('ACTIVE'),
      'Theme-colored gradient ACTIVE badge must remain preserved'
    );
    assert.ok(
      !nameCell.includes('bg-emerald-50 text-emerald-700 border border-emerald-200') &&
      !nameCell.includes('!isActiveCurrentUser && !u.isBlocked'),
      'Green Active badge must be removed from Registered Users rows'
    );
    assert.ok(nameCell.includes('u.isBlocked') && nameCell.includes('BLOCKED'), 'BLOCKED badge must remain intact');
    assert.ok(adminPageTsx.includes('isUserSessionActive(u)'), 'Active/Inactive session logic must remain unchanged');
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
