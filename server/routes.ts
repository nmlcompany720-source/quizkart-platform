import { Router, type Request, type Response } from 'express';
import { 
  joinContestAtomic, 
  getContestRealJoins, 
  getContestEntries,
  calculateFinancialSplit,
  submitEntryQuiz,
  abandonEntryQuiz
} from './entryService.ts';
import {
  recalculateContestRankings,
  getSanitizedLeaderboard,
  getEntryPayoutStatus
} from './rankingEngine.ts';
import {
  calculateWaterfallPrizes,
  calculateWinnerSlots
} from './prizeEngine.ts';
import crypto from 'crypto';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'QuizKart Entry, Payment & Ranking Engine',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/contests/:contestId/join
 * Server-authoritative atomic contest join endpoint.
 * Supports WALLET or verified GATEWAY payment.
 */
apiRouter.post('/contests/:contestId/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    const { ownerUid, customUserId, paymentMethod, paymentDetails } = req.body;

    if (!contestId) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: contestId path parameter is required' });
      return;
    }
    if (!ownerUid) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: ownerUid (Firebase UID) is required' });
      return;
    }
    if (!paymentMethod || !['WALLET', 'GATEWAY'].includes(paymentMethod)) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: paymentMethod must be WALLET or GATEWAY' });
      return;
    }

    const joinResult = await joinContestAtomic({
      contestId,
      ownerUid,
      customUserId,
      paymentMethod,
      paymentDetails
    });

    res.status(200).json(joinResult);
  } catch (error: any) {
    const msg = error?.message || 'Internal server error';
    console.error('[/api/contests/join error]:', msg);

    if (msg.startsWith('INSUFFICIENT_WALLET_BALANCE')) {
      res.status(402).json({ error: msg, code: 'INSUFFICIENT_FUNDS' });
      return;
    }
    if (msg.startsWith('CONTEST_FULL')) {
      res.status(409).json({ error: msg, code: 'CONTEST_FULL' });
      return;
    }
    if (msg.startsWith('CONTEST_EXPIRED') || msg.startsWith('JOINING_DEADLINE_PASSED') || msg.startsWith('CONTEST_INACTIVE')) {
      res.status(403).json({ error: msg, code: 'CONTEST_NOT_JOINABLE' });
      return;
    }
    if (msg.startsWith('DUPLICATE_PAYMENT_CALLBACK')) {
      res.status(409).json({ error: msg, code: 'DUPLICATE_PAYMENT' });
      return;
    }
    if (msg.startsWith('GATEWAY_CONFIGURATION_MISSING') || msg.startsWith('INVALID_PAYMENT_SIGNATURE')) {
      res.status(400).json({ error: msg, code: 'PAYMENT_VERIFICATION_FAILED' });
      return;
    }
    if (msg.startsWith('USER_BLOCKED')) {
      res.status(403).json({ error: msg, code: 'USER_BLOCKED' });
      return;
    }
    if (msg.startsWith('CONTEST_NOT_FOUND') || msg.startsWith('USER_NOT_FOUND')) {
      res.status(404).json({ error: msg, code: 'NOT_FOUND' });
      return;
    }

    res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/payments/verify
 * Server-authoritative webhook callback verification for payment gateways (Razorpay, PhonePe, Cashfree).
 * Validates cryptographic signature and webhook configuration before creating contest entry.
 */
apiRouter.post('/payments/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      gateway, 
      paymentId, 
      orderId, 
      contestId, 
      ownerUid, 
      amountPaise, 
      signature 
    } = req.body;

    const gatewaySecret = process.env.PAYMENT_GATEWAY_SECRET;

    // Check gateway configuration
    if (!gatewaySecret && !process.env.ALLOW_TEST_GATEWAY_WEBHOOK) {
      res.status(400).json({
        error: 'GATEWAY_CONFIGURATION_MISSING: Live payment gateway webhook secret is not configured on server. Unverified payments cannot be marked as paid.',
        code: 'GATEWAY_NOT_CONFIGURED'
      });
      return;
    }

    if (!paymentId || !contestId || !ownerUid || !amountPaise) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD: paymentId, contestId, ownerUid, and amountPaise are required',
        code: 'INVALID_PAYLOAD'
      });
      return;
    }

    // Cryptographic signature check
    if (gatewaySecret) {
      const hmac = crypto.createHmac('sha256', gatewaySecret);
      const expectedSignature = hmac.update(`${orderId || paymentId}|${paymentId}`).digest('hex');
      if (signature !== expectedSignature) {
        res.status(400).json({
          error: 'INVALID_SIGNATURE: Payment webhook signature verification failed.',
          code: 'SIGNATURE_MISMATCH'
        });
        return;
      }
    }

    // Atomic join contest with verified gateway payment
    const joinResult = await joinContestAtomic({
      contestId,
      ownerUid,
      paymentMethod: 'GATEWAY',
      paymentDetails: {
        paymentId,
        gateway: gateway || 'RAZORPAY',
        gatewayTxnId: orderId || paymentId,
        signature
      }
    });

    res.status(200).json({
      verified: true,
      ...joinResult
    });
  } catch (error: any) {
    console.error('[/api/payments/verify error]:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/contests/:contestId/real-joins
 * Returns authoritative realJoins count and revenue stats directly from database.
 */
apiRouter.get('/contests/:contestId/real-joins', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    const stats = await getContestRealJoins(contestId);
    res.json(stats);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/contests/:contestId/entries
 * Returns list of entries for a contest.
 * If ?ownerUid=... is provided, filters for that user's entries only (strict privacy).
 */
apiRouter.get('/contests/:contestId/entries', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    const ownerUid = req.query.ownerUid as string | undefined;
    const entries = await getContestEntries(contestId, ownerUid);
    res.json({
      contestId,
      count: entries.length,
      entries
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/contests/:contestId/entries/:entryId/submit
 * Authoritative quiz submission endpoint.
 * Evaluates answers against server answer key with fixed-precision centipoint scoring,
 * updates entry document, and triggers immediate rankings and prize pool recalculation.
 */
apiRouter.post('/contests/:contestId/entries/:entryId/submit', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId, entryId } = req.params;
    const { ownerUid, answers, timeTakenMs, totalQuestions, answerKey } = req.body;

    if (!contestId || !entryId) {
      res.status(400).json({ error: 'INVALID_PATH: contestId and entryId path parameters are required' });
      return;
    }
    if (!ownerUid) {
      res.status(400).json({ error: 'INVALID_PAYLOAD: ownerUid is required' });
      return;
    }

    const submissionResult = await submitEntryQuiz({
      contestId,
      entryId,
      ownerUid,
      answers: answers || {},
      timeTakenMs: Number(timeTakenMs) || 0,
      totalQuestions: totalQuestions ? Number(totalQuestions) : 10,
      answerKey
    });

    res.status(200).json(submissionResult);
  } catch (error: any) {
    const msg = error?.message || 'Internal server error';
    console.error('[/api/contests/entries/submit error]:', msg);

    if (msg.startsWith('ALREADY_SUBMITTED')) {
      res.status(409).json({ error: msg, code: 'ALREADY_SUBMITTED' });
      return;
    }
    if (msg.startsWith('UNAUTHORIZED')) {
      res.status(403).json({ error: msg, code: 'UNAUTHORIZED' });
      return;
    }
    if (msg.startsWith('ENTRY_NOT_FOUND')) {
      res.status(404).json({ error: msg, code: 'ENTRY_NOT_FOUND' });
      return;
    }
    if (msg.startsWith('PAYMENT_UNCONFIRMED')) {
      res.status(402).json({ error: msg, code: 'PAYMENT_REQUIRED' });
      return;
    }

    res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/contests/:contestId/entries/:entryId/abandon
 * Marks an entry as abandoned and recalculates rankings.
 */
apiRouter.post('/contests/:contestId/entries/:entryId/abandon', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId, entryId } = req.params;
    const { ownerUid } = req.body;

    if (!contestId || !entryId || !ownerUid) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: contestId, entryId, and ownerUid are required' });
      return;
    }

    const result = await abandonEntryQuiz(contestId, entryId, ownerUid);
    res.status(200).json(result);
  } catch (error: any) {
    const msg = error?.message || 'Internal server error';
    res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/contests/:contestId/recalculate
 * Triggers server-authoritative recalculation of all ranks, winner slots, and waterfall prizes.
 */
apiRouter.post('/contests/:contestId/recalculate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    if (!contestId) {
      res.status(400).json({ error: 'contestId is required' });
      return;
    }

    const summary = await recalculateContestRankings(contestId);
    res.status(200).json({
      success: true,
      summary
    });
  } catch (error: any) {
    const msg = error?.message || 'Recalculation failed';
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/contests/:contestId/leaderboard
 * Returns sanitized, public leaderboard sorted by rank (1..N).
 * Strictly excludes private payment IDs, gateway signatures, phone numbers, and emails.
 */
apiRouter.get('/contests/:contestId/leaderboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    const leaderboard = await getSanitizedLeaderboard(contestId);
    res.status(200).json({
      contestId,
      count: leaderboard.length,
      leaderboard
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/contests/:contestId/entries/:entryId/payout-status
 * Authoritative dynamic Payout Status data contract:
 * Returns dynamic rank, projected prize, eligibility, winner slots, and calculation timestamp.
 */
apiRouter.get('/contests/:contestId/entries/:entryId/payout-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId, entryId } = req.params;
    const payoutStatus = await getEntryPayoutStatus(contestId, entryId);
    res.status(200).json(payoutStatus);
  } catch (error: any) {
    const msg = error?.message || 'Error fetching payout status';
    if (msg.startsWith('ENTRY_NOT_FOUND')) {
      res.status(404).json({ error: msg, code: 'ENTRY_NOT_FOUND' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/contests/:contestId/prize-plan
 * Returns calculated waterfall prize plan for a contest based on real joins.
 */
apiRouter.get('/contests/:contestId/prize-plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contestId } = req.params;
    const stats = await getContestRealJoins(contestId);
    const plan = calculateWaterfallPrizes(stats.realJoins, 10000);
    res.status(200).json({
      contestId,
      ...plan
    });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

