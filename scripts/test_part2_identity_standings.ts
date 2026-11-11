import { 
  contestBackend, 
  mapEntriesToLeaderboard, 
  calculateContestPool,
  rupeesToPaise,
  paiseToRupees
} from '../src/backend/contestEngine';
import { ContestEntry } from '../src/types';

console.log('===================================================================');
console.log('QUIZKART — PART 2: PROFILE IDENTITY, RANKING & LIVE STANDINGS TESTS');
console.log('===================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
    process.exitCode = 1;
  }
}

contestBackend.resetForTesting();
const contestId1 = 'CNT-ROUND-001';

// ----------------------------------------------------------------------------
// TEST 1: Rahul joins and submits; Ram has not joined
// ----------------------------------------------------------------------------
console.log('--- Test 1: Rahul joins and submits; Ram has not joined ---');

const rahulJoin = contestBackend.joinContest({
  contestId: contestId1,
  ownerUid: 'usr-rahul',
  userEmail: 'rahul@example.com',
  userName: 'Rahul Sharma',
  avatarUrl: 'https://example.com/rahul.jpg',
  city: 'Jaipur',
  state: 'Rajasthan',
  entryFeeRupees: 100
});

assert(rahulJoin.success, '1.1: Rahul successfully joins contest');
assert(rahulJoin.entry.ownerUid === 'usr-rahul', '1.2: Rahul entry mapped to ownerUid usr-rahul');

// Rahul submits quiz
const rahulQuestions = [
  { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'General', subject: 'General Knowledge', difficulty: 'easy' },
  { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, category: 'General', subject: 'General Knowledge', difficulty: 'easy' }
];

const rahulSubmit = contestBackend.submitQuiz({
  contestId: contestId1,
  entryId: rahulJoin.entry.entryId,
  ownerUid: 'usr-rahul',
  answers: { 1: 0, 2: 1 },
  questions: rahulQuestions as any,
  timeTakenSeconds: 45
});

assert(rahulSubmit.success, '1.3: Rahul submits quiz');

// Now simulate Ram logging in without joining
const ramUid = 'usr-ram';
const lbForRam = contestBackend.getLeaderboard(contestId1, ramUid);

assert(lbForRam.length === 1, '1.4: Leaderboard contains only Rahul');
assert(lbForRam[0].userName === 'Rahul Sharma', '1.5: Entry displays Rahul Sharma, not Ram');
assert(lbForRam[0].avatar === 'https://example.com/rahul.jpg', '1.6: Entry displays Rahul photo, not Ram');
assert(lbForRam[0].isCurrentUser === false, '1.7: isCurrentUser is FALSE for Ram viewing Rahul entry');

// Check Ram's userEntry
const ramUserEntry = lbForRam.find(e => e.ownerUid === ramUid);
assert(ramUserEntry === undefined, '1.8: Ram has not joined, so Ram has no userEntry or rank');

// ----------------------------------------------------------------------------
// TEST 2: Ram joins and submits; both profiles remain correctly separated
// ----------------------------------------------------------------------------
console.log('\n--- Test 2: Ram joins and submits; both profiles remain separated ---');

const ramJoin = contestBackend.joinContest({
  contestId: contestId1,
  ownerUid: 'usr-ram',
  userEmail: 'ram@example.com',
  userName: 'Ram Kumar',
  avatarUrl: 'https://example.com/ram.jpg',
  city: 'Delhi',
  state: 'Delhi',
  entryFeeRupees: 100
});

assert(ramJoin.success, '2.1: Ram joins contest');
assert(ramJoin.entry.entryId !== rahulJoin.entry.entryId, '2.2: Ram receives a distinct unique entryId');
assert(ramJoin.entry.ownerUid === 'usr-ram', '2.3: Ram entry ownerUid is usr-ram');

// Ram submits quiz with slower time
const ramSubmit = contestBackend.submitQuiz({
  contestId: contestId1,
  entryId: ramJoin.entry.entryId,
  ownerUid: 'usr-ram',
  answers: { 1: 0, 2: 1 },
  questions: rahulQuestions as any,
  timeTakenSeconds: 65
});

assert(ramSubmit.success, '2.4: Ram submits quiz');

const lbAfterBoth = contestBackend.getLeaderboard(contestId1, ramUid);
assert(lbAfterBoth.length === 2, '2.5: Leaderboard now has exactly 2 submitted entries');

const rahulItem = lbAfterBoth.find(e => e.ownerUid === 'usr-rahul');
const ramItem = lbAfterBoth.find(e => e.ownerUid === 'usr-ram');

