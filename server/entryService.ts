import { 
  serverDb, 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  collection, 
  query, 
  where, 
  getDocs 
} from './db.ts';
import crypto from 'crypto';
import { recalculateContestRankings } from './rankingEngine.ts';
import { evaluateQuizSubmission } from './scoringService.ts';

export interface JoinContestParams {
  contestId: string;
  ownerUid: string;
  customUserId?: string;
  paymentMethod: 'WALLET' | 'GATEWAY';
  paymentDetails?: {
    paymentId?: string;
    gateway?: 'RAZORPAY' | 'PHONEPE' | 'CASHFREE';
    gatewayTxnId?: string;
    signature?: string;
    payload?: any;
  };
}

export interface ContestEntryRecord {
  entryId: string;
  contestId: string;
  ownerUid: string;
  customUserId?: string;
  paymentId: string;
  paymentMethod: 'WALLET' | 'GATEWAY';
  paymentStatus: 'CONFIRMED' | 'PENDING' | 'FAILED';
  entryStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  amountPaise: number;
  joinedAt: string;
  submissionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
  score: number;
  rank: number | null;
}

export interface FinancialSplit {
  userPrizePoolPaise: number;   // 60%
  referralPoolPaise: number;    // 10%
  platformMarginPaise: number;  // 30%
  totalPaise: number;
}

/**
 * Calculates deterministic integer paise distribution:
 * 60% User Prize Pool, 10% Referral Pool, 30% Platform Margin.
 * Remainder is retained in platform margin so totalPaise matches exactly.
 */
export function calculateFinancialSplit(entryFeePaise: number): FinancialSplit {
  const userPrizePoolPaise = Math.floor(entryFeePaise * 0.60);
  const referralPoolPaise = Math.floor(entryFeePaise * 0.10);
  const platformMarginPaise = entryFeePaise - userPrizePoolPaise - referralPoolPaise;
  return {
    userPrizePoolPaise,
    referralPoolPaise,
    platformMarginPaise,
    totalPaise: entryFeePaise
  };
}

/**
 * Parse date or timestamp string into epoch milliseconds
 */
