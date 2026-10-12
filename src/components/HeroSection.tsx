import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Trophy, 
  Zap, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Truck, 
  Flame, 
  Gift, 
  ArrowRight, 
  Sparkles,
  Users,
  Info,
  Smartphone,
  Coins,
  Calendar,
  Bell
} from 'lucide-react';
import { DailyPrizeItem, PoolEconomics, ActiveContest } from '../types';
import { UPCOMING_PRIZES } from '../data/quizData';
import { soundFx } from '../utils/audio';
import { parseTargetTimestamp, getCountdown, formatCountdown } from '../utils/timerUtils';
import { calculateDynamicPool } from '../utils/poolUtils';

// Official Website Primary Brand Gradient: #5F69EF -> #417CF4 -> #3A81F5 -> #20A5AC (Main Teal: #20A5AC, Main Blue: #4A7DF3)
const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const BRAND_TEXT_GRADIENT_STYLE: React.CSSProperties = {
  backgroundImage: BRAND_GRADIENT,
  WebkitBackgroundImage: BRAND_GRADIENT,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: '#20A5AC',
};

interface HeroSectionProps {
  todayPrize: DailyPrizeItem;
  poolData: PoolEconomics;
  onEnterQuiz: () => void;
  onViewLeaderboard: () => void;
  onViewTransparency: () => void;
  onStartDemoPractice?: () => void;
  onShowNotice?: (message: string) => void;
  activeContest?: ActiveContest | null;
  contests?: ActiveContest[];
  onContestExpired?: (contestId: string) => void;
  onContestStarted?: (contestId: string) => void;
  onLiveStateChange?: (isLive: boolean) => void;
  contestDurationSeconds?: number;
}

