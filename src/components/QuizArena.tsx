import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  BookmarkCheck, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  AlertCircle,
  Shield,
  ShieldAlert,
  Lock,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Question, DailyPrizeItem, PoolBreakdown } from '../types';
import { QUIZ_QUESTIONS } from '../data/quizData';
import { HINDI_QUESTION_MAP } from '../data/quizTranslations';
import { PreQuizOnboarding } from './PreQuizOnboarding';
import { soundFx } from '../utils/audio';
import { 
  vibrateAnswerSelect, 
  vibrateTimerAlert, 
  vibrateTimerTick 
} from '../utils/haptics';

interface QuizArenaProps {
  questions: Question[];
  onSubmitQuiz: (
    answers: Record<number, number>, 
    markedForReview: number[], 
    timeTakenSeconds: number,
    securityBreached?: boolean,
    securityBreachReason?: string
  ) => void;
  isPractice: boolean;
  todayPrize?: DailyPrizeItem;
  poolData?: PoolBreakdown;
  onQuitQuiz?: () => void;
  contestDurationSeconds?: number;
}

const QUESTION_TIMER_SECONDS = 59; // Strict 59-second per-question timer
const DEFAULT_MAX_TIME_SECONDS = 600; // 10 mins (600s) locked default master timer

export const QuizArena: React.FC<QuizArenaProps> = ({
  questions,
  onSubmitQuiz,
  isPractice,
  todayPrize,
  poolData,
  onQuitQuiz,
  contestDurationSeconds
}) => {
  // Resolve persistent locked contest duration from props or LocalStorage
  const getLockedContestDuration = (): number => {
    if (typeof contestDurationSeconds === 'number' && contestDurationSeconds > 0) {
      return contestDurationSeconds;
    }
    try {
      const saved = localStorage.getItem('quizkart_global_quiz_timer');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return DEFAULT_MAX_TIME_SECONDS;
  };

  const contestMaxSeconds = getLockedContestDuration();

  // Two-Step Pre-Quiz Onboarding State (Language Selection & Paper Pattern Instructions)
  const [preQuizCompleted, setPreQuizCompleted] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hindi'>('English');

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [markedForReview, setMarkedForReview] = useState<number[]>([]);
  
  // Per-Question 10-Second Timer
  const [questionSecondsRemaining, setQuestionSecondsRemaining] = useState<number>(QUESTION_TIMER_SECONDS);
  
  // Overall Timer (Locked to Admin Defined Global Timer)
  const [totalSecondsRemaining, setTotalSecondsRemaining] = useState<number>(contestMaxSeconds);
  
  // Modals & Alerts
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [securityAlert, setSecurityAlert] = useState<{
    show: boolean;
    reason: string;
    countdown: number;
  }>({
    show: false,
    reason: '',
    countdown: 3
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const startTimeRef = useRef<number>(Date.now());
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const totalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const securityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);
  const hasTriggered30SecAlertRef = useRef<boolean>(false);

  // Synchronized refs to avoid re-binding listeners or state tearing
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const markedRef = useRef(markedForReview);
  markedRef.current = markedForReview;

  const onSubmitQuizRef = useRef(onSubmitQuiz);
  onSubmitQuizRef.current = onSubmitQuiz;

  const validQuestions = React.useMemo(() => {
    if (Array.isArray(questions) && questions.length > 0) {
      const filtered = questions.filter((q): q is Question => Boolean(q && q.id != null));
      if (filtered.length > 0) return filtered;
    }
    return QUIZ_QUESTIONS;
  }, [questions]);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const questionsRef = useRef(validQuestions);
  questionsRef.current = validQuestions;

  const currentQuestion = validQuestions[currentIndex] || validQuestions[0] || QUIZ_QUESTIONS[0];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, validQuestions.length - answeredCount);
  const markedCount = markedForReview.length;

  // Fallback prize & pool if not passed
  const prize = todayPrize || {
    id: 'p-1',
    title: 'Noise ColorFit Pro 5 AMOLED Smartwatch',
    brand: 'Noise',
    category: 'Smartwatches',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
    retailValue: 4999,
    mrp: 7999,
    features: ['1.43" AMOLED Display', 'Bluetooth Calling', 'IP68 Water Resistance'],
    deliveryPartner: 'Amazon' as const,
    estimatedDeliveryDays: '2-3 Business Days'
  };

  const pool = poolData || {
    entryFee: 100,
    totalPoolAmount: 10000,
    productPrizeValue: 5000,
    runnerUpPoolValue: 4500,
    platformFeeValue: 500,
    activeParticipants: 68,
    targetParticipants: 100,
    productSharePercentage: 50,
    runnerUpCashbackPercentage: 45,
    platformFeePercentage: 5
  };

  // -------------------------------------------------------------
  // IMMEDIATE SECURITY BREACH AUTO-SUBMIT TRIGGER
  // -------------------------------------------------------------
  const triggerSecurityBreach = useCallback((reason: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Clear timers
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);

    soundFx.playSecurityAlarm();

    setSecurityAlert({
      show: true,
      reason,
      countdown: 3
    });

    // Auto submit after 2.5s banner presentation to user
    if (securityTimeoutRef.current) clearTimeout(securityTimeoutRef.current);
    securityTimeoutRef.current = setTimeout(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const finalTime = Math.min(contestMaxSeconds, Math.round(elapsed * 10) / 10);
      onSubmitQuizRef.current(answersRef.current, markedRef.current, finalTime, true, reason);
    }, 2500);
  }, [contestMaxSeconds]);

  // Standard Quiz Submit
  const handleStandardSubmit = useCallback(() => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const finalTime = Math.min(contestMaxSeconds, Math.round(elapsed * 10) / 10);
    onSubmitQuizRef.current(answersRef.current, markedRef.current, finalTime, false);
  }, [contestMaxSeconds]);

  // Cleanup all timers and timeouts on unmount
  useEffect(() => {
    return () => {
      if (securityTimeoutRef.current) clearTimeout(securityTimeoutRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------
  // 1. ADVANCED SECURITY LISTENERS (ANTI-CHEAT, TAB SWITCH, OCR, SCREENSHOT)
  // -------------------------------------------------------------
  useEffect(() => {
    // 1-second mount grace period so iframe initialization doesn't falsely trigger blur
    const mountTimeout = setTimeout(() => {
      isMountedRef.current = true;
    }, 1000);

    // 1. Tab Switch / Window Minimize (Page Visibility API)
    const handleVisibilityChange = () => {
      if (!isMountedRef.current || isSubmittingRef.current || !preQuizCompleted) return;
      if (document.hidden) {
        triggerSecurityBreach('Tab switch or window minimize detected during live proctored contest.');
      }
    };

    // 2. Window Blur (Switching to 2nd camera, split-screen, DevTools or external app window)
    const handleWindowBlur = () => {
      if (!isMountedRef.current || isSubmittingRef.current || !preQuizCompleted) return;
      triggerSecurityBreach('Focus lost: Window blur or secondary screen interaction detected.');
    };

    // 3. Prevent Context Menu (Right-Click)
    const handleContextMenu = (e: MouseEvent) => {
      if (!preQuizCompleted) return;
      e.preventDefault();
      soundFx.playWrong();
      return false;
    };

    // 4. Keyboard Trap (PrintScreen, Ctrl+C, Ctrl+V, F12, Ctrl+U, Ctrl+Shift+I, Cmd+Shift+3/4)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmittingRef.current || !preQuizCompleted) return;

      // PrintScreen key
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        triggerSecurityBreach('Screenshot attempt blocked: PrintScreen detected.');
        return;
      }

      // F12 or Developer shortcut
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c' || e.key === 'J' || e.key === 'j'))) {
        e.preventDefault();
        triggerSecurityBreach('Developer Inspect Element tools blocked.');
        return;
      }

      // Ctrl+U (View Source), Ctrl+C (Copy), Ctrl+V (Paste), Ctrl+A (Select All), Ctrl+P (Print)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'c' || key === 'v' || key === 'u' || key === 'a' || key === 'p' || key === 's') {
          e.preventDefault();
          soundFx.playWrong();
          return false;
        }
      }
    };

    // 5. Clipboard Copy/Cut Prevention
    const handleCopy = (e: ClipboardEvent) => {
      if (!preQuizCompleted) return;
      e.preventDefault();
      soundFx.playWrong();
      return false;
    };

    // Attach all listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);

    return () => {
      clearTimeout(mountTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
    };
  }, [triggerSecurityBreach, preQuizCompleted]);

  // -------------------------------------------------------------
  // 2. PER-QUESTION TIMER (59s STRICT COUNTDOWN & AUTO-ADVANCE)
  // -------------------------------------------------------------
  // Interval tick: purely decrements question timer without side-effects
  useEffect(() => {
    if (!preQuizCompleted) return;

    setQuestionSecondsRemaining(QUESTION_TIMER_SECONDS);

    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    questionTimerRef.current = setInterval(() => {
      setQuestionSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [currentIndex, preQuizCompleted]);

  // Effect: Handle question timer expiry & auto-advance when 59s timer reaches 00:00
  useEffect(() => {
    if (!preQuizCompleted) return;

    if (questionSecondsRemaining === 0) {
      soundFx.playTimerTick();
      if (currentIndexRef.current < questionsRef.current.length - 1) {
        const nextIdx = currentIndexRef.current + 1;
        setCurrentIndex(nextIdx);
        setQuestionSecondsRemaining(QUESTION_TIMER_SECONDS);
      } else {
        handleStandardSubmit();
      }
    } else if (questionSecondsRemaining <= 3 && questionSecondsRemaining > 0) {
      soundFx.playTimerTick();
    }
  }, [questionSecondsRemaining, preQuizCompleted, handleStandardSubmit]);

  // -------------------------------------------------------------
  // 3. OVERALL ARENA TIMER (10-MINUTE MASTER TIMER)
  // -------------------------------------------------------------
  // Interval tick: triggered ONLY upon clicking "Done" on instructions screen
  useEffect(() => {
    if (!preQuizCompleted) return;

    startTimeRef.current = Date.now();

    if (totalTimerRef.current) clearInterval(totalTimerRef.current);

    totalTimerRef.current = setInterval(() => {
      setTotalSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    };
  }, [preQuizCompleted]);

  // Effect: Handle overall arena timer warnings & auto-submit safely outside render phase
  useEffect(() => {
    if (!preQuizCompleted) return;

    if (totalSecondsRemaining === 0) {
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
      handleStandardSubmit();
      return;
    }

    // Reset alert tracking if timer was reset or extended above 30s
    if (totalSecondsRemaining > 30) {
      hasTriggered30SecAlertRef.current = false;
    }

    // 30-Second timer alert: audio & vibration API feedback (navigator.vibrate) for mobile users
    if (totalSecondsRemaining <= 30 && totalSecondsRemaining > 0 && !hasTriggered30SecAlertRef.current) {
      hasTriggered30SecAlertRef.current = true;
      soundFx.playTimerWarning();
      vibrateTimerAlert();
    } else if (totalSecondsRemaining < 30 && totalSecondsRemaining > 0) {
      if (totalSecondsRemaining <= 5 || totalSecondsRemaining % 5 === 0) {
        soundFx.playTimerWarning();
        if (totalSecondsRemaining <= 5) {
          vibrateTimerTick();
        }
      } else {
        soundFx.playTimerTick();
      }
    }
  }, [totalSecondsRemaining, preQuizCompleted, handleStandardSubmit]);

  // Option selection with vibration API haptic feedback for mobile users
  const handleSelectOption = (optionIndex: number) => {
    if (isSubmittingRef.current || !currentQuestion || currentQuestion.id == null) return;
    soundFx.playSelect();
    vibrateAnswerSelect();
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: optionIndex
    }));
  };

  const handleToggleMarkForReview = () => {
    if (!currentQuestion || currentQuestion.id == null) return;
    soundFx.playClick();
    setMarkedForReview((prev) =>
      prev.includes(currentQuestion.id)
        ? prev.filter((id) => id !== currentQuestion.id)
        : [...prev, currentQuestion.id]
    );
  };

  const handleNext = () => {
    soundFx.playClick();
    if (currentIndex < validQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowSubmitConfirm(true);
    }
  };

  const handlePrev = () => {
    soundFx.playClick();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const formatTotalTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isMarked = currentQuestion?.id != null ? markedForReview.includes(currentQuestion.id) : false;
  const selectedOption = currentQuestion?.id != null ? answers[currentQuestion.id] : undefined;
  const progressPercent = Math.round(((currentIndex + 1) / Math.max(1, validQuestions.length)) * 100);
  const poolFillPercent = Math.min(100, Math.round((pool.activeParticipants / pool.targetParticipants) * 100));

  return (
    <div 
      className="w-full space-y-5 pb-8 select-none"
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* SECURITY BREACH OVERLAY ALERT BANNER */}
      {securityAlert.show && (
        <div className="fixed inset-0 z-50 bg-rose-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl border-4 border-rose-500 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto ring-8 ring-rose-50">
              <ShieldAlert className="w-10 h-10 animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">SECURITY PROTOCOL TRIGGERED</h2>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-widest mt-1">Live Camera / External Tool Detected</p>
            </div>
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 leading-relaxed font-semibold">
              {securityAlert.reason}
            </div>
            <p className="text-xs text-slate-600">
              Your test has been automatically locked & submitted. Unanswered questions are scored as 0.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-rose-600">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              <span>Transmitting security breach report to server...</span>
            </div>
          </div>
        </div>
      )}

      {/* TOP SECURITY & PROCTORING STATUS BAR */}
      <div className="bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-md flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI PROCTOR LIVE</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Anti-Screen Record & Vision Shield Armed</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Strict Question Timer Badge */}
          <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-1 rounded-full text-xs font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Q{currentIndex + 1} Timer: <span className="font-mono text-white text-sm">{questionSecondsRemaining}s</span></span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1 font-bold"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* 3-Column High-Density Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (col-span-3): Today's Mega Prize & Security Rules */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          {/* Today's Mega Prize */}
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Today's Mega Prize
              </h3>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Rank #1
              </span>
            </div>

            <div className="relative aspect-video rounded-xl bg-slate-100 mb-3 flex items-center justify-center overflow-hidden border border-slate-200">
              {prize?.imageUrl ? (
                <img
                  src={prize.imageUrl}
                  alt={prize.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover select-none pointer-events-none"
                  style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                <p className="text-[11px] font-medium text-emerald-300 truncate">{prize.brand} • {prize.title}</p>
                <p className="font-bold text-sm text-white">Value: ₹{prize.retailValue.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">Entry Fee</span>
                <span className="font-bold text-emerald-600">₹{pool.entryFee}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Active Pool</span>
                <span className="font-bold text-slate-900">{pool.activeParticipants} / {pool.targetParticipants}</span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 pt-1">
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  <div 
                    className="h-full transition-all duration-500" 
                    style={{ 
                      width: `${poolFillPercent}%`,
                      background: 'linear-gradient(90deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)'
                    }} 
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Pool Filling</span>
                  <span className="text-indigo-600 font-semibold">{poolFillPercent}% Full</span>
                </div>
              </div>
            </div>
          </div>

          {/* Strict Security Enforcement Card */}
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Security Enforced
              </h3>
            </div>

            <div className="space-y-2 text-[11px] text-slate-600">
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span><strong>59s Per Question:</strong> Auto-advances on timeout.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span><strong>-0.33 Negative Marking:</strong> Applies to incorrect answers.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span><strong>Anti-Tab Switch:</strong> Switching tabs triggers instant submit.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span><strong>Encrypted Canvas:</strong> Screenshot & scraping blocked.</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Column (col-span-6): Primary HTML5 Canvas Question Area */}
        <section className="lg:col-span-6 flex flex-col gap-4">
          <div className="relative rounded-2xl bg-white p-5 sm:p-7 shadow-sm border border-slate-200/90 overflow-hidden">
            {/* Top Linear Progress Indicator */}
            <div className="absolute top-0 left-0 h-1.5 w-full bg-slate-100 z-10">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 50%, #8B5CF6 100%)'
                }} 
              />
            </div>

            {/* Background repeated watermark strictly reading "Quizkart" */}
            <div 
              className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='100' viewBox='0 0 180 100'><text x='30' y='55' font-family='system-ui, -apple-system, sans-serif' font-size='16' font-weight='800' fill='%2364748B' fill-opacity='0.06' transform='rotate(-22 90 50)'>Quizkart</text></svg>")`,
                backgroundRepeat: 'repeat'
              }}
            />

            <div className="relative z-10 space-y-6">
              {/* Question Header & Timers */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                {/* Horizontal row of upper badges: [2 / 19] [Category Name] [Difficulty] [-0.33] */}
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar py-0.5">
                  {/* Badge 1: [2 / 19] */}
                  <span 
                    className="text-xs font-bold text-white px-3 py-1 rounded-full shadow-xs border border-white/20 shrink-0 inline-flex items-center justify-center tracking-wide"
                    style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' }}
                  >
                    {currentIndex + 1} / {validQuestions.length}
                  </span>

                  {/* Badge 2: [Category Name] */}
                  <span 
                    className="text-xs font-bold text-slate-800 px-3 py-1 rounded-full border border-slate-200/90 shrink-0 inline-flex items-center justify-center"
                    style={{ backgroundColor: '#F1F5F9' }}
                  >
                    {currentQuestion.category}
                  </span>

                  {/* Badge 3: [Difficulty] */}
                  <span 
                    className="text-xs font-bold text-slate-800 px-3 py-1 rounded-full border border-slate-200/90 shrink-0 inline-flex items-center justify-center"
                    style={{ backgroundColor: '#F1F5F9' }}
                  >
                    {currentQuestion.difficulty || 'Medium'}
                  </span>

                  {/* Badge 4: [-0.33] */}
                  <span 
                    className="text-xs font-black px-2.5 py-1 rounded-full border border-red-200/80 shrink-0 inline-flex items-center justify-center"
                    style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
                  >
                    -0.33
                  </span>
                </div>

                {/* Per-Question 59-Second Countdown Timer on Top Right with NO Clock icon */}
                <div className="shrink-0 flex items-center">
                  <div 
                    className="flex items-center justify-center px-4 py-1.5 rounded-xl text-white font-mono font-black text-lg sm:text-xl shadow-xs border border-white/20"
                    style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' }}
                  >
                    <span>00:{questionSecondsRemaining.toString().padStart(2, '0')}</span>
                  </div>
                </div>
              </div>

              {/* Main Question Text: Bold & Larger typography */}
              <div className="py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {selectedLanguage === 'Hindi' ? 'हिन्दी माध्यम' : 'English Medium'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage(prev => prev === 'Hindi' ? 'English' : 'Hindi')}
                    className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 px-2 py-0.5 rounded-lg border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    {selectedLanguage === 'Hindi' ? 'Switch to English' : 'हिन्दी में बदलें'}
                  </button>
                </div>
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-relaxed tracking-tight">
                  {selectedLanguage === 'Hindi' && HINDI_QUESTION_MAP[currentQuestion.id]
                    ? HINDI_QUESTION_MAP[currentQuestion.id].question
                    : currentQuestion.question}
                </h2>
              </div>

              {/* 4 Clear Option Buttons (A, B, C, D): Bold & Larger typography */}
              <div className="space-y-3 pt-1">
                {(selectedLanguage === 'Hindi' && HINDI_QUESTION_MAP[currentQuestion.id]
                  ? HINDI_QUESTION_MAP[currentQuestion.id].options
                  : currentQuestion.options
                ).map((optText, optIdx) => {
                  const isSelected = selectedOption === optIdx;
                  const letter = String.fromCharCode(65 + optIdx);

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      id={`quiz-option-${letter}`}
                      onClick={() => handleSelectOption(optIdx)}
                      className={`w-full p-4 sm:p-5 rounded-2xl border-2 text-left transition-all flex items-center gap-4 cursor-pointer active:scale-[0.99] ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/80 text-slate-800'
                      }`}
                    >
                      {/* Option Letter (A, B, C, D) */}
                      <span className={`w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                        {letter}
                      </span>

                      {/* Option Choice Text - Bold & Larger */}
                      <span className={`text-base sm:text-lg font-bold leading-snug flex-1 ${
                        isSelected ? 'text-indigo-950' : 'text-slate-900'
                      }`}>
                        {optText}
                      </span>

                      {/* Radio Selection Indicator */}
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Question Footer Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    id="mark-review-btn"
                    onClick={handleToggleMarkForReview}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors border cursor-pointer ${
                      isMarked
                        ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>{isMarked ? 'Marked for Review' : 'Mark for Review'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    id="prev-question-btn"
                    disabled={currentIndex === 0}
                    onClick={handlePrev}
                    className={`px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      currentIndex === 0
                        ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    id="next-question-btn"
                    onClick={handleNext}
                    className="px-5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' }}
                  >
                    <span>{currentIndex === validQuestions.length - 1 ? 'Review & Submit' : 'Next Question'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column (col-span-3): Question Navigator Matrix & Controls */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Question Matrix
              </h3>
              <span className="text-xs font-bold text-slate-500">
                {answeredCount}/{questions.length} Answered
              </span>
            </div>

            {/* Matrix Grid */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {validQuestions.map((q, idx) => {
                if (!q || q.id == null) return null;
                const isCurrent = idx === currentIndex;
                const hasAnswered = answers[q.id] !== undefined;
                const isReview = markedForReview.includes(q.id);

                let btnStyle = 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100';
                if (hasAnswered) {
                  btnStyle = 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold';
                }
                if (isReview) {
                  btnStyle = 'border-amber-300 bg-amber-50 text-amber-900 font-bold';
                }
                if (isCurrent) {
                  btnStyle += ' ring-2 ring-indigo-500 font-black text-indigo-900';
                }

                return (
                  <button
                    key={q.id}
                    id={`palette-btn-${idx + 1}`}
                    onClick={() => {
                      soundFx.playClick();
                      setCurrentIndex(idx);
                    }}
                    className={`h-9 rounded-xl border text-xs flex items-center justify-center transition-all cursor-pointer ${btnStyle}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Matrix Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Marked ({markedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span>Unanswered ({unansweredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-indigo-600 bg-indigo-100" />
                <span>Current</span>
              </div>
            </div>

            {/* Primary Submit Button */}
            <div className="pt-4 mt-3 border-t border-slate-100 space-y-2">
              <button
                id="submit-quiz-direct-btn"
                onClick={() => {
                  soundFx.playClick();
                  setShowSubmitConfirm(true);
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Submit Final Answers</span>
              </button>

              {onQuitQuiz && (
                <button
                  id="quit-quiz-btn"
                  onClick={() => {
                    soundFx.playClick();
                    onQuitQuiz();
                  }}
                  className="w-full py-2 text-[11px] text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Quit Contest & Exit
                </button>
              )}
            </div>
          </div>

          {/* Overall Time Card */}
          <div className={`rounded-2xl bg-white shadow-sm border p-4 transition-all ${
            totalSecondsRemaining < 30
              ? 'border-rose-300 ring-2 ring-rose-400/20'
              : 'border-slate-200/90'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Overall Clock</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                totalSecondsRemaining < 30
                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                  : 'text-indigo-700 bg-indigo-50'
              }`}>
                {totalSecondsRemaining < 30 ? 'Final Seconds' : `${Math.ceil(contestMaxSeconds / 60)} Min Arena`}
              </span>
            </div>
            <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
              totalSecondsRemaining < 30
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}>
              <span className={`text-xs font-semibold ${totalSecondsRemaining < 30 ? 'text-rose-700' : 'text-slate-600'}`}>Remaining</span>
              <span className={`font-mono font-bold text-base ${totalSecondsRemaining < 30 ? 'text-rose-700 animate-pulse' : 'text-slate-900'}`}>
                {formatTotalTime(totalSecondsRemaining)}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Ready to Submit Quiz?</h3>
              </div>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-base font-bold text-emerald-700">{answeredCount}</div>
                  <div className="text-[10px] text-emerald-800 font-medium">Answered</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-base font-bold text-amber-800">{markedCount}</div>
                  <div className="text-[10px] text-amber-800 font-medium">Marked</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-base font-bold text-rose-700">{unansweredCount}</div>
                  <div className="text-[10px] text-rose-800 font-medium">Unanswered</div>
                </div>
              </div>

              {unansweredCount > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    You have <strong>{unansweredCount}</strong> unattempted questions. Skipped questions receive 0 points.
                  </span>
                </div>
              )}

              <p className="text-slate-600">
                Correct answers: <strong>+1.0</strong> • Incorrect answers: <strong>-0.33</strong>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Continue Quiz
              </button>
              <button
                id="final-confirm-submit-btn"
                onClick={handleStandardSubmit}
                className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm gemini-glow cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' }}
              >
                Yes, Submit Final Score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Quiz Two-Step Onboarding Modal: Step 1 Language Selection & Step 2 Paper Pattern Instructions */}
      {!preQuizCompleted && (
        <PreQuizOnboarding
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          onDoneStartTest={() => {
            setPreQuizCompleted(true);
            startTimeRef.current = Date.now();
          }}
          onExit={() => {
            if (onQuitQuiz) {
              onQuitQuiz();
            }
          }}
          totalQuestions={validQuestions.length}
          totalDurationMinutes={Math.ceil(contestMaxSeconds / 60)}
          prizeTitle={prize.title}
          isPractice={isPractice}
        />
      )}
    </div>
  );
};
