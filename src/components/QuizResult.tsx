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

interface QuizResultProps {
  result: QuizAttemptResult;
  questions: Question[];
  todayPrize: DailyPrizeItem;
  onViewLeaderboard: () => void;
  onRetakeOrHome: () => void;
}

export const QuizResult: React.FC<QuizResultProps> = ({
  result,
  questions,
  todayPrize,
  onViewLeaderboard,
  onRetakeOrHome
}) => {
  const [showDetailedReview, setShowDetailedReview] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

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

  const accuracy = Math.round((result.score / result.totalQuestions) * 100);
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
      : `🎯 I scored ${result.score}/${result.totalQuestions} (${accuracy}% accuracy) in ${formatTime(result.timeTakenSeconds)} on QuizKart Daily Skill Contest and achieved Rank ${result.rank}! 🏆 Competing for ${todayPrize?.title || 'daily prizes'}! ${siteUrl}`;
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

  const isRank1 = !result.securityBreached && result.rank === 1;
  const isTopRunnerUp = !result.securityBreached && result.rank > 1 && result.rank <= 10;

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

      {/* Result Hero Header */}
      <div className={`relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-sm border ${
        result.securityBreached
          ? 'bg-white border-slate-200/90'
          : isRank1
          ? 'bg-amber-50/70 border-amber-300'
          : isTopRunnerUp
          ? 'bg-indigo-50/70 border-indigo-200'
          : 'bg-white border-slate-200/90'
      }`}>
        <div className="relative z-10 text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            {result.securityBreached 
              ? '🚨 Test Auto-Submitted' 
              : isRank1 
              ? '🎉 Congratulations! You Are Rank #1!' 
              : isTopRunnerUp 
              ? '🔥 Excellent Performance!' 
              : '👏 Contest Completed'}
          </h2>

          {!result.securityBreached && (isRank1 || isTopRunnerUp) && (
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              {isRank1
                ? `You achieved the fastest ${result.score}/${result.totalQuestions} score of the day! Today's prize product dispatch is initiated.`
                : `You ranked ${result.rank} out of ${result.totalParticipants} contestants and qualified for the UPI Cashback reward!`}
            </p>
          )}

          {/* Metric Cards Grid - pure white card background with subtle light borders */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-3">
            <div 
              className="rounded-xl p-3.5 text-center shadow-xs"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Score</div>
              <div className="text-2xl font-black mt-0.5" style={{ color: '#3A81F5' }}>
                {result.score}/{result.totalQuestions}
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
          ) : isRank1 || isTopRunnerUp ? (
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Auto-Settled
            </span>
          ) : (
            <span 
              className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ color: '#FFFFFF', background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
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
        ) : isRank1 ? (
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
        ) : isTopRunnerUp ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                <Smartphone className="w-3.5 h-3.5" />
                Runner-Up Cashback Qualified
              </div>
              <h4 className="text-lg font-black text-slate-900">{result.rewardWon}</h4>
              <p className="text-xs text-slate-600">
                Dispatched via automated instant UPI webhook to <code className="text-indigo-700 font-semibold">{result.upiId || 'Registered UPI ID'}</code>
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500">Settlement ID</div>
              <div className="text-xs font-mono font-bold text-emerald-700">UPI-REF-89472918</div>
            </div>
          </div>
        ) : (
          <div 
            className="rounded-xl p-4 text-center space-y-1.5 shadow-xs"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
          >
            <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-normal">
              Your Rank: {result.rank} | Keep Improving, Keep Winning!
            </p>
          </div>
        )}

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
            {(questions || []).filter(q => q && q.id != null).map((q, idx) => {
              const userAnsIndex = result.answers[q.id];
              const isCorrect = userAnsIndex === q.correctIndex;
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
                      const isActualCorrect = optIdx === q.correctIndex;

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
