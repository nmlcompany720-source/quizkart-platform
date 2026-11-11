/**
 * QUIZKART BATCH 3 — COMPREHENSIVE VERIFICATION SUITE
 * Ranking, Scoring, Winner Calculation, Waterfall Prize Engine & Audit Sync
 */

import { 
  evaluateQuizSubmission, 
  calculateAccuracyPercent 
} from '../server/scoringService.js';
import { 
  calculateWaterfallPrizes, 
  calculateWinnerSlots 
} from '../server/prizeEngine.js';
import { 
  sortAndRankEntries, 
  recalculateContestRankings, 
  getSanitizedLeaderboard, 
  getEntryPayoutStatus,
  EntryDataModel 
} from '../server/rankingEngine.js';
import { 
  joinContestAtomic, 
  submitEntryQuiz, 
  abandonEntryQuiz 
} from '../server/entryService.js';
import { 
  serverDb, 
  doc, 
  setDoc, 
  getDoc 
} from '../server/db.js';

console.log('================================================================');
console.log('  BATCH 3: QUIZKART RANKING, SCORING & PRIZE ENGINE TEST SUITE   ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

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
  // ==========================================================================
  // SECTION 1: MANDATED ACCURACY & SCORING FORMULAS
  // ==========================================================================
  console.log('\n--- SECTION 1: Mandated Fixed-Point Scoring & Accuracy Formulas ---');

  // Mandatory verification from Prompt 2:
  // - 8 correct, 2 wrong = 80%.
  // - 5 correct, 1 wrong = 83%.
  // - 2 correct, 1 wrong = 67%.
  // - 1 correct, 2 wrong = 33%.
  // - 0 attempted = 0%.
  assert(calculateAccuracyPercent(8, 10) === 80, '1.1', '8 correct, 2 wrong (10 attempted) = 80%');
  assert(calculateAccuracyPercent(5, 6) === 83, '1.2', '5 correct, 1 wrong (6 attempted) = 83%');
  assert(calculateAccuracyPercent(2, 3) === 67, '1.3', '2 correct, 1 wrong (3 attempted) = 67%');
  assert(calculateAccuracyPercent(1, 3) === 33, '1.4', '1 correct, 2 wrong (3 attempted) = 33%');
  assert(calculateAccuracyPercent(0, 0) === 0, '1.5', '0 attempted = 0%');

  // Test Case A: 10 correct, 0 wrong
  const evalA = evaluateQuizSubmission({
    totalQuestions: 10,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 },
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(evalA.finalCentipoints === 1000 && evalA.finalScore === 10.00 && evalA.accuracy === 100, '1.6', '10/10 correct gives 1000 centipoints, 10.00 score, 100% accuracy');

  // Test Case B: 8 correct, 2 wrong
  const evalB = evaluateQuizSubmission({
    totalQuestions: 10,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 99, 10: 99 },
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(evalB.finalCentipoints === 734 && evalB.finalScore === 7.34 && evalB.accuracy === 80, '1.7', '8 correct, 2 wrong gives 734 centipoints, 7.34 score, 80% accuracy');

  // Test Case C: 5 correct, 1 wrong, 4 unanswered
  const evalC = evaluateQuizSubmission({
    totalQuestions: 10,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 99 },
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(evalC.finalCentipoints === 467 && evalC.finalScore === 4.67 && evalC.accuracy === 83 && evalC.unansweredCount === 4, '1.8', '5 correct, 1 wrong, 4 unanswered gives 467 centipoints, 4.67 score, 83% accuracy');

  // Test Case D: 0 correct, 5 wrong (Non-negative bound verification)
  const evalD = evaluateQuizSubmission({
    totalQuestions: 10,
    answers: { 1: 99, 2: 99, 3: 99, 4: 99, 5: 99 },
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(evalD.rawCentipoints === -165 && evalD.finalCentipoints === 0 && evalD.finalScore === 0.00, '1.9', 'Negative raw centipoints (-165) bound strictly to 0 centipoints / 0.00 score');

  // ==========================================================================
  // SECTION 2: WATERFALL PRIZE ENGINE (1 THROUGH 9 ENTRIES)
  // ==========================================================================
  console.log('\n--- SECTION 2: Waterfall Prize Matrix (1 to 9 Confirmed Entries) ---');

  // 1 entry: Pool ₹60 (6000p) -> Rank 1 ₹60
  const p1 = calculateWaterfallPrizes(1, 10000);
  assert(p1.winnerSlots === 1 && p1.rankPrizesRupees[1] === 60 && p1.rankPrizesPaise[1] === 6000, '2.1', '1 entry: Winner slots = 1, Rank 1 = ₹60 (6000p)');

  // 2 entries: Pool ₹120 (12000p) -> Rank 1 ₹120
  const p2 = calculateWaterfallPrizes(2, 10000);
  assert(p2.winnerSlots === 1 && p2.rankPrizesRupees[1] === 120 && p2.rankPrizesPaise[1] === 12000, '2.2', '2 entries: Winner slots = 1, Rank 1 = ₹120 (12000p)');

  // 3 entries: Pool ₹180 (18000p) -> Rank 1 ₹180
  const p3 = calculateWaterfallPrizes(3, 10000);
  assert(p3.winnerSlots === 1 && p3.rankPrizesRupees[1] === 180 && p3.rankPrizesPaise[1] === 18000, '2.3', '3 entries: Winner slots = 1, Rank 1 = ₹180 (18000p)');

  // 4 entries: Pool ₹240 (24000p) -> Rank 1 ₹180, Rank 2 ₹60
  const p4 = calculateWaterfallPrizes(4, 10000);
  assert(p4.winnerSlots === 2 && p4.rankPrizesRupees[1] === 180 && p4.rankPrizesRupees[2] === 60, '2.4', '4 entries: Winner slots = 2, Rank 1 = ₹180, Rank 2 = ₹60');

  // 5 entries: Pool ₹300 (30000p) -> Rank 1 ₹180, Rank 2 ₹120
  const p5 = calculateWaterfallPrizes(5, 10000);
  assert(p5.winnerSlots === 2 && p5.rankPrizesRupees[1] === 180 && p5.rankPrizesRupees[2] === 120, '2.5', '5 entries: Winner slots = 2, Rank 1 = ₹180, Rank 2 = ₹120');

  // 6 entries: Pool ₹360 (36000p) -> Rank 1 ₹180, Rank 2 ₹180
  const p6 = calculateWaterfallPrizes(6, 10000);
  assert(p6.winnerSlots === 2 && p6.rankPrizesRupees[1] === 180 && p6.rankPrizesRupees[2] === 180, '2.6', '6 entries: Winner slots = 2, Rank 1 = ₹180, Rank 2 = ₹180');

  // 7 entries: Pool ₹420 (42000p) -> Rank 1 ₹180, Rank 2 ₹180, Rank 3 ₹60
  const p7 = calculateWaterfallPrizes(7, 10000);
  assert(p7.winnerSlots === 3 && p7.rankPrizesRupees[1] === 180 && p7.rankPrizesRupees[2] === 180 && p7.rankPrizesRupees[3] === 60, '2.7', '7 entries: Winner slots = 3, Rank 1 = ₹180, Rank 2 = ₹180, Rank 3 = ₹60');

  // 8 entries: Pool ₹480 (48000p) -> Rank 1 ₹180, Rank 2 ₹180, Rank 3 ₹120
  const p8 = calculateWaterfallPrizes(8, 10000);
  assert(p8.winnerSlots === 3 && p8.rankPrizesRupees[1] === 180 && p8.rankPrizesRupees[2] === 180 && p8.rankPrizesRupees[3] === 120, '2.8', '8 entries: Winner slots = 3, Rank 1 = ₹180, Rank 2 = ₹180, Rank 3 = ₹120');

  // 9 entries: Pool ₹540 (54000p) -> Ranks 1 to 3 ₹180 each
  const p9 = calculateWaterfallPrizes(9, 10000);
  assert(p9.winnerSlots === 3 && p9.rankPrizesRupees[1] === 180 && p9.rankPrizesRupees[2] === 180 && p9.rankPrizesRupees[3] === 180, '2.9', '9 entries: Winner slots = 3, Rank 1 = ₹180, Rank 2 = ₹180, Rank 3 = ₹180');

  // Zero leakage integrity: 60% user pool + 10% referral + 30% margin = 100% total revenue
  assert(p9.totalRevenuePaise === (p9.userPrizePoolPaise + p9.referralPoolPaise + p9.platformMarginPaise), '2.10', 'Financial split preserves exact zero-leakage equality');

  // ==========================================================================
  // SECTION 3: DETERMINISTIC OPTION A TIE-BREAKER SORTING
  // ==========================================================================
  console.log('\n--- SECTION 3: Deterministic Option A Tie-Breaker Ordering ---');

  const testEntries: EntryDataModel[] = [
    {
      entryId: 'entry_unsub',
      contestId: 'contest_tb',
      ownerUid: 'uid_lazy',
      paymentId: 'pay_1',
      paymentMethod: 'WALLET',
      paymentStatus: 'CONFIRMED',
      entryStatus: 'ACTIVE',
      amountPaise: 10000,
      joinedAt: '2026-10-30T10:00:00Z',
      submissionStatus: 'NOT_STARTED',
      score: 0,
      rank: null
    },
    {
      entryId: 'entry_slow',
      contestId: 'contest_tb',
      ownerUid: 'uid_b',
      paymentId: 'pay_2',
      paymentMethod: 'WALLET',
      paymentStatus: 'CONFIRMED',
      entryStatus: 'ACTIVE',
      amountPaise: 10000,
      joinedAt: '2026-10-30T10:01:00Z',
      submissionStatus: 'SUBMITTED',
      score: 7.34,
      centipoints: 734,
      accuracy: 80,
      timeTakenMs: 140000, // slower
      submittedAt: '2026-10-30T10:10:00Z',
      submittedAtMs: 1000,
      rank: null
    },
    {
      entryId: 'entry_fast',
      contestId: 'contest_tb',
      ownerUid: 'uid_a',
      paymentId: 'pay_3',
      paymentMethod: 'WALLET',
      paymentStatus: 'CONFIRMED',
      entryStatus: 'ACTIVE',
      amountPaise: 10000,
      joinedAt: '2026-10-30T10:02:00Z',
      submissionStatus: 'SUBMITTED',
      score: 7.34,
      centipoints: 734,
      accuracy: 80,
      timeTakenMs: 95000, // faster
      submittedAt: '2026-10-30T10:10:00Z',
      submittedAtMs: 1000,
      rank: null
    },
    {
      entryId: 'entry_top',
      contestId: 'contest_tb',
      ownerUid: 'uid_champ',
      paymentId: 'pay_4',
      paymentMethod: 'WALLET',
      paymentStatus: 'CONFIRMED',
      entryStatus: 'ACTIVE',
      amountPaise: 10000,
      joinedAt: '2026-10-30T10:03:00Z',
      submissionStatus: 'SUBMITTED',
      score: 10.00,
      centipoints: 1000,
      accuracy: 100,
      timeTakenMs: 120000,
      submittedAt: '2026-10-30T10:12:00Z',
      submittedAtMs: 2000,
      rank: null
    }
  ];

  const plan4 = calculateWaterfallPrizes(4, 10000); // 2 winner slots
  const rankedResults = sortAndRankEntries(testEntries, plan4, 1);

  assert(rankedResults[0].entryId === 'entry_top' && rankedResults[0].rank === 1 && rankedResults[0].projectedPrizeRupees === 180, '3.1', 'Rank 1: Highest score (10.00) takes Rank 1 with ₹180 prize');
  assert(rankedResults[1].entryId === 'entry_fast' && rankedResults[1].rank === 2 && rankedResults[1].projectedPrizeRupees === 60, '3.2', 'Rank 2: Equal score (7.34) broken by faster time (95s vs 140s) gets Rank 2 with ₹60 prize');
  assert(rankedResults[2].entryId === 'entry_slow' && rankedResults[2].rank === 3 && rankedResults[2].projectedPrizeRupees === 0 && !rankedResults[2].isEligibleForPayout, '3.3', 'Rank 3: Slower time gets Rank 3, outside 2 winner slots, ₹0 prize, not eligible');
  assert(rankedResults[3].entryId === 'entry_unsub' && rankedResults[3].rank === null && rankedResults[3].projectedPrizeRupees === 0, '3.4', 'Unsubmitted entry gets rank null, ₹0 prize, not eligible');

  // ==========================================================================
  // SECTION 4: MULTI-ENTRY BY SINGLE FIREBASE UID IN FIRESTORE
  // ==========================================================================
  console.log('\n--- SECTION 4: Multi-Entry by Single UID & Live Backend Recalculation ---');

  const ts = Date.now();
  const contestId = `contest_b3_live_${ts}`;
  const multiUid = `uid_multientry_player_${ts}`;
  const competitorUid = `uid_competitor_${ts}`;

  // Create Users with sufficient wallet balances
  await setDoc(doc(serverDb, 'users', multiUid), {
    uid: multiUid,
    name: 'Multi Entry Master',
    customUserId: 'QK-USR-MULTI',
    walletBalance: 1000, // ₹1,000
    createdAt: new Date().toISOString()
  });

  await setDoc(doc(serverDb, 'users', competitorUid), {
    uid: competitorUid,
    name: 'Single Entry Challenger',
    customUserId: 'QK-USR-COMPETITOR',
    walletBalance: 500, // ₹500
    createdAt: new Date().toISOString()
  });

  // Create Live Contest
  await setDoc(doc(serverDb, 'contests', contestId), {
    id: contestId,
    title: 'Batch 3 Grand Tournament',
    type: 'cash',
    entryFee: 100, // ₹100
    maxParticipants: 10,
    realJoins: 0,
    totalRevenue: 0,
    totalRevenuePaise: 0,
    userPrizePoolPaise: 0,
    referralPoolPaise: 0,
    platformMarginPaise: 0,
    rankingVersion: 0,
    winnerSlots: 0,
    status: 'active',
    createdAt: new Date().toISOString()
  });

  // User 1 joins FIRST entry
  const join1 = await joinContestAtomic({
    contestId,
    ownerUid: multiUid,
    paymentMethod: 'WALLET'
  });
  assert(join1.success && join1.realJoins === 1, '4.1', 'MultiUid successfully purchases Entry 1');

  // User 1 joins SECOND entry (Same contest, same UID)
  const join2 = await joinContestAtomic({
    contestId,
    ownerUid: multiUid,
    paymentMethod: 'WALLET'
  });
  assert(join2.success && join2.realJoins === 2 && join1.entryId !== join2.entryId, '4.2', 'MultiUid successfully purchases distinct Entry 2 in same contest');

  // Competitor joins THIRD entry
  const join3 = await joinContestAtomic({
    contestId,
    ownerUid: competitorUid,
    paymentMethod: 'WALLET'
  });
  assert(join3.success && join3.realJoins === 3, '4.3', 'Competitor joins Entry 3; realJoins = 3, winnerSlots = 1');

  // Verify contest doc after 3 joins
  const contestSnap1 = await getDoc(doc(serverDb, 'contests', contestId));
  const cData1 = contestSnap1.data()!;
  assert(cData1.realJoins === 3 && cData1.winnerSlots === 1 && cData1.userPrizePoolPaise === 18000, '4.4', 'Contest auto-recalculated after 3 joins: winnerSlots = 1, prize pool = ₹180');

  // Submit Entry 1 (MultiUid) with 10 correct answers in 100s
  const sub1 = await submitEntryQuiz({
    contestId,
    entryId: join1.entryId,
    ownerUid: multiUid,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 },
    timeTakenMs: 100000,
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(sub1.success && sub1.score === 10.00 && sub1.rank === 1 && sub1.projectedPrizeRupees === 180, '4.5', 'Entry 1 submitted: Score 10.00, Rank 1, Projected Prize ₹180');

  // Submit Entry 3 (Competitor) with 8 correct answers in 120s
  const sub3 = await submitEntryQuiz({
    contestId,
    entryId: join3.entryId,
    ownerUid: competitorUid,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 99, 10: 99 },
    timeTakenMs: 120000,
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(sub3.success && sub3.score === 7.34 && sub3.rank === 2 && sub3.projectedPrizeRupees === 0, '4.6', 'Entry 3 submitted: Score 7.34, Rank 2, outside 1 winner slot (₹0 prize)');

  // Competitor joins a 4th entry in contest -> Expands winner slots to Math.ceil(4/3) = 2!
  const join4 = await joinContestAtomic({
    contestId,
    ownerUid: competitorUid,
    paymentMethod: 'WALLET'
  });
  assert(join4.success && join4.realJoins === 4, '4.7', 'Entry 4 joined; Pool expands to ₹240, winner slots expand to 2');

  // Check Entry 3 payout status now that winner slots expanded to 2
  const payout3 = await getEntryPayoutStatus(contestId, join3.entryId);
  assert(payout3.rank === 2 && payout3.projectedPrizeRupees === 60 && payout3.isEligibleForPayout === true, '4.8', 'Dynamic sync: Entry 3 now gets Rank 2 with ₹60 prize as winner slots expanded to 2');

  // Submit Entry 2 (MultiUid second entry) with 9 correct answers in 90s
  const sub2 = await submitEntryQuiz({
    contestId,
    entryId: join2.entryId,
    ownerUid: multiUid,
    answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 99 },
    timeTakenMs: 90000,
    answerKey: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 }
  });
  assert(sub2.success && sub2.score === 8.67, '4.9', 'Entry 2 submitted: Score 8.67');

  // Now inspect both entries owned by multiUid:
  const payoutEntry1 = await getEntryPayoutStatus(contestId, join1.entryId);
  const payoutEntry2 = await getEntryPayoutStatus(contestId, join2.entryId);

  assert(
    payoutEntry1.rank === 1 && payoutEntry1.projectedPrizeRupees === 180 &&
    payoutEntry2.rank === 2 && payoutEntry2.projectedPrizeRupees === 60,
    '4.10',
    'Multi-Entry Triumph: Same UID successfully occupies Rank 1 (₹180) and Rank 2 (₹60) simultaneously!'
  );

  // ==========================================================================
  // SECTION 5: AUDIT HISTORY & SANITIZED PUBLIC LEADERBOARD
  // ==========================================================================
  console.log('\n--- SECTION 5: Audit History & Sanitized Public Contracts ---');

  // Verify Audit History document in /contests/{contestId}/rankings_history/v_{latestVersion}
  const latestContestSnap = await getDoc(doc(serverDb, 'contests', contestId));
  const latestVersion = latestContestSnap.data()?.rankingVersion;
  const historySnap = await getDoc(doc(serverDb, 'contests', contestId, 'rankings_history', `v_${latestVersion}`));
  assert(historySnap.exists(), '5.1', `Audit history document /rankings_history/v_${latestVersion} exists`);
  const historyData = historySnap.data()!;
  assert(historyData.contestId === contestId && historyData.entriesSnapshot.length > 0, '5.2', 'Audit history contains full snapshot of entries and financial metrics');

  // Verify Sanitized Public Leaderboard
  const publicLeaderboard = await getSanitizedLeaderboard(contestId);
  assert(publicLeaderboard.length >= 3, '5.3', 'Public leaderboard returns all submitted entries sorted by rank');
  assert(publicLeaderboard[0].rank === 1 && publicLeaderboard[1].rank === 2 && publicLeaderboard[2].rank === 3, '5.4', 'Leaderboard strictly sorted 1, 2, 3 with no ties');

  // Verify privacy: No payment IDs or emails leaked in public leaderboard
  const hasLeakedPaymentId = publicLeaderboard.some((item: any) => item.paymentId || item.ownerUid || item.email);
  assert(!hasLeakedPaymentId, '5.5', 'Privacy Guard: Zero payment IDs, UIDs, or emails exposed in public leaderboard');

  // Prevent double submission
  let doubleSubmitBlocked = false;
  try {
    await submitEntryQuiz({
      contestId,
      entryId: join1.entryId,
      ownerUid: multiUid,
      answers: {},
      timeTakenMs: 1000
    });
  } catch (err: any) {
    doubleSubmitBlocked = err.message.startsWith('ALREADY_SUBMITTED');
  }
  assert(doubleSubmitBlocked, '5.6', 'Security Guard: Duplicate submission of an already submitted entry is rejected');

  console.log('\n================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED  `);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runAllTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