// Full-featured Upcoming Contest Card matching exact Live Card layout
const UpcomingContestCard: React.FC<{
  contest: ActiveContest;
  nowMs: number;
  onContestStarted?: (contestId: string) => void;
  onEnterQuiz: () => void;
}> = ({ contest, nowMs, onContestStarted, onEnterQuiz }) => {
  const isCash = contest.type === 'cash';
  const img = isCash
    ? (contest.cashConfig?.cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80')
    : (contest.productConfig?.productImageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80');
  const val = isCash
    ? (contest.cashConfig?.prizePool || 0)
    : (contest.productConfig?.retailValue || 0);
  
  const targetMs = parseTargetTimestamp(contest.scheduledTime);
  const cd = getCountdown(targetMs, nowMs);
  const countdownFormatted = formatCountdown(cd);
  
  // Pre-start / Upcoming Zero State: 0 / Max and 0% Pool Filling
  const maxCap = contest.maxParticipants || 50;
  const poolMetrics = calculateDynamicPool({
    maxParticipants: maxCap,
    realJoinsCount: contest.realJoins || 0,
    isUpcoming: true,
    contestId: contest.id,
    nowMs
  });

  // Auto-transition from Upcoming to LIVE the exact moment start timer triggers
  const hasTriggeredRef = useRef(false);
  useEffect(() => {
    if (cd.isFinished && !hasTriggeredRef.current && targetMs > 0) {
      hasTriggeredRef.current = true;
      onContestStarted?.(contest.id);
    }
  }, [cd.isFinished, contest.id, onContestStarted, targetMs]);

  const bannerOverlayTitle = contest.overlayTitle || (
    contest.type === 'product' && contest.productConfig?.itemTitle ? contest.productConfig.itemTitle : ''
  );

  const renderBannerOverlay = (text: string) => {
    const match = text.match(/^(.*?)(₹\s*[\d,]+(?:\.\d+)?.*)$/);
    if (match) {
      return (
        <>
          <span className="text-white font-semibold">{match[1]}</span>
          <span className="text-emerald-400 font-bold">{match[2]}</span>
        </>
      );
    }
    return <span className="text-white font-semibold">{text}</span>;
  };

  const badgeText = (contest.badge || (isCash ? 'INSTANT UPI' : 'RANK #1')).toUpperCase();
  const winnersCount = contest.winnersCount || (isCash ? 5 : 1);

  return (
    <div className="rounded-2xl bg-white p-4.5 shadow-sm border border-slate-200/90 transition-all hover:border-slate-300 flex flex-col justify-between group" style={{ backgroundColor: '#FFFFFF' }}>
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <div 
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
            >
              {isCash ? (
                <Coins className="w-3.5 h-3.5 text-white" />
              ) : (
                <Gift className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <h3 
              className="text-xs font-black uppercase tracking-wider truncate"
              style={{
                backgroundImage: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {contest.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
              🏆 {winnersCount} {winnersCount === 1 ? 'Winner' : 'Winners'}
            </span>
            <span 
              className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase shrink-0 text-white shadow-xs"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
            >
              UPCOMING
            </span>
          </div>
        </div>

        <div className="relative aspect-video rounded-xl bg-slate-100 mb-3 flex items-center justify-center overflow-hidden border border-slate-200">
          {img ? (
            <img 
              src={img} 
              alt={contest.title} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
            {bannerOverlayTitle ? (
              <p className="text-[11px] font-semibold truncate">
                {renderBannerOverlay(bannerOverlayTitle)}
              </p>
            ) : null}
            {val > 0 ? (
              <p className="font-extrabold text-sm text-white flex items-center gap-1.5 mt-0.5">
                <span>
                  Value: <span className="text-emerald-400 font-extrabold">₹{val.toLocaleString('en-IN')}</span>
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Entry Fee</span>
            <span className="font-extrabold text-slate-900"><span className="text-emerald-600 font-extrabold">₹{contest.entryFee}</span></span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600 font-medium">Participants</span>
            <span 
              className="font-extrabold"
              style={{
                backgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                WebkitBackgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: '#20A5AC',
              }}
            >
              {poolMetrics.displayCount} / {poolMetrics.maxCapacity}
            </span>
          </div>

          {!isCash && (
            <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-600">
              <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Delivered via {contest.productConfig?.deliveryPartner || 'Amazon / Meesho'}</span>
            </div>
          )}

          <div className="pt-2 space-y-1.5 border-t border-slate-100">
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-slate-600">Pool Filling</span>
              <span 
                className="font-extrabold"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                  WebkitBackgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: '#20A5AC',
                }}
              >
                {poolMetrics.progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div 
                className="h-full rounded-full transition-all duration-500" 
                style={{ 
                  width: `${poolMetrics.progressPercent}%`,
                  background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)'
                }} 
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 mt-1 flex flex-col items-center">
        <button
          type="button"
          onClick={() => {
            soundFx.playClick();
            onEnterQuiz();
          }}
          className="w-full py-2.5 px-4 rounded-xl text-white font-mono font-bold text-xs flex items-center justify-center transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer tracking-wider"
          style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
        >
          <span>STARTS IN: {countdownFormatted}</span>
        </button>
      </div>
    </div>
  );
};

export const HeroSection: React.FC<HeroSectionProps> = ({
  todayPrize,
  poolData,
  onEnterQuiz,
  onViewLeaderboard,
  onViewTransparency,
  onStartDemoPractice,
  onShowNotice,
  activeContest,
  contests = [],
  onContestExpired,
  onContestStarted,
  onLiveStateChange,
  contestDurationSeconds
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 500); // 500ms smooth ticking rate for animated progress
    return () => clearInterval(timer);
  }, []);

  // Dynamic boosted higher participant count for public front-end card urgency
  const boostedParticipants = useMemo(() => {
    const base = poolData.activeParticipants || 41;
    return base >= 30 ? base : Math.min(poolData.targetParticipants - 9, 41);
  }, [poolData.activeParticipants, poolData.targetParticipants]);

  // Detect whether a valid real admin tournament exists and is actively running
  const realTournament = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}

    const isRealActive = (c?: ActiveContest | null) => {
      if (!c || !c.id) return false;
      if (deletedList.includes(c.id)) return false;
      if (c.id === 'CNT-CASH-LIVE' || c.id === 'CNT-FALLBACK-PLACEHOLDER' || c.id === 'CNT-PROD-101' || c.id === 'CNT-CASH-202') return false;
      if (c.status !== 'active' && c.status !== 'full') return false;
      const timeStr = c.endTime || c.scheduledTime;
      if (timeStr) {
        const target = parseTargetTimestamp(timeStr);
        if (target > 0 && nowMs >= target) return false;
      }
      return true;
    };

    if (isRealActive(activeContest)) {
      return activeContest;
    }

    const valid = (contests || []).find(isRealActive);
    if (valid) return valid;

    // Also detect scheduled upcoming tournament
    const isRealUpcoming = (c?: ActiveContest | null) => {
      if (!c || !c.id) return false;
      if (deletedList.includes(c.id)) return false;
      if (c.id === 'CNT-CASH-LIVE' || c.id === 'CNT-FALLBACK-PLACEHOLDER' || c.id === 'CNT-PROD-101' || c.id === 'CNT-CASH-202') return false;
      if (c.status === 'scheduled') return true;
      if (c.scheduledTime) {
        const target = parseTargetTimestamp(c.scheduledTime);
        if (target > 0 && target > nowMs) return true;
      }
      return false;
    };

    if (isRealUpcoming(activeContest)) {
      return activeContest;
    }

    const upcoming = (contests || []).find(isRealUpcoming);
    return upcoming || null;
  }, [activeContest, contests, nowMs]);

  const effectiveContest = realTournament;
  const hasRealActiveContest = Boolean(effectiveContest);

  // Compute countdown target timestamp & prefix status early for pool state
  const isUpcoming = useMemo(() => {
    if (!effectiveContest) return true;
    if (effectiveContest.status === 'scheduled') {
      const target = parseTargetTimestamp(effectiveContest.scheduledTime);
      if (target > 0) {
        return nowMs < target;
      }
      return true;
    }
    if (effectiveContest.scheduledTime) {
      const target = parseTargetTimestamp(effectiveContest.scheduledTime);
      if (target > 0 && nowMs < target) {
        return true;
      }
    }
    return false;
  }, [effectiveContest, nowMs]);

  // Report live state to parent for synchronization with Top Lightning Nav Icon
  const isContestCardLive = Boolean(hasRealActiveContest && !isUpcoming);
  useEffect(() => {
    onLiveStateChange?.(isContestCardLive);
  }, [isContestCardLive, onLiveStateChange]);

  // Dynamic Pool Filling calculation for Live Contest (Delayed smooth base + auto-expansion)
  const liveMaxCap = effectiveContest?.maxParticipants || poolData.targetParticipants || 50;
  const liveRealJoins = effectiveContest?.realJoins !== undefined 
    ? effectiveContest.realJoins 
    : (poolData.activeParticipants || 0);
  const livePoolMetrics = calculateDynamicPool({
    maxParticipants: liveMaxCap,
    realJoinsCount: liveRealJoins,
    isUpcoming: isUpcoming,
    contestId: effectiveContest?.id || 'live_round',
    activatedAt: effectiveContest?.activatedAt,
    randomBasePercent: effectiveContest?.randomBasePercent,
    nowMs
  });
  const liveDisplayParticipants = livePoolMetrics.displayCount;
  const liveDisplayMaxCap = livePoolMetrics.maxCapacity;
  const progressPercent = livePoolMetrics.progressPercent;
  const isLivePoolFull = livePoolMetrics.isPoolFull || effectiveContest?.status === 'full';

  const isCashTournament = effectiveContest?.type === 'cash' || todayPrize.category?.toLowerCase().includes('cash');

  // Prize headline value
  const prizeDisplayValue = effectiveContest?.type === 'cash' && effectiveContest.cashConfig
    ? `₹${effectiveContest.cashConfig.prizePool.toLocaleString('en-IN')}`
    : `₹${todayPrize.retailValue.toLocaleString('en-IN')}`;

  // Dynamic Entry Fee: Strictly ₹10 in Upcoming / Inactive state, dynamic active fee when live
  const currentEntryFee = (isUpcoming || !hasRealActiveContest)
    ? 10
    : (effectiveContest?.entryFee || poolData.entryFee || 100);
  const upcomingContests = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    return (contests || []).filter(c => 
      c && 
      c.id && 
      !deletedList.includes(c.id) && 
      c.id !== effectiveContest?.id && 
      c.id !== 'CNT-CASH-LIVE' &&
      c.id !== 'CNT-FALLBACK-PLACEHOLDER' &&
      c.id !== 'CNT-PROD-101' &&
      c.id !== 'CNT-CASH-202' &&
      c.status === 'scheduled'
    );
  }, [contests, effectiveContest?.id]);

  const scheduledTimeStr = isUpcoming 
    ? (effectiveContest?.scheduledTime || todayPrize.scheduledTime)
    : (effectiveContest?.endTime || effectiveContest?.scheduledTime || todayPrize.scheduledTime);
  const targetMs = parseTargetTimestamp(scheduledTimeStr);
  const countdown = getCountdown(targetMs, nowMs);
  const countdownFormatted = formatCountdown(countdown);
  const timerPrefix = isUpcoming ? 'STARTS IN: ' : 'ENDS IN: ';

  // Track handled expired contest IDs to avoid duplicate calls and render loops
  const handledExpiredRef = useRef<Set<string>>(new Set());

  // Auto-expire contest when live countdown hits zero (00:00:00)
  useEffect(() => {
    if (
      effectiveContest && 
      effectiveContest.status === 'active' && 
      !isUpcoming && 
      countdown.isFinished &&
      !handledExpiredRef.current.has(effectiveContest.id)
    ) {
      handledExpiredRef.current.add(effectiveContest.id);
      onContestExpired?.(effectiveContest.id);
    }
  }, [effectiveContest?.id, effectiveContest?.status, isUpcoming, countdown.isFinished, onContestExpired]);

  // Auto-start upcoming contest when start countdown hits zero (00:00:00)
  const handledStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      effectiveContest && 
      (effectiveContest.status === 'scheduled' || isUpcoming) && 
      countdown.isFinished &&
      !handledStartedRef.current.has(effectiveContest.id)
    ) {
      handledStartedRef.current.add(effectiveContest.id);
      onContestStarted?.(effectiveContest.id);
    }
  }, [effectiveContest?.id, effectiveContest?.status, isUpcoming, countdown.isFinished, onContestStarted]);

  // Clean, short, professional upcoming time formatter: "03:25 PM • 13 Sep"
  const formatUpcomingTime = (scheduledTime?: string | number | null): string => {
    if (!scheduledTime) return '03:25 PM • 13 Sep';
    const ts = parseTargetTimestamp(scheduledTime);
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(scheduledTime);

    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate().toString().padStart(2, '0');
    const month = monthNames[d.getMonth()];
    return `${formattedHours}:${formattedMinutes} ${ampm} • ${day} ${month}`;
  };

  // Banner Overlay Text: Set text strictly to White, ONLY prize amount in Green
  const renderBannerOverlay = (text: string) => {
    const match = text.match(/^(.*?)(₹\s*[\d,]+(?:\.\d+)?.*)$/);
    if (match) {
      return (
        <>
          <span className="text-white font-semibold">{match[1]}</span>
          <span className="text-emerald-400 font-bold">{match[2]}</span>
        </>
      );
    }
    return <span className="text-white font-semibold">{text}</span>;
  };

  const isIdleOrUpcoming = !hasRealActiveContest || isUpcoming;
  const activeContestTitle = isIdleOrUpcoming 
    ? 'Next Contest Starting Soon...' 
    : (effectiveContest?.title || '');
  const activeContestBadge = isUpcoming ? 'UPCOMING' : (effectiveContest?.badge || todayPrize.badge || (isCashTournament ? 'INSTANT UPI' : '• LIVE'));

  // Flexible 2-line title wrapping (Live Contest Card Only) based on word count:
  // e.g. 1-2 words on 1 line (liveLine2 is empty); 3-4 words split gracefully across 2 lines.
  const rawLiveTitle = (effectiveContest?.title || 'Cash Tournament Prize').trim();
  const liveTitleWords = rawLiveTitle.split(/\s+/).filter(Boolean);
  let liveLine1 = rawLiveTitle;
  let liveLine2 = '';

  if (liveTitleWords.length <= 2) {
    liveLine1 = liveTitleWords.join(' ');
    liveLine2 = '';
  } else if (liveTitleWords.length === 3) {
    liveLine1 = liveTitleWords.slice(0, 2).join(' ');
    liveLine2 = liveTitleWords.slice(2).join(' ');
  } else {
    const mid = Math.ceil(liveTitleWords.length / 2);
    liveLine1 = liveTitleWords.slice(0, mid).join(' ');
    liveLine2 = liveTitleWords.slice(mid).join(' ');
  }

  const titleLine1 = isIdleOrUpcoming ? 'Next Contest' : liveLine1;
  const titleLine2 = isIdleOrUpcoming ? 'Starting Soon...' : liveLine2;

  // Independently configurable banner overlay title (empty if not specified by admin)
  const bannerOverlayTitle = effectiveContest?.overlayTitle || (
    effectiveContest?.type === 'product' && effectiveContest.productConfig?.itemTitle
      ? effectiveContest.productConfig.itemTitle
      : ''
  );

  // Dynamic Questions count and Minutes duration from configured contest / database
  const dynamicQuestionsCount = effectiveContest?.questionIds && effectiveContest.questionIds.length > 0
    ? effectiveContest.questionIds.length
    : 10;

  const timerSecs = Number(localStorage.getItem('quizkart_global_quiz_timer')) || 600;
  const scheduledStartMs = effectiveContest?.scheduledTime ? parseTargetTimestamp(effectiveContest.scheduledTime) : 0;
  const scheduledEndMs = effectiveContest?.endTime ? parseTargetTimestamp(effectiveContest.endTime) : 0;
  const diffMins = (scheduledStartMs && scheduledEndMs && scheduledEndMs > scheduledStartMs)
    ? Math.round((scheduledEndMs - scheduledStartMs) / 60000)
    : 0;
  const dynamicMinutesCount = (diffMins > 0 && diffMins <= 180)
    ? diffMins
    : Math.max(1, Math.round(timerSecs / 60));

  // User-friendly toast / modal message handler
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  // Focus highlight state for the Join Now button in the second box
  const [isJoinHighlighted, setIsJoinHighlighted] = useState(false);

  // Coming soon notice for when no tournament is actively live
  const handleShowComingSoon = () => {
    soundFx.playClick();
    const msg = "No contest live right now. Stay tuned for the next round!";
    if (onShowNotice) {
      onShowNotice(msg);
    } else {
      setLocalNotice(msg);
      setTimeout(() => {
        setLocalNotice((curr) => curr === msg ? null : curr);
      }, 4000);
    }
  };

  // Contest Full error toast alert styled in primary brand accent color
  const handleShowContestFull = () => {
    soundFx.playWrong();
    const msg = "Contest Full! Stay tuned for the next contest.";
    if (onShowNotice) {
      onShowNotice(msg);
    }
    setLocalNotice(msg);
    setTimeout(() => {
      setLocalNotice((curr) => curr === msg ? null : curr);
    }, 4500);
  };

  // Smooth scroll and redirect to Join Now button when clicking the timer bar
  const handleTimerBarClick = () => {
    soundFx.playClick();
    const joinBtn = document.getElementById('hero-enter-quiz-cta');
    if (joinBtn) {
      joinBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsJoinHighlighted(true);
      joinBtn.classList.add('brand-gradient-focus-ring');
      setTimeout(() => {
        setIsJoinHighlighted(false);
        joinBtn.classList.remove('brand-gradient-focus-ring');
      }, 1800);
    }

    if (isUpcoming || !hasRealActiveContest) {
      handleShowComingSoon();
    }
  };

  return (
    <div className="space-y-6 pb-6 relative">
      {/* Sleek User-Friendly Floating Notification Toast */}
      {localNotice && (
        <div 
          id="contest-status-notice-toast"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] sm:w-auto px-5 py-3.5 rounded-2xl text-white shadow-xl flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            background: BRAND_GRADIENT,
            color: '#FFFFFF',
            boxShadow: '0 4px 14px rgba(74, 125, 243, 0.35)',
          }}
        >
          <div className="text-xs sm:text-sm font-bold leading-snug text-center" style={{ color: '#FFFFFF' }}>
            {localNotice}
          </div>
        </div>
      )}

      {/* 3-Column High-Density Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (col-span-3): Today's Mega Prize Card (Rendered ONLY when a real active contest exists) */}
        {hasRealActiveContest && (
          <aside className="lg:col-span-3 flex flex-col gap-4">
            <div className="rounded-2xl bg-white p-4.5 shadow-sm border border-slate-200/90 transition-all hover:border-slate-300" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <div 
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
                  >
                    {isCashTournament ? (
                      <Coins className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Gift className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <h3 
                    className="text-xs font-black uppercase tracking-wider truncate"
                    style={BRAND_TEXT_GRADIENT_STYLE}
                  >
                    {activeContestTitle}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                    🏆 {effectiveContest?.winnersCount || (isCashTournament ? 5 : 1)} Winners
                  </span>
                  <span 
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase shrink-0 text-white shadow-xs"
                    style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
                  >
                    {activeContestBadge}
                  </span>
                </div>
              </div>

              <div className="relative aspect-video rounded-xl bg-slate-100 mb-3 flex items-center justify-center overflow-hidden border border-slate-200 group">
                {(effectiveContest?.type === 'product' && effectiveContest.productConfig?.productImageUrl ? effectiveContest.productConfig.productImageUrl : (effectiveContest?.cashConfig?.cashImageUrl || todayPrize.imageUrl)) ? (
                  <img 
                    src={effectiveContest?.type === 'product' && effectiveContest.productConfig?.productImageUrl ? effectiveContest.productConfig.productImageUrl : (effectiveContest?.cashConfig?.cashImageUrl || todayPrize.imageUrl)} 
                    alt={activeContestTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                  {bannerOverlayTitle ? (
                    <p className="text-[11px] font-semibold truncate">
                      {renderBannerOverlay(bannerOverlayTitle)}
                    </p>
                  ) : null}
                  {(() => {
                    const configuredPrize = effectiveContest?.type === 'cash'
                      ? (effectiveContest.cashConfig?.prizePool || 0)
                      : (effectiveContest?.type === 'product' ? (effectiveContest.productConfig?.retailValue || 0) : 0);
                    if (configuredPrize <= 0) return null;
                    return (
                      <p className="font-extrabold text-sm text-white flex items-center gap-1.5 mt-0.5">
                        <span>
                          Value: <span className="text-emerald-400 font-extrabold">₹{configuredPrize.toLocaleString('en-IN')}</span>
                        </span>
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Entry Fee</span>
                  <span className="font-extrabold text-slate-900"><span className="text-emerald-600 font-extrabold">₹{currentEntryFee}</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Participants</span>
                  <span 
                    className="font-extrabold"
                    style={{
                      backgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                      WebkitBackgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: '#20A5AC',
                    }}
                  >
                    {liveDisplayParticipants} / {liveDisplayMaxCap}
                  </span>
                </div>

                {/* Delivery Partner Text: Display ONLY for Product Tournaments, hide for Money/Cash Tournaments */}
                {!isCashTournament && (
                  <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Delivered via {todayPrize.deliveryPartner || 'Amazon / Meesho'}</span>
                  </div>
                )}

                {/* Sleek Rounded Pool Filling Bar right above Join Now button */}
                <div className="pt-2 space-y-1.5 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-semibold text-slate-600">Pool Filling</span>
                    <span 
                      className="font-extrabold"
                      style={{
                        backgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                        WebkitBackgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        color: '#20A5AC',
                      }}
                    >
                      {progressPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                         width: `${progressPercent}%`,
                         background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)'
                      }} 
                    />
                  </div>
                </div>

                {/* CTA Action Button / Timer Fusion: Pure live ticking countdown with status prefix */}
                <div className="pt-2 flex flex-col items-center">
                  <button
                    id="hero-banner-join-now-btn"
                    onClick={() => {
                      if (isLivePoolFull) {
                        handleShowContestFull();
                        return;
                      }
                      handleTimerBarClick();
                    }}
                    title="Click to explore"
                    className="w-full py-2.5 px-4 rounded-xl text-white font-mono font-bold text-xs flex items-center justify-center transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer tracking-wider"
                    style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
                  >
                    <span>{isLivePoolFull ? 'POOL FULL (100%)' : `${timerPrefix}${countdownFormatted}`}</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Center Column: Primary Arena Hero Card / Contest Details Section (image 1000155979) */}
        <section className={`${hasRealActiveContest ? 'lg:col-span-6' : 'lg:col-span-8'} flex flex-col gap-4`}>
          <div className="relative flex-1 rounded-2xl bg-white p-6 sm:p-8 shadow-sm border border-slate-200/90 overflow-hidden flex flex-col justify-between" style={{ backgroundColor: '#FFFFFF' }}>
            {/* Top Gradient Line: Exact 3-color brand gradient matching 'Join Now' */}
            <div 
              className="absolute top-0 left-0 right-0 h-1"
              style={{ background: 'linear-gradient(90deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
            />

            <div className="space-y-6">
              {/* Header Row: Title on Left (Line 1 + Line 2) and Status Badge on Top-Right */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    {/* Line 1 (Aligned beside badge on top-right) */}
                    <h1 
                      className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight font-sans truncate"
                      style={BRAND_TEXT_GRADIENT_STYLE}
                    >
                      {titleLine1}
                    </h1>

                    {/* Line 2 (Immediately below Line 1, displayed when second line exists) */}
                    {Boolean(titleLine2) && (
                      <h2 
                        className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight font-sans truncate"
                        style={BRAND_TEXT_GRADIENT_STYLE}
                      >
                        {titleLine2}
                      </h2>
                    )}
                  </div>

                  {/* Micro Status Badges: Positioned strictly at top-right corner */}
                  <div className="shrink-0 pt-0.5">
                    {isUpcoming ? (
                      <span 
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black tracking-wide text-white uppercase shadow-xs select-none"
                        style={{
                          background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)'
                        }}
                      >
                        UPCOMING
                      </span>
                    ) : (
                      <span 
                        className="inline-flex items-center text-emerald-600 font-mono font-bold text-xs tracking-wider select-none"
                      >
                        [ LIVE ]
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-heading text */}
                <div className="space-y-1 text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  <p>
                    100% Fair & Skill-Based Competition • Test Your Speed, Master Knowledge & Claim Guaranteed Cash
                  </p>
                </div>
              </div>

              {/* High Density Metric Cards: Pure White Background with Subtle Gradient Tint Border */}
              <div className="grid grid-cols-3 gap-3 py-1 items-stretch">
                {/* Box 1: Dynamic Questions */}
                <div 
                  className="rounded-xl border p-3 text-center transition-all shadow-xs flex flex-col justify-center items-center"
                  style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF' }}
                >
                  <div className="text-base sm:text-xl font-black text-slate-900">{dynamicQuestionsCount}</div>
                  <div className="text-[10px] text-slate-600 font-medium">Questions</div>
                </div>

                {/* Box 2: Entry Fee */}
                <div 
                  className="rounded-xl border p-3 text-center transition-all shadow-xs flex flex-col justify-center items-center"
                  style={{ backgroundColor: '#FFFFFF', borderColor: '#CFFAFE' }}
                >
                  <div className="text-base sm:text-xl font-black text-slate-900">
                    <span className="text-emerald-600 font-black">₹{currentEntryFee}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 font-medium">Entry Fee</div>
                </div>

                {/* Box 3: Dynamic Minutes */}
                <div 
                  className="rounded-xl border p-3 text-center transition-all shadow-xs flex flex-col justify-center items-center"
                  style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF' }}
                >
                  <div className="text-base sm:text-xl font-black text-slate-900">{dynamicMinutesCount}</div>
                  <div className="text-[10px] text-slate-600 font-medium">Minutes</div>
                </div>
              </div>

              {/* Action Buttons: Join Now for active tournament, Coming Soon when in upcoming state, CONTEST FULL when filled */}
              <div className="flex items-stretch gap-3 pt-2">
                <div className="relative w-full">
                  {/* Focus highlight ring with brand gradient border & soft glow effect */}
                  <div 
                    className={`absolute -inset-[3px] rounded-2xl pointer-events-none transition-all duration-300 ${
                      isJoinHighlighted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                    }`}
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)',
                      boxShadow: '0 0 14px rgba(37, 99, 235, 0.6)',
                    }}
                  />
                  <button
                    id="hero-enter-quiz-cta"
                    aria-disabled={isUpcoming || !hasRealActiveContest || isLivePoolFull}
                    disabled={isUpcoming || !hasRealActiveContest || isLivePoolFull}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isUpcoming || !hasRealActiveContest) {
                        handleShowComingSoon();
                        return;
                      }
                      if (isLivePoolFull) {
                        handleShowContestFull();
                        return;
                      }
                      soundFx.playClick();
                      onEnterQuiz();
                    }}
                    className={`relative z-10 w-full flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-sm text-white select-none transition-all shadow-md ${
                      (isUpcoming || !hasRealActiveContest)
                        ? 'cursor-not-allowed opacity-90'
                        : isLivePoolFull
                        ? 'cursor-not-allowed opacity-75 shadow-none'
                        : 'cursor-pointer opacity-100 active:scale-98 hover:shadow-lg'
                    }`}
                    style={{
                      background: isLivePoolFull
                        ? 'linear-gradient(135deg, #64748B 0%, #475569 100%)'
                        : 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)',
                      color: '#FFFFFF',
                      cursor: (isUpcoming || !hasRealActiveContest || isLivePoolFull) ? 'not-allowed' : 'pointer',
                      opacity: (isUpcoming || !hasRealActiveContest) ? 0.9 : (isLivePoolFull ? 0.75 : 1),
                    }}
                  >
                    {(isUpcoming || !hasRealActiveContest) ? 'Coming Soon' : (isLivePoolFull ? 'CONTEST FULL' : 'Join Now')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Compact Live Leaderboard Snippet (image 1000155979) */}
        <aside className={`${hasRealActiveContest ? 'lg:col-span-3' : 'lg:col-span-4'} flex flex-col gap-4`}>
          <div className="flex flex-1 flex-col rounded-2xl bg-white shadow-sm border border-slate-200/90 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            {/* Header: Pure White background, sub-text removed, brand gradient Full Board button */}
            <div className="border-b border-slate-100 p-4 flex items-center justify-between bg-white" style={{ backgroundColor: '#FFFFFF' }}>
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#417CF4]" />
                  Live Standings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { soundFx.playClick(); onViewLeaderboard(); }}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              >
                <span>Full Board →</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
              <table className="w-full text-left text-xs bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                {/* Table headers: pure white background (#FFFFFF), clean dark black text */}
                <thead 
                  className="sticky top-0 text-[10px] uppercase font-extrabold select-none border-b border-slate-200"
                  style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
                >
                  <tr className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <th className="py-2 px-2.5 text-black font-extrabold" style={{ color: '#000000' }}>#</th>
                    <th className="py-2 px-2 text-black font-extrabold" style={{ color: '#000000' }}>USER</th>
                    <th className="py-2 px-2 text-black font-extrabold" style={{ color: '#000000' }}>SCORE</th>
                    <th className="py-2 text-right pr-2.5 text-black font-extrabold" style={{ color: '#000000' }}>TIME</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                  {/* Rank 1: Winner row with normal regular weight (#4B5563) matching ranks 2-5 */}
                  <tr 
                    className="transition-colors"
                    style={{ background: 'linear-gradient(135deg, rgba(95, 105, 239, 0.12) 0%, rgba(65, 124, 244, 0.12) 35%, rgba(58, 129, 245, 0.12) 65%, rgba(32, 165, 172, 0.12) 100%)' }}
                  >
                    <td className="py-2.5 px-2.5 text-[#4B5563] font-normal" style={{ color: '#4B5563', fontWeight: 400 }}>
                      1
                    </td>
                    <td className="py-2.5 px-2 text-[#4B5563] truncate max-w-[90px] font-normal" style={{ color: '#4B5563', fontWeight: 400 }}>Rohan S.</td>
                    <td className="py-2.5 px-2 font-black text-[#417CF4]">10/10</td>
                    <td className="py-2.5 text-right pr-2.5 font-mono text-slate-700">4m 12s</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <td className="py-2 px-2.5 text-slate-400 font-bold">2</td>
                    <td className="py-2 px-2 text-slate-800 truncate max-w-[90px]">Ananya V.</td>
                    <td className="py-2 px-2 font-bold text-slate-800">10/10</td>
                    <td className="py-2 text-right pr-2.5 font-mono text-slate-500">4m 38s</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <td className="py-2 px-2.5 text-slate-400 font-bold">3</td>
                    <td className="py-2 px-2 text-slate-800 truncate max-w-[90px]">Vikram K.</td>
                    <td className="py-2 px-2 font-bold text-slate-800">9/10</td>
                    <td className="py-2 text-right pr-2.5 font-mono text-slate-500">3m 55s</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <td className="py-2 px-2.5 text-slate-400 font-bold">4</td>
                    <td className="py-2 px-2 text-slate-800 truncate max-w-[90px]">Sanya M.</td>
                    <td className="py-2 px-2 font-bold text-slate-800">9/10</td>
                    <td className="py-2 text-right pr-2.5 font-mono text-slate-500">4m 02s</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <td className="py-2 px-2.5 text-slate-400 font-bold">5</td>
                    <td className="py-2 px-2 text-slate-800 truncate max-w-[90px]">Amit Jha</td>
                    <td className="py-2 px-2 font-bold text-slate-800">9/10</td>
                    <td className="py-2 text-right pr-2.5 font-mono text-slate-500">4m 45s</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Your Current Rank: Outer container Pure White, sub-text removed, '#' icon box in brand gradient */}
            <div className="bg-white p-3 border-t border-slate-100" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200 p-2.5 shadow-xs" style={{ backgroundColor: '#FFFFFF' }}>
                <div 
                  className="h-7 w-7 rounded-lg text-white font-black text-xs flex items-center justify-center shadow-xs shrink-0"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  #
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Your Current Rank</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* 4-Step Rules Bar */}
      <section id="how-it-works-section" className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-4">
        {/* Clean, professional title above the steps */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ background: BRAND_GRADIENT }}
          >
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">How It Works</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
          <div 
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs transition-shadow hover:shadow-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <span 
              className="w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
              style={{ background: 'linear-gradient(135deg, #6366F1, #3B82F6)' }}
            >
              1
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Enter with ₹{currentEntryFee}</h4>
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs transition-shadow hover:shadow-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <span 
              className="w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
              style={{ background: 'linear-gradient(135deg, #6366F1, #3B82F6)' }}
            >
              2
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Solve {dynamicQuestionsCount} Questions</h4>
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs transition-shadow hover:shadow-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <span 
              className="w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #10B981)' }}
            >
              3
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Rank on Score & Speed</h4>
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs transition-shadow hover:shadow-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <span 
              className="w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              4
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                {isCashTournament ? 'Win Instant Cash' : 'Win Product / Cash'}
              </h4>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Rounds Preview */}
      <section id="upcoming-prizes-section" className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
          >
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Upcoming Rounds
          </h2>
        </div>

        {upcomingContests.length === 0 ? (
          <div className="py-6 px-4 rounded-2xl bg-white border border-slate-200/80 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">No Upcoming Tournaments Scheduled</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {upcomingContests.map((c) => (
              <UpcomingContestCard
                key={c.id}
                contest={c}
                nowMs={nowMs}
                onContestStarted={onContestStarted}
                onEnterQuiz={onEnterQuiz}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

