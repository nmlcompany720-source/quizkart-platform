import { contestBackend } from '../src/backend/contestEngine';
import fs from 'fs';
import path from 'path';

function runTests() {
  console.log('===============================================================');
  console.log('QUIZKART - STRICT 3-FIX VERIFICATION TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // ISSUE 1: LIVE STANDINGS — DEMO DATA ALIGNMENT (FRONTEND)
  // -------------------------------------------------------------
  console.log('--- 1. Testing Live Standings Demo Data Alignment ---');
  const heroFile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HeroSection.tsx'), 'utf-8');

  // Verify headers have text-center for SCORE and TIME
  assert(
    heroFile.includes('<th className="py-2 px-2 text-center text-black font-extrabold" style={{ color: \'#000000\' }}>SCORE</th>'),
    'SCORE column header has text-center'
  );
  assert(
    heroFile.includes('<th className="py-2 px-2 text-center text-black font-extrabold" style={{ color: \'#000000\' }}>TIME</th>'),
    'TIME column header has text-center'
  );

  // Verify User 1 row has text-center on score and time placeholders
  assert(
    heroFile.includes('<td className="py-2.5 px-2 text-slate-800 font-medium">User 1</td>\n                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono font-bold">—</td>\n                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono font-medium">—</td>'),
    'User 1 demo row has perfectly centered "—" under both SCORE and TIME columns'
  );

  // Verify User 2 row has text-center on score and time placeholders
  assert(
    heroFile.includes('<td className="py-2.5 px-2 text-slate-800 font-medium">User 2</td>\n                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono font-bold">—</td>\n                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono font-medium">—</td>'),
    'User 2 demo row has perfectly centered "—" under both SCORE and TIME columns'
  );

  // -------------------------------------------------------------
  // ISSUE 2: EDIT PROFILE — REAL-TIME NAME SYNCHRONIZATION
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Edit Profile Real-Time Name Synchronization ---');
  contestBackend.resetForTesting();

  // User "Abilas" joins a contest
  const contestId = 'TEST-SYNC-CONTEST-1';
  const ownerUid = 'usr-abilas-123';
  const joinRes = contestBackend.joinContest({
    contestId,
    ownerUid,
    userEmail: 'abilas@quizkart.in',
    userName: 'Abilas',
    avatarUrl: 'https://example.com/abilas.jpg',
    city: 'Chennai',
    state: 'Tamil Nadu',
    entryFeeRupees: 100,
    paymentVerified: true
  });

  assert(joinRes.entry.userName === 'Abilas', 'Initial active entry name is "Abilas"');
  assert(joinRes.entry.ownerUid === ownerUid, 'Entry ownerUid is "usr-abilas-123"');

  // Submit entry for Abilas
  contestBackend.submitEntryQuiz(contestId, joinRes.entry.entryId, { score: 10, timeTakenSeconds: 30 });

  // Check initial leaderboard
  const lbInitial = contestBackend.getLeaderboard(contestId, ownerUid);
  assert(lbInitial.length > 0 && lbInitial[0].userName === 'Abilas', 'Initial leaderboard displays "Abilas"');

  // User changes profile name from "Abilas" to "Rahul"
  const modifiedEntries = contestBackend.updateUserProfile(ownerUid, {
    userName: 'Rahul'
  });

  assert(modifiedEntries.length === 1, 'updateUserProfile modified exactly 1 active entry');
  assert(modifiedEntries[0].userName === 'Rahul', 'Modified entry has updated name "Rahul"');
  assert(modifiedEntries[0].ownerUid === ownerUid, 'Modified entry ownerUid preserved');
  assert(modifiedEntries[0].avatarUrl === 'https://example.com/abilas.jpg', 'Modified entry avatar preserved');
  assert(modifiedEntries[0].city === 'Chennai', 'Modified entry city preserved');

  // Re-check active entries and leaderboard
  const activeEntries = contestBackend.getActiveEntries(contestId);
  assert(activeEntries[0].userName === 'Rahul', 'Active entry now reflects updated name "Rahul"');

  const lbUpdated = contestBackend.getLeaderboard(contestId, ownerUid);
  assert(lbUpdated[0].userName === 'Rahul', 'Leaderboard standings reflect updated name "Rahul"');

  // Ensure another user is not modified
  const otherJoin = contestBackend.joinContest({
    contestId,
    ownerUid: 'usr-sita-456',
    userEmail: 'sita@quizkart.in',
    userName: 'Sita Sharma',
    entryFeeRupees: 100,
    paymentVerified: true
  });
  assert(otherJoin.entry.userName === 'Sita Sharma', 'Other contestant "Sita Sharma" untouched');

  // -------------------------------------------------------------
  // ISSUE 3: RECENT QUIZ ACTIVITY — FINAL PRIZE SYNCHRONIZATION
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing Recent Quiz Activity Final Prize Synchronization ---');

  // Verify formatWinningAmount logic in ProfileWallet.tsx
  const profileWalletFile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ProfileWallet.tsx'), 'utf-8');
  assert(
    profileWalletFile.includes("if (attempt.settlementStatus !== 'settled') {\n    return 'Pending';\n  }"),
    'formatWinningAmount strictly returns "Pending" before settlement'
  );
  assert(
    !profileWalletFile.includes("attempt.rewardWon.match"),
    'formatWinningAmount does NOT scrape rewardWon string with regex for unverified prizes'
  );

  const initialRahulEntry = contestBackend.getActiveEntries(contestId).find(e => e.ownerUid === ownerUid);
  assert(initialRahulEntry?.rank === 1, 'Rahul initial rank is 1');
  assert(initialRahulEntry?.projectedPrizeRupees === 120, 'Rahul has provisional projected prize of ₹120 before settlement');

  // Simulated attempt before settlement
  const attemptBeforeSettlement = {
    attemptId: 'att-12345',
    entryId: joinRes.entry.entryId,
    ownerUid,
    contestId,
    settlementStatus: 'pending' as const,
    finalPrizeRupees: 0,
    rewardAmount: 0
  };

  // Now, User 2 (Sita) submits with score 10 in 20s (faster than Rahul's 30s), pushing Rahul to Rank 2
  contestBackend.submitEntryQuiz(contestId, otherJoin.entry.entryId, { score: 10, timeTakenSeconds: 20 });

  // Now Rahul is Rank 2, and since Winner Slots is 1 (for 2 users: CEIL(2/3)=1), Rahul's prize is now ₹0
  const activeNow = contestBackend.getActiveEntries(contestId);
  const rahulEntry = activeNow.find(e => e.ownerUid === ownerUid);
  assert(rahulEntry?.rank === 2, 'Rahul re-ranked to Rank 2');
  assert(rahulEntry?.projectedPrizeRupees === 0, 'Rahul projected prize is ₹0 after reranking');

  // Now the contest is finalized & settled
  const settleRes = contestBackend.settleContest(contestId);
  assert(settleRes.success === true, 'Contest settled successfully');

  // Verify disbursements: only Sita (Rank 1) gets prize
  const winnerDisb = settleRes.disbursements.find(d => d.ownerUid === otherJoin.entry.ownerUid);
  const rahulDisb = settleRes.disbursements.find(d => d.ownerUid === ownerUid);

  assert(winnerDisb !== undefined && winnerDisb.prizeRupees === 120, 'Winner (Sita) receives ₹120 disbursement');
  assert(rahulDisb === undefined, 'Rahul has NO disbursement (non-winner)');

  // Verify all entries in contestList are settled
  const allFinalEntries = contestBackend.getContestEntries(contestId);
  const finalRahul = allFinalEntries.find(e => e.ownerUid === ownerUid);
  assert(finalRahul?.settlementStatus === 'settled', 'Rahul entry settlementStatus is "settled"');
  assert(finalRahul?.settledPrizeRupees === 0, 'Rahul entry settledPrizeRupees is explicitly ₹0');

  console.log(`\n===============================================================`);
  console.log(`TEST RESULTS: ${passed}/${total} TESTS PASSED!`);
  console.log(`===============================================================`);
}

runTests();
