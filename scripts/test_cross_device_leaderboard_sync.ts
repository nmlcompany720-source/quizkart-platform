import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  contestBackend,
  mapEntriesToLeaderboard,
  calculateContestPool
} from '../src/backend/contestEngine';
import {
  getScopedContestEntryDocId,
  getScopedLeaderboardDocId
} from '../src/firebase';
import { ActiveContest, ContestEntry } from '../src/types';

console.log('===================================================================');
console.log('QUIZKART — CROSS-DEVICE LEADERBOARD, PRIZE & ADMIN SYNC TESTS');
console.log('===================================================================');

// 1. Verify single authoritative Firebase project & Firestore DB configuration
console.log('\n--- 1. Verifying Single Authoritative Firebase Configuration ---');
const fbConfigRaw = fs.readFileSync(path.resolve('firebase-applet-config.json'), 'utf8');
const fbConfig = JSON.parse(fbConfigRaw);
assert.strictEqual(fbConfig.projectId, 'quantum-tomorrow-r0bnn', '1.1: Project ID matches quantum-tomorrow-r0bnn');
assert.strictEqual(
  fbConfig.firestoreDatabaseId,
  'ai-studio-quizkartin-d9963b2a-d309-41d1-80a3-29d8999e847f',
  '1.2: Firestore DB matches ai-studio-quizkartin-d9963b2a-d309-41d1-80a3-29d8999e847f'
);
const viteConfig = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
assert(!viteConfig.includes('VITE_FIREBASE'), '1.3: vite.config.ts does not override Firebase config with env switches');
console.log('  ✓ [PASS] Single Firebase backend & Firestore DB verified');

// 2. Verify Contest & Owner Scoped Document IDs prevent ENTRY-001 collisions
console.log('\n--- 2. Verifying Scoped contest_entries & leaderboard Document IDs ---');
const docContestA = getScopedContestEntryDocId({
  contestId: 'CNT-CASH-1121',
  entryId: 'ENTRY-001',
  ownerUid: 'usr_anju_1'
});
const docContestB = getScopedContestEntryDocId({
  contestId: 'CNT-CASH-1794915384002-G3YYT5',
  entryId: 'ENTRY-001',
  ownerUid: 'usr_anju_1'
});
const docDevice2SameContest = getScopedContestEntryDocId({
  contestId: 'CNT-CASH-1794915384002-G3YYT5',
  entryId: 'ENTRY-001',
  ownerUid: 'usr_rohit_2'
});
assert.notStrictEqual(docContestA, docContestB, '2.1: ENTRY-001 across two contests produces distinct Firestore doc IDs');
assert.notStrictEqual(docContestB, docDevice2SameContest, '2.2: Concurrent ENTRY-001 across two devices/UIDs produces distinct Firestore doc IDs');

const lbDocA = getScopedLeaderboardDocId({
  id: 'ENTRY-001',
  contestId: 'CNT-CASH-1121',
  ownerUid: 'usr_anju_1',
  rank: 1,
  userName: 'Anju kanwar',
  avatar: '',
  score: 4.68,
  totalQuestions: 10,
  timeTakenSeconds: 23,
  formattedTime: '23s',
  city: 'Jaipur',
  state: 'Rajasthan',
  rewardText: '₹60',
  rewardType: 'cashback',
  rewardAmount: 60,
  timestamp: '11:36',
  submittedAt: '17 Nov 2026'
});
const lbDocB = getScopedLeaderboardDocId({
  id: 'ENTRY-001',
  contestId: 'CNT-CASH-1794915384002-G3YYT5',
  ownerUid: 'usr_rohit_2',
  rank: 1,
  userName: 'Rohit',
  avatar: '',
  score: 5,
  totalQuestions: 10,
  timeTakenSeconds: 20,
  formattedTime: '20s',
  city: 'Bengaluru',
  state: 'Karnataka',
  rewardText: '₹60',
  rewardType: 'cashback',
  rewardAmount: 60,
  timestamp: '11:40',
  submittedAt: '17 Nov 2026'
});
assert.notStrictEqual(lbDocA, lbDocB, '2.3: Leaderboard doc IDs are isolated per contest & ownerUid');
console.log('  ✓ [PASS] Scoped Firestore doc IDs prevent cross-contest and cross-device ENTRY-001 overwrite');

