import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Wallet,
  Calendar,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { DepositRequest, WithdrawalRequest, UserProfile } from '../types';
import { soundFx } from '../utils/audio';
import { formatDepositId, formatWithdrawalId, formatDepositTimestamp } from '../utils/depositUtils';

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

  // Filter user's specific deposits and withdrawals strictly by logged-in user's exact Email Address
  const currentUserEmail = (userProfile.email || '').trim().toLowerCase();

  const rawUserDeposits = useMemo(() => {
    const belongsToCurrentUser = (d: DepositRequest) => {
      if (!d || !currentUserEmail) return false;
      const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
      if (!dEmail) return false;
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

    // 2. Filter matching deposits from live props strictly by email
    const matchingFromProps = (deposits || []).filter(belongsToCurrentUser);

    // 3. Merge both sets, prioritizing latest status and ensuring no user transaction is ever lost
    const map = new Map<string, DepositRequest>();
    permanentList.forEach((item, idx) => {
      if (item && item.id) {
        map.set(formatDepositId(item.id, idx + 1), item);
      }
    });
    matchingFromProps.forEach((item, idx) => {
      if (item && item.id) {
        const normId = formatDepositId(item.id, idx + 1);
        const existing = map.get(normId);
        // Protect resolved statuses from being reverted to pending
        const resolvedStatus = (existing?.status && existing.status !== 'pending')
          ? existing.status
          : (item.status || existing?.status || 'pending');
        map.set(normId, {
          ...existing,
          ...item,
          id: normId,
          userEmail: currentUserEmail,
          email: currentUserEmail,
          status: resolvedStatus
        });
      }
    });

    return Array.from(map.values()).map((d, idx) => ({
      ...d,
      id: formatDepositId(d.id, idx + 1),
      userEmail: currentUserEmail,
      email: currentUserEmail,
      timestamp: formatDepositTimestamp(d.timestamp, (d as any).createdAt, (d as any).date)
    }));
  }, [deposits, currentUserEmail, syncTick]);

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
      if (!w || isBuggedDemoWithdrawal(w) || !currentUserEmail) return false;
      const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
      if (!wEmail) return false;
      return wEmail === currentUserEmail;
    };

    // 1. Read permanent user audit log filtered strictly to current user's email
    let permanentList: WithdrawalRequest[] = [];
    try {
      const savedByEmail = localStorage.getItem(`quizkart_user_withdrawals_permanent_${currentUserEmail}`);
      const savedGlobal = localStorage.getItem('quizkart_user_withdrawals_permanent');
      const combinedRaw: WithdrawalRequest[] = [
        ...(savedByEmail ? JSON.parse(savedByEmail) : []),
        ...(savedGlobal ? JSON.parse(savedGlobal) : [])
      ];
      if (Array.isArray(combinedRaw)) {
        permanentList = combinedRaw.filter(belongsToCurrentUser);
      }
    } catch {}

    // 2. Filter matching withdrawals from live props strictly by email
    const matchingFromProps = (withdrawals || []).filter(belongsToCurrentUser);

    // 3. Merge both sets, prioritizing latest status and ensuring no user transaction is ever lost
    const map = new Map<string, WithdrawalRequest>();
    permanentList.forEach((item, idx) => {
      if (item && item.id) {
        map.set(formatWithdrawalId(item.id, idx + 1), item);
      }
    });
    matchingFromProps.forEach((item, idx) => {
      if (item && item.id) {
        const normId = formatWithdrawalId(item.id, idx + 1);
        const existing = map.get(normId);
        // Protect resolved statuses from being reverted to pending
        const resolvedStatus = (existing?.status && existing.status !== 'pending')
          ? existing.status
          : (item.status || existing?.status || 'pending');
        map.set(normId, {
          ...existing,
          ...item,
          id: normId,
          userEmail: currentUserEmail,
          email: currentUserEmail,
          status: resolvedStatus
        });
      }
    });

    return Array.from(map.values()).map((w, idx) => ({
      ...w,
      id: formatWithdrawalId(w.id, idx + 1),
      userEmail: currentUserEmail,
      email: currentUserEmail,
      timestamp: formatDepositTimestamp(w.timestamp, (w as any).createdAt, (w as any).date)
    }));
  }, [withdrawals, currentUserEmail, syncTick]);

  // Permanently sync merged user transactions isolated by email
  useEffect(() => {
    if (currentUserEmail && rawUserDeposits.length > 0) {
      try {
        localStorage.setItem(`quizkart_user_deposits_permanent_${currentUserEmail}`, JSON.stringify(rawUserDeposits));
      } catch {}
    }
  }, [rawUserDeposits, currentUserEmail]);

  useEffect(() => {
    if (currentUserEmail && rawUserWithdrawals.length > 0) {
      try {
        localStorage.setItem(`quizkart_user_withdrawals_permanent_${currentUserEmail}`, JSON.stringify(rawUserWithdrawals));
      } catch {}
    }
  }, [rawUserWithdrawals, currentUserEmail]);

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
                          : isRejected
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-900 border border-amber-200'
                      }`}>
                        {isSuccess ? 'SUCCESS' : isRejected ? 'REJECTED' : 'PENDING'}
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
            paginatedList.length > 0 ? (
              paginatedList.map((wth, idx) => {
                const actualIdx = startIndex + idx;
                const requestId = formatWithdrawalId(wth.id, actualIdx + 1);
                const timestamp = formatDepositTimestamp(wth.timestamp, (wth as any).createdAt, (wth as any).date);
                const isSuccess = wth.status === 'approved';
                const isRejected = wth.status === 'rejected';
                const isCancelled = wth.status === 'cancelled';

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
            )
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