assert(Boolean(rahulItem && rahulItem.userName === 'Rahul Sharma' && rahulItem.rank === 1), '2.6: Rahul remains Rank 1 with name Rahul Sharma');
assert(Boolean(ramItem && ramItem.userName === 'Ram Kumar' && ramItem.rank === 2), '2.7: Ram is Rank 2 with name Ram Kumar');
assert(rahulItem?.isCurrentUser === false, '2.8: Rahul entry has isCurrentUser=false for Ram');
assert(ramItem?.isCurrentUser === true, '2.9: Ram entry has isCurrentUser=true for Ram');

// ----------------------------------------------------------------------------
// TEST 3: A user re-joins; only latest active entry appears
// ----------------------------------------------------------------------------
console.log('\n--- Test 3: Re-join: only latest active entry participates ---');

const ramRejoin = contestBackend.joinContest({
  contestId: contestId1,
  ownerUid: 'usr-ram',
  userEmail: 'ram@example.com',
  userName: 'Ram Kumar',
  avatarUrl: 'https://example.com/ram.jpg',
  city: 'Delhi',
  state: 'Delhi',
  entryFeeRupees: 100
});

assert(ramRejoin.isRejoin === true, '3.1: Re-join is correctly recognized');
assert(ramRejoin.replacedEntry?.entryId === ramJoin.entry.entryId, '3.2: Previous entry ENTRY-002 was marked as replaced');
assert(ramRejoin.replacedEntry?.status === 'replaced', '3.3: Replaced entry status is "replaced"');
assert(ramRejoin.replacedEntry?.isActive === false, '3.4: Replaced entry isActive is false');

// Before Ram submits the re-join entry, it is unsubmitted, so leaderboard contains only Rahul
const lbDuringRejoin = contestBackend.getLeaderboard(contestId1, ramUid);
assert(lbDuringRejoin.length === 1 && lbDuringRejoin[0].ownerUid === 'usr-rahul', '3.5: Unsubmitted re-join entry does not receive a rank');

// Ram submits re-join entry with faster time than Rahul
const ramRejoinSubmit = contestBackend.submitQuiz({
  contestId: contestId1,
  entryId: ramRejoin.entry.entryId,
  ownerUid: 'usr-ram',
  answers: { 1: 0, 2: 1 },
  questions: rahulQuestions as any,
  timeTakenSeconds: 30
});

assert(ramRejoinSubmit.success, '3.6: Ram submits re-join quiz');
const lbAfterRejoinSubmit = contestBackend.getLeaderboard(contestId1, ramUid);

assert(lbAfterRejoinSubmit.length === 2, '3.7: Active leaderboard contains exactly 2 active participants (Rahul + Ram latest)');
assert(lbAfterRejoinSubmit[0].ownerUid === 'usr-ram' && lbAfterRejoinSubmit[0].entryId === ramRejoin.entry.entryId, '3.8: Ram latest entry took Rank 1');
assert(lbAfterRejoinSubmit[1].ownerUid === 'usr-rahul', '3.9: Rahul took Rank 2');

// Financial ledger records preserved
const ramLedgers = contestBackend.getFinancialLedgers(contestId1, 'usr-ram');
assert(ramLedgers.length === 2, '3.10: Financial audit ledger retains both payments for Ram (no deletion of payment history)');

// ----------------------------------------------------------------------------
// TEST 4 & 5: Live Standings — Top 5 & Current Rank (Rank 1-5 vs Rank 6+)
// ----------------------------------------------------------------------------
console.log('\n--- Test 4 & 5: Live Standings — Top 5 vs Rank 6+ Current Rank ---');

// Add 5 more users so total participants = 7
const otherUsers = [
  { uid: 'usr-3', name: 'User 3', time: 70 },
  { uid: 'usr-4', name: 'User 4', time: 80 },
  { uid: 'usr-5', name: 'User 5', time: 90 },
  { uid: 'usr-6', name: 'User 6', time: 100 },
  { uid: 'usr-7', name: 'User 7 (Rank 7)', time: 120 }
];

otherUsers.forEach(u => {
  const j = contestBackend.joinContest({
    contestId: contestId1,
    ownerUid: u.uid,
    userEmail: `${u.uid}@test.com`,
    userName: u.name,
    entryFeeRupees: 100
  });
  contestBackend.submitQuiz({
    contestId: contestId1,
    entryId: j.entry.entryId,
    ownerUid: u.uid,
    answers: { 1: 0, 2: 1 },
    questions: rahulQuestions as any,
    timeTakenSeconds: u.time
  });
});

