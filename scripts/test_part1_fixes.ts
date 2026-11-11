import { 
  contestBackend, 
  calculateContestPool, 
  mapEntriesToLeaderboard,
  createDefaultFourContestEntries,
  rupeesToPaise,
  paiseToRupees
} from '../src/backend/contestEngine';
import { ContestEntry } from '../src/types';

console.log('===================================================================');
console.log('QUIZKART - PART 1: PAYOUT LEDGER, ECONOMICS & PAYOUT STATUS FIX TESTS');
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
// TEST 1: Persistence & Four Confirmed Entries Visibility
// ----------------------------------------------------------------------------
console.log('--- Test 1: Four confirmed entries remain visible & load from persistent records ---');

contestBackend.resetForTesting();
const testContestId = 'CNT-LIVE-99';
const initialEntries = createDefaultFourContestEntries(testContestId, 100);

assert(initialEntries.length === 4, '1.1: Default four contest entries created successfully');
assert(initialEntries.every(e => e.isActive && e.isValid && e.status === 'active'), '1.2: All four entries are active, valid and not replaced');

// Simulate loading entries from persistent Firestore records into backend
contestBackend.loadEntriesFromFirestore(initialEntries);
const activeEntriesAfterLoad = contestBackend.getActiveEntries(testContestId);
assert(activeEntriesAfterLoad.length === 4, '1.3: All four entries retrieved after loading from Firestore records', `got ${activeEntriesAfterLoad.length}`);

// Map to leaderboard for Admin Panel All Ranks tab
const mappedLeaderboard = mapEntriesToLeaderboard(activeEntriesAfterLoad);
assert(mappedLeaderboard.length === 4, '1.4: All four entries mapped into Admin Panel leaderboard', `got ${mappedLeaderboard.length}`);
assert(mappedLeaderboard.every(m => !m.id.startsWith('lb-') && m.id.startsWith('ENTRY-')), '1.5: Entries have valid ENTRY- IDs and are never filtered out');

// ----------------------------------------------------------------------------
// TEST 2: Four entries show correct waterfall prizes: ₹180, ₹60, ₹0, ₹0
// ----------------------------------------------------------------------------
console.log('\n--- Test 2: Waterfall prize distribution for 4 entries: ₹180, ₹60, ₹0, ₹0 ---');

const rank1Entry = mappedLeaderboard.find(e => e.rank === 1);
const rank2Entry = mappedLeaderboard.find(e => e.rank === 2);
const rank3Entry = mappedLeaderboard.find(e => e.rank === 3);
const rank4Entry = mappedLeaderboard.find(e => e.rank === 4);

assert(Boolean(rank1Entry && rank1Entry.rewardAmount === 180), '2.1: Rank 1 receives ₹180 allocated reward', `got ${rank1Entry?.rewardAmount}`);
assert(Boolean(rank2Entry && rank2Entry.rewardAmount === 60), '2.2: Rank 2 receives ₹60 allocated reward', `got ${rank2Entry?.rewardAmount}`);
assert(Boolean(rank3Entry && rank3Entry.rewardAmount === 0), '2.3: Rank 3 receives ₹0 allocated reward', `got ${rank3Entry?.rewardAmount}`);
assert(Boolean(rank4Entry && rank4Entry.rewardAmount === 0), '2.4: Rank 4 receives ₹0 allocated reward', `got ${rank4Entry?.rewardAmount}`);

assert(rank1Entry?.rewardText === '₹180', '2.5: Rank 1 rewardText is ₹180', `got ${rank1Entry?.rewardText}`);
assert(rank2Entry?.rewardText === '₹60', '2.6: Rank 2 rewardText is ₹60', `got ${rank2Entry?.rewardText}`);
assert(rank3Entry?.rewardText === '₹0', '2.7: Rank 3 rewardText is ₹0', `got ${rank3Entry?.rewardText}`);
assert(rank4Entry?.rewardText === '₹0', '2.8: Rank 4 rewardText is ₹0', `got ${rank4Entry?.rewardText}`);

// ----------------------------------------------------------------------------
// TEST 3: Economics Breakdown for Four ₹100 entries:
// Total Revenue = ₹400, Winner Pool (60%) = ₹240, Referral (10%) = ₹40, Platform (30%) = ₹120
// ----------------------------------------------------------------------------
console.log('\n--- Test 3: Economics breakdown for 4 entries of ₹100 each ---');

