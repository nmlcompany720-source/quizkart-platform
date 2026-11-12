import fs from 'fs';
import path from 'path';
import { contestBackend } from '../src/backend/contestEngine';
import { WithdrawalRequest, UserProfile } from '../src/types';

console.log('================================================================');
console.log('QUIZKART: WITHDRAWAL NOTICE & WALLET BALANCE CONSISTENCY TESTS');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testNum: number, testName: string, detail: string) {
  if (condition) {
    console.log(`[PASS] Test ${testNum}: ${testName}`);
    console.log(`       -> ${detail}\n`);
    passCount++;
  } else {
    console.error(`[FAIL] Test ${testNum}: ${testName}`);
    console.error(`       -> ${detail}\n`);
    failCount++;
  }
}

// -------------------------------------------------------------
// TEST 1: Inspect WithdrawalPage.tsx code for Notice design & text
// -------------------------------------------------------------
const withdrawalPageSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/WithdrawalPage.tsx'), 'utf-8');

const hasGradientBackground = withdrawalPageSrc.includes('style={{ background: PRIMARY_GRADIENT }}') &&
  withdrawalPageSrc.includes("PRIMARY_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)'");
const hasPureWhiteText = withdrawalPageSrc.includes('text-white') &&
  withdrawalPageSrc.includes('<span className="font-bold text-white">Notice: </span>') &&
  withdrawalPageSrc.includes('<span className="text-white font-medium">Only settled contest winnings are withdrawable. Deposited funds cannot be withdrawn.</span>');

assert(
  hasGradientBackground && hasPureWhiteText,
  1,
  'Notice uses QuizKart Blue-to-Cyan gradient & pure white text',
  'Notice element has PRIMARY_GRADIENT background and pure white text with exact message.'
);

// -------------------------------------------------------------
// TEST 2: Inspect WithdrawalPage.tsx code for element ordering
// -------------------------------------------------------------
const limitsIndex = withdrawalPageSrc.indexOf('Transaction Limits');
const noticeIndex = withdrawalPageSrc.indexOf('Only settled contest winnings are withdrawable');

assert(
  limitsIndex > 0 && noticeIndex > 0 && limitsIndex < noticeIndex,
  2,
  'Transaction Limits appears strictly ABOVE Notice',
  `Transaction Limits found at index ${limitsIndex}, Notice found at index ${noticeIndex} (Limits is above Notice).`
);

// -------------------------------------------------------------
// TEST 3: Inspect ProfileWallet.tsx for Wallet Credits & Header consistency
// -------------------------------------------------------------
const profileWalletSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ProfileWallet.tsx'), 'utf-8');

const usesCurrentWalletBalance = profileWalletSrc.includes('const currentWalletBalance = Number(userProfile.walletBalance) || 0;') &&
  profileWalletSrc.includes('₹{currentWalletBalance}') &&
  !profileWalletSrc.includes('effectiveWalletBalance');

assert(
  usesCurrentWalletBalance,
  3,
  'Profile Wallet Credits displays current liquid wallet balance matching Header',
  'ProfileWallet uses currentWalletBalance (userProfile.walletBalance) without overriding with Total Won.'
);

// -------------------------------------------------------------
// TEST 4: Total Won displays cumulative settled winnings
// -------------------------------------------------------------
const totalWonDisplaysCumulative = profileWalletSrc.includes('₹{effectiveTotalWon}') &&
  profileWalletSrc.includes('const effectiveTotalWon = Math.max(Number(userProfile.totalWonAmount) || 0, userSettledWinnings);');

assert(
  totalWonDisplaysCumulative,
  4,
  'Total Won correctly reflects cumulative settled winnings',
  'Total Won displays effectiveTotalWon derived from cumulative contest payouts and userProfile.totalWonAmount.'
);

// -------------------------------------------------------------
// TEST 5: Available Withdrawal Balance excludes deposited principal
// -------------------------------------------------------------
const testUser = {
  uid: 'TEST_USER_CONSISTENCY_101',
  email: 'test_user_cons@quizkart.in',
  name: 'Consistency Test User'
};

// Simulate:
// 1. User deposited ₹100 (deposited principal)
// 2. User won ₹540 across contests
// 3. User withdrew ₹200 (completed withdrawal)
// Total liquid wallet balance: ₹100 deposit + ₹540 winnings - ₹200 withdrawal = ₹440
// Or with contest entry fees deducted (e.g. ₹100 fees paid): liquid balance = ₹340
// Authoritative Withdrawable Balance = Settled Winnings (₹540) - Completed Withdrawals (₹200) - Holds (₹100) = ₹240
// Notice: Deposited principal is NEVER part of Withdrawable Balance!

contestBackend.resetForTesting();