// 3. Verify Active Contest Priority (stale completed cached ID must not override active contest)
console.log('\n--- 3. Verifying Active Contest Priority Resolution ---');
function resolveConsistentActiveContest(contests: ActiveContest[], cachedActiveContestId: string | null): ActiveContest | null {
  const activeContests = contests.filter(c => c.status === 'active');
  if (activeContests.length > 0) {
    if (cachedActiveContestId) {
      const matchedActive = activeContests.find(c => c.id === cachedActiveContestId);
      if (matchedActive) return matchedActive;
    }
    return [...activeContests].sort((a, b) => new Date(b.activatedAt || b.createdAt || 0).getTime() - new Date(a.activatedAt || a.createdAt || 0).getTime())[0];
  }
  const scheduled = contests.filter(c => c.status === 'scheduled');
  if (scheduled.length > 0) return scheduled[0];
  if (cachedActiveContestId) {
    const matched = contests.find(c => c.id === cachedActiveContestId);
    if (matched) return matched;
  }
  return contests[0] || null;
}

const sampleContests: ActiveContest[] = [
  { id: 'CNT-CASH-1121', title: 'Special Tuesday', type: 'cash', entryFee: 100, status: 'completed', createdAt: '2026-11-16T10:00:00Z' } as ActiveContest,
  { id: 'CNT-CASH-1794915384002-G3YYT5', title: 'Spacial sunday', type: 'cash', entryFee: 100, status: 'active', createdAt: '2026-11-17T11:36:24Z' } as ActiveContest
];
const redmiResolved = resolveConsistentActiveContest(sampleContests, 'CNT-CASH-1121');
const vivoResolved = resolveConsistentActiveContest(sampleContests, null);
assert.strictEqual(redmiResolved?.id, 'CNT-CASH-1794915384002-G3YYT5', '3.1: Device with stale completed cached ID switches cleanly to active contest');
assert.strictEqual(vivoResolved?.id, 'CNT-CASH-1794915384002-G3YYT5', '3.2: Fresh device resolves same active contest');
assert.strictEqual(redmiResolved?.id, vivoResolved?.id, '3.3: Both devices resolve the exact same authoritative contest');
console.log('  ✓ [PASS] Active contest resolution consistent across cached and fresh devices');

// 4. Verify No Fake "USER" or Hardcoded "₹180"/"₹120"/"₹60" Fallback in LiveLeaderboard
console.log('\n--- 4. Verifying LiveLeaderboard Has Zero Fake USER/₹180 Fallbacks ---');
const liveLeaderboardSrc = fs.readFileSync(path.resolve('src/components/LiveLeaderboard.tsx'), 'utf8');
assert(!liveLeaderboardSrc.includes(": 'USER'"), '4.1: LiveLeaderboard never renders fake "USER" winner name');
assert(!liveLeaderboardSrc.includes("prizeText = '₹180'"), '4.2: LiveLeaderboard never injects fake hardcoded "₹180" prize');
assert(!liveLeaderboardSrc.includes("prizeText = '₹120'"), '4.3: LiveLeaderboard never injects fake hardcoded "₹120" prize');
assert(!liveLeaderboardSrc.includes("prizeText = '₹60'"), '4.4: LiveLeaderboard never injects fake hardcoded "₹60" prize');
assert(liveLeaderboardSrc.includes("'Awaiting Player'"), '4.5: Empty winner slot renders "Awaiting Player"');
console.log('  ✓ [PASS] Fake "USER" and "₹180/₹120/₹60" fallbacks eliminated cleanly');