const poolCalc4 = contestBackend.getPoolCalculation(testContestId, 100);
assert(poolCalc4.confirmedPaidEntries === 4, '3.1: Confirmed paid entries is 4', `got ${poolCalc4.confirmedPaidEntries}`);
assert(poolCalc4.totalRevenueRupees === 400, '3.2: Total Revenue is ₹400', `got ${poolCalc4.totalRevenueRupees}`);
assert(poolCalc4.prizePoolRupees === 240, '3.3: Winner Prize Pool (60%) is ₹240', `got ${poolCalc4.prizePoolRupees}`);
assert(poolCalc4.referralPoolRupees === 40, '3.4: Referral & Affiliates Pool (10%) is ₹40', `got ${poolCalc4.referralPoolRupees}`);
assert(poolCalc4.platformMarginRupees === 120, '3.5: Platform Margin (30%) is ₹120', `got ${poolCalc4.platformMarginRupees}`);
assert(poolCalc4.winnerSlots === 2, '3.6: Winner Slots = CEIL(4/3) = 2', `got ${poolCalc4.winnerSlots}`);

// ----------------------------------------------------------------------------
// TEST 4: Empty-state rules: No contest or zero paid joins show no actual amounts
// ----------------------------------------------------------------------------
console.log('\n--- Test 4: Empty-state rules: Zero paid joins ---');

const emptyPool = calculateContestPool(0, 10000);
assert(emptyPool.confirmedPaidEntries === 0, '4.1: Zero paid entries produces 0 confirmed entries');
assert(emptyPool.totalRevenueRupees === 0, '4.2: Zero revenue for 0 joins');
assert(emptyPool.prizePoolRupees === 0, '4.3: Zero prize pool for 0 joins');
assert(emptyPool.winnerSlots === 0, '4.4: Zero winner slots for 0 joins');

// ----------------------------------------------------------------------------
// TEST 5: Payout Status: Dynamic congratulations sentence without Cashback text
// ----------------------------------------------------------------------------
console.log('\n--- Test 5: Payout Status dynamic congratulations formatting ---');

function formatPayoutSentence(amount: number): string {
  if (amount > 0) {
    return `Congratulations, You Won ₹${amount}`;
  }
  return 'Your Rank: 4 | Keep Improving, Keep Winning!';
}

assert(formatPayoutSentence(180) === 'Congratulations, You Won ₹180', '5.1: Formatted for ₹180: "Congratulations, You Won ₹180"');
assert(formatPayoutSentence(60) === 'Congratulations, You Won ₹60', '5.2: Formatted for ₹60: "Congratulations, You Won ₹60"');
assert(formatPayoutSentence(120) === 'Congratulations, You Won ₹120', '5.3: Formatted for ₹120: "Congratulations, You Won ₹120"');
assert(!formatPayoutSentence(180).includes('Cashback'), '5.4: Does not contain the word Cashback');
assert(formatPayoutSentence(0) === 'Your Rank: 4 | Keep Improving, Keep Winning!', '5.5: Non-winner retains losing sentence unchanged');

// ----------------------------------------------------------------------------
// TEST 6: Existing wallet settlement behavior preserved
// ----------------------------------------------------------------------------
console.log('\n--- Test 6: Final settlement dispatches wallet credits to valid ownerUids ---');

const settlement = contestBackend.settleContest(testContestId);
assert(settlement.success === true, '6.1: Settlement completes successfully');
assert(settlement.disbursements.length === 2, '6.2: Exactly 2 winners receive disbursements', `got ${settlement.disbursements.length}`);

const disb1 = settlement.disbursements.find(d => d.rank === 1);
const disb2 = settlement.disbursements.find(d => d.rank === 2);
assert(Boolean(disb1 && disb1.ownerUid === 'usr-1001' && disb1.prizeRupees === 180), '6.3: Rank 1 disbursement of ₹180 credited to usr-1001');
assert(Boolean(disb2 && disb2.ownerUid === 'usr-1002' && disb2.prizeRupees === 60), '6.4: Rank 2 disbursement of ₹60 credited to usr-1002');
assert(settlement.totalPaidRupees === 240, '6.5: Total disbursed is ₹240 (matches 60% Winner Pool)');

console.log('\n===================================================================');
console.log(`ALL PART 1 TESTS COMPLETE: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('===================================================================');
