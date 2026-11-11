import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  CheckCircle2, 
  XCircle, 
  Gift, 
  Truck, 
  Smartphone, 
  Share2, 
  ArrowRight, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp
} from 'lucide-react';
import { Question, QuizAttemptResult, DailyPrizeItem } from '../types';
import { soundFx } from '../utils/audio';
import { safeCopyToClipboard } from '../utils/clipboard';
import { getQuestionCorrectIndex } from '../utils/questionPoolManager';
import { contestBackend } from '../backend/contestEngine';

export const PAYOUT_STATUS_OPTIONS: readonly string[] = [
  "Your result is recorded. Final prize will be confirmed after the contest ends.",
  "Great performance! Your eligible prize is subject to final settlement.",
  "Your entry is confirmed. Final rankings will be announced soon.",
  "Contest is live. Your final rank and reward will be confirmed at completion.",
  "Your performance is saved. Stay tuned for the final results."
] as const;

export function getAttemptPayoutMessage(attempt?: Partial<QuizAttemptResult> | null): string {
  if (typeof attempt?.selectedMessageOption === 'number' && attempt.selectedMessageOption >= 1 && attempt.selectedMessageOption <= PAYOUT_STATUS_OPTIONS.length) {
    return PAYOUT_STATUS_OPTIONS[attempt.selectedMessageOption - 1];
  }
  if (attempt?.payoutMessage && typeof attempt.payoutMessage === 'string' && attempt.payoutMessage.trim().length > 0) {
    const trimmed = attempt.payoutMessage.trim();
    const idx = PAYOUT_STATUS_OPTIONS.indexOf(trimmed as any);
    if (idx !== -1) return PAYOUT_STATUS_OPTIONS[idx];
    return trimmed;
  }
  // Deterministic fallback based on entryId / attemptId so it never shifts or re-randomizes on refresh
  const seed = (attempt?.entryId || attempt?.attemptId || 'entry-seed');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PAYOUT_STATUS_OPTIONS[hash % PAYOUT_STATUS_OPTIONS.length];
}

interface QuizResultProps {
  result: QuizAttemptResult;
  questions: Question[];
  todayPrize: DailyPrizeItem;
  onViewLeaderboard: () => void;
  onRetakeOrHome: () => void;
  onRejoinContest?: () => void;
}

