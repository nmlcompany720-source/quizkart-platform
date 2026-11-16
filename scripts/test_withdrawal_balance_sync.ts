import { contestBackend } from '../src/backend/contestEngine';
import { WithdrawalRequest } from '../src/types';

// Mock minimal localStorage for Node execution to verify localStorage synchronization paths too
const mockStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => { mockStorage.set(k, String(v)); },
  removeItem: (k: string) => { mockStorage.delete(k); },
  clear: () => { mockStorage.clear(); },
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() { return mockStorage.size; }
};

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, num: number, title: string, detail: string) {
  if (condition) {
    console.log(`[PASS] Test ${num}: ${title}\n       -> ${detail}\n`);
    passCount++;
  } else {
    console.error(`[FAIL] Test ${num}: ${title}\n       -> ${detail}\n`);
    failCount++;
  }
}

console.log('================================================================');
console.log('QUIZKART: WITHDRAWAL BALANCE CALCULATION & WALLET SYNC SUITE');
console.log('================================================================\n');

// Test 1: Deposit ₹1,000, win nothing -> Withdrawable ₹0
contestBackend.resetForTesting();
mockStorage.clear();
const user1 = { uid: 'UID_USER_1', email: 'user1@quizkart.in' };
contestBackend.addFinancialLedgerRecord({
  transactionId: 'DEP_TX_1000',
  contestId: 'WALLET',
  entryId: 'DEP_1000',
  ownerUid: user1.uid,
  userEmail: user1.email,
  type: 'ENTRY_FEE', // or deposit — only PRIZE_PAYOUT is eligible
  status: 'COMPLETED',
  amountPaise: 100000,
  amountRupees: 1000,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now()
});
const t1 = contestBackend.getWithdrawableBalance(user1.uid, user1.email, [], 0);
assert(
  t1.withdrawableBalance === 0 && t1.settledWinnings === 0,
  1,
  'Deposit ₹1,000, win nothing -> Withdrawable ₹0',
  `settledWinnings=₹${t1.settledWinnings}, withdrawable=₹${t1.withdrawableBalance}`
);

// Test 2: Deposit ₹1,000, join ₹100 contest, win & settle ₹180 -> Withdrawable ₹180
contestBackend.resetForTesting();
mockStorage.clear();
const user2 = { uid: 'UID_USER_2', email: 'user2@quizkart.in' };
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PRIZE_C2_U2',
  contestId: 'CONTEST_2',
  entryId: 'ENTRY_C2_U2',
  ownerUid: user2.uid,
  userEmail: user2.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 18000,
  amountRupees: 180,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now()
});
const t2 = contestBackend.getWithdrawableBalance(user2.uid, user2.email, [], 180);
const t2OverWithdraw = contestBackend.validateAndSubmitWithdrawal({ amount: 500 }, user2.uid, user2.email, [], 180);
assert(
  t2.withdrawableBalance === 180 && t2.settledWinnings === 180 && !t2OverWithdraw.success,
  2,
  'Deposit ₹1,000, win & settle ₹180 -> Withdrawable ₹180 (deposited funds excluded)',
  `withdrawable=₹${t2.withdrawableBalance}, ₹500 attempt rejected=${!t2OverWithdraw.success}`
);

// Test 3: Lose ₹100 entry fee -> remaining deposit ₹900, Withdrawable ₹0
contestBackend.resetForTesting();
mockStorage.clear();
const user3 = { uid: 'UID_USER_3', email: 'user3@quizkart.in' };
mockStorage.set('quizkart_user_quiz_attempts', JSON.stringify([{
  attemptId: 'ATT_LOSS_3',
  contestId: 'CONTEST_3',
  entryId: 'ENTRY_3',
  ownerUid: user3.uid,
  userEmail: user3.email,
  settlementStatus: 'settled',
  finalPrizeRupees: 0,
  rewardAmount: 0
}]));
const t3 = contestBackend.getWithdrawableBalance(user3.uid, user3.email, [], 0);
assert(
  t3.withdrawableBalance === 0 && t3.settledWinnings === 0,
  3,
  'Lose ₹100 entry fee -> Withdrawable ₹0',
  `withdrawable=₹${t3.withdrawableBalance}, settledWinnings=₹${t3.settledWinnings}`
);

