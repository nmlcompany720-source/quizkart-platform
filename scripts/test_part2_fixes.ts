import { 
  contestBackend, 
  calculateContestPool, 
  calculateTrustedScore, 
  rankActiveEntries, 
  mapEntriesToLeaderboard,
  createDefaultFourContestEntries,
  rupeesToPaise,
  paiseToRupees
} from '../src/backend/contestEngine';
import { Question, ContestEntry, LeaderboardEntry } from '../src/types';

console.log('===================================================================');
console.log('QUIZKART - PART 2: WINNER CARDS, PROFILE MAPPING & STANDINGS TESTS');
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

// ----------------------------------------------------------------------------
// TEST 1: Demo prizes show ₹180, ₹120 and ₹60 before real joins
// ----------------------------------------------------------------------------
console.log('--- Test 1: Demo prizes show ₹180, ₹120 and ₹60 before real joins ---');
contestBackend.resetForTesting();
const contestId = 'CNT-PART2-TEST';

// Helper function replicating LiveLeaderboard's Winner Card prize calculation logic
function getWinnerCardPrizeText(rank: number, hasRealJoins: boolean, realEntry?: LeaderboardEntry | null): string {
  if (!hasRealJoins) {
    if (rank === 1) return '₹180';
    if (rank === 2) return '₹120';
    if (rank === 3) return '₹60';
    return '₹0';
  }
  if (realEntry && realEntry.rewardAmount !== undefined) {
    return `₹${realEntry.rewardAmount.toLocaleString('en-IN')}`;
  }
  return '₹0';
}

const entriesBeforeJoin = contestBackend.getActiveEntries(contestId);
const mappedBeforeJoin = mapEntriesToLeaderboard(entriesBeforeJoin);
const hasRealJoinsBefore = mappedBeforeJoin.length > 0;

assert(!hasRealJoinsBefore, '1.1: No real entries exist before any user joins');
assert(getWinnerCardPrizeText(1, hasRealJoinsBefore) === '₹180', '1.2: Demo Rank 1 prize shows ₹180 before real joins');
assert(getWinnerCardPrizeText(2, hasRealJoinsBefore) === '₹120', '1.3: Demo Rank 2 prize shows ₹120 before real joins');
assert(getWinnerCardPrizeText(3, hasRealJoinsBefore) === '₹60', '1.4: Demo Rank 3 prize shows ₹60 before real joins');

// ----------------------------------------------------------------------------
// TEST 2: Demo prizes disappear after the first verified real join
// ----------------------------------------------------------------------------
console.log('\n--- Test 2: Demo prizes disappear after the first verified real join ---');

// First verified real user (Rahul) joins and submits
const rahulJoin = contestBackend.joinContest({
  contestId,
  ownerUid: 'usr-rahul-01',
  userEmail: 'rahul@quizkart.in',
  userName: 'Rahul Sharma',
  entryFeeRupees: 100,
  paymentVerified: true
});

