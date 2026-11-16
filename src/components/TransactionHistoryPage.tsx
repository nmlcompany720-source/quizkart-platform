import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Wallet,
  Calendar,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { DepositRequest, WithdrawalRequest, UserProfile } from '../types';
import { soundFx } from '../utils/audio';
import { formatDepositId, formatWithdrawalId, formatDepositTimestamp } from '../utils/depositUtils';
import {
  auth,
  fetchDepositsFromFirestore,
  subscribeToDepositsFromFirestore,
  fetchWithdrawalsFromFirestore,
  subscribeToWithdrawalsFromFirestore
} from '../firebase';

interface TransactionHistoryPageProps {
  userProfile: UserProfile;
  deposits?: DepositRequest[];
  withdrawals?: WithdrawalRequest[];
  initialTab?: 'deposits' | 'withdrawals';
  onBack: () => void;
}

const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const PAGINATION_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const ITEMS_PER_PAGE = 10;

type DateFilterOption = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom';

export const TransactionHistoryPage: React.FC<TransactionHistoryPageProps> = ({
  userProfile,
  deposits = [],
  withdrawals = [],
  initialTab = 'deposits',
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals'>(initialTab);
  const [currentPage, setCurrentPage] = useState<number>(1);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      setCurrentPage(1);
    }
  }, [initialTab]);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [syncTick, setSyncTick] = useState<number>(0);

  // Real-time synchronization: listen for admin processing (approve/reject/cancel/delete) across tabs and views
  useEffect(() => {
    const handleSync = () => {
      setSyncTick(prev => prev + 1);
    };

    window.addEventListener('quizkart_withdrawal_status_changed', handleSync);
    window.addEventListener('quizkart_deposit_status_changed', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('quizkart_withdrawal_status_changed', handleSync);
      window.removeEventListener('quizkart_deposit_status_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Helper to parse item date
  const getItemDate = (item: { timestamp?: any; createdAt?: any; date?: any }): Date | null => {
    const val = item.timestamp || item.createdAt || item.date;
    if (!val) return null;
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
      const parts = val.split('|');
      if (parts.length > 0) {
        const d2 = new Date(parts[0].trim());
        if (!isNaN(d2.getTime())) return d2;
      }
    }
    return null;
  };

  // Date filtering logic
  const matchesDateFilter = (item: { timestamp?: any; createdAt?: any; date?: any }): boolean => {
    if (dateFilter === 'all') return true;

    const itemDate = getItemDate(item);
    if (!itemDate) return true; // Keep if date is not parseable

    const now = new Date();
    const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    switch (dateFilter) {
      case 'today':
        return itemDay === today;
      case 'yesterday':
        return itemDay === today - oneDay;
      case '7days':
        return itemDay >= today - (7 * oneDay);
      case '30days':
        return itemDay >= today - (30 * oneDay);
      case 'custom': {
        if (!customStartDate && !customEndDate) return true;
        const start = customStartDate ? new Date(customStartDate).getTime() : 0;
        const end = customEndDate ? new Date(customEndDate).getTime() + oneDay - 1 : Infinity;
        return itemDate.getTime() >= start && itemDate.getTime() <= end;
      }
      default:
        return true;
    }
  };

  const [authSessionKey, setAuthSessionKey] = useState<string>(() =>
    auth.currentUser ? `${auth.currentUser.uid}:${(auth.currentUser.email || '').toLowerCase()}` : 'anon'
  );
  const [authUid, setAuthUid] = useState<string>(() => auth.currentUser?.uid || '');
  const [retrySyncTick, setRetrySyncTick] = useState<number>(0);

  useEffect(() => {
    try {
      return onAuthStateChanged(auth, (fbUser) => {
        setAuthUid(fbUser?.uid || '');
        setAuthSessionKey(fbUser ? `${fbUser.uid}:${(fbUser.email || '').toLowerCase()}` : 'anon');
      });
    } catch {
      return () => {};
    }
  }, []);

  // Filter user's specific deposits and withdrawals strictly by logged-in user's exact Email Address
  const currentUserEmail = (userProfile.email || auth.currentUser?.email || '').trim().toLowerCase();
  const currentUid = authUid || userProfile.uid || userProfile.id || '';

  // Direct Firestore real-time synchronization for current user's deposit and withdrawal history
  const [cloudUserDeposits, setCloudUserDeposits] = useState<DepositRequest[]>([]);
  const [cloudUserWithdrawals, setCloudUserWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [hasLoadedCloudWithdrawals, setHasLoadedCloudWithdrawals] = useState<boolean>(false);
  const [isWithdrawalsLoading, setIsWithdrawalsLoading] = useState<boolean>(true);
  const [withdrawalsSyncError, setWithdrawalsSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUserEmail && !currentUid) {
      setCloudUserDeposits([]);
      setCloudUserWithdrawals([]);
      setHasLoadedCloudWithdrawals(false);
      setIsWithdrawalsLoading(false);
      setWithdrawalsSyncError(null);
      return;
    }

    let isActive = true;
    setIsWithdrawalsLoading(true);
    setWithdrawalsSyncError(null);

    fetchDepositsFromFirestore(currentUid, currentUserEmail)
      .then((items) => {
        if (isActive && items && items.length > 0) {
          setCloudUserDeposits(items);
        }
      })
      .catch(() => {});

    const unsubDeps = subscribeToDepositsFromFirestore(
      (items) => {
        if (isActive && items) {
          setCloudUserDeposits(items);
        }
      },
      currentUid,
      currentUserEmail
    );

    fetchWithdrawalsFromFirestore(currentUid, currentUserEmail)
      .then((items) => {
        if (!isActive) return;
        setCloudUserWithdrawals(items || []);
        setHasLoadedCloudWithdrawals(true);
        setIsWithdrawalsLoading(false);
      })
      .catch((err) => {
        if (!isActive) return;
        setIsWithdrawalsLoading(false);
        setWithdrawalsSyncError(err?.message || 'Unable to sync withdrawal history from Firestore.');
      });

    const unsubWths = subscribeToWithdrawalsFromFirestore(
      (items) => {
        if (!isActive) return;
        setCloudUserWithdrawals(items || []);
        setHasLoadedCloudWithdrawals(true);
        setWithdrawalsSyncError(null);
        setIsWithdrawalsLoading(false);
      },
      currentUid,
      currentUserEmail,
      (err: any) => {
        if (!isActive) return;
        setIsWithdrawalsLoading(false);
        setWithdrawalsSyncError(err?.message || 'Real-time withdrawal sync interrupted.');
      }
    );

    return () => {
      isActive = false;
      unsubDeps();
      unsubWths();
    };
  }, [currentUserEmail, currentUid, authSessionKey, retrySyncTick]);

  const rawUserDeposits = useMemo(() => {
    const belongsToCurrentUser = (d: DepositRequest) => {
      if (!d) return false;
      const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
      if (dEmail && currentUserEmail && dEmail !== currentUserEmail) return false;
      if (currentUid && (d.ownerUid === currentUid || d.userId === currentUid)) return true;
      if (!currentUserEmail || !dEmail) return false;
      return dEmail === currentUserEmail;
    };

    // 1. Read permanent user audit log filtered strictly to current user's email
    let permanentList: DepositRequest[] = [];
    try {
      const savedByEmail = localStorage.getItem(`quizkart_user_deposits_permanent_${currentUserEmail}`);
      const savedGlobal = localStorage.getItem('quizkart_user_deposits_permanent');
      const combinedRaw: DepositRequest[] = [
        ...(savedByEmail ? JSON.parse(savedByEmail) : []),
        ...(savedGlobal ? JSON.parse(savedGlobal) : [])
      ];
      if (Array.isArray(combinedRaw)) {
        permanentList = combinedRaw.filter(belongsToCurrentUser);
      }
    } catch {}

    // 2. Filter matching deposits from live props strictly by email or ownerUid
    const matchingFromProps = (deposits || []).filter(belongsToCurrentUser);

    // 3. Merge all sources using stable deposit requestId (zero index reliance, zero disappearing history)
    const map = new Map<string, DepositRequest>();

    // Layer 1: Local storage permanent audit cache
    permanentList.forEach((item) => {
      const stableId = item.id || item.requestId;
      if (stableId) {
        map.set(stableId, item);
      }
    });

    // Layer 2: Props deposits (from App.tsx Firestore listener)
    matchingFromProps.forEach((item) => {
      const stableId = item.id || item.requestId;
      if (stableId) {
        const existing = map.get(stableId);
        map.set(stableId, {
          ...existing,
          ...item,
          id: stableId,
          requestId: item.requestId || stableId,
          userEmail: currentUserEmail || item.userEmail || item.email,
          email: currentUserEmail || item.userEmail || item.email,
          ownerUid: currentUid || item.ownerUid,
          userId: currentUid || item.userId,
          status: item.status || existing?.status || 'pending'
        });
      }
    });

    // Layer 3: Authoritative Firestore user records (highest authority)
    cloudUserDeposits.forEach((item) => {
      const stableId = item.id || item.requestId;
      if (stableId) {
        const existing = map.get(stableId);
        map.set(stableId, {
          ...existing,
          ...item,
          id: stableId,
          requestId: item.requestId || stableId,
          userEmail: currentUserEmail || item.userEmail || item.email,
          email: currentUserEmail || item.userEmail || item.email,
          ownerUid: currentUid || item.ownerUid,
          userId: currentUid || item.userId,
          status: item.status || existing?.status || 'pending'
        });
      }
    });

    return Array.from(map.values())
      .map((d) => ({
        ...d,
        id: d.id || d.requestId,
        requestId: d.requestId || d.id,
        userEmail: currentUserEmail || d.userEmail || d.email,
        email: currentUserEmail || d.userEmail || d.email,
        timestamp: formatDepositTimestamp(d.timestamp, (d as any).createdAt, (d as any).date)
      }))
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
        return timeB - timeA;
      });
  }, [deposits, cloudUserDeposits, currentUserEmail, currentUid, syncTick]);

  const rawUserWithdrawals = useMemo(() => {
    const isBuggedDemoWithdrawal = (w: WithdrawalRequest) => {
      if (!w) return true;
      if (
        (w.id === 'QK-WTH-1001' || formatWithdrawalId(w.id) === 'QK-WTH-1001') &&
        Number(w.amount) === 250 &&
        (String(w.timestamp || '').includes('2026-09-20') || String(w.date || '').includes('2026-09-20'))
      ) {
        return true;
      }
      return false;
    };

    const belongsToCurrentUser = (w: WithdrawalRequest) => {
      if (!w || isBuggedDemoWithdrawal(w)) return false;
      const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
      // Strict cross-user isolation: never allow records with another email
      if (wEmail && currentUserEmail && wEmail !== currentUserEmail) return false;
      if (currentUid && (w.ownerUid === currentUid || w.userId === currentUid)) return true;
      if (!currentUserEmail || !wEmail) return false;
      return wEmail === currentUserEmail;
    };

    const getCanonicalWthKey = (w: WithdrawalRequest): string => {
      const raw = String(w.id || w.requestId || '').trim();
      if (!raw) return '';
      if (/^QK-WTH-\d{4,6}$/i.test(raw)) {
        return raw.toUpperCase();
      }
      return raw;
    };

    // 1. Read permanent user audit log filtered strictly to current user's email
    let permanentList: WithdrawalRequest[] = [];
    try {
      const savedByEmail = currentUserEmail
        ? localStorage.getItem(`quizkart_user_withdrawals_permanent_${currentUserEmail}`)
        : null;
      const savedGlobal = localStorage.getItem('quizkart_user_withdrawals_permanent');
      const combinedRaw: WithdrawalRequest[] = [
        ...(savedByEmail ? JSON.parse(savedByEmail) : []),
        ...(savedGlobal ? JSON.parse(savedGlobal) : [])
      ];
      if (Array.isArray(combinedRaw)) {
        permanentList = combinedRaw.filter(belongsToCurrentUser);
      }
    } catch {}

    // 2. Filter matching withdrawals from live props and authoritative Firestore listener strictly by email/ownerUid
    const matchingFromProps = (withdrawals || []).filter(belongsToCurrentUser);
    const matchingFromCloud = (cloudUserWithdrawals || []).filter(belongsToCurrentUser);

    const cloudKeys = new Set<string>();
    matchingFromCloud.forEach((item) => {
      const k = getCanonicalWthKey(item);
      if (k) cloudKeys.add(k);
      if (item.id) cloudKeys.add(String(item.id).trim());
      if (item.requestId) cloudKeys.add(String(item.requestId).trim());
      if (item.firestoreDocId) cloudKeys.add(String(item.firestoreDocId).trim());
    });

    const isCloudAuthoritative = hasLoadedCloudWithdrawals && !withdrawalsSyncError;
    const isPhantomCachedPending = (item: WithdrawalRequest) => {
      if (!isCloudAuthoritative) return false;
      const st = String(item.status || 'pending').toLowerCase();
      if (st !== 'pending') return false;
      const key = getCanonicalWthKey(item);
      const idMatch =
        (key && cloudKeys.has(key)) ||
        (item.id && cloudKeys.has(String(item.id).trim())) ||
        (item.requestId && cloudKeys.has(String(item.requestId).trim()));
      return !idMatch;
    };

    // 3. Merge all sources, making authoritative Firestore records the Single Source of Truth
    const map = new Map<string, WithdrawalRequest>();
    permanentList.forEach((item) => {
      if (!item || !item.id || isPhantomCachedPending(item)) return;
      const key = getCanonicalWthKey(item);
      if (key) {
        map.set(key, {
          ...item,
          status: (String(item.status || 'pending').toLowerCase() as WithdrawalRequest['status'])
        });
      }
    });

    const mergeRecord = (item: WithdrawalRequest, preferItemStatus: boolean) => {
      if (!item || !item.id) return;
      if (!preferItemStatus && isPhantomCachedPending(item)) return;
      const key = getCanonicalWthKey(item);
      if (!key) return;
      const existing = map.get(key);
      const itemStatus = String(item.status || 'pending').toLowerCase() as WithdrawalRequest['status'];
      const existingStatus = String(existing?.status || 'pending').toLowerCase() as WithdrawalRequest['status'];
      const resolvedStatus = preferItemStatus
        ? itemStatus
        : ((existing && existingStatus !== 'pending') ? existingStatus : itemStatus);
      map.set(key, {
        ...existing,
        ...item,
        id: item.id || existing?.id || key,
        requestId: item.requestId || existing?.requestId || item.id || key,
        userEmail: currentUserEmail || item.userEmail || item.email,
        email: currentUserEmail || item.userEmail || item.email,
        status: resolvedStatus
      });
    };

    matchingFromProps.forEach((item) => mergeRecord(item, false));
    matchingFromCloud.forEach((item) => mergeRecord(item, true));

    return Array.from(map.values())
      .map((w) => ({
        ...w,
        id: w.id || w.requestId,
        userEmail: currentUserEmail || w.userEmail || w.email,
        email: currentUserEmail || w.userEmail || w.email,
        timestamp: formatDepositTimestamp(w.timestamp, (w as any).createdAt, (w as any).date)
      }))
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
        return timeB - timeA;
      });
  }, [withdrawals, cloudUserWithdrawals, hasLoadedCloudWithdrawals, withdrawalsSyncError, currentUserEmail, currentUid, syncTick]);

  // Permanently sync merged user transactions isolated by email & reconcile active pending lock
  useEffect(() => {
    if (currentUserEmail && rawUserDeposits.length > 0) {
      try {
        localStorage.setItem(`quizkart_user_deposits_permanent_${currentUserEmail}`, JSON.stringify(rawUserDeposits));
      } catch {}
    }
  }, [rawUserDeposits, currentUserEmail]);

  useEffect(() => {
    if (!currentUserEmail) return;
    if (rawUserWithdrawals.length > 0 || hasLoadedCloudWithdrawals) {
      try {
        localStorage.setItem(`quizkart_user_withdrawals_permanent_${currentUserEmail}`, JSON.stringify(rawUserWithdrawals));
        const activePendingId = localStorage.getItem('quizkart_active_pending_withdrawal_id');
        if (activePendingId && hasLoadedCloudWithdrawals && !withdrawalsSyncError) {
          const matched = rawUserWithdrawals.find(
            (w) => w.id === activePendingId || w.requestId === activePendingId || formatWithdrawalId(w.id) === formatWithdrawalId(activePendingId)
          );
          if (!matched || matched.status !== 'pending') {
            localStorage.removeItem('quizkart_active_pending_withdrawal_id');
          }
        }
      } catch {}
    }
  }, [rawUserWithdrawals, hasLoadedCloudWithdrawals, withdrawalsSyncError, currentUserEmail]);

  // Apply date range filter
  const userDeposits = useMemo(() => {
    return rawUserDeposits.filter(matchesDateFilter);
  }, [rawUserDeposits, dateFilter, customStartDate, customEndDate]);

  const userWithdrawals = useMemo(() => {
    return rawUserWithdrawals.filter(matchesDateFilter);
  }, [rawUserWithdrawals, dateFilter, customStartDate, customEndDate]);

  // Reset pagination when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, customStartDate, customEndDate]);

  // Active items list & pagination calculations (10 items limit per page)
  const currentList = activeTab === 'deposits' ? userDeposits : userWithdrawals;
  const totalPages = Math.max(1, Math.ceil(currentList.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedList = useMemo(() => {
    return currentList.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [currentList, startIndex]);

  const filterLabels: Record<DateFilterOption, string> = {
    all: 'All Time',
    today: 'Today',
    yesterday: 'Yesterday',
    '7days': 'Last 7 Days',
    '30days': 'Last 30 Days',
    custom: 'Custom'
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-12 animate-in fade-in duration-200">
      {/* Top Navigation Bar with Back Button, Compact Title, Smaller Logo, and Date Range Filter */}
      <div className="flex items-center justify-between py-1 gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            id="history-back-to-profile-btn"
            onClick={() => {
              soundFx.playClick();
              onBack();
            }}
            className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Back to Profile"
            aria-label="Back to Profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {/* Refined smaller wallet icon shifted slightly to the left */}
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0 -ml-0.5"
              style={{ background: BRAND_GRADIENT }}
            >
              <Wallet className="w-3.5 h-3.5 text-white" />
            </div>
            {/* Compact and professional title */}
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Transactions
            </h1>
          </div>
        </div>

        {/* Sleek Date Range Filter Dropdown (Replacing Balance Badge) */}
        <div className="relative">
          <button
            type="button"
            id="history-date-filter-trigger"
            onClick={() => {
              soundFx.playClick();
              setIsFilterDropdownOpen(!isFilterDropdownOpen);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition-all cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{filterLabels[dateFilter]}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isFilterDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setIsFilterDropdownOpen(false)} 
              />
              <div className="absolute right-0 top-full mt-1.5 z-30 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                {(['all', 'today', 'yesterday', '7days', '30days', 'custom'] as DateFilterOption[]).map(option => {
                  const isSelected = dateFilter === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setDateFilter(option);
                        setIsFilterDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'text-white shadow-xs font-black'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                      style={isSelected ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
                    >
                      <span>{filterLabels[option]}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom Date Range Picker Container (shown when 'custom' filter is active) */}
      {dateFilter === 'custom' && (
        <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">From</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">To</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
          </div>
          {(customStartDate || customEndDate) && (
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setCustomStartDate('');
                setCustomEndDate('');
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 self-end transition-colors cursor-pointer"
              title="Reset Custom Range"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Main Card Container */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-5">
        {/* History Tabs: Deposits & Withdrawals with Signature 3-color primary gradient on active tab */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            type="button"
            id="history-tab-deposits"
            onClick={() => {
              soundFx.playClick();
              setActiveTab('deposits');
              setCurrentPage(1);
            }}
            className={`py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === 'deposits'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            style={activeTab === 'deposits' ? { background: BRAND_GRADIENT } : undefined}
          >
            Deposits ({userDeposits.length})
          </button>

          <button
            type="button"
            id="history-tab-withdrawals"
            onClick={() => {
              soundFx.playClick();
              setActiveTab('withdrawals');
              setCurrentPage(1);
            }}
            className={`py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === 'withdrawals'
                ? 'text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            style={activeTab === 'withdrawals' ? { background: BRAND_GRADIENT } : undefined}
          >
            Withdrawals ({userWithdrawals.length})
          </button>
        </div>

        {/* Transaction Items List (Paginated to max 10 items per page) */}
        <div className="space-y-3">
          {activeTab === 'deposits' ? (
            paginatedList.length > 0 ? (
              paginatedList.map((dep, idx) => {
                const actualIdx = startIndex + idx;
                const requestId = formatDepositId(dep.id, actualIdx + 1);
                const timestamp = formatDepositTimestamp(dep.timestamp, (dep as any).createdAt, (dep as any).date);
                const isSuccess = dep.status === 'approved';
                const isRejected = dep.status === 'rejected';
                const isCancelled = dep.status === 'cancelled';

                return (
                  <div
                    key={dep.id ? `dep-card-${dep.id}-${actualIdx}` : `dep-card-${actualIdx}`}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-4"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    {/* Left: Amount ONLY alongside Request ID, and static timestamp directly beneath */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-black text-emerald-600" style={{ color: '#16A34A' }}>
                          + ₹{dep.amount}
                        </span>
                        <span
                          className="font-mono text-xs font-bold text-black bg-white px-2 py-0.5 rounded-md border border-slate-200"
                          style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
                        >
                          {requestId}
                        </span>
                      </div>
                      {/* Immutable static timestamp without countdown or timers */}
                      <div className="text-[11px] text-slate-500 font-mono tracking-wide">
                        {timestamp}
                      </div>
                    </div>

                    {/* Right: Solid Static Status Badge (NO animation, pulsing, or blinking) */}
                    <div className="shrink-0">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider select-none ${
                        isSuccess
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : (isRejected || isCancelled)
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-900 border border-amber-200'
                      }`}>
                        {isSuccess ? 'SUCCESS' : isRejected ? 'REJECTED' : isCancelled ? 'CANCELLED' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                className="py-16 text-center text-xs font-semibold text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {dateFilter !== 'all' ? `No Transactions Found for ${filterLabels[dateFilter].toLowerCase()}` : 'No Transactions Found'}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {withdrawalsSyncError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>Unable to refresh live status from Firestore.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRetrySyncTick((prev) => prev + 1)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-bold text-[11px] hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {isWithdrawalsLoading && paginatedList.length === 0 ? (
                <div
                  className="py-16 text-center text-xs font-semibold text-slate-500 border border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center gap-2"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  <span>Syncing withdrawal history...</span>
                </div>
              ) : paginatedList.length > 0 ? (
                paginatedList.map((wth, idx) => {
                  const actualIdx = startIndex + idx;
                  const requestId = formatWithdrawalId(wth.id, actualIdx + 1);
                  const timestamp = formatDepositTimestamp(wth.timestamp, (wth as any).createdAt, (wth as any).date);
                  const normalizedStatus = String(wth.status || 'pending').toLowerCase();
                  const isSuccess = normalizedStatus === 'approved';
                  const isRejected = normalizedStatus === 'rejected';
                  const isCancelled = normalizedStatus === 'cancelled';

                  return (
                    <div
                      key={wth.id ? `wth-card-${wth.id}-${actualIdx}` : `wth-card-${actualIdx}`}
                      className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-4"
                      style={{ backgroundColor: '#FFFFFF' }}
                    >
                      {/* Left: Amount ONLY alongside Request ID, and static timestamp directly beneath */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-black text-rose-600" style={{ color: '#DC2626' }}>
                            - ₹{wth.amount}
                          </span>
                          <span
                            className="font-mono text-xs font-bold text-black bg-white px-2 py-0.5 rounded-md border border-slate-200"
                            style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
                          >
                            {requestId}
                          </span>
                        </div>
                        {/* Immutable static timestamp without countdown or timers */}
                        <div className="text-[11px] text-slate-500 font-mono tracking-wide">
                          {timestamp}
                        </div>
                      </div>

                      {/* Right: Solid Static Status Badge (NO animation, pulsing, or blinking) */}
                      <div className="shrink-0">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider select-none ${
                          isSuccess
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : (isRejected || isCancelled)
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}>
                          {isSuccess ? 'SUCCESS' : isRejected ? 'REJECTED' : isCancelled ? 'CANCELLED' : 'PENDING'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  className="py-16 text-center text-xs font-semibold text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  {dateFilter !== 'all' ? `No Transactions Found for ${filterLabels[dateFilter].toLowerCase()}` : 'No Transactions Found'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination Box UI Widget - Bottom-Right Corner (Max 10 Items per Page) */}
        {currentList.length > 0 && (
          <div className="flex items-center justify-end pt-2">
            <div 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-md text-white font-mono text-xs font-bold select-none"
              style={{ background: PAGINATION_GRADIENT }}
            >
              <button
                type="button"
                id="tx-page-prev-btn"
                disabled={currentPage <= 1}
                onClick={() => {
                  if (currentPage > 1) {
                    soundFx.playClick();
                    setCurrentPage(prev => Math.max(1, prev - 1));
                  }
                }}
                className={`p-1 rounded-lg transition-all flex items-center justify-center ${
                  currentPage <= 1 
                    ? 'opacity-40 cursor-not-allowed' 
                    : 'hover:bg-white/20 active:scale-90 cursor-pointer text-white'
                }`}
                aria-label="Previous page"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-white stroke-[2.5]" />
              </button>

              <span className="px-2 text-white tracking-widest text-xs font-black">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                id="tx-page-next-btn"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  if (currentPage < totalPages) {
                    soundFx.playClick();
                    setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  }
                }}
                className={`p-1 rounded-lg transition-all flex items-center justify-center ${
                  currentPage >= totalPages 
                    ? 'opacity-40 cursor-not-allowed' 
                    : 'hover:bg-white/20 active:scale-90 cursor-pointer text-white'
                }`}
                aria-label="Next page"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4 text-white stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

