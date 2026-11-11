import { 
  joinContestAtomic, 
  calculateFinancialSplit, 
  getContestRealJoins, 
  getContestEntries,
  parseTimestampMs 
} from '../server/entryService.js';
import { serverDb, doc, setDoc, getDoc } from '../server/db.js';

console.log('================================================================');
console.log('  BATCH 2: QUIZKART ENTRY & PAYMENT BACKEND VERIFICATION SUITE  ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, scenario: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] Scenario ${scenario}${details ? ': ' + details : ''}`);
  } else {
    console.error(`  ✗ [FAIL] Scenario ${scenario}${details ? ': ' + details : ''}`);
    process.exitCode = 1;
  }
}

async function runAllTests() {
  const timestamp = Date.now();
  const testContestId = `test_contest_b2_${timestamp}`;
  const testOwnerUid1 = `test_uid_user_alpha_${timestamp}`;
  const testOwnerUid2 = `test_uid_user_beta_${timestamp}`;

  console.log(`Setting up test environment in Firestore...`);
  console.log(`Contest ID: ${testContestId}`);
  console.log(`User Alpha UID: ${testOwnerUid1}`);
  console.log(`User Beta UID: ${testOwnerUid2}\n`);

  // Setup Test User 1 with ₹500 wallet balance
  await setDoc(doc(serverDb, 'users', testOwnerUid1), {
    uid: testOwnerUid1,
    name: 'Alpha Contestant',
    email: 'alpha@quizkart.in',
    customUserId: 'QK-USR-9001',
    walletBalance: 500, // ₹500
    quizzesPlayed: 0,
    isBlocked: false,
    createdAt: new Date().toISOString()
  });

  // Setup Test User 2 with ₹50 wallet balance (insufficient for ₹100 entry)
  await setDoc(doc(serverDb, 'users', testOwnerUid2), {
    uid: testOwnerUid2,
    name: 'Beta Contestant',
    email: 'beta@quizkart.in',
    customUserId: 'QK-USR-9002',
    walletBalance: 50, // ₹50 (insufficient)
    quizzesPlayed: 0,
    isBlocked: false,
    createdAt: new Date().toISOString()
  });

  // Setup Test Contest (Active, entryFee ₹100, maxParticipants 5)
  await setDoc(doc(serverDb, 'contests', testContestId), {
    id: testContestId,
    title: 'Batch 2 Test Championship',
    type: 'cash',
    entryFee: 100, // ₹100
    maxParticipants: 5,
    realJoins: 0,
    totalRevenue: 0,
    totalRevenuePaise: 0,
    userPrizePoolPaise: 0,
    referralPoolPaise: 0,
    platformMarginPaise: 0,
    status: 'active',
    createdAt: new Date().toISOString()
  });

  // --------------------------------------------------------------------------
  // SCENARIO 5: FINANCIAL DISTRIBUTION FORMULA VERIFICATION
  // --------------------------------------------------------------------------
  const split100 = calculateFinancialSplit(10000); // ₹100 in paise
  assert(
    split100.userPrizePoolPaise === 6000 &&
    split100.referralPoolPaise === 1000 &&
    split100.platformMarginPaise === 3000 &&
    (split100.userPrizePoolPaise + split100.referralPoolPaise + split100.platformMarginPaise) === 10000,
    '5',
    'Financial Distribution: ₹100 splits into 60% prize pool (6000p), 10% referral (1000p), 30% margin (3000p) with 0 penny leakage'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 1: FIRST JOIN CREATES UNIQUE ENTRY ID LINKED TO OWNER UID
  // --------------------------------------------------------------------------
  const join1 = await joinContestAtomic({
    contestId: testContestId,
    ownerUid: testOwnerUid1,
    customUserId: 'QK-USR-9001',
    paymentMethod: 'WALLET'
  });

  assert(
    join1.success === true &&
    typeof join1.entryId === 'string' &&
    join1.entryId.startsWith(`ENTRY_${testContestId}`) &&
    join1.ownerUid === testOwnerUid1 &&
    join1.realJoins === 1,
    '1',
    `First join created entryId ${join1.entryId} permanently linked to ownerUid`
  );

  // Verify entry doc exists in Firestore
  const entryDoc1 = await getDoc(doc(serverDb, 'contests', testContestId, 'entries', join1.entryId));
  assert(
    entryDoc1.exists() && 
    entryDoc1.data()?.ownerUid === testOwnerUid1 &&
    entryDoc1.data()?.amountPaise === 10000 &&
    entryDoc1.data()?.paymentStatus === 'CONFIRMED' &&
    entryDoc1.data()?.submissionStatus === 'NOT_STARTED',
    '1 (Storage)',
    'Entry stored independently with entryId, contestId, ownerUid, paymentStatus, submissionStatus, score, rank'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 2: MULTIPLE ENTRIES BY THE SAME FIREBASE UID (RE-JOIN)
  // --------------------------------------------------------------------------
  const join2 = await joinContestAtomic({
    contestId: testContestId,
    ownerUid: testOwnerUid1, // SAME UID joins again!
    customUserId: 'QK-USR-9001',
    paymentMethod: 'WALLET'
  });

  assert(
    join2.success === true &&
    join2.entryId !== join1.entryId &&
    join2.ownerUid === testOwnerUid1,
    '2',
    `Same UID purchased 2nd entry (rejoin) with distinct entryId: ${join2.entryId}`
  );

  // --------------------------------------------------------------------------
  // SCENARIO 3: NEVER OVERWRITE AN EXISTING ENTRY ON REJOIN
  // --------------------------------------------------------------------------
  const entryDoc1Again = await getDoc(doc(serverDb, 'contests', testContestId, 'entries', join1.entryId));
  const entryDoc2 = await getDoc(doc(serverDb, 'contests', testContestId, 'entries', join2.entryId));
  assert(
    entryDoc1Again.exists() && entryDoc2.exists() && entryDoc1Again.id !== entryDoc2.id,
    '3',
    'Both entry documents co-exist independently in Firestore without overwriting'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 4: REAL JOINS COUNTER ACCURATELY INCREMENTS FOR EVERY ENTRY
  // --------------------------------------------------------------------------
  assert(
    join2.realJoins === 2,
    '4',
    `Real Joins counter is exactly 2 after 2 entries by same UID`
  );

  // --------------------------------------------------------------------------
  // SCENARIO 10: WALLET BALANCE DEDUCTED ATOMICALLY; REJECTS INSUFFICIENT FUNDS
  // --------------------------------------------------------------------------
  // Alpha started with 500, paid 100 + 100 = 200, balance must be 300
  const user1Doc = await getDoc(doc(serverDb, 'users', testOwnerUid1));
  assert(
    user1Doc.data()?.walletBalance === 300,
    '10 (Deduction)',
    `User wallet balance deducted from ₹500 to ₹${user1Doc.data()?.walletBalance}`
  );

  // Beta has ₹50 balance and tries to join ₹100 contest
  let insufficientCaught = false;
  try {
    await joinContestAtomic({
      contestId: testContestId,
      ownerUid: testOwnerUid2,
      customUserId: 'QK-USR-9002',
      paymentMethod: 'WALLET'
    });
  } catch (err: any) {
    if (err.message.includes('INSUFFICIENT_WALLET_BALANCE')) {
      insufficientCaught = true;
    }
  }
  assert(insufficientCaught, '10 (Insufficient)', 'Rejected join when wallet balance (₹50) was lower than entry fee (₹100)');

  // --------------------------------------------------------------------------
  // SCENARIO 11: IDEMPOTENCY AGAINST DUPLICATE PAYMENT CALLBACKS
  // --------------------------------------------------------------------------
  process.env.ALLOW_TEST_GATEWAY_WEBHOOK = 'true';
  const duplicatePaymentId = `PAY_GATEWAY_TEST_${timestamp}_DUP`;

  // First payment callback
  const gateJoin1 = await joinContestAtomic({
    contestId: testContestId,
    ownerUid: testOwnerUid1,
    paymentMethod: 'GATEWAY',
    paymentDetails: {
      paymentId: duplicatePaymentId,
      gateway: 'RAZORPAY',
      gatewayTxnId: duplicatePaymentId
    }
  });
  assert(gateJoin1.success === true, '11 (First Callback)', 'Gateway payment processed successfully on first attempt');

  // Attempt duplicate callback with the same paymentId
  let duplicateCaught = false;
  try {
    await joinContestAtomic({
      contestId: testContestId,
      ownerUid: testOwnerUid1,
      paymentMethod: 'GATEWAY',
      paymentDetails: {
        paymentId: duplicatePaymentId,
        gateway: 'RAZORPAY',
        gatewayTxnId: duplicatePaymentId
      }
    });
  } catch (err: any) {
    if (err.message.includes('DUPLICATE_PAYMENT_CALLBACK')) {
      duplicateCaught = true;
    }
  }
  assert(duplicateCaught, '11 (Replay Attack)', 'Rejected duplicate payment callback with DUPLICATE_PAYMENT_CALLBACK');

  // --------------------------------------------------------------------------
  // SCENARIO 12: GATEWAY VERIFICATION REJECTS MISSING/INVALID CONFIG
  // --------------------------------------------------------------------------
  delete process.env.ALLOW_TEST_GATEWAY_WEBHOOK;
  delete process.env.PAYMENT_GATEWAY_SECRET;
  let missingConfigCaught = false;
  try {
    await joinContestAtomic({
      contestId: testContestId,
      ownerUid: testOwnerUid1,
      paymentMethod: 'GATEWAY',
      paymentDetails: {
        paymentId: `PAY_UNVERIFIED_${timestamp}`,
        gateway: 'RAZORPAY'
      }
    });
  } catch (err: any) {
    if (err.message.includes('GATEWAY_CONFIGURATION_MISSING')) {
      missingConfigCaught = true;
    }
  }
  assert(missingConfigCaught, '12', 'Cleanly rejected unverified gateway payment when server secrets/webhook not configured');
  process.env.ALLOW_TEST_GATEWAY_WEBHOOK = 'true';

  // --------------------------------------------------------------------------
  // SCENARIO 9: LIVE CONTEST JOINING ALLOWED POST-START IF ACTIVE & DEADLINE OK
  // --------------------------------------------------------------------------
  // Currently contest has 3 joins, maxParticipants is 5. 4th join should succeed.
  const join4 = await joinContestAtomic({
    contestId: testContestId,
    ownerUid: testOwnerUid1,
    paymentMethod: 'WALLET'
  });
  assert(join4.success === true && join4.realJoins === 4, '9', 'Live contest joining successfully accepted post-start');

  // --------------------------------------------------------------------------
  // SCENARIO 6: REJECTION WHEN CONTEST REACHES MAXIMUM CAPACITY (CONTEST_FULL)
  // --------------------------------------------------------------------------
  // 5th join reaches capacity (5/5)
  const join5 = await joinContestAtomic({
    contestId: testContestId,
    ownerUid: testOwnerUid1,
    paymentMethod: 'WALLET'
  });
  assert(join5.isNowFull === true && join5.realJoins === 5, '6 (Capacity Reached)', 'Contest reached 5/5 max participants and set isNowFull=true');

  // 6th join must be rejected with CONTEST_FULL
  let fullCaught = false;
  try {
    await joinContestAtomic({
      contestId: testContestId,
      ownerUid: testOwnerUid1,
      paymentMethod: 'WALLET'
    });
  } catch (err: any) {
    if (err.message.includes('CONTEST_FULL')) {
      fullCaught = true;
    }
  }
  assert(fullCaught, '6 (Capacity Enforcement)', 'Rejected 6th join attempt on full contest with CONTEST_FULL');

  // --------------------------------------------------------------------------
  // SCENARIO 7: REJECTION WHEN CONTEST IS COMPLETED OR CANCELLED
  // --------------------------------------------------------------------------
  const completedContestId = `test_contest_completed_${timestamp}`;
  await setDoc(doc(serverDb, 'contests', completedContestId), {
    id: completedContestId,
    title: 'Completed Tournament',
    status: 'completed',
    entryFee: 100,
    maxParticipants: 50,
    realJoins: 10
  });

  let completedCaught = false;
  try {
    await joinContestAtomic({
      contestId: completedContestId,
      ownerUid: testOwnerUid1,
      paymentMethod: 'WALLET'
    });
  } catch (err: any) {
    if (err.message.includes('CONTEST_INACTIVE')) {
      completedCaught = true;
    }
  }
  assert(completedCaught, '7', 'Rejected join attempt on completed contest with CONTEST_INACTIVE');

  // --------------------------------------------------------------------------
  // SCENARIO 8: REJECTION WHEN JOINING DEADLINE HAS PASSED
  // --------------------------------------------------------------------------
  const expiredContestId = `test_contest_expired_${timestamp}`;
  await setDoc(doc(serverDb, 'contests', expiredContestId), {
    id: expiredContestId,
    title: 'Expired Tournament',
    status: 'active',
    entryFee: 100,
    maxParticipants: 50,
    realJoins: 2,
    endTime: new Date(Date.now() - 60000).toISOString() // 1 minute in the past
  });

  let expiredCaught = false;
  try {
    await joinContestAtomic({
      contestId: expiredContestId,
      ownerUid: testOwnerUid1,
      paymentMethod: 'WALLET'
    });
  } catch (err: any) {
    if (err.message.includes('CONTEST_EXPIRED')) {
      expiredCaught = true;
    }
  }
  assert(expiredCaught, '8', 'Rejected join attempt when contest end time passed using server-authoritative time');

  // --------------------------------------------------------------------------
  // SCENARIO 13: ADMIN PANEL REAL JOINS EXACTLY EQUALS VERIFIED ENTRIES COUNT
  // --------------------------------------------------------------------------
  const contestStats = await getContestRealJoins(testContestId);
  const allEntries = await getContestEntries(testContestId);
  assert(
    contestStats.realJoins === 5 && allEntries.length === 5,
    '13',
    `Contest realJoins counter (${contestStats.realJoins}) matches exactly the count of verified entries (${allEntries.length})`
  );

  // --------------------------------------------------------------------------
  // SCENARIO 14: USER DATA PRIVACY: ENTRIES SEGREGATED BY OWNER UID (NOT EMAIL)
  // --------------------------------------------------------------------------
  const userAlphaEntries = await getContestEntries(testContestId, testOwnerUid1);
  const userBetaEntries = await getContestEntries(testContestId, testOwnerUid2);
  assert(
    userAlphaEntries.length === 5 && userBetaEntries.length === 0,
    '14',
    `User entries strictly isolated by owner Firebase UID: Alpha has 5 entries, Beta has 0`
  );

  // --------------------------------------------------------------------------
  // SCENARIO 15: SOLVENCY CHECK: ZERO PENNY LEAKAGE ACROSS COMPLETE SETTLEMENT
  // --------------------------------------------------------------------------
  const contestFinal = (await getDoc(doc(serverDb, 'contests', testContestId))).data();
  const totalRevenuePaise = Number(contestFinal?.totalRevenuePaise) || 0;
  const userPrizePoolPaise = Number(contestFinal?.userPrizePoolPaise) || 0;
  const referralPoolPaise = Number(contestFinal?.referralPoolPaise) || 0;
  const platformMarginPaise = Number(contestFinal?.platformMarginPaise) || 0;

  const totalAllocatedPaise = userPrizePoolPaise + referralPoolPaise + platformMarginPaise;
  assert(
    totalRevenuePaise === 50000 && // 5 joins × ₹100 = ₹500 = 50,000 paise
    userPrizePoolPaise === 30000 && // 60% = 30,000 paise
    referralPoolPaise === 5000 &&   // 10% = 5,000 paise
    platformMarginPaise === 15000 && // 30% = 15,000 paise
    totalAllocatedPaise === totalRevenuePaise,
    '15',
    `Financial Solvency: Total Revenue (50,000p) === Prize Pool (30,000p) + Referral (5,000p) + Platform Margin (15,000p). ZERO penny leakage!`
  );

  console.log('\n================================================================');
  console.log(`  BATCH 2 RESULTS: ${passedTests}/${totalTests} SCENARIOS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 15 VERIFICATION SCENARIOS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