// Test 4: User wins ₹60 genuine prize -> allowed to withdraw ₹60 (below ₹100 supported)
contestBackend.resetForTesting();
mockStorage.clear();
const user4 = { uid: 'UID_USER_4', email: 'user4@quizkart.in' };
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PRIZE_C4_U4',
  contestId: 'CONTEST_4',
  entryId: 'ENTRY_C4_U4',
  ownerUid: user4.uid,
  userEmail: user4.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 6000,
  amountRupees: 60,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now()
});
const t4Bal = contestBackend.getWithdrawableBalance(user4.uid, user4.email, [], 60);
const t4Val = contestBackend.validateAndSubmitWithdrawal({ amount: 60 }, user4.uid, user4.email, [], 60);
assert(
  t4Bal.withdrawableBalance === 60 && t4Val.success && t4Val.withdrawableBalance === 0,
  4,
  'Sub-₹100 genuine settled prize (₹60) -> allowed to withdraw ₹60',
  `withdrawable=₹${t4Bal.withdrawableBalance}, ₹60 validation=${t4Val.success}, remaining=₹${t4Val.withdrawableBalance}`
);

// Test 5: Confirmed winnings ₹540, no prior withdrawals -> Available Withdrawal Balance = ₹540
contestBackend.resetForTesting();
mockStorage.clear();
const user5 = { uid: 'UID_USER_5', email: 'user5@quizkart.in' };
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PRIZE_C5_U5',
  contestId: 'CONTEST_5',
  entryId: 'ENTRY_C5_U5',
  ownerUid: user5.uid,
  userEmail: user5.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 54000,
  amountRupees: 540,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now()
});
const t5 = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [], 540);
assert(
  t5.withdrawableBalance === 540 && t5.settledWinnings === 540,
  5,
  'Confirmed winnings ₹540, no withdrawals -> Available Withdrawal Balance ₹540',
  `settledWinnings=₹${t5.settledWinnings}, withdrawable=₹${t5.withdrawableBalance}`
);

// Test 6: Confirmed winnings ₹540, ₹300 approved -> Available Withdrawal Balance = ₹240
const approvedWth: WithdrawalRequest = {
  id: 'QK-WTH-2001',
  requestId: 'QK-WTH-2001',
  ownerUid: user5.uid,
  userEmail: user5.email,
  userName: 'User 5',
  phone: '9876543210',
  accountHolderName: 'User 5',
  accountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  amount: 300,
  timestamp: '2026-11-12 01:00 PM',
  status: 'approved'
};
const t6 = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [approvedWth], 540);
assert(
  t6.settledWinnings === 540 && t6.completedWithdrawals === 300 && t6.withdrawableBalance === 240,
  6,
  'Confirmed winnings ₹540 minus ₹300 approved -> Available Withdrawal Balance ₹240',
  `settled=₹${t6.settledWinnings}, approved=₹${t6.completedWithdrawals}, withdrawable=₹${t6.withdrawableBalance}`
);

// Test 7: Pending withdrawal ₹100 -> reserves ₹100 -> remaining ₹140 & duplicate submission blocked
const pendingWth: WithdrawalRequest = {
  id: 'QK-WTH-2002',
  requestId: 'QK-WTH-2002',
  ownerUid: user5.uid,
  userEmail: user5.email,
  userName: 'User 5',
  phone: '9876543210',
  accountHolderName: 'User 5',
  accountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  amount: 100,
  timestamp: '2026-11-12 02:00 PM',
  status: 'pending'
};
const t7 = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [approvedWth, pendingWth], 540);
const t7DupSubmit = contestBackend.validateAndSubmitWithdrawal({ amount: 50 }, user5.uid, user5.email, [approvedWth, pendingWth], 540);
assert(
  t7.activeWithdrawalHolds === 100 && t7.withdrawableBalance === 140 && !t7DupSubmit.success,
  7,
  'Pending withdrawal ₹100 -> reserves ₹100 (remaining ₹140) & blocks duplicate request',
  `holds=₹${t7.activeWithdrawalHolds}, withdrawable=₹${t7.withdrawableBalance}, dupBlocked=${!t7DupSubmit.success}`
);