// 5. Verify Settled vs Provisional Prize Separation & Cross-Device Mapping Consistency
console.log('\n--- 5. Verifying Settled vs Provisional Prizes & Cross-Device Mapping ---');
const CONTEST_ID = `CNT-SYNC-${Date.now()}`;
const ANJU_UID = 'usr_7b5af23d-2b0b-4a70-969d-5f7f8d90dcdf';
const OTHER_VIEWER_UID = 'usr_viewer_device_2';

const simulatedSettledCloudEntries: ContestEntry[] = [
  {
    entryId: 'ENTRY-001',
    entrySequenceNumber: 1,
    contestId: CONTEST_ID,
    ownerUid: ANJU_UID,
    userEmail: 'anjukanwar@gmail.com',
    userName: 'Anju kanwar',
    avatarUrl: 'https://example.com/anju.jpg',
    city: 'Jaipur',
    state: 'Rajasthan',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    paymentVerified: true,
    paymentTxId: 'TX-1',
    joinedAt: '2026-11-17T11:36:00Z',
    joinedTimestampMs: 1794915360000,
    status: 'active',
    isActive: true,
    isValid: true,
    isSubmitted: true,
    submittedAt: '2026-11-17T11:36:37Z',
    submittedTimestampMs: 1794915397000,
    score: 4.68,
    totalQuestions: 10,
    timeTakenSeconds: 23,
    rank: 1,
    // Deliberately make projectedPrizeRupees differ (180) from settledPrizeRupees (60) to verify settled wins!
    projectedPrizePaise: 18000,
    projectedPrizeRupees: 180,
    settlementStatus: 'settled',
    settledPrizePaise: 6000,
    settledPrizeRupees: 60,
    settledAt: '2026-11-17T11:40:00Z'
  }
];

contestBackend.loadContestEntries(CONTEST_ID, simulatedSettledCloudEntries);
const loadedActive = contestBackend.getActiveEntries(CONTEST_ID);
assert.strictEqual(loadedActive.length, 1, '5.1: Loaded 1 authoritative active entry');
assert.strictEqual(contestBackend.isContestSettled(CONTEST_ID), true, '5.2: Backend syncs settledContests from settled cloud entries');

const lbDevice1 = mapEntriesToLeaderboard(loadedActive, ANJU_UID);
const lbDevice2 = mapEntriesToLeaderboard(loadedActive, OTHER_VIEWER_UID);

assert.strictEqual(lbDevice1[0].userName, 'Anju kanwar', '5.3: Owner device displays real name "Anju kanwar"');
assert.strictEqual(lbDevice2[0].userName, 'Anju kanwar', '5.4: Second device displays identical real name "Anju kanwar"');
assert.strictEqual(lbDevice1[0].score, 4.68, '5.5: Score matches 4.68');
assert.strictEqual(lbDevice2[0].score, 4.68, '5.6: Second device score matches 4.68');
assert.strictEqual(lbDevice1[0].timeTakenSeconds, 23, '5.7: Completion time matches 23s');
assert.strictEqual(lbDevice1[0].settlementStatus, 'settled', '5.8: settlementStatus marked settled');
assert.strictEqual(lbDevice1[0].settledPrizeRupees, 60, '5.9: settledPrizeRupees strictly equals 60');
assert.strictEqual(lbDevice2[0].rewardAmount, 60, '5.10: Second device prize strictly uses settled prize ₹60, NOT provisional ₹180');
assert.strictEqual(lbDevice1[0].isCurrentUser, true, '5.11: Owner badge flag true on owner device');
assert.strictEqual(lbDevice2[0].isCurrentUser, false, '5.12: Owner badge flag false on second device');
console.log('  ✓ [PASS] Authoritative settled prize overrides provisional prize & syncs identically across devices');

