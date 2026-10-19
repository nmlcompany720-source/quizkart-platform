import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  X, 
  AlertCircle,
  ShieldAlert,
  Check
} from 'lucide-react';
import { Question, DailyPrizeItem, PoolBreakdown } from '../types';
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

const DEFAULT_MAX_TIME_SECONDS = 600; // 10 mins (600s) locked default master timer
const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

const translateCategory = (cat: string, lang: 'English' | 'Hindi') => {
  if (lang !== 'Hindi') return cat;
  const map: Record<string, string> = {
    'Science & Tech': 'विज्ञान एवं प्रौद्योगिकी',
    'Science': 'विज्ञान',
    'General Knowledge': 'सामान्य ज्ञान',
    'Current Affairs': 'करेंट अफेयर्स',
    'History': 'इतिहास',
    'Geography': 'भूगोल',
    'Mathematics': 'गणित',
    'Sports': 'खेल',
    'Technology': 'प्रौद्योगिकी',
  };
  return map[cat] || cat;
};

const translateDifficulty = (diff: string, lang: 'English' | 'Hindi') => {
  if (lang !== 'Hindi') return diff;
  const map: Record<string, string> = {
    'Easy': 'सरल',
    'Medium': 'मध्यम',
    'Hard': 'कठिन',
  };
  return map[diff] || diff;
};

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
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hindi'>(() => {
    try {
      const saved = localStorage.getItem('quizkart_selected_language') || sessionStorage.getItem('quizkart_selected_language');
      if (saved === 'Hindi' || saved === 'English') return saved;
    } catch {}
    return 'English';
  });

  const handleUpdateLanguage = (lang: 'English' | 'Hindi') => {
    try {
      localStorage.setItem('quizkart_selected_language', lang);
      sessionStorage.setItem('quizkart_selected_language', lang);
    } catch {}
    setSelectedLanguage(lang);
  };

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [markedForReview, setMarkedForReview] = useState<number[]>([]);
  
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

  const startTimeRef = useRef<number>(Date.now());
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
    if (Array.isArray(questions)) {
      return questions.filter((q): q is Question => Boolean(q && q.id != null));
    }
    return [];
  }, [questions]);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const questionsRef = useRef(validQuestions);
  questionsRef.current = validQuestions;

  const currentQuestion = validQuestions[currentIndex] || validQuestions[0] || null;
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

    // Clear timer
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

    if (totalTimerRef.current) clearInterval(totalTimerRef.current);

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const finalTime = Math.min(contestMaxSeconds, Math.round(elapsed * 10) / 10);
    onSubmitQuizRef.current(answersRef.current, markedRef.current, finalTime, false);
  }, [contestMaxSeconds]);

  // Cleanup all timers and timeouts on unmount
  useEffect(() => {
    return () => {
      if (securityTimeoutRef.current) clearTimeout(securityTimeoutRef.current);
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

      // PrintScreen key & Screenshot Hotkeys / Snipping tools detection -> Instantly trigger full test auto-submission
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        triggerSecurityBreach('Screenshot attempt blocked: PrintScreen key detected. Auto-submitting test.');
        return;
      }

      // Mac screenshot commands: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
      // Windows Snipping Tool: Win+Shift+S (Meta+Shift+S)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        triggerSecurityBreach('Screenshot attempt blocked: Screen capture hotkey detected. Auto-submitting test.');
        return;
      }

      // F12 or Developer shortcut
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c' || e.key === 'J' || e.key === 'j'))) {
        e.preventDefault();
        triggerSecurityBreach('Developer Inspect Element tools blocked. Auto-submitting test.');
        return;
      }

      // Ctrl+U (View Source), Ctrl+C (Copy), Ctrl+V (Paste), Ctrl+A (Select All), Ctrl+P (Print)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'p') {
          e.preventDefault();
          triggerSecurityBreach('Print command detected. Auto-submitting test.');
          return false;
        }
        if (key === 'c' || key === 'v' || key === 'u' || key === 'a' || key === 's') {
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
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)' }}
        >
          <div 
            className="max-w-md w-full rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl animate-in zoom-in-95 duration-200"
            style={{ 
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)'
            }}
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-[#EF4444]"
              style={{ backgroundColor: '#FEF2F2' }}
            >
              <ShieldAlert className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight" style={{ color: '#0F172A' }}>
                SECURITY ALERT: TRIGGERED
              </h2>
              <p className="text-sm font-bold" style={{ color: '#DC2626' }}>
                Tab Switch / Screen Leave Detected
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TOP SECURITY & PROCTORING STATUS BAR: Centered AI PROCTOR LIVE badge on Pure White (#FFFFFF) container */}
      <div 
        className="bg-white rounded-2xl px-4 py-3 shadow-xs flex items-center justify-center border border-slate-200/90"
        style={{ background: '#FFFFFF' }}
      >
        {/* AI PROCTOR LIVE badge with clean brand styling and pure white background */}
        <div 
          className="flex items-center gap-2 bg-white border border-slate-200 text-emerald-600 px-4 py-1.5 rounded-full text-xs font-black shadow-2xs"
          style={{ background: '#FFFFFF' }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="tracking-wider">AI PROCTOR LIVE</span>
        </div>
      </div>

      {/* 3-Column High-Density Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (col-span-3): Security Rules (Today's Mega Prize and Pool Filling hidden during active quiz) */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          {/* Strict Security Enforcement Card: Synchronized with user selected test medium */}
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-3">
            <div className="border-b border-slate-100 pb-2 text-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 text-center">
                {selectedLanguage === 'Hindi' ? 'सुरक्षा नियम' : 'Security Enforced'}
              </h3>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              {/* Rule 1: Contest Timer rule */}
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>परीक्षा समय:</strong> प्रतियोगिता के लिए कुल 10 मिनट का समय निर्धारित है, समय समाप्त होने पर टेस्ट स्वतः सबमिट हो जाएगा।</>
                  ) : (
                    <><strong>Test Timer:</strong> 10 minutes total contest duration. Auto-submits when time expires.</>
                  )}
                </span>
              </div>
              {/* Rule 2: Negative Marking rule */}
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>अंकन योजना:</strong> प्रत्येक सही उत्तर पर <strong>+1.0 अंक</strong>, गलत उत्तर पर <strong>-0.33 नकारात्मक अंकन</strong>।</>
                  ) : (
                    <><strong>Negative Marking:</strong> <strong>+1.0 mark</strong> for each correct answer, <strong>-0.33</strong> for incorrect answer.</>
                  )}
                </span>
              </div>
              {/* Rule 3: Proctored Tab-switch rule */}
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>प्रॉक्टर्ड परीक्षा:</strong> परीक्षा के दौरान विंडो मिनिमाइज़ करना या टैब बदलना सख्त मना है (स्वतः सबमिट होगा)।</>
                  ) : (
                    <><strong>Anti-Cheating Proctored:</strong> Tab switching or minimizing window triggers instant auto-submit.</>
                  )}
                </span>
              </div>
              {/* Rule 4: Internet Stability rule */}
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>इंटरनेट स्थिरता:</strong> स्थिर इंटरनेट कनेक्शन बनाए रखें। परीक्षा शुरू होने के बाद दोबारा मौका नहीं मिलेगा।</>
                  ) : (
                    <><strong>Internet Stability:</strong> Ensure a stable internet connection. No re-attempts allowed once started.</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Column (col-span-6): Primary HTML5 Canvas Question Area */}
        <section className="lg:col-span-6 flex flex-col gap-4">
          <div className="relative rounded-2xl bg-white p-5 sm:p-7 shadow-sm border border-slate-200/90 overflow-hidden">
            {/* Top Linear Progress Indicator: Primary Website Brand Gradient */}
            <div className="absolute top-0 left-0 h-1.5 w-full bg-slate-100 z-10">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${progressPercent}%`,
                  background: BRAND_GRADIENT
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
                {/* Horizontal row of upper badges: [5 / 19] [Category Name] [Difficulty] [-0.33] */}
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar py-0.5">
                  {/* Badge 1: [5 / 19] with Primary Website Brand Gradient */}
                  <span 
                    className="text-xs font-bold text-white px-3 py-1 rounded-full shadow-xs border border-white/20 shrink-0 inline-flex items-center justify-center tracking-wide"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {validQuestions.length === 0 ? '0 / 0' : `${currentIndex + 1} / ${validQuestions.length}`}
                  </span>

                  {/* Badge 2: [Category Name] with Pure White (#FFFFFF) Background */}
                  <span 
                    className="text-xs font-bold text-slate-800 px-3 py-1 rounded-full border border-slate-200/90 shrink-0 inline-flex items-center justify-center shadow-2xs"
                    style={{ background: '#FFFFFF' }}
                  >
                    {currentQuestion ? translateCategory(currentQuestion.category, selectedLanguage) : 'No Category'}
                  </span>

                  {/* Badge 3: [Difficulty] with Pure White (#FFFFFF) Background */}
                  <span 
                    className="text-xs font-bold text-slate-800 px-3 py-1 rounded-full border border-slate-200/90 shrink-0 inline-flex items-center justify-center shadow-2xs"
                    style={{ background: '#FFFFFF' }}
                  >
                    {currentQuestion ? translateDifficulty(currentQuestion.difficulty || 'Medium', selectedLanguage) : 'None'}
                  </span>

                  {/* Badge 4: [-0.33] in light-red warning tag */}
                  <span 
                    className="text-xs font-black px-2.5 py-1 rounded-full border border-red-200 shrink-0 inline-flex items-center justify-center tracking-tight"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}
                  >
                    -0.33
                  </span>
                </div>

                {/* Persistent 10-Minute Overall Contest Countdown Timer on Top Right with Primary Brand Styling (Clock icon removed) */}
                <div className="shrink-0 flex items-center">
                  <div 
                    className="px-4 py-1.5 rounded-xl text-white font-mono font-black text-lg sm:text-xl shadow-xs border border-white/20"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    <span>
                      {Math.floor(totalSecondsRemaining / 60).toString().padStart(2, '0')}:{(totalSecondsRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Question Text: Bold & Larger typography */}
              <div className="py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {selectedLanguage === 'Hindi' ? 'हिन्दी माध्यम' : 'English Medium'}
                  </span>
                  {/* Language Switcher: Primary Brand Gradient Background */}
                  <button
                    type="button"
                    onClick={() => handleUpdateLanguage(selectedLanguage === 'Hindi' ? 'English' : 'Hindi')}
                    className="text-[11px] font-bold text-white px-3 py-1 rounded-lg transition-all cursor-pointer shadow-xs active:scale-95 hover:opacity-95"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {selectedLanguage === 'Hindi' ? 'Switch to English' : 'हिन्दी में बदलें'}
                  </button>
                </div>

                {currentQuestion ? (
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-relaxed tracking-tight">
                    <span className="mr-2 font-black">{currentIndex + 1}.</span>
                    {selectedLanguage === 'Hindi' && HINDI_QUESTION_MAP[currentQuestion.id]
                      ? HINDI_QUESTION_MAP[currentQuestion.id].question
                      : currentQuestion.question}
                  </h2>
                ) : (
                  <div className="py-8 text-center space-y-3">
                    <h2 className="text-2xl font-bold text-slate-900">
                      0 Active Questions
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                      The Question Library currently has 0 active questions in live rotation. Please import questions in the Admin Panel to activate this contest.
                    </p>
                  </div>
                )}
              </div>

              {/* 4 Option Cards (A, B, C, D): Pure White (#FFFFFF) background always. When selected, Primary Brand Gradient applied strictly to OUTLINE BORDER only */}
              {currentQuestion && (
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
                        className={`w-full p-4 sm:p-5 rounded-2xl text-left transition-all flex items-center gap-4 cursor-pointer active:scale-[0.99] shadow-xs`}
                        style={
                          isSelected
                            ? { 
                                border: '2px solid transparent',
                                background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%) border-box',
                                color: '#0F172A',
                                boxShadow: '0 4px 14px rgba(65, 124, 244, 0.18)'
                              }
                            : { 
                                background: '#FFFFFF', 
                                border: '2px solid #E2E8F0', 
                                color: '#1E293B' 
                              }
                        }
                      >
                        {/* Option Letter (A, B, C, D): Internal background strictly pure white (#FFFFFF) across all question views */}
                        <span 
                          className={`w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? 'border-blue-500 text-blue-600 shadow-xs'
                              : 'border-slate-300 text-slate-700'
                          }`}
                          style={{ background: '#FFFFFF' }}
                        >
                          {letter}
                        </span>

                        {/* Option Choice Text - Bold & Larger typography */}
                        <span className={`text-base sm:text-lg font-bold leading-snug flex-1 ${
                          isSelected ? 'text-slate-900 font-extrabold' : 'text-slate-800'
                        }`}>
                          {optText}
                        </span>

                        {/* Selection Checkmark Indicator: Stays visible when marked for review */}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? 'border-transparent text-white' : 'border-2 border-slate-300 bg-white'
                        }`}
                        style={isSelected ? { background: BRAND_GRADIENT } : undefined}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Question Footer Actions - STRICTLY STACKED IN TWO ROWS */}
              <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 w-full">
                {/* Row 1 (Dedicated Top Row): 'Mark for Review' / 'Marked for Review' */}
                <div className="w-full">
                  <button
                    id="mark-review-btn"
                    onClick={handleToggleMarkForReview}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer bg-white text-black border border-black hover:bg-black/5 flex items-center justify-center text-center"
                    style={{ background: '#FFFFFF', borderColor: '#000000', color: '#000000' }}
                  >
                    <span>
                      {isMarked
                        ? (selectedLanguage === 'Hindi' ? 'समीक्षा हेतु चिह्नित' : 'Marked for Review')
                        : (selectedLanguage === 'Hindi' ? 'समीक्षा के लिए चिह्नित करें' : 'Mark for Review')}
                    </span>
                  </button>
                </div>

                {/* Row 2 (Separate Second Row): 'Previous' and 'Next Question' side-by-side (50% width each) */}
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    id="prev-question-btn"
                    disabled={currentIndex === 0}
                    onClick={handlePrev}
                    className={`w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center text-center ${
                      currentIndex === 0
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:opacity-95'
                    }`}
                    style={{ background: BRAND_GRADIENT }}
                  >
                    <span>{selectedLanguage === 'Hindi' ? 'पिछला' : 'Previous'}</span>
                  </button>

                  <button
                    id="next-question-btn"
                    onClick={handleNext}
                    className="w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer hover:opacity-95 flex items-center justify-center text-center"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    <span>
                      {currentIndex === validQuestions.length - 1
                        ? (selectedLanguage === 'Hindi' ? 'समीक्षा एवं सबमिट' : 'Review & Submit')
                        : (selectedLanguage === 'Hindi' ? 'अगला प्रश्न' : 'Next Question')}
                    </span>
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
              {/* Question Grid / Matrix Heading in Dark Black (#000000) */}
              <h3 
                className="text-xs font-bold uppercase tracking-wider text-black"
                style={{ color: '#000000' }}
              >
                {selectedLanguage === 'Hindi' ? 'प्रश्न ग्रिड' : 'Question Grid'}
              </h3>
              <span className="text-xs font-bold text-slate-500">
                {answeredCount}/{validQuestions.length} {selectedLanguage === 'Hindi' ? 'उत्तर दिए' : 'Answered'}
              </span>
            </div>

            {/* Matrix Grid: Unattempted Pure White (#FFFFFF), Active Question Primary Brand Gradient */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {validQuestions.length === 0 ? (
                <div className="col-span-5 py-6 text-center text-xs text-slate-400 font-medium">
                  0 questions in palette
                </div>
              ) : (
                validQuestions.map((q, idx) => {
                if (!q || q.id == null) return null;
                const isCurrent = idx === currentIndex;
                const hasAnswered = answers[q.id] !== undefined;
                const isReview = markedForReview.includes(q.id);

                let btnClass = 'h-9 rounded-xl text-xs font-bold flex items-center justify-center transition-all cursor-pointer shadow-2xs';
                let btnStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0' };

                if (isCurrent) {
                  // Active Question: Clean primary brand gradient OUTLINE BORDER only, with a white background
                  btnClass += ' font-black shadow-xs';
                  btnStyle = { 
                    color: '#1E293B',
                    border: '2px solid transparent',
                    background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%) border-box',
                    boxShadow: '0 2px 8px rgba(65, 124, 244, 0.25)'
                  };
                } else if (hasAnswered) {
                  btnClass += ' border-emerald-300 bg-emerald-50 text-emerald-800 font-bold';
                  btnStyle = { background: '#ECFDF5', border: '1px solid #6EE7B7' };
                } else if (isReview) {
                  btnClass += ' border-amber-300 bg-amber-50 text-amber-900 font-bold';
                  btnStyle = { background: '#FFFBEB', border: '1px solid #FCD34D' };
                } else {
                  // Unattempted Grid Boxes: Background color strictly pure white (#FFFFFF)
                  btnClass += ' text-slate-700 hover:border-slate-300';
                  btnStyle = { background: '#FFFFFF', border: '1px solid #E2E8F0' };
                }

                return (
                  <button
                    key={q.id}
                    id={`palette-btn-${idx + 1}`}
                    onClick={() => {
                      soundFx.playClick();
                      setCurrentIndex(idx);
                    }}
                    className={btnClass}
                    style={btnStyle}
                  >
                    {idx + 1}
                  </button>
                );
              }))}
            </div>

            {/* Matrix Legend: Answered (Green), Marked (Yellow), Unanswered (White/Grey), Current (Primary Brand Gradient) */}
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{selectedLanguage === 'Hindi' ? 'उत्तर दिया' : 'Answered'} ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <span>{selectedLanguage === 'Hindi' ? 'चिह्नित' : 'Marked'} ({markedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300 shrink-0" style={{ background: '#FFFFFF' }} />
                <span>{selectedLanguage === 'Hindi' ? 'अनुत्तरित' : 'Unanswered'} ({unansweredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span 
                  className="w-2.5 h-2.5 rounded-full bg-white shrink-0 shadow-2xs border-2" 
                  style={{ 
                    border: '2px solid transparent',
                    background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%) border-box'
                  }} 
                />
                <span>{selectedLanguage === 'Hindi' ? 'वर्तमान' : 'Current'}</span>
              </div>
            </div>

            {/* Primary Submit Button: No left checkmark icon, Primary Brand Gradient Background */}
            <div className="pt-4 mt-3 border-t border-slate-100 space-y-2">
              <button
                id="submit-quiz-direct-btn"
                onClick={() => {
                  soundFx.playClick();
                  setShowSubmitConfirm(true);
                }}
                className="w-full py-3 rounded-xl text-white font-bold text-xs shadow-sm flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:opacity-95"
                style={{ background: BRAND_GRADIENT }}
              >
                <span>{selectedLanguage === 'Hindi' ? 'अंतिम उत्तर सबमिट करें' : 'Submit Final Answers'}</span>
              </button>

              {onQuitQuiz && validQuestions.length > 0 && (
                <button
                  id="quit-quiz-btn"
                  onClick={() => {
                    soundFx.playClick();
                    onQuitQuiz();
                  }}
                  className="w-full py-2.5 rounded-xl text-white font-bold text-[11px] shadow-xs flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:opacity-95"
                  style={{ background: BRAND_GRADIENT }}
                >
                  {selectedLanguage === 'Hindi' ? 'प्रतियोगिता छोड़ें और बाहर जाएं' : 'Quit Contest & Exit'}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal: Centered dialog, pure white container, bilingual localization */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
            style={{ background: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#417CF4]" />
                <h3 className="text-base font-bold text-slate-900">
                  {selectedLanguage === 'Hindi' ? 'क्या आप क्विज़ सबमिट करना चाहते हैं?' : 'Ready to Submit Quiz?'}
                </h3>
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
                  <div className="text-[10px] text-emerald-800 font-medium">
                    {selectedLanguage === 'Hindi' ? 'उत्तर दिया' : 'Answered'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-base font-bold text-amber-800">{markedCount}</div>
                  <div className="text-[10px] text-amber-800 font-medium">
                    {selectedLanguage === 'Hindi' ? 'चिह्नित' : 'Marked'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-base font-bold text-rose-700">{unansweredCount}</div>
                  <div className="text-[10px] text-rose-800 font-medium">
                    {selectedLanguage === 'Hindi' ? 'अनुत्तरित' : 'Unanswered'}
                  </div>
                </div>
              </div>

              {unansweredCount > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {selectedLanguage === 'Hindi' ? (
                      <>आपके <strong>{unansweredCount}</strong> प्रश्न अनुत्तरित हैं। छोड़े गए प्रश्नों के लिए 0 अंक मिलेंगे।</>
                    ) : (
                      <>You have <strong>{unansweredCount}</strong> unattempted questions. Skipped questions receive 0 points.</>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                style={{ background: BRAND_GRADIENT }}
              >
                {selectedLanguage === 'Hindi' ? 'क्विज़ जारी रखें' : 'Continue Quiz'}
              </button>
              <button
                id="final-confirm-submit-btn"
                onClick={handleStandardSubmit}
                className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm cursor-pointer hover:opacity-95"
                style={{ background: BRAND_GRADIENT }}
              >
                {selectedLanguage === 'Hindi' ? 'हाँ, अंतिम स्कोर सबमिट करें' : 'Yes, Submit Final Score'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Quiz Two-Step Onboarding Modal: Step 1 Language Selection & Step 2 Paper Pattern Instructions */}
      {!preQuizCompleted && validQuestions.length > 0 && (
        <PreQuizOnboarding
          selectedLanguage={selectedLanguage}
          onSelectLanguage={handleUpdateLanguage}
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
          questions={validQuestions}
          negativeMarks={0.33}
        />
      )}
    </div>
  );
};