export function parseTimestampMs(value?: string | number | null): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export async function joinContestAtomic(params: JoinContestParams) {
  const { contestId, ownerUid, customUserId, paymentMethod, paymentDetails } = params;

  if (!contestId || typeof contestId !== 'string') {
    throw new Error('INVALID_ARGUMENT: contestId is required');
  }
  if (!ownerUid || typeof ownerUid !== 'string') {
    throw new Error('INVALID_ARGUMENT: ownerUid (Firebase UID) is required. Email is not permitted as primary identity.');
  }

  // Pre-validate gateway payment if paymentMethod is GATEWAY
  let verifiedPaymentId = paymentDetails?.paymentId;
  if (paymentMethod === 'GATEWAY') {
    if (!verifiedPaymentId) {
      throw new Error('INVALID_ARGUMENT: paymentId is required for GATEWAY payments');
    }
    // Verify server gateway configuration
    const gatewaySecret = process.env.PAYMENT_GATEWAY_SECRET;
    if (!gatewaySecret && !process.env.ALLOW_TEST_GATEWAY_WEBHOOK) {
      throw new Error('GATEWAY_CONFIGURATION_MISSING: Live payment gateway webhook secret is not configured on server. Unverified payments cannot be marked as paid.');
    }
    // If signature provided, verify signature
    if (paymentDetails?.signature && gatewaySecret) {
      const hmac = crypto.createHmac('sha256', gatewaySecret);
      const expectedSig = hmac.update(`${verifiedPaymentId}|${contestId}`).digest('hex');
      if (expectedSig !== paymentDetails.signature) {
        throw new Error('INVALID_PAYMENT_SIGNATURE: Gateway cryptographic signature verification failed.');
      }
    }
  } else if (paymentMethod === 'WALLET') {
    // Generate server-authoritative payment ID for wallet transaction
    verifiedPaymentId = `PAY_WALLET_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  } else {
    throw new Error(`INVALID_PAYMENT_METHOD: Unsupported payment method ${paymentMethod}`);
  }

  // Execute atomic Firestore transaction
  const result = await runTransaction(serverDb, async (transaction) => {
    // 1. Read Contest Document
    const contestRef = doc(serverDb, 'contests', contestId);
    const contestSnap = await transaction.get(contestRef);

    if (!contestSnap.exists()) {
      throw new Error(`CONTEST_NOT_FOUND: Contest ${contestId} does not exist`);
    }

    const contestData = contestSnap.data();
    const entryFeeRupees = Number(contestData.entryFee) || 100;
    const entryFeePaise = entryFeeRupees * 100;
    const maxParticipants = Number(contestData.maxParticipants) || 50;
    const currentRealJoins = Number(contestData.realJoins) || 0;
    const contestStatus = contestData.status || 'active';

    // 2. Validate Contest Status & Availability
    if (contestStatus === 'completed' || contestStatus === 'cancelled') {
      throw new Error(`CONTEST_INACTIVE: Contest is ${contestStatus} and no longer accepts entries`);
    }
    if (contestStatus === 'full' || currentRealJoins >= maxParticipants) {
      throw new Error(`CONTEST_FULL: Contest has reached maximum capacity (${currentRealJoins}/${maxParticipants})`);
    }

    // 3. Server-Authoritative Timing Validation
    const nowMs = Date.now();
    if (contestData.endTime) {
      const endMs = parseTimestampMs(contestData.endTime);
      if (endMs > 0 && nowMs > endMs) {
        throw new Error('CONTEST_EXPIRED: Contest ending time has passed');
      }
    }
    if (contestData.joiningDeadline) {
      const deadlineMs = parseTimestampMs(contestData.joiningDeadline);
      if (deadlineMs > 0 && nowMs > deadlineMs) {
        throw new Error('JOINING_DEADLINE_PASSED: Joining deadline for this contest has passed');
      }
    }

    // 4. Check Idempotency for Payment
    const idempotencyRef = doc(serverDb, 'payment_idempotency_keys', verifiedPaymentId!);
    const idempSnap = await transaction.get(idempotencyRef);
    if (idempSnap.exists()) {
      throw new Error(`DUPLICATE_PAYMENT_CALLBACK: Payment ${verifiedPaymentId} has already been processed and used for entry ${idempSnap.data()?.entryId}`);
    }

    // 5. If Wallet Payment: Validate User & Deduct Balance
    const userRef = doc(serverDb, 'users', ownerUid);
    let currentUserData: any = null;
    let newWalletBalance = 0;

    if (paymentMethod === 'WALLET') {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`USER_NOT_FOUND: User ${ownerUid} does not exist`);
      }
      currentUserData = userSnap.data();
      if (currentUserData.isBlocked) {
        throw new Error('USER_BLOCKED: Account is blocked from joining contests');
      }
      const currentBalanceRupees = Number(currentUserData.walletBalance) || 0;
      if (currentBalanceRupees < entryFeeRupees) {
        throw new Error(`INSUFFICIENT_WALLET_BALANCE: Required ₹${entryFeeRupees}, current balance is ₹${currentBalanceRupees}`);
      }
      newWalletBalance = currentBalanceRupees - entryFeeRupees;
    }

    // 6. Generate Unique Entry ID (guaranteed globally unique)
    const timestampStr = new Date().toISOString();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const entryId = `ENTRY_${contestId}_${ownerUid.slice(0, 10)}_${Date.now()}_${randomSuffix}`;

    // 7. Calculate Financial Distribution
    const split = calculateFinancialSplit(entryFeePaise);

    // 8. Prepare Writes:
    // a. Create Entry Document in /contests/{contestId}/entries/{entryId}
    const entryRef = doc(serverDb, 'contests', contestId, 'entries', entryId);
    const entryData: ContestEntryRecord = {
      entryId,
      contestId,
      ownerUid,
      customUserId: customUserId || currentUserData?.customUserId || `QK-USR-${ownerUid.slice(0, 6)}`,
      paymentId: verifiedPaymentId!,
      paymentMethod,
      paymentStatus: 'CONFIRMED',
      entryStatus: 'ACTIVE',
      amountPaise: entryFeePaise,
      joinedAt: timestampStr,
      submissionStatus: 'NOT_STARTED',
      score: 0,
      rank: null
    };
    transaction.set(entryRef, entryData);

    // b. Record Payment Idempotency Key
    transaction.set(idempotencyRef, {
      paymentId: verifiedPaymentId,
      entryId,
      contestId,
      ownerUid,
      amountPaise: entryFeePaise,
      createdAt: timestampStr
    });

    // c. Write Immutable Financial Journal Entry
    const journalId = `JE-JOIN-${contestId}-${entryId}`;
    const journalRef = doc(serverDb, 'ledger_journal', journalId);
    transaction.set(journalRef, {
      journalId,
      contestId,
      entryId,
      ownerUid,
      entryFeePaise,
      userPrizePoolPaise: split.userPrizePoolPaise,
      referralPoolPaise: split.referralPoolPaise,
      platformMarginPaise: split.platformMarginPaise,
      timestamp: timestampStr,
      type: 'CONTEST_JOIN_ALLOCATION'
    });

    // d. Write Payment Record
    const paymentRef = doc(serverDb, 'payments', verifiedPaymentId!);
    transaction.set(paymentRef, {
      paymentId: verifiedPaymentId,
      ownerUid,
      contestId,
      entryId,
      amountPaise: entryFeePaise,
      currency: 'INR',
      gateway: paymentMethod === 'WALLET' ? 'WALLET' : (paymentDetails?.gateway || 'UNKNOWN'),
      gatewayTxnId: paymentDetails?.gatewayTxnId || verifiedPaymentId,
      status: 'CONFIRMED',
      verifiedAt: timestampStr
    });

    // e. Deduct from User Wallet if payment was via wallet
    if (paymentMethod === 'WALLET') {
      transaction.update(userRef, {
        walletBalance: newWalletBalance,
        updatedAt: timestampStr
      });
    }

    // f. Update Contest State Atomically
    const nextRealJoins = currentRealJoins + 1;
    const isNowFull = nextRealJoins >= maxParticipants;
    const currentTotalRevPaise = Number(contestData.totalRevenuePaise) || (Number(contestData.totalRevenue || 0) * 100);
    const nextTotalRevPaise = currentTotalRevPaise + entryFeePaise;
    const nextPrizePoolPaise = (Number(contestData.userPrizePoolPaise) || 0) + split.userPrizePoolPaise;
    const nextReferralPoolPaise = (Number(contestData.referralPoolPaise) || 0) + split.referralPoolPaise;
    const nextPlatformMarginPaise = (Number(contestData.platformMarginPaise) || 0) + split.platformMarginPaise;

    transaction.update(contestRef, {
      realJoins: nextRealJoins,
      totalRevenue: Math.floor(nextTotalRevPaise / 100),
      totalRevenuePaise: nextTotalRevPaise,
      userPrizePoolPaise: nextPrizePoolPaise,
      referralPoolPaise: nextReferralPoolPaise,
      platformMarginPaise: nextPlatformMarginPaise,
      status: isNowFull ? 'full' : contestStatus,
      updatedAt: timestampStr
    });

    return {
      success: true,
      entryId,
      contestId,
      ownerUid,
      paymentId: verifiedPaymentId,
      paymentStatus: 'CONFIRMED',
      amountPaise: entryFeePaise,
      realJoins: nextRealJoins,
      maxParticipants,
      isNowFull,
      newWalletBalance: paymentMethod === 'WALLET' ? newWalletBalance : undefined,
      financialSplit: split
    };
  });

  // Automatically recalculate rankings and waterfall prize allocations upon new confirmed join
  try {
    await recalculateContestRankings(contestId);
  } catch (err: any) {
    console.error(`[recalculateContestRankings after join error]: ${err.message}`);
  }

  return result;
}

export interface SubmitQuizParams {
  contestId: string;
  entryId: string;
  ownerUid: string;
  answers: Record<string | number, number>;
  timeTakenMs: number;
  totalQuestions?: number;
  answerKey?: Record<string | number, number>;
}

/**
 * Server-authoritative quiz submission.
 * Validates ownership, active status, prevents duplicate submissions, evaluates score,
 * updates entry document, and triggers immediate rankings and prize pool recalculation.
 */
export async function submitEntryQuiz(params: SubmitQuizParams) {
  const { contestId, entryId, ownerUid, answers, timeTakenMs, totalQuestions = 10, answerKey } = params;

  if (!contestId || !entryId || !ownerUid) {
    throw new Error('INVALID_ARGUMENT: contestId, entryId, and ownerUid are required');
  }

  const entryRef = doc(serverDb, 'contests', contestId, 'entries', entryId);
  const entrySnap = await getDoc(entryRef);

  if (!entrySnap.exists()) {
    throw new Error(`ENTRY_NOT_FOUND: Entry ${entryId} does not exist in contest ${contestId}`);
  }

  const entryData = entrySnap.data() as ContestEntryRecord;

  if (entryData.ownerUid !== ownerUid) {
    throw new Error('UNAUTHORIZED: Entry does not belong to the authenticated user');
  }

  if (entryData.paymentStatus !== 'CONFIRMED') {
    throw new Error('PAYMENT_UNCONFIRMED: Only confirmed paid entries can submit quiz');
  }

  if (entryData.submissionStatus === 'SUBMITTED') {
    throw new Error('ALREADY_SUBMITTED: This entry has already been submitted and cannot be resubmitted');
  }

  // Authoritatively evaluate score using fixed-precision integer arithmetic
  const evalResult = evaluateQuizSubmission({
    totalQuestions,
    answers: answers || {},
    answerKey
  });

  const nowMs = Date.now();
  const submittedAtStr = new Date(nowMs).toISOString();

  await updateDoc(entryRef, {
    submissionStatus: 'SUBMITTED',
    score: evalResult.finalScore,
    centipoints: evalResult.finalCentipoints,
    accuracy: evalResult.accuracy,
    correctAnswers: evalResult.correctCount,
    wrongAnswers: evalResult.wrongCount,
    unanswered: evalResult.unansweredCount,
    timeTakenMs: Math.max(0, timeTakenMs),
    submittedAt: submittedAtStr,
    submittedAtMs: nowMs,
    answers: answers || {}
  });

  // Automatically recalculate rankings and waterfall prizes
  const recalculation = await recalculateContestRankings(contestId);

  // Fetch updated entry to return exact rank and projected prize
  const updatedEntrySnap = await getDoc(entryRef);
  const updatedData = updatedEntrySnap.data() as any;

  return {
    success: true,
    entryId,
    contestId,
    ownerUid,
    submissionStatus: 'SUBMITTED',
    score: evalResult.finalScore,
    centipoints: evalResult.finalCentipoints,
    accuracy: evalResult.accuracy,
    correctCount: evalResult.correctCount,
    wrongCount: evalResult.wrongCount,
    unansweredCount: evalResult.unansweredCount,
    timeTakenMs,
    submittedAt: submittedAtStr,
    rank: updatedData?.rank ?? null,
    projectedPrizePaise: updatedData?.projectedPrizePaise ?? 0,
    projectedPrizeRupees: updatedData?.projectedPrizeRupees ?? 0,
    isEligibleForPayout: Boolean(updatedData?.isEligibleForPayout),
    rankingVersion: recalculation.rankingVersion,
    winnerSlots: recalculation.winnerSlots
  };
}

/**
 * Marks an entry as abandoned and triggers prize recalculation.
 */
export async function abandonEntryQuiz(contestId: string, entryId: string, ownerUid: string) {
  const entryRef = doc(serverDb, 'contests', contestId, 'entries', entryId);
  const snap = await getDoc(entryRef);

  if (!snap.exists()) {
    throw new Error(`ENTRY_NOT_FOUND: Entry ${entryId} does not exist`);
  }

  const entryData = snap.data() as ContestEntryRecord;
  if (entryData.ownerUid !== ownerUid) {
    throw new Error('UNAUTHORIZED: Entry does not belong to owner');
  }

  if (entryData.submissionStatus === 'SUBMITTED') {
    throw new Error('ALREADY_SUBMITTED: Cannot abandon an already submitted entry');
  }

  await updateDoc(entryRef, {
    submissionStatus: 'ABANDONED',
    rank: null,
    projectedPrizePaise: 0,
    projectedPrizeRupees: 0,
    isEligibleForPayout: false,
    updatedAt: new Date().toISOString()
  });

  const recalculation = await recalculateContestRankings(contestId);
  return {
    success: true,
    entryId,
    contestId,
    submissionStatus: 'ABANDONED',
    rankingVersion: recalculation.rankingVersion
  };
}

export async function getContestRealJoins(contestId: string) {
  const contestRef = doc(serverDb, 'contests', contestId);
  const snap = await getDoc(contestRef);
  if (!snap.exists()) {
    throw new Error(`CONTEST_NOT_FOUND: Contest ${contestId} does not exist`);
  }
  const data = snap.data();
  return {
    contestId,
    realJoins: Number(data.realJoins) || 0,
    maxParticipants: Number(data.maxParticipants) || 50,
    totalRevenue: Number(data.totalRevenue) || 0,
    totalRevenuePaise: Number(data.totalRevenuePaise) || 0,
    userPrizePoolPaise: Number(data.userPrizePoolPaise) || 0,
    status: data.status || 'active'
  };
}

export async function getContestEntries(contestId: string, ownerUid?: string): Promise<ContestEntryRecord[]> {
  const entriesColl = collection(serverDb, 'contests', contestId, 'entries');
  let q = query(entriesColl);
  if (ownerUid) {
    q = query(entriesColl, where('ownerUid', '==', ownerUid));
  }
  const snap = await getDocs(q);
  const list: ContestEntryRecord[] = [];
  snap.forEach(d => {
    list.push(d.data() as ContestEntryRecord);
  });
  // Sort descending by joinedAt
  list.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
  return list;
}