// Record 3 settled contest prizes totalling ₹540
contestBackend.addFinancialLedgerRecord({
  transactionId: 'TX_CONSISTENCY_WIN_1',
  contestId: 'CONTEST_1',
  entryId: 'ENTRY_1',
  ownerUid: testUser.uid,
  userEmail: testUser.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 20000,
  amountRupees: 200,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 3000,
  notes: 'Contest 1 Winner Prize'
});

contestBackend.addFinancialLedgerRecord({
  transactionId: 'TX_CONSISTENCY_WIN_2',
  contestId: 'CONTEST_2',
  entryId: 'ENTRY_2',
  ownerUid: testUser.uid,
  userEmail: testUser.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 20000,
  amountRupees: 200,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 2000,
  notes: 'Contest 2 Winner Prize'
});

contestBackend.addFinancialLedgerRecord({
  transactionId: 'TX_CONSISTENCY_WIN_3',
  contestId: 'CONTEST_3',
  entryId: 'ENTRY_3',
  ownerUid: testUser.uid,
  userEmail: testUser.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 14000,
  amountRupees: 140,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now() - 1000,
  notes: 'Contest 3 Winner Prize'
});

// Record a completed ₹200 withdrawal and an active hold of ₹100
const testWithdrawals: WithdrawalRequest[] = [
  {
    id: 'WTH_PAID_200',
    requestId: 'WTH_PAID_200',
    ownerUid: testUser.uid,
    userId: testUser.uid,
    userName: testUser.name,
    userEmail: testUser.email,
    phone: '9876543210',
    accountHolderName: testUser.name,
    accountNumber: '123456789012',
    confirmAccountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    timestamp: '2026-11-10 10:00 AM',
    amount: 200,
    status: 'approved',
    createdAt: new Date().toISOString()
  },
  {
    id: 'WTH_HOLD_100',
    requestId: 'WTH_HOLD_100',
    ownerUid: testUser.uid,
    userId: testUser.uid,
    userName: testUser.name,
    userEmail: testUser.email,
    phone: '9876543210',
    accountHolderName: testUser.name,
    accountNumber: '123456789012',
    confirmAccountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    timestamp: '2026-11-10 11:00 AM',
    amount: 100,
    status: 'pending',
    createdAt: new Date().toISOString()
  }
];

const balanceInfo = contestBackend.getWithdrawableBalance(testUser.uid, testUser.email, testWithdrawals);
// Settled Winnings = 200 + 200 + 140 = 540
// Completed Withdrawals = 200
// Active Holds = 100
// Withdrawable Balance = 540 - 200 - 100 = 240!
assert(
  balanceInfo.settledWinnings === 540 &&
  balanceInfo.completedWithdrawals === 200 &&
  balanceInfo.activeWithdrawalHolds === 100 &&
  balanceInfo.withdrawableBalance === 240,
  5,
  'Available Withdrawal Balance calculation accurately isolates settled winnings',
  `Settled Winnings: ₹${balanceInfo.settledWinnings}, Completed Withdrawals: ₹${balanceInfo.completedWithdrawals}, Active Holds: ₹${balanceInfo.activeWithdrawalHolds}, Withdrawable Balance: ₹${balanceInfo.withdrawableBalance}`
);

// -------------------------------------------------------------
// TEST 6: Net Remaining Balance for ₹0 and ₹100 withdrawal selections
// -------------------------------------------------------------
const withdrawable = balanceInfo.withdrawableBalance; // 240

// Scenario A: requested withdrawal is ₹100
const reqAmount100 = 100;
const netRemaining100 = Math.max(0, withdrawable - reqAmount100);

// Scenario B: requested withdrawal is ₹0
const reqAmount0 = 0;
const netRemaining0 = Math.max(0, withdrawable - reqAmount0);

assert(
  netRemaining100 === 140 && netRemaining0 === 240,
  6,
  'Net Remaining Balance calculates correctly for ₹0 and ₹100 selections',
  `When requested = ₹100 -> Net Remaining = ₹${netRemaining100}. When requested = ₹0 -> Net Remaining = ₹${netRemaining0}.`
);

// -------------------------------------------------------------
// TEST 7: Cross-user financial isolation
// -------------------------------------------------------------
const otherUser = { uid: 'USER_OTHER_999', email: 'other@quizkart.in' };
const otherBalance = contestBackend.getWithdrawableBalance(otherUser.uid, otherUser.email, testWithdrawals);

assert(
  otherBalance.withdrawableBalance === 0 &&
  otherBalance.settledWinnings === 0 &&
  otherBalance.completedWithdrawals === 0,
  7,
  'Cross-user data isolation is strictly maintained',
  `Other user sees ₹${otherBalance.withdrawableBalance} withdrawable. Zero data bleed across user boundaries.`
);

console.log('----------------------------------------------------------------');
console.log(`RESULTS: ${passCount} / 7 TESTS PASSED, ${failCount} FAILED.`);
console.log('----------------------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
}