export const QuizResult: React.FC<QuizResultProps> = ({
  result,
  questions,
  todayPrize,
  onViewLeaderboard,
  onRetakeOrHome,
  onRejoinContest
}) => {
  const [showDetailedReview, setShowDetailedReview] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [, setSettlementTick] = useState<number>(0);

  useEffect(() => {
    const handleSettlementSync = () => setSettlementTick(t => t + 1);
    window.addEventListener('quizkart_attempts_updated', handleSettlementSync);
    window.addEventListener('quizkart_profile_updated', handleSettlementSync);
    return () => {
      window.removeEventListener('quizkart_attempts_updated', handleSettlementSync);
      window.removeEventListener('quizkart_profile_updated', handleSettlementSync);
    };
  }, []);

  useEffect(() => {
    // Fire confetti celebration
    soundFx.playSuccess();
    try {
      confetti({
        particleCount: result.rank === 1 ? 140 : 80,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch {
      // Graceful fallback
    }
  }, [result.rank]);

  // Derive true review questions list for this test attempt
  const reviewQuestions = React.useMemo(() => {
    const list = (result.questions && result.questions.length > 0 ? result.questions : questions) || [];
    return list.filter(q => q && q.id != null);
  }, [result.questions, questions]);

  // Denominator: strictly 10 (or actual question block count), eliminating erroneous pool denominators like 100
  const effectiveTotalQuestions = reviewQuestions.length > 0
    ? reviewQuestions.length
    : (result.totalQuestions > 0 && result.totalQuestions <= 25 ? result.totalQuestions : 10);

  // Score: Strict immutable evaluation engine: Final Score = (Correct × 1) − (Wrong × 0.33)
  const displayScore = React.useMemo(() => {
    if (result.securityBreached) return 0;
    if (reviewQuestions.length > 0 && result.answers) {
      let correct = 0;
      let wrong = 0;
      reviewQuestions.forEach((q) => {
        const correctIdx = getQuestionCorrectIndex(q);
        const userAns = result.answers[q.id];
        if (userAns !== undefined) {
          if (userAns === correctIdx) {
            correct += 1;
          } else {
            wrong += 1;
          }
        }
      });
      const netScore = (correct * 1) - (wrong * 0.33);
      return Math.max(0, Math.round(netScore * 100) / 100);
    }
    const rawScore = Number(result.score) || 0;
    return Math.max(0, Math.round(rawScore * 100) / 100);
  }, [result.securityBreached, reviewQuestions, result.answers, result.score]);

  // Decimal Support: properly render score with decimal points where applicable (e.g., 8.67 or 9.33)
  const formattedScore = React.useMemo(() => {
    if (Number.isInteger(displayScore)) {
      return displayScore.toString();
    }
    return (Math.round(displayScore * 100) / 100).toString();
  }, [displayScore]);

  // Attempt-Based Accuracy Percentage Formula (Without Decimals):
  // Based strictly on user attempts: totalAttempted = correctAnswers + wrongAnswers
  const accuracy = React.useMemo(() => {
    if (result.securityBreached) return 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;

    if (reviewQuestions.length > 0 && result.answers) {
      reviewQuestions.forEach((q) => {
        const correctIdx = getQuestionCorrectIndex(q);
        const userAns = result.answers[q.id];
        if (userAns !== undefined) {
          if (userAns === correctIdx) {
            correctAnswers += 1;
          } else {
            wrongAnswers += 1;
          }
        }
      });
    }

    const totalAttempted = correctAnswers + wrongAnswers;
    const calculatedAccuracy = totalAttempted > 0 
      ? Math.round((correctAnswers / totalAttempted) * 100) 
      : 0;
    return calculatedAccuracy;
  }, [result.securityBreached, reviewQuestions, result.answers]);

  const formatTime = (secs: number) => {
    const totalSecs = Math.floor(Number(secs) || 0);
    const m = Math.floor(totalSecs / 60);
    const s = Math.floor(totalSecs % 60);
    return `${m}m ${s}s`;
  };

  const copyToClipboard = async (text: string) => {
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleShare = async () => {
    soundFx.playClick();
    const siteUrl = 'https://quizkart.in';
    const shareText = result.securityBreached
      ? `🎯 I attempted the QuizKart Daily Skill Contest! Competing for mega prizes on ${siteUrl}`
      : `🎯 I scored ${formattedScore}/${effectiveTotalQuestions} (${accuracy}% accuracy) in ${formatTime(result.timeTakenSeconds)} on QuizKart Daily Skill Contest and achieved Rank ${result.rank}! 🏆 Competing for ${todayPrize?.title || 'daily prizes'}! ${siteUrl}`;
    const shareData = {
      title: 'QuizKart - My Contest Score & Rank',
      text: shareText,
      url: siteUrl
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } catch (err: unknown) {
        // If aborted by user, do nothing; if unsupported/failed, fallback to clipboard
        if ((err as Error)?.name !== 'AbortError') {
          copyToClipboard(`${shareText}`);
        }
      }
    } else {
      copyToClipboard(`${shareText}`);
    }
  };

  const isSettled = result.settlementStatus === 'settled' || 
    (result.finalPrizeRupees !== undefined && result.finalPrizeRupees > 0) ||
    (result.contestId ? contestBackend.isContestSettled(result.contestId) : false);

  const actualCreditedPrize = React.useMemo(() => {
    // 1. Authoritative finalPrizeRupees if already set on attempt
    if (result.finalPrizeRupees !== undefined && result.finalPrizeRupees > 0) {
      return result.finalPrizeRupees;
    }
    // 2. rewardAmount if attempt is settled
    if (result.settlementStatus === 'settled' && result.rewardAmount && result.rewardAmount > 0) {
      return result.rewardAmount;
    }
    // 3. Authoritative backend settlement record for this contest & user
    if (result.contestId && contestBackend.isContestSettled(result.contestId)) {
      const disbursements = contestBackend.getContestDisbursements(result.contestId);
      const match = disbursements.find(d => 
        (result.entryId && d.entryId === result.entryId) ||
        (result.ownerUid && (d.ownerUid === result.ownerUid || d.ownerUid === result.ownerUid.replace(/^usr-/, ''))) ||
        (result.userId && (d.ownerUid === result.userId || d.ownerUid === result.userId.replace(/^usr-/, ''))) ||
        (result.userEmail && d.ownerUid && d.ownerUid.toLowerCase().includes(result.userEmail.replace(/[^a-zA-Z0-9]/g, '_')))
      );
      if (match && match.prizeRupees > 0) return match.prizeRupees;
    }
    if (result.rewardWon && typeof result.rewardWon === 'string' && (result.settlementStatus === 'settled' || (result.finalPrizeRupees !== undefined && result.finalPrizeRupees > 0))) {
      const match = result.rewardWon.match(/₹\s*(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 0;
  }, [result]);

  const payoutMessage = React.useMemo(() => {
    return getAttemptPayoutMessage(result);
  }, [result.payoutMessage, result.entryId, result.attemptId]);

  const provisionalPrize = React.useMemo(() => {
    // 1. Explicit provisionalPrizeRupees on attempt
    if (result.provisionalPrizeRupees !== undefined && result.provisionalPrizeRupees > 0) {
      return result.provisionalPrizeRupees;
    }
    // 2. Authoritative backend entry projectedPrizeRupees
    if (result.contestId) {
      const entries = contestBackend.getContestEntries(result.contestId);
      const match = entries.find(e => 
        (result.entryId && e.entryId === result.entryId) ||
        (result.ownerUid && (e.ownerUid === result.ownerUid || e.ownerUid === result.ownerUid.replace(/^usr-/, ''))) ||
        (result.userId && (e.ownerUid === result.userId || e.ownerUid === result.userId.replace(/^usr-/, ''))) ||
        (result.userEmail && e.ownerUid && e.ownerUid.toLowerCase().includes(result.userEmail.replace(/[^a-zA-Z0-9]/g, '_')))
      );
      if (match && match.projectedPrizeRupees !== undefined && match.projectedPrizeRupees > 0) {
        return match.projectedPrizeRupees;
      }
    }
    // 3. Fallback from rewardAmount if active
    if (!isSettled && result.rewardAmount && result.rewardAmount > 0) {
      return result.rewardAmount;
    }
    return 0;
  }, [result, isSettled]);

  const isRank1 = !result.securityBreached && result.rank === 1;
  const isProductWinner = isRank1 && result.rewardType === 'product';
  const isConfirmedWinner = isSettled && !result.securityBreached && actualCreditedPrize > 0 && !isProductWinner;
  const isConfirmedNonWinner = isSettled && !result.securityBreached && actualCreditedPrize === 0 && !isProductWinner;
  const isPendingSettlement = !isSettled && !result.securityBreached;
  const isWinner = isProductWinner || isConfirmedWinner;


  return (
    <div className="w-full space-y-6 pb-6">
      {/* Security Violation Header Card */}
      {result.securityBreached && (
        <div 
          className="p-3.5 sm:p-4 rounded-2xl shadow-xs flex items-center justify-center gap-2.5 text-center animate-in fade-in"
          style={{ backgroundColor: '#FEF2F2', border: '1px solid rgba(209, 67, 67, 0.25)' }}
        >
          <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: '#D14343' }} />
          <h4 className="text-xs sm:text-sm font-bold tracking-wide" style={{ color: '#D14343' }}>
            Security Violation Detected
          </h4>
        </div>
      )}

      {/* Result Hero Header - Clean Solid White Background without color tints and removed sub-lines */}
      <div 
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/90"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="relative z-10 text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            {result.securityBreached 
              ? '🚨 Test Auto-Submitted' 
              : isConfirmedWinner
              ? '🎉 Congratulations You Won!'
              : isProductWinner
              ? '🎉 Congratulations You Won Product Prize!'
              : isRank1 
              ? '🎉 Congratulations You Are Rank 1' 
              : isWinner 
              ? '🔥 Excellent Performance!' 
              : isPendingSettlement
              ? '🎯 Quiz Submitted Successfully!'
              : '👏 Contest Completed'}
          </h2>

          {/* Metric Cards Grid - pure white card background with subtle light borders */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-3">
            <div 
              className="rounded-xl p-3.5 text-center shadow-xs"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Score</div>
              <div className="text-2xl font-black mt-0.5" style={{ color: '#3A81F5' }}>
                {formattedScore}/{effectiveTotalQuestions}
              </div>
            </div>

            <div 
              className="rounded-xl p-3.5 text-center shadow-xs"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Time Taken</div>
              <div className="text-2xl font-black font-mono mt-0.5" style={{ color: '#0F172A' }}>
                {formatTime(result.timeTakenSeconds)}
              </div>
            </div>

            <div 
              className="rounded-xl p-3.5 text-center shadow-xs"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Live Rank</div>
              <div 
                className="text-2xl font-black mt-0.5"
                style={{ color: '#20A5AC' }}
              >
                {result.rank}
              </div>
            </div>

            <div 
              className="rounded-xl p-3.5 text-center shadow-xs"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Accuracy</div>
              <div 
                className="text-2xl font-black mt-0.5" 
                style={{ color: '#5B5FEF' }}
              >
                {accuracy}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prize / Reward Fulfillment Status Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4" style={{ color: '#3A81F5' }} />
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Payout Status</h3>
          </div>
          {result.securityBreached ? (
            <span 
              className="text-[10px] sm:text-[11px] font-bold text-white px-2.5 py-0.5 rounded-md shadow-xs tracking-wider uppercase shrink-0"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              FAILED
            </span>
          ) : (
            <span 
              className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              Completed
            </span>
          )}
        </div>

        {result.securityBreached ? (
          <div 
            className="rounded-xl p-4 shadow-xs space-y-2"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #FFFFFF' }}
          >
            <h4 className="text-base font-black tracking-tight" style={{ color: '#D14343' }}>
              Attempt Disqualified
            </h4>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs font-medium leading-relaxed" style={{ color: '#C65B65' }}>
                Your attempt was disqualified due to a security violation.
              </p>
              {(result.rewardType === 'none' || result.rewardWon === 'Disqualified (Violation)' || !result.rewardWon || result.rewardAmount === 0) && (
                <div className="flex justify-end sm:justify-end shrink-0">
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap" style={{ color: '#C65B65' }}>
                    Not Eligible for Reward
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : isProductWinner ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3.5">
              {todayPrize?.imageUrl ? (
                <img
                  src={todayPrize.imageUrl}
                  alt={todayPrize.title}
                  referrerPolicy="no-referrer"
                  className="w-18 h-18 rounded-xl object-cover border border-amber-300 shadow-xs shrink-0"
                />
              ) : null}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                  1st Rank Winner Reward
                </span>
                <h4 className="text-sm sm:text-base font-bold text-slate-900">{todayPrize.title}</h4>
                <p className="text-xs text-slate-600">
                  Worth ₹{todayPrize.retailValue.toLocaleString('en-IN')} (MRP ₹{todayPrize.mrp.toLocaleString('en-IN')})
                </p>
              </div>
            </div>

            {/* Delivery Tracker Simulation */}
            <div className="pt-3 border-t border-amber-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5 text-amber-900">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  Order Placed via Amazon Prime (Delivery in {todayPrize.estimatedDeliveryDays})
                </span>
                <span className="font-mono text-emerald-700 text-xs">AWB #AZN-94827103</span>
              </div>
              <div className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
                <strong className="text-slate-900">Dispatch Address:</strong> {result.deliveryAddress ? `${result.deliveryAddress.fullName}, ${result.deliveryAddress.streetAddress}, ${result.deliveryAddress.city}, ${result.deliveryAddress.state} - ${result.deliveryAddress.pincode}` : 'Registered Profile Address'}
              </div>
            </div>
          </div>
        ) : isConfirmedWinner ? (
          <div 
            className="rounded-xl p-4 text-center font-bold text-sm sm:text-base shadow-xs"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', color: '#059669' }}
          >
            Congratulations, You Won <span style={{ color: '#059669' }}>₹{actualCreditedPrize}</span>
          </div>

        ) : (!isSettled && !result.securityBreached && provisionalPrize > 0) ? (
          <div 
            className="rounded-xl p-4 text-center shadow-xs"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
          >
            <p className="text-xs sm:text-sm leading-relaxed">
              <span className="font-bold" style={{ color: '#059669' }}>
                Congratulations! Your Current Provisional Prize Is <span style={{ color: '#059669' }}>₹{provisionalPrize}</span>. 
              </span>
              <span className="font-medium" style={{ color: '#334155' }}>
                {payoutMessage}
              </span>
            </p>
          </div>

        ) : (!isSettled && !result.securityBreached) ? (
          <div 
            className="rounded-xl p-4 text-center space-y-1 shadow-xs"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
          >
            <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-normal">
              Contest in progress · Final result & settlement pending
            </p>
          </div>

        ) : (isConfirmedNonWinner || isSettled) ? (
          <div 
            className="rounded-xl p-4 text-center space-y-1 shadow-xs"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
          >
            <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-normal">
              Contest Settled · Better Luck Next Time!
            </p>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="share-your-score-btn"
              onClick={handleShare}
              className="px-4 py-2.5 rounded-xl text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all hover:opacity-95 active:scale-98 cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #5F69EF, #417CF4, #3A81F5, #20A5AC)' }}
            >
              {copiedLink ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Share2 className="w-4 h-4 text-white" />}
              <span>{copiedLink ? 'Score Shared / Copied!' : 'Share your Score'}</span>
            </button>
          </div>

          <button
            id="view-live-leaderboard-btn"
            onClick={() => {
              soundFx.playClick();
              onViewLeaderboard();
            }}
            className="px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:opacity-95 active:scale-98"
            style={{ background: 'linear-gradient(135deg, #5F69EF, #417CF4, #3A81F5, #20A5AC)' }}
          >
            <span>View Full Leaderboard</span>
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Detailed Question Review Section */}
      <div 
        className="rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div 
          className="flex items-center justify-between cursor-pointer select-none border-b border-slate-100 pb-3"
          onClick={() => setShowDetailedReview(!showDetailedReview)}
        >
          <h3 className="text-sm sm:text-base font-bold text-slate-900">Solution & Analysis</h3>
          <button className="text-slate-500 hover:text-slate-900 cursor-pointer p-1">
            {showDetailedReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showDetailedReview && (
          <div className="space-y-3 pt-1">
            {((result.questions && result.questions.length > 0 ? result.questions : questions) || []).filter(q => q && q.id != null).map((q, idx) => {
              const correctIdx = getQuestionCorrectIndex(q);
              const userAnsIndex = result.answers[q.id];
              const isCorrect = userAnsIndex === correctIdx;
              const isUnanswered = userAnsIndex === undefined;

              return (
                <div 
                  key={q.id}
                  className="rounded-xl p-4 space-y-3 shadow-xs"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAECF0' }}
                >
                  {/* Status Label centered in header area */}
                  <div className="flex items-center justify-center">
                    {isCorrect ? (
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-0.5 rounded-full border border-emerald-300">
                        Correct
                      </span>
                    ) : isUnanswered ? (
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-0.5 rounded-full border border-slate-200">
                        Skipped
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-rose-800 bg-rose-100 px-3 py-0.5 rounded-full border border-rose-300">
                        Incorrect
                      </span>
                    )}
                  </div>

                  {/* Question number and text in the same content flow */}
                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                    <span className="font-bold text-slate-700">Q{idx + 1}. </span>
                    {q.question}
                  </p>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = userAnsIndex === optIdx;
                      const isActualCorrect = optIdx === correctIdx;

                      let optBorderAndText = 'border-slate-200 text-slate-700';
                      let optBg = '#FFFFFF';
                      if (isActualCorrect) {
                        optBorderAndText = 'border-emerald-400 text-emerald-900 font-semibold';
                        optBg = '#F0FDF4';
                      } else if (isSelected && !isActualCorrect) {
                        optBorderAndText = 'border-rose-300 text-rose-700 font-medium';
                        optBg = '#FEF2F2';
                      }

                      return (
                        <div 
                          key={optIdx} 
                          className={`p-3 rounded-xl border flex items-center justify-between ${optBorderAndText} shadow-xs`}
                          style={{ backgroundColor: optBg }}
                        >
                          <span className={`text-xs ${isSelected && !isActualCorrect ? 'line-through' : ''}`}>
                            {String.fromCharCode(65 + optIdx)}. {opt}
                          </span>
                          {isActualCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {isSelected && !isActualCorrect && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  <p className="text-xs text-slate-700 leading-relaxed pt-1">
                    <strong className="text-slate-900 font-bold">Explanation: </strong>
                    {q.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