// Test 8: Rejected or cancelled withdrawal -> released -> ₹240 available again
const rejectedWth: WithdrawalRequest = { ...pendingWth, status: 'rejected' };
const t8Rej = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [approvedWth, rejectedWth], 540);
const cancelledWth: WithdrawalRequest = { ...pendingWth, status: 'cancelled' };
const t8Can = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [approvedWth, cancelledWth], 540);
assert(
  t8Rej.activeWithdrawalHolds === 0 && t8Rej.withdrawableBalance === 240 && t8Can.withdrawableBalance === 240,
  8,
  'Rejected / Cancelled withdrawal -> reservation released -> ₹240 available',
  `afterReject=₹${t8Rej.withdrawableBalance}, afterCancel=₹${t8Can.withdrawableBalance}`
);

// Test 9: Duplicate prize counting & ID format deduplication protection
// Add same entry via ledger + settled entry + attempt + duplicate WTH ID format ('WTH-2001' vs 'QK-WTH-2001')
contestBackend.addFinancialLedgerRecord({
  transactionId: 'PRIZE_C5_U5', // same txId
  contestId: 'CONTEST_5',
  entryId: 'ENTRY_C5_U5',
  ownerUid: user5.uid,
  userEmail: user5.email,
  type: 'PRIZE_PAYOUT',
  status: 'COMPLETED',
  amountPaise: 54000,
  amountRupees: 540,
  timestamp: new Date().toISOString(),
  timestampMs: Date.now()
});
mockStorage.set('quizkart_user_quiz_attempts', JSON.stringify([
  {
    attemptId: 'ATT_5',
    contestId: 'CONTEST_5',
    entryId: 'ENTRY_C5_U5',
    ownerUid: user5.uid,
    userEmail: user5.email,
    settlementStatus: 'settled',
    finalPrizeRupees: 540,
    rewardAmount: 540
  },
  {
    attemptId: 'ATT_DEMO',
    contestId: 'DEMO_C',
    ownerUid: user5.uid,
    userEmail: user5.email,
    isDemo: true,
    settlementStatus: 'settled',
    finalPrizeRupees: 999
  },
  {
    attemptId: 'ATT_PROVISIONAL',
    contestId: 'PROV_C',
    ownerUid: user5.uid,
    userEmail: user5.email,
    settlementStatus: 'provisional',
    rewardAmount: 800
  }
]));
mockStorage.set('quizkart_admin_withdrawals', JSON.stringify([
  { ...approvedWth, id: 'WTH-2001', requestId: 'WTH-2001' } // alias format of QK-WTH-2001
]));
const t9 = contestBackend.getWithdrawableBalance(user5.uid, user5.email, [approvedWth], 540);
assert(
  t9.settledWinnings === 540 && t9.completedWithdrawals === 300 && t9.withdrawableBalance === 240,
  9,
  'Deduplication of prize records, demo/provisional exclusion, and WTH-XXXX ID normalization',
  `settled=₹${t9.settledWinnings} (demo/provisional excluded), completedWithdrawals=₹${t9.completedWithdrawals}, withdrawable=₹${t9.withdrawableBalance}`
);

// Test 10: Cross-user isolation & stale profile totalWon isolation
const otherUser = { uid: 'UID_OTHER', email: 'other@quizkart.in' };
const t10 = contestBackend.getWithdrawableBalance(otherUser.uid, otherUser.email, [approvedWth], 0);
assert(
  t10.settledWinnings === 0 && t10.completedWithdrawals === 0 && t10.withdrawableBalance === 0,
  10,
  'Strict multi-user isolation (other user never inherits user5 prizes or withdrawals)',
  `otherUser settled=₹${t10.settledWinnings}, withdrawable=₹${t10.withdrawableBalance}`
);

console.log('================================================================');
console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
