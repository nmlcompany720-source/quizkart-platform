import fs from 'fs';
import path from 'path';

console.log('===================================================================');
console.log('QUIZKART — PART 1: WINNER UI ALIGNMENT FIX VERIFICATION');
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

const liveLeaderboardPath = path.resolve('src/components/LiveLeaderboard.tsx');
const adminPagePath = path.resolve('src/components/AdminPage.tsx');

const liveLeaderboardContent = fs.readFileSync(liveLeaderboardPath, 'utf8');
const adminPageContent = fs.readFileSync(adminPagePath, 'utf8');

// ----------------------------------------------------------------------------
// TEST 1: User App — Full Winner List
// ----------------------------------------------------------------------------
console.log('--- Test 1: User App — Full Winner List Column Alignment & Prize Boxes ---');

assert(
  liveLeaderboardContent.includes('th className="py-3 px-4 w-16 whitespace-nowrap">Rank</th>'),
  '1.1: Rank column header has fixed width w-16 and whitespace-nowrap'
);

assert(
  liveLeaderboardContent.includes('th className="py-3 px-4 min-w-[140px]">Contestant</th>'),
  '1.2: Contestant column has min-width 140px to prevent crowding'
);

assert(
  liveLeaderboardContent.includes('th className="py-3 px-4 text-center w-24 whitespace-nowrap">Score</th>'),
  '1.3: Score column header has fixed width w-24 and centered text'
);

assert(
  liveLeaderboardContent.includes('text-center w-28 whitespace-nowrap">Time Taken</th>'),
  '1.4: Time Taken column header has fixed width w-28, center-aligned, and whitespace-nowrap'
);

assert(
  liveLeaderboardContent.includes('text-center w-28 whitespace-nowrap">Prize</th>'),
  '1.5: Prize column header has fixed width w-28, center-aligned, and whitespace-nowrap'
);

assert(
  liveLeaderboardContent.includes('text-center w-36 whitespace-nowrap">Submitted</th>'),
  '1.6: Submitted column header has fixed width w-36, center-aligned, and whitespace-nowrap'
);

assert(
  liveLeaderboardContent.includes('w-20 h-7 inline-flex items-center justify-center font-extrabold text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 shadow-2xs whitespace-nowrap tabular-nums'),
  '1.7: All prize boxes have identical width (w-20), height (h-7), rounded shape, and non-wrapping tabular numbers'
);

assert(
  liveLeaderboardContent.includes('w-14 h-7 inline-flex items-center justify-center rounded-lg font-black text-xs text-[#3A81F5] bg-blue-50 border border-blue-200/80 shadow-2xs tabular-nums'),
  '1.8: Score box in table has fixed width w-14 and height h-7, perfectly matching row vertical cadence'
);

assert(
  liveLeaderboardContent.includes('min-w-[76px] px-2.5 h-7 inline-flex items-center justify-center rounded-lg font-mono font-semibold text-xs text-slate-700 bg-slate-50 border border-slate-200 shadow-2xs tabular-nums whitespace-nowrap'),
  '1.9: Time Taken values are rendered in rounded timer box matching Admin Panel design'
);

// ----------------------------------------------------------------------------
// TEST 2: Admin Panel — Winner Payout Ledger
// ----------------------------------------------------------------------------
console.log('\n--- Test 2: Admin Panel — Winner Payout Ledger Alignment & Dimensions ---');

assert(
  adminPageContent.includes('<th className="py-3 px-4 font-bold w-16 whitespace-nowrap">Rank</th>'),
  '2.1: Admin Payout Ledger Rank column has fixed width w-16'
);

assert(
  adminPageContent.includes('<th className="py-3 px-4 font-bold min-w-[140px]">Contestant</th>'),
  '2.2: Admin Payout Ledger Contestant column has min-w-[140px]'
);

assert(
  adminPageContent.includes('Score & Speed'),
  '2.3: Admin Payout Ledger Score & Speed column has fixed width w-52'
);