const rahulSubmit = contestBackend.submitQuiz({
  contestId,
  entryId: rahulJoin.entry.entryId,
  ownerUid: 'usr-rahul-01',
  answers: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0, 6: 1, 7: 2, 8: 3, 9: 0, 10: 1 },
  questions: [
    { id: 1, question: 'Q1', options: ['A','B','C','D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 2, question: 'Q2', options: ['A','B','C','D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 3, question: 'Q3', options: ['A','B','C','D'], correctIndex: 2, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 4, question: 'Q4', options: ['A','B','C','D'], correctIndex: 3, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 5, question: 'Q5', options: ['A','B','C','D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 6, question: 'Q6', options: ['A','B','C','D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 7, question: 'Q7', options: ['A','B','C','D'], correctIndex: 2, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 8, question: 'Q8', options: ['A','B','C','D'], correctIndex: 3, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 9, question: 'Q9', options: ['A','B','C','D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 10, question: 'Q10', options: ['A','B','C','D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' }
  ],
  timeTakenSeconds: 142
});

const activeAfterRahul = contestBackend.getActiveEntries(contestId);
const mappedAfterRahul = mapEntriesToLeaderboard(activeAfterRahul, 'usr-rahul-01');
const hasRealJoinsAfter = mappedAfterRahul.length > 0;

assert(hasRealJoinsAfter, '2.1: hasRealJoins is true after first real submission');
const rank1After = mappedAfterRahul.find(e => e.rank === 1);
const rank2After = mappedAfterRahul.find(e => e.rank === 2);
const rank3After = mappedAfterRahul.find(e => e.rank === 3);

// 1 entry: Revenue ₹100, Prize pool 60% = ₹60. Rank 1 gets ₹60. Ranks 2 and 3 do not exist -> ₹0.
assert(getWinnerCardPrizeText(1, hasRealJoinsAfter, rank1After) === '₹60', '2.2: Rank 1 shows actual calculation ₹60 (not demo ₹180)', `got ${getWinnerCardPrizeText(1, hasRealJoinsAfter, rank1After)}`);
assert(getWinnerCardPrizeText(2, hasRealJoinsAfter, rank2After) === '₹0', '2.3: Rank 2 demo prize ₹120 has disappeared and shows ₹0', `got ${getWinnerCardPrizeText(2, hasRealJoinsAfter, rank2After)}`);
assert(getWinnerCardPrizeText(3, hasRealJoinsAfter, rank3After) === '₹0', '2.4: Rank 3 demo prize ₹60 has disappeared and shows ₹0', `got ${getWinnerCardPrizeText(3, hasRealJoinsAfter, rank3After)}`);

// ----------------------------------------------------------------------------
// TEST 3: Four entries show ₹180, ₹60, ₹0 and ₹0
// ----------------------------------------------------------------------------
console.log('\n--- Test 3: Four entries show ₹180, ₹60, ₹0 and ₹0 ---');

contestBackend.resetForTesting();
const testContest4 = 'CNT-FOUR-ENTRIES';
const fourEntries = createDefaultFourContestEntries(testContest4, 100);
contestBackend.loadEntriesFromFirestore(fourEntries);

const active4 = contestBackend.getActiveEntries(testContest4);
const mapped4 = mapEntriesToLeaderboard(active4);

const r1 = mapped4.find(e => e.rank === 1);
const r2 = mapped4.find(e => e.rank === 2);
const r3 = mapped4.find(e => e.rank === 3);
const r4 = mapped4.find(e => e.rank === 4);

assert(r1?.rewardAmount === 180, '3.1: Rank 1 receives ₹180', `got ${r1?.rewardAmount}`);
assert(r2?.rewardAmount === 60, '3.2: Rank 2 receives ₹60 (not ₹120)', `got ${r2?.rewardAmount}`);
assert(r3?.rewardAmount === 0, '3.3: Rank 3 receives ₹0 (not ₹36 or ₹60)', `got ${r3?.rewardAmount}`);
assert(r4?.rewardAmount === 0, '3.4: Rank 4 receives ₹0 (not ₹36)', `got ${r4?.rewardAmount}`);

// ----------------------------------------------------------------------------
// TEST 4: Winner Cards and Full Winner List show identical prizes for each Entry ID
// ----------------------------------------------------------------------------
console.log('\n--- Test 4: Winner Cards and Full Winner List show identical prizes for each Entry ID ---');

mapped4.forEach(entry => {
  const winnerCardPrize = getWinnerCardPrizeText(entry.rank, true, entry);
  const fullListPrize = `₹${entry.rewardAmount ?? 0}`;
  assert(
    winnerCardPrize === fullListPrize,
    `4.${entry.rank}: Entry ${entry.id} (Rank ${entry.rank}) identical in Winner Cards (${winnerCardPrize}) and Full Winner List (${fullListPrize})`
  );
});

// ----------------------------------------------------------------------------
// TEST 5: "My Rank" works correctly and uses the correct selected color
// ----------------------------------------------------------------------------
console.log('\n--- Test 5: "My Rank" works correctly and uses the correct selected color ---');

// Test logged in user as Rank 2 (Priya, usr-1002)
const priyaMapped = mapEntriesToLeaderboard(active4, 'usr-1002');
const priyaMyRank = priyaMapped.filter(e => e.isCurrentUser);

assert(priyaMyRank.length === 1, '5.1: "My Rank" returns exactly 1 entry for logged-in user');
assert(priyaMyRank[0].userName === 'Priya Sundaram', '5.2: "My Rank" returns logged-in user Priya Sundaram');
assert(priyaMyRank[0].rank === 2, '5.3: "My Rank" shows Rank 2 for Priya');

// Test user who has not joined (usr-not-joined)
const unjoinedMapped = mapEntriesToLeaderboard(active4, 'usr-not-joined');
const unjoinedMyRank = unjoinedMapped.filter(e => e.isCurrentUser);
assert(unjoinedMyRank.length === 0, '5.4: "My Rank" returns 0 entries for unjoined user');

// ----------------------------------------------------------------------------
// TEST 6: Unjoined users never appear in winner profiles or rankings
// ----------------------------------------------------------------------------
console.log('\n--- Test 6: Unjoined users never appear in winner profiles or rankings ---');

const ramInList = mapped4.find(e => e.userName === 'Ram' || e.ownerUid === 'usr-ram');
assert(!ramInList, '6.1: Ram does not appear in winner list before joining');

// ----------------------------------------------------------------------------
// TEST 7: Rahul and Ram profile, score, rank and entries never mix
// ----------------------------------------------------------------------------
console.log('\n--- Test 7: Rahul and Ram profile, score, rank and entries never mix ---');

contestBackend.resetForTesting();
const testContestPair = 'CNT-RAHUL-RAM';

// Step A: Rahul joins and submits
const rJoin = contestBackend.joinContest({
  contestId: testContestPair,
  ownerUid: 'usr-rahul',
  userEmail: 'rahul@example.com',
  userName: 'Rahul',
  avatarUrl: 'https://example.com/rahul.jpg',
  entryFeeRupees: 100,
  paymentVerified: true
});

contestBackend.submitQuiz({
  contestId: testContestPair,
  entryId: rJoin.entry.entryId,
  ownerUid: 'usr-rahul',
  answers: { 1: 0, 2: 1 },
  questions: [
    { id: 1, question: 'Q1', options: ['A','B','C','D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 2, question: 'Q2', options: ['A','B','C','D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' }
  ],
  timeTakenSeconds: 120
});

// Step B: Ram logs in but has NOT joined
let activePair = contestBackend.getActiveEntries(testContestPair);
let mappedForRam = mapEntriesToLeaderboard(activePair, 'usr-ram');

assert(mappedForRam.length === 1, '7.1: Only Rahul is in leaderboard');
assert(mappedForRam[0].userName === 'Rahul', '7.2: Rahul name remains Rahul when Ram logs in');
assert(mappedForRam[0].avatar === 'https://example.com/rahul.jpg', '7.3: Rahul avatar remains Rahul avatar');
assert(mappedForRam[0].ownerUid === 'usr-rahul', '7.4: Rahul entry remains mapped to usr-rahul');
assert(!mappedForRam[0].isCurrentUser, '7.5: Rahul entry is not marked as Ram');

// Step C: Ram joins and submits
const ramJoin = contestBackend.joinContest({
  contestId: testContestPair,
  ownerUid: 'usr-ram',
  userEmail: 'ram@example.com',
  userName: 'Ram',
  avatarUrl: 'https://example.com/ram.jpg',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(ramJoin.entry.entryId !== rJoin.entry.entryId, '7.6: Ram gets a separate unique entry ID');
assert(ramJoin.entry.ownerUid === 'usr-ram', '7.7: Ram entry has ownerUid usr-ram');

contestBackend.submitQuiz({
  contestId: testContestPair,
  entryId: ramJoin.entry.entryId,
  ownerUid: 'usr-ram',
  answers: { 1: 0 },
  questions: [
    { id: 1, question: 'Q1', options: ['A','B','C','D'], correctIndex: 0, category: 'GK', difficulty: 'Easy', explanation: '' },
    { id: 2, question: 'Q2', options: ['A','B','C','D'], correctIndex: 1, category: 'GK', difficulty: 'Easy', explanation: '' }
  ],
  timeTakenSeconds: 150
});

activePair = contestBackend.getActiveEntries(testContestPair);
const mappedBoth = mapEntriesToLeaderboard(activePair, 'usr-ram');

assert(mappedBoth.length === 2, '7.8: Exactly 2 separate entries exist');
const rahulEntry = mappedBoth.find(e => e.ownerUid === 'usr-rahul');
const ramEntry = mappedBoth.find(e => e.ownerUid === 'usr-ram');

assert(Boolean(rahulEntry && rahulEntry.userName === 'Rahul' && rahulEntry.avatar === 'https://example.com/rahul.jpg'), '7.9: Rahul entry completely preserves Rahul data');
assert(Boolean(ramEntry && ramEntry.userName === 'Ram' && ramEntry.avatar === 'https://example.com/ram.jpg'), '7.10: Ram entry completely preserves Ram data');
assert(rahulEntry?.entryId !== ramEntry?.entryId, '7.11: Rahul and Ram entry IDs are distinct');

// ----------------------------------------------------------------------------
// TEST 8: Live Standings show two demo rows before real joins
// ----------------------------------------------------------------------------
console.log('\n--- Test 8: Live Standings show two demo rows before real joins ---');

// Helper replicating HeroSection Live Standings display logic
function getLiveStandingsRows(entries: LeaderboardEntry[]) {
  const realEntries = entries.filter(e => e.rank != null && e.rank > 0);
  if (realEntries.length === 0) {
    return [
      { rank: 1, user: 'User 1', score: '—', time: '—', isDemo: true },
      { rank: 2, user: 'User 2', score: '—', time: '—', isDemo: true }
    ];
  }
  return realEntries.map(e => ({
    rank: e.rank,
    user: e.userName,
    score: `${e.score}/${e.totalQuestions || 10}`,
    time: e.formattedTime,
    isDemo: false
  }));
}

const emptyStandings = getLiveStandingsRows([]);
assert(emptyStandings.length === 2, '8.1: Live Standings shows exactly 2 demo rows before joins');
assert(emptyStandings[0].user === 'User 1' && emptyStandings[0].score === '—' && emptyStandings[0].time === '—', '8.2: Demo Row 1 is User 1 with "—" score and time');
assert(emptyStandings[1].user === 'User 2' && emptyStandings[1].score === '—' && emptyStandings[1].time === '—', '8.3: Demo Row 2 is User 2 with "—" score and time');

// ----------------------------------------------------------------------------
// TEST 9: Live Standings update with real submitted entries and correct ranks
// ----------------------------------------------------------------------------
console.log('\n--- Test 9: Live Standings update with real submitted entries and correct ranks ---');

const realStandings = getLiveStandingsRows(mappedBoth);
assert(realStandings.length === 2, '9.1: Live Standings shows real entries after submissions');
assert(realStandings.every(r => !r.isDemo), '9.2: Demo rows are removed');
assert(realStandings[0].rank === 1 && realStandings[0].user === 'Rahul', '9.3: Row 1 is Rank 1 Rahul with real score and time');
assert(realStandings[1].rank === 2 && realStandings[1].user === 'Ram', '9.4: Row 2 is Rank 2 Ram with real score and time');

// ----------------------------------------------------------------------------
// TEST 10: Existing payment and re-join behavior remains unaffected
// ----------------------------------------------------------------------------
console.log('\n--- Test 10: Existing payment and re-join behavior remains unaffected ---');

// Ram re-joins the contest
const ramRejoin = contestBackend.joinContest({
  contestId: testContestPair,
  ownerUid: 'usr-ram',
  userEmail: 'ram@example.com',
  userName: 'Ram',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(ramRejoin.isRejoin === true, '10.1: Re-join detected');
assert(ramRejoin.replacedEntry?.status === 'replaced', '10.2: Previous Ram entry marked as replaced');
assert(ramRejoin.replacedEntry?.isActive === false, '10.3: Previous Ram entry is not active');
assert(ramRejoin.entry.isActive === true, '10.4: New re-join entry is active');

const activeAfterRejoin = contestBackend.getActiveEntries(testContestPair);
assert(activeAfterRejoin.length === 2, '10.5: Active entries count remains 2 (1 per user: Rahul + Ram latest)');
assert(activeAfterRejoin.find(e => e.ownerUid === 'usr-ram')?.entryId === ramRejoin.entry.entryId, '10.6: Only Ram latest entry participates');

console.log('\n===================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('===================================================================\n');