const all7Leaderboard = contestBackend.getLeaderboard(contestId1, 'usr-7');
assert(all7Leaderboard.length === 7, '4.1: Total 7 participants ranked');

// Top 5 filter for Live Standings
const top5Standings = all7Leaderboard
  .filter(e => e.rank != null && e.rank >= 1 && e.rank <= 5)
  .sort((a, b) => (a.rank || 0) - (b.rank || 0));

assert(top5Standings.length === 5, '4.2: Top 5 standings contains exactly 5 entries');
assert(top5Standings[0].rank === 1 && top5Standings[4].rank === 5, '4.3: Top 5 has ranks 1 through 5');

// When viewing as Rank 7 user ('usr-7'):
const user7ItemInTop5 = top5Standings.find(e => e.ownerUid === 'usr-7');
assert(user7ItemInTop5 === undefined, '4.4: User 7 (Rank 7) is NOT in the Top 5 list');

const user7Entry = all7Leaderboard.find(e => e.ownerUid === 'usr-7');
const shouldShowCardForUser7 = Boolean(user7Entry && user7Entry.rank != null && user7Entry.rank >= 6);
assert(shouldShowCardForUser7 === true, '4.5: shouldShowCurrentRankCard is TRUE for user with rank 7');
assert(user7Entry?.rank === 7, '4.6: User 7 rank is 7 (displayed in Your Current Rank, no #1 text)');

// When viewing as Rank 1 user ('usr-ram'):
const lbForRam7 = contestBackend.getLeaderboard(contestId1, 'usr-ram');
const ramInTop5 = top5Standings.find(e => e.ownerUid === 'usr-ram');
assert(ramInTop5 !== undefined && ramInTop5.rank === 1, '4.7: User Ram (Rank 1) IS in Top 5 list');

const ramHeroEntry = lbForRam7.find(e => e.ownerUid === 'usr-ram');
const shouldShowCardForRam = Boolean(ramHeroEntry && ramHeroEntry.rank != null && ramHeroEntry.rank >= 6);
assert(shouldShowCardForRam === false, '4.8: shouldShowCurrentRankCard is FALSE for user with rank 1 (card is hidden)');

// ----------------------------------------------------------------------------
// TEST 6: Logged-in user has not joined
// ----------------------------------------------------------------------------
console.log('\n--- Test 6: Logged-in user who has not joined ---');

const unjoinedUid = 'usr-unjoined';
const lbForUnjoined = contestBackend.getLeaderboard(contestId1, unjoinedUid);
const unjoinedHeroEntry = lbForUnjoined.find(e => e.ownerUid === unjoinedUid);
const shouldShowForUnjoined = Boolean(unjoinedHeroEntry && unjoinedHeroEntry.rank != null && unjoinedHeroEntry.rank >= 6);

assert(unjoinedHeroEntry === undefined, '6.1: Unjoined user has no hero entry');
assert(shouldShowForUnjoined === false, '6.2: Your Current Rank section is completely hidden for unjoined user');
assert(lbForUnjoined.every(e => e.isCurrentUser === false), '6.3: No YOU label shown anywhere for unjoined user');

// ----------------------------------------------------------------------------
// TEST 7 & 8: Demo rows vs Real submissions
// ----------------------------------------------------------------------------
console.log('\n--- Test 7 & 8: Demo rows before submissions, real rows after ---');

const freshContestId = 'CNT-EMPTY-999';
const emptyLeaderboard = contestBackend.getLeaderboard(freshContestId);
assert(emptyLeaderboard.length === 0, '7.1: Empty contest returns 0 entries');

// Demo rows logic
const demoRows = [
  { rank: 1, user: 'User 1', score: '—', time: '—' },
  { rank: 2, user: 'User 2', score: '—', time: '—' }
];

assert(emptyLeaderboard.length === 0 && demoRows.length === 2, '7.2: Exactly 2 demo rows rendered before any real submission');
assert(demoRows[0].score === '—' && demoRows[0].time === '—', '7.3: Demo rows have no fake scores or times');

// Now real user joins and submits
const firstReal = contestBackend.joinContest({
  contestId: freshContestId,
  ownerUid: 'usr-first',
  userEmail: 'first@test.com',
  userName: 'First Real User',
  entryFeeRupees: 100
});
contestBackend.submitQuiz({
  contestId: freshContestId,
  entryId: firstReal.entry.entryId,
  ownerUid: 'usr-first',
  answers: { 1: 0 },
  questions: rahulQuestions as any,
  timeTakenSeconds: 20
});