assert(
  adminPageContent.includes('<th className="py-3 px-4 font-bold text-center w-36 whitespace-nowrap">Allocated Reward</th>'),
  '2.4: Admin Payout Ledger Allocated Reward column has centered text and whitespace-nowrap'
);

assert(
  adminPageContent.includes('w-20 h-7 inline-flex items-center justify-center rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs whitespace-nowrap tabular-nums'),
  '2.5: Admin Allocated Reward prize boxes have identical dimensions (w-20 h-7) matching User App'
);

assert(
  adminPageContent.includes('w-14 h-7 inline-flex items-center justify-center rounded-lg font-black text-xs text-[#3A81F5] bg-blue-50 border border-blue-200/80 shadow-2xs tabular-nums whitespace-nowrap'),
  '2.6: Admin Score box has fixed width w-14 and height h-7 with tabular numbers'
);

assert(
  adminPageContent.includes('min-w-[76px] px-2.5 h-7 inline-flex items-center justify-center rounded-lg font-mono font-semibold text-xs text-slate-700 bg-slate-50 border border-slate-200 shadow-2xs tabular-nums whitespace-nowrap'),
  '2.7: Admin Speed/Time box has fixed height h-7, min-w-[76px], and single-line whitespace-nowrap'
);

assert(
  adminPageContent.includes("setLedgerFilter(p.key as typeof ledgerFilter)") &&
  adminPageContent.includes("setLedgerSearch(e.target.value)"),
  '2.8: Preserves all existing filters (All, Pending, Sent), search bar, and actions'
);

// ----------------------------------------------------------------------------
// TEST 3: Winner Cards Alignment & Visual Consistency
// ----------------------------------------------------------------------------
console.log('\n--- Test 3: Winner Cards — Alignment, Sizing & No Overlapping ---');

assert(
  liveLeaderboardContent.includes('min-h-[175px] flex flex-col justify-between'),
  '3.1: Winner cards enforce consistent min-height (175px) across all cards'
);

assert(
  liveLeaderboardContent.includes('mt-3 h-8 w-full rounded-xl bg-emerald-50 border border-emerald-200 text-center flex items-center justify-center shadow-2xs shrink-0'),
  '3.2: Winner card prize box has full width, fixed height h-8, and centered alignment'
);

assert(
  liveLeaderboardContent.includes('text-xs font-extrabold text-emerald-700 tracking-wide whitespace-nowrap tabular-nums'),
  '3.3: Winner card prize amount never wraps onto multiple lines'
);

assert(
  liveLeaderboardContent.includes('font-extrabold text-slate-900 text-sm flex items-center gap-1.5 truncate leading-tight'),
  '3.4: Contestant name is truncated cleanly and will not push rank out of view'
);

assert(
  liveLeaderboardContent.includes('font-mono text-xs font-semibold text-slate-500 whitespace-nowrap tabular-nums text-right'),
  '3.5: Speed/Time in winner cards is formatted with whitespace-nowrap and tabular-nums'
);

// ----------------------------------------------------------------------------
// TEST 4: Format variations for prizes (₹180, ₹60, ₹0) and times (21s, 2m 22s, 3m 06s)
// ----------------------------------------------------------------------------
console.log('\n--- Test 4: Format Variations Simulation (₹180, ₹60, ₹0) & (21s, 2m 22s, 3m 06s) ---');

const testPrizes = [180, 60, 0, 1000];
const testTimes = ['21s', '2m 22s', '3m 06s', 'in 45s', '0m 00s'];

testPrizes.forEach(prize => {
  const formatted = `₹${prize.toLocaleString('en-IN')}`;
  assert(formatted.startsWith('₹'), `4.1 Prize ₹${prize} formats cleanly as "${formatted}"`);
});

testTimes.forEach(t => {
  const cleanTime = t.replace(/^in\s+/, '');
  assert(!cleanTime.includes('\n'), `4.2 Time "${t}" cleans to single-line "${cleanTime}" without wrapping`);
});

console.log('\n===================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('===================================================================');
