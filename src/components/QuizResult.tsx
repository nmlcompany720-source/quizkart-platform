import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Award, 
  Gift, 
  Truck, 
  Smartphone, 
  Share2, 
  RotateCcw, 
  ArrowRight, 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles, 
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
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
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
    const siteUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
    const shareText = `🎯 I scored ${result.score}/10 (${accuracy}% accuracy) in ${formatTime(result.timeTakenSeconds)} on QuizKart Daily Skill Contest and achieved Rank #${result.rank}! 🏆 Competing for ${todayPrize.title}!`;
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
          copyToClipboard(`${shareText} ${siteUrl}`);
        }
      }
    } else {
      copyToClipboard(`${shareText} ${siteUrl}`);
    }
  };

  const isRank1 = !result.securityBreached && result.rank === 1;
  const isTopRunnerUp = !result.securityBreached && result.rank > 1 && result.rank <= 10;

  return (
    <div className="w-full space-y-6 pb-6">
      {/* Security Breach Warning Banner if test was terminated due to anti-cheating breach */}
      {result.securityBreached && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 border-2 border-rose-500 shadow-sm flex items-start gap-3.5 text-rose-900 animate-in fade-in">
          <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-rose-950 uppercase tracking-wide">
              Security Breach Detected: Live Camera or External Tool Detected. Test Auto-Submitted.
            </h4>
            <p className="text-xs text-rose-800 leading-relaxed font-medium">
              {result.securityBreachReason || 'An unauthorized tab switch, window minimization, or camera detection was flagged by the proctoring engine.'} Remaining unattempted questions have been scored as 0.
            </p>
          </div>
        </div>
      )}

      {/* Result Hero Header */}
      <div className={`relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-sm border ${
        result.securityBreached
          ? 'bg-rose-50/50 border-rose-200'
          : isRank1
          ? 'bg-amber-50/70 border-amber-300'
          : isTopRunnerUp
          ? 'bg-indigo-50/70 border-indigo-200'
          : 'bg-white border-slate-200/90'
      }`}>
        <div className="relative z-10 text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-white border border-slate-200 text-slate-700 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {result.securityBreached ? 'Proctor Enforcement Logged' : 'Official Score Verified'}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            {result.securityBreached 
              ? '🚨 Contest Auto-Submitted' 
              : isRank1 
              ? '🎉 Congratulations! You Are Rank #1!' 
              : isTopRunnerUp 
              ? '🔥 Excellent Performance!' 
              : '👏 Contest Completed'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            {result.securityBreached
              ? 'Security violation detected during live proctoring. The test session was immediately locked.'
              : isRank1
              ? `You achieved the fastest ${result.score}/10 score of the day! Today's prize product dispatch is initiated.`
              : isTopRunnerUp
              ? `You ranked #${result.rank} out of ${result.totalParticipants} contestants and qualified for the UPI Cashback reward!`
              : `You scored ${result.score}/10 in ${formatTime(result.timeTakenSeconds)}. Sharpen your speed to climb into the top 10!`}
          </p>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-3">
            <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-center shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Score</div>
              <div className="text-2xl font-black text-amber-600 mt-0.5">
                {result.score}<span className="text-xs font-normal text-slate-500">/{result.totalQuestions}</span>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-center shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Time Taken</div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                {formatTime(result.timeTakenSeconds)}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-center shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Live Rank</div>
              <div className="text-2xl font-black text-emerald-600 mt-0.5">
                #{result.rank}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-center shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Accuracy</div>
              <div className="text-2xl font-black text-indigo-600 mt-0.5">
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
            <Gift className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Reward & Payout Settlement Status</h3>
          </div>
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Auto-Settled
          </span>
        </div>

        {isRank1 ? (
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
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
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
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-1.5">
            <p className="text-xs sm:text-sm font-semibold text-slate-800">
              You finished at Rank #{result.rank}. Top 10 contestants receive prizes and cashbacks today.
            </p>
            <p className="text-xs text-slate-500">
              Practice in free demo mode or enter tomorrow's 10 AM Drop to claim the #1 Prize Product!
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="share-your-score-btn"
              onClick={handleShare}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer border border-slate-200"
            >
              {copiedLink ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-indigo-600" />}
              <span>{copiedLink ? 'Score Shared / Copied!' : 'Share your Score'}</span>
            </button>
          </div>

          <button
            id="view-live-leaderboard-btn"
            onClick={() => {
              soundFx.playClick();
              onViewLeaderboard();
            }}
            className="px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer gemini-glow"
            style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
          >
            <Trophy className="w-4 h-4" />
            <span>View Full Leaderboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detailed Question Review Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4">
        <div 
          className="flex items-center justify-between cursor-pointer select-none border-b border-slate-100 pb-3"
          onClick={() => setShowDetailedReview(!showDetailedReview)}
        >
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Question-by-Question Solution & Analysis</h3>
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
              {result.score} Correct, {result.totalQuestions - result.score} Incorrect
            </span>
          </div>
          <button className="text-slate-500 hover:text-slate-900 cursor-pointer">
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
                  className={`rounded-xl border p-4 space-y-3 ${
                    isCorrect 
                      ? 'border-emerald-200 bg-emerald-50/40' 
                      : isUnanswered 
                      ? 'border-slate-200 bg-slate-50/60' 
                      : 'border-rose-200 bg-rose-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-500">Q{idx + 1}.</span>
                      <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        {q.category}
                      </span>
                    </div>
                    <div>
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Correct (+1)
                        </span>
                      ) : isUnanswered ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                          Skipped
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300">
                          <XCircle className="w-3.5 h-3.5" /> Incorrect
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                    {q.question}
                  </p>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = userAnsIndex === optIdx;
                      const isActualCorrect = optIdx === q.correctIndex;

                      let optClass = 'border-slate-200 bg-white text-slate-700';
                      if (isActualCorrect) {
                        optClass = 'border-emerald-300 bg-emerald-50 text-emerald-900 font-bold';
                      } else if (isSelected && !isActualCorrect) {
                        optClass = 'border-rose-300 bg-rose-50 text-rose-900 line-through';
                      }

                      return (
                        <div key={optIdx} className={`p-3 rounded-xl border flex items-center justify-between ${optClass}`}>
                          <span className="text-xs">{String.fromCharCode(65 + optIdx)}. {opt}</span>
                          {isActualCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {isSelected && !isActualCorrect && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                    <strong className="text-slate-900">Explanation: </strong>
                    {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