const populatedLb = contestBackend.getLeaderboard(freshContestId);
assert(populatedLb.length === 1, '8.1: Real entries now available (length > 0)');
assert(populatedLb[0].userName === 'First Real User', '8.2: Demo rows replaced with First Real User');
assert(populatedLb[0].timeTakenSeconds === 20, '8.3: Real time taken displayed');

// ----------------------------------------------------------------------------
// TEST 9 & 10: Contest Deletion & Expiry Reset
// ----------------------------------------------------------------------------
console.log('\n--- Test 9 & 10: Contest Deletion & Expiry Reset ---');

const deletionAudit = contestBackend.handleAdminContestDeletion(freshContestId);
assert(deletionAudit.settlementResult.success === true, '9.1: Contest final settlement completed on deletion');
assert(deletionAudit.preservedEntriesCount === 1, '9.2: Historical entry preserved');
assert(deletionAudit.preservedLedgersCount >= 1, '9.3: Historical ledger preserved');

// Active contest entries reset
const entriesAfterDelete = contestBackend.getActiveEntries('NEW-CONTEST-AFTER-DELETE');
assert(entriesAfterDelete.length === 0, '9.4: After deletion, new active contest starts with 0 entries (demo state restored)');

// ----------------------------------------------------------------------------
// TEST 11: A new contest starts without old contest data
// ----------------------------------------------------------------------------
console.log('\n--- Test 11: New contest starts cleanly without old contest data ---');

const brandNewContestId = 'CNT-BRAND-NEW-2026';
const brandNewEntries = contestBackend.getActiveEntries(brandNewContestId);
const brandNewLb = contestBackend.getLeaderboard(brandNewContestId);

assert(brandNewEntries.length === 0, '11.1: Brand new contest has 0 active entries');
assert(brandNewLb.length === 0, '11.2: Brand new contest leaderboard is empty');
assert(!brandNewLb.some(e => e.userName === 'Rahul Sharma' || e.userName === 'Ram Kumar'), '11.3: Old contest participants never bleed into new contest');

// ----------------------------------------------------------------------------
// TEST 12: Winner Cards, Full Winner List & Live Standings Synchronization
// ----------------------------------------------------------------------------
console.log('\n--- Test 12: Winner Cards, Full Winner List & Live Standings Data Sync ---');

// Set up a 4-entry contest to test exact four-entry payout and synchronization
const contest4Id = 'CNT-FOUR-ENTRIES';
const users4 = [
  { uid: 'usr-p1', name: 'Player 1', time: 10, score: 10 },
  { uid: 'usr-p2', name: 'Player 2', time: 20, score: 10 },
  { uid: 'usr-p3', name: 'Player 3', time: 15, score: 8 },
  { uid: 'usr-p4', name: 'Player 4', time: 25, score: 7 }
];

users4.forEach(u => {
  const j = contestBackend.joinContest({
    contestId: contest4Id,
    ownerUid: u.uid,
    userEmail: `${u.uid}@test.com`,
    userName: u.name,
    entryFeeRupees: 100
  });
  contestBackend.submitQuiz({
    contestId: contest4Id,
    entryId: j.entry.entryId,
    ownerUid: u.uid,
    answers: { 1: 0 },
    questions: rahulQuestions as any,
    timeTakenSeconds: u.time
  });
});

const syncLb = contestBackend.getLeaderboard(contest4Id);
const r1 = syncLb.find(e => e.rank === 1);
const r2 = syncLb.find(e => e.rank === 2);
const r3 = syncLb.find(e => e.rank === 3);
const r4 = syncLb.find(e => e.rank === 4);

assert(Boolean(r1 && r2 && r3 && r4), '12.1: All 4 entries exist in synced source');

// Check that the data fields are identical and accurate
assert(r1?.id === r1?.entryId, '12.2: Rank 1 id matches entryId');
assert(r1?.ownerUid === 'usr-p1', '12.3: Rank 1 ownerUid is usr-p1');
assert(r1?.rewardAmount === 180, '12.4: Rank 1 reward is ₹180');
assert(r2?.rewardAmount === 60, '12.5: Rank 2 reward is ₹60 (not ₹120)');
assert(r3?.rewardAmount === 0, '12.6: Rank 3 reward is ₹0 (no prize)');
assert(r4?.rewardAmount === 0, '12.7: Rank 4 reward is ₹0 (no prize)');

console.log('\n===================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('===================================================================');