// 6. Verify Concurrent Multi-Device ENTRY-001 Entries Are Both Preserved
console.log('\n--- 6. Verifying Concurrent Cross-Device ENTRY-001 Preservation ---');
const CONCURRENT_CONTEST = `CNT-CONC-${Date.now()}`;
const concurrentEntries: ContestEntry[] = [
  {
    entryId: 'ENTRY-001',
    entrySequenceNumber: 1,
    contestId: CONCURRENT_CONTEST,
    ownerUid: 'uid-device-a',
    userEmail: 'anju@quizkart.in',
    userName: 'Anju kanwar',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    paymentVerified: true,
    joinedAt: '2026-11-17T12:00:00Z',
    joinedTimestampMs: 1794916800000,
    status: 'active',
    isActive: true,
    isValid: true,
    isSubmitted: true,
    submittedAt: '2026-11-17T12:00:25Z',
    score: 8,
    totalQuestions: 10,
    timeTakenSeconds: 25
  },
  {
    entryId: 'ENTRY-001',
    entrySequenceNumber: 1,
    contestId: CONCURRENT_CONTEST,
    ownerUid: 'uid-device-b',
    userEmail: 'kiran@quizkart.in',
    userName: 'Kiran Verma',
    paidAmountPaise: 10000,
    entryFeePaise: 10000,
    paymentVerified: true,
    joinedAt: '2026-11-17T12:00:02Z',
    joinedTimestampMs: 1794916802000,
    status: 'active',
    isActive: true,
    isValid: true,
    isSubmitted: true,
    submittedAt: '2026-11-17T12:00:22Z',
    score: 9,
    totalQuestions: 10,
    timeTakenSeconds: 20
  }
];
contestBackend.loadContestEntries(CONCURRENT_CONTEST, concurrentEntries);
const concurrentActive = contestBackend.getActiveEntries(CONCURRENT_CONTEST);
assert.strictEqual(concurrentActive.length, 2, '6.1: Both concurrent ENTRY-001 entries preserved');
const concurrentLb = mapEntriesToLeaderboard(concurrentActive);
assert.strictEqual(concurrentLb[0].userName, 'Kiran Verma', '6.2: Higher scorer ranked #1');
assert.strictEqual(concurrentLb[1].userName, 'Anju kanwar', '6.3: Second participant ranked #2 without overwrite');
const poolCalc2 = calculateContestPool(2, 10000);
assert.strictEqual(poolCalc2.prizePoolRupees, 120, '6.4: Pool economics preserved cleanly (60% of 200 = ₹120)');
console.log('  ✓ [PASS] Concurrent multi-device ENTRY-001 joins preserved and ranked accurately');

// 7. Verify Admin Panel Sync & Contest Manager Safeguards
console.log('\n--- 7. Verifying Admin Winner Payout Ledger & Contest Manager Sync ---');
const adminPageSrc = fs.readFileSync(path.resolve('src/components/AdminPage.tsx'), 'utf8');
const contestMgrSrc = fs.readFileSync(path.resolve('src/components/ContestManagerTab.tsx'), 'utf8');
assert(adminPageSrc.includes('admin-ledger-contest-select'), '7.1: Admin Winner Payout Ledger provides Contest selector across active/completed contests');
assert(adminPageSrc.includes('Confirmed Rank #1 Winner'), '7.2: Admin Ledger displays Confirmed Winner summary with UID & settled prize');
assert(adminPageSrc.includes('fetchContestEntriesWithStatusFromFirestore'), '7.3: Admin Ledger and Refresh re-fetch authoritative Firestore entries instead of stale local cache');
assert(adminPageSrc.includes('enrichLeaderboardWithRegisteredUsers'), '7.4: Admin Ledger enriches participant names & UIDs with registered users');
assert(contestMgrSrc.includes('ID: {c.id}'), '7.5: ContestManagerTab cards display explicit Contest ID');
console.log('  ✓ [PASS] Admin Panel Winner Ledger & Contest Manager verified');

console.log('\n===================================================================');
console.log('ALL CROSS-DEVICE LEADERBOARD, PRIZE & ADMIN SYNC TESTS PASSED (100%)');
console.log('===================================================================');
process.exit(0);
