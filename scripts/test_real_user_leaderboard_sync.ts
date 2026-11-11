import {
  contestBackend,
  mapEntriesToLeaderboard,
  calculateContestPool,
  rankActiveEntries,
  formatTimeDisplay
} from '../src/backend/contestEngine';
import { LeaderboardEntry, ContestEntry } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    process.exit(1);
  } else {
    console.log(`  ✓ [PASS] ${msg}`);
  }
}

console.log('===============================================================');
console.log('QUIZKART — REAL USER LEADERBOARD & WINNER DATA SYNCHRONIZATION');
console.log('===============================================================');

// Clean slate test contest
const CONTEST_ID = `CNT-TEST-${Date.now()}`;
const USER_1_UID = `usr-real-${Date.now()}`;
const USER_2_UID = `usr-second-${Date.now()}`;

console.log('\n--- 1. Testing Demo State Before Any Real Joins ---');
const emptyLeaderboard: LeaderboardEntry[] = [];

// Helper matching HeroSection & LiveLeaderboard isRealSubmission
const isRealSubmission = (e?: LeaderboardEntry | null) => {
  if (!e) return false;
  if (e.userName === 'User 1' || e.userName === 'User 2') return false;
  if (e.id && e.id.startsWith('lb-')) return false;
  if (e.ownerUid && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return false;

  if (e.id && (e.id.startsWith('ENTRY-') || e.id.startsWith('user-') || e.id.startsWith('sub-') || e.id.startsWith('att-') || e.id.startsWith('real-'))) return true;
  if (e.entryId && (e.entryId.startsWith('ENTRY-') || e.entryId.startsWith('user-') || e.entryId.startsWith('sub-') || e.entryId.startsWith('att-'))) return true;
  if (e.score !== undefined && e.score !== null && !isNaN(Number(e.score))) return true;
  return Boolean(e.submittedAt && !e.id?.startsWith('lb-'));
};

const realEntriesBefore = emptyLeaderboard.filter(e => isRealSubmission(e));
assert(realEntriesBefore.length === 0, 'No real submitted participants initially');

console.log('\n--- 2. Testing Real User Join Flow ---');
const joinResult1 = contestBackend.joinContest({
  contestId: CONTEST_ID,
  ownerUid: USER_1_UID,
  userName: 'Abilas Patel',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120',
  city: 'Bengaluru',
  state: 'Karnataka',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(joinResult1.success === true, 'Real user 1 joined contest successfully');
assert(joinResult1.entry.isSubmitted === false, 'Entry is not submitted upon join');
assert(joinResult1.poolCalculation.confirmedPaidEntries === 1, 'Real joins count updated to 1');

// Unsubmitted join does not appear in public rankings
const activeBeforeSubmit = contestBackend.getActiveEntries(CONTEST_ID);
const mappedBeforeSubmit = mapEntriesToLeaderboard(activeBeforeSubmit, USER_1_UID);
assert(mappedBeforeSubmit.length === 0, 'Unsubmitted user does not appear in leaderboard');

console.log('\n--- 3. Testing Real User Quiz Submission & Authoritative Data ---');
const dummyQuestions = [
  { id: 1, stem: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'General', difficulty: 'easy' },
  { id: 2, stem: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, category: 'General', difficulty: 'easy' },
  { id: 3, stem: 'Q3', options: ['A', 'B', 'C', 'D'], correctIndex: 2, category: 'General', difficulty: 'easy' }
];

const submitResult1 = contestBackend.submitQuiz({
  contestId: CONTEST_ID,
  entryId: joinResult1.entry.entryId,
  ownerUid: USER_1_UID,
  answers: { 1: 0, 2: 1, 3: 2 }, // 3 correct out of 3
  questions: dummyQuestions as any,
  timeTakenSeconds: 24.5
});

assert(submitResult1.success === true, 'Quiz submitted successfully');
assert(submitResult1.entry?.isSubmitted === true, 'Entry is now isSubmitted = true');
assert(submitResult1.entry?.score === 3, 'Calculated score is 3.0');
assert(submitResult1.entry?.timeTakenSeconds === 25, 'Time taken stored accurately');
assert(submitResult1.entry?.rank === 1, 'Assigned Rank 1');

console.log('\n--- 4. Testing Live Standings Real User Rendering ---');
const activeAfterSubmit = contestBackend.getActiveEntries(CONTEST_ID);
const liveLeaderboard = mapEntriesToLeaderboard(activeAfterSubmit, USER_1_UID);

assert(liveLeaderboard.length === 1, 'Leaderboard contains exactly 1 submitted real user');
const heroRealEntries = liveLeaderboard.filter(e => isRealSubmission(e) && e.rank != null && e.rank >= 1 && e.rank <= 5);
assert(heroRealEntries.length === 1, 'Live Standings has 1 real entry, triggering removal of demo rows');
assert(heroRealEntries[0].userName === 'Abilas Patel', 'Live Standings displays real user name "Abilas Patel"');
assert(heroRealEntries[0].score === 3, 'Live Standings displays real score 3');
assert(heroRealEntries[0].formattedTime === '25s' || heroRealEntries[0].timeTakenSeconds === 25, 'Live Standings displays real time');
assert(heroRealEntries[0].ownerUid === USER_1_UID, 'Live Standings entry matches authenticated ownerUid');

console.log('\n--- 5. Testing Winner Cards Synchronization ---');
const hasRealJoins = liveLeaderboard.filter(e => isRealSubmission(e) && e.rank != null && e.rank > 0).length > 0;
assert(hasRealJoins === true, 'hasRealJoins is true in LiveLeaderboard');

const rank1Entry = liveLeaderboard.find(e => e.rank === 1);
assert(Boolean(rank1Entry), 'Rank 1 entry exists for Winner Podium');
assert(rank1Entry?.userName === 'Abilas Patel', 'Podium Card 1 shows "Abilas Patel" (not "USER")');
assert(rank1Entry?.avatar === 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120', 'Podium Card 1 shows real avatar');
assert(rank1Entry?.rewardAmount === 60, 'Podium Card 1 shows real calculated prize ₹60 (60% of ₹100)');

const rank2Entry = liveLeaderboard.find(e => e.rank === 2);
assert(!rank2Entry, 'Rank 2 is unassigned (no fake/demo user displayed alongside real user)');

console.log('\n--- 6. Testing Cloud Re-Sync Reconciliation (No Wipeout) ---');
// Simulate Firestore snapshot returning delayed or unsubmitted entry
const simulatedStaleCloudEntry: ContestEntry = {
  ...joinResult1.entry,
  isSubmitted: false // older snapshot before submit write finished
};

contestBackend.loadContestEntries(CONTEST_ID, [simulatedStaleCloudEntry]);
const reconciledActive = contestBackend.getActiveEntries(CONTEST_ID);
const reconciledMapped = mapEntriesToLeaderboard(reconciledActive, USER_1_UID);

assert(reconciledMapped.length === 1, 'Reconciliation preserved local submitted state against stale snapshot');
assert(reconciledMapped[0].score === 3, 'Reconciled entry preserved score 3');
assert(reconciledMapped[0].userName === 'Abilas Patel', 'Reconciled entry preserved user name');

// Simulate empty cloud array (e.g. latency/offline)
contestBackend.loadContestEntries(CONTEST_ID, []);
const afterEmptyCloud = contestBackend.getActiveEntries(CONTEST_ID);
const afterEmptyMapped = mapEntriesToLeaderboard(afterEmptyCloud, USER_1_UID);
assert(afterEmptyMapped.length === 1, 'Empty cloud array does not wipe out valid local submitted entries');

console.log('\n--- 7. Testing Real-Time Profile Name Synchronization ---');
contestBackend.updateUserProfile(USER_1_UID, { userName: 'Rahul Varma' });
const refreshedActive = contestBackend.getActiveEntries(CONTEST_ID);
const refreshedMapped = mapEntriesToLeaderboard(refreshedActive, USER_1_UID);

assert(refreshedMapped[0].userName === 'Rahul Varma', 'Updated profile name "Rahul Varma" instantly synced to leaderboard');
assert(refreshedMapped[0].ownerUid === USER_1_UID, 'Identity preserved by ownerUid');

console.log('\n--- 8. Testing Second Real User & Ranking Update ---');
const joinResult2 = contestBackend.joinContest({
  contestId: CONTEST_ID,
  ownerUid: USER_2_UID,
  userName: 'Sneha Roy',
  avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120',
  city: 'Kolkata',
  state: 'West Bengal',
  entryFeeRupees: 100,
  paymentVerified: true
});

const submitResult2 = contestBackend.submitQuiz({
  contestId: CONTEST_ID,
  entryId: joinResult2.entry.entryId,
  ownerUid: USER_2_UID,
  answers: { 1: 0, 2: 1, 3: 2 }, // 3 correct out of 3, faster time (15s vs 25s)
  questions: dummyQuestions as any,
  timeTakenSeconds: 15.0
});

assert(submitResult2.success === true, 'User 2 submitted quiz');
const twoUsersActive = contestBackend.getActiveEntries(CONTEST_ID);
const twoUsersLeaderboard = mapEntriesToLeaderboard(twoUsersActive);

assert(twoUsersLeaderboard.length === 2, 'Leaderboard now has 2 real submitted users');
assert(twoUsersLeaderboard[0].userName === 'Sneha Roy', 'Sneha Roy takes Rank 1 due to lower elapsed time (15s < 25s)');
assert(twoUsersLeaderboard[0].rank === 1, 'Sneha Roy is Rank 1');
assert(twoUsersLeaderboard[1].userName === 'Rahul Varma', 'Rahul Varma is Rank 2');
assert(twoUsersLeaderboard[1].rank === 2, 'Rahul Varma reranked to Rank 2');

console.log('\n--- 9. Testing Re-Join Rule (Only Latest Entry Active) ---');
const rejoinResult = contestBackend.joinContest({
  contestId: CONTEST_ID,
  ownerUid: USER_1_UID,
  userName: 'Rahul Varma',
  entryFeeRupees: 100,
  paymentVerified: true
});

assert(rejoinResult.isRejoin === true, 'System detects re-join for Rahul Varma');
assert(rejoinResult.replacedEntry?.status === 'replaced', 'Previous entry marked as replaced');
assert(rejoinResult.entry.isActive === true, 'New entry is active');

const afterRejoinActive = contestBackend.getActiveEntries(CONTEST_ID);
// Only Sneha (submitted) and Rahul's new entry (unsubmitted) exist
const activeForRahul = afterRejoinActive.filter(e => e.ownerUid === USER_1_UID);
assert(activeForRahul.length === 1, 'Rahul has exactly 1 active entry');
assert(activeForRahul[0].entryId === rejoinResult.entry.entryId, 'Active entry is the new re-join entry');

console.log('===============================================================');
console.log('ALL REAL USER LEADERBOARD & WINNER DATA TESTS PASSED (100%)');
console.log('===============================================================');
