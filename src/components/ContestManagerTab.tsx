import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Gift, 
  Wallet, 
  Sparkles, 
  Calendar, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Play, 
  Trash2, 
  Truck, 
  Plus, 
  Coins, 
  Tag, 
  Check, 
  RefreshCw,
  Cpu,
  Layers,
  Zap,
  Upload,
  Package,
  Loader2,
  Edit3,
  Users,
  AlertTriangle,
  X
} from 'lucide-react';
import { 
  ActiveContest, 
  DailyPrizeItem, 
  PoolEconomics, 
  Question, 
  AutoPilotSettings, 
  UserProfile 
} from '../types';
import { 
  getSavedContests, 
  saveActiveContests, 
  getAutoPilotSettings, 
  saveAutoPilotSettings, 
  selectSkillBasedQuestions,
  getAnsweredQuestionIds,
  resetAnsweredQuestionIds
} from '../utils/skillQuizAlgorithm';
import { soundFx } from '../utils/audio';
import { ScheduledTimePicker } from './ScheduledTimePicker';
import { saveContestToFirestore, removeContestFromFirestore } from '../firebase';
import { getCountdown, parseTargetTimestamp, formatCountdown } from '../utils/timerUtils';
import { compressImage, sanitizeContestSynchronous } from '../utils/imageCompressor';

