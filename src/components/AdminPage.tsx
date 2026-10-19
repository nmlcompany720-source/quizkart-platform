import React, { useState, useEffect, useRef } from 'react';
import { 
  HelpCircle, 
  Gift, 
  Trophy, 
  PieChart, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Truck, 
  RotateCcw, 
  Save, 
  Clock, 
  Search,
  ArrowLeft,
  Sparkles,
  Package,
  Wallet,
  Check,
  XCircle,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Zap,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Terminal,
  Layers,
  Filter,
  Calendar,
  Loader2,
  Megaphone,
  Sliders,
  Image as ImageIcon,
  Upload,
  Eye,
  EyeOff,
  Maximize2,
  X,
  QrCode,
  Building,
  Users,
  UserX,
  UserCheck,
  Headphones,
  LifeBuoy,
  Ticket,
  Send
} from 'lucide-react';
import { 
  Question, 
  QuestionCategory,
  DailyPrizeItem, 
  LeaderboardEntry, 
  PoolEconomics, 
  SecurityViolationLog, 
  UserProfile, 
  ActiveContest,
  BannerSlide,
  AnnouncementSettings,
  DepositRequest,
  WithdrawalRequest,
  SupportTicket
} from '../types';
import { 
  TODAY_PRIZE, 
  INITIAL_LEADERBOARD, 
  INITIAL_POOL_ECONOMICS, 
  UPCOMING_PRIZES,
  DEFAULT_BANNER_SLIDES,
  ensureTenSlides,
  DEFAULT_ANNOUNCEMENT_SETTINGS,
  DEFAULT_DEPOSIT_REQUESTS,
  DEFAULT_WITHDRAWAL_REQUESTS,
  isDemoSeedUser
} from '../data/quizData';
import { AnnouncementBar } from './AnnouncementBar';
import { BannerSlider } from './BannerSlider';
import { soundFx } from '../utils/audio';
import { 
  parseAIBulkText,
  validateAIQuestionJson,
  SAMPLE_AI_BULK_INPUT, 
  CHATGPT_PROMPT_TEMPLATE,
  ParsedBulkQuestion,
  normalizeCategory,
  toAllowedSubject,
  VALID_SUBJECTS,
  ALLOWED_SUBJECTS,
  ALLOWED_DIFFICULTIES
} from '../utils/aiQuestionParser';
import { questionPoolManager, getBlockAssignedUserId, createInitialUserBlocksFromPool } from '../utils/questionPoolManager';
import { ContestManagerTab } from './ContestManagerTab';
import { safeCopyToClipboard } from '../utils/clipboard';
import { compressImage, normalizeImageUrl, isGifImage } from '../utils/imageCompressor';
import { 
  updateDepositStatusInFirestore, 
  syncUserProfile, 
  fetchAllUsersFromFirestore,
  subscribeToAllUsersFromFirestore,
  deleteDepositFromFirestore, 
  saveDepositQrToFirestore,
  saveQuizTimerToFirestore,
  updateWithdrawalStatusInFirestore,
  deleteWithdrawalFromFirestore,
  deleteSupportTicketFromFirestore,
  fetchSupportTicketsFromFirestore,
  saveSupportTicketToFirestore,
  saveBannerSlidesToFirestore,
  saveQuestionToFirestore,
  removeQuestionFromFirestore
} from '../firebase';
import { 
  formatDepositId, 
  formatWithdrawalId, 
  formatDepositTimestamp, 
  formatTicketId,
  getCurrentFormattedTimestamp,
  addDeletedDepositId,
  addDeletedWithdrawalId,
  isTicketDeleted,
  addDeletedTicketId
} from '../utils/depositUtils';
import { getActiveDepositQr, setActiveDepositQr, QR_ADMIN_SECURITY_PASSWORD } from '../utils/qrConfig';
import { WithdrawalApprovalsTab } from './WithdrawalApprovalsTab';

const DEFAULT_SECURITY_LOGS: SecurityViolationLog[] = [
  {
    id: 'SEC-8912',
    userName: 'Vikram Mehta',
    city: 'Pune',
    phone: '+91 98220 14890',
    timestamp: '18 mins ago',
    violationType: 'Tab switch / Secondary monitor blur detected',
    severity: 'Critical (Disqualified)',
    actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
    deviceInfo: 'Desktop Chrome 124 • Secondary Monitor Blur',
    status: 'Flagged'
  },
  {
    id: 'SEC-8911',
    userName: 'Kunal Singhania',
    city: 'Delhi',
    phone: '+91 98114 90214',
    timestamp: '42 mins ago',
    violationType: 'Developer Inspect Shortcut (F12) Trapped',
    severity: 'Critical (Disqualified)',
    actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
    deviceInfo: 'Windows PC • Keyboard Trap Intercept',
    status: 'Flagged'
  },
  {
    id: 'SEC-8910',
    userName: 'Ananya Roy',
    city: 'Kolkata',
    phone: '+91 94331 67801',
    timestamp: '1 hr ago',
    violationType: 'Screenshot Attempt Blocked (PrintScreen key)',
    severity: 'High (Forced Termination)',
    actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
    deviceInfo: 'MacBook Air • OS Clipboard Intercept',
    status: 'Reviewed'
  },
  {
    id: 'SEC-8909',
    userName: 'Harsh Vardhan',
    city: 'Lucknow',
    phone: '+91 99351 22894',
    timestamp: '3 hrs ago',
    violationType: 'Window Focus Lost / Split Screen Interaction',
    severity: 'Critical (Disqualified)',
    actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
    deviceInfo: 'Android 14 • Chrome Multi-Window',
    status: 'Reviewed'
  }
];

