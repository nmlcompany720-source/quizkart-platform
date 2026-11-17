import fs from 'fs';
import path from 'path';

// Polyfill localStorage for Node execution BEFORE testing storage-backed utilities
const memoryStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => (Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null),
  setItem: (key: string, value: string) => {
    memoryStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete memoryStore[key];
  },
  clear: () => {
    Object.keys(memoryStore).forEach(k => delete memoryStore[k]);
  },
};

import {
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_ACTIVE_CONTESTS,
  AUTOPILOT_ACTIVE_STORAGE_KEY,
  AUTOPILOT_MANUAL_OPT_IN_KEY,
  getAutoPilotSettings,
  getSavedContests,
  saveActiveContests,
} from '../src/utils/skillQuizAlgorithm';
import {
  TODAY_PRIZE,
  UPCOMING_PRIZES,
  INITIAL_POOL_ECONOMICS,
} from '../src/data/quizData';
import type { ActiveContest } from '../src/types';

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
}

function runTests() {
  console.log('======================================================================');
  console.log('QUIZKART — NO FAKE/AUTO-GENERATED TOURNAMENTS & SYNC VERIFICATION');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
      process.exitCode = 1;
    }
  }

  const firebaseSrc = readProjectFile('src/firebase.ts');
  const appSrc = readProjectFile('src/App.tsx');
  const managerSrc = readProjectFile('src/components/ContestManagerTab.tsx');
  const heroSrc = readProjectFile('src/components/HeroSection.tsx');
  const arenaSrc = readProjectFile('src/components/QuizArena.tsx');
  const typesSrc = readProjectFile('src/types.ts');

  // ------------------------------------------------------------------
  // TEST 1: Initial / Clean State & Auto-Pilot Opt-In Guard
  // ------------------------------------------------------------------
  console.log('--- TEST 1: Zero Auto-Generated Fake/Demo Tournaments on Boot ---');
  (globalThis as any).localStorage.clear();

  assert(
    DEFAULT_ACTIVE_CONTESTS.length === 0,
    'DEFAULT_ACTIVE_CONTESTS starts strictly empty ([])'
  );
  assert(
    DEFAULT_AUTO_PILOT_SETTINGS.isEnabled === false,
    'DEFAULT_AUTO_PILOT_SETTINGS.isEnabled is strictly false by default'
  );
  assert(
    DEFAULT_AUTO_PILOT_SETTINGS.productItemTitle === '' &&
      DEFAULT_AUTO_PILOT_SETTINGS.cashPrizePool === 0 &&
      DEFAULT_AUTO_PILOT_SETTINGS.entryFee === 0,
    'DEFAULT_AUTO_PILOT_SETTINGS contains zero hardcoded Noise ColorFit or demo prize amounts'
  );

  // Even if legacy localStorage has quizkart_autopilot_active='true', without manual opt-in Auto-Pilot MUST stay disabled
  localStorage.setItem(AUTOPILOT_ACTIVE_STORAGE_KEY, 'true');
  localStorage.setItem(
    'quizkart_autopilot_settings',
    JSON.stringify({ isEnabled: true, productItemTitle: 'Noise ColorFit Ultra 3', cashPrizePool: 5000 })
  );
  const autoPilotWithoutOptIn = getAutoPilotSettings();
  assert(
    autoPilotWithoutOptIn.isEnabled === false,
    'Legacy localStorage auto-pilot flag cannot activate Auto-Pilot without explicit Admin opt-in'
  );

  localStorage.setItem(AUTOPILOT_MANUAL_OPT_IN_KEY, 'true');
  const autoPilotWithOptIn = getAutoPilotSettings();
  assert(
    autoPilotWithOptIn.isEnabled === true,
    'Auto-Pilot activates only when both active flag and explicit manual opt-in key are set'
  );

  assert(
    !managerSrc.includes('executeContestGeneration(true)') &&
      managerSrc.includes('Automatic demo tournament generation is disabled') &&
      !managerSrc.includes('setInterval(() => {\n        executeContestGeneration'),
    'ContestManagerTab disables executeContestGeneration and has no background auto-generation interval'
  );

  // ------------------------------------------------------------------
  // TEST 2: Permanent Delete & Anti-Resurrection Filtering
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Permanent Delete & Zero LocalStorage Resurrection ---');
  (globalThis as any).localStorage.clear();

  const syntheticAndDeletedContests: ActiveContest[] = [
    {
      id: 'CNT-CASH-LIVE',
      title: 'Fake Live Cash',
      type: 'cash',
      status: 'active',
      entryFee: 10,
      maxParticipants: 100,
      questionIds: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CNT-FALLBACK-PLACEHOLDER',
      title: 'Fake Fallback',
      type: 'product',
      status: 'active',
      entryFee: 10,
      maxParticipants: 100,
      questionIds: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CNT-SOFT-DEL-1',
      title: 'Deleted Contest',
      type: 'cash',
      status: 'active',
      entryFee: 20,
      maxParticipants: 50,
      questionIds: [],
      createdAt: new Date().toISOString(),
      isDeleted: true,
    },
    {
      id: 'CNT-LOCAL-DEL-2',
      title: 'Spacial sunday',
      type: 'cash',
      status: 'active',
      entryFee: 10,
      maxParticipants: 50,
      questionIds: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CNT-REAL-1',
      title: 'Admin Created Real Quiz',
      type: 'cash',
      status: 'active',
      entryFee: 50,
      maxParticipants: 100,
      questionIds: [],
      createdAt: new Date().toISOString(),
    },
  ];
  localStorage.setItem('quizkart_deleted_contests', JSON.stringify(['CNT-LOCAL-DEL-2']));
  saveActiveContests(syntheticAndDeletedContests);
  const filteredSaved = getSavedContests();

  assert(
    filteredSaved.length === 1 && filteredSaved[0].id === 'CNT-REAL-1',
    'saveActiveContests/getSavedContests strips synthetic IDs, isDeleted docs, and locally deleted IDs'
  );
  assert(
    typesSrc.includes('isDeleted?: boolean') && typesSrc.includes('deletedAt?: string'),
    'ActiveContest type includes isDeleted and deletedAt fields'
  );
  assert(
    firebaseSrc.includes('export async function removeContestFromFirestore(contestId: string): Promise<boolean>') &&
      firebaseSrc.includes('await Promise.race([deletePromise, timeoutPromise])') &&
      firebaseSrc.includes('contest.isDeleted === true'),
    'removeContestFromFirestore awaits authoritative Firestore delete and saveContestToFirestore skips isDeleted contests'
  );
  assert(
    managerSrc.includes('const handleDeleteContest = async (id: string)') &&
      managerSrc.includes('await onDeleteContest(id)') &&
      !managerSrc.includes('prize-fallback') &&
      !managerSrc.includes('NEXT MEGA ROUND COMING SOON'),
    'ContestManagerTab awaits deletion and resets empty state without fake prize-fallback or NEXT MEGA ROUND COMING SOON'
  );

  // ------------------------------------------------------------------
  // TEST 3: Creating ONE Tournament Saves ONLY That Tournament
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Single Tournament Creation Isolation ---');
  assert(
    managerSrc.includes('const updateContestList = (newList: ActiveContest[], contestsToSync: ActiveContest[] = [])') &&
      managerSrc.includes('contestsToSync') &&
      managerSrc.includes('.forEach(c => {\n        saveContestToFirestore(c)') &&
      !managerSrc.includes('filteredList.forEach(c => saveContestToFirestore'),
    'updateContestList only writes explicitly passed contestsToSync to Firestore (never re-uploads entire array)'
  );
  assert(
    managerSrc.includes('autoPilotRecurring: false'),
    'Manually created cash/product contests explicitly set autoPilotRecurring: false'
  );
  assert(
    !managerSrc.includes('[activeContest, ...contests]'),
    'ContestManagerTab no longer re-injects stale activeContest prop into contests list'
  );

  // ------------------------------------------------------------------
  // TEST 4: User Website Neutral Empty State When 0 Contests Exist
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Clean Empty State on User Website (0 Fake Prizes/Users) ---');
  assert(
    TODAY_PRIZE.id === '' &&
      TODAY_PRIZE.title === '' &&
      TODAY_PRIZE.mrp === 0 &&
      TODAY_PRIZE.retailValue === 0,
    'TODAY_PRIZE is completely empty/zeroed (no fake Noise ColorFit or ₹4999 fallback)'
  );
  assert(
    UPCOMING_PRIZES.length === 0,
    'UPCOMING_PRIZES is strictly empty ([])'
  );
  assert(
    INITIAL_POOL_ECONOMICS.entryFee === 0 &&
      INITIAL_POOL_ECONOMICS.activeParticipants === 0 &&
      INITIAL_POOL_ECONOMICS.targetParticipants === 0 &&
      INITIAL_POOL_ECONOMICS.totalPoolAmount === 0,
    'INITIAL_POOL_ECONOMICS has zeroed entryFee, activeParticipants, targetParticipants, and totalPoolAmount'
  );
  assert(
    heroSrc.includes('const hasRealActiveContest = Boolean(effectiveContest);') &&
      !heroSrc.includes('boostedParticipants') &&
      heroSrc.includes("hasRealActiveContest ? `₹${currentEntryFee}` : '—'") &&
      heroSrc.includes("No Upcoming Tournaments Scheduled"),
    'HeroSection gates all metrics/entry fees on hasRealActiveContest and removes boostedParticipants fake count'
  );
  assert(
    !arenaSrc.includes('Noise ColorFit Pro 5 AMOLED Smartwatch') &&
      !arenaSrc.includes('activeParticipants: 68'),
    'QuizArena fallback contains no hardcoded Noise ColorFit smartwatch or fake 68 active participants'
  );

  // ------------------------------------------------------------------
  // TEST 5 & 6: Authoritative Firestore Load + Real-Time Sync Across Devices
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5 & 6: Authoritative Firestore Sync & Cross-Device Consistency ---');
  assert(
    firebaseSrc.includes('export async function fetchContestsFromFirestoreAuthoritative()') &&
      firebaseSrc.includes('export function subscribeToContestsFromFirestore(') &&
      firebaseSrc.includes('data.isDeleted !== true'),
    'firebase.ts exports authoritative contest fetch and real-time onSnapshot listener filtering out isDeleted docs'
  );
  assert(
    appSrc.includes('fetchContestsFromFirestoreAuthoritative()') &&
      appSrc.includes('subscribeToContestsFromFirestore(') &&
      appSrc.includes('deletingContestIdsRef') &&
      appSrc.includes('recentlySavedContestsRef'),
    'App.tsx subscribes to real-time Firestore contests with deletingContestIdsRef & recentlySavedContestsRef guards'
  );
  assert(
    !appSrc.includes('if (cloudContests && cloudContests.length > 0)') &&
      appSrc.includes('if (active && res.ok)'),
    'App.tsx applies empty authoritative Firestore snapshots (0 contests) without skipping or resurrecting deleted cache'
  );

  // ------------------------------------------------------------------
  // TEST 7: Admin Panel Empty State & Zero Regression Guard
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: Admin Empty State & Zero Regression Checks ---');
  assert(
    managerSrc.includes('Active Contests') &&
      managerSrc.includes('({contests.length})') &&
      managerSrc.includes('No Active Contests'),
    'Admin Panel Active Contests card displays clean empty state when 0 contests exist'
  );

  console.log('\n======================================================================');
  console.log(`FINAL RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('======================================================================');
}

runTests();