// Real-time Ticking Timer sub-component for Active & Scheduled Contest Cards
const ContestCardTimers: React.FC<{ scheduledTime?: string; endTime?: string }> = ({ scheduledTime, endTime }) => {
  const [startCountdown, setStartCountdown] = useState<string>('00d : 00h : 00m : 00s');
  const [endCountdown, setEndCountdown] = useState<string>('00d : 00h : 00m : 00s');
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const startMs = parseTargetTimestamp(scheduledTime);
      const endMs = endTime ? parseTargetTimestamp(endTime) : (startMs + 24 * 3600 * 1000);

      const startCd = getCountdown(startMs, now);
      const endCd = getCountdown(endMs, now);

      setStartCountdown(formatCountdown(startCd));
      setEndCountdown(formatCountdown(endCd));
      setIsStarted(startCd.isFinished);
      setIsEnded(endCd.isFinished);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [scheduledTime, endTime]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono py-1">
      {/* Start Timer */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
        <span className="text-[10px] uppercase font-sans font-bold text-slate-500">
          Start Timer:
        </span>
        <span className={`font-bold ${isStarted ? 'text-emerald-600 font-sans' : 'text-slate-800'}`}>
          {isStarted ? 'Started' : startCountdown}
        </span>
      </div>

      {/* End Timer */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
        <span className="text-[10px] uppercase font-sans font-bold text-slate-500">
          End Timer:
        </span>
        <span className={`font-bold ${isEnded ? 'text-rose-600 font-sans' : 'text-slate-900'}`}>
          {isEnded ? 'Expired' : endCountdown}
        </span>
      </div>
    </div>
  );
};

interface ContestManagerTabProps {
  questions: Question[];
  onUpdateQuestions?: (questions: Question[]) => void;
  todayPrize: DailyPrizeItem;
  onUpdatePrize: (prize: DailyPrizeItem) => void;
  poolData: PoolEconomics;
  onUpdatePoolData: (pool: PoolEconomics) => void;
  userProfile?: UserProfile;
  onShowToast: (text: string, type?: 'success' | 'info') => void;
  onSwitchToAddQuestions?: () => void;
  activeContest?: ActiveContest | null;
  onUpdateActiveContest?: (contest: ActiveContest | null) => void;
  contests?: ActiveContest[];
  onUpdateContests?: (contests: ActiveContest[]) => void;
  onDeleteContest?: (id: string) => void;
  realParticipantsCount?: number;
}

// Official Website Primary Brand Gradient: #5F69EF -> #417CF4 -> #3A81F5 -> #20A5AC (Main Teal: #20A5AC, Main Blue: #4A7DF3)
const Q_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

// Major Indian Logistics Delivery Partners
const DELIVERY_PARTNERS = [
  'Amazon India',
  'Flipkart',
  'Meesho Supply',
  'Shiprocket',
  'BlueDart',
  'Delhivery',
  'Xpressbees',
  'DTDC',
  'India Post'
] as const;

// Calculate balanced tiered prize distributions (highest share to Rank 1, descending down)
const calculatePayoutSummary = (prizePool: number, breakdownType: string): string => {
  if (!prizePool || prizePool <= 0) return 'Rank 1 = 100%';
  switch (breakdownType) {
    case 'single_winner':
      return `Single Rank 1 Winner (100%): ₹${prizePool.toLocaleString('en-IN')}`;
    case 'top_10': {
      const r1 = Math.round(prizePool * 0.5);
      const r2 = Math.round(prizePool * 0.2);
      const r3 = Math.round(prizePool * 0.1);
      return `Top 10 Winners: Rank 1: ₹${r1.toLocaleString('en-IN')} (50%) • Rank 2: ₹${r2.toLocaleString('en-IN')} (20%) • Rank 3: ₹${r3.toLocaleString('en-IN')} (10%) • Ranks 4-10: 20%`;
    }
    case 'top_20': {
      const r1 = Math.round(prizePool * 0.4);
      const r2 = Math.round(prizePool * 0.18);
      const r3 = Math.round(prizePool * 0.1);
      return `Top 20 Winners: Rank 1: ₹${r1.toLocaleString('en-IN')} (40%) • Rank 2: ₹${r2.toLocaleString('en-IN')} (18%) • Rank 3: ₹${r3.toLocaleString('en-IN')} (10%) • Ranks 4-20: 32%`;
    }
    case 'top_25': {
      const r1 = Math.round(prizePool * 0.35);
      const r2 = Math.round(prizePool * 0.15);
      const r3 = Math.round(prizePool * 0.1);
      return `Top 25 Winners: Rank 1: ₹${r1.toLocaleString('en-IN')} (35%) • Rank 2: ₹${r2.toLocaleString('en-IN')} (15%) • Rank 3: ₹${r3.toLocaleString('en-IN')} (10%) • Ranks 4-25: 40%`;
    }
    case 'top_50': {
      const r1 = Math.round(prizePool * 0.3);
      const r2 = Math.round(prizePool * 0.14);
      const r3 = Math.round(prizePool * 0.08);
      return `Top 50 Winners: Rank 1: ₹${r1.toLocaleString('en-IN')} (30%) • Rank 2: ₹${r2.toLocaleString('en-IN')} (14%) • Rank 3: ₹${r3.toLocaleString('en-IN')} (8%) • Ranks 4-50: 48%`;
    }
    default:
      return `Rank 1: ₹${prizePool.toLocaleString('en-IN')}`;
  }
};

// Preset Product Gallery for 1-Click Admin Selection
const PRESET_PRODUCTS = [
  {
    title: 'Noise ColorFit Ultra 3 AMOLED Bluetooth Calling Smartwatch',
    brand: 'Noise',
    mrp: 7999,
    retailValue: 4999,
    imageUrl: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&auto=format&fit=crop&q=80',
    link: 'https://www.amazon.in/dp/B0C8V73TQR',
    partner: 'Amazon India'
  },
  {
    title: 'boAt Airdopes 141 ANC TWS Earbuds with 42H Playtime',
    brand: 'boAt',
    mrp: 4490,
    retailValue: 1499,
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80',
    link: 'https://www.meesho.com/boat-airdopes-141/p/43x21',
    partner: 'Meesho Supply'
  },
  {
    title: 'Boult Audio Z40 Ultra ENC Wireless Bluetooth Earbuds',
    brand: 'Boult',
    mrp: 5999,
    retailValue: 1799,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    link: 'https://www.amazon.in/dp/B0CTKQ8X2Q',
    partner: 'Amazon India'
  }
];

export const ContestManagerTab: React.FC<ContestManagerTabProps> = ({
  questions,
  onUpdateQuestions,
  todayPrize,
  onUpdatePrize,
  poolData,
  onUpdatePoolData,
  userProfile,
  onShowToast,
  onSwitchToAddQuestions,
  activeContest,
  onUpdateActiveContest,
  contests: propContests,
  onUpdateContests,
  onDeleteContest,
  realParticipantsCount
}) => {
  // Contest List & Auto-Pilot Settings
  const [internalContests, setInternalContests] = useState<ActiveContest[]>(() => {
    const list = getSavedContests();
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    return (list || []).filter((c: any) => 
      c &&
      c.id &&
      !deletedList.includes(c.id) &&
      c.id !== 'CNT-PROD-101' && 
      c.id !== 'CNT-CASH-202'
    );
  });

  const baseContests = propContests !== undefined ? propContests : internalContests;
  const contests = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    const filteredBase = (baseContests || []).filter(c => c && !deletedList.includes(c.id));
    if (activeContest && !deletedList.includes(activeContest.id) && !filteredBase.some(c => c.id === activeContest.id)) {
      return [activeContest, ...filteredBase];
    }
    return filteredBase;
  }, [baseContests, activeContest]);

  const setContests = (val: ActiveContest[] | ((prev: ActiveContest[]) => ActiveContest[])) => {
    if (typeof val === 'function') {
      const computed = val(contests);
      setInternalContests(computed);
      if (onUpdateContests) onUpdateContests(computed);
    } else {
      setInternalContests(val);
      if (onUpdateContests) onUpdateContests(val);
    }
  };

  const [autoPilot, setAutoPilot] = useState<AutoPilotSettings>(getAutoPilotSettings);

  // 1-second circular loading state for delete contest action
  const [deletingContestId, setDeletingContestId] = useState<string | null>(null);

  // Strictly real-time participant active joins for Admin visibility
  const liveParticipants = realParticipantsCount !== undefined ? realParticipantsCount : (() => {
    try {
      const saved = localStorage.getItem('quizkart_real_active_participants');
      if (saved !== null) return parseInt(saved, 10) || 0;
    } catch {}
    return 0;
  })();

  // Real-time Contest Image Change State
  const [editingImageContest, setEditingImageContest] = useState<ActiveContest | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState<string>('');
  const [editingImageCurrentUrl, setEditingImageCurrentUrl] = useState<string>('');
  const inlineFileInputRef = useRef<HTMLInputElement>(null);

  const handleInlineImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      if (isGif) {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          setTempImageUrl(res);
          soundFx.playSuccess();
          onShowToast('Animated GIF banner loaded!', 'info');
        };
        reader.readAsDataURL(file);
      } else {
        const compressed = await compressImage(file, 800, 600, 0.72);
        setTempImageUrl(compressed);
        soundFx.playSuccess();
        onShowToast('Image optimized & loaded!', 'info');
      }
    } catch {
      onShowToast('Failed to optimize image', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImageChange = () => {
    const newUrl = tempImageUrl.trim();
    if (!newUrl || !editingImageContest) return;

    const targetId = editingImageContest.id;
    const updated = (contests || []).map(c => {
      if (c.id !== targetId) return c;
      if (c.type === 'product' && c.productConfig) {
        return {
          ...c,
          productConfig: {
            ...c.productConfig,
            productImageUrl: newUrl
          }
        };
      } else if (c.type === 'cash' && c.cashConfig) {
        return {
          ...c,
          cashConfig: {
            ...c.cashConfig,
            cashImageUrl: newUrl
          }
        };
      }
      return c;
    });

    updateContestList(updated);

    const targetContest = updated.find(c => c.id === targetId);
    if (targetContest) {
      saveContestToFirestore(targetContest).catch(() => {});
      if (targetContest.status === 'active' || targetContest.id === activeContest?.id) {
        onUpdateActiveContest?.(targetContest);
        onUpdatePrize({
          ...todayPrize,
          imageUrl: newUrl
        });
        try {
          localStorage.setItem('quizkart_current_active_contest', JSON.stringify(targetContest));
        } catch {}
      }
    }

    setEditingImageContest(null);
    setTempImageUrl('');
    soundFx.playSuccess();
    onShowToast('Contest image updated in real-time!', 'success');
  };

  // Auto-Pilot ON/OFF Toggle Persistent State directly bound to LocalStorage ('quizkart_autopilot_active')
  const [isAutoPilotActive, setIsAutoPilotActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('quizkart_autopilot_active');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return getAutoPilotSettings().isEnabled;
  });

  // Manual Instant Play 1-Second Loading Animation State & Button Ref
  const [isGeneratingContest, setIsGeneratingContest] = useState<boolean>(false);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // Contest Builder Form State
  const [contestFormType, setContestFormType] = useState<'cash' | 'product'>('product');
  
  // Cash Fields (Starts empty for manual admin entry)
  const [cashTitle, setCashTitle] = useState('');
  const [cashOverlayTitle, setCashOverlayTitle] = useState('');
  const [cashBadge, setCashBadge] = useState('INSTANT UPI');
  const [cashEntryFee, setCashEntryFee] = useState<number | ''>('');
  const [cashPrizePool, setCashPrizePool] = useState<number | ''>('');
  const [cashMaxParticipants, setCashMaxParticipants] = useState<number | ''>(50);
  const [cashWinnersCount, setCashWinnersCount] = useState<number>(5);
  const [cashBreakdownType, setCashBreakdownType] = useState<string>('single_winner');
  const [cashStartTime, setCashStartTime] = useState('');
  const [cashEndTime, setCashEndTime] = useState('');
  const [cashImageUrl, setCashImageUrl] = useState('');

  // Product Fields (Starts empty for manual admin entry)
  const [prodTitle, setProdTitle] = useState('');
  const [prodOverlayTitle, setProdOverlayTitle] = useState('');
  const [prodBadge, setProdBadge] = useState('RANK #1');
  const [prodItemTitle, setProdItemTitle] = useState('');
  const [prodBrand, setProdBrand] = useState('');
  const [prodMrp, setProdMrp] = useState<number | ''>('');
  const [prodRetailValue, setProdRetailValue] = useState<number | ''>('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodFulfillmentLink, setProdFulfillmentLink] = useState('');
  const [prodPartner, setProdPartner] = useState<string>('Amazon India');
  const [prodEntryFee, setProdEntryFee] = useState<number | ''>('');
  const [prodMaxParticipants, setProdMaxParticipants] = useState<number | ''>(50);
  const [prodWinnersCount, setProdWinnersCount] = useState<number>(1);
  const [prodStartTime, setProdStartTime] = useState('');
  const [prodEndTime, setProdEndTime] = useState('');

  // Real-time Contest Card Editing State
  const [editingContest, setEditingContest] = useState<ActiveContest | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editOverlayTitle, setEditOverlayTitle] = useState<string>('');
  const [editBadge, setEditBadge] = useState<string>('');
  const [editEntryFee, setEditEntryFee] = useState<number | ''>('');
  const [editPrizeValue, setEditPrizeValue] = useState<number | ''>('');
  const [editMaxParticipants, setEditMaxParticipants] = useState<number | ''>(50);
  const [editWinnersCount, setEditWinnersCount] = useState<number>(5);
  const [editImageUrl, setEditImageUrl] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [editItemTitle, setEditItemTitle] = useState<string>('');
  const editImageFileInputRef = useRef<HTMLInputElement>(null);

  // Catalog Presets with real-time delete option
  const [presetCatalog, setPresetCatalog] = useState(() => {
    try {
      const saved = localStorage.getItem('quizkart_preset_catalog');
      return saved ? JSON.parse(saved) : PRESET_PRODUCTS;
    } catch {
      return PRESET_PRODUCTS;
    }
  });

  const handleDeletePreset = (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.playClick();
    const updated = presetCatalog.filter((_, idx) => idx !== indexToDelete);
    setPresetCatalog(updated);
    try {
      localStorage.setItem('quizkart_preset_catalog', JSON.stringify(updated));
    } catch {}
    onShowToast('Catalog preset removed permanently.', 'info');
  };

  // Image Upload Ref & Handler
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        if (isGif) {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            setProdImageUrl(res);
            soundFx.playSuccess();
            onShowToast('Animated GIF product banner uploaded successfully!', 'success');
          };
          reader.readAsDataURL(file);
        } else {
          const compressed = await compressImage(file, 800, 600, 0.72);
          setProdImageUrl(compressed);
          soundFx.playSuccess();
          onShowToast('Product image uploaded & optimized successfully!', 'success');
        }
      } catch {
        onShowToast('Failed to optimize product image', 'error');
      } finally {
        e.target.value = '';
      }
    }
  };

  // Cash Image Upload Ref & Handler
  const cashFileInputRef = useRef<HTMLInputElement>(null);
  const handleCashImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        if (isGif) {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            setCashImageUrl(res);
            soundFx.playSuccess();
            onShowToast('Animated GIF tournament banner uploaded successfully!', 'success');
          };
          reader.readAsDataURL(file);
        } else {
          const compressed = await compressImage(file, 800, 600, 0.72);
          setCashImageUrl(compressed);
          soundFx.playSuccess();
          onShowToast('Tournament banner uploaded & optimized successfully!', 'success');
        }
      } catch {
        onShowToast('Failed to optimize tournament banner', 'error');
      } finally {
        e.target.value = '';
      }
    }
  };

  // Question Pool Tiers for 3-3-3-1 Health Check
  const easyCount = questions.filter(q => q.difficulty === 'Easy').length;
  const mediumCount = questions.filter(q => q.difficulty === 'Medium').length;
  const hardCount = questions.filter(q => q.difficulty === 'Hard').length;
  const expertCount = questions.filter(q => q.difficulty === 'Expert').length;
  const isRatioHealthy = easyCount >= 3 && mediumCount >= 3 && hardCount >= 3 && expertCount >= 1;
  const answeredIds = getAnsweredQuestionIds();

  // Save contests update helper with immediate Firestore sync and sanitization
  const updateContestList = (newList: ActiveContest[]) => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    const filteredList = (newList || []).filter(c => c && c.id && !deletedList.includes(c.id));
    const sanitizedList = filteredList.map(sanitizeContestSynchronous);
    setContests(sanitizedList);
    saveActiveContests(sanitizedList);
    if (onUpdateContests) {
      onUpdateContests(sanitizedList);
    }
    sanitizedList.forEach(c => {
      saveContestToFirestore(c).catch(() => {});
    });
  };

  // 1. AUTO-PILOT ON/OFF TOGGLE SWITCH LOGIC
  const handleToggleAutoPilot = () => {
    soundFx.playClick();
    const nextState = !isAutoPilotActive;
    setIsAutoPilotActive(nextState);

    // Persistent State: Bind the toggle switch directly to LocalStorage (`quizkart_autopilot_active`)
    try {
      localStorage.setItem('quizkart_autopilot_active', String(nextState));
    } catch {}

    const updatedSettings: AutoPilotSettings = {
      ...autoPilot,
      isEnabled: nextState
    };
    setAutoPilot(updatedSettings);
    saveAutoPilotSettings(updatedSettings);

    // Toast notices matching exact specifications
    if (nextState) {
      onShowToast("Auto-Pilot Scheduler Activated (Daily Automatic Contests Enabled)", "success");
    } else {
      onShowToast("Auto-Pilot Deactivated", "info");
    }
  };

  // 2. CONTEST GENERATION EXECUTION (Manual Instant Play & Auto-Pilot Scheduler)
  const executeContestGeneration = async (isAutomated = false) => {
    if (isGeneratingContest) return;

    if (questions.length === 0) {
      soundFx.playWrong();
      onShowToast("Question pool is empty! Please add questions to the Question Bank first.", "info");
      return;
    }

    setIsGeneratingContest(true);
    if (!isAutomated) {
      soundFx.playClick();
    }

    // 1-Second Loading Animation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Immediately pull 10 questions from the active pool following the strict 3-3-3-1 ratio
    // (3 Easy, 3 Medium, 3 Hard, 1 Expert)
    const easyPool = (questions || []).filter(q => q && q.difficulty === 'Easy');
    const mediumPool = (questions || []).filter(q => q && q.difficulty === 'Medium');
    const hardPool = (questions || []).filter(q => q && q.difficulty === 'Hard');
    const expertPool = (questions || []).filter(q => q && q.difficulty === 'Expert');

    let pickedEasy = easyPool.slice(0, 3);
    let pickedMedium = mediumPool.slice(0, 3);
    let pickedHard = hardPool.slice(0, 3);
    let pickedExpert = expertPool.slice(0, 1);

    let selectedQuestions = [...pickedEasy, ...pickedMedium, ...pickedHard, ...pickedExpert].filter(q => q && q.id != null);
    const pickedIds = new Set(selectedQuestions.map(q => q.id));

    // If pool has fewer in certain tiers, supplement from remaining questions in pool to reach up to 10
    if (selectedQuestions.length < 10 && (questions || []).length > selectedQuestions.length) {
      const remainingQuestionsInPool = (questions || []).filter(q => q && q.id != null && !pickedIds.has(q.id));
      const needed = 10 - selectedQuestions.length;
      selectedQuestions = [...selectedQuestions, ...remainingQuestionsInPool.slice(0, needed)];
    }

    // If pool has fewer than 10 total questions, use all available questions
    if (selectedQuestions.length === 0 && (questions || []).length > 0) {
      selectedQuestions = (questions || []).filter(q => q && q.id != null).slice(0, 10);
    }

    // Reduce pool question counts dynamically in real-time
    const selectedIdsSet = new Set(selectedQuestions.map(q => q.id));
    const remainingQuestions = questions.filter(q => q && q.id != null && !selectedIdsSet.has(q.id));

    onUpdateQuestions?.(remainingQuestions);
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(remainingQuestions));
    } catch {}

    // Instant UI Update: Create and push a new active contest into the live contest state / LocalStorage
    const newContestId = `CNT-LIVE-${Date.now().toString().slice(-4)}`;
    const isCash = autoPilot.contestType === 'cash';
    const contestTitle = isCash
      ? `₹${autoPilot.cashPrizePool.toLocaleString('en-IN')} Tournament Blitz`
      : `${autoPilot.productItemTitle || todayPrize.title} Tournament Championship`;

    const newContest: ActiveContest = {
      id: newContestId,
      type: isCash ? 'cash' : 'product',
      title: contestTitle,
      entryFee: autoPilot.entryFee || (isCash ? 50 : 100),
      productConfig: !isCash ? {
        itemTitle: autoPilot.productItemTitle || todayPrize.title,
        brand: todayPrize.brand || 'Noise',
        marketValue: autoPilot.productMarketValue || 7999,
        retailValue: Math.round((autoPilot.productMarketValue || 7999) * 0.65),
        productImageUrl: autoPilot.productImageUrl || todayPrize.imageUrl,
        ecommerceFulfillmentLink: autoPilot.ecommerceFulfillmentLink || 'https://www.amazon.in/dp/B0C8V73TQR',
        deliveryPartner: todayPrize.deliveryPartner || 'Amazon',
        estimatedDeliveryDays: todayPrize.estimatedDeliveryDays || '2 - 3 Days'
      } : undefined,
      cashConfig: isCash ? {
        entryFee: autoPilot.entryFee || 50,
        prizePool: autoPilot.cashPrizePool || 10000,
        shareBreakdownType: 'single_winner',
        winnerShareSummary: `Rank 1 = 100% (₹${(autoPilot.cashPrizePool || 10000).toLocaleString('en-IN')} Instant UPI)`
      } : undefined,
      status: 'active',
      scheduledTime: 'Live Active Tournament',
      autoPilotRecurring: true,
      questionIds: selectedQuestions.map(q => q.id),
      createdAt: new Date().toISOString()
    };

    const updatedContests = [newContest, ...contests];
    updateContestList(updatedContests);

    // Update today's prize and pool data
    if (!isCash) {
      onUpdatePrize({
        ...todayPrize,
        id: `prize-${Date.now()}`,
        title: autoPilot.productItemTitle || todayPrize.title,
        mrp: autoPilot.productMarketValue || todayPrize.mrp,
        retailValue: Math.round((autoPilot.productMarketValue || todayPrize.mrp) * 0.65),
        imageUrl: autoPilot.productImageUrl || todayPrize.imageUrl
      });
    }

    onUpdatePoolData({
      ...poolData,
      entryFee: autoPilot.entryFee || poolData.entryFee,
      totalPoolAmount: (autoPilot.entryFee || poolData.entryFee) * 100,
      activeParticipants: Math.floor(65 + Math.random() * 20),
      targetParticipants: 100
    });

    setIsGeneratingContest(false);
    soundFx.playSuccess();

    // Trigger success notification popup
    onShowToast("New Tournament Contest Successfully Created & Published!", "success");
  };

  // Execution: When active (ON), register a background timer interval/cron logic
  useEffect(() => {
    if (!isAutoPilotActive) return;

    // Periodic check interval (every 30 seconds)
    const intervalTimer = setInterval(() => {
      const activeState = localStorage.getItem('quizkart_autopilot_active');
      if (activeState !== 'true') return;

      const lastAutomatedDate = localStorage.getItem('quizkart_autopilot_last_run_date');
      const todayDateKey = new Date().toDateString();

      // Check pool condition: Pool must have at least 10 questions to satisfy 3-3-3-1 ratio
      if (questions.length >= 10 && lastAutomatedDate !== todayDateKey) {
        try {
          localStorage.setItem('quizkart_autopilot_last_run_date', todayDateKey);
        } catch {}
        executeContestGeneration(true);
      }
    }, 30000);

    return () => clearInterval(intervalTimer);
  }, [isAutoPilotActive, questions, autoPilot, contests]);

  // Active Event Listener: Bind an explicit handler to the Play Icon button
  useEffect(() => {
    const btn = playButtonRef.current;
    if (!btn) return;

    const handleNativeClick = (e: MouseEvent) => {
      e.stopPropagation();
      executeContestGeneration(false);
    };

    btn.addEventListener('click', handleNativeClick);
    return () => {
      btn.removeEventListener('click', handleNativeClick);
    };
  }, [questions, autoPilot, contests, isGeneratingContest]);

  // Format conflict timestamp into clean time string (e.g. "9:30 AM" or "Oct 8, 9:30 AM")
  const formatConflictTime = (ms: number): string => {
    if (!ms || isNaN(ms)) return '';
    const d = new Date(ms);
    const now = new Date();
    const isSameDay = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    if (isSameDay) {
      return timeStr;
    }
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  };

  // Time-slot conflict validation guard:
  // Checks if selected start/end range overlaps with any currently scheduled or running contest
  const checkTimeConflict = (newStartMs: number, newEndMs: number, excludeId?: string) => {
    const activeOrScheduled = (contests || []).filter(c => 
      c && 
      c.id && 
      c.id !== excludeId && 
      (c.status === 'active' || c.status === 'scheduled' || c.status === 'full')
    );

    for (const existing of activeOrScheduled) {
      const existingStartMs = parseTargetTimestamp(existing.scheduledTime);
      const existingEndMs = existing.endTime 
        ? parseTargetTimestamp(existing.endTime) 
        : (existingStartMs + 24 * 3600 * 1000);

      if (existingStartMs > 0 && existingEndMs > 0) {
        if (newStartMs < existingEndMs && newEndMs > existingStartMs) {
          return {
            conflict: true,
            conflictingContest: existing,
            existingEndMs
          };
        }
      }
    }
    return { conflict: false, conflictingContest: null, existingEndMs: 0 };
  };

  // Create Cash Contest with strict validation & time conflict guard
  const handleCreateCashContest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashStartTime.trim() || !cashEntryFee) {
      soundFx.playWrong();
      onShowToast('Please fill all required fields (*) before publishing.', 'info');
      return;
    }

    const startMs = parseTargetTimestamp(cashStartTime);
    const effectiveEndTime = cashEndTime.trim() 
      ? cashEndTime.trim() 
      : new Date(startMs + 24 * 3600 * 1000).toISOString();
    const endMs = parseTargetTimestamp(effectiveEndTime);

    if (endMs <= startMs) {
      soundFx.playWrong();
      onShowToast('End timer must be scheduled after start timer.', 'error');
      return;
    }

    // Admin Time-Slot Conflict Guard: BLOCK creation and alert
    const conflictCheck = checkTimeConflict(startMs, endMs);
    if (conflictCheck.conflict) {
      soundFx.playWrong();
      const endFormatted = formatConflictTime(conflictCheck.existingEndMs);
      onShowToast(`A contest is already scheduled/active until ${endFormatted}. Please set the start time after ${endFormatted}.`, 'error');
      return;
    }

    const targetLimit = Number(cashMaxParticipants) || 50;

    // Strict Single-Live Rule & Automatic Queuing to UPCOMING:
    // If another contest is already LIVE, or if the scheduled start time is in the future, queue as UPCOMING
    const hasActiveContest = (contests || []).some(c => c.status === 'active');
    const isFutureStart = startMs > Date.now();
    const willBeActive = !hasActiveContest && !isFutureStart;
    const initialStatus: 'active' | 'scheduled' = willBeActive ? 'active' : 'scheduled';

    const newContest: ActiveContest = {
      id: `CNT-CASH-${Date.now().toString().slice(-4)}`,
      type: 'cash',
      title: cashTitle.trim(),
      overlayTitle: cashOverlayTitle.trim(),
      badge: (cashBadge.trim() || 'INSTANT UPI').toUpperCase(),
      entryFee: Number(cashEntryFee),
      maxParticipants: targetLimit,
      winnersCount: Number(cashWinnersCount) || 5,
      cashConfig: {
        entryFee: Number(cashEntryFee),
        prizePool: cashPrizePool ? Number(cashPrizePool) : 0,
        shareBreakdownType: cashBreakdownType,
        winnerShareSummary: cashPrizePool ? calculatePayoutSummary(Number(cashPrizePool), cashBreakdownType) : '',
        cashImageUrl: cashImageUrl || undefined
      },
      status: initialStatus,
      scheduledTime: cashStartTime,
      endTime: effectiveEndTime,
      activatedAt: willBeActive ? new Date().toISOString() : undefined,
      autoPilotRecurring: true,
      questionIds: (questions || []).filter(q => q && q.id != null).slice(0, 10).map(q => q.id),
      realJoins: 0,
      totalRevenue: 0,
      createdAt: new Date().toISOString()
    };

    if (willBeActive) {
      // Single-live: new contest is active, previous active becomes completed
      const updatedContests = [
        newContest,
        ...contests.map(c => {
          if (c.status === 'active') {
            return { ...c, status: 'completed' as const };
          }
          return c;
        })
      ];
      updateContestList(updatedContests);

      onUpdateActiveContest?.(newContest);
      try {
        localStorage.setItem('quizkart_current_active_contest', JSON.stringify(newContest));
        localStorage.setItem('quizkart_active_contest_id', newContest.id);
      } catch {}

      onUpdatePrize({
        ...todayPrize,
        id: newContest.id,
        title: cashTitle.trim(),
        badge: (cashBadge.trim() || 'INSTANT UPI').toUpperCase(),
        brand: 'QuizKart Cash',
        mrp: cashPrizePool ? Number(cashPrizePool) : 0,
        retailValue: cashPrizePool ? Number(cashPrizePool) : 0,
        category: 'Cash Tournament',
        imageUrl: cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80',
        features: cashPrizePool ? [calculatePayoutSummary(Number(cashPrizePool), cashBreakdownType)] : [],
        deliveryPartner: 'Instant UPI',
        estimatedDeliveryDays: 'Instant'
      });

      onUpdatePoolData({
        ...poolData,
        entryFee: Number(cashEntryFee),
        totalPoolAmount: 0,
        productPrizeValue: 0,
        runnerUpPoolValue: 0,
        platformFeeValue: 0,
        activeParticipants: 0,
        targetParticipants: targetLimit
      });

      soundFx.playSuccess();
      onShowToast(`💰 Cash Tournament "${newContest.title}" published & set as ACTIVE!`, 'success');
    } else {
      // Automatically queued to UPCOMING without disturbing active contest
      const updatedContests = [newContest, ...contests];
      updateContestList(updatedContests);

      soundFx.playSuccess();
      onShowToast(`🕒 Cash Tournament "${newContest.title}" queued as UPCOMING.`, 'success');
    }

    // Clear form inputs
    setCashTitle('');
    setCashOverlayTitle('');
    setCashEntryFee('');
    setCashPrizePool('');
    setCashStartTime('');
    setCashEndTime('');
    setCashImageUrl('');
  };

  // Create Product Contest with strict validation & time conflict guard
  const handleCreateProductContest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodItemTitle.trim() || !prodEntryFee || !prodStartTime.trim() || !prodFulfillmentLink.trim()) {
      soundFx.playWrong();
      onShowToast('Please fill all required fields (*) before publishing.', 'info');
      return;
    }

    const startMs = parseTargetTimestamp(prodStartTime);
    const effectiveEndTime = prodEndTime.trim() 
      ? prodEndTime.trim() 
      : new Date(startMs + 24 * 3600 * 1000).toISOString();
    const endMs = parseTargetTimestamp(effectiveEndTime);

    if (endMs <= startMs) {
      soundFx.playWrong();
      onShowToast('End timer must be scheduled after start timer.', 'error');
      return;
    }

    // Admin Time-Slot Conflict Guard: BLOCK creation and alert
    const conflictCheck = checkTimeConflict(startMs, endMs);
    if (conflictCheck.conflict) {
      soundFx.playWrong();
      const endFormatted = formatConflictTime(conflictCheck.existingEndMs);
      onShowToast(`A contest is already scheduled/active until ${endFormatted}. Please set the start time after ${endFormatted}.`, 'error');
      return;
    }

    const targetLimit = Number(prodMaxParticipants) || 50;

    // Strict Single-Live Rule & Automatic Queuing to UPCOMING
    const hasActiveContest = (contests || []).some(c => c.status === 'active');
    const isFutureStart = startMs > Date.now();
    const willBeActive = !hasActiveContest && !isFutureStart;
    const initialStatus: 'active' | 'scheduled' = willBeActive ? 'active' : 'scheduled';

    const newContest: ActiveContest = {
      id: `CNT-PROD-${Date.now().toString().slice(-4)}`,
      type: 'product',
      title: prodTitle.trim(),
      overlayTitle: prodOverlayTitle.trim(),
      badge: (prodBadge.trim() || 'RANK #1').toUpperCase(),
      entryFee: Number(prodEntryFee),
      maxParticipants: targetLimit,
      winnersCount: Number(prodWinnersCount) || 1,
      productConfig: {
        itemTitle: prodItemTitle.trim(),
        brand: prodBrand.trim() || 'Brand',
        marketValue: Number(prodMrp) || Number(prodRetailValue) || 4999,
        retailValue: Number(prodRetailValue) || 4999,
        productImageUrl: prodImageUrl.trim() || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        ecommerceFulfillmentLink: prodFulfillmentLink.trim(),
        deliveryPartner: prodPartner,
        estimatedDeliveryDays: '2 - 3 Days'
      },
      status: initialStatus,
      scheduledTime: prodStartTime,
      endTime: effectiveEndTime,
      activatedAt: willBeActive ? new Date().toISOString() : undefined,
      autoPilotRecurring: true,
      questionIds: (questions || []).filter(q => q && q.id != null).slice(0, 10).map(q => q.id),
      realJoins: 0,
      totalRevenue: 0,
      createdAt: new Date().toISOString()
    };

    if (willBeActive) {
      const updatedContests = [
        newContest,
        ...contests.map(c => {
          if (c.status === 'active') {
            return { ...c, status: 'completed' as const };
          }
          return c;
        })
      ];
      updateContestList(updatedContests);

      onUpdateActiveContest?.(newContest);
      try {
        localStorage.setItem('quizkart_current_active_contest', JSON.stringify(newContest));
        localStorage.setItem('quizkart_active_contest_id', newContest.id);
      } catch {}

      onUpdatePrize({
        ...todayPrize,
        id: newContest.id,
        title: prodItemTitle.trim(),
        badge: (prodBadge.trim() || 'RANK #1').toUpperCase(),
        brand: prodBrand.trim() || 'Official Brand',
        mrp: Number(prodMrp) || Number(prodRetailValue) || 4999,
        retailValue: Number(prodRetailValue) || 4999,
        category: 'Electronics & Lifestyle',
        imageUrl: prodImageUrl.trim() || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        features: ['100% Original Verified Asset', 'Brand Sealed', 'Standard Warranty'],
        deliveryPartner: prodPartner || 'Amazon',
        estimatedDeliveryDays: '2 - 3 Days'
      });

      onUpdatePoolData({
        ...poolData,
        entryFee: Number(prodEntryFee),
        totalPoolAmount: 0,
        productPrizeValue: Number(prodRetailValue || 4999),
        runnerUpPoolValue: 0,
        platformFeeValue: 0,
        activeParticipants: 0,
        targetParticipants: targetLimit
      });

      soundFx.playSuccess();
      onShowToast(`🎁 Product Tournament "${newContest.title}" published & set as ACTIVE!`, 'success');
    } else {
      const updatedContests = [newContest, ...contests];
      updateContestList(updatedContests);

      soundFx.playSuccess();
      onShowToast(`🕒 Product Tournament "${newContest.title}" queued as UPCOMING.`, 'success');
    }

    // Clear form inputs
    setProdTitle('');
    setProdOverlayTitle('');
    setProdItemTitle('');
    setProdBrand('');
    setProdMrp('');
    setProdRetailValue('');
    setProdEntryFee('');
    setProdStartTime('');
    setProdEndTime('');
    setProdImageUrl('');
    setProdFulfillmentLink('');
  };

  // Start inline editing of an active/scheduled contest card
  const handleStartEditContest = (c: ActiveContest) => {
    soundFx.playClick();
    setEditingContest(c);
    setEditTitle(c.title);
    setEditOverlayTitle(c.overlayTitle || '');
    setEditBadge(c.badge || (c.type === 'cash' ? 'INSTANT UPI' : 'RANK #1'));
    setEditEntryFee(c.entryFee);
    setEditPrizeValue(c.type === 'cash' ? (c.cashConfig?.prizePool ?? '') : (c.productConfig?.retailValue ?? ''));
    setEditMaxParticipants(c.maxParticipants || poolData.targetParticipants || 50);
    setEditWinnersCount(c.winnersCount || (c.type === 'product' ? 1 : 5));
    setEditItemTitle(c.productConfig?.itemTitle || c.title);
    const img = c.type === 'product'
      ? (c.productConfig?.productImageUrl || '')
      : (c.cashConfig?.cashImageUrl || '');
    setEditImageUrl(img);
    setEditStartTime(c.scheduledTime || new Date().toISOString());
    setEditEndTime(c.endTime || new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  };

  // Handlers for edit modal start and end time changes with conflict warning
  const handleEditStartTimeChange = (newVal: string) => {
    setEditStartTime(newVal);
    if (!editingContest) return;
    const startMs = parseTargetTimestamp(newVal);
    const effectiveEnd = editEndTime || editingContest.endTime;
    const endMs = effectiveEnd ? parseTargetTimestamp(effectiveEnd) : (startMs + 24 * 3600 * 1000);
    const activeRunning = (contests || []).find(c => c && c.id !== editingContest.id && (c.status === 'active' || c.id === activeContest?.id));
    if (activeRunning && startMs > 0 && endMs > 0) {
      const activeStart = parseTargetTimestamp(activeRunning.scheduledTime || activeRunning.activatedAt) || (Date.now() - 3600000);
      const activeEnd = activeRunning.endTime ? parseTargetTimestamp(activeRunning.endTime) : (activeStart + 24 * 3600 * 1000);
      if (startMs < activeEnd && endMs > activeStart) {
        soundFx.playWrong();
        const endFormatted = formatConflictTime(activeEnd);
        onShowToast(`Cannot set overlapping timeframe with an active contest. Please choose a slot after ${endFormatted}.`, 'error');
      }
    }
  };

  const handleEditEndTimeChange = (newVal: string) => {
    setEditEndTime(newVal);
    if (!editingContest) return;
    const startMs = parseTargetTimestamp(editStartTime || editingContest.scheduledTime);
    const endMs = parseTargetTimestamp(newVal);
    const activeRunning = (contests || []).find(c => c && c.id !== editingContest.id && (c.status === 'active' || c.id === activeContest?.id));
    if (activeRunning && startMs > 0 && endMs > 0) {
      const activeStart = parseTargetTimestamp(activeRunning.scheduledTime || activeRunning.activatedAt) || (Date.now() - 3600000);
      const activeEnd = activeRunning.endTime ? parseTargetTimestamp(activeRunning.endTime) : (activeStart + 24 * 3600 * 1000);
      if (startMs < activeEnd && endMs > activeStart) {
        soundFx.playWrong();
        const endFormatted = formatConflictTime(activeEnd);
        onShowToast(`Cannot set overlapping timeframe with an active contest. Please choose a slot after ${endFormatted}.`, 'error');
      }
    }
  };

  // Save changes to the contest card
  const handleSaveContestEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContest) return;

    const editStartMs = parseTargetTimestamp(editStartTime || editingContest.scheduledTime);
    const effectiveEditEndTime = editEndTime || editingContest.endTime || new Date(editStartMs + 24 * 3600 * 1000).toISOString();
    const editEndMs = parseTargetTimestamp(effectiveEditEndTime);

    if (editEndMs <= editStartMs) {
      soundFx.playWrong();
      onShowToast('End timer must be scheduled after start timer.', 'error');
      return;
    }

    // EDIT TIMER GUARD: In the Contest Edit Modal (Pencil Icon), if the admin attempts to change or save a Start/End timer that overlaps with an active or already running contest timeframe, BLOCK the action and trigger an alert toast:
    // "Cannot set overlapping timeframe with an active contest. Please choose a slot after [End Time]."
    const activeRunningContest = (contests || []).find(c => 
      c && c.id !== editingContest.id && (c.status === 'active' || c.id === activeContest?.id)
    );

    if (activeRunningContest) {
      const activeStartMs = parseTargetTimestamp(activeRunningContest.scheduledTime || activeRunningContest.activatedAt) || (Date.now() - 3600000);
      const activeEndMs = activeRunningContest.endTime 
        ? parseTargetTimestamp(activeRunningContest.endTime) 
        : (activeStartMs + 24 * 3600 * 1000);

      if (activeStartMs > 0 && activeEndMs > 0) {
        if (editStartMs < activeEndMs && editEndMs > activeStartMs) {
          soundFx.playWrong();
          const endFormatted = formatConflictTime(activeEndMs);
          onShowToast(`Cannot set overlapping timeframe with an active contest. Please choose a slot after ${endFormatted}.`, 'error');
          return;
        }
      }
    }

    const newPrize = editPrizeValue !== '' && editPrizeValue !== undefined ? Number(editPrizeValue) : (editingContest.type === 'cash' ? (editingContest.cashConfig?.prizePool || 0) : (editingContest.productConfig?.retailValue || 0));
    const newFee = Number(editEntryFee) || editingContest.entryFee;
    const newMaxParticipants = Number(editMaxParticipants) || editingContest.maxParticipants || 50;
    const newWinnersCount = Number(editWinnersCount) || editingContest.winnersCount || 5;
    const newTitle = editTitle.trim();
    const newOverlayTitle = editOverlayTitle.trim();
    const newBadge = (editBadge.trim() || editingContest.badge || (editingContest.type === 'cash' ? 'INSTANT UPI' : 'RANK #1')).toUpperCase();

    const updated: ActiveContest = {
      ...editingContest,
      title: newTitle,
      overlayTitle: newOverlayTitle,
      badge: newBadge,
      entryFee: newFee,
      maxParticipants: newMaxParticipants,
      winnersCount: newWinnersCount,
      scheduledTime: editStartTime || editingContest.scheduledTime,
      endTime: editEndTime || editingContest.endTime || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    if (editingContest.type === 'cash' && updated.cashConfig) {
      updated.cashConfig = {
        ...updated.cashConfig,
        entryFee: newFee,
        prizePool: newPrize,
        cashImageUrl: editImageUrl.trim() || updated.cashConfig.cashImageUrl,
        winnerShareSummary: calculatePayoutSummary(newPrize, updated.cashConfig.shareBreakdownType || 'single_winner')
      };
    } else if (editingContest.type === 'product' && updated.productConfig) {
      updated.productConfig = {
        ...updated.productConfig,
        itemTitle: editItemTitle.trim() || updated.productConfig.itemTitle,
        retailValue: newPrize,
        marketValue: Math.max(newPrize, updated.productConfig.marketValue || newPrize),
        productImageUrl: editImageUrl.trim() || updated.productConfig.productImageUrl,
      };
    }

    const nextContests = contests.map(c => c.id === updated.id ? updated : c);
    updateContestList(nextContests);

    // If active, sync to activeContest and todayPrize
    if (activeContest?.id === updated.id) {
      onUpdateActiveContest?.(updated);
      try {
        localStorage.setItem('quizkart_current_active_contest', JSON.stringify(updated));
      } catch {}

      if (updated.type === 'cash' && updated.cashConfig) {
        onUpdatePrize({
          ...todayPrize,
          id: updated.id,
          title: newTitle,
          badge: newBadge,
          mrp: newPrize,
          retailValue: newPrize,
          imageUrl: editImageUrl.trim() || todayPrize.imageUrl
        });
        onUpdatePoolData({
          ...poolData,
          entryFee: newFee,
          totalPoolAmount: newPrize,
          productPrizeValue: 0,
          runnerUpPoolValue: Math.round(newPrize * 0.9),
          platformFeeValue: Math.round(newPrize * 0.1),
          targetParticipants: newMaxParticipants
        });
      } else if (updated.type === 'product' && updated.productConfig) {
        onUpdatePrize({
          ...todayPrize,
          id: updated.id,
          title: editItemTitle.trim() || newTitle,
          badge: newBadge,
          mrp: updated.productConfig.marketValue,
          retailValue: newPrize,
          imageUrl: editImageUrl.trim() || todayPrize.imageUrl
        });
        onUpdatePoolData({
          ...poolData,
          entryFee: newFee,
          totalPoolAmount: newPrize * 2,
          productPrizeValue: newPrize,
          runnerUpPoolValue: Math.round(newPrize * 0.8),
          platformFeeValue: Math.round(newPrize * 0.2),
          targetParticipants: newMaxParticipants
        });
      }
    }

    soundFx.playSuccess();
    onShowToast(`✅ Tournament "${newTitle}" updated and synchronized live!`, 'success');
    setEditingContest(null);
  };

  // Make a contest active for today
  const handleActivateContest = (contest: ActiveContest) => {
    // DISABLE MANUAL LIVE SWITCH: If a contest is currently LIVE, block manual override
    const hasOtherActive = (contests || []).some(c => c && c.id !== contest.id && c.status === 'active');
    if (hasOtherActive) {
      soundFx.playWrong();
      onShowToast('A contest is currently LIVE. Cannot manually activate another contest.', 'error');
      return;
    }

    soundFx.playSuccess();

    const targetLimit = contest.maxParticipants || poolData.targetParticipants || 50;

    if (contest.type === 'product' && contest.productConfig) {
      onUpdatePrize({
        ...todayPrize,
        id: contest.id,
        title: contest.productConfig.itemTitle,
        brand: contest.productConfig.brand,
        mrp: contest.productConfig.marketValue,
        retailValue: contest.productConfig.retailValue,
        imageUrl: contest.productConfig.productImageUrl,
        deliveryPartner: contest.productConfig.deliveryPartner,
        estimatedDeliveryDays: contest.productConfig.estimatedDeliveryDays
      });
      onUpdatePoolData({
        ...poolData,
        entryFee: contest.entryFee,
        productPrizeValue: contest.productConfig.retailValue,
        targetParticipants: targetLimit
      });
    } else if (contest.type === 'cash' && contest.cashConfig) {
      onUpdatePrize({
        ...todayPrize,
        id: contest.id,
        title: contest.title,
        brand: 'QuizKart Cash',
        mrp: contest.cashConfig.prizePool,
        retailValue: contest.cashConfig.prizePool,
        imageUrl: contest.cashConfig.cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80',
        deliveryPartner: 'Instant UPI',
        estimatedDeliveryDays: 'Instant'
      });
      onUpdatePoolData({
        ...poolData,
        entryFee: contest.entryFee,
        totalPoolAmount: contest.cashConfig.prizePool,
        targetParticipants: targetLimit
      });
    }

    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(`quizkart_contest_activated_${contest.id}`, String(Date.now()));
    } catch {}

    const updated = (contests || []).filter(c => c && c.id).map(c => {
      if (c.id === contest.id) {
        return { ...c, status: 'active' as const, activatedAt: nowIso };
      }
      // NO AUTO-UPCOMING: When activating a contest, previous active contest becomes completed.
      // Already scheduled or completed contests strictly retain their status.
      if (c.status === 'active') {
        return { ...c, status: 'completed' as const };
      }
      return c;
    });
    updateContestList(updated);

    onUpdateActiveContest?.({ ...contest, status: 'active', activatedAt: nowIso });
    try {
      localStorage.setItem('quizkart_current_active_contest', JSON.stringify({ ...contest, status: 'active', activatedAt: nowIso }));
      localStorage.setItem('quizkart_active_contest_id', contest.id);
    } catch {}

    onShowToast(`⚡ Contest "${contest.title}" is now the ACTIVE tournament!`, 'success');
  };

  // Explicitly set contest to Upcoming status (Manual Admin Upcoming Control)
  const handleSetUpcomingContest = (contest: ActiveContest) => {
    soundFx.playClick();
    try {
      localStorage.removeItem(`quizkart_contest_activated_${contest.id}`);
      localStorage.removeItem(`quizkart_contest_base_${contest.id}`);
    } catch {}
    const updated = (contests || []).filter(c => c && c.id).map(c => {
      if (c.id === contest.id) {
        return { ...c, status: 'scheduled' as const };
      }
      return c;
    });
    updateContestList(updated);

    // If this contest was active, clear active contest pointer
    if (activeContest?.id === contest.id) {
      const otherActive = updated.find(c => c.status === 'active') || null;
      onUpdateActiveContest?.(otherActive);
      try {
        if (otherActive) {
          localStorage.setItem('quizkart_current_active_contest', JSON.stringify(otherActive));
          localStorage.setItem('quizkart_active_contest_id', otherActive.id);
        } else {
          localStorage.removeItem('quizkart_current_active_contest');
          localStorage.setItem('quizkart_active_contest_id', '');
        }
      } catch {}
    }

    onShowToast(`🕒 Contest "${contest.title}" status set to UPCOMING!`, 'info');
  };

  // Explicitly mark contest as Expired status & auto-promote next queued upcoming
  const handleSetExpiredContest = (contest: ActiveContest) => {
    soundFx.playClick();
    const updated = (contests || []).filter(c => c && c.id).map(c => {
      if (c.id === contest.id) {
        return { ...c, status: 'completed' as const };
      }
      return c;
    });

    if (activeContest?.id === contest.id) {
      const queuedUpcoming = updated
        .filter(c => c.status === 'scheduled')
        .sort((a, b) => parseTargetTimestamp(a.scheduledTime) - parseTargetTimestamp(b.scheduledTime));
      const nextActive = queuedUpcoming[0] || null;

      if (nextActive) {
        const withNext = updated.map(c => {
          if (c.id === nextActive.id) return { ...c, status: 'active' as const, activatedAt: new Date().toISOString() };
          return c;
        });
        updateContestList(withNext);
        onUpdateActiveContest?.({ ...nextActive, status: 'active' });
        try {
          localStorage.setItem('quizkart_current_active_contest', JSON.stringify({ ...nextActive, status: 'active' }));
          localStorage.setItem('quizkart_active_contest_id', nextActive.id);
        } catch {}

        if (nextActive.type === 'cash' && nextActive.cashConfig) {
          onUpdatePrize({
            ...todayPrize,
            id: nextActive.id,
            title: nextActive.title,
            badge: nextActive.badge || 'INSTANT UPI',
            brand: 'QuizKart Cash',
            mrp: nextActive.cashConfig.prizePool || 0,
            retailValue: nextActive.cashConfig.prizePool || 0,
            category: 'Cash Tournament',
            imageUrl: nextActive.cashConfig.cashImageUrl || todayPrize.imageUrl,
            deliveryPartner: 'Instant UPI',
            estimatedDeliveryDays: 'Instant'
          });
        } else if (nextActive.type === 'product' && nextActive.productConfig) {
          onUpdatePrize({
            ...todayPrize,
            id: nextActive.id,
            title: nextActive.productConfig.itemTitle || nextActive.title,
            badge: nextActive.badge || 'RANK #1',
            brand: nextActive.productConfig.brand || 'Official Brand',
            mrp: nextActive.productConfig.marketValue || 4999,
            retailValue: nextActive.productConfig.retailValue || 4999,
            category: 'Electronics & Lifestyle',
            imageUrl: nextActive.productConfig.productImageUrl || todayPrize.imageUrl,
            deliveryPartner: nextActive.productConfig.deliveryPartner || 'Amazon',
            estimatedDeliveryDays: '2 - 3 Days'
          });
        }
        onShowToast(`Contest "${contest.title}" marked as EXPIRED. Next upcoming "${nextActive.title}" is now LIVE!`, 'info');
        return;
      } else {
        updateContestList(updated);
        onUpdateActiveContest?.(null);
        try {
          localStorage.removeItem('quizkart_current_active_contest');
          localStorage.setItem('quizkart_active_contest_id', '');
        } catch {}
      }
    } else {
      updateContestList(updated);
    }

    onShowToast(`⏸️ Contest "${contest.title}" marked as EXPIRED.`, 'info');
  };

  // Delete contest permanently (from Firestore, state, and storage) with 1-second circular loading spinner
  const handleDeleteContest = (id: string) => {
    if (deletingContestId) return;
    setDeletingContestId(id);
    soundFx.playClick();

    setTimeout(async () => {
      // 1. Add to permanent deleted blacklist in localStorage so cloud sync never resurrects it
      try {
        const deletedList: string[] = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
        if (!deletedList.includes(id)) {
          deletedList.push(id);
          localStorage.setItem('quizkart_deleted_contests', JSON.stringify(deletedList));
        }
      } catch {}

      // 2. Delete permanently from Firestore
      try {
        await removeContestFromFirestore(id);
      } catch (err) {
        console.warn('Error removing contest from Firestore:', err);
      }

      // 3. Immediately purge from local contests and sync to global state
      const filtered = (contests || []).filter(c => c && c.id !== id);

      if (activeContest?.id === id) {
        const queuedUpcoming = filtered
          .filter(c => c.status === 'scheduled')
          .sort((a, b) => parseTargetTimestamp(a.scheduledTime) - parseTargetTimestamp(b.scheduledTime));
        const nextActiveRaw = queuedUpcoming[0] || null;
        if (nextActiveRaw) {
          const nextActive: ActiveContest = { ...nextActiveRaw, status: 'active', activatedAt: new Date().toISOString() };
          const updatedList = filtered.map(c => ({
            ...c,
            status: c.id === nextActive.id ? ('active' as const) : c.status
          }));
          updateContestList(updatedList);
          onUpdateActiveContest?.(nextActive);
          try {
            localStorage.setItem('quizkart_current_active_contest', JSON.stringify(nextActive));
            localStorage.setItem('quizkart_active_contest_id', nextActive.id);
          } catch {}

          const targetLimit = nextActive.maxParticipants || poolData.targetParticipants || 50;
          if (nextActive.type === 'product' && nextActive.productConfig) {
            onUpdatePrize({
              ...todayPrize,
              id: nextActive.id,
              title: nextActive.productConfig.itemTitle,
              brand: nextActive.productConfig.brand,
              mrp: nextActive.productConfig.marketValue,
              retailValue: nextActive.productConfig.retailValue,
              imageUrl: nextActive.productConfig.productImageUrl,
              deliveryPartner: nextActive.productConfig.deliveryPartner,
              estimatedDeliveryDays: nextActive.productConfig.estimatedDeliveryDays
            });
            onUpdatePoolData({
              ...poolData,
              entryFee: nextActive.entryFee,
              productPrizeValue: nextActive.productConfig.retailValue,
              targetParticipants: targetLimit
            });
          } else if (nextActive.type === 'cash' && nextActive.cashConfig) {
            onUpdatePrize({
              ...todayPrize,
              id: nextActive.id,
              title: nextActive.title,
              badge: nextActive.badge || 'INSTANT UPI',
              brand: 'QuizKart Cash',
              mrp: nextActive.cashConfig.prizePool,
              retailValue: nextActive.cashConfig.prizePool,
              category: 'Cash Tournament',
              imageUrl: nextActive.cashConfig.cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80',
              features: [calculatePayoutSummary(nextActive.cashConfig.prizePool, nextActive.cashConfig.shareBreakdownType || 'single_winner')],
              deliveryPartner: 'Instant UPI',
              estimatedDeliveryDays: 'Instant'
            });
            onUpdatePoolData({
              ...poolData,
              entryFee: nextActive.entryFee,
              totalPoolAmount: nextActive.cashConfig.prizePool,
              targetParticipants: targetLimit
            });
          }
        } else {
          updateContestList([]);
          onUpdateActiveContest?.(null);
          try {
            localStorage.removeItem('quizkart_current_active_contest');
            localStorage.setItem('quizkart_active_contest_id', '');
          } catch {}
          onUpdatePrize({
            id: 'prize-fallback',
            title: 'NEXT MEGA ROUND COMING SOON',
            badge: 'UPCOMING',
            brand: 'QuizKart',
            mrp: 50000,
            retailValue: 50000,
            category: 'Cash Tournament',
            imageUrl: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80',
            features: ['Stay tuned for the upcoming tournament round'],
            deliveryPartner: 'Instant UPI',
            estimatedDeliveryDays: 'Instant'
          });
        }
      } else {
        updateContestList(filtered);
      }

      onDeleteContest?.(id);

      setDeletingContestId(null);
      soundFx.playSuccess();
      onShowToast('Tournament permanently deleted.', 'info');
    }, 1000);
  };

  const labelGradientStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    display: 'inline-block'
  };

  const poolCountOutOf10 = Math.min(10, questions.length);
  const poolPercentage = Math.min(100, Math.round((questions.length / 10) * 100));
  const poolStatusLabel = poolCountOutOf10 >= 10 ? 'Healthy' : poolCountOutOf10 >= 6 ? 'Moderate' : 'Low';

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* ------------------------------------------------------------- */}
      {/* 1. AUTO-PILOT & QUESTION TIERS                                 */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6">
        {/* Header with Title, Card Icon, ON/OFF Toggle Switch & Play 'Run Cycle Now' Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            {/* Card Icon & Background: Vibrant top-left 'Q' logo 3-color gradient */}
            <div 
              className="w-10 h-10 min-w-10 min-h-10 aspect-square shrink-0 rounded-xl flex items-center justify-center text-white shadow-md select-none"
              style={{ background: Q_GRADIENT }}
            >
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                Auto-Pilot
              </h2>
            </div>
          </div>

          {/* ON/OFF Toggle Switch & Adjacent 'Run Cycle Now' Icon Button */}
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {/* Modern ON/OFF Toggle Switch */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-2">
              <span className={`text-xs font-bold transition-colors duration-200 ${isAutoPilotActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                {isAutoPilotActive ? 'ON' : 'OFF'}
              </span>
              <button
                id="auto-pilot-toggle-switch"
                type="button"
                role="switch"
                aria-checked={isAutoPilotActive}
                onClick={handleToggleAutoPilot}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${
                  isAutoPilotActive 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-xs' 
                    : 'bg-slate-300'
                }`}
                title={isAutoPilotActive ? 'Disable Auto-Pilot' : 'Enable Auto-Pilot'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${
                    isAutoPilotActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Play Button (YouTube-shaped icon): Top-Left 'Q' Logo 3-Color Gradient Theme with 1-Second Loading Spinner */}
            <button
              ref={playButtonRef}
              id="instant-play-cycle-button"
              type="button"
              onClick={() => executeContestGeneration(false)}
              disabled={isGeneratingContest}
              title="Run Cycle Now: Immediately Pull 10 Questions (3-3-3-1 Ratio) & Publish Contest"
              aria-label="Run Cycle Now"
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-75 disabled:cursor-not-allowed"
              style={{ background: Q_GRADIENT }}
            >
              {isGeneratingContest ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-white text-white translate-x-[0.5px]" />
              )}
            </button>
          </div>
        </div>

        {/* Question Tier Cards (4 Boxes): Uniform Q-Logo 3-Color Gradient & Clean Labels */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1 - Easy */}
          <div 
            className="p-4 sm:p-5 rounded-2xl text-white relative shadow-md border border-white/20"
            style={{ background: Q_GRADIENT }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/95 tracking-wide">Easy</span>
              <span className="w-5 h-5 rounded-md bg-white/20 text-white text-[11px] font-black flex items-center justify-center border border-white/25">
                1
              </span>
            </div>
            <div className="text-3xl font-black text-white mt-3 tracking-tight">{easyCount}</div>
          </div>

          {/* 2 - Medium */}
          <div 
            className="p-4 sm:p-5 rounded-2xl text-white relative shadow-md border border-white/20"
            style={{ background: Q_GRADIENT }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/95 tracking-wide">Medium</span>
              <span className="w-5 h-5 rounded-md bg-white/20 text-white text-[11px] font-black flex items-center justify-center border border-white/25">
                2
              </span>
            </div>
            <div className="text-3xl font-black text-white mt-3 tracking-tight">{mediumCount}</div>
          </div>

          {/* 3 - Hard */}
          <div 
            className="p-4 sm:p-5 rounded-2xl text-white relative shadow-md border border-white/20"
            style={{ background: Q_GRADIENT }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/95 tracking-wide">Hard</span>
              <span className="w-5 h-5 rounded-md bg-white/20 text-white text-[11px] font-black flex items-center justify-center border border-white/25">
                3
              </span>
            </div>
            <div className="text-3xl font-black text-white mt-3 tracking-tight">{hardCount}</div>
          </div>

          {/* 4 - Expert */}
          <div 
            className="p-4 sm:p-5 rounded-2xl text-white relative shadow-md border border-white/20"
            style={{ background: Q_GRADIENT }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/95 tracking-wide">Expert</span>
              <span className="w-5 h-5 rounded-md bg-white/20 text-white text-[11px] font-black flex items-center justify-center border border-white/25">
                4
              </span>
            </div>
            <div className="text-3xl font-black text-white mt-3 tracking-tight">{expertCount}</div>
          </div>
        </div>

        {/* Pool Status Section: Signature Top-Left 'Q' Logo 3-Color Gradient Theme */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-2.5 text-slate-900">
                {/* Status Badge using Q-logo gradient */}
                <span 
                  className="px-2.5 py-0.5 rounded-full text-white text-[11px] font-black shadow-xs inline-flex items-center gap-1.5"
                  style={{ background: Q_GRADIENT }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>{poolStatusLabel}</span>
                </span>
                <span>
                  Pool: <strong className="text-slate-900 font-black">{poolCountOutOf10}/10 Questions</strong>
                </span>
              </span>

              {/* Percentage Text with signature Q-logo 3-color gradient */}
              <span 
                className="font-black text-sm tracking-tight"
                style={{
                  background: Q_GRADIENT,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: 'inline-block'
                }}
              >
                {poolPercentage}%
              </span>
            </div>

            {/* Clean Progress Bar with active fill strictly using Q-logo gradient */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 p-[1px]">
              <div 
                className="h-full rounded-full transition-all duration-500 shadow-xs"
                style={{ 
                  width: `${Math.max(6, poolPercentage)}%`,
                  background: Q_GRADIENT
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Add Question Button: Icon ONLY (+) with Q-Logo 3-Color Gradient */}
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onSwitchToAddQuestions?.();
              }}
              title="Add Questions"
              aria-label="Add Questions"
              className="w-10 h-10 rounded-xl text-white font-black flex items-center justify-center shadow-md transition-all cursor-pointer active:scale-95 hover:opacity-95 shrink-0"
              style={{ background: Q_GRADIENT }}
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. TOURNAMENT CREATOR (PRODUCT VS CASH)                        */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 
              className="text-base font-black tracking-tight"
              style={labelGradientStyle}
            >
              New Tournament
            </h3>
          </div>

          {/* Form Type Switcher: Icon-Only Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setContestFormType('product');
              }}
              title="Product Contest"
              aria-label="Product Contest"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                contestFormType === 'product'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              style={contestFormType === 'product' ? { background: Q_GRADIENT } : {}}
            >
              <Gift className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setContestFormType('cash');
              }}
              title="Cash / Money Contest"
              aria-label="Cash / Money Contest"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                contestFormType === 'cash'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              style={contestFormType === 'cash' ? { background: Q_GRADIENT } : {}}
            >
              <Coins className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2A. CASH CONTEST FORM */}
        {contestFormType === 'cash' && (
          <form onSubmit={handleCreateCashContest} className="space-y-5">
            {/* Top Single-Click Image Upload & Instant Live Preview Card */}
            <input
              type="file"
              ref={cashFileInputRef}
              accept="image/*,image/gif,image/png,image/jpeg,image/webp,.gif,.png,.jpg,.jpeg,.webp"
              onChange={handleCashImageFileUpload}
              className="hidden"
            />
            {cashImageUrl ? (
              <div className="relative aspect-video rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 group">
                <img 
                  src={cashImageUrl} 
                  alt={cashTitle || 'Tournament Artwork'} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                {/* Top Badge Title rendered strictly on the top edge banner container bar */}
                {cashTitle ? (
                  <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                    <span 
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm"
                      style={{ background: Q_GRADIENT }}
                    >
                      {cashTitle}
                    </span>
                  </div>
                ) : null}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 right-3 text-white pointer-events-none">
                  {cashOverlayTitle ? (
                    <p className="text-[11px] font-semibold text-emerald-300 truncate">
                      {cashOverlayTitle}
                    </p>
                  ) : null}
                  {cashPrizePool && Number(cashPrizePool) > 0 ? (
                    <p className="font-extrabold text-sm text-white flex items-center gap-1.5 mt-0.5">
                      <span>₹{Number(cashPrizePool).toLocaleString('en-IN')} Prize Pool</span>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => cashFileInputRef.current?.click()}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer z-10"
                >
                  <Upload className="w-3 h-3" />
                  <span>Change Image</span>
                </button>
              </div>
            ) : (
              <div
                onClick={() => cashFileInputRef.current?.click()}
                className="relative aspect-video rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 transition-all cursor-pointer flex items-center justify-center p-4 group"
              >
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform"
                  style={{ background: Q_GRADIENT }}
                >
                  <Upload className="w-5 h-5" />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-black mb-1.5">
                    <span style={labelGradientStyle}>Top Badge Title</span>
                  </label>
                  <input
                    type="text"
                    value={cashTitle}
                    onChange={(e) => setCashTitle(e.target.value)}
                    placeholder="e.g. MEGA CASH JACKPOT"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black mb-1.5">
                    <span style={labelGradientStyle}>Banner Overlay Title</span>
                  </label>
                  <input
                    type="text"
                    value={cashOverlayTitle}
                    onChange={(e) => setCashOverlayTitle(e.target.value)}
                    placeholder="e.g. Mega 1st Prize ₹1,00,000"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black mb-1.5">
                    <span style={labelGradientStyle}>Top-Right Badge</span>
                  </label>
                  <input
                    type="text"
                    value={cashBadge}
                    onChange={(e) => setCashBadge(e.target.value)}
                    placeholder="e.g. INSTANT UPI"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ScheduledTimePicker
                  label="Start Timer"
                  value={cashStartTime}
                  onChange={setCashStartTime}
                  labelStyle={labelGradientStyle}
                  required
                />
                <ScheduledTimePicker
                  label="End Timer"
                  value={cashEndTime}
                  onChange={setCashEndTime}
                  labelStyle={labelGradientStyle}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Entry Fee (₹)</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  min={10}
                  required
                  value={cashEntryFee}
                  onChange={(e) => setCashEntryFee(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Prize Pool (₹)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={cashPrizePool}
                  onChange={(e) => setCashPrizePool(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 10000"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Max Participants / Limit</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  min={2}
                  required
                  value={cashMaxParticipants}
                  onChange={(e) => setCashMaxParticipants(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Number of Winners</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <select
                  value={cashWinnersCount}
                  onChange={(e) => setCashWinnersCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 cursor-pointer font-bold"
                >
                  <option value={1}>🏆 1 Winner</option>
                  <option value={3}>🏆 3 Winners</option>
                  <option value={5}>🏆 5 Winners</option>
                  <option value={10}>🏆 10 Winners</option>
                  <option value={15}>🏆 15 Winners</option>
                  <option value={20}>🏆 20 Winners</option>
                  <option value={25}>🏆 25 Winners</option>
                  <option value={50}>🏆 50 Winners</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Winner Share Breakdown</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <select
                  value={cashBreakdownType}
                  onChange={(e) => setCashBreakdownType(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 cursor-pointer font-medium"
                >
                  <option value="single_winner">Single Rank 1 (100%)</option>
                  <option value="top_10">Top 10 Winners</option>
                  <option value="top_20">Top 20 Winners</option>
                  <option value="top_25">Top 25 Winners</option>
                  <option value="top_50">Top 50 Winners</option>
                </select>
              </div>
            </div>

            {/* Prominent Gradient Icon Button: Plus (+) Only */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                title="Create & Publish Cash Contest"
                aria-label="Create & Publish Cash Contest"
                className="w-12 h-12 rounded-2xl text-white shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center hover:opacity-95"
                style={{ background: Q_GRADIENT }}
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </form>
        )}

        {/* 2B. PRODUCT CONTEST FORM */}
        {contestFormType === 'product' && (
          <form onSubmit={handleCreateProductContest} className="space-y-5">
            {/* Top Single-Click Image Upload & Instant Live Preview Card */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,image/gif,image/png,image/jpeg,image/webp,.gif,.png,.jpg,.jpeg,.webp"
              onChange={handleImageFileUpload}
              className="hidden"
            />
            {prodImageUrl ? (
              <div className="relative aspect-video rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 group">
                <img 
                  src={prodImageUrl} 
                  alt={prodItemTitle || 'Product Preview'} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                {/* Top Badge Title rendered strictly on the top edge banner container bar */}
                {prodTitle ? (
                  <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                    <span 
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm"
                      style={{ background: Q_GRADIENT }}
                    >
                      {prodTitle}
                    </span>
                  </div>
                ) : null}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 right-3 text-white pointer-events-none">
                  {prodOverlayTitle ? (
                    <p className="text-[11px] font-semibold text-emerald-300 truncate">
                      {prodOverlayTitle}
                    </p>
                  ) : null}
                  {prodRetailValue && Number(prodRetailValue) > 0 ? (
                    <p className="font-extrabold text-sm text-white flex items-center gap-1.5 mt-0.5">
                      <span>Value: ₹{Number(prodRetailValue).toLocaleString('en-IN')}</span>
                      {prodMrp && Number(prodMrp) > Number(prodRetailValue) ? (
                        <span className="text-[10px] text-slate-300 line-through font-normal">
                          ₹{Number(prodMrp).toLocaleString('en-IN')}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer z-10"
                >
                  <Upload className="w-3 h-3" />
                  <span>Change Image</span>
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-video rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 transition-all cursor-pointer flex items-center justify-center p-4 group"
              >
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform"
                  style={{ background: Q_GRADIENT }}
                >
                  <Upload className="w-5 h-5" />
                </div>
              </div>
            )}

            {/* Catalog Presets with real-time delete option (header removed) */}
            {presetCatalog.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {presetCatalog.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      soundFx.playClick();
                      setProdTitle(`${p.brand} ${p.title.split(' ')[1] || 'Item'} Blitz`);
                      setProdItemTitle(p.title);
                      setProdBrand(p.brand);
                      setProdMrp(p.mrp);
                      setProdRetailValue(p.retailValue);
                      setProdImageUrl(p.imageUrl);
                      setProdFulfillmentLink(p.link);
                      setProdPartner(p.partner);
                      onShowToast(`Loaded preset: ${p.title}`, 'info');
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-400 hover:shadow-xs text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.title} className="w-10 h-10 object-cover rounded-lg shrink-0 border border-slate-100" />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500 font-semibold">{p.partner} • ₹{p.retailValue}</div>
                      </div>
                    </div>
                    {/* Red Delete Button to permanently remove preset item */}
                    <button
                      type="button"
                      onClick={(e) => handleDeletePreset(idx, e)}
                      title="Delete Preset"
                      aria-label="Delete Preset"
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Top Badge Title</span>
                </label>
                <input
                  type="text"
                  value={prodTitle}
                  onChange={(e) => setProdTitle(e.target.value)}
                  placeholder="e.g. SMARTWATCH BLITZ"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Banner Overlay Title</span>
                </label>
                <input
                  type="text"
                  value={prodOverlayTitle}
                  onChange={(e) => setProdOverlayTitle(e.target.value)}
                  placeholder="e.g. Noise AMOLED Smartwatch"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Top-Right Badge</span>
                </label>
                <input
                  type="text"
                  value={prodBadge}
                  onChange={(e) => setProdBadge(e.target.value)}
                  placeholder="e.g. RANK #1"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-semibold uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Item Title</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={prodItemTitle}
                  onChange={(e) => setProdItemTitle(e.target.value)}
                  placeholder="e.g. Noise ColorFit Ultra 3 AMOLED Smartwatch"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Brand</span>
                </label>
                <input
                  type="text"
                  value={prodBrand}
                  onChange={(e) => setProdBrand(e.target.value)}
                  placeholder="e.g. Noise"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>MRP / Market Value (₹)</span>
                </label>
                <input
                  type="number"
                  value={prodMrp}
                  onChange={(e) => setProdMrp(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 7999"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Retail Price (₹)</span>
                </label>
                <input
                  type="number"
                  value={prodRetailValue}
                  onChange={(e) => setProdRetailValue(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 4999"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Entry Fee (₹)</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={prodEntryFee}
                  onChange={(e) => setProdEntryFee(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 100"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Max Participants / Total Limit</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  min={2}
                  required
                  value={prodMaxParticipants}
                  onChange={(e) => setProdMaxParticipants(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ScheduledTimePicker
                label="Start Timer"
                value={prodStartTime}
                onChange={setProdStartTime}
                labelStyle={labelGradientStyle}
                required
              />
              <ScheduledTimePicker
                label="End Timer"
                value={prodEndTime}
                onChange={setProdEndTime}
                labelStyle={labelGradientStyle}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Number of Winners</span>
                  <span className="text-rose-600 font-bold ml-0.5">*</span>
                </label>
                <select
                  value={prodWinnersCount}
                  onChange={(e) => setProdWinnersCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 cursor-pointer font-bold"
                >
                  <option value={1}>🏆 1 Winner (Top Rank #1)</option>
                  <option value={2}>🏆 2 Winners</option>
                  <option value={3}>🏆 3 Winners</option>
                  <option value={5}>🏆 5 Winners</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black mb-1.5">
                  <span style={labelGradientStyle}>Delivery Partner</span>
                </label>
                <select
                  value={prodPartner}
                  onChange={(e) => setProdPartner(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 cursor-pointer font-medium"
                >
                  {DELIVERY_PARTNERS.map((partner) => (
                    <option key={partner} value={partner}>{partner}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black mb-1.5">
                <span style={labelGradientStyle}>Fulfillment Link</span>
                <span className="text-rose-600 font-bold ml-0.5">*</span>
              </label>
              <div className="relative">
                <input
                  type="url"
                  required
                  value={prodFulfillmentLink}
                  onChange={(e) => setProdFulfillmentLink(e.target.value)}
                  placeholder="e.g. https://www.amazon.in/dp/B0C8V73TQR"
                  className="w-full pl-3.5 pr-28 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-slate-500 font-mono text-[11px]"
                />
                <a
                  href={prodFulfillmentLink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!prodFulfillmentLink) {
                      e.preventDefault();
                      onShowToast('Please enter a fulfillment link first.', 'info');
                    }
                  }}
                  style={{ background: Q_GRADIENT }}
                  className="absolute right-2 top-2 px-2.5 py-1 text-[11px] font-bold text-white rounded-lg flex items-center gap-1 cursor-pointer shadow-xs hover:opacity-95 transition-opacity"
                >
                  <span>Test Link</span>
                  <ExternalLink className="w-3 h-3 text-white" />
                </a>
              </div>
            </div>

            {/* Prominent Gradient Icon Button: Plus (+) Only */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                title="Create & Publish Product Contest"
                aria-label="Create & Publish Product Contest"
                className="w-12 h-12 rounded-2xl text-white shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center hover:opacity-95"
                style={{ background: Q_GRADIENT }}
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. ACTIVE CONTESTS LIST                                        */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: Q_GRADIENT }}
            >
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Active Contests{' '}
              <span
                style={{
                  backgroundImage: Q_GRADIENT,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                ({contests.length})
              </span>
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {contests.map((c) => {
            const contestImage = c.type === 'product'
              ? (c.productConfig?.productImageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80')
              : (c.cashConfig?.cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80');

            return (
              <div 
                key={c.id} 
                className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 relative ${
                  c.status === 'active'
                    ? 'border-indigo-400 bg-indigo-50/30 ring-1 ring-indigo-400/25 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Header Row: Title at Top-Left & Action Buttons (Edit + Delete) at Top-Right */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    {/* Prominently positioned Contest Title at Top-Left */}
                    <h4 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-snug truncate">
                      {c.title}
                    </h4>
                  </div>

                  {/* Top-Right Action Buttons: Edit (Pencil Only with Gradient) & Delete (Trash with Gradient + 1s Spinner) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEditContest(c)}
                      title="Edit Tournament Details"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-white flex items-center justify-center cursor-pointer shadow-xs active:scale-95 hover:opacity-95 transition-all shrink-0"
                      style={{ background: Q_GRADIENT }}
                    >
                      <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </button>

                    <button
                      type="button"
                      disabled={deletingContestId === c.id}
                      onClick={() => handleDeleteContest(c.id)}
                      title="Delete Tournament"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-white flex items-center justify-center cursor-pointer shadow-xs active:scale-95 hover:opacity-95 transition-all shrink-0 disabled:opacity-85"
                      style={{ background: Q_GRADIENT }}
                    >
                      {deletingContestId === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Middle Content Row: Thumbnail on left with Change Image Gradient Icon + Details on right */}
                <div className="flex items-center gap-3">
                  {/* Thumbnail Preview with 3-Color Primary Gradient Upload Icon Button */}
                  <div className="relative shrink-0">
                    <img 
                      src={contestImage} 
                      alt={c.title} 
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-slate-200 shadow-2xs" 
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingImageContest(c);
                        setEditingImageCurrentUrl(contestImage);
                        setTempImageUrl(contestImage);
                      }}
                      title="Upload / Change Image"
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg text-white flex items-center justify-center cursor-pointer shadow-md active:scale-95 hover:opacity-95 transition-all"
                      style={{ background: Q_GRADIENT }}
                    >
                      <Upload className="w-3 h-3 text-white" />
                    </button>
                  </div>

                  {/* Concise Details: Entry Fee, Real-Time Active Joins, Revenue, Winners, Product item if applicable */}
                  {(() => {
                    const cardRealJoins = c.realJoins !== undefined 
                      ? c.realJoins 
                      : (c.status === 'active' ? liveParticipants : 0);
                    const cardRevenue = c.totalRevenue !== undefined 
                      ? c.totalRevenue 
                      : (cardRealJoins * (c.entryFee || 100));
                    const cardMaxCap = c.maxParticipants || poolData.targetParticipants || 50;
                    const cardWinners = c.winnersCount || (c.type === 'product' ? 1 : 5);

                    return (
                      <div className="flex-1 min-w-0 space-y-1">
                        {c.type === 'product' && c.productConfig && (
                          <p className="text-[11px] text-slate-700 font-medium truncate">
                            Prize: <strong className="text-slate-900 font-bold">{c.productConfig.itemTitle}</strong> (₹{c.productConfig.retailValue})
                          </p>
                        )}

                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600">
                          <span>Entry: <strong className="text-emerald-700 font-bold">₹{c.entryFee}</strong></span>
                          <span>•</span>
                          <span className="text-slate-700 font-medium">
                            Real Joins: <strong className="text-indigo-600 font-bold">{cardRealJoins} / {cardMaxCap}</strong>
                          </span>
                          <span>•</span>
                          <span className="text-slate-700 font-medium">
                            Revenue: <strong className="text-emerald-600 font-bold">₹{cardRevenue.toLocaleString('en-IN')}</strong>
                          </span>
                          <span>•</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                            🏆 {cardWinners} {cardWinners === 1 ? 'Winner' : 'Winners'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Real-time Ticking Countdown Timers (Clean without Clock icons) */}
                <ContestCardTimers scheduledTime={c.scheduledTime} endTime={c.endTime} />

                {/* Bottom Action Row: Set Active, Set Upcoming (placed strictly between Set Active and Expired), and Expired */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black tracking-wide select-none">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        LIVE
                      </span>
                    ) : c.status === 'full' ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-black tracking-wide select-none">
                        FULL
                      </span>
                    ) : (() => {
                      const isAnotherLive = (contests || []).some(item => item.id !== c.id && item.status === 'active');
                      return (
                        <button
                          type="button"
                          disabled={isAnotherLive}
                          onClick={() => {
                            if (isAnotherLive) {
                              soundFx.playWrong();
                              onShowToast('A contest is currently LIVE. Cannot manually activate another contest.', 'error');
                              return;
                            }
                            handleActivateContest(c);
                          }}
                          className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-xs ${
                            isAnotherLive
                              ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 select-none'
                              : 'text-white cursor-pointer active:scale-95 hover:opacity-95'
                          }`}
                          style={!isAnotherLive ? { background: Q_GRADIENT } : undefined}
                          title={isAnotherLive ? 'A contest is already LIVE' : 'Set Active'}
                        >
                          Set Active
                        </button>
                      );
                    })()}

                    {/* Set Upcoming Button - Placed right between Set Active and Expired with 3-Color Brand Gradient */}
                    <button
                      type="button"
                      onClick={() => handleSetUpcomingContest(c)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-xs active:scale-95 text-white ${
                        c.status === 'scheduled'
                          ? 'ring-2 ring-emerald-400 ring-offset-1 font-extrabold shadow-sm'
                          : 'opacity-90 hover:opacity-100'
                      }`}
                      style={{ background: Q_GRADIENT }}
                    >
                      {c.status === 'scheduled' ? '✓ Upcoming' : 'Set Upcoming'}
                    </button>

                    {/* Expired Status Button */}
                    <button
                      type="button"
                      onClick={() => handleSetExpiredContest(c)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
                        c.status === 'completed'
                          ? 'bg-amber-50 text-amber-700 border border-amber-300 font-extrabold'
                          : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600'
                      }`}
                    >
                      Expired
                    </button>
                  </div>

                  {c.productConfig?.ecommerceFulfillmentLink && (
                    <a
                      href={c.productConfig.ecommerceFulfillmentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <span>Partner Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-time Inline Contest Editor Modal */}
        {editingContest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl border border-slate-200 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                    style={{ background: Q_GRADIENT }}
                  >
                    <Edit3 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900">
                      Edit Contest
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingContest(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveContestEdit} className="space-y-4">
                {/* Contest Image Preview & Uploader */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    Contest Image
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <img
                        src={editImageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80'}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        ref={editImageFileInputRef}
                        accept="image/*,image/gif,.gif"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
                              if (isGif) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const res = reader.result as string;
                                  setEditImageUrl(res);
                                  soundFx.playSuccess();
                                  onShowToast('Animated GIF banner loaded for editing!', 'info');
                                };
                                reader.readAsDataURL(file);
                              } else {
                                const compressed = await compressImage(file, 800, 600, 0.72);
                                setEditImageUrl(compressed);
                                soundFx.playSuccess();
                                onShowToast('Image optimized & loaded for editing!', 'info');
                              }
                            } catch {
                              onShowToast('Failed to optimize image', 'error');
                            } finally {
                              e.target.value = '';
                            }
                          }
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => editImageFileInputRef.current?.click()}
                        className="px-3.5 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 hover:opacity-95 transition-all"
                        style={{ background: Q_GRADIENT }}
                      >
                        <Upload className="w-3.5 h-3.5 text-white" />
                        <span>Upload Image</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Title & Top-Right Badge */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Top Badge Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="e.g. MEGA CASH JACKPOT"
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Banner Overlay Title
                    </label>
                    <input
                      type="text"
                      value={editOverlayTitle}
                      onChange={(e) => setEditOverlayTitle(e.target.value)}
                      placeholder="e.g. Mega 1st Prize ₹1,00,000"
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    Top-Right Badge (INSTANT UPI / RANK #1)
                  </label>
                  <input
                    type="text"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    placeholder="INSTANT UPI"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-semibold uppercase"
                  />
                </div>

                {/* Entry Fee, Prize Pool / Retail Value & Max Participants */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Entry Fee (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={editEntryFee}
                      onChange={(e) => setEditEntryFee(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      {editingContest.type === 'cash' ? 'Prize Pool (₹)' : 'Retail Value (₹)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editPrizeValue}
                      onChange={(e) => setEditPrizeValue(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Max Participants <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={2}
                      required
                      value={editMaxParticipants}
                      onChange={(e) => setEditMaxParticipants(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="e.g. 50"
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Number of Winners <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editWinnersCount}
                      onChange={(e) => setEditWinnersCount(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-bold cursor-pointer"
                    >
                      <option value={1}>🏆 1 Winner</option>
                      <option value={2}>🏆 2 Winners</option>
                      <option value={3}>🏆 3 Winners</option>
                      <option value={5}>🏆 5 Winners</option>
                      <option value={10}>🏆 10 Winners</option>
                      <option value={15}>🏆 15 Winners</option>
                      <option value={20}>🏆 20 Winners</option>
                      <option value={25}>🏆 25 Winners</option>
                      <option value={50}>🏆 50 Winners</option>
                    </select>
                  </div>
                </div>

                {/* Start Timer & End Timer (Real-Time Countdown Pickers) */}
                <div className="space-y-3 pt-1">
                  <ScheduledTimePicker
                    label="Start Timer"
                    value={editStartTime}
                    onChange={handleEditStartTimeChange}
                    labelStyle={labelGradientStyle}
                    required
                  />
                  <ScheduledTimePicker
                    label="End Timer"
                    value={editEndTime}
                    onChange={handleEditEndTimeChange}
                    labelStyle={labelGradientStyle}
                    required
                  />
                </div>

                {/* Modal Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingContest(null)}
                    className="px-4 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 hover:opacity-95"
                    style={{ background: Q_GRADIENT }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 hover:opacity-95"
                    style={{ background: Q_GRADIENT }}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Real-time Image Management Modal (Redesigned per Image 8) */}
        {editingImageContest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div 
              className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden space-y-4 animate-in fade-in zoom-in-95 duration-200"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              {/* Modal header accent: Official website primary gradient */}
              <div 
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              />

              {/* Close Button top-right (Title line and Header logo REMOVED completely) */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setEditingImageContest(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview Box ("Live Image" heading REMOVED completely) */}
              <div className="w-full h-44 rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 flex items-center justify-center shadow-inner relative group">
                {(tempImageUrl || editingImageCurrentUrl) ? (
                  <img 
                    src={tempImageUrl || editingImageCurrentUrl} 
                    alt="Contest Preview" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <span className="text-xs text-slate-400">No Image Selected</span>
                )}
              </div>

              {/* Upload section: Strictly a clean "Choose File" button, NO "No file chosen" text, NO "Or Paste Image URL" */}
              <div className="pt-1">
                <input
                  ref={inlineFileInputRef}
                  type="file"
                  accept="image/*,image/gif,.gif"
                  onChange={handleInlineImageFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inlineFileInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all active:scale-95 hover:opacity-95 cursor-pointer flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  <Upload className="w-3.5 h-3.5 text-white" />
                  <span>Choose File</span>
                </button>
              </div>

              {/* Action Buttons: Cancel and Save & Sync buttons with official website primary gradient */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingImageContest(null)}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all active:scale-95 hover:opacity-95 cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImageChange}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all active:scale-95 hover:opacity-95 cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  Save &amp; Sync Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