interface AdminPageProps {
  onExitAdmin: () => void;
  questions: Question[];
  onUpdateQuestions: (questions: Question[]) => void;
  todayPrize: DailyPrizeItem;
  onUpdatePrize: (prize: DailyPrizeItem) => void;
  leaderboard: LeaderboardEntry[];
  onUpdateLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
  poolData: PoolEconomics;
  onUpdatePoolData: (pool: PoolEconomics) => void;
  globalQuizTimer?: number;
  onUpdateQuizTimer?: (seconds: number) => void;
  userProfile?: UserProfile;
  onUpdateProfile?: (profile: UserProfile) => void;
  activeContest?: ActiveContest | null;
  onUpdateActiveContest?: (contest: ActiveContest | null) => void;
  contests?: ActiveContest[];
  onUpdateContests?: (contests: ActiveContest[]) => void;
  announcement?: AnnouncementSettings;
  onUpdateAnnouncement?: (settings: AnnouncementSettings) => void;
  bannerSlides?: BannerSlide[];
  onUpdateBannerSlides?: (slides: BannerSlide[]) => void;
  bannerSliderEnabled?: boolean;
  onToggleBannerSlider?: (enabled: boolean) => void;
  onDeleteContest?: (id: string) => void;
  realParticipantsCount?: number;
  deposits?: DepositRequest[];
  onUpdateDeposits?: (deposits: DepositRequest[]) => void;
  withdrawals?: WithdrawalRequest[];
  onUpdateWithdrawals?: (withdrawals: WithdrawalRequest[]) => void;
  activeDepositQr?: string;
  onUpdateDepositQr?: (qrDataUrl: string) => void;
  registeredUsers?: UserProfile[];
  onUpdateRegisteredUsers?: (users: UserProfile[]) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  onExitAdmin,
  questions,
  onUpdateQuestions,
  todayPrize,
  onUpdatePrize,
  leaderboard,
  onUpdateLeaderboard,
  poolData,
  onUpdatePoolData,
  globalQuizTimer = 300,
  onUpdateQuizTimer,
  userProfile,
  onUpdateProfile,
  activeContest,
  onUpdateActiveContest,
  contests,
  onUpdateContests,
  announcement,
  onUpdateAnnouncement,
  bannerSlides,
  onUpdateBannerSlides,
  bannerSliderEnabled = true,
  onToggleBannerSlider,
  onDeleteContest,
  realParticipantsCount,
  deposits: propDeposits,
  onUpdateDeposits,
  withdrawals: propWithdrawals,
  onUpdateWithdrawals,
  activeDepositQr: propActiveDepositQr,
  onUpdateDepositQr,
  registeredUsers: propRegisteredUsers,
  onUpdateRegisteredUsers
}) => {
  // Admin Tabs (Contest Manager, Registered Users, Question Builder, Banner/Timer, Deposits, Deposit QR, Withdrawals, Payouts, Security, Support)
  const [activeTab, setActiveTab] = useState<'contests' | 'users' | 'questions' | 'prize_timer' | 'deposits' | 'deposit_qr' | 'withdrawals' | 'payouts' | 'security' | 'support'>('contests');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userDatePreset, setUserDatePreset] = useState<'all' | 'today' | 'yesterday' | '7_days_ago' | '1_month_ago' | '6_months_ago' | '1_year_ago' | 'custom_time'>('all');
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState<boolean>(false);
  const [userStartDate, setUserStartDate] = useState<string>('');
  const [userEndDate, setUserEndDate] = useState<string>('');

  // Customer Support Dashboard State
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    try {
      const raw = localStorage.getItem('quizkart_support_tickets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [supportFilterStatus, setSupportFilterStatus] = useState<'all' | 'Open' | 'In Progress' | 'Resolved'>('all');
  const [supportFilterCategory, setSupportFilterCategory] = useState<string>('all');
  const [supportSearchQuery, setSupportSearchQuery] = useState<string>('');
  const [activeReplyingTicketId, setActiveReplyingTicketId] = useState<string | null>(null);
  const [adminReplyDraft, setAdminReplyDraft] = useState<string>('');
  const [adminReplyStatus, setAdminReplyStatus] = useState<'In Progress' | 'Resolved'>('Resolved');
  const [editableAdminName, setEditableAdminName] = useState<string>(() => {
    try {
      return localStorage.getItem('quizkart_support_admin_name') || 'Support';
    } catch {
      return 'Support';
    }
  });

  useEffect(() => {
    const syncTickets = () => {
      try {
        const raw = localStorage.getItem('quizkart_support_tickets');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSupportTickets(parsed);
        }
      } catch {}
    };
    window.addEventListener('storage', syncTickets);
    window.addEventListener('quizkart_support_tickets_updated', syncTickets);
    fetchSupportTicketsFromFirestore().then((remoteTickets) => {
      if (remoteTickets && remoteTickets.length > 0) {
        const valid = remoteTickets.filter(t => t && t.id && !isTicketDeleted(t.id));
        setSupportTickets(prev => {
          const raw = localStorage.getItem('quizkart_support_tickets');
          const localList: SupportTicket[] = raw ? JSON.parse(raw) : prev;
          const mergedMap = new Map<string, SupportTicket>();
          localList.forEach(t => { if (t && t.id && !isTicketDeleted(t.id)) mergedMap.set(t.id, t); });
          valid.forEach(t => {
            if (t && t.id && !isTicketDeleted(t.id) && !mergedMap.has(t.id)) {
              mergedMap.set(t.id, t);
            }
          });
          const merged = Array.from(mergedMap.values());
          localStorage.setItem('quizkart_support_tickets', JSON.stringify(merged));
          return merged;
        });
      }
    }).catch(() => {});
    return () => {
      window.removeEventListener('storage', syncTickets);
      window.removeEventListener('quizkart_support_tickets_updated', syncTickets);
    };
  }, []);

  // Self-Deleted Users Permanent Ledger State
  const [deletedUsersList, setDeletedUsersList] = useState<UserProfile[]>(() => {
    try {
      const raw = localStorage.getItem('quizkart_deleted_users');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Real-Time Active Browser Session Tracker (marks user ACTIVE only while browser tab/session is open)
  const [activeSessionsMap, setActiveSessionsMap] = useState<Record<string, { email: string; id?: string; mobile?: string; lastSeen: number }>>(() => {
    try {
      const raw = localStorage.getItem('quizkart_active_sessions');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
  );

  useEffect(() => {
    const syncPresence = () => {
      try {
        const visible = typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true;
        setIsTabVisible(visible);
        const raw = localStorage.getItem('quizkart_active_sessions');
        const parsed: Record<string, { email: string; lastSeen: number }> = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        let mutated = false;
        Object.keys(parsed).forEach((k) => {
          if (!parsed[k] || !parsed[k].email || now - parsed[k].lastSeen > 6000) {
            delete parsed[k];
            mutated = true;
          }
        });
        if (mutated) {
          localStorage.setItem('quizkart_active_sessions', JSON.stringify(parsed));
        }
        setActiveSessionsMap({ ...parsed });
      } catch {}
    };

    syncPresence();
    const interval = setInterval(syncPresence, 1500);
    window.addEventListener('quizkart_presence_updated', syncPresence);
    window.addEventListener('storage', syncPresence);
    document.addEventListener('visibilitychange', syncPresence);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('quizkart_presence_channel');
        bc.onmessage = () => syncPresence();
      }
    } catch {}

    return () => {
      clearInterval(interval);
      window.removeEventListener('quizkart_presence_updated', syncPresence);
      window.removeEventListener('storage', syncPresence);
      document.removeEventListener('visibilitychange', syncPresence);
      try {
        bc?.close();
      } catch {}
    };
  }, []);

  // Strictly link Active User Status ONLY to the User Email Address (never phone number or fallback ID)
  const isUserSessionActive = (u: UserProfile): boolean => {
    if (!u || u.isBlocked || u.isDeleted) return false;
    const uEmail = (u.email || '').trim().toLowerCase();
    if (!uEmail) return false;
    const now = Date.now();

    // Check active email sessions from open browser tabs in real time
    const sessions = Object.values(activeSessionsMap) as Array<{ email: string; lastSeen: number }>;
    for (const session of sessions) {
      if (!session || now - session.lastSeen > 6000) continue;
      const sEmail = (session.email || '').trim().toLowerCase();
      if (sEmail && uEmail === sEmail) {
        return true;
      }
    }

    return false;
  };

  useEffect(() => {
    const syncDeletedAndRegistered = () => {
      try {
        const rawDeleted = localStorage.getItem('quizkart_deleted_users');
        if (rawDeleted) {
          const parsedDel = JSON.parse(rawDeleted);
          if (Array.isArray(parsedDel)) {
            setDeletedUsersList(parsedDel);
          }
        }
        const rawReg = localStorage.getItem('quizkart_registered_users');
        if (rawReg) {
          const parsedReg = JSON.parse(rawReg);
          if (Array.isArray(parsedReg)) {
            setRegisteredUsersList(deduplicateRegisteredUsers(parsedReg));
          }
        }
      } catch {}
    };
    window.addEventListener('quizkart_account_deleted', syncDeletedAndRegistered);
    window.addEventListener('quizkart_user_deleted', syncDeletedAndRegistered);
    window.addEventListener('quizkart_users_updated', syncDeletedAndRegistered);
    window.addEventListener('storage', syncDeletedAndRegistered);
    return () => {
      window.removeEventListener('quizkart_account_deleted', syncDeletedAndRegistered);
      window.removeEventListener('quizkart_user_deleted', syncDeletedAndRegistered);
      window.removeEventListener('quizkart_users_updated', syncDeletedAndRegistered);
      window.removeEventListener('storage', syncDeletedAndRegistered);
    };
  }, []);

  // Helper to ensure clean plain password text (never obscured or "Secured (••••••)")
  const normalizePlainPassword = (rawPassword?: string): string => {
    if (
      rawPassword &&
      rawPassword.trim().length > 0 &&
      !rawPassword.includes('••••') &&
      !rawPassword.includes('......') &&
      !rawPassword.toLowerCase().includes('secured')
    ) {
      return rawPassword.trim();
    }
    return 'player@123';
  };

  // Helper to ensure DATE ONLY format (YYYY-MM-DD) without timer/seconds
  const normalizeRegistrationTimestamp = (rawDate?: string): string => {
    if (rawDate && rawDate.trim().length > 0) {
      const datePart = rawDate.split('|')[0].trim().split('T')[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
      const parsed = new Date(datePart);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  // Helper to strictly deduplicate real registered users (purging all demo/dummy seed users) and assign sequential QK-USR-1001+ IDs
  const deduplicateRegisteredUsers = (users: UserProfile[]): UserProfile[] => {
    const result: UserProfile[] = [];

    users.forEach((u) => {
      if (!u || (!u.email && !u.name && !u.id)) return;
      if (isDemoSeedUser(u)) return;

      const normEmail = (u.email || '').trim().toLowerCase();
      const rawId = (u.id || '').trim().toUpperCase();
      const validUsrId = /^(?:QK-)?USR-\d+$/i.test(rawId) ? (rawId.startsWith('QK-') ? rawId : `QK-${rawId}`) : '';

      // Priority 1: Match by email
      let existingIdx = -1;
      if (normEmail) {
        existingIdx = result.findIndex((item) => (item.email || '').trim().toLowerCase() === normEmail);
      }

      // Priority 2: Match by valid QK-USR-XXXX ID only if emails do not belong to different users
      if (existingIdx === -1 && validUsrId) {
        existingIdx = result.findIndex((item) => {
          const itemId = (item.id || '').trim().toUpperCase();
          const itemEmail = (item.email || '').trim().toLowerCase();
          if (itemId !== validUsrId) return false;
          if (normEmail && itemEmail && normEmail !== itemEmail) return false;
          return true;
        });
      }

      const normalizedUser: UserProfile = {
        ...u,
        registrationDate: normalizeRegistrationTimestamp(u.registrationDate),
        passwordStatus: normalizePlainPassword(u.passwordStatus)
      };

      if (existingIdx >= 0) {
        result[existingIdx] = {
          ...result[existingIdx],
          ...normalizedUser
        };
      } else {
        result.push(normalizedUser);
      }
    });

    // Guarantee every real registered entry has a strictly sequential QK-USR-1001, QK-USR-1002... ID
    return result.map((u, idx) => ({
      ...u,
      id: `QK-USR-${1001 + idx}`
    }));
  };

  // Registered Users State (Real-Time Data Only - Zero Hardcoded/Dummy/Demo Users)
  const [registeredUsersList, setRegisteredUsersList] = useState<UserProfile[]>(() => {
    try {
      const raw =
        propRegisteredUsers && propRegisteredUsers.length > 0
          ? propRegisteredUsers
          : JSON.parse(localStorage.getItem('quizkart_registered_users') || '[]');
      const cleaned = Array.isArray(raw) ? deduplicateRegisteredUsers(raw) : [];
      localStorage.setItem('quizkart_registered_users', JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return [];
    }
  });

  // Automatically sync current active real userProfile and cloud users into registeredUsersList in real time
  useEffect(() => {
    if (!userProfile || userProfile.isDeleted || !userProfile.isRegistered || !userProfile.email || isDemoSeedUser(userProfile)) {
      return;
    }
    setRegisteredUsersList((prev) => {
      const list = [...prev];
      const targetEmail = (userProfile.email || '').trim().toLowerCase();

      const idx = targetEmail
        ? list.findIndex((u) => (u?.email || '').trim().toLowerCase() === targetEmail)
        : -1;

      const canonicalId = `QK-USR-${1001 + (idx >= 0 ? idx : list.length)}`;

      const syncedActiveUser: UserProfile = {
        ...(idx >= 0 ? list[idx] : {}),
        ...userProfile,
        id: canonicalId,
        uid: userProfile.uid || (idx >= 0 ? list[idx].uid : canonicalId),
        registrationDate: normalizeRegistrationTimestamp(
          userProfile.registrationDate || (idx >= 0 ? list[idx].registrationDate : undefined)
        ),
        passwordStatus: normalizePlainPassword(
          userProfile.passwordStatus || (idx >= 0 ? list[idx].passwordStatus : undefined)
        ),
        hasPassword: userProfile.hasPassword ?? true
      };
      if (idx >= 0) {
        list[idx] = syncedActiveUser;
      } else {
        list.push(syncedActiveUser);
      }
      const deduped = deduplicateRegisteredUsers(list);
      try {
        localStorage.setItem('quizkart_registered_users', JSON.stringify(deduped));
        const matchedFinal = deduped.find((u) => (u.email || '').trim().toLowerCase() === targetEmail);
        if (matchedFinal && userProfile.id !== matchedFinal.id) {
          localStorage.setItem('quizkart_user_profile', JSON.stringify({ ...userProfile, id: matchedFinal.id }));
        }
      } catch {}
      return deduped;
    });
  }, [userProfile]);

  useEffect(() => {
    fetchAllUsersFromFirestore().then((cloudUsers) => {
      if (cloudUsers && cloudUsers.length > 0) {
        setRegisteredUsersList((prev) => {
          const merged = deduplicateRegisteredUsers([...prev, ...cloudUsers]);
          try {
            localStorage.setItem('quizkart_registered_users', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    }).catch(() => {});

    const unsubscribeUsers = subscribeToAllUsersFromFirestore((cloudUsers) => {
      setRegisteredUsersList((prev) => {
        const merged = deduplicateRegisteredUsers([...prev, ...(cloudUsers || [])]);
        try {
          localStorage.setItem('quizkart_registered_users', JSON.stringify(merged));
        } catch {}
        return merged;
      });
    });

    return () => {
      unsubscribeUsers();
    };
  }, []);

  const handleToggleBlockUser = (targetUser: UserProfile) => {
    soundFx.playClick();
    const nextBlocked = !targetUser.isBlocked;
    const updatedList = registeredUsersList.map((u) => {
      const isMatch =
        (u.id && targetUser.id && u.id === targetUser.id) ||
        (u.email && targetUser.email && u.email.toLowerCase() === targetUser.email.toLowerCase());
      if (isMatch) {
        return {
          ...u,
          isBlocked: nextBlocked,
          blockReason: nextBlocked ? 'Account Blocked by Admin' : ''
        };
      }
      return u;
    });

    setRegisteredUsersList(updatedList);
    if (onUpdateRegisteredUsers) {
      onUpdateRegisteredUsers(updatedList);
    }
    try {
      localStorage.setItem('quizkart_registered_users', JSON.stringify(updatedList));
    } catch {}

    // If this matches the currently active userProfile, immediately update userProfile as well!
    if (
      userProfile &&
      ((userProfile.email && targetUser.email && userProfile.email.toLowerCase() === targetUser.email.toLowerCase()) ||
        (userProfile.mobile && targetUser.mobile && userProfile.mobile === targetUser.mobile) ||
        (userProfile.name && targetUser.name && userProfile.name.toLowerCase() === targetUser.name.toLowerCase()))
    ) {
      const updatedActiveProfile: UserProfile = {
        ...userProfile,
        isBlocked: nextBlocked,
        blockReason: nextBlocked ? 'Account Blocked by Admin' : ''
      };
      onUpdateProfile?.(updatedActiveProfile);
      try {
        localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedActiveProfile));
      } catch {}
    }

    syncUserProfile({
      ...targetUser,
      isBlocked: nextBlocked,
      blockReason: nextBlocked ? 'Account Blocked by Admin' : ''
    }).catch(() => {});

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_user_block_changed', { detail: { email: targetUser.email, isBlocked: nextBlocked } }));
    }

    if (nextBlocked) {
      soundFx.playWrong();
      showToast(`🚫 ${targetUser.name} (${targetUser.email}) has been BLOCKED by Admin.`, 'info');
    } else {
      soundFx.playSuccess();
      showToast(`✅ ${targetUser.name} (${targetUser.email}) has been UNBLOCKED.`);
    }
  };

  // Deposit QR Management State & Password Protection
  const [isQrUnlocked, setIsQrUnlocked] = useState<boolean>(false);
  const [isQrSecurityModalOpen, setIsQrSecurityModalOpen] = useState<boolean>(false);
  const [qrSecurityPassword, setQrSecurityPassword] = useState<string>('');
  const [qrSecurityError, setQrSecurityError] = useState<string | null>(null);
  const [showQrPassword, setShowQrPassword] = useState<boolean>(false);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const [currentActiveQr, setCurrentActiveQr] = useState<string>(() => {
    return propActiveDepositQr || getActiveDepositQr();
  });
  const [newQrFile, setNewQrFile] = useState<File | null>(null);
  const [newQrPreview, setNewQrPreview] = useState<string | null>(null);
  const [isUpdatingQr, setIsUpdatingQr] = useState<boolean>(false);

  useEffect(() => {
    if (propActiveDepositQr) {
      setCurrentActiveQr(propActiveDepositQr);
    }
  }, [propActiveDepositQr]);

  const handleSelectQrTab = () => {
    soundFx.playClick();
    if (!isQrUnlocked) {
      setQrSecurityPassword('');
      setQrSecurityError(null);
      setShowQrPassword(false);
      setIsQrSecurityModalOpen(true);
    } else {
      setActiveTab('deposit_qr');
    }
  };

  const handleVerifyQrPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (qrSecurityPassword.trim() === QR_ADMIN_SECURITY_PASSWORD) {
      setIsQrUnlocked(true);
      setIsQrSecurityModalOpen(false);
      setQrSecurityError(null);
      setShowQrPassword(false);
      setActiveTab('deposit_qr');
      soundFx.playSuccess();
      showToast('Security verification successful. Access granted to Deposit QR.');
    } else {
      setQrSecurityError('Incorrect Security Password. Access Denied.');
      soundFx.playWrong();
    }
  };

  const handleQrImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isQrUnlocked) {
      setQrSecurityPassword('');
      setQrSecurityError(null);
      setIsQrSecurityModalOpen(true);
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setNewQrFile(file);
      setNewQrPreview(dataUrl);
      soundFx.playClick();
    } catch {
      showToast('Failed to load image file. Please try again.', 'info');
    }
  };

  const handleUpdateQrCode = async () => {
    if (!isQrUnlocked) {
      setQrSecurityPassword('');
      setQrSecurityError(null);
      setIsQrSecurityModalOpen(true);
      return;
    }

    if (!newQrFile && !newQrPreview) {
      showToast('Please select a new QR image to upload.', 'info');
      return;
    }

    setIsUpdatingQr(true);
    soundFx.playClick();

    try {
      const compressed = await compressImage(newQrFile || newQrPreview!, 900, 900, 0.88);
      if (!compressed) {
        showToast('Error processing image. Please try again.', 'info');
        setIsUpdatingQr(false);
        return;
      }

      setCurrentActiveQr(compressed);
      setNewQrFile(null);
      setNewQrPreview(null);
      setActiveDepositQr(compressed);
      await saveDepositQrToFirestore(compressed);

      if (onUpdateDepositQr) {
        onUpdateDepositQr(compressed);
      }

      soundFx.playSuccess();
      showToast('Deposit QR Code successfully updated and synchronized!');
    } catch {
      showToast('Failed to update QR Code. Please try again.', 'info');
    } finally {
      setIsUpdatingQr(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // ANNOUNCEMENT & BANNER SLIDER STATE
  // -------------------------------------------------------------
  const [adminAnnouncement, setAdminAnnouncement] = useState<AnnouncementSettings>(() => {
    if (announcement) return announcement;
    try {
      const saved = localStorage.getItem('quizkart_announcement_settings');
      return saved ? JSON.parse(saved) : DEFAULT_ANNOUNCEMENT_SETTINGS;
    } catch {
      return DEFAULT_ANNOUNCEMENT_SETTINGS;
    }
  });

  const [adminBannerSlides, setAdminBannerSlides] = useState<BannerSlide[]>(() => {
    if (bannerSlides && bannerSlides.length > 0) return ensureTenSlides(bannerSlides);
    try {
      const saved = localStorage.getItem('quizkart_banner_slides');
      return ensureTenSlides(saved ? JSON.parse(saved) : DEFAULT_BANNER_SLIDES);
    } catch {
      return ensureTenSlides(DEFAULT_BANNER_SLIDES);
    }
  });

  useEffect(() => {
    if (bannerSlides && bannerSlides.length > 0) {
      setAdminBannerSlides(ensureTenSlides(bannerSlides));
    }
  }, [bannerSlides]);

  const [activeSlideAdminIdx, setActiveSlideAdminIdx] = useState<number>(0);

  const [sliderEnabledState, setSliderEnabledState] = useState<boolean>(() => {
    if (typeof bannerSliderEnabled === 'boolean') return bannerSliderEnabled;
    try {
      const saved = localStorage.getItem('quizkart_banner_slider_enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const handleToggleSlider = (val: boolean) => {
    setSliderEnabledState(val);
    if (onToggleBannerSlider) {
      onToggleBannerSlider(val);
    }
    try {
      localStorage.setItem('quizkart_banner_slider_enabled', JSON.stringify(val));
    } catch {}
    soundFx.playClick();
    showToast(val ? '✅ Front-Page Banner Slider ENABLED on homepage!' : '⏸️ Front-Page Banner Slider DISABLED (hidden on homepage).');
  };

  const handleSpeedChange = (newSpeed: 'slow' | 'normal' | 'fast') => {
    const updated: AnnouncementSettings = { ...adminAnnouncement, speed: newSpeed };
    setAdminAnnouncement(updated);
    if (onUpdateAnnouncement) {
      onUpdateAnnouncement(updated);
    }
    try {
      localStorage.setItem('quizkart_announcement_settings', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } catch {}
  };

  const [isSavingBar, setIsSavingBar] = useState<boolean>(false);
  const [isBarSaved, setIsBarSaved] = useState<boolean>(false);

  const handleSaveAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBar) return;
    setIsSavingBar(true);
    setIsBarSaved(false);

    if (onUpdateAnnouncement) {
      onUpdateAnnouncement(adminAnnouncement);
    }
    try {
      localStorage.setItem('quizkart_announcement_settings', JSON.stringify(adminAnnouncement));
      window.dispatchEvent(new Event('storage'));
    } catch {}

    setTimeout(() => {
      setIsSavingBar(false);
      setIsBarSaved(true);
      soundFx.playSuccess();
      showToast('📢 Announcement Bar updated & synchronized live!');
      setTimeout(() => {
        setIsBarSaved(false);
      }, 2000);
    }, 1000);
  };

  const handleToggleSlideActive = (idx: number, isEnabled: boolean) => {
    const updated = [...adminBannerSlides];
    updated[idx] = { ...updated[idx], isEnabled };
    const validated = ensureTenSlides(updated);
    setAdminBannerSlides(validated);
    if (onUpdateBannerSlides) {
      onUpdateBannerSlides(validated);
    }
    try {
      localStorage.setItem('quizkart_banner_slides', JSON.stringify(validated));
      window.dispatchEvent(new Event('storage'));
    } catch {}
    saveBannerSlidesToFirestore(validated).catch(() => {});
    soundFx.playClick();
    showToast(`Banner ${idx + 1} is now ${isEnabled ? 'visible' : 'hidden'} on live website!`, 'info');
  };

  const [isSavingBanners, setIsSavingBanners] = useState<boolean>(false);
  const [isBannersSaved, setIsBannersSaved] = useState<boolean>(false);

  const handleSaveBannerSlides = () => {
    if (isSavingBanners) return;
    setIsSavingBanners(true);
    setIsBannersSaved(false);

    const validated = ensureTenSlides(adminBannerSlides);
    setAdminBannerSlides(validated);

    if (onUpdateBannerSlides) {
      onUpdateBannerSlides(validated);
    }
    try {
      localStorage.setItem('quizkart_banner_slides', JSON.stringify(validated));
      window.dispatchEvent(new Event('storage'));
    } catch {}

    // Sync permanently to Firestore in background
    saveBannerSlidesToFirestore(validated).catch(() => {});

    setTimeout(() => {
      setIsSavingBanners(false);
      setIsBannersSaved(true);
      soundFx.playSuccess();
      showToast('💾 Front-Page Carousel Banners saved & updated live!');
      setTimeout(() => {
        setIsBannersSaved(false);
      }, 1500);
    }, 250);
  };

  const handleUpdateSlideField = (index: number, field: keyof BannerSlide, value: any) => {
    const updated = [...adminBannerSlides];
    updated[index] = { ...updated[index], [field]: value };
    setAdminBannerSlides(updated);
    if (onUpdateBannerSlides) {
      onUpdateBannerSlides(updated);
    }
    try {
      localStorage.setItem('quizkart_banner_slides', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } catch {}
  };

  // -------------------------------------------------------------
  // TAB 1: QUESTION BUILDER (MANUAL FORM + AI BULK IMPORTER)
  // -------------------------------------------------------------
  const [builderMode, setBuilderMode] = useState<'form' | 'ai_bulk'>('form');
  
  // Single Question Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [qText, setQText] = useState<string>('');
  const [qOptionA, setQOptionA] = useState<string>('');
  const [qOptionB, setQOptionB] = useState<string>('');
  const [qOptionC, setQOptionC] = useState<string>('');
  const [qOptionD, setQOptionD] = useState<string>('');
  const [qCorrectIdx, setQCorrectIdx] = useState<number>(0);
  const [qCategory, setQCategory] = useState<string>('');
  const [qDifficulty, setQDifficulty] = useState<string>('');
  const [qExplanation, setQExplanation] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSavingQuestion, setIsSavingQuestion] = useState<boolean>(false);
  const [questionSearch, setQuestionSearch] = useState<string>('');
  const [questionCategoryFilter, setQuestionCategoryFilter] = useState<string>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<string>('all');
  const [questionPage, setQuestionPage] = useState<number>(1);
  const QUESTION_PAGE_SIZE = 10;
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<number[]>([]);

  // 10-Question Block Masked User ID State
  const [unmaskedBlockIds, setUnmaskedBlockIds] = useState<number[]>([]);
  const [passcodeModalBlock, setPasscodeModalBlock] = useState<{ blockNumber: number; userId: string } | null>(null);
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string>('');

  // Bulk AI Importer State
  const [bulkInputText, setBulkInputText] = useState<string>('');
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState<QuestionCategory>('Maths');
  const [bulkDefaultDifficulty, setBulkDefaultDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [bulkParsedResults, setBulkParsedResults] = useState<ParsedBulkQuestion[]>([]);
  const [bulkJsonError, setBulkJsonError] = useState<string | null>(null);
  const [bulkFilterTab, setBulkFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [hasParsedBulk, setHasParsedBulk] = useState<boolean>(false);
  const [copiedPromptSuccess, setCopiedPromptSuccess] = useState<boolean>(false);
  const [aiPromptQuestionCount, setAiPromptQuestionCount] = useState<number>(10);

  const getDynamicPromptText = (count: number) => {
    const displayCount = count > 0 ? count : 10;
    return `Generate ${displayCount} competitive multiple choice quiz questions for QuizKart in clean, plain natural text format.

FORMAT FOR EACH QUESTION:
Question: [Write the clear question stem here]
A) [Option A text]
B) [Option B text]
C) [Option C text]
D) [Option D text]
Correct Answer: [A / B / C / D]
Subject: [Choose one: Maths, Reasoning, Science, GK, English]
Difficulty: [Choose one: Easy, Medium, Hard, Expert]
Explanation: [Clear step-by-step explanation]

RULES:
- Provide exactly 4 options (A, B, C, D) for every question.
- Do NOT use JSON, HTML, or markdown code fences.
- Separate each question with a blank line.`;
  };

  // Manual Question Form Validation
  const validateManualForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!qText.trim()) {
      errors.qText = 'Question text is required.';
    }

    if (!qOptionA.trim()) {
      errors.qOptionA = 'Option A is required.';
    }

    if (!qOptionB.trim()) {
      errors.qOptionB = 'Option B is required.';
    }

    if (!qOptionC.trim()) {
      errors.qOptionC = 'Option C is required.';
    }

    if (!qOptionD.trim()) {
      errors.qOptionD = 'Option D is required.';
    }

    // Correct Answer validation: must be 0, 1, 2, or 3, and the corresponding option text must not be empty
    if (qCorrectIdx == null || qCorrectIdx < 0 || qCorrectIdx > 3) {
      errors.qCorrect = 'Please select a correct answer option (A, B, C, or D).';
    } else {
      const optionsArr = [qOptionA.trim(), qOptionB.trim(), qOptionC.trim(), qOptionD.trim()];
      const letter = ['A', 'B', 'C', 'D'][qCorrectIdx];
      if (!optionsArr[qCorrectIdx]) {
        errors.qCorrect = `Selected correct answer (Option ${letter}) is blank. Please enter text for Option ${letter}.`;
      }
    }

    // Subject validation
    if (!qCategory || !ALLOWED_SUBJECTS.includes(qCategory as any)) {
      errors.qCategory = 'Please select an allowed subject from the dropdown.';
    }

    // Difficulty validation
    if (!qDifficulty || !ALLOWED_DIFFICULTIES.includes(qDifficulty as any)) {
      errors.qDifficulty = 'Please select an allowed difficulty level from the dropdown.';
    }

    // Explanation validation
    if (!qExplanation.trim()) {
      errors.qExplanation = 'Explanation is required.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingQuestion) return;

    if (!validateManualForm()) {
      showToast('Please resolve all highlighted field errors before saving.', 'info');
      soundFx.playWrong();
      return;
    }

    setIsSavingQuestion(true);
    const options: [string, string, string, string] = [
      qOptionA.trim(), 
      qOptionB.trim(), 
      qOptionC.trim(), 
      qOptionD.trim()
    ];
    const correctLetter = (['A', 'B', 'C', 'D'][qCorrectIdx] as 'A' | 'B' | 'C' | 'D') || 'A';
    const correctText = options[qCorrectIdx];

    try {
      if (editingId !== null) {
        // Update existing question
        const currentQuestions = questions || [];
        const questionExists = currentQuestions.some(q => q && q.id === editingId);
        if (!questionExists) {
          throw new Error(`Question #${editingId} was not found in the question library.`);
        }

        const updated = currentQuestions.map((q) => {
          if (q.id === editingId) {
            return {
              ...q,
              stem: qText.trim(),
              question: qText.trim(),
              options,
              correctIndex: qCorrectIdx,
              correctKey: correctLetter,
              answer: {
                key: correctLetter,
                text: correctText
              },
              category: qCategory as QuestionCategory,
              difficulty: qDifficulty as 'Easy' | 'Medium' | 'Hard' | 'Expert',
              explanation: qExplanation.trim(),
              updatedAt: new Date().toISOString()
            };
          }
          return q;
        });

        await questionPoolManager.saveAllQuestions(updated);
        onUpdateQuestions(updated);
        try {
          localStorage.setItem('quizkart_questions', JSON.stringify(updated.slice(0, 1000)));
        } catch {}

        const editedQ = updated.find(q => q && q.id === editingId);
        if (editedQ) {
          saveQuestionToFirestore(editedQ).catch(e => console.warn('Firestore question update error:', e));
        }

        showToast(`Question #${editingId} successfully updated!`);
        soundFx.playSuccess();
        setEditingId(null);
      } else {
        // Create new question with unique ID guaranteed not to collide with deleted IDs
        const deletedSet = questionPoolManager.getDeletedQuestionIds();
        const validQuestions = (questions || []).filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));
        const validIds = validQuestions.map(q => Number(q.id)).filter(id => !isNaN(id));
        const maxUsedId = Math.max(0, ...validIds, ...Array.from(deletedSet));
        const newId = maxUsedId + 1;
        questionPoolManager.unrecordDeletedQuestionId(newId);

        const targetBlock = safeQuestionPage;
        const targetUserId = getBlockAssignedUserId(targetBlock, paginatedQuestions, registeredUsersList);

        const newQ: Question = {
          id: newId,
          stem: qText.trim(),
          question: qText.trim(),
          options,
          correctIndex: qCorrectIdx,
          correctKey: correctLetter,
          answer: {
            key: correctLetter,
            text: correctText
          },
          category: qCategory as QuestionCategory,
          difficulty: qDifficulty as 'Easy' | 'Medium' | 'Hard' | 'Expert',
          explanation: qExplanation.trim(),
          assignedUserId: targetUserId,
          isCustom: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const updated = [...validQuestions, newQ];
        await questionPoolManager.saveAllQuestions(updated);
        onUpdateQuestions(updated);
        try {
          localStorage.setItem('quizkart_questions', JSON.stringify(updated.slice(0, 1000)));
          localStorage.setItem('quizkart_questions_initialized', 'true');
        } catch {}

        saveQuestionToFirestore(newQ).catch(e => console.warn('Firestore question save error:', e));

        showToast(`Question #${newId} saved successfully!`);
        soundFx.playSuccess();
      }

      // Reset Single Form to empty defaults
      setQText('');
      setQOptionA('');
      setQOptionB('');
      setQOptionC('');
      setQOptionD('');
      setQCorrectIdx(0);
      setQCategory('');
      setQDifficulty('');
      setQExplanation('');
      setFormErrors({});
    } catch (err: any) {
      console.error('Failed to save question:', err);
      showToast(`Storage failure: ${err?.message || 'Unable to persist question.'}`, 'info');
      soundFx.playWrong();
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleEditQuestion = (q: Question) => {
    setBuilderMode('form');
    setEditingId(Number(q.id));
    setQText(q.stem || q.question || '');
    setQOptionA(q.options?.[0] || '');
    setQOptionB(q.options?.[1] || '');
    setQOptionC(q.options?.[2] || '');
    setQOptionD(q.options?.[3] || '');

    // Determine correct index
    let idx = 0;
    if (q.correctIndex != null && q.correctIndex >= 0 && q.correctIndex <= 3) {
      idx = q.correctIndex;
    } else if (q.correctKey) {
      const found = ['A', 'B', 'C', 'D'].indexOf(q.correctKey);
      if (found >= 0) idx = found;
    } else if ((q as any).answer?.key) {
      const found = ['A', 'B', 'C', 'D'].indexOf((q as any).answer.key);
      if (found >= 0) idx = found;
    }
    setQCorrectIdx(idx);

    // Normalize subject to one of the 6 allowed subjects
    const normSubject = toAllowedSubject(q.category);
    setQCategory(normSubject);

    // Difficulty
    const diff = q.difficulty;
    if (diff === 'Easy' || diff === 'Medium' || diff === 'Hard' || diff === 'Expert') {
      setQDifficulty(diff);
    } else {
      setQDifficulty('Medium');
    }

    setQExplanation(q.explanation || '');
    setFormErrors({});
    
    // Smooth scroll to manual form
    const formElement = document.getElementById('manual-question-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    showToast(`Loaded Question #${q.id} for editing.`, 'info');
  };

  const handleCancelEdit = () => {
    const cancelledId = editingId;
    setEditingId(null);
    setQText('');
    setQOptionA('');
    setQOptionB('');
    setQOptionC('');
    setQOptionD('');
    setQCorrectIdx(0);
    setQCategory('');
    setQDifficulty('');
    setQExplanation('');
    setFormErrors({});
    if (cancelledId !== null) {
      showToast(`Editing cancelled. Question #${cancelledId} remains unchanged.`, 'info');
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    const numericId = Number(id);
    try {
      questionPoolManager.recordDeletedQuestionId(numericId);
      const updated = (questions || []).filter(q => q && Number(q.id) !== numericId);
      onUpdateQuestions(updated);
      await questionPoolManager.saveAllQuestions(updated);
      try {
        localStorage.setItem('quizkart_questions', JSON.stringify(updated.slice(0, 1000)));
      } catch {}

      // Permanently purge from Firestore so it NEVER reappears (Requirement 4)
      removeQuestionFromFirestore(numericId).catch(e => console.warn('Firestore question delete error:', e));

      setSelectedQuestionIds(prev => prev.filter(selectedId => selectedId !== numericId));
      if (editingId === numericId) {
        handleCancelEdit();
      }
      soundFx.playClick();
      showToast(`Question #${numericId} permanently deleted.`);
    } catch (err: any) {
      console.error('Failed to permanently delete question:', err);
      const updated = (questions || []).filter(q => q && Number(q.id) !== numericId);
      onUpdateQuestions(updated);
      setSelectedQuestionIds(prev => prev.filter(selectedId => selectedId !== numericId));
      showToast(`Question #${numericId} permanently deleted.`);
    }
  };

  const handleToggleSelectQuestion = (id: number) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleClearSelectedQuestions = () => {
    setSelectedQuestionIds([]);
  };

  const handleDeleteSelectedQuestions = async () => {
    if (selectedQuestionIds.length === 0) {
      showToast('No questions selected to delete.', 'info');
      return;
    }

    const idsToDelete = [...selectedQuestionIds].map(Number);
    const count = idsToDelete.length;

    try {
      for (const id of idsToDelete) {
        questionPoolManager.recordDeletedQuestionId(id);
        // Permanently purge each from Firestore so they NEVER reappear (Requirement 4)
        removeQuestionFromFirestore(id).catch(e => console.warn('Firestore question delete error:', e));
      }
      const updated = (questions || []).filter(q => q && !idsToDelete.includes(Number(q.id)));
      onUpdateQuestions(updated);
      await questionPoolManager.saveAllQuestions(updated);
      try {
        localStorage.setItem('quizkart_questions', JSON.stringify(updated.slice(0, 1000)));
      } catch {}

      if (editingId !== null && idsToDelete.includes(editingId)) {
        handleCancelEdit();
      }

      setSelectedQuestionIds([]);
      soundFx.playClick();
      showToast(`Permanently deleted ${count} selected question${count > 1 ? 's' : ''}.`);
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      const updated = (questions || []).filter(q => q && !idsToDelete.includes(Number(q.id)));
      onUpdateQuestions(updated);
      setSelectedQuestionIds([]);
      showToast(`Permanently deleted ${count} selected question${count > 1 ? 's' : ''}.`);
    }
  };

  // AI Bulk Importer Handlers - Direct Natural Text Extractor in Single Click
  const handleParseBulkInput = async () => {
    if (!bulkInputText.trim()) {
      showToast('Please paste questions to validate.', 'info');
      return;
    }

    const report = validateAIQuestionJson(bulkInputText);
    const validQuestions = report.questions.filter(p => p.isValid);

    if (validQuestions.length === 0) {
      soundFx.playWrong();
      showToast('No questions could be extracted. Please ensure questions match the format.', 'info');
      return;
    }

    const deletedSet = questionPoolManager.getDeletedQuestionIds();
    const validPool = (questions || []).filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));

    // AUTOMATIC USER-BLOCK CREATION & 10-QUESTION LIMIT RULE (Requirement 1 & 2):
    // 1. Checks total count of registered User IDs (e.g. 5 registered users)
    // 2. Immediately creates 5 distinct blocks/pages in the Question Manager—one dedicated block for each registered User ID
    // 3. STRICT 10-QUESTION BLOCK LIMIT: Each block contains EXACTLY 10 questions (never 20 questions in a single block)
    // 4. Question Randomization & Exact Index Mapping: For each block, draws from base pool to create randomized question sequences
    // 5. STRICT SYNC RULE: The exact sequence of 10 questions generated inside a specific User ID's block in the Admin Panel
    //    MUST be the EXACT 10 questions presented in that user's live test session.
    const baseFormatted: Question[] = validQuestions.map((v, i) => ({
      id: i + 1,
      stem: v.stem,
      question: v.stem || v.question,
      options: v.options,
      correctIndex: v.correctIndex,
      correctKey: v.correctKey,
      category: v.category,
      subject: v.subject || v.category,
      difficulty: v.difficulty,
      explanation: v.explanation,
      isCustom: true
    }));

    const { allBlockQuestions, distinctUsers } = createInitialUserBlocksFromPool({
      baseQuestions: baseFormatted,
      registeredUsers: registeredUsersList,
      existingQuestions: validPool,
      onQuestionSavedToFirestore: (q) => {
        saveQuestionToFirestore(q).catch(e => console.warn('Firestore question save error:', e));
      }
    });

    const finalPool = allBlockQuestions;
    onUpdateQuestions(finalPool);
    await questionPoolManager.saveAllQuestions(finalPool);
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(finalPool.slice(0, 1000)));
      localStorage.setItem('quizkart_questions_initialized', 'true');
    } catch {}

    soundFx.playCelebration();
    showToast(`Successfully created ${distinctUsers.length} dedicated 10-question blocks (${allBlockQuestions.length} questions) for all registered users!`);
    setBulkInputText('');
    setBulkParsedResults([]);
    setBulkJsonError(null);
    setHasParsedBulk(false);
  };

  const handleVerifyPasscode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (passcodeInput.trim() === 'password1') {
      soundFx.playCelebration();
      if (passcodeModalBlock) {
        setUnmaskedBlockIds(prev => Array.from(new Set([...prev, passcodeModalBlock.blockNumber])));
        showToast(`Registration ID unmasked: ${passcodeModalBlock.userId}`);
      }
      setPasscodeModalBlock(null);
      setPasscodeInput('');
      setPasscodeError('');
    } else {
      soundFx.playWrong();
      setPasscodeError('Incorrect passcode. Please try again.');
    }
  };

  const handleCopyPromptTemplate = async () => {
    soundFx.playClick();
    const promptText = getDynamicPromptText(aiPromptQuestionCount);
    const success = await safeCopyToClipboard(promptText);
    if (success) {
      setCopiedPromptSuccess(true);
      showToast(`AI Prompt Template (${aiPromptQuestionCount} Questions) copied!`);
      setTimeout(() => setCopiedPromptSuccess(false), 3000);
    } else {
      showToast('Copy failed. Please copy manually from the prompt box.');
    }
  };

  const handleSaveBulkQuestions = async (mode: 'replace' | 'append') => {
    const validQuestions = bulkParsedResults.filter(p => p.isValid);
    if (validQuestions.length === 0) {
      showToast('No valid questions to save. Please fix validation errors first.', 'info');
      return;
    }

    const confirmationMessage = mode === 'replace'
      ? `Are you sure you want to REPLACE the active question pool with these ${validQuestions.length} validated questions?\n\nExisting questions in the pool will be replaced.`
      : `Are you sure you want to APPEND ${validQuestions.length} validated questions to the Question Library?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    const deletedSet = questionPoolManager.getDeletedQuestionIds();
    const validPool = (questions || []).filter(q => q && q.id != null && !deletedSet.has(Number(q.id)));

    const baseFormatted: Question[] = validQuestions.map((v, i) => ({
      id: i + 1,
      stem: v.stem,
      question: v.stem || v.question,
      options: v.options,
      correctIndex: v.correctIndex,
      correctKey: v.correctKey,
      category: v.category,
      subject: v.subject || v.category,
      difficulty: v.difficulty,
      explanation: v.explanation,
      isCustom: true
    }));

    const { allBlockQuestions, distinctUsers } = createInitialUserBlocksFromPool({
      baseQuestions: baseFormatted,
      registeredUsers: registeredUsersList,
      existingQuestions: mode === 'replace' ? [] : validPool,
      onQuestionSavedToFirestore: (q) => {
        saveQuestionToFirestore(q).catch(e => console.warn('Firestore question save error:', e));
      }
    });

    const finalPool = mode === 'replace' ? allBlockQuestions : [...validPool, ...allBlockQuestions];
    onUpdateQuestions(finalPool);
    await questionPoolManager.saveAllQuestions(finalPool);
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(finalPool.slice(0, 1000)));
      localStorage.setItem('quizkart_questions_initialized', 'true');
    } catch {}

    soundFx.playCelebration();
    showToast(
      mode === 'replace'
        ? `Replaced pool with ${distinctUsers.length} dedicated 10-question blocks (${finalPool.length} questions) for registered users!`
        : `Appended ${distinctUsers.length} dedicated 10-question blocks (${allBlockQuestions.length} questions)! Total pool is now ${finalPool.length}.`
    );

    // Reset Bulk State
    setBulkInputText('');
    setBulkParsedResults([]);
    setBulkJsonError(null);
    setHasParsedBulk(false);
    setBuilderMode('form');
  };

  // -------------------------------------------------------------
  // TAB 2: CONTEST BANNER & TIMER LOCK SETTINGS
  // -------------------------------------------------------------
  const [prizeTitle, setPrizeTitle] = useState<string>(todayPrize.title);
  const [prizeBadge, setPrizeBadge] = useState<string>(todayPrize.badge || 'INSTANT UPI');
  const [prizeBrand, setPrizeBrand] = useState<string>(todayPrize.brand);
  const [prizeMrp, setPrizeMrp] = useState<number>(todayPrize.mrp);
  const [prizeRetailValue, setPrizeRetailValue] = useState<number>(todayPrize.retailValue);
  const [prizeCategory, setPrizeCategory] = useState<string>(todayPrize.category);
  const [prizeImageUrl, setPrizeImageUrl] = useState<string>(todayPrize.imageUrl);
  const [prizePartner, setPrizePartner] = useState<string>(todayPrize.deliveryPartner || 'Amazon India');
  const [prizeEntryFee, setPrizeEntryFee] = useState<number>(poolData.entryFee);
  const [prizeTargetCap, setPrizeTargetCap] = useState<number>(poolData.targetParticipants);

  // Global Quiz Arena Contest Timer (Persistent & Locked)
  const [contestTimerSeconds, setContestTimerSeconds] = useState<number>(() => {
    if (globalQuizTimer && globalQuizTimer > 0) return globalQuizTimer;
    try {
      const saved = localStorage.getItem('quizkart_global_quiz_timer');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return 300; // Default 300s (5 minutes)
  });

  const handleSavePrize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeTitle.trim() || !prizeBrand.trim() || !prizeImageUrl.trim()) {
      showToast('Please enter title, brand, and valid image URL.', 'info');
      return;
    }

    const updatedPrize: DailyPrizeItem = {
      ...todayPrize,
      title: prizeTitle.trim(),
      badge: (prizeBadge.trim() || 'INSTANT UPI').toUpperCase(),
      brand: prizeBrand.trim(),
      mrp: Number(prizeMrp),
      retailValue: Number(prizeRetailValue),
      category: prizeCategory.trim(),
      imageUrl: prizeImageUrl.trim(),
      deliveryPartner: prizePartner
    };

    onUpdatePrize(updatedPrize);
    try {
      localStorage.setItem('quizkart_today_prize', JSON.stringify(updatedPrize));
    } catch {}

    // Update pool data if entry fee or participant cap changed
    if (prizeEntryFee !== poolData.entryFee || prizeTargetCap !== poolData.targetParticipants) {
      const newFee = Number(prizeEntryFee);
      const newCap = Number(prizeTargetCap);
      const newTotal = poolData.activeParticipants * newFee;
      const updatedPool: PoolEconomics = {
        ...poolData,
        entryFee: newFee,
        targetParticipants: newCap,
        totalPoolAmount: newTotal,
        productPrizeValue: Math.round(newTotal * (poolData.productSharePercentage / 100)),
        runnerUpPoolValue: Math.round(newTotal * (poolData.runnerUpCashbackPercentage / 100)),
        platformFeeValue: Math.round(newTotal * (poolData.platformFeePercentage / 100))
      };
      onUpdatePoolData(updatedPool);
      try {
        localStorage.setItem('quizkart_pool', JSON.stringify(updatedPool));
      } catch {}
    }

    soundFx.playSuccess();
    showToast("Today's Mega Prize and Entry parameters updated across the platform!");
  };

  const handleSelectPresetPrize = (preset: DailyPrizeItem) => {
    setPrizeTitle(preset.title);
    setPrizeBrand(preset.brand);
    setPrizeMrp(preset.mrp);
    setPrizeRetailValue(preset.retailValue);
    setPrizeCategory(preset.category);
    setPrizeImageUrl(preset.imageUrl);
    setPrizePartner(preset.deliveryPartner);
    showToast(`Loaded preset "${preset.title}". Click 'Publish Prize' to apply.`);
  };

  const [isLockingTimer, setIsLockingTimer] = useState<boolean>(false);
  const [isTimerLocked, setIsTimerLocked] = useState<boolean>(false);

  const handleLockContestTimer = (secondsToSet: number) => {
    const validSeconds = Math.max(10, Math.min(7200, Number(secondsToSet)));
    setContestTimerSeconds(validSeconds);
    setIsLockingTimer(true);
    setIsTimerLocked(false);

    try {
      localStorage.setItem('quizkart_global_quiz_timer', validSeconds.toString());
      window.dispatchEvent(new Event('storage'));
    } catch {}
    if (onUpdateQuizTimer) {
      onUpdateQuizTimer(validSeconds);
    }
    saveQuizTimerToFirestore(validSeconds).catch(() => {});

    setTimeout(() => {
      setIsLockingTimer(false);
      setIsTimerLocked(true);
      soundFx.playSuccess();
      const hrs = Math.floor(validSeconds / 3600);
      const mins = Math.floor((validSeconds % 3600) / 60);
      const secs = validSeconds % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
      showToast(`🔒 Quiz Arena Timer permanently locked to ${timeStr} across platform!`);
      setTimeout(() => {
        setIsTimerLocked(false);
      }, 2000);
    }, 1000);
  };

  // -------------------------------------------------------------
  // TAB 3: DEPOSIT APPROVALS (UTR VERIFICATION QUEUE)
  // -------------------------------------------------------------
  // TAB 3: DEPOSITS & VERIFICATION STATE
  // -------------------------------------------------------------
  const [deposits, setDeposits] = useState<DepositRequest[]>(() => {
    const raw = (propDeposits && propDeposits.length > 0) ? propDeposits : (() => {
      try {
        const saved = localStorage.getItem('quizkart_admin_deposits');
        return saved ? JSON.parse(saved) : DEFAULT_DEPOSIT_REQUESTS;
      } catch {
        return DEFAULT_DEPOSIT_REQUESTS;
      }
    })();
    const map = new Map<string, DepositRequest>();
    (raw || []).forEach((d, idx) => {
      if (d && d.id) {
        const normId = formatDepositId(d.id, idx + 1);
        if (!map.has(normId)) {
          map.set(normId, {
            ...d,
            id: normId,
            timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date)
          });
        }
      }
    });
    return Array.from(map.values());
  });

  useEffect(() => {
    if (propDeposits) {
      const map = new Map<string, DepositRequest>();
      propDeposits.forEach((d, idx) => {
        if (d && d.id) {
          const normId = formatDepositId(d.id, idx + 1);
          if (!map.has(normId)) {
            map.set(normId, {
              ...d,
              id: normId,
              timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date)
            });
          }
        }
      });
      setDeposits(Array.from(map.values()));
    }
  }, [propDeposits]);

  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState<string | null>(null);
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [depositSearch, setDepositSearch] = useState<string>('');
  const [depositDateFilter, setDepositDateFilter] = useState<string>('');
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);

  const saveDeposits = (newDeposits: DepositRequest[]) => {
    setDeposits(newDeposits);
    if (onUpdateDeposits) {
      onUpdateDeposits(newDeposits);
    }
    try {
      localStorage.setItem('quizkart_admin_deposits', JSON.stringify(newDeposits));
    } catch {}
  };

  const handleDeleteDeposit = (id: string) => {
    const target = (deposits || []).find(d => d && d.id === id);
    if (target && target.status === 'pending') {
      soundFx.playWrong();
      showToast('Action Required: You must Approve or Reject this deposit before deleting.', 'info');
      return;
    }

    const updated = (deposits || []).filter(d => d && d.id !== id);
    saveDeposits(updated);
    setSelectedDepositIds(prev => prev.filter(selId => selId !== id));

    // Permanent deletion registry: prevents reappearance on refresh or re-sync
    addDeletedDepositId(id);

    try {
      const activePendingId = localStorage.getItem('quizkart_active_pending_deposit_id');
      if (activePendingId === id || formatDepositId(activePendingId) === formatDepositId(id)) {
        localStorage.removeItem('quizkart_active_pending_deposit_id');
      }
    } catch {}

    // NOTICE: User-side transaction history is decoupled and immutable - never delete from user transaction logs!

    deleteDepositFromFirestore(id).catch(() => {});
    soundFx.playClick();
    showToast(`Deposit record removed from Admin ledger.`);
  };

  const handleBulkDeleteDeposits = () => {
    if (selectedDepositIds.length === 0) return;

    // Strict validation: never delete pending deposits
    const allowedIds = selectedDepositIds.filter(id => {
      const dep = (deposits || []).find(d => d && d.id === id);
      return dep && dep.status !== 'pending';
    });

    if (allowedIds.length === 0) {
      soundFx.playWrong();
      showToast('Action Required: Cannot delete pending deposits. Approve or Reject them first.', 'info');
      return;
    }

    const count = allowedIds.length;
    const toDeleteSet = new Set(allowedIds);
    const updated = (deposits || []).filter(d => d && !toDeleteSet.has(d.id));
    saveDeposits(updated);

    allowedIds.forEach(id => {
      addDeletedDepositId(id);
    });

    try {
      const activePendingId = localStorage.getItem('quizkart_active_pending_deposit_id');
      if (activePendingId && toDeleteSet.has(activePendingId)) {
        localStorage.removeItem('quizkart_active_pending_deposit_id');
      }
    } catch {}

    // NOTICE: User-side transaction history is decoupled and immutable - never delete from user transaction logs!

    allowedIds.forEach(id => {
      deleteDepositFromFirestore(id).catch(() => {});
    });

    setSelectedDepositIds([]);
    soundFx.playClick();
    showToast(`Removed ${count} deposit record${count > 1 ? 's' : ''} from Admin ledger.`);
  };

  const handleApproveDeposit = (id: string) => {
    const dep = (deposits || []).find(d => d && d.id === id);
    if (!dep) return;
    const updated = (deposits || []).map(d => d && d.id === id ? { ...d, status: 'approved' as const } : d);
    saveDeposits(updated);

    // AUTOMATIC BALANCE CREDIT: When Admin clicks "Approve", automatically credit the submitted deposit amount strictly to the matching user's wallet balance by Email
    const targetEmail = (dep.userEmail || dep.email || '').trim().toLowerCase();
    try {
      const rawUsers = localStorage.getItem('quizkart_registered_users');
      if (rawUsers && targetEmail) {
        const parsedUsers: UserProfile[] = JSON.parse(rawUsers);
        if (Array.isArray(parsedUsers)) {
          const updatedUsers = parsedUsers.map((u) => {
            if (u && (u.email || '').trim().toLowerCase() === targetEmail) {
              return { ...u, walletBalance: (Number(u.walletBalance) || 0) + Number(dep.amount) };
            }
            return u;
          });
          localStorage.setItem('quizkart_registered_users', JSON.stringify(updatedUsers));
        }
      }
    } catch {}

    let targetProfile = userProfile;
    try {
      const savedProf = localStorage.getItem('quizkart_user_profile');
      if (savedProf) targetProfile = JSON.parse(savedProf);
    } catch {}

    const activeProfileEmail = (targetProfile?.email || '').trim().toLowerCase();
    if (targetProfile && onUpdateProfile && targetEmail && activeProfileEmail === targetEmail) {
      const newBalance = (targetProfile.walletBalance || 0) + Number(dep.amount);
      const updatedProfile: UserProfile = {
        ...targetProfile,
        walletBalance: newBalance
      };
      onUpdateProfile(updatedProfile);
      try {
        localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedProfile));
      } catch {}
      syncUserProfile(updatedProfile).catch(() => {});
    }

    // Update status in user permanent audit log (never deleted)
    try {
      const permDeposits = localStorage.getItem('quizkart_user_deposits_permanent');
      const list: DepositRequest[] = permDeposits ? JSON.parse(permDeposits) : [];
      let found = false;
      const updatedPerm = list.map((item: any) => {
        if (item && (item.id === id || formatDepositId(item.id) === formatDepositId(id))) {
          found = true;
          return { ...item, status: 'approved' };
        }
        return item;
      });
      if (!found && dep) {
        updatedPerm.unshift({ ...dep, status: 'approved' });
      }
      localStorage.setItem('quizkart_user_deposits_permanent', JSON.stringify(updatedPerm));
    } catch {}

    // Clear active pending deposit lock
    try {
      localStorage.removeItem('quizkart_active_pending_deposit_id');
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_deposit_status_changed', { detail: { id, status: 'approved' } }));
    }

    updateDepositStatusInFirestore(id, 'approved').catch(() => {});

    soundFx.playSuccess();
    showToast(`Deposit #${id} approved! ₹${dep.amount} credited to ${dep.userName}'s wallet.`);
  };

  const handleRejectDeposit = (id: string) => {
    const dep = (deposits || []).find(d => d && d.id === id);
    const updated = (deposits || []).map(d => d && d.id === id ? { ...d, status: 'rejected' as const } : d);
    saveDeposits(updated);

    // Update status in user permanent audit log
    try {
      const permDeposits = localStorage.getItem('quizkart_user_deposits_permanent');
      const list: DepositRequest[] = permDeposits ? JSON.parse(permDeposits) : [];
      let found = false;
      const updatedPerm = list.map((item: any) => {
        if (item && (item.id === id || formatDepositId(item.id) === formatDepositId(id))) {
          found = true;
          return { ...item, status: 'rejected' };
        }
        return item;
      });
      if (!found && dep) {
        updatedPerm.unshift({ ...dep, status: 'rejected' });
      }
      localStorage.setItem('quizkart_user_deposits_permanent', JSON.stringify(updatedPerm));
    } catch {}

    try {
      localStorage.removeItem('quizkart_active_pending_deposit_id');
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_deposit_status_changed', { detail: { id, status: 'rejected' } }));
    }

    updateDepositStatusInFirestore(id, 'rejected').catch(() => {});
    soundFx.playWrong();
    showToast(`Deposit #${id} rejected.`, 'info');
  };

  // -------------------------------------------------------------
  // TAB: WITHDRAWAL APPROVALS STATE & HANDLERS
  // -------------------------------------------------------------
  const [withdrawalsList, setWithdrawalsList] = useState<WithdrawalRequest[]>(() => {
    const raw = (propWithdrawals && propWithdrawals.length > 0) ? propWithdrawals : (() => {
      try {
        const saved = localStorage.getItem('quizkart_admin_withdrawals');
        return saved ? JSON.parse(saved) : DEFAULT_WITHDRAWAL_REQUESTS;
      } catch {
        return DEFAULT_WITHDRAWAL_REQUESTS;
      }
    })();
    const map = new Map<string, WithdrawalRequest>();
    (raw || []).forEach((w, idx) => {
      if (w && w.id) {
        const normId = formatWithdrawalId(w.id, idx + 1);
        if (!map.has(normId)) {
          map.set(normId, {
            ...w,
            id: normId,
            timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
          });
        }
      }
    });
    return Array.from(map.values());
  });

  useEffect(() => {
    if (propWithdrawals) {
      const map = new Map<string, WithdrawalRequest>();
      propWithdrawals.forEach((w, idx) => {
        if (w && w.id) {
          const normId = formatWithdrawalId(w.id, idx + 1);
          if (!map.has(normId)) {
            map.set(normId, {
              ...w,
              id: normId,
              timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
            });
          }
        }
      });
      setWithdrawalsList(Array.from(map.values()));
    }
  }, [propWithdrawals]);

  const saveWithdrawals = (newWithdrawals: WithdrawalRequest[]) => {
    setWithdrawalsList(newWithdrawals);
    if (onUpdateWithdrawals) {
      onUpdateWithdrawals(newWithdrawals);
    }
    try {
      localStorage.setItem('quizkart_admin_withdrawals', JSON.stringify(newWithdrawals));
    } catch {}
  };

  const handleApproveWithdrawal = (id: string) => {
    const wth = (withdrawalsList || []).find(w => w && w.id === id);
    if (!wth) return;
    const updated = (withdrawalsList || []).map(w => w && w.id === id ? { ...w, status: 'approved' as const } : w);
    saveWithdrawals(updated);

    // Update status in user permanent audit log
    try {
      const permWithdrawals = localStorage.getItem('quizkart_user_withdrawals_permanent');
      const list: WithdrawalRequest[] = permWithdrawals ? JSON.parse(permWithdrawals) : [];
      let found = false;
      const updatedPerm = list.map((item: any) => {
        if (item && (item.id === id || formatWithdrawalId(item.id) === formatWithdrawalId(id))) {
          found = true;
          return { ...item, status: 'approved' };
        }
        return item;
      });
      if (!found && wth) {
        updatedPerm.unshift({ ...wth, status: 'approved' });
      }
      localStorage.setItem('quizkart_user_withdrawals_permanent', JSON.stringify(updatedPerm));
    } catch {}

    // Lift user pending screen lock
    try {
      const activePending = localStorage.getItem('quizkart_active_pending_withdrawal_id');
      if (activePending && (activePending === id || formatWithdrawalId(activePending) === formatWithdrawalId(id))) {
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      }
    } catch {}

    // Instantly notify front-end views to unlock
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_withdrawal_status_changed', { detail: { id, status: 'approved' } }));
    }

    updateWithdrawalStatusInFirestore(id, 'approved').catch(() => {});
    soundFx.playSuccess();
    showToast(`Withdrawal #${formatWithdrawalId(id)} approved! Payout of ₹${wth.amount} marked as transferred.`);
  };

  const handleRejectWithdrawal = (id: string, reason: 'rejected' | 'cancelled' = 'rejected') => {
    const wth = (withdrawalsList || []).find(w => w && w.id === id);
    if (!wth) return;
    const updated = (withdrawalsList || []).map(w => w && w.id === id ? { ...w, status: reason } : w);
    saveWithdrawals(updated);

    // CRITICAL AUTOMATIC REFUND SYSTEM:
    // If Admin clicks Reject or Cancel, the full withdrawal amount MUST be automatically credited back strictly to the matching user's wallet balance by Email
    const targetEmail = (wth.userEmail || wth.email || '').trim().toLowerCase();
    const refundAmt = Number(wth.amount) || 0;
    try {
      const rawUsers = localStorage.getItem('quizkart_registered_users');
      if (rawUsers && targetEmail && refundAmt > 0) {
        const parsedUsers: UserProfile[] = JSON.parse(rawUsers);
        if (Array.isArray(parsedUsers)) {
          const updatedUsers = parsedUsers.map((u) => {
            if (u && (u.email || '').trim().toLowerCase() === targetEmail) {
              return { ...u, walletBalance: (Number(u.walletBalance) || 0) + refundAmt };
            }
            return u;
          });
          localStorage.setItem('quizkart_registered_users', JSON.stringify(updatedUsers));
        }
      }
    } catch {}

    let targetProfile = userProfile;
    try {
      const savedProfileStr = localStorage.getItem('quizkart_user_profile');
      if (savedProfileStr) {
        targetProfile = JSON.parse(savedProfileStr);
      }
    } catch {}

    const activeProfileEmail = (targetProfile?.email || '').trim().toLowerCase();
    if (refundAmt > 0 && targetProfile && targetEmail && activeProfileEmail === targetEmail) {
      const refundedBalance = (Number(targetProfile.walletBalance) || 0) + refundAmt;
      const updatedProfile: UserProfile = {
        ...targetProfile,
        walletBalance: refundedBalance
      };
      if (onUpdateProfile) {
        onUpdateProfile(updatedProfile);
      }
      try {
        localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedProfile));
      } catch {}
      syncUserProfile(updatedProfile).catch(() => {});
    }

    // Also update status in user permanent audit log (never deleted)
    try {
      const permWithdrawals = localStorage.getItem('quizkart_user_withdrawals_permanent');
      const list: WithdrawalRequest[] = permWithdrawals ? JSON.parse(permWithdrawals) : [];
      let found = false;
      const updatedPerm = list.map((item: any) => {
        if (item && (item.id === id || formatWithdrawalId(item.id) === formatWithdrawalId(id))) {
          found = true;
          return { ...item, status: reason };
        }
        return item;
      });
      if (!found && wth) {
        updatedPerm.unshift({ ...wth, status: reason });
      }
      localStorage.setItem('quizkart_user_withdrawals_permanent', JSON.stringify(updatedPerm));
    } catch {}

    // Lift user pending screen lock
    try {
      const activePending = localStorage.getItem('quizkart_active_pending_withdrawal_id');
      if (activePending && (activePending === id || formatWithdrawalId(activePending) === formatWithdrawalId(id))) {
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      }
    } catch {}

    // Instantly notify front-end views to unlock
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_withdrawal_status_changed', { detail: { id, status: reason } }));
    }

    updateWithdrawalStatusInFirestore(id, reason).catch(() => {});
    soundFx.playWrong();
    showToast(`Withdrawal #${formatWithdrawalId(id)} ${reason === 'cancelled' ? 'cancelled' : 'rejected'} and ₹${wth.amount} refunded to wallet.`, 'info');
  };

  const handleDeleteWithdrawal = (id: string) => {
    // Strict validation: Block direct deletion of pending withdrawal requests
    const target = (withdrawalsList || []).find(w => w && w.id === id);
    if (target && target.status === 'pending') {
      soundFx.playWrong();
      showToast('Action Required: You must Approve, Reject, or Cancel this pending request before deleting.', 'info');
      return;
    }

    const updated = (withdrawalsList || []).filter(w => w && w.id !== id);
    saveWithdrawals(updated);

    // Permanent deletion registry: prevents reappearance in Admin view on refresh or background sync
    addDeletedWithdrawalId(id);

    // If active pending was deleted, clear pending lock so user is not stuck
    try {
      const activePending = localStorage.getItem('quizkart_active_pending_withdrawal_id');
      if (activePending && (activePending === id || formatWithdrawalId(activePending) === formatWithdrawalId(id))) {
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      }
    } catch {}

    // NOTICE: User-side transaction history is decoupled and immutable - never delete from user transaction logs!

    // Instantly notify front-end views to unlock
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_withdrawal_status_changed', { detail: { id, action: 'deleted' } }));
    }

    deleteWithdrawalFromFirestore(id).catch(() => {});
    soundFx.playClick();
    showToast('Withdrawal record cleared from Admin ledger.');
  };

  const handleBulkDeleteWithdrawals = (ids: string[]) => {
    if (ids.length === 0) return;

    // Strict validation: never delete pending requests
    const allowedIds = ids.filter(id => {
      const wth = (withdrawalsList || []).find(w => w && w.id === id);
      return wth && wth.status !== 'pending';
    });

    if (allowedIds.length === 0) {
      soundFx.playWrong();
      showToast('Action Required: Cannot delete pending requests. Approve, Reject, or Cancel them first.', 'info');
      return;
    }

    const count = allowedIds.length;
    const toDeleteSet = new Set(allowedIds);
    const updated = (withdrawalsList || []).filter(w => w && !toDeleteSet.has(w.id));
    saveWithdrawals(updated);

    allowedIds.forEach(id => {
      addDeletedWithdrawalId(id);
    });

    // If active pending was deleted, clear pending lock so user is not stuck
    try {
      const activePending = localStorage.getItem('quizkart_active_pending_withdrawal_id');
      if (activePending && (toDeleteSet.has(activePending) || toDeleteSet.has(formatWithdrawalId(activePending)))) {
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      }
    } catch {}

    // NOTICE: User-side transaction history is decoupled and immutable - never delete from user transaction logs!

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quizkart_withdrawal_status_changed', { detail: { ids: allowedIds, action: 'deleted' } }));
    }

    allowedIds.forEach(id => {
      deleteWithdrawalFromFirestore(id).catch(() => {});
    });
    soundFx.playClick();
    showToast(`Removed ${count} withdrawal record${count > 1 ? 's' : ''} from Admin ledger.`);
  };

  // -------------------------------------------------------------
  // TAB 4: WINNER PAYOUT LEDGER (UPI DIRECT COPY & PAID TOGGLE)
  // -------------------------------------------------------------
  const [orderTrackingId, setOrderTrackingId] = useState<string>(() => {
    return localStorage.getItem('quizkart_rank1_tracking') || 'AMZN-IN-89302194';
  });
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, 'pending' | 'sent'>>(() => {
    try {
      const saved = localStorage.getItem('quizkart_payout_statuses');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [copiedUpiId, setCopiedUpiId] = useState<string | null>(null);
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [isFinancialsExpanded, setIsFinancialsExpanded] = useState<boolean>(false);

  const handleCopyUpi = async (upiId: string, entryId: string) => {
    if (!upiId) {
      showToast('No UPI ID provided for this contestant.', 'info');
      return;
    }
    soundFx.playClick();
    const success = await safeCopyToClipboard(upiId);
    if (success) {
      setCopiedUpiId(entryId);
      showToast(`Copied UPI ID "${upiId}" to clipboard!`);
      setTimeout(() => setCopiedUpiId(null), 2500);
    } else {
      showToast(`Contestant UPI ID: ${upiId}`);
    }
  };

  const handleTogglePayoutStatus = (id: string) => {
    const nextStatus = payoutStatuses[id] === 'sent' ? 'pending' : 'sent';
    const updated = { ...payoutStatuses, [id]: nextStatus };
    setPayoutStatuses(updated);
    try {
      localStorage.setItem('quizkart_payout_statuses', JSON.stringify(updated));
    } catch {}
    soundFx.playClick();
    showToast(`Payout status for participant updated to: ${nextStatus.toUpperCase()}`);
  };

  const handleBatchPayAllCashbacks = () => {
    const updated: Record<string, 'pending' | 'sent'> = { ...payoutStatuses };
    (leaderboard || []).forEach(item => {
      if (item && item.id && item.rank >= 2 && item.rank <= 10) {
        updated[item.id] = 'sent';
      }
    });
    setPayoutStatuses(updated);
    try {
      localStorage.setItem('quizkart_payout_statuses', JSON.stringify(updated));
    } catch {}
    soundFx.playSuccess();
    showToast(`All ₹${poolData.runnerUpPoolValue.toLocaleString('en-IN')} Runner-Up Cashbacks marked as Disbursed via UPI!`);
  };

  const handleDeclareWinner = () => {
    const sorted = [...leaderboard].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    const updated = sorted.map((entry, idx) => {
      const rank = idx + 1;
      let rewardText = 'Participation Badge';
      let rType: 'product' | 'cashback' | 'none' = 'none';
      let rAmt = 0;

      if (rank === 1) {
        rewardText = `🎁 ${todayPrize.brand} Smartwatch (${entry.city})`;
        rType = 'product';
        rAmt = todayPrize.retailValue;
      } else if (rank === 2) {
        rewardText = '₹1,000 UPI Cashback';
        rType = 'cashback';
        rAmt = 1000;
      } else if (rank === 3) {
        rewardText = '₹750 UPI Cashback';
        rType = 'cashback';
        rAmt = 750;
      } else if (rank <= 5) {
        rewardText = '₹500 UPI Cashback';
        rType = 'cashback';
        rAmt = 500;
      } else if (rank <= 10) {
        rewardText = '₹250 UPI Cashback';
        rType = 'cashback';
        rAmt = 250;
      }

      return {
        ...entry,
        rank,
        rewardText,
        rewardType: rType,
        rewardAmount: rAmt
      };
    });

    onUpdateLeaderboard(updated);
    try {
      localStorage.setItem('quizkart_leaderboard', JSON.stringify(updated));
    } catch {}
    soundFx.playCelebration();
    showToast(`🏆 Winner Declared: ${updated[0]?.userName || 'Rank 1'} (${updated[0]?.score}/10 in ${updated[0]?.formattedTime}) won the ${todayPrize.brand}!`);
  };

  const handleSaveTrackingId = () => {
    if (!orderTrackingId.trim()) {
      showToast('Please enter an Amazon / Meesho AWB tracking ID.', 'info');
      return;
    }
    try {
      localStorage.setItem('quizkart_rank1_tracking', orderTrackingId.trim());
    } catch {}
    const updated = leaderboard.map(item => {
      if (item.rank === 1) {
        return {
          ...item,
          rewardText: `🎁 Dispatched via ${todayPrize.deliveryPartner} (AWB: ${orderTrackingId.trim()})`
        };
      }
      return item;
    });
    onUpdateLeaderboard(updated);
    try {
      localStorage.setItem('quizkart_leaderboard', JSON.stringify(updated));
    } catch {}
    showToast(`Rank #1 Courier Tracking ID updated to "${orderTrackingId}"`);
  };

  // -------------------------------------------------------------
  // TAB 5: SECURITY & ANTI-CHEAT VIOLATION LOGS
  // -------------------------------------------------------------
  const [securityLogsList, setSecurityLogsList] = useState<SecurityViolationLog[]>(() => {
    try {
      const saved = localStorage.getItem('quizkart_security_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SECURITY_LOGS;
  });
  const [securityFilter, setSecurityFilter] = useState<'all' | 'critical' | 'high' | 'warning'>('all');
  const [securitySearch, setSecuritySearch] = useState<string>('');

  const saveSecurityLogs = (newLogs: SecurityViolationLog[]) => {
    setSecurityLogsList(newLogs);
    try {
      localStorage.setItem('quizkart_security_logs', JSON.stringify(newLogs));
    } catch {}
  };

  const handleSimulateSecurityBreach = () => {
    const violationTemplates = [
      {
        type: 'DevTools Inspect Shortcut (F12) Trapped',
        severity: 'Critical (Disqualified)' as const,
        device: 'Desktop Windows 11 • Chromium Keyboard Trap'
      },
      {
        type: 'Tab switch / Minimized window detected',
        severity: 'Critical (Disqualified)' as const,
        device: 'Desktop Mac OS • Multi-Monitor Blur'
      },
      {
        type: 'Screenshot Key (PrintScreen) Blocked',
        severity: 'High (Forced Termination)' as const,
        device: 'Laptop Keyboard • OS Clipboard Intercept'
      },
      {
        type: 'Canvas OCR Tampering Attempt',
        severity: 'Critical (Disqualified)' as const,
        device: 'Mobile Android • Overlay Detection Engine'
      }
    ];

    const pick = violationTemplates[Math.floor(Math.random() * violationTemplates.length)];
    const names = ['Siddharth Rao', 'Pooja Bhatt', 'Manish Agrawal', 'Alok Verma', 'Divya Sen'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const cities = ['Hyderabad', 'Indore', 'Bhopal', 'Ahmedabad', 'Jaipur'];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];

    const newLog: SecurityViolationLog = {
      id: `SEC-${Math.floor(1000 + Math.random() * 9000)}`,
      userName: randomName,
      city: randomCity,
      phone: '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
      timestamp: getCurrentFormattedTimestamp(),
      violationType: pick.type,
      severity: pick.severity,
      actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
      deviceInfo: pick.device,
      status: 'Flagged'
    };

    const updated = [newLog, ...securityLogsList];
    saveSecurityLogs(updated);
    soundFx.playWrong();
    showToast(`🚨 Security Incident Simulated: ${newLog.id} logged for ${randomName}!`);
  };

  const handleClearSecurityLogs = () => {
    if (confirm('Clear all security violation logs?')) {
      saveSecurityLogs([]);
      soundFx.playClick();
      showToast('All security violation logs have been cleared.');
    }
  };

  const handleToggleLogReviewStatus = (id: string) => {
    const updated = securityLogsList.map(log => {
      if (log.id === id) {
        const nextStatus = log.status === 'Flagged' ? 'Reviewed' as const : 'Flagged' as const;
        return { ...log, status: nextStatus };
      }
      return log;
    });
    saveSecurityLogs(updated);
    soundFx.playClick();
    showToast(`Log #${id} status updated.`);
  };

  const handleExportSecurityReport = async () => {
    const report = {
      platform: 'QuizKart Competitive Proctored Arena',
      exportDate: new Date().toISOString(),
      totalViolations: securityLogsList.length,
      logs: securityLogsList
    };
    soundFx.playClick();
    const success = await safeCopyToClipboard(JSON.stringify(report, null, 2));
    if (success) {
      showToast('Audit report copied to clipboard in JSON format!');
    } else {
      showToast('Could not copy report to clipboard.', 'info');
    }
  };

  // Header Refresh & Exit Actions
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExiting, setIsExiting] = useState<boolean>(false);

  const handleRefreshAdmin = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    soundFx.playClick();
    setTimeout(() => {
      try {
        const qSaved = localStorage.getItem('quizkart_questions');
        if (qSaved) onUpdateQuestions(JSON.parse(qSaved));
        const pSaved = localStorage.getItem('quizkart_today_prize');
        if (pSaved) onUpdatePrize(JSON.parse(pSaved));
        const lSaved = localStorage.getItem('quizkart_leaderboard');
        if (lSaved) onUpdateLeaderboard(JSON.parse(lSaved));
        const poolSaved = localStorage.getItem('quizkart_pool');
        if (poolSaved) onUpdatePoolData(JSON.parse(poolSaved));
        const depSaved = localStorage.getItem('quizkart_admin_deposits');
        if (depSaved) setDeposits(JSON.parse(depSaved));
        const timerSaved = localStorage.getItem('quizkart_global_quiz_timer');
        if (timerSaved) setContestTimerSeconds(parseInt(timerSaved, 10));
        const secSaved = localStorage.getItem('quizkart_security_logs');
        if (secSaved) setSecurityLogsList(JSON.parse(secSaved));
      } catch {}
      setIsRefreshing(false);
      soundFx.playSuccess();
      showToast('Admin data & live state refreshed successfully!');
    }, 1000);
  };

  const handleExitAdmin = () => {
    if (isExiting) return;
    setIsExiting(true);
    soundFx.playClick();
    setTimeout(() => {
      setIsExiting(false);
      onExitAdmin();
    }, 1000);
  };

  // Filtered Questions for Tab 1 Table with High-Capacity Indexing
  const filteredQuestions = (questions || []).filter(q => {
    if (!q || q.id == null) return false;

    if (questionSearch.trim()) {
      const s = questionSearch.toLowerCase().trim();
      const searchable = `${q.id} ${q.stem || ''} ${q.question || ''} ${q.category || ''} ${q.explanation || ''}`.toLowerCase();
      if (!searchable.includes(s)) return false;
    }

    return true;
  });

  const totalQuestionPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTION_PAGE_SIZE));
  const safeQuestionPage = Math.min(Math.max(1, questionPage), totalQuestionPages);
  const paginatedQuestions = filteredQuestions.slice(
    (safeQuestionPage - 1) * QUESTION_PAGE_SIZE,
    safeQuestionPage * QUESTION_PAGE_SIZE
  );

  // Filtered Deposits for Tab 3
  const filteredDeposits = (deposits || []).filter((d, idx) => {
    if (!d || !d.id) return false;
    if (depositFilter !== 'all' && d.status !== depositFilter) return false;

    if (depositSearch.trim()) {
      const q = depositSearch.trim().toLowerCase();
      const name = (d.userName || '').toLowerCase();
      const phone = (d.phone || '').toLowerCase();
      const utr = (d.utrNumber || '').toLowerCase();
      const displayId = formatDepositId(d.id, idx + 1).toLowerCase();
      const rawId = d.id.toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !utr.includes(q) && !displayId.includes(q) && !rawId.includes(q)) {
        return false;
      }
    }

    if (depositDateFilter) {
      const depDate = d.date || (d.createdAt ? d.createdAt.split('T')[0] : '');
      const formattedTs = formatDepositTimestamp(d.timestamp, d.createdAt, d.date);
      const tsDate = formattedTs.split(' | ')[0];
      if (depDate && depDate === depositDateFilter) {
        // match
      } else if (tsDate && tsDate === depositDateFilter) {
        // match
      } else if ((d.timestamp || '').includes(depositDateFilter)) {
        // match
      } else {
        return false;
      }
    }

    return true;
  });

  // Only resolved (approved or rejected) deposits can be deleted
  const resolvableDeposits = (filteredDeposits || []).filter(d => d && d.status !== 'pending');

  // Filtered Leaderboard for Tab 4
  const filteredLeaderboard = (leaderboard || []).filter(item => {
    if (!item || !item.id) return false;
    const matchesSearch = (item.userName || '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      (item.city || '').toLowerCase().includes(ledgerSearch.toLowerCase());
    if (!matchesSearch) return false;
    const status = payoutStatuses[item.id] || 'pending';
    if (ledgerFilter === 'all') return true;
    return status === ledgerFilter;
  });

  // Filtered Security Logs for Tab 5
  const filteredSecurityLogs = (securityLogsList || []).filter(log => {
    if (!log || !log.id) return false;
    const matchesSearch = (log.userName || '').toLowerCase().includes(securitySearch.toLowerCase()) ||
      (log.violationType || '').toLowerCase().includes(securitySearch.toLowerCase()) ||
      log.id.toLowerCase().includes(securitySearch.toLowerCase());
    if (!matchesSearch) return false;
    if (securityFilter === 'all') return true;
    if (securityFilter === 'critical') return (log.severity || '').includes('Critical');
    if (securityFilter === 'high') return (log.severity || '').includes('High');
    if (securityFilter === 'warning') return (log.severity || '').includes('Warning');
    return true;
  });

  return (
    <div id="adminPageView" className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* 1. TOP HEADER BAR */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          {/* Logo strictly 1:1 square aspect ratio */}
          <div 
            className="w-10 h-10 min-w-10 min-h-10 aspect-square shrink-0 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md ring-1 ring-black/5 select-none"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
          >
            Q
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 leading-tight">
              QuizKart Admin
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Super Admin Control Plane • Manage Questions, Timer Lock, Deposits, Winner Payouts & Security
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Functional Refresh Button: 1s smooth spinning animation, reload/refresh local data state, stay inside admin */}
          <button
            type="button"
            onClick={handleRefreshAdmin}
            disabled={isRefreshing}
            title="Refresh Admin Data & Telemetry"
            aria-label="Refresh Admin Data"
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all border border-slate-300 cursor-pointer shadow-xs active:scale-95 shrink-0 disabled:opacity-75"
          >
            <RotateCcw className={`w-4 h-4 text-slate-600 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Minimal Exit Action: Sleek Icon-only Back Arrow with Q-logo 3-color gradient style & 1-second circular loader */}
          <button
            type="button"
            onClick={handleExitAdmin}
            disabled={isExiting}
            id="exit-admin-btn"
            title="Exit Admin / Go To Site"
            aria-label="Exit Admin / Go To Site"
            className="w-10 h-10 rounded-xl text-white flex items-center justify-center transition-all cursor-pointer shadow-md hover:opacity-95 active:scale-95 shrink-0 disabled:opacity-75"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' }}
          >
            {isExiting ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <ArrowLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {statusMessage && (
        <div className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between border-b transition-all ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. TAB NAVIGATION BAR - Clean, Light-Themed Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Tab 1: Contests (Icon ONLY with Q-logo 3-color gradient style) */}
          <button
            id="admin-tab-contests"
            onClick={() => setActiveTab('contests')}
            title="Contests"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              activeTab === 'contests'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'contests' ? { background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' } : {}}
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Tab: Registered Users (User Management & Block System) */}
          <button
            id="admin-tab-users"
            type="button"
            onClick={() => {
              soundFx.playClick();
              setActiveTab('users');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'users' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
          >
            <Users className="w-4 h-4" />
            <span>Registered Users</span>
            <span className="px-2 py-0.5 text-[10px] bg-white text-slate-900 font-black rounded-full">
              {registeredUsersList.filter((u) => isUserSessionActive(u)).length}
            </span>
          </button>

          {/* Tab 2: Question Manager */}
          <button
            id="admin-tab-questions"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'questions'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'questions' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Question Manager</span>
          </button>

          {/* Tab 3: Contest Banner & Timer */}
          <button
            id="admin-tab-prize-timer"
            onClick={() => setActiveTab('prize_timer')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'prize_timer'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'prize_timer' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
          >
            <Gift className="w-4 h-4" />
            <span>Contest Banner & Timer</span>
          </button>

          {/* Tab 4: Deposit Approvals */}
          <button
            id="admin-tab-deposits"
            onClick={() => setActiveTab('deposits')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'deposits'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'deposits' ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' } : undefined}
          >
            <Wallet className="w-4 h-4" />
            <span>Deposit Approvals</span>
            {deposits.filter(d => d.status === 'pending').length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-amber-400 text-slate-950 font-black rounded-full">
                {deposits.filter(d => d.status === 'pending').length}
              </span>
            )}
          </button>

          {/* Tab: Deposit QR (Right next to Deposit Approvals) */}
          <button
            id="admin-tab-deposit-qr"
            type="button"
            onClick={handleSelectQrTab}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'deposit_qr'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'deposit_qr' ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' } : undefined}
          >
            <QrCode className="w-4 h-4" />
            <span>Deposit QR</span>
          </button>

          {/* Tab: Withdrawal Approvals (Placed directly to the right of Deposit QR) */}
          <button
            id="admin-tab-withdrawals"
            type="button"
            onClick={() => {
              soundFx.playClick();
              setActiveTab('withdrawals');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'withdrawals'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'withdrawals' ? { background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)' } : undefined}
          >
            <Building className="w-4 h-4" />
            <span>Withdrawal Approvals</span>
            {withdrawalsList.filter(w => w.status === 'pending').length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-amber-400 text-slate-950 font-black rounded-full">
                {withdrawalsList.filter(w => w.status === 'pending').length}
              </span>
            )}
          </button>

          {/* Tab 5: Winner Payout Ledger */}
          <button
            id="admin-tab-payouts"
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'payouts'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Winner Payout Ledger</span>
          </button>

          {/* Tab 6: Security & Anti-Cheat Logs */}
          <button
            id="admin-tab-security"
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Security & Anti-Cheat Logs</span>
            {securityLogsList.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-rose-500 text-white font-bold rounded-full">
                {securityLogsList.length}
              </span>
            )}
          </button>

          {/* Tab: Customer Support Dashboard */}
          <button
            id="admin-tab-support"
            type="button"
            onClick={() => {
              soundFx.playClick();
              setActiveTab('support');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'support'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={activeTab === 'support' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
          >
            <Headphones className="w-4 h-4" />
            <span>Customer Support</span>
            {supportTickets.filter(t => t.status === 'Open').length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-amber-400 text-slate-950 font-black rounded-full">
                {supportTickets.filter(t => t.status === 'Open').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. MAIN FULL-SCREEN PAGE CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* ========================================================= */}
        {/* TAB 1: CONTESTS & AUTO-PILOT                             */}
        {/* ========================================================= */}
        {activeTab === 'contests' && (
          <div className="space-y-8">
            <ContestManagerTab
              questions={questions}
              onUpdateQuestions={onUpdateQuestions}
              todayPrize={todayPrize}
              onUpdatePrize={onUpdatePrize}
              poolData={poolData}
              onUpdatePoolData={onUpdatePoolData}
              userProfile={userProfile}
              onShowToast={showToast}
              onSwitchToAddQuestions={() => setActiveTab('questions')}
              activeContest={activeContest}
              onUpdateActiveContest={onUpdateActiveContest}
              contests={contests}
              onUpdateContests={onUpdateContests}
              onDeleteContest={onDeleteContest}
              realParticipantsCount={realParticipantsCount}
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* REGISTERED USERS MANAGEMENT BOX (Visible on 'users' AND 'contests' tabs) */}
        {/* ========================================================= */}
        {(activeTab === 'users' || activeTab === 'contests') && (
          <div
            id="admin-registered-users-box"
            className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      Registered Users
                    </h3>
                  </div>
                </div>
              </div>

              {/* Search & Date Preset Filter Controls (Compact & Contained) */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end max-w-full box-border overflow-hidden">
                {/* Date Filter Dropdown Selector with Preset Options & Custom Time Modal Trigger */}
                <div
                  className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 max-w-full overflow-hidden shrink-0 box-border"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <select
                    id="admin-users-date-preset-select"
                    value={userDatePreset}
                    onChange={(e) => {
                      const val = e.target.value as typeof userDatePreset;
                      soundFx.playClick();
                      setUserDatePreset(val);
                      if (val === 'custom_time') {
                        setIsCustomDateModalOpen(true);
                      } else {
                        setUserStartDate('');
                        setUserEndDate('');
                      }
                    }}
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input py-0.5 px-1 text-[11px] font-semibold text-slate-700 bg-white outline-none cursor-pointer"
                    aria-label="Filter users by registration date"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7_days_ago">7 Days Ago</option>
                    <option value="1_month_ago">1 Month Ago</option>
                    <option value="6_months_ago">6 Months Ago</option>
                    <option value="1_year_ago">1 Year Ago</option>
                    <option value="custom_time">Custom Time</option>
                  </select>

                  {userDatePreset === 'custom_time' && (
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setIsCustomDateModalOpen(true);
                      }}
                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white cursor-pointer shrink-0 shadow-2xs"
                      title="Edit Custom Date Range"
                    >
                      {userStartDate || userEndDate
                        ? `${userStartDate || '...'} to ${userEndDate || '...'}`
                        : 'Pick Dates'}
                    </button>
                  )}

                  {userDatePreset !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setUserDatePreset('all');
                        setUserStartDate('');
                        setUserEndDate('');
                      }}
                      className="ml-0.5 px-1 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Compact Search Bar */}
                <div className="relative w-28 sm:w-36 max-w-full min-w-0 shrink-0 box-border overflow-hidden">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full min-w-0 box-border pl-6 pr-2 py-1 rounded-xl border border-slate-200 text-[11px] bg-white focus:bg-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Custom Date Range Selector Modal / Picker */}
            {isCustomDateModalOpen && (
              <div
                id="admin-custom-date-range-modal"
                className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                onClick={() => setIsCustomDateModalOpen(false)}
              >
                <div
                  className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
                  style={{ backgroundColor: '#FFFFFF' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="px-5 py-3.5 text-white flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <h4 className="text-sm font-black tracking-tight">Custom Time Range</h4>
                    <button
                      type="button"
                      onClick={() => setIsCustomDateModalOpen(false)}
                      className="text-white/90 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-5 space-y-4 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="admin-users-start-date-filter" className="block text-[11px] font-bold text-slate-700 cursor-pointer">
                          From Date
                        </label>
                        <input
                          id="admin-users-start-date-filter"
                          type="date"
                          value={userStartDate}
                          onChange={(e) => setUserStartDate(e.target.value)}
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              if (typeof (e.currentTarget as any).showPicker === 'function') {
                                (e.currentTarget as any).showPicker();
                              }
                            } catch {}
                          }}
                          style={{ backgroundColor: '#FFFFFF' }}
                          className="pure-white-input w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-semibold text-slate-800 bg-white outline-none focus:border-blue-500 cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-users-end-date-filter" className="block text-[11px] font-bold text-slate-700 cursor-pointer">
                          To Date
                        </label>
                        <input
                          id="admin-users-end-date-filter"
                          type="date"
                          value={userEndDate}
                          onChange={(e) => setUserEndDate(e.target.value)}
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              if (typeof (e.currentTarget as any).showPicker === 'function') {
                                (e.currentTarget as any).showPicker();
                              }
                            } catch {}
                          }}
                          style={{ backgroundColor: '#FFFFFF' }}
                          className="pure-white-input w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-semibold text-slate-800 bg-white outline-none focus:border-blue-500 cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          setUserStartDate('');
                          setUserEndDate('');
                          setUserDatePreset('all');
                          setIsCustomDateModalOpen(false);
                        }}
                        style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 cursor-pointer"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          setIsCustomDateModalOpen(false);
                        }}
                        style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 cursor-pointer"
                      >
                        Apply Filter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Registered Users Table (Sleek, Concise & Professional - Real-Time Data Only) */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
              <table className="w-full text-left text-xs border-collapse bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                <thead className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                  <tr className="bg-white border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider" style={{ backgroundColor: '#FFFFFF' }}>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Avatar &amp; Full Name</th>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Mobile Number</th>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Email Address</th>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Password Status</th>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Registration Date</th>
                    <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Balance</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                  {(() => {
                    const getOffsetDateStr = (daysOffset = 0, monthsOffset = 0, yearsOffset = 0): string => {
                      const d = new Date();
                      if (yearsOffset !== 0) d.setFullYear(d.getFullYear() + yearsOffset);
                      if (monthsOffset !== 0) d.setMonth(d.getMonth() + monthsOffset);
                      if (daysOffset !== 0) d.setDate(d.getDate() + daysOffset);
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      return `${yyyy}-${mm}-${dd}`;
                    };

                    const todayLocalStr = getOffsetDateStr(0);
                    const todayIsoStr = new Date().toISOString().split('T')[0];
                    const maxTodayStr = todayLocalStr > todayIsoStr ? todayLocalStr : todayIsoStr;

                    const filteredRealUsers = registeredUsersList.filter((u, idx) => {
                      if (!u || u.isDeleted || isDemoSeedUser(u)) return false;
                      const regDateOnly = normalizeRegistrationTimestamp(u.registrationDate);

                      if (userDatePreset === 'today') {
                        if (regDateOnly !== todayLocalStr && regDateOnly !== todayIsoStr) return false;
                      } else if (userDatePreset === 'yesterday') {
                        const yestLocal = getOffsetDateStr(-1);
                        const yestIso = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                        if (regDateOnly !== yestLocal && regDateOnly !== yestIso) return false;
                      } else if (userDatePreset === '7_days_ago') {
                        const cutoff = getOffsetDateStr(-7);
                        if (regDateOnly < cutoff || regDateOnly > maxTodayStr) return false;
                      } else if (userDatePreset === '1_month_ago') {
                        const cutoff = getOffsetDateStr(0, -1);
                        if (regDateOnly < cutoff || regDateOnly > maxTodayStr) return false;
                      } else if (userDatePreset === '6_months_ago') {
                        const cutoff = getOffsetDateStr(0, -6);
                        if (regDateOnly < cutoff || regDateOnly > maxTodayStr) return false;
                      } else if (userDatePreset === '1_year_ago') {
                        const cutoff = getOffsetDateStr(0, 0, -1);
                        if (regDateOnly < cutoff || regDateOnly > maxTodayStr) return false;
                      } else if (userDatePreset === 'custom_time') {
                        if (userStartDate && regDateOnly < userStartDate) return false;
                        if (userEndDate && regDateOnly > userEndDate) return false;
                      }

                      if (!userSearchQuery.trim()) return true;
                      const q = userSearchQuery.toLowerCase();
                      const seqId = (u.id || `QK-USR-${1001 + idx}`).toLowerCase();
                      return (
                        (u.name || '').toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.mobile || '').toLowerCase().includes(q) ||
                        (u.id || '').toLowerCase().includes(q) ||
                        seqId.includes(q)
                      );
                    });

                    if (filteredRealUsers.length === 0) {
                      return (
                        <tr className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                          <td colSpan={7} className="py-6 px-4 text-center text-xs font-medium text-slate-400 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            No registered users found.
                          </td>
                        </tr>
                      );
                    }

                    return filteredRealUsers.map((u, idx) => {
                      const isActiveCurrentUser = isUserSessionActive(u);
                      const cleanPasswordText = normalizePlainPassword(u.passwordStatus);
                      const dateOnlyRegTimestamp = normalizeRegistrationTimestamp(u.registrationDate);
                      const sequentialRegId = u.id || `QK-USR-${1001 + idx}`;

                      return (
                        <tr
                          key={`${u.id || 'usr'}_${u.email || 'email'}_${idx}`}
                          className="bg-white hover:bg-white transition-colors"
                          style={{ backgroundColor: '#FFFFFF' }}
                        >
                          {/* Avatar & Full Name (Sleek & Concise) */}
                          <td className="py-2.5 px-3.5 bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            <div className="flex items-center gap-2.5 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                              <div
                                className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center text-white font-bold text-xs"
                                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                              >
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{u.name ? u.name.charAt(0).toUpperCase() : 'U'}</span>
                                )}
                              </div>
                              <div className="leading-tight">
                                <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                                  <span>{u.name}</span>
                                  {isActiveCurrentUser && !u.isBlocked && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-wide"
                                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                                    >
                                      ACTIVE
                                    </span>
                                  )}
                                  {u.isBlocked && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-black uppercase">
                                      BLOCKED
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  ID: {sequentialRegId}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Mobile Number (Sleek & Concise) */}
                          <td className="py-2.5 px-3.5 font-mono text-xs font-medium text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {u.countryCode || '+91'} {u.mobile || '9876543210'}
                          </td>

                          {/* Email Address */}
                          <td className="py-2.5 px-3.5 text-xs font-normal text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {u.email || 'player@quizkart.in'}
                          </td>

                          {/* Password Status */}
                          <td className="py-2.5 px-3.5 bg-white font-mono text-xs font-medium text-slate-800 whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            {cleanPasswordText}
                          </td>

                          {/* Registration Date */}
                          <td className="py-2.5 px-3.5 font-mono text-xs text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {dateOnlyRegTimestamp}
                          </td>

                          {/* Wallet Balance */}
                          <td className="py-2.5 px-3.5 bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            <span className="font-bold text-xs sm:text-sm text-emerald-600">
                              ₹{Number(u.walletBalance || 0).toLocaleString('en-IN')}
                            </span>
                          </td>

                          {/* Block / Unblock Action Button */}
                          <td className="py-2.5 px-3.5 text-right bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleBlockUser(u)}
                              className="px-3.5 py-1.5 rounded-xl font-bold text-xs text-white shadow-xs transition-all cursor-pointer inline-flex items-center justify-center active:scale-95 hover:opacity-95"
                              style={
                                u.isBlocked
                                  ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' }
                                  : { backgroundColor: '#DC2626', color: '#FFFFFF' }
                              }
                            >
                              {u.isBlocked ? (
                                <span>Unblock User</span>
                              ) : (
                                <span>Block User</span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* DELETED USERS PERMANENT ARCHIVE SECTION */}
            <div
              id="admin-deleted-users-section"
              className="pt-4 border-t border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <UserX className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900">
                    Deleted Users
                  </h4>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-800 border border-slate-200">
                  {deletedUsersList.length}
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                <table className="w-full text-left text-xs border-collapse bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                  <thead className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <tr className="bg-white border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider" style={{ backgroundColor: '#FFFFFF' }}>
                      <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Avatar &amp; Full Name</th>
                      <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Mobile Number</th>
                      <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Email Address</th>
                      <th className="py-2.5 px-3.5 font-semibold bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Deleted Date</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    {deletedUsersList.length === 0 ? (
                      <tr className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                        <td colSpan={5} className="py-5 px-4 text-center text-xs font-medium text-slate-400 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                          No self-deleted user accounts recorded yet.
                        </td>
                      </tr>
                    ) : (
                      deletedUsersList.map((du, dIdx) => (
                        <tr key={`${du.id || du.email}_${dIdx}`} className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                          <td className="py-2.5 px-3.5 bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            <div className="flex items-center gap-2.5 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                              <div
                                className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center text-white font-bold text-xs"
                                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                              >
                                {du.avatarUrl ? (
                                  <img src={du.avatarUrl} alt={du.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{du.name ? du.name.charAt(0).toUpperCase() : 'D'}</span>
                                )}
                              </div>
                              <div className="leading-tight">
                                <div className="font-semibold text-slate-900 text-xs">{du.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  ID: {du.id || `QK-USR-${1001 + dIdx}`}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-xs font-medium text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {du.countryCode || '+91'} {du.mobile}
                          </td>
                          <td className="py-2.5 px-3.5 text-xs font-normal text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {du.email}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-xs text-slate-700 whitespace-nowrap bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            {du.deletedAt || new Date().toISOString().split('T')[0]}
                          </td>
                          <td className="py-2.5 px-3.5 text-right bg-white whitespace-nowrap" style={{ backgroundColor: '#FFFFFF' }}>
                            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                              Self-Deleted (30d Lock)
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        
        {/* ========================================================= */}
        {/* TAB 1: QUESTION BUILDER (MANUAL FORM + AI BULK IMPORTER)   */}
        {/* ========================================================= */}
        {activeTab === 'questions' && (
          <div className="space-y-8">
            {/* Mode Switcher Banner: Add Manually vs Bulk AI Importer */}
            <div className="bg-white rounded-2xl border border-[#EAECF0] p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-900">Question Library</h2>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setBuilderMode('form')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                    builderMode === 'form'
                      ? 'text-white'
                      : 'text-slate-900 bg-white hover:bg-slate-50 border border-[#EAECF0]'
                  }`}
                  style={builderMode === 'form' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : { backgroundColor: '#FFFFFF' }}
                >
                  <span>Add Manually</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderMode('ai_bulk')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                    builderMode === 'ai_bulk'
                      ? 'text-white'
                      : 'text-slate-900 bg-white hover:bg-slate-50 border border-[#EAECF0]'
                  }`}
                  style={builderMode === 'ai_bulk' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : { backgroundColor: '#FFFFFF' }}
                >
                  <span>Bulk AI Importer</span>
                </button>
              </div>
            </div>

            {/* SUB-VIEW A: BULK AI IMPORTER */}
            {builderMode === 'ai_bulk' && (
              <div className="bg-white rounded-3xl border border-[#EAECF0] p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#EAECF0]">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Bulk AI Importer</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPromptTemplate}
                      title={copiedPromptSuccess ? 'Prompt Copied!' : 'Copy AI Prompt'}
                      aria-label="Copy AI Prompt"
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-xs transition-all cursor-pointer active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' }}
                    >
                      {copiedPromptSuccess ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </div>

                {/* DYNAMIC AI PROMPT TEMPLATE BOX (Pure White Card #FFFFFF) */}
                <div 
                  className="rounded-2xl border border-[#EAECF0] p-4 sm:p-5 shadow-xs space-y-3 bg-white"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-800">Target Question Count:</span>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={50000}
                        value={aiPromptQuestionCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setAiPromptQuestionCount(isNaN(val) || val <= 0 ? 10 : val);
                        }}
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-[#EAECF0] text-xs font-bold text-slate-900 text-center focus:outline-none focus:border-[#4A7DF3] bg-white shadow-2xs"
                        title="Enter custom question count (e.g. 10, 100, 1000)"
                      />
                      <button
                        type="button"
                        onClick={handleCopyPromptTemplate}
                        className="px-3.5 py-1.5 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                      >
                        {copiedPromptSuccess ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                        <span>{copiedPromptSuccess ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Clean, ready-to-copy AI Prompt Template */}
                  <pre 
                    className="p-4 rounded-xl border border-[#EAECF0] text-[11px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto selection:bg-blue-100 bg-white"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    {getDynamicPromptText(aiPromptQuestionCount)}
                  </pre>
                </div>

                {/* Clean Textarea Input without top label, without indicator, without placeholder */}
                <div>
                  <textarea
                    rows={10}
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    className="w-full p-4 rounded-2xl border border-[#EAECF0] focus:outline-none focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20 text-xs font-mono bg-white text-slate-900 leading-relaxed shadow-2xs"
                  />
                </div>

                {/* Actions: Bold Validate Questions Button (NO Gemini icon) */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleParseBulkInput}
                    className="px-6 py-3 rounded-xl text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <span>Validate Questions</span>
                  </button>
                  {bulkInputText && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkInputText('');
                        setBulkParsedResults([]);
                        setBulkJsonError(null);
                        setHasParsedBulk(false);
                      }}
                      className="px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 text-xs font-bold border border-[#EAECF0] bg-white hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      Clear Text
                    </button>
                  )}
                </div>

                {/* Intermediate review cards removed per directive - direct single-click import to table */}
                {false && (
                  <div className="mt-8 pt-8 border-t border-slate-200 space-y-6">
                    {/* Validation Summary Header Bar */}
                    <div className="p-4 rounded-2xl bg-white border border-[#EAECF0] shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[#20A5AC]" />
                            <span>Validation Summary</span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Real-time validation against QuizKart schema and rules
                          </p>
                        </div>

                        {/* Safe Import Action Buttons */}
                        {bulkParsedResults.filter(p => p.isValid).length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveBulkQuestions('replace')}
                              className="px-4 py-2.5 rounded-xl bg-[#D14343] hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                            >
                              Replace Pool ({bulkParsedResults.filter(p => p.isValid).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveBulkQuestions('append')}
                              className="px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                            >
                              Append to Pool (+{bulkParsedResults.filter(p => p.isValid).length})
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Summary Metrics & Filter Tabs */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#EAECF0]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setBulkFilterTab('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              bulkFilterTab === 'all' 
                                ? 'text-white' 
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                            style={bulkFilterTab === 'all' ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : {}}
                          >
                            All ({bulkParsedResults.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkFilterTab('valid')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              bulkFilterTab === 'valid'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            Valid ({bulkParsedResults.filter(p => p.isValid).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkFilterTab('invalid')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              bulkFilterTab === 'invalid'
                                ? 'bg-[#D14343] text-white'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                            }`}
                          >
                            Invalid ({bulkParsedResults.filter(p => !p.isValid).length})
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-500 font-medium">
                          {bulkParsedResults.filter(p => p.isValid).length === bulkParsedResults.length ? (
                            <span className="text-emerald-600 font-bold">All questions ready for import</span>
                          ) : (
                            <span>{bulkParsedResults.filter(p => !p.isValid).length} question(s) require review</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Question Cards Preview */}
                    <div className="grid grid-cols-1 gap-4 max-h-[550px] overflow-y-auto pr-1">
                      {bulkParsedResults
                        .filter(q => {
                          if (bulkFilterTab === 'valid') return q.isValid;
                          if (bulkFilterTab === 'invalid') return !q.isValid;
                          return true;
                        })
                        .map((q, idx) => (
                        <div 
                          key={q.id || idx}
                          className={`p-4 rounded-2xl border bg-white space-y-3 transition-all ${
                            q.isValid ? 'border-[#EAECF0] hover:border-indigo-200' : 'border-red-300 bg-red-50/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                q.isValid ? 'bg-slate-100 text-slate-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {idx + 1}
                              </span>
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 leading-snug">{q.question || <span className="text-red-500 italic">Empty Question Text</span>}</h5>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[10px] font-semibold text-slate-800">
                                    Subject: {q.subject || q.category || 'None'}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[10px] font-semibold text-slate-600">
                                    Difficulty: {q.difficulty || 'None'}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  {q.isValid ? (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      Valid
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 text-red-600" />
                                      Invalid ({q.validationErrors?.length || 1} error{(q.validationErrors?.length || 1) > 1 ? 's' : ''})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Specific Field Errors Display */}
                          {!q.isValid && q.validationErrors && q.validationErrors.length > 0 && (
                            <div className="p-3 rounded-xl bg-red-50/80 border border-red-200 space-y-1.5 text-[11px]">
                              <p className="font-bold text-red-900 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                <span>Validation Issues (Field Specific):</span>
                              </p>
                              <div className="space-y-1 pl-1">
                                {q.validationErrors.map((err, errIdx) => (
                                  <div key={errIdx} className="flex items-start gap-1.5 text-red-700">
                                    <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-red-200/80 text-red-900 shrink-0">
                                      {err.field}
                                    </span>
                                    <span>{err.message}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Options pills */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {q.options.map((opt, optIdx) => {
                              const isCorrect = optIdx === q.correctIndex;
                              const letter = ['A', 'B', 'C', 'D'][optIdx];
                              return (
                                <div 
                                  key={optIdx}
                                  className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 border transition-all ${
                                    isCorrect 
                                      ? 'bg-emerald-50 border-emerald-300 text-[#15803d] font-bold' 
                                      : 'bg-white border-[#EAECF0] text-slate-700'
                                  }`}
                                >
                                  <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                                    isCorrect ? 'bg-[#15803d] text-white' : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {letter}
                                  </span>
                                  <span className="truncate">{opt || <span className="text-red-400 italic">Empty</span>}</span>
                                  {isCorrect && <Check className="w-3.5 h-3.5 text-[#15803d] ml-auto shrink-0" />}
                                </div>
                              );
                            })}
                          </div>

                          {/* Explanation */}
                          {q.explanation ? (
                            <p className="text-[11px] text-slate-600 italic bg-[#F8FAFC] p-2.5 rounded-xl border border-[#EAECF0]">
                              <span className="font-semibold text-slate-800 not-italic">Explanation:</span> {q.explanation}
                            </p>
                          ) : (
                            <p className="text-[11px] text-red-600 italic bg-red-50/50 p-2 rounded-xl border border-red-200">
                              <span className="font-semibold text-red-800 not-italic">Explanation:</span> Missing explanation
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUB-VIEW B: SINGLE QUESTION MANUAL FORM */}
            {builderMode === 'form' && (
              <form 
                id="manual-question-form"
                noValidate
                onSubmit={handleSaveQuestion} 
                className="bg-white rounded-3xl border border-[#EAECF0] p-6 sm:p-8 shadow-sm space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EAECF0]">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>{editingId !== null ? `Edit Question #${editingId}` : 'Add Question'}</span>
                      {editingId !== null && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                          Editing Mode
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {editingId !== null 
                        ? `Update the details below. Saving will update Question #${editingId} in the library.`
                        : 'Define the question text, four choices, correct answer, subject, difficulty, and explanation.'}
                    </p>
                  </div>
                  {editingId !== null && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-[#EAECF0] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                {/* Form-Level Validation Error Alert */}
                {Object.keys(formErrors).length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5 shadow-xs animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-800">Please correct the following errors before saving:</p>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-red-700">
                        {Object.entries(formErrors).map(([key, msg]) => (
                          <li key={key}>{msg}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Question Text */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Question Text <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Clear question stem</span>
                  </div>
                  <textarea
                    rows={2}
                    value={qText}
                    onChange={(e) => {
                      setQText(e.target.value);
                      if (formErrors.qText) setFormErrors(prev => ({ ...prev, qText: '' }));
                    }}
                    placeholder="e.g. Which layer of the Earth's atmosphere contains the Ozone Layer?"
                    className={`w-full px-4 py-3 rounded-2xl border text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all ${
                      formErrors.qText 
                        ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-red-50/20' 
                        : 'border-[#EAECF0] focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20'
                    }`}
                  />
                  {formErrors.qText && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      {formErrors.qText}
                    </p>
                  )}
                </div>

                {/* 4 Choices: A, B, C, D */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Answer Choices <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Provide 4 options and mark which one is the correct answer
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { letter: 'A', label: 'Option A', val: qOptionA, setter: setQOptionA, idx: 0, errKey: 'qOptionA' },
                      { letter: 'B', label: 'Option B', val: qOptionB, setter: setQOptionB, idx: 1, errKey: 'qOptionB' },
                      { letter: 'C', label: 'Option C', val: qOptionC, setter: setQOptionC, idx: 2, errKey: 'qOptionC' },
                      { letter: 'D', label: 'Option D', val: qOptionD, setter: setQOptionD, idx: 3, errKey: 'qOptionD' }
                    ].map((opt) => {
                      const isCorrect = qCorrectIdx === opt.idx;
                      const hasErr = Boolean(formErrors[opt.errKey]);

                      return (
                        <div 
                          key={opt.idx}
                          className={`p-4 rounded-2xl border transition-all ${
                            isCorrect 
                              ? 'border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-300 shadow-xs' 
                              : hasErr
                                ? 'border-red-300 bg-red-50/10'
                                : 'border-[#EAECF0] bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                isCorrect 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {opt.letter}
                              </span>
                              <label className="text-xs font-bold text-slate-900">{opt.label}</label>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setQCorrectIdx(opt.idx);
                                if (formErrors.qCorrect) {
                                  setFormErrors(prev => ({ ...prev, qCorrect: '' }));
                                }
                              }}
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                              title={`Set Option ${opt.letter} as the correct answer`}
                            >
                              {isCorrect ? (
                                <>
                                  <Check className="w-3 h-3 text-white" />
                                  <span>✓ Correct Answer</span>
                                </>
                              ) : (
                                <span>Select Correct</span>
                              )}
                            </button>
                          </div>

                          <input
                            type="text"
                            value={opt.val}
                            onChange={(e) => {
                              opt.setter(e.target.value);
                              if (formErrors[opt.errKey]) {
                                setFormErrors(prev => ({ ...prev, [opt.errKey]: '' }));
                              }
                              if (formErrors.qCorrect && isCorrect) {
                                setFormErrors(prev => ({ ...prev, qCorrect: '' }));
                              }
                            }}
                            placeholder={`Enter ${opt.label} text...`}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all ${
                              hasErr 
                                ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-red-50/20' 
                                : 'border-[#EAECF0] focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20'
                            }`}
                          />
                          {hasErr && (
                            <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                              {formErrors[opt.errKey]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Correct Answer Selection Bar */}
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#EAECF0] space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        Correct Answer Selection <span className="text-red-500">*</span>
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Choose the designated correct choice. The answer text matches the selected option.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => {
                        const isSelected = qCorrectIdx === idx;
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => {
                              setQCorrectIdx(idx);
                              if (formErrors.qCorrect) {
                                setFormErrors(prev => ({ ...prev, qCorrect: '' }));
                              }
                            }}
                            className={`w-9 h-9 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-xs scale-105'
                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-[#EAECF0]'
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-xs text-[#15803d] font-semibold flex items-center gap-2 pt-1 border-t border-[#EAECF0]">
                    <span className="w-5 h-5 rounded-md bg-emerald-100 text-[#15803d] flex items-center justify-center text-[10px] font-black shrink-0">
                      {['A', 'B', 'C', 'D'][qCorrectIdx]}
                    </span>
                    <span className="truncate">
                      Selected: Option {['A', 'B', 'C', 'D'][qCorrectIdx]} —{' '}
                      <span className="font-bold">
                        {[qOptionA, qOptionB, qOptionC, qOptionD][qCorrectIdx].trim() || '(Option is currently blank)'}
                      </span>
                    </span>
                  </div>

                  {formErrors.qCorrect && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      {formErrors.qCorrect}
                    </p>
                  )}
                </div>

                {/* Metadata Row: Subject, Difficulty, Explanation */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wider">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={qCategory}
                      onChange={(e) => {
                        setQCategory(e.target.value);
                        if (formErrors.qCategory) setFormErrors(prev => ({ ...prev, qCategory: '' }));
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 bg-white cursor-pointer focus:outline-none transition-all ${
                        formErrors.qCategory
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-red-50/20'
                          : 'border-[#EAECF0] focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20'
                      }`}
                    >
                      <option value="">Select Subject...</option>
                      <option value="Reasoning">Reasoning</option>
                      <option value="Hindi">Hindi</option>
                      <option value="English">English</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="General Knowledge">General Knowledge</option>
                      <option value="General Science">General Science</option>
                    </select>
                    {formErrors.qCategory && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                        {formErrors.qCategory}
                      </p>
                    )}
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wider">
                      Difficulty <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={qDifficulty}
                      onChange={(e) => {
                        setQDifficulty(e.target.value);
                        if (formErrors.qDifficulty) setFormErrors(prev => ({ ...prev, qDifficulty: '' }));
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 bg-white cursor-pointer focus:outline-none transition-all ${
                        formErrors.qDifficulty
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-red-50/20'
                          : 'border-[#EAECF0] focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20'
                      }`}
                    >
                      <option value="">Select Difficulty...</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                      <option value="Expert">Expert</option>
                    </select>
                    {formErrors.qDifficulty && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                        {formErrors.qDifficulty}
                      </p>
                    )}
                  </div>

                  {/* Explanation */}
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wider">
                      Explanation <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={qExplanation}
                      onChange={(e) => {
                        setQExplanation(e.target.value);
                        if (formErrors.qExplanation) setFormErrors(prev => ({ ...prev, qExplanation: '' }));
                      }}
                      placeholder="e.g. Detailed step-by-step solution..."
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all ${
                        formErrors.qExplanation
                          ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-red-50/20'
                          : 'border-[#EAECF0] focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20'
                      }`}
                    />
                    {formErrors.qExplanation && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                        {formErrors.qExplanation}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EAECF0]">
                  {editingId !== null && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSavingQuestion}
                      className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-[#EAECF0] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      Cancel Edit
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingQuestion}
                    className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    {isSavingQuestion ? (
                      <>
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                        <span>{editingId !== null ? 'Updating Question...' : 'Saving Question...'}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-white" />
                        <span>{editingId !== null ? 'Update Question' : 'Save Question'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Question Library CMS */}
            <div className="bg-white rounded-3xl border border-[#EAECF0] p-6 shadow-sm space-y-4">
              {/* Header, Search Bar & Prominent Red 'Delete Selected' Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#EAECF0]">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Question Library
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  {/* Prominent Red Button "Delete Selected" activates when checkboxes are checked */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteSelectedQuestions();
                    }}
                    disabled={selectedQuestionIds.length === 0}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-xs ${
                      selectedQuestionIds.length > 0
                        ? 'bg-[#D14343] hover:bg-red-700 text-white cursor-pointer active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-[#EAECF0]'
                    }`}
                    title={selectedQuestionIds.length > 0 ? `Delete ${selectedQuestionIds.length} selected question(s)` : 'Select questions with checkboxes below to delete'}
                  >
                    Delete Selected{selectedQuestionIds.length > 0 ? ` (${selectedQuestionIds.length})` : ''}
                  </button>

                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={questionSearch}
                      onChange={(e) => {
                        setQuestionSearch(e.target.value);
                        setQuestionPage(1);
                      }}
                      placeholder="Search Question Library..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EAECF0] text-xs sm:text-sm focus:outline-none focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20 bg-white text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Clean Question Library Table with Strictly Pure White Headers */}
              <div className="overflow-x-auto rounded-2xl border border-[#EAECF0] bg-white">
                <table className="w-full text-left text-xs border-collapse bg-white">
                  <thead className="bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                    <tr className="bg-white border-b border-[#EAECF0]" style={{ backgroundColor: '#FFFFFF' }}>
                      {/* Square Select All Checkbox */}
                      <th className="py-3.5 px-3.5 w-10 text-center bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                        <input
                          type="checkbox"
                          checked={paginatedQuestions.length > 0 && paginatedQuestions.every(q => selectedQuestionIds.includes(Number(q.id)))}
                          onChange={() => {
                            const pageIds = paginatedQuestions.map(q => Number(q.id));
                            const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedQuestionIds.includes(id));
                            if (allPageSelected) {
                              setSelectedQuestionIds(prev => prev.filter(id => !pageIds.includes(id)));
                            } else {
                              setSelectedQuestionIds(prev => Array.from(new Set([...prev, ...pageIds])));
                            }
                          }}
                          className="w-4 h-4 rounded text-[#4A7DF3] focus:ring-[#4A7DF3] border-[#EAECF0] cursor-pointer accent-[#4A7DF3] align-middle"
                          title="Select / deselect all visible on this page"
                        />
                      </th>
                      <th className="py-3.5 px-4 font-bold w-28 bg-white text-slate-900 text-xs" style={{ backgroundColor: '#FFFFFF', color: '#000000' }}>
                        Subject
                      </th>
                      <th className="py-3.5 px-4 font-bold bg-white text-slate-900 text-xs" style={{ backgroundColor: '#FFFFFF', color: '#000000' }}>
                        Question
                      </th>
                      <th className="py-3.5 px-4 font-bold w-64 bg-white text-slate-900 text-xs" style={{ backgroundColor: '#FFFFFF', color: '#000000' }}>
                        Correct Answer
                      </th>
                      <th className="py-3.5 px-4 font-bold w-28 bg-white text-slate-900 text-xs" style={{ backgroundColor: '#FFFFFF', color: '#000000' }}>
                        Difficulty
                      </th>
                      <th className="py-3.5 px-4 font-bold text-right w-24 bg-white text-slate-900 text-xs" style={{ backgroundColor: '#FFFFFF', color: '#000000' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAECF0] bg-white">
                    {/* Masked User ID Bar: Top-left of each 10-question block just below table header */}
                    {paginatedQuestions.length > 0 && (() => {
                      const blockNumber = safeQuestionPage;
                      const assignedUserId = getBlockAssignedUserId(blockNumber, paginatedQuestions, registeredUsersList);
                      const isUnmasked = unmaskedBlockIds.includes(blockNumber);

                      return (
                        <tr className="bg-white border-b border-[#EAECF0]" style={{ backgroundColor: '#FFFFFF' }}>
                          <td colSpan={6} className="py-2 px-4 text-left bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                            <div className="flex items-center justify-between bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-700">
                                  User ID:
                                </span>
                                {isUnmasked ? (
                                  <div className="flex items-center gap-2">
                                    <span 
                                      className="font-bold text-xs tracking-wider font-mono inline-block"
                                      style={{ 
                                        background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        color: '#3A81F5'
                                      }}
                                    >
                                      {assignedUserId}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setUnmaskedBlockIds(prev => prev.filter(b => b !== blockNumber))}
                                      className="text-[9px] font-medium text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50/80 hover:bg-slate-100 shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95 leading-none"
                                      title="Hide / re-mask ID"
                                    >
                                      (Hide / Re-mask)
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPasscodeModalBlock({ blockNumber, userId: assignedUserId });
                                      setPasscodeInput('');
                                      setPasscodeError('');
                                    }}
                                    className="font-bold text-sm tracking-widest hover:opacity-80 transition-opacity cursor-pointer font-mono inline-flex items-center"
                                    style={{ 
                                      background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                                      WebkitBackgroundClip: 'text',
                                      WebkitTextFillColor: 'transparent',
                                      color: '#3A81F5'
                                    }}
                                    title="Click to enter passcode and unmask ID"
                                  >
                                    <span>********</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}

                    {paginatedQuestions.length === 0 ? (
                      <tr className="bg-white">
                        <td colSpan={6} className="py-10 text-center text-slate-400 text-xs bg-white">
                          No questions matching the search query.
                        </td>
                      </tr>
                    ) : (
                      paginatedQuestions.map((q) => {
                        const normCat = normalizeCategory(q.category);
                        const isSelected = selectedQuestionIds.includes(Number(q.id));
                        const correctLetter = q.correctKey || ['A', 'B', 'C', 'D'][q.correctIndex] || 'A';
                        const rawOptionText = q.options ? q.options[q.correctIndex != null && q.correctIndex >= 0 ? q.correctIndex : Math.max(0, ['A', 'B', 'C', 'D'].indexOf(correctLetter))] : '';
                        const cleanOptionText = (rawOptionText || '').replace(/^[A-Da-d][).:\s-]+/, '').trim();
                        const fullAnswerString = `${correctLetter}) ${cleanOptionText || rawOptionText}`;

                        return (
                          <tr 
                            key={q.id} 
                            className={`transition-colors ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50/70' : 'bg-white hover:bg-slate-50/70'}`}
                            style={{ backgroundColor: isSelected ? undefined : '#FFFFFF' }}
                          >
                            {/* Far left square selection checkbox */}
                            <td className="py-3.5 px-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectQuestion(Number(q.id))}
                                className="w-4 h-4 rounded text-[#4A7DF3] focus:ring-[#4A7DF3] border-[#EAECF0] cursor-pointer accent-[#4A7DF3] align-middle"
                                title={`Select question #${q.id}`}
                              />
                            </td>

                            {/* Subject tag: Styled in primary website brand gradient */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span 
                                className="font-bold text-xs uppercase tracking-wider inline-block"
                                style={{ 
                                  background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent'
                                }}
                              >
                                {normCat}
                              </span>
                            </td>

                            {/* Question Stem: Clean dark text with neat truncation and 'more...' */}
                            <td className="py-3.5 px-4 max-w-md">
                              {(() => {
                                const stemText = q.stem || q.question || '';
                                const isLong = stemText.length > 85;
                                const isExpanded = expandedQuestionIds.includes(Number(q.id));
                                const displayText = isLong && !isExpanded ? `${stemText.slice(0, 85).trim()}...` : stemText;
                                return (
                                  <div className="font-medium text-xs leading-relaxed text-slate-900 break-words" title={stemText}>
                                    <span>{displayText}</span>
                                    {isLong && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedQuestionIds(prev => 
                                            isExpanded ? prev.filter(id => id !== Number(q.id)) : [...prev, Number(q.id)]
                                          );
                                        }}
                                        className="font-bold ml-1 cursor-pointer hover:opacity-80 inline-block align-baseline"
                                        style={{ 
                                          background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                                          WebkitBackgroundClip: 'text',
                                          WebkitTextFillColor: 'transparent',
                                          color: '#3A81F5'
                                        }}
                                        title={isExpanded ? 'Show less' : 'Show full question'}
                                      >
                                        {isExpanded ? ' less' : ' more...'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Correct Answer: FULL string in green text (e.g. "C) Chandrayaan-3") */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="font-bold text-xs text-[#15803d] truncate max-w-[240px] inline-block align-middle" title={fullAnswerString}>
                                {fullAnswerString}
                              </span>
                            </td>

                            {/* Dedicated Difficulty Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider inline-block ${
                                q.difficulty === 'Easy'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : q.difficulty === 'Medium'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : q.difficulty === 'Hard'
                                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}>
                                {q.difficulty || 'Medium'}
                              </span>
                            </td>

                            {/* Actions: Edit in brand gradient with white pencil, permanent delete with red trash */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditQuestion(q)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                                  title="Edit Question"
                                >
                                  <Edit3 className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteQuestion(Number(q.id));
                                  }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#D14343] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Permanently Delete Question"
                                >
                                  <Trash2 className="w-4 h-4 text-[#D14343]" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Exact Unified Single-Pill Capsule Pagination: `< X / Y >` inside ONE single brand gradient container at bottom right */}
              <div className="flex items-center justify-end pt-3 border-t border-[#EAECF0]">
                <div 
                  className="inline-flex items-center rounded-full text-white font-bold text-xs shadow-md overflow-hidden select-none"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  <button
                    type="button"
                    disabled={safeQuestionPage <= 1}
                    onClick={() => setQuestionPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-2 text-white hover:bg-black/15 active:bg-black/25 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-white" />
                  </button>

                  <span className="px-3 py-2 text-white font-bold text-xs tracking-wider min-w-[56px] text-center">
                    {safeQuestionPage} / {totalQuestionPages}
                  </span>

                  <button
                    type="button"
                    disabled={safeQuestionPage >= totalQuestionPages}
                    onClick={() => setQuestionPage(prev => Math.min(totalQuestionPages, prev + 1))}
                    className="px-3.5 py-2 text-white hover:bg-black/15 active:bg-black/25 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: CONTEST BANNER, ANNOUNCEMENTS & TIMER SETTINGS     */}
        {/* ========================================================= */}
        {activeTab === 'prize_timer' && (
          <div className="space-y-8">
            {/* PART 1: TOP ANNOUNCEMENT BAR */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <Megaphone className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Top Announcement Bar
                    </h3>
                  </div>
                </div>
              </div>

              {/* Live Preview Container */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Preview
                </label>
                <div className="rounded-xl overflow-hidden border border-blue-200 shadow-2xs">
                  <AnnouncementBar 
                    text={adminAnnouncement.text} 
                    isEnabled={adminAnnouncement.isEnabled} 
                    speed={adminAnnouncement.speed} 
                  />
                </div>
              </div>

              {/* Form Controls */}
              <form onSubmit={handleSaveAnnouncement} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Announcement Text <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={adminAnnouncement.text}
                    onChange={(e) => setAdminAnnouncement(prev => ({ ...prev, text: e.target.value }))}
                    placeholder="e.g. ⚡ ₹10,000 Mega Cash Contest LIVE NOW! Win Real Money & Gadgets in 10 Questions 🚀 Instant UPI Payouts!"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs bg-white text-slate-900 font-medium"
                    style={{ backgroundColor: '#FFFFFF' }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Enabled Toggle - Subtitle line removed */}
                  <div 
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">Show Announcement Bar</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={adminAnnouncement.isEnabled}
                        onChange={(e) => {
                          const isEnabled = e.target.checked;
                          const updated = { ...adminAnnouncement, isEnabled };
                          setAdminAnnouncement(updated);
                          if (onUpdateAnnouncement) onUpdateAnnouncement(updated);
                          try {
                            localStorage.setItem('quizkart_announcement_settings', JSON.stringify(updated));
                            window.dispatchEvent(new Event('storage'));
                          } catch {}
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4A7DF3]"></div>
                    </label>
                  </div>

                  {/* Scroll Speed Dropdown - Slow, Medium, Fast with Instant Sync */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Scroll Speed</label>
                    <select
                      value={adminAnnouncement.speed || 'normal'}
                      onChange={(e) => handleSpeedChange(e.target.value as any)}
                      className="appearance-none w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs bg-white font-medium cursor-pointer"
                      style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundColor: '#FFFFFF' }}
                    >
                      <option value="slow">Slow</option>
                      <option value="normal">Medium</option>
                      <option value="fast">Fast</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSavingBar}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center active:scale-95 hover:opacity-95 disabled:opacity-85 min-w-[84px] h-8"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    {isSavingBar ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isBarSaved ? (
                      <span>Saved!</span>
                    ) : (
                      <span>Save Bar</span>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* PART 2: CAROUSEL BANNER SLIDER */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <ImageIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Banner Slider
                    </h3>
                  </div>
                </div>

                {/* ON/OFF toggle switch relocated directly aligned to right-hand side */}
                <div 
                  className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sliderEnabledState}
                    onClick={() => handleToggleSlider(!sliderEnabledState)}
                    className="relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    style={{ backgroundColor: sliderEnabledState ? '#4A7DF3' : '#CBD5E1' }}
                    title={sliderEnabledState ? 'Slider is ON. Click to Turn OFF' : 'Slider is OFF. Click to Turn ON'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        sliderEnabledState ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span 
                    className="text-xs font-black font-mono tracking-wider"
                    style={{ color: sliderEnabledState ? '#4A7DF3' : '#94A3B8' }}
                  >
                    {sliderEnabledState ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* Live Mini Preview of Banner Carousel */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Preview
                  </label>
                </div>
                <div className={`rounded-2xl overflow-hidden border border-slate-200 shadow-sm transition-opacity ${!sliderEnabledState ? 'opacity-50' : 'opacity-100'}`}>
                  <BannerSlider 
                    slides={adminBannerSlides} 
                    activeSlideIndex={activeSlideAdminIdx}
                    showAllSlides={true}
                    onSlideAction={() => {}} 
                  />
                </div>
              </div>

              {/* Slide Selector Tabs: 10 Slots (1 to 10), solid clean button styling */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {adminBannerSlides.map((slide, idx) => (
                  <button
                    key={slide.id || `tab-slot-${idx}`}
                    type="button"
                    onClick={() => setActiveSlideAdminIdx(idx)}
                    className={`w-9 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 border ${
                      activeSlideAdminIdx === idx
                        ? 'text-white shadow-xs border-[#4A7DF3]'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                    }`}
                    style={activeSlideAdminIdx === idx ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' } : undefined}
                  >
                    <span>{idx + 1}</span>
                  </button>
                ))}
              </div>

              {/* Active Slide Editor: Header dynamic "Banner {activeSlideAdminIdx + 1}", solid clean White background */}
              {adminBannerSlides[activeSlideAdminIdx] && (
                <div 
                  className="space-y-4 p-5 rounded-2xl border border-slate-200 bg-white"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Banner {activeSlideAdminIdx + 1}
                      </span>
                    </div>
                    {/* Active Checkbox: Only clean checkbox icon, no 'Active' word, instant live visibility toggle */}
                    <label 
                      className="flex items-center cursor-pointer"
                      title={adminBannerSlides[activeSlideAdminIdx].isEnabled ? 'Banner is Visible on Live Website' : 'Banner is Hidden on Live Website'}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(adminBannerSlides[activeSlideAdminIdx].isEnabled)}
                        onChange={(e) => handleToggleSlideActive(activeSlideAdminIdx, e.target.checked)}
                        className="w-4 h-4 text-[#4A7DF3] rounded cursor-pointer accent-[#4A7DF3]"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Title */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Banner Heading</label>
                      <input
                        type="text"
                        value={adminBannerSlides[activeSlideAdminIdx]?.title || ''}
                        onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'title', e.target.value)}
                        placeholder=""
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 font-semibold"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                    </div>

                    {/* Subtitle */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Subtitle</label>
                      <input
                        type="text"
                        value={adminBannerSlides[activeSlideAdminIdx]?.subtitle || ''}
                        onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'subtitle', e.target.value)}
                        placeholder=""
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                    </div>

                    {/* Badge Tag */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Badge Tag</label>
                      <input
                        type="text"
                        value={adminBannerSlides[activeSlideAdminIdx]?.badge || ''}
                        onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'badge', e.target.value)}
                        placeholder=""
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 font-mono text-[11px]"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                    </div>

                    {/* CTA Text & Action */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Button Text</label>
                        <input
                          type="text"
                          value={adminBannerSlides[activeSlideAdminIdx]?.actionText ?? ''}
                          onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'actionText', e.target.value)}
                          placeholder=""
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 font-bold"
                          style={{ backgroundColor: '#FFFFFF' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Target Page</label>
                        <select
                          value={adminBannerSlides[activeSlideAdminIdx]?.actionTab || 'quiz_arena'}
                          onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'actionTab', e.target.value as any)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 font-medium cursor-pointer"
                          style={{ backgroundColor: '#FFFFFF' }}
                        >
                          <option value="quiz_arena">Quiz Arena</option>
                          <option value="leaderboard">Leaderboard</option>
                          <option value="transparency">Transparency</option>
                          <option value="profile">Profile & Wallet</option>
                          <option value="refer_earn">Refer & Earn</option>
                          <option value="withdrawal_history">Withdrawal History</option>
                          <option value="custom_url">Custom URL</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Optional Custom URL input if Custom URL option selected */}
                  {adminBannerSlides[activeSlideAdminIdx]?.actionTab === 'custom_url' && (
                    <div className="pt-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Custom URL Link</label>
                      <input
                        type="url"
                        value={adminBannerSlides[activeSlideAdminIdx]?.customUrl || ''}
                        onChange={(e) => handleUpdateSlideField(activeSlideAdminIdx, 'customUrl', e.target.value)}
                        placeholder=""
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                    </div>
                  )}

                  {/* Banner Image: Boxed Image Upload UI */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Banner Image
                    </label>

                    {/* Single-Click File Upload Input */}
                    <input
                      ref={bannerFileInputRef}
                      type="file"
                      accept="image/*,image/gif,.gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif') || isGifImage(file);
                            if (isGif) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const res = reader.result as string;
                                handleUpdateSlideField(activeSlideAdminIdx, 'imageUrl', res);
                                soundFx.playSuccess();
                                showToast(`Animated GIF uploaded for Banner ${activeSlideAdminIdx + 1}!`);
                              };
                              reader.readAsDataURL(file);
                            } else {
                              const compressed = await compressImage(file, 1200, 600, 0.75);
                              handleUpdateSlideField(activeSlideAdminIdx, 'imageUrl', compressed);
                              soundFx.playSuccess();
                              showToast(`Image uploaded for Banner ${activeSlideAdminIdx + 1}!`);
                            }
                          } catch {
                            showToast('Failed to process image');
                          } finally {
                            e.target.value = '';
                          }
                        }
                      }}
                    />

                    {adminBannerSlides[activeSlideAdminIdx]?.imageUrl ? (
                      /* Uploaded Image Preview with 'X' Remove Button at top-right */
                      <div className="relative w-full h-44 sm:h-52 rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center group shadow-2xs">
                        <img
                          src={adminBannerSlides[activeSlideAdminIdx].imageUrl}
                          alt="Banner Artwork"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateSlideField(activeSlideAdminIdx, 'imageUrl', '');
                            showToast(`Image removed for Banner ${activeSlideAdminIdx + 1}`);
                          }}
                          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-md z-10"
                          title="Remove Image"
                          aria-label="Remove Image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      /* Drag & Drop / Click-to-Upload Box with single clean upload icon in primary brand color */
                      <div 
                        onClick={() => bannerFileInputRef.current?.click()}
                        className="relative w-full h-44 sm:h-52 rounded-2xl border-2 border-dashed border-[#4A7DF3]/60 hover:border-[#4A7DF3] bg-white flex items-center justify-center cursor-pointer transition-all shadow-2xs group"
                        style={{ backgroundColor: '#FFFFFF' }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            try {
                              const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif') || isGifImage(file);
                              if (isGif) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const res = reader.result as string;
                                  handleUpdateSlideField(activeSlideAdminIdx, 'imageUrl', res);
                                  soundFx.playSuccess();
                                  showToast(`Animated GIF uploaded for Banner ${activeSlideAdminIdx + 1}!`);
                                };
                                reader.readAsDataURL(file);
                              } else {
                                const compressed = await compressImage(file, 1200, 600, 0.75);
                                handleUpdateSlideField(activeSlideAdminIdx, 'imageUrl', compressed);
                                soundFx.playSuccess();
                                showToast(`Image uploaded for Banner ${activeSlideAdminIdx + 1}!`);
                              }
                            } catch {
                              showToast('Failed to process image');
                            }
                          }
                        }}
                      >
                        <div className="flex items-center justify-center">
                          <Upload className="w-8 h-8 text-[#4A7DF3] group-hover:scale-110 transition-transform" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Compact, short, and stylish Save Banners Button with 1-second dynamic loading state */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isSavingBanners}
                  onClick={handleSaveBannerSlides}
                  className="px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2 justify-center active:scale-95 hover:opacity-95 disabled:opacity-85"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  {isSavingBanners ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isBannersSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Banners</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* PART 3: GLOBAL CONTEST TIMER */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <div 
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  <Clock className="w-3.5 h-3.5 text-white" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Quiz Timer
                </h3>
              </div>

              {/* Presets & Custom Duration Stepper */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                {/* Quick Presets in Minutes */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Presets
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: '1 Min', secs: 60 },
                      { label: '3 Mins', secs: 180 },
                      { label: '5 Mins', secs: 300 },
                      { label: '7 Mins', secs: 420 },
                      { label: '10 Mins', secs: 600 }
                    ].map((preset) => {
                      const isSelected = contestTimerSeconds === preset.secs;
                      return (
                        <button
                          key={preset.secs}
                          type="button"
                          onClick={() => handleLockContestTimer(preset.secs)}
                          className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                            isSelected
                              ? 'text-white shadow-xs border-[#4A7DF3]'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                          style={isSelected ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)', color: '#FFFFFF' } : undefined}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Duration Section: Top-Left Label, Pure White (#FFFFFF), Single-Line Controls, Lock & Save Below */}
                <div 
                  className="p-4 rounded-2xl border border-slate-200 bg-white" 
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider text-left mb-3">
                    Custom Duration
                  </label>
                  
                  {/* Perfectly aligned single horizontal line with balanced spacing: -30s, hr, min, sec, +30s */}
                  <div className="flex items-start justify-center gap-1.5 sm:gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setContestTimerSeconds(prev => Math.max(10, prev - 30))}
                      className="h-9 px-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
                      style={{ backgroundColor: '#FFFFFF' }}
                      title="Decrease by 30 seconds"
                    >
                      -30s
                    </button>

                    {/* Hours, Minutes, Seconds Input Controls */}
                    <div className="flex items-start gap-1 font-mono">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          max={5}
                          value={Math.floor(contestTimerSeconds / 3600)}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            const curM = Math.floor((contestTimerSeconds % 3600) / 60);
                            const curS = contestTimerSeconds % 60;
                            setContestTimerSeconds(Math.max(10, (val * 3600) + (curM * 60) + curS));
                          }}
                          className="w-12 h-9 px-1.5 text-center font-bold text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#4A7DF3]"
                          style={{ backgroundColor: '#FFFFFF' }}
                          title="Hours"
                        />
                        <span className="text-[10px] text-slate-400 font-sans mt-0.5">hr</span>
                      </div>
                      <span className="text-slate-400 font-bold h-9 flex items-center">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={Math.floor((contestTimerSeconds % 3600) / 60)}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                            const curH = Math.floor(contestTimerSeconds / 3600);
                            const curS = contestTimerSeconds % 60;
                            setContestTimerSeconds(Math.max(10, (curH * 3600) + (val * 60) + curS));
                          }}
                          className="w-12 h-9 px-1.5 text-center font-bold text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#4A7DF3]"
                          style={{ backgroundColor: '#FFFFFF' }}
                          title="Minutes"
                        />
                        <span className="text-[10px] text-slate-400 font-sans mt-0.5">min</span>
                      </div>
                      <span className="text-slate-400 font-bold h-9 flex items-center">:</span>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={contestTimerSeconds % 60}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                            const curH = Math.floor(contestTimerSeconds / 3600);
                            const curM = Math.floor((contestTimerSeconds % 3600) / 60);
                            setContestTimerSeconds(Math.max(10, (curH * 3600) + (curM * 60) + val));
                          }}
                          className="w-12 h-9 px-1.5 text-center font-bold text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#4A7DF3]"
                          style={{ backgroundColor: '#FFFFFF' }}
                          title="Seconds"
                        />
                        <span className="text-[10px] text-slate-400 font-sans mt-0.5">sec</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setContestTimerSeconds(prev => Math.min(7200, prev + 30))}
                      className="h-9 px-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
                      style={{ backgroundColor: '#FFFFFF' }}
                      title="Increase by 30 seconds"
                    >
                      +30s
                    </button>
                  </div>

                  {/* Lock & Save Button positioned comfortably below inputs with clean top margin and 1s click animation */}
                  <button
                    type="button"
                    disabled={isLockingTimer}
                    onClick={() => handleLockContestTimer(contestTimerSeconds)}
                    className="w-full mt-3.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 justify-center active:scale-95 hover:opacity-95 disabled:opacity-85"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    {isLockingTimer ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : isTimerLocked ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <span>Lock & Save</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: USER UPI DEPOSIT VERIFICATION LEDGER (IMAGE 1000156919) */}
        {/* ========================================================= */}
        {activeTab === 'deposits' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              {/* Header: Cleaned up title, subheader removed, pending badge styled in signature gradient */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Deposit Verification Ledger
                  </h3>
                  <span 
                    className="px-3 py-0.5 rounded-full text-xs font-bold text-white shadow-xs inline-flex items-center"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    {(deposits || []).filter(d => d && d.status === 'pending').length} Pending
                  </span>
                </div>

                {/* Bulk Delete Controls when items are selected */}
                {selectedDepositIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">
                      {selectedDepositIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={handleBulkDeleteDeposits}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDepositIds([])}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Admin Search & Date Filter Bar */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Search by User Name or Mobile Number */}
                  <div className="md:col-span-7 relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by User Name or Mobile Number..."
                      value={depositSearch}
                      onChange={(e) => setDepositSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white transition-colors"
                    />
                    {depositSearch && (
                      <button
                        type="button"
                        onClick={() => setDepositSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter by Date */}
                  <div className="md:col-span-5 relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        title="Filter by Date"
                        aria-label="Filter by Date"
                        value={depositDateFilter}
                        onChange={(e) => setDepositDateFilter(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:border-blue-500 focus:bg-white transition-colors cursor-pointer"
                      />
                    </div>
                    {depositDateFilter && (
                      <button
                        type="button"
                        onClick={() => setDepositDateFilter('')}
                        className="px-2.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
                        title="Clear date filter"
                      >
                        Clear Date
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills in a single horizontal row without wrapping */}
                <div className="flex items-center justify-between gap-3 pt-1 w-full overflow-hidden">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto py-1 shrink-0 max-w-full">
                    {[
                      { key: 'all', label: `All Deposits (${deposits.length})` },
                      { key: 'pending', label: `Pending (${deposits.filter(d => d.status === 'pending').length})` },
                      { key: 'approved', label: `Approved (${deposits.filter(d => d.status === 'approved').length})` },
                      { key: 'rejected', label: `Rejected (${deposits.filter(d => d.status === 'rejected').length})` }
                    ].map((pill) => (
                      <button
                        key={pill.key}
                        type="button"
                        onClick={() => setDepositFilter(pill.key as typeof depositFilter)}
                        className={`whitespace-nowrap shrink-0 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          depositFilter === pill.key
                            ? 'text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={depositFilter === pill.key ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' } : undefined}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  {resolvableDeposits.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDepositIds.length === resolvableDeposits.length) {
                          setSelectedDepositIds([]);
                        } else {
                          setSelectedDepositIds(resolvableDeposits.map(d => d.id));
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer underline decoration-dotted whitespace-nowrap shrink-0"
                    >
                      {selectedDepositIds.length === resolvableDeposits.length ? 'Deselect All' : 'Select All Resolved'}
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Select all resolved deposits"
                          disabled={resolvableDeposits.length === 0}
                          checked={resolvableDeposits.length > 0 && selectedDepositIds.length === resolvableDeposits.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDepositIds(resolvableDeposits.map(d => d.id));
                            } else {
                              setSelectedDepositIds([]);
                            }
                          }}
                          className={`rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${resolvableDeposits.length === 0 ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}`}
                          title={resolvableDeposits.length === 0 ? 'No resolved deposits available for deletion' : 'Select all resolved deposits'}
                        />
                      </th>
                      <th className="py-3 px-4 font-bold">Request ID</th>
                      <th className="py-3 px-4 font-bold">Contestant</th>
                      <th className="py-3 px-4 font-bold">Amount</th>
                      <th className="py-3 px-4 font-bold">UTR Number</th>
                      <th className="py-3 px-4 font-bold">Proof</th>
                      <th className="py-3 px-4 font-bold">Status</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDeposits.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                          No deposit records match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredDeposits.map((dep, idx) => {
                        const displayId = formatDepositId(dep.id, idx + 1);
                        const isSelected = selectedDepositIds.includes(dep.id);
                        const isPending = dep.status === 'pending';

                        return (
                          <tr 
                            key={dep.id ? `admin-dep-${dep.id}-${idx}` : `admin-dep-${dep.utrNumber || idx}-${idx}`} 
                            className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}
                          >
                            <td className="py-3.5 px-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Select deposit ${displayId}`}
                                checked={isSelected}
                                disabled={isPending}
                                onChange={(e) => {
                                  if (isPending) return;
                                  if (e.target.checked) {
                                    setSelectedDepositIds(prev => [...prev, dep.id]);
                                  } else {
                                    setSelectedDepositIds(prev => prev.filter(id => id !== dep.id));
                                  }
                                }}
                                className={`rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${isPending ? 'cursor-not-allowed opacity-30 bg-slate-100' : 'cursor-pointer'}`}
                                title={isPending ? 'Action Required: Approve or Reject this deposit before selecting for deletion' : `Select deposit ${displayId}`}
                              />
                            </td>
                            {/* REQUEST ID: Clean sequential format QK-DEP-XXXX with Permanent Static Timestamp */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                              {displayId}
                              <span className="block text-[10px] text-slate-500 font-medium tracking-wide mt-0.5 whitespace-nowrap">
                                {formatDepositTimestamp(dep.timestamp, dep.createdAt, dep.date)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="font-bold text-slate-900">{dep.userName}</p>
                              <p className="text-[11px] text-slate-500">{dep.phone}</p>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                                ₹{dep.amount}
                              </span>
                            </td>
                            {/* UTR NUMBER */}
                            <td className="py-3.5 px-4 font-mono">
                              <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs">
                                {dep.utrNumber}
                              </span>
                            </td>
                            {/* PROOF COLUMN: No thumbnail icon, ONLY clean clickable "View Proof" text button */}
                            <td className="py-3.5 px-4">
                              {dep.screenshotUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedScreenshotModal(dep.screenshotUrl!)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                                  title="Click to view full screenshot proof"
                                >
                                  <span>View Proof</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic">No Proof</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                dep.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : dep.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}>
                                {dep.status}
                              </span>
                            </td>
                            {/* ACTIONS: Approve, Reject, and Delete */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {dep.status === 'pending' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveDeposit(dep.id)}
                                      className="px-3 py-1.5 rounded-xl text-white font-bold text-xs shadow-xs transition-all hover:opacity-95 active:scale-95 cursor-pointer"
                                      style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectDeposit(dep.id)}
                                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                {dep.status !== 'pending' && (
                                  <span className="text-[11px] text-slate-400 italic mr-1">Resolved</span>
                                )}
                                {isPending ? (
                                  <button
                                    type="button"
                                    disabled={true}
                                    className="p-1.5 rounded-lg text-slate-300 opacity-40 cursor-not-allowed transition-colors"
                                    title="Action Required: Approve or Reject this deposit before deleting"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDeposit(dep.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Delete resolved deposit record"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB: ACTIVE QR CODE                                       */}
        {/* ========================================================= */}
        {activeTab === 'deposit_qr' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              {!isQrUnlocked ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Security Verification Required</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the security password to unlock Deposit QR management.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQrSecurityPassword('');
                      setQrSecurityError(null);
                      setShowQrPassword(false);
                      setIsQrSecurityModalOpen(true);
                    }}
                    className="py-2.5 px-5 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    Enter Password to Unlock
                  </button>
                </div>
              ) : (
                <>
                  {/* Single Main Heading: ACTIVE QR CODE */}
                  <div className="text-center pb-2 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">
                      ACTIVE QR CODE
                    </h2>
                  </div>

                  {/* QR Display */}
                  <div className="flex justify-center">
                    <div className="w-64 h-64 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center p-3 shadow-xs">
                      {(newQrPreview || currentActiveQr) ? (
                        <img 
                          src={newQrPreview || currentActiveQr} 
                          alt="Active QR Code" 
                          className="w-full h-full object-contain rounded-xl"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">No QR Code</span>
                      )}
                    </div>
                  </div>

                  {/* Single-Click File Upload Box: Clean Choose File button */}
                  <div>
                    <input 
                      ref={qrFileInputRef}
                      type="file" 
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleQrImageFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      className="w-full py-3 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs active:scale-[0.99]"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>{newQrFile ? `Selected: ${newQrFile.name}` : 'Choose File'}</span>
                    </button>
                  </div>

                  {/* Save Button */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleUpdateQrCode}
                      disabled={isUpdatingQr || !newQrFile}
                      className="w-full py-3.5 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                    >
                      {isUpdatingQr ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating QR Code...</span>
                        </>
                      ) : (
                        <span>Update QR Code</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB: WITHDRAWAL APPROVALS LEDGER (IMAGE 8 REF)            */}
        {/* ========================================================= */}
        {activeTab === 'withdrawals' && (
          <WithdrawalApprovalsTab
            withdrawals={withdrawalsList}
            onUpdateWithdrawals={saveWithdrawals}
            onApproveWithdrawal={handleApproveWithdrawal}
            onRejectWithdrawal={handleRejectWithdrawal}
            onDeleteWithdrawal={handleDeleteWithdrawal}
            onBulkDeleteWithdrawals={handleBulkDeleteWithdrawals}
          />
        )}

        {/* ========================================================= */}
        {/* TAB 4: WINNER PAYOUT LEDGER (UPI DIRECT COPY & PAID TOGGLE)*/}
        {/* ========================================================= */}
        {activeTab === 'payouts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Daily Contest Winner Payout & Dispatch Ledger
                  </h3>
                  <p className="text-xs text-slate-500">
                    Declare results based on accuracy and speed, copy UPI IDs with 1-click, and track disbursement status.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleDeclareWinner}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <Trophy className="w-4 h-4 text-amber-300" />
                    <span>Declare Today's Winners</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchPayAllCashbacks}
                    className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-all cursor-pointer"
                  >
                    Mark All UPI Cashbacks Sent
                  </button>
                </div>
              </div>

              {/* Rank 1 Amazon/Meesho Courier AWB Input */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Rank #1 Product Dispatch Tracking ({todayPrize.deliveryPartner})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Awarded to {leaderboard.find(l => l.rank === 1)?.userName || 'Top Contestant'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={orderTrackingId}
                    onChange={(e) => setOrderTrackingId(e.target.value)}
                    placeholder="e.g. AMZN-IN-9812401"
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTrackingId}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Save AWB
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {[
                    { key: 'all', label: 'All Ranks' },
                    { key: 'pending', label: 'Pending Payout' },
                    { key: 'sent', label: 'Paid via UPI' }
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setLedgerFilter(p.key as typeof ledgerFilter)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        ledgerFilter === p.key
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search candidate or city..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                  />
                </div>
              </div>

              {/* Standings & Payouts Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="py-3 px-4 font-bold w-12">Rank</th>
                      <th className="py-3 px-4 font-bold">Contestant</th>
                      <th className="py-3 px-4 font-bold">Score & Speed</th>
                      <th className="py-3 px-4 font-bold">Allocated Reward</th>
                      <th className="py-3 px-4 font-bold">UPI ID (Direct Copy)</th>
                      <th className="py-3 px-4 font-bold text-right">Disbursement Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeaderboard.map((item) => {
                      const isPaid = payoutStatuses[item.id] === 'sent';
                      const defaultUpi = `${item.userName.toLowerCase().replace(/\s+/g, '.')}@okhdfcbank`;
                      const isCopied = copiedUpiId === item.id;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-black">
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                              item.rank === 1
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                                : item.rank === 2
                                ? 'bg-slate-100 text-slate-800 border border-slate-300'
                                : item.rank === 3
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'text-slate-500'
                            }`}>
                              {item.rank}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              {item.avatar ? (
                                <img src={item.avatar} alt={item.userName} className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                                  {item.userName ? item.userName.charAt(0).toUpperCase() : 'U'}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{item.userName}</span>
                                  {item.isCurrentUser && (
                                    <span className="px-1.5 py-0.5 rounded-sm bg-indigo-100 text-indigo-700 text-[10px] font-extrabold">
                                      YOU
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-400">{item.city}, {item.state}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-mono font-bold text-slate-900">{item.score}/10 Correct</p>
                            <p className="text-[11px] font-mono text-slate-500">⏱️ {item.formattedTime}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1 ${
                              item.rank === 1
                                ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                : item.rank <= 10
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.rewardText || 'Participation'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-700 truncate max-w-[150px]">{defaultUpi}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyUpi(defaultUpi, item.id)}
                                title="1-Click Copy UPI to Clipboard"
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                                  isCopied
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {item.rank === 1 ? (
                              <span className="text-[11px] font-bold text-indigo-600 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200">
                                Courier Dispatched
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTogglePayoutStatus(item.id)}
                                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                }`}
                              >
                                {isPaid ? '✓ UPI Transferred' : 'Mark Transferred'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Collapsible Platform Economics & Margins Overview */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setIsFinancialsExpanded(!isFinancialsExpanded)}
                  className="w-full p-4 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-indigo-600" />
                    <span>View Platform Margins & Economics Breakdown</span>
                  </div>
                  {isFinancialsExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>

                {isFinancialsExpanded && (
                  <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                      <p className="text-slate-500 text-[11px] font-medium">Rank 1 Mega Prize (50%)</p>
                      <p className="text-base font-black text-indigo-700 mt-1">₹{poolData.productPrizeValue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                      <p className="text-slate-500 text-[11px] font-medium">Rank 2-10 Cashbacks (45%)</p>
                      <p className="text-base font-black text-emerald-700 mt-1">₹{poolData.runnerUpPoolValue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                      <p className="text-slate-500 text-[11px] font-medium">Platform Fee & Margins (5%)</p>
                      <p className="text-base font-black text-slate-900 mt-1">₹{poolData.platformFeeValue.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: SECURITY & ANTI-CHEAT VIOLATION LOGS                */}
        {/* ========================================================= */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Proctored Anti-Cheat Violation Audit Logs
                    </h3>
                    <p className="text-xs text-slate-500">
                      Real-time telemetry capturing tab switches, window blurs, keyboard traps, print screens, and OCR bypass attempts.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSimulateSecurityBreach}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Simulate Breach Incident</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSecurityReport}
                    className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Export Audit Report</span>
                  </button>
                  {securityLogsList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSecurityLogs}
                      className="px-3 py-2 rounded-xl text-slate-400 hover:text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      Clear Logs
                    </button>
                  )}
                </div>
              </div>

              {/* Telemetry Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-xs font-medium">Total Violations Trapped</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{securityLogsList.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                  <p className="text-rose-700 text-xs font-medium">Auto-Disqualifications Enforced</p>
                  <p className="text-2xl font-black text-rose-900 mt-1">
                    {securityLogsList.filter(l => l.severity.includes('Critical')).length}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <p className="text-emerald-700 text-xs font-medium">Anti-Cheat Engine Status</p>
                  <p className="text-xs font-black text-emerald-900 mt-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    ATOMIC CLOCK & CANVAS OCR ARMED
                  </p>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {[
                    { key: 'all', label: `All Incidents (${securityLogsList.length})` },
                    { key: 'critical', label: 'Critical' },
                    { key: 'high', label: 'High' }
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSecurityFilter(p.key as typeof securityFilter)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        securityFilter === p.key
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={securitySearch}
                    onChange={(e) => setSecuritySearch(e.target.value)}
                    placeholder="Search candidate or reason..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                  />
                </div>
              </div>

              {/* Incidents Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="py-3 px-4 font-bold w-24">Incident ID</th>
                      <th className="py-3 px-4 font-bold">Candidate</th>
                      <th className="py-3 px-4 font-bold">Violation Reason</th>
                      <th className="py-3 px-4 font-bold">Proctor Severity</th>
                      <th className="py-3 px-4 font-bold">Device Fingerprint</th>
                      <th className="py-3 px-4 font-bold text-right">Audit Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSecurityLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No security incidents matching current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSecurityLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                            {log.id}
                            <span className="block text-[10px] text-slate-400 font-normal">{log.timestamp}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{log.userName}</p>
                            <p className="text-[11px] text-slate-400">{log.city || 'India'} • {log.phone}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-rose-950 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                              <span>{log.violationType}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{log.actionTaken}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              log.severity.includes('Critical')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {log.severity}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 max-w-[200px] truncate">
                            {log.deviceInfo}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleLogReviewStatus(log.id)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                log.status === 'Reviewed'
                                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              {log.status === 'Reviewed' ? '✓ Reviewed' : 'Flagged (Disqualified)'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: CUSTOMER SUPPORT DASHBOARD                        */}
        {/* ========================================================= */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            {/* Header Box */}
            <div 
              className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-8 shadow-sm space-y-6"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div className="flex items-center justify-between pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    <LifeBuoy className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                    Support Center
                  </h2>
                </div>
              </div>

              {/* Quick Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
                  <div className="text-xs font-semibold text-slate-500">All Tickets</div>
                  <div className="text-2xl font-black text-slate-900">{supportTickets.filter(t => !isTicketDeleted(t.id)).length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 shadow-2xs space-y-1">
                  <div className="text-xs font-semibold text-amber-700">Open Tickets</div>
                  <div className="text-2xl font-black text-amber-900">{supportTickets.filter(t => !isTicketDeleted(t.id) && t.status === 'Open').length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 shadow-2xs space-y-1">
                  <div className="text-xs font-semibold text-blue-700">In Progress</div>
                  <div className="text-2xl font-black text-blue-900">{supportTickets.filter(t => !isTicketDeleted(t.id) && t.status === 'In Progress').length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 shadow-2xs space-y-1">
                  <div className="text-xs font-semibold text-emerald-700">Resolved</div>
                  <div className="text-2xl font-black text-emerald-900">{supportTickets.filter(t => !isTicketDeleted(t.id) && t.status === 'Resolved').length}</div>
                </div>
              </div>

              {/* Filters & Admin Name */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['all', 'Open', 'In Progress', 'Resolved'] as const).map((st) => {
                      const isActive = supportFilterStatus === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSupportFilterStatus(st)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          style={isActive ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
                        >
                          {st === 'all' ? 'All Statuses' : st}
                        </button>
                      );
                    })}

                    {/* Category Filter: dropdown arrow removed with appearance-none while preserving full functionality */}
                    <select
                      value={supportFilterCategory}
                      onChange={(e) => setSupportFilterCategory(e.target.value)}
                      className={`appearance-none px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        supportFilterCategory !== 'all'
                          ? 'text-white border-transparent'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        background: supportFilterCategory !== 'all' ? 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' : undefined
                      }}
                    >
                      <option value="all" className="text-slate-800 bg-white">All Categories</option>
                      <option value="Deposit Issue" className="text-slate-800 bg-white">Deposit Issue</option>
                      <option value="Withdrawal Issue" className="text-slate-800 bg-white">Withdrawal Issue</option>
                      <option value="Quiz Issue" className="text-slate-800 bg-white">Quiz Issue</option>
                      <option value="Other Query" className="text-slate-800 bg-white">Other Query</option>
                    </select>
                  </div>

                  {/* Admin Name: Consolidate label and value into a SINGLE unified white rounded box container */}
                  <div 
                    className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-2 self-start md:self-auto"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    <span className="text-[11px] font-bold text-[#4A7DF3] whitespace-nowrap">
                      Admin Name:
                    </span>
                    <input
                      type="text"
                      value={editableAdminName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditableAdminName(val);
                        localStorage.setItem('quizkart_support_admin_name', val);
                        window.dispatchEvent(new Event('quizkart_support_admin_name_updated'));
                      }}
                      placeholder="Support"
                      className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none px-0 py-0.5 w-20 sm:w-28"
                    />
                  </div>
                </div>

                {/* Search Bar Row: Positioned below, with clean styling and short professional placeholder */}
                <div className="pt-1">
                  <div className="relative w-full sm:w-80">
                    <div 
                      className="absolute left-1 top-1 bottom-1 w-8 rounded-lg flex items-center justify-center pointer-events-none shadow-2xs"
                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                    >
                      <Search className="w-4 h-4 text-white" style={{ color: '#FFFFFF' }} />
                    </div>
                    <input
                      type="text"
                      value={supportSearchQuery}
                      onChange={(e) => setSupportSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="pl-11 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#4A7DF3] w-full shadow-2xs"
                      style={{ backgroundColor: '#FFFFFF' }}
                    />
                  </div>
                </div>
              </div>

              {/* Tickets List */}
              <div className="space-y-4 pt-2">
                {(() => {
                  const getAdminMessageDateLabel = (timestamp: number): string => {
                    const msgDate = new Date(timestamp);
                    const today = new Date();
                    if (
                      msgDate.getDate() === today.getDate() &&
                      msgDate.getMonth() === today.getMonth() &&
                      msgDate.getFullYear() === today.getFullYear()
                    ) {
                      return 'Today';
                    }
                    const yesterday = new Date();
                    yesterday.setDate(today.getDate() - 1);
                    if (
                      msgDate.getDate() === yesterday.getDate() &&
                      msgDate.getMonth() === yesterday.getMonth() &&
                      msgDate.getFullYear() === yesterday.getFullYear()
                    ) {
                      return 'Yesterday';
                    }
                    return msgDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: msgDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
                    });
                  };

                  const handleDeleteTicketPermanently = async (ticketId: string, formattedId: string) => {
                    soundFx.playClick();
                    try {
                      addDeletedTicketId(ticketId);
                      addDeletedTicketId(formattedId);
                      const raw = localStorage.getItem('quizkart_support_tickets');
                      const all: SupportTicket[] = raw ? JSON.parse(raw) : supportTickets;
                      const updated = all.filter(t => t.id !== ticketId && formatTicketId(t.id) !== formattedId && t.id !== formattedId);
                      localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
                      setSupportTickets(updated);
                      await Promise.all([
                        deleteSupportTicketFromFirestore(ticketId),
                        deleteSupportTicketFromFirestore(formattedId)
                      ]);
                      window.dispatchEvent(new Event('quizkart_support_tickets_updated'));
                      window.dispatchEvent(new Event('storage'));
                      soundFx.playSuccess();
                      showToast(`Ticket ${formattedId} deleted permanently`);
                    } catch {
                      showToast('Failed to delete ticket');
                    }
                  };

                  const filtered = supportTickets.filter((t) => {
                    if (!t || !t.id || isTicketDeleted(t.id)) return false;
                    if (supportFilterStatus !== 'all' && t.status !== supportFilterStatus) return false;
                    if (supportFilterCategory !== 'all' && t.category !== supportFilterCategory) return false;
                    if (supportSearchQuery.trim()) {
                      const q = supportSearchQuery.trim().toLowerCase();
                      const matchId = t.id.toLowerCase().includes(q) || formatTicketId(t.id).toLowerCase().includes(q);
                      const matchEmail = (t.userEmail || '').toLowerCase().includes(q);
                      const matchName = (t.userName || '').toLowerCase().includes(q);
                      const matchDesc = (t.problemDescription || '').toLowerCase().includes(q);
                      if (!matchId && !matchEmail && !matchName && !matchDesc) return false;
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-2xl border-b-0 shadow-none">
                        <Ticket className="w-10 h-10 text-slate-300 mx-auto stroke-[1.5]" />
                        <div className="text-sm font-bold text-slate-600">No Support Tickets Found</div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filtered.map((ticket, tIdx) => {
                        const isReplying = activeReplyingTicketId === ticket.id;
                        // Sequential ticket ID format starting from QK-TK-1001, strictly matching user-facing website
                        const formattedTicketId = formatTicketId(ticket.id, tIdx + 1);

                        // Messages array resolution
                        const messages = ticket.messages && Array.isArray(ticket.messages) && ticket.messages.length > 0
                          ? ticket.messages
                          : (ticket.problemDescription ? [{
                              id: `init-${ticket.id}`,
                              sender: 'user' as const,
                              senderName: ticket.userName || 'Player',
                              message: ticket.problemDescription,
                              timestamp: ticket.createdAt || Date.now()
                            }] : []);

                        const hasAdminReplied = Boolean(
                          ticket.adminReply || 
                          (ticket.messages && ticket.messages.some(m => m.sender === 'admin')) || 
                          (ticket as any).adminReplied ||
                          (ticket as any).hasAdminReply
                        );

                        const handleSendAdminReply = () => {
                          if (!adminReplyDraft.trim()) {
                            showToast('Please type a message before sending.');
                            return;
                          }
                          const raw = localStorage.getItem('quizkart_support_tickets');
                          const all: SupportTicket[] = raw ? JSON.parse(raw) : supportTickets;
                          const activeAdminName = editableAdminName.trim() || 'Support';
                          let savedTicket: SupportTicket | null = null;
                          const updated = all.map(t => {
                            if (t.id === ticket.id) {
                              const existingMsgs = t.messages && Array.isArray(t.messages) && t.messages.length > 0
                                ? [...t.messages]
                                : [
                                    {
                                      id: `init-${t.id}`,
                                      sender: 'user' as const,
                                      senderName: t.userName || 'Player',
                                      message: t.problemDescription,
                                      timestamp: t.createdAt || Date.now()
                                    }
                                  ];
                              const newMsg = {
                                id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                                sender: 'admin' as const,
                                senderName: activeAdminName,
                                message: adminReplyDraft.trim(),
                                timestamp: Date.now()
                              };
                              savedTicket = {
                                ...t,
                                adminReply: adminReplyDraft.trim(),
                                adminRepliedAt: Date.now(),
                                adminName: activeAdminName,
                                status: 'Resolved',
                                userReadAdminReply: false,
                                messages: [...existingMsgs, newMsg]
                              };
                              return savedTicket;
                            }
                            return t;
                          });
                          localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
                          setSupportTickets(updated);
                          if (savedTicket) {
                            saveSupportTicketToFirestore(savedTicket).catch(() => {});
                          }
                          window.dispatchEvent(new Event('quizkart_support_tickets_updated'));
                          window.dispatchEvent(new Event('storage'));
                          soundFx.playSuccess();
                          showToast(`Response sent for Ticket ${formattedTicketId}!`);
                          setActiveReplyingTicketId(null);
                          setAdminReplyDraft('');
                        };

                        return (
                          /* CARD CONTAINER: Pure White (#FFFFFF) background */
                          <div 
                            key={ticket.id}
                            className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs hover:border-slate-300 transition-all w-full max-w-full box-border"
                            style={{ backgroundColor: '#FFFFFF' }}
                          >
                            {/* HEADER ROW:
                                - Back arrow (←) on top-left to navigate back from ticket view
                                - Checkmark (✅) on LEFT side of Ticket ID (rendered ONLY after admin replied)
                                - ID Hash Symbol (#) Removed & Synchronized sequential format
                                - Right-Side Vertical Stacking (Image 2):
                                  1. Top Position: Status badge directly to the right of Ticket ID
                                  2. Middle Position: Category tag directly BELOW status badge
                                  3. Bottom Position: Trash/Delete icon button directly BELOW category tag
                                - Strict In-Box Alignment: All three stacked elements stay strictly within right inner padding without overflowing or clipping */}
                            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 w-full min-w-0">
                              <div className="flex items-center gap-2 pt-0.5 min-w-0">
                                {isReplying && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      soundFx.playClick();
                                      setActiveReplyingTicketId(null);
                                      setAdminReplyDraft('');
                                    }}
                                    className="p-1 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                                    title="Back to Tickets"
                                    aria-label="Back to Tickets"
                                  >
                                    <ArrowLeft className="w-4 h-4 text-[#4A7DF3]" />
                                  </button>
                                )}
                                {hasAdminReplied && (
                                  <span title="Admin Replied" className="flex items-center shrink-0">
                                    <CheckCircle2 className="w-4 h-4 text-[#4A7DF3]" style={{ color: '#4A7DF3' }} />
                                  </span>
                                )}
                                <span className="font-mono font-black text-sm text-slate-900 tracking-tight shrink-0">
                                  {formattedTicketId}
                                </span>
                              </div>

                              {/* Right-Side Vertical Stacking: flex-col items-end gap-1.5 */}
                              <div className="flex flex-col items-end gap-1.5 shrink-0 ml-auto max-w-full">
                                {/* 1. Top Position: Status badge directly to the right of Ticket ID */}
                                <select
                                  value={ticket.status}
                                  onChange={(e) => {
                                    const newStatus = e.target.value as 'Open' | 'In Progress' | 'Resolved';
                                    const raw = localStorage.getItem('quizkart_support_tickets');
                                    const all: SupportTicket[] = raw ? JSON.parse(raw) : supportTickets;
                                    const updated = all.map(t => t.id === ticket.id ? { ...t, status: newStatus } : t);
                                    localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
                                    setSupportTickets(updated);
                                    saveSupportTicketToFirestore({ ...ticket, status: newStatus }).catch(() => {});
                                    window.dispatchEvent(new Event('quizkart_support_tickets_updated'));
                                    showToast(`Ticket ${formattedTicketId} updated to ${newStatus}`);
                                  }}
                                  className={`appearance-none px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer text-center transition-all ${
                                    ticket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    ticket.status === 'In Progress' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                    'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                  style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                                >
                                  <option value="Open" className="text-slate-800 bg-white">Open</option>
                                  <option value="In Progress" className="text-slate-800 bg-white">In Progress</option>
                                  <option value="Resolved" className="text-slate-800 bg-white">Resolved</option>
                                </select>

                                {/* 2. Middle Position: Category tag directly BELOW status badge */}
                                <span 
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-2xs whitespace-nowrap text-center"
                                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                                >
                                  {ticket.category}
                                </span>

                                {/* 3. Bottom Position: Trash/Delete icon button directly BELOW category tag */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTicketPermanently(ticket.id, formattedTicketId);
                                  }}
                                  className="p-1.5 rounded-lg border border-[#4A7DF3]/30 bg-blue-50/40 text-[#4A7DF3] hover:bg-[#4A7DF3] hover:text-white transition-all cursor-pointer shadow-2xs flex items-center justify-center self-end"
                                  title="Delete Ticket"
                                  aria-label="Delete Ticket"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* User & Ticket Details:
                                - USER INFORMATION rendered in crisp solid black text
                                - DATE & LINK replaced with Transaction Reference, rendered without truncation
                                - ATTACHED PROOF strictly renamed to View Proof */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-black font-black text-xs uppercase tracking-wider block mb-1">
                                  USER INFORMATION
                                </span>
                                <span className="font-bold text-slate-900 block text-xs sm:text-sm">{ticket.userName || 'Player'}</span>
                                <span className="text-slate-600 block text-xs">{ticket.userEmail}</span>
                                {ticket.userPhone && <span className="text-slate-600 block font-mono text-xs">{ticket.userPhone}</span>}
                              </div>

                              <div>
                                <span className="text-black font-black text-xs uppercase tracking-wider block mb-1">
                                  Transaction Reference
                                </span>
                                <span className="text-slate-600 block text-xs">{new Date(ticket.createdAt).toLocaleString()}</span>
                                <span className="text-[#4A7DF3] font-bold block text-xs mt-1 break-words whitespace-normal leading-relaxed">
                                  {ticket.relatedTransactionDetails || 'General Support Ticket'}
                                </span>
                              </div>

                              <div>
                                <span className="text-black font-black text-xs uppercase tracking-wider block mb-1">
                                  View Proof
                                </span>
                                {ticket.screenshotUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedScreenshotModal(ticket.screenshotUrl!)}
                                    className="inline-flex items-center gap-1.5 text-xs text-[#4A7DF3] hover:underline font-bold mt-1 cursor-pointer"
                                  >
                                    <ImageIcon className="w-4 h-4 text-[#4A7DF3]" />
                                    <span>View Proof</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-xs">None attached</span>
                                )}
                              </div>
                            </div>

                            {/* WhatsApp-Style Conversation Interface:
                                - Centered date dividers (Today, Yesterday)
                                - No timestamps in header line next to usernames
                                - Timestamps inside each message bubble at the bottom right
                                - Admin message bubble in primary brand gradient */}
                            <div 
                              className="p-3.5 rounded-2xl bg-white border border-slate-200/80 space-y-2.5"
                              style={{ backgroundColor: '#FFFFFF' }}
                            >
                              {isReplying && (
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      soundFx.playClick();
                                      setActiveReplyingTicketId(null);
                                      setAdminReplyDraft('');
                                    }}
                                    className="p-1 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                                    title="Back to Tickets"
                                    aria-label="Back to Tickets"
                                  >
                                    <ArrowLeft className="w-4 h-4 text-[#4A7DF3]" />
                                    <span className="text-xs font-bold text-slate-700">Back</span>
                                  </button>
                                  <span className="text-[11px] font-mono font-bold text-slate-400">{formattedTicketId}</span>
                                </div>
                              )}
                              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {messages.map((msg, mIdx) => {
                                  const isUser = msg.sender === 'user';
                                  const msgDateLabel = getAdminMessageDateLabel(msg.timestamp);
                                  const prevMsg = mIdx > 0 ? messages[mIdx - 1] : null;
                                  const prevDateLabel = prevMsg ? getAdminMessageDateLabel(prevMsg.timestamp) : null;
                                  const showDateSeparator = mIdx === 0 || msgDateLabel !== prevDateLabel;
                                  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

                                  return (
                                    <React.Fragment key={msg.id || mIdx}>
                                      {/* Centered Date Separator */}
                                      {showDateSeparator && (
                                        <div className="flex items-center justify-center my-2">
                                          <span className="px-3 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/60 shadow-2xs">
                                            {msgDateLabel}
                                          </span>
                                        </div>
                                      )}

                                      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                                        <div 
                                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs space-y-1 shadow-2xs ${
                                            isUser 
                                              ? 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs' 
                                              : 'text-white rounded-tr-xs'
                                          }`}
                                          style={!isUser ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
                                        >
                                          {/* Sender name ONLY at top (no timestamp in header) */}
                                          <div className={`text-[10px] font-bold ${isUser ? 'text-[#4A7DF3]' : 'text-white/90'}`}>
                                            {msg.senderName || (isUser ? (ticket.userName || 'Player') : editableAdminName)}
                                          </div>
                                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                          {/* Precise WhatsApp-style timestamp at bottom right inside bubble */}
                                          <div className={`text-[10px] text-right font-medium pt-0.5 ${isUser ? 'text-slate-400' : 'text-white/75'}`}>
                                            {timeStr}
                                          </div>
                                        </div>
                                      </div>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Reply Input Bar (Divider border-t removed per instructions) */}
                            {!isReplying ? (
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  placeholder=""
                                  onFocus={() => {
                                    setActiveReplyingTicketId(ticket.id);
                                    setAdminReplyStatus('Resolved');
                                    setAdminReplyDraft('');
                                  }}
                                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:border-[#4A7DF3]"
                                  style={{ backgroundColor: '#FFFFFF' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveReplyingTicketId(ticket.id);
                                    setAdminReplyStatus('Resolved');
                                  }}
                                  className="w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                                  title="Send"
                                  aria-label="Send"
                                >
                                  <Send className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            ) : (
                              <div 
                                className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3"
                                style={{ backgroundColor: '#FFFFFF' }}
                              >
                                {/* Quick Response Shortcuts: Render over Pure White (#FFFFFF) background with standard operational short responses */}
                                <div 
                                  className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-white border border-slate-200/80"
                                  style={{ backgroundColor: '#FFFFFF' }}
                                >
                                  {[
                                    'Deposit received, account updated.',
                                    'Ticket closed due to inactivity.',
                                    'We have verified your deposit and credited ₹ to your wallet.',
                                    'Withdrawal processed successfully via bank API. Please check your account.',
                                    'Please provide the 12-digit bank UTR reference for verification.',
                                    'Your query has been resolved by our support team.'
                                  ].map((canned, cIdx) => (
                                    <button
                                      key={cIdx}
                                      type="button"
                                      onClick={() => setAdminReplyDraft(canned)}
                                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] text-slate-700 hover:text-slate-900 hover:border-slate-300 cursor-pointer shadow-2xs font-medium"
                                      style={{ backgroundColor: '#FFFFFF' }}
                                    >
                                      + {canned}
                                    </button>
                                  ))}
                                </div>

                                {/* Send Button & Input Box on the SAME horizontal line with slightly reduced width */}
                                <div className="flex items-center gap-2 pt-1 w-full">
                                  <textarea
                                    rows={1}
                                    value={adminReplyDraft}
                                    onChange={(e) => setAdminReplyDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendAdminReply();
                                      }
                                    }}
                                    placeholder=""
                                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:border-[#4A7DF3] resize-none min-h-[44px] max-h-[84px] leading-normal"
                                    style={{ backgroundColor: '#FFFFFF' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={handleSendAdminReply}
                                    className="w-11 h-11 rounded-xl text-white font-bold shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0"
                                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                                    title="Send Response"
                                    aria-label="Send Response"
                                  >
                                    <Send className="w-4 h-4 text-white" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Full-Screen Fit-Screen Payment Proof Lightbox Modal for Maximum Visual Clarity */}
      {selectedScreenshotModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150"
          onClick={() => setSelectedScreenshotModal(null)}
        >
          <div 
            className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Pure White Theme */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 tracking-wide">
                  Payment Screenshot Proof
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={normalizeImageUrl(selectedScreenshotModal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Open original image in new tab"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open Full Size</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedScreenshotModal(null)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close proof modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Fit-Screen Image Container: Pure White (#FFFFFF) Backdrop for Full Clarity & Complete Scaling */}
            <div 
              className="flex-1 w-full h-full p-3 sm:p-6 flex items-center justify-center overflow-auto bg-white"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              {normalizeImageUrl(selectedScreenshotModal) ? (
                <img 
                  src={normalizeImageUrl(selectedScreenshotModal)} 
                  alt="Payment Screenshot Proof" 
                  referrerPolicy="no-referrer"
                  className="max-h-[82vh] max-w-full w-auto h-auto object-contain rounded-2xl shadow-sm border border-slate-200" 
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Password Protection Security Modal for Deposit QR */}
      {isQrSecurityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Security Verification</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsQrSecurityModalOpen(false);
                  setQrSecurityPassword('');
                  setQrSecurityError(null);
                  setShowQrPassword(false);
                }}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <form onSubmit={handleVerifyQrPassword} className="space-y-4">
                <div>
                  <div className="relative">
                    <input
                      type={showQrPassword ? 'text' : 'password'}
                      value={qrSecurityPassword}
                      onChange={(e) => {
                        setQrSecurityPassword(e.target.value);
                        setQrSecurityError(null);
                      }}
                      placeholder="Enter Security Password"
                      autoFocus
                      autoComplete="off"
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="w-full pl-4 pr-11 py-3 rounded-xl border border-slate-200 text-xs text-slate-900 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowQrPassword(!showQrPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                      title={showQrPassword ? 'Hide password' : 'Show password'}
                    >
                      {showQrPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {qrSecurityError && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{qrSecurityError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsQrSecurityModalOpen(false);
                      setQrSecurityPassword('');
                      setQrSecurityError(null);
                      setShowQrPassword(false);
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    Verify Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 10-Question Block Registration ID Passcode Verification Modal */}
      {passcodeModalBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#EAECF0] space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Security Verification
              </h3>
            </div>

            <form onSubmit={handleVerifyPasscode} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (passcodeError) setPasscodeError('');
                  }}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAECF0] text-sm text-slate-900 focus:outline-none focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3]/20"
                />
                {passcodeError && (
                  <p className="text-xs text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passcodeError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPasscodeModalBlock(null);
                    setPasscodeInput('');
                    setPasscodeError('');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  Unlock ID
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
