import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  MoreVertical,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trophy,
  Calendar,
  Pencil,
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  User,
  Phone,
  Mail,
  Camera,
  UserCog,
  Loader2,
  Search
} from 'lucide-react';
import { UserProfile, DepositRequest, WithdrawalRequest, QuizAttemptResult } from '../types';
import { soundFx } from '../utils/audio';
import { DepositPage } from './DepositPage';
import { WithdrawModal } from './WithdrawModal';
import { TransactionHistoryPage } from './TransactionHistoryPage';

const ITEMS_PER_PAGE = 3;
const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

interface CountryCallingCode {
  name: string;
  code: string;
  flag: string;
}

const COUNTRY_CALLING_CODES: CountryCallingCode[] = [
  { name: 'India', code: '+91', flag: '🇮🇳' },
  { name: 'United States', code: '+1', flag: '🇺🇸' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪' },
  { name: 'Canada', code: '+1', flag: '🇨🇦' },
  { name: 'Australia', code: '+61', flag: '🇦🇺' },
  { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { name: 'Singapore', code: '+65', flag: '🇸🇬' },
  { name: 'Germany', code: '+49', flag: '🇩🇪' },
  { name: 'France', code: '+33', flag: '🇫🇷' },
  { name: 'Japan', code: '+81', flag: '🇯🇵' },
  { name: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { name: 'Pakistan', code: '+92', flag: '🇵🇰' },
  { name: 'Nepal', code: '+977', flag: '🇳🇵' },
  { name: 'Sri Lanka', code: '+94', flag: '🇱🇰' },
  { name: 'Malaysia', code: '+60', flag: '🇲🇾' },
  { name: 'South Africa', code: '+27', flag: '🇿🇦' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'Qatar', code: '+974', flag: '🇶🇦' },
  { name: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { name: 'Oman', code: '+968', flag: '🇴🇲' },
  { name: 'New Zealand', code: '+64', flag: '🇳🇿' },
  { name: 'Indonesia', code: '+62', flag: '🇮🇩' },
  { name: 'Philippines', code: '+63', flag: '🇵🇭' },
  { name: 'Vietnam', code: '+84', flag: '🇻🇳' },
  { name: 'Thailand', code: '+66', flag: '🇹🇭' },
  { name: 'Brazil', code: '+55', flag: '🇧🇷' },
  { name: 'Russia', code: '+7', flag: '🇷🇺' },
  { name: 'Italy', code: '+39', flag: '🇮🇹' },
  { name: 'Spain', code: '+34', flag: '🇪🇸' },
  { name: 'Netherlands', code: '+31', flag: '🇳🇱' },
  { name: 'Switzerland', code: '+41', flag: '🇨🇭' },
  { name: 'Sweden', code: '+46', flag: '🇸🇪' },
  { name: 'Ireland', code: '+353', flag: '🇮🇪' },
];

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=160&auto=format&fit=crop&q=80'
];

interface ProfileWalletProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onEnterQuiz: () => void;
  isQuizActive: boolean;
  currentUser?: { uid: string; displayName: string | null; email: string | null; photoURL?: string | null } | null;
  onGoogleSignIn?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
  deposits?: DepositRequest[];
  onAddDeposit?: (deposit: Omit<DepositRequest, 'id' | 'timestamp' | 'status'>) => void;
  withdrawals?: WithdrawalRequest[];
  onAddWithdrawal?: (withdrawal: Omit<WithdrawalRequest, 'id' | 'timestamp' | 'status'>) => void;
  quizAttempts?: QuizAttemptResult[];
  onOpenDeposit?: () => void;
  onOpenWithdraw?: () => void;
  onOpenEditProfile?: () => void;
  onOpenHistory?: (tab?: 'deposits' | 'withdrawals') => void;
  onOpenAuthModal?: (step?: 1 | 2 | 3) => void;
  onShowNotice?: (msg: string) => void;
  onDeleteAccount?: (deletedUser: UserProfile) => void;
}

function formatParticipationTime(dateStr?: string, submittedAt?: string): string {
  const ts = submittedAt ? new Date(submittedAt) : (dateStr ? new Date(dateStr) : new Date());
  if (isNaN(ts.getTime())) {
    return dateStr || 'Recently';
  }
  const now = new Date();
  const isToday = ts.toDateString() === now.toDateString();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = ts.toDateString() === yesterday.toDateString();

  const timeFormatted = ts.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) {
    return `Today, ${timeFormatted}`;
  }
  if (isYesterday) {
    return `Yesterday, ${timeFormatted}`;
  }
  return `${ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeFormatted}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatWinningAmount(attempt: QuizAttemptResult): string {
  if (attempt.rewardAmount && attempt.rewardAmount > 0) {
    return `₹${attempt.rewardAmount.toLocaleString('en-IN')}`;
  }
  if (attempt.rewardWon) {
    const match = attempt.rewardWon.match(/₹\s*([0-9,]+)/);
    if (match) {
      return `₹${match[1]}`;
    }
    if (attempt.rewardType === 'product') {
      return 'Product';
    }
  }
  return '₹0';
}

export const ProfileWallet: React.FC<ProfileWalletProps> = ({
  userProfile,
  onUpdateProfile,
  onEnterQuiz,
  isQuizActive,
  currentUser,
  onGoogleSignIn,
  onSignOut,
  deposits = [],
  onAddDeposit,
  withdrawals = [],
  onAddWithdrawal,
  quizAttempts = [],
  onOpenDeposit,
  onOpenWithdraw,
  onOpenEditProfile,
  onOpenHistory,
  onOpenAuthModal,
  onShowNotice,
  onDeleteAccount
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isHistoryPageOpen, setIsHistoryPageOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleteSpinnerLoading, setIsDeleteSpinnerLoading] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isConfirmDeleteLoading, setIsConfirmDeleteLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');

  const handleLogoutAndRedirectToStep1 = () => {
    if (isLoggingOut) return;
    soundFx.playClick();
    setIsLoggingOut(true);
    setTimeout(async () => {
      try {
        const rawSessions = localStorage.getItem('quizkart_active_sessions');
        if (rawSessions) {
          const sessions = JSON.parse(rawSessions);
          const emailKey = (userProfile.email || '').trim().toLowerCase();
          if (emailKey && sessions[emailKey]) {
            delete sessions[emailKey];
            localStorage.setItem('quizkart_active_sessions', JSON.stringify(sessions));
          }
        }
        window.dispatchEvent(new CustomEvent('quizkart_presence_updated'));
      } catch {}
      try {
        if (onSignOut) {
          await onSignOut();
        }
      } catch {}
      setIsLoggingOut(false);
      if (onOpenAuthModal) {
        onOpenAuthModal(1);
      }
    }, 1000);
  };

  const handleDeleteAccountClick = () => {
    if (isDeleteSpinnerLoading) return;
    soundFx.playClick();
    setIsDeleteSpinnerLoading(true);
    setTimeout(() => {
      setIsDeleteSpinnerLoading(false);
      setIsDeleteConfirmModalOpen(true);
    }, 1000);
  };

  const handleConfirmPermanentDelete = async () => {
    if (isConfirmDeleteLoading) return;
    soundFx.playClick();
    setIsConfirmDeleteLoading(true);

    setTimeout(async () => {
      setIsConfirmDeleteLoading(false);
      setIsDeleteConfirmModalOpen(false);

      const todayStr = new Date().toISOString().split('T')[0];
      const deletedRecord: UserProfile = {
        ...userProfile,
        id: userProfile.id || 'USR-1001',
        isDeleted: true,
        deletedAt: todayStr,
        deletedTimestampMs: Date.now()
      };

      try {
        // 1. Save permanently to Deleted Users list
        const rawDeleted = localStorage.getItem('quizkart_deleted_users');
        const deletedList: UserProfile[] = rawDeleted ? JSON.parse(rawDeleted) : [];
        const safeDeletedList = Array.isArray(deletedList) ? deletedList : [];
        const filteredDeleted = safeDeletedList.filter(
          (u) =>
            u &&
            (u.email || '').toLowerCase() !== (deletedRecord.email || '').toLowerCase() &&
            (u.id || '') !== (deletedRecord.id || '')
        );
        const nextDeletedList = [deletedRecord, ...filteredDeleted];
        localStorage.setItem('quizkart_deleted_users', JSON.stringify(nextDeletedList));

        // 2. Remove from Active Registered Users list
        const rawReg = localStorage.getItem('quizkart_registered_users');
        if (rawReg) {
          const regList: UserProfile[] = JSON.parse(rawReg);
          if (Array.isArray(regList)) {
            const nextRegList = regList.filter(
              (u) =>
                u &&
                (u.email || '').toLowerCase() !== (deletedRecord.email || '').toLowerCase() &&
                (u.mobile || '').replace(/\D/g, '') !== (deletedRecord.mobile || '').replace(/\D/g, '') &&
                (u.id || '') !== (deletedRecord.id || '')
            );
            localStorage.setItem('quizkart_registered_users', JSON.stringify(nextRegList));
          }
        }

        // 3. Remove from active online sessions
        const rawSessions = localStorage.getItem('quizkart_active_sessions');
        if (rawSessions) {
          const sessions = JSON.parse(rawSessions);
          const emailKey = (deletedRecord.email || '').trim().toLowerCase();
          if (emailKey && sessions[emailKey]) {
            delete sessions[emailKey];
            localStorage.setItem('quizkart_active_sessions', JSON.stringify(sessions));
          }
        }
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('quizkart_user_deleted', { detail: deletedRecord }));
        window.dispatchEvent(new CustomEvent('quizkart_account_deleted', { detail: deletedRecord }));
        window.dispatchEvent(new CustomEvent('quizkart_presence_updated'));
      }

      onDeleteAccount?.(deletedRecord);

      try {
        if (onSignOut) {
          await onSignOut();
        }
      } catch {}

      if (onOpenAuthModal) {
        onOpenAuthModal(1);
      }
    }, 1000);
  };
  const [customDate, setCustomDate] = useState<string>('');

  // Pagination state (Limit to 3 items per page)
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Email truncation toggle state
  const [isEmailExpanded, setIsEmailExpanded] = useState<boolean>(false);

  // Edit Profile state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editName, setEditName] = useState(userProfile.name);
  const [editMobile, setEditMobile] = useState(userProfile.mobile);
  const [selectedCountryCode, setSelectedCountryCode] = useState(userProfile.countryCode || '+91');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [editAvatar, setEditAvatar] = useState(userProfile.avatarUrl || currentUser?.photoURL || '');
  const [editError, setEditError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Reset pagination when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, customDate]);

  // Keep edit fields in sync when userProfile updates
  useEffect(() => {
    setEditName(userProfile.name);
    setEditMobile(userProfile.mobile);
    setSelectedCountryCode(userProfile.countryCode || '+91');
    setEditAvatar(userProfile.avatarUrl || currentUser?.photoURL || '');
  }, [userProfile, currentUser]);

  // Click outside to close country calling code dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };
    if (isCountryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCountryDropdownOpen]);

  const openEditModal = () => {
    setEditName(userProfile.name);
    setEditMobile(userProfile.mobile);
    setSelectedCountryCode(userProfile.countryCode || '+91');
    setEditAvatar(userProfile.avatarUrl || currentUser?.photoURL || '');
    setEditError(null);
    setIsSaving(false);
    setIsCountryDropdownOpen(false);
    setCountrySearch('');
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!editName.trim()) {
      setEditError('Please enter your full name');
      return;
    }
    const cleanMobile = editMobile.replace(/\D/g, '');
    if (cleanMobile.length < 7 || cleanMobile.length > 15) {
      setEditError('Please enter a valid mobile number (7-15 digits)');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    // 1-second smooth spinning loader simulation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const updatedProfile: UserProfile = {
      ...userProfile,
      name: editName.trim(),
      mobile: cleanMobile,
      countryCode: selectedCountryCode,
      avatarUrl: editAvatar.trim() || undefined,
      address: {
        ...userProfile.address,
        fullName: editName.trim(),
        phoneNumber: cleanMobile
      }
    };

    try {
      localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedProfile));
    } catch {}

    onUpdateProfile(updatedProfile);
    soundFx.playSuccess();
    setIsSaving(false);
    setIsEditProfileOpen(false);
    setEditError(null);
  };

  const filteredCountries = COUNTRY_CALLING_CODES.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) || 
    c.code.includes(countrySearch)
  );
  const currentCountry = COUNTRY_CALLING_CODES.find(c => c.code === selectedCountryCode) || COUNTRY_CALLING_CODES[0];

  // Fallback to local storage cache to guarantee 100% data integrity & persistence
  const effectiveAttempts: QuizAttemptResult[] = (quizAttempts && quizAttempts.length > 0)
    ? quizAttempts
    : (() => {
        try {
          const stored = localStorage.getItem('quizkart_user_quiz_attempts');
          if (stored) return JSON.parse(stored);
        } catch {}
        return [];
      })();

  const filteredHistory = effectiveAttempts.filter(item => {
    const itemDate = item.submittedAt 
      ? new Date(item.submittedAt) 
      : (item.quizDate ? new Date(item.quizDate) : new Date());
    const now = new Date();
    
    if (dateFilter === 'today') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (dateFilter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      return itemDate.toDateString() === yesterday.toDateString();
    }
    if (dateFilter === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return itemDate >= sevenDaysAgo && itemDate <= now;
    }
    if (dateFilter === 'custom' && customDate) {
      const itemDateStr = itemDate.toISOString().split('T')[0];
      return itemDateStr === customDate;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil((filteredHistory || []).length / ITEMS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedHistory = (filteredHistory || []).slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);

  return (
    <div className="w-full space-y-4 sm:space-y-5 pb-6">
      {/* Blocked Account Notice Banner */}
      {userProfile.isBlocked && (
        <div
          id="account-blocked-banner"
          className="rounded-2xl bg-rose-50 border-2 border-rose-300 p-4 flex items-start gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex-1">
            <h3 className="text-xs sm:text-sm font-black text-rose-900 uppercase tracking-wide">
              Account Blocked
            </h3>
            <p className="text-xs text-rose-700 font-medium mt-0.5 leading-relaxed">
              Your account has been suspended by Admin.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CARD 1: USER IDENTITY CARD (HEADER) (IMAGE 5 REF)             */}
      {/* ------------------------------------------------------------- */}
      <div id="user-identity-card" className="rounded-2xl bg-white text-slate-900 p-5 sm:p-6 border border-slate-200/90 shadow-sm relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* User Avatar */}
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl text-white flex items-center justify-center font-black text-xl sm:text-2xl shadow-sm shrink-0 select-none overflow-hidden"
              style={{ background: BRAND_GRADIENT }}
            >
              {(userProfile.avatarUrl || currentUser?.photoURL) ? (
                <img src={(userProfile.avatarUrl || currentUser?.photoURL)!} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : (
                <span>{userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}</span>
              )}
            </div>

            {/* Name, Edit Pencil Icon (Signature Gradient), Phone/Email Toggle */}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">{userProfile.name}</h2>
                <button
                  type="button"
                  id="profile-edit-pencil-btn"
                  onClick={() => {
                    soundFx.playClick();
                    if (onOpenEditProfile) {
                      onOpenEditProfile();
                    } else {
                      openEditModal();
                    }
                  }}
                  className="w-7 h-7 rounded-lg text-white shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center"
                  style={{ background: BRAND_GRADIENT }}
                  title="Edit Profile"
                  aria-label="Edit Profile"
                >
                  <Pencil className="w-3.5 h-3.5 text-white stroke-[2.2]" />
                </button>
              </div>

              {/* Truncated / Expanded Email with Signature Gradient Toggle */}
              {(() => {
                const fullEmail = userProfile?.email || currentUser?.email || 'player@quizkart.in';
                const isLong = (fullEmail || '').length > 15;
                const truncated = isLong ? `${(fullEmail || '').slice(0, 13)}...` : fullEmail;

                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-medium">
                    <span className="shrink-0 font-semibold text-slate-600">
                      {userProfile.countryCode || '+91'} {userProfile.mobile}
                    </span>
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <span className="text-slate-600 font-medium truncate max-w-[200px] sm:max-w-none">
                        {isEmailExpanded ? fullEmail : truncated}
                      </span>
                      {isLong && (
                        <button
                          type="button"
                          id="profile-email-view-toggle"
                          onClick={() => {
                            soundFx.playClick();
                            setIsEmailExpanded(prev => !prev);
                          }}
                          className="text-[11px] font-black cursor-pointer hover:opacity-85 transition-opacity select-none shrink-0"
                          style={{
                            background: BRAND_GRADIENT,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}
                        >
                          {isEmailExpanded ? 'View Less' : 'View More'}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CARD 2: WALLET STATS & ACTION BUTTONS (IMAGE 5 REF)           */}
      {/* ------------------------------------------------------------- */}
      <div id="wallet-stats-card" className="rounded-2xl bg-white text-slate-900 p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-4 sm:space-y-5">
        {/* Top Row: 3 Key Statistics Side-by-Side (Background completely untouched) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
          {/* Wallet Credits (Deep Emerald Green Value) */}
          <div className="bg-emerald-50/70 rounded-2xl p-3 sm:p-4 text-center border border-emerald-200 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs text-emerald-800 uppercase tracking-wider font-bold flex flex-col items-center justify-center leading-tight">
              <span>WALLET</span>
              <span>CREDITS</span>
            </span>
            <span className="text-base sm:text-xl md:text-2xl font-black text-[#059669] mt-1">
              ₹{userProfile.walletBalance ?? 0}
            </span>
          </div>

          {/* Total Won (Royal Indigo/Purple Value with soft modern tint - Stacked TOTAL WON aligned with WALLET CREDITS) */}
          <div className="bg-indigo-50/70 rounded-2xl p-3 sm:p-4 text-center border border-indigo-200/80 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs text-indigo-800 uppercase tracking-wider font-bold flex flex-col items-center justify-center leading-tight">
              <span>TOTAL</span>
              <span>WON</span>
            </span>
            <span className="text-base sm:text-xl md:text-2xl font-black text-[#6366F1] mt-1">
              ₹{userProfile.totalWonAmount ?? 0}
            </span>
          </div>

          {/* Quizzes Played (Dark Slate Value with soft modern tint) */}
          <div className="bg-slate-100/70 rounded-2xl p-3 sm:p-4 text-center border border-slate-200/90 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs text-slate-600 uppercase tracking-wider font-bold flex flex-col items-center justify-center leading-tight">
              <span>QUIZZES</span>
              <span>PLAYED</span>
            </span>
            <span className="text-base sm:text-xl md:text-2xl font-black text-[#1E293B] mt-1">
              {userProfile.quizzesPlayed ?? 0}
            </span>
          </div>
        </div>

        {/* Bottom Row: Primary Action Buttons Side-by-Side (Restored Signature 3-Color Primary Gradient) */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 pt-0.5">
          {/* Deposit Button (Signature 3-Color Primary Gradient) */}
          <button
            type="button"
            id="profile-deposit-btn"
            onClick={() => {
              if (userProfile.isBlocked) {
                soundFx.playWrong();
                onShowNotice?.('Account Blocked by Admin: Deposits are restricted for this account.');
                return;
              }
              soundFx.playClick();
              if (onOpenDeposit) {
                onOpenDeposit();
              } else {
                setIsDepositModalOpen(true);
              }
            }}
            className={`py-3 px-3.5 sm:px-4 rounded-xl text-white font-bold text-xs sm:text-sm tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 ${
              userProfile.isBlocked ? 'opacity-60' : ''
            }`}
            style={{ background: BRAND_GRADIENT }}
          >
            <ArrowDownToLine className="w-4 h-4 shrink-0" />
            <span>Deposit</span>
          </button>

          {/* Withdraw Button (Signature 3-Color Primary Gradient) */}
          <button
            type="button"
            id="profile-withdraw-btn"
            onClick={() => {
              if (userProfile.isBlocked) {
                soundFx.playWrong();
                onShowNotice?.('Account Blocked by Admin: Withdrawals are restricted for this account.');
                return;
              }
              soundFx.playClick();
              if (onOpenWithdraw) {
                onOpenWithdraw();
              } else {
                setIsWithdrawModalOpen(true);
              }
            }}
            className={`py-3 px-3.5 sm:px-4 rounded-xl text-white font-bold text-xs sm:text-sm tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 ${
              userProfile.isBlocked ? 'opacity-60' : ''
            }`}
            style={{ background: BRAND_GRADIENT }}
          >
            <ArrowUpFromLine className="w-4 h-4 shrink-0" />
            <span>Withdraw</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. RECENT QUIZ ACTIVITY (IMAGES 1 & 2 REF)                    */}
      {/* ------------------------------------------------------------- */}
      <div id="recent-quiz-activity-card" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-3.5">
        {/* Header with Signature 3-Color Gradient Icon & Date Range Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              <Trophy className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-slate-900 font-bold text-sm tracking-tight">Recent Quiz Activity</span>
          </div>

          {/* Interactive Date Range Filter Dropdown */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div 
              className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 text-xs text-slate-700 font-semibold hover:border-slate-300 transition-colors shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <Trophy className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <select
                id="activity-date-filter"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer pr-1"
                aria-label="Filter past quiz activity by date range"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">Last 7 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateFilter === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="text-xs bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 text-slate-700 outline-none font-medium"
                style={{ backgroundColor: '#FFFFFF' }}
              />
            )}
          </div>
        </div>

        {/* Real-time Quiz Activity List (3-Row Layout & Empty State) */}
        <div className="space-y-2.5">
          {filteredHistory.length === 0 ? (
            <div 
              id="no-recent-activity-container" 
              className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-white flex items-center justify-center shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <p className="text-xs sm:text-sm font-bold text-slate-700">No Recent Quiz Activity</p>
            </div>
          ) : (
            paginatedHistory.map((item, idx) => (
              <div 
                key={item.attemptId || `att-${idx}`} 
                className="p-3.5 sm:p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all shadow-2xs space-y-2"
              >
                {/* Row 1 (Title & Rank): Tournament Title (Left), Rank Badge (Far Right Edge) */}
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {item.title || 'Cash Tournament'}
                  </h4>
                  <span 
                    className="text-[10px] sm:text-xs font-extrabold px-2.5 py-0.5 rounded-full text-white shadow-2xs shrink-0"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    Rank {item.rank || 1}
                  </span>
                </div>

                {/* Row 2 (Joining Time & Score): Timestamp (Left), Score Badge/Text (Far Right Edge) */}
                <div className="flex items-center justify-between gap-3 text-[11px] sm:text-xs">
                  <span className="text-slate-500 font-medium truncate">
                    {formatParticipationTime(item.quizDate, item.submittedAt)}
                  </span>
                  <span className="text-slate-700 font-semibold shrink-0">
                    Score: <strong className="text-slate-900 font-bold">{item.score}/{item.totalQuestions || 10}</strong>
                  </span>
                </div>

                {/* Row 3 (Time Taken & Winning Amount): Time Taken (Left), Payout Amount (Far Right Edge) */}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                  <span className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                    Time Taken: <strong className="text-slate-800 font-bold">{formatDuration(item.timeTakenSeconds)}</strong>
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-600 shrink-0">
                    {formatWinningAmount(item)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Section 2: Pagination Badge / Controls on the right side below activity items */}
        {filteredHistory.length > 0 && (
          <div className="flex justify-end pt-1">
            <div 
              id="recent-activity-pagination-badge" 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-xs text-white select-none"
              style={{ background: BRAND_GRADIENT }}
            >
              <button
                type="button"
                disabled={activePage <= 1}
                onClick={() => {
                  soundFx.playClick();
                  setCurrentPage(p => Math.max(1, p - 1));
                }}
                className="p-1 rounded-lg hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
                title="Previous Page"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </button>

              <span className="px-1 text-xs tracking-wider font-extrabold text-white">
                {activePage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={activePage >= totalPages}
                onClick={() => {
                  soundFx.playClick();
                  setCurrentPage(p => Math.min(totalPages, p + 1));
                }}
                className="p-1 rounded-lg hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
                title="Next Page"
                aria-label="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. BRAND GRADIENT LOGOUT BUTTON & SOLID RED DELETE ACCOUNT BUTTON */}
      {/* ------------------------------------------------------------- */}
      <div className="w-full space-y-3">
        <button
          type="button"
          id="profile-logout-btn"
          disabled={isLoggingOut}
          onClick={handleLogoutAndRedirectToStep1}
          style={{ background: BRAND_GRADIENT, color: '#FFFFFF' }}
          className="w-full min-h-[56px] sm:min-h-[60px] px-8 py-4 text-sm sm:text-base font-extrabold text-white hover:opacity-95 active:scale-[0.99] rounded-2xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-75"
        >
          {isLoggingOut ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Logging out...</span>
            </>
          ) : (
            <span>Logout</span>
          )}
        </button>

        <button
          type="button"
          id="profile-delete-account-btn"
          disabled={isDeleteSpinnerLoading}
          onClick={handleDeleteAccountClick}
          style={{ backgroundColor: '#E53E3E', color: '#FFFFFF' }}
          className="w-full min-h-[56px] sm:min-h-[60px] px-8 py-4 text-sm sm:text-base font-extrabold text-white hover:opacity-95 active:scale-[0.99] rounded-2xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-75"
        >
          {isDeleteSpinnerLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          ) : (
            <span>Delete Account</span>
          )}
        </button>
      </div>

      {/* Permanent Account Deletion Confirmation Modal */}
      {isDeleteConfirmModalOpen && (
        <div
          id="delete-account-confirm-modal"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-center animate-in zoom-in-95 duration-200">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-relaxed">
              Are you sure you want to permanently delete your account?
            </h3>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                id="cancel-delete-account-btn"
                onClick={() => {
                  soundFx.playClick();
                  setIsDeleteConfirmModalOpen(false);
                }}
                className="py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-account-btn"
                disabled={isConfirmDeleteLoading}
                onClick={handleConfirmPermanentDelete}
                style={{ backgroundColor: '#E53E3E', color: '#FFFFFF' }}
                className="py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md hover:opacity-95 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 disabled:opacity-80"
              >
                {isConfirmDeleteLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <span>Delete Account</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TRANSACTION HISTORY FULL-SCREEN PAGE (Fallback if no router)  */}
      {/* ------------------------------------------------------------- */}
      {isHistoryPageOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto p-4 sm:p-6 flex flex-col justify-start items-center animate-in fade-in duration-200">
          <TransactionHistoryPage
            userProfile={userProfile}
            deposits={deposits}
            withdrawals={withdrawals}
            onBack={() => setIsHistoryPageOpen(false)}
          />
        </div>
      )}

      {/* Full-Page Deposit Screen Fallback */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto p-4 sm:p-6 flex flex-col justify-start items-center animate-in fade-in duration-200">
          <DepositPage
            userProfile={userProfile}
            onUpdateProfile={onUpdateProfile}
            deposits={deposits}
            onAddDeposit={(dep) => {
              onAddDeposit?.(dep);
            }}
            onBackToDashboard={() => {
              setIsDepositModalOpen(false);
            }}
            onBackToProfile={() => {
              setIsDepositModalOpen(false);
            }}
          />
        </div>
      )}

      {/* Withdraw Modal (Bank Account Transfer, Min 100 - Max 5000) */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        walletBalance={userProfile.walletBalance}
        userName={userProfile.name}
        userPhone={userProfile.mobile}
        onSubmitWithdrawal={(wth) => {
          onAddWithdrawal?.(wth);
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* EDIT PROFILE MODAL (Name, Mobile, Avatar; Email Strictly Read-Only) */}
      {/* ------------------------------------------------------------- */}
      {isEditProfileOpen && (
        <div 
          id="edit-profile-modal-overlay" 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div 
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <UserCog className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">Edit Profile</h3>
                </div>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  soundFx.playClick();
                  setIsEditProfileOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer disabled:opacity-50"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveProfile} className="p-4 sm:p-5 space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
                  {editError}
                </div>
              )}

              {/* 1. Avatar Selector & Preview - Compact & Instant Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Profile Picture / Avatar</label>
                <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  {/* Current Avatar Preview */}
                  <div 
                    className="w-13 h-13 rounded-xl text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0 overflow-hidden border-2 border-indigo-200 relative select-none"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {editAvatar ? (
                      <img src={editAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span>{editName ? editName.charAt(0).toUpperCase() : 'U'}</span>
                    )}
                  </div>

                  {/* Preset Avatars & Instant File Upload Trigger */}
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {AVATAR_PRESETS.map((presetUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          setEditAvatar(presetUrl);
                        }}
                        className={`w-7.5 h-7.5 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                          editAvatar === presetUrl ? 'border-indigo-600 scale-110 shadow-xs ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-400'
                        }`}
                        title={`Select Preset Avatar ${idx + 1}`}
                      >
                        {presetUrl ? (
                          <img src={presetUrl} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : null}
                      </button>
                    ))}

                    {/* Instant Camera / Gallery Upload Button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (loadEvt) => {
                            if (typeof loadEvt.target?.result === 'string') {
                              setEditAvatar(loadEvt.target.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                        // Reset so selecting the same or different image always triggers
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      id="edit-profile-camera-upload-btn"
                      onClick={() => {
                        soundFx.playClick();
                        fileInputRef.current?.click();
                      }}
                      className="w-7.5 h-7.5 rounded-full bg-white hover:bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95 shrink-0"
                      title="Upload from Device Gallery"
                      aria-label="Upload Photo"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-700" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Full Name Field - Pure White #FFFFFF Background */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your full name"
                    style={{ backgroundColor: '#ffffff' }}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                  />
                </div>
              </div>

              {/* 3. Mobile Number Field with Interactive Country Code Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Mobile Number</label>
                <div className="flex items-center gap-2">
                  {/* International Country Code Dropdown Selector */}
                  <div className="relative" ref={countryDropdownRef}>
                    <button
                      type="button"
                      id="edit-profile-country-code-btn"
                      onClick={() => setIsCountryDropdownOpen(prev => !prev)}
                      style={{ backgroundColor: '#ffffff' }}
                      className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5 hover:border-indigo-400 active:scale-95 transition-all shadow-2xs cursor-pointer select-none shrink-0"
                      aria-haspopup="listbox"
                      aria-expanded={isCountryDropdownOpen}
                      title="Select Country Calling Code"
                    >
                      <span className="text-base leading-none">{currentCountry?.flag || '🌐'}</span>
                      <span>{selectedCountryCode}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCountryDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Search filter for country codes */}
                        <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            <input
                              type="text"
                              value={countrySearch}
                              onChange={(e) => setCountrySearch(e.target.value)}
                              placeholder="Search country or code..."
                              autoFocus
                              style={{ backgroundColor: '#ffffff' }}
                              className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>

                        {/* Scrollable list of countries */}
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100/60 p-1">
                          {filteredCountries.map((c) => (
                            <button
                              key={`${c.code}-${c.name}`}
                              type="button"
                              onClick={() => {
                                soundFx.playClick();
                                setSelectedCountryCode(c.code);
                                setIsCountryDropdownOpen(false);
                                setCountrySearch('');
                              }}
                              className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded-lg hover:bg-indigo-50/70 transition-colors text-left cursor-pointer ${
                                selectedCountryCode === c.code ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-base">{c.flag}</span>
                                <span className="truncate">{c.name}</span>
                              </div>
                              <span className="font-semibold text-slate-500 ml-2 shrink-0">{c.code}</span>
                            </button>
                          ))}
                          {filteredCountries.length === 0 && (
                            <div className="p-3 text-center text-xs text-slate-400 font-medium">
                              No matching country found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Phone Input - Pure White #FFFFFF Background */}
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      required
                      maxLength={15}
                      value={editMobile}
                      onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, ''))}
                      placeholder="Mobile number"
                      style={{ backgroundColor: '#ffffff' }}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* NOTE: Per Strict User Requirement: "DO NOT display the Email field on this screen (Image 3 / Edit Profile UI)." */}

              {/* Actions - Cancel consistent with action theme, Save Changes with 1s spinner */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    soundFx.playClick();
                    setIsEditProfileOpen(false);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-85"
                  style={{ background: BRAND_GRADIENT }}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

