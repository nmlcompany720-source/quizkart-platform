import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Calendar, 
  X, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft, 
  Copy, 
  Check, 
  Building, 
  Phone, 
  User, 
  CreditCard,
  Clock,
  AlertCircle
} from 'lucide-react';
import { WithdrawalRequest } from '../types';
import { soundFx } from '../utils/audio';
import { safeCopyToClipboard } from '../utils/clipboard';
import { formatWithdrawalId, formatDepositTimestamp } from '../utils/depositUtils';

const PRIMARY_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

interface WithdrawalApprovalsTabProps {
  withdrawals: WithdrawalRequest[];
  onUpdateWithdrawals: (withdrawals: WithdrawalRequest[]) => void;
  onApproveWithdrawal: (id: string) => void;
  onRejectWithdrawal: (id: string, reason?: 'rejected' | 'cancelled') => void;
  onDeleteWithdrawal: (id: string) => void;
  onBulkDeleteWithdrawals: (ids: string[]) => void;
}

export const WithdrawalApprovalsTab: React.FC<WithdrawalApprovalsTabProps> = ({
  withdrawals,
  onUpdateWithdrawals,
  onApproveWithdrawal,
  onRejectWithdrawal,
  onDeleteWithdrawal,
  onBulkDeleteWithdrawals
}) => {
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  const [withdrawalSearch, setWithdrawalSearch] = useState('');
  const [withdrawalDateFilter, setWithdrawalDateFilter] = useState('');
  const [selectedWithdrawalIds, setSelectedWithdrawalIds] = useState<string[]>([]);
  
  // Dedicated Full-Page Request Detail View State
  const [detailWithdrawal, setDetailWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Copy handler with feedback
  const handleCopy = async (text: string, fieldName: string) => {
    soundFx.playClick();
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedField(fieldName);
      soundFx.playSuccess();
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Filtered withdrawals with deduplication
  const filteredWithdrawals = useMemo(() => {
    const dedupMap = new Map<string, WithdrawalRequest>();
    (withdrawals || []).forEach((w, idx) => {
      if (!w || !w.id) return;
      const normId = formatWithdrawalId(w.id, idx + 1);
      if (!dedupMap.has(normId)) {
        dedupMap.set(normId, { ...w, id: normId });
      }
    });

    return Array.from(dedupMap.values()).filter((w, idx) => {
      if (!w || !w.id) return false;
      if (withdrawalFilter !== 'all' && w.status !== withdrawalFilter) return false;

      if (withdrawalSearch.trim()) {
        const q = withdrawalSearch.trim().toLowerCase();
        const name = (w.userName || '').toLowerCase();
        const accHolder = (w.accountHolderName || '').toLowerCase();
        const phone = (w.phone || '').toLowerCase();
        const acc = (w.accountNumber || '').toLowerCase();
        const ifsc = (w.ifscCode || '').toLowerCase();
        const displayId = formatWithdrawalId(w.id, idx + 1).toLowerCase();
        const rawId = w.id.toLowerCase();

        if (
          !name.includes(q) &&
          !accHolder.includes(q) &&
          !phone.includes(q) &&
          !acc.includes(q) &&
          !ifsc.includes(q) &&
          !displayId.includes(q) &&
          !rawId.includes(q)
        ) {
          return false;
        }
      }

      if (withdrawalDateFilter) {
        const wDate = w.date || (w.createdAt ? w.createdAt.split('T')[0] : '');
        const formattedTs = formatDepositTimestamp(w.timestamp, w.createdAt, w.date);
        const tsDate = formattedTs.split(' | ')[0];
        if (wDate && wDate === withdrawalDateFilter) {
          // match
        } else if (tsDate && tsDate === withdrawalDateFilter) {
          // match
        } else if ((w.timestamp || '').includes(withdrawalDateFilter)) {
          // match
        } else {
          return false;
        }
      }

      return true;
    });
  }, [withdrawals, withdrawalFilter, withdrawalSearch, withdrawalDateFilter]);

  const pendingCount = (withdrawals || []).filter(w => w && w.status === 'pending').length;

  // Only resolved (approved, rejected, cancelled) withdrawals can be selected or deleted
  const resolvableWithdrawals = useMemo(() => {
    return filteredWithdrawals.filter(w => w.status !== 'pending');
  }, [filteredWithdrawals]);

  // -------------------------------------------------------------
  // FULL-PAGE REQUEST DETAIL VIEW
  // -------------------------------------------------------------
  if (detailWithdrawal) {
    const isPending = detailWithdrawal.status === 'pending';

    return (
      <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-200">
        {/* Detail Card Container */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Header Summary (No top nav, No status badge, No bank icon, No ID/Timer/Date metadata) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                Withdrawal Request Details
              </h2>
            </div>

            {/* Payout Amount Section: Compact, modern, clear contrast */}
            <div className="px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-left sm:text-right shrink-0">
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                PAYOUT AMOUNT
              </span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono tracking-tight leading-none mt-0.5 block">
                ₹{detailWithdrawal.amount}
              </span>
            </div>
          </div>

          {/* Parameters Grid: Pure white #FFFFFF backgrounds, no field icons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Field 1: User Name */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 space-y-1 shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                User Name
              </span>
              <p className="font-bold text-sm text-slate-900">{detailWithdrawal.userName}</p>
            </div>

            {/* Field 2: Mobile Number */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 space-y-1 shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                Mobile Number
              </span>
              <p className="font-mono font-bold text-sm text-slate-900">{detailWithdrawal.phone}</p>
            </div>

            {/* Bank Account Holder Name */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 space-y-1 shadow-2xs md:col-span-2"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                Bank Account Holder Name
              </span>
              <p className="font-bold text-sm text-slate-900">{detailWithdrawal.accountHolderName}</p>
            </div>

            {/* Bank IFSC Code (Pure White box, Copy button with 3-Color Gradient) */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div className="space-y-1 min-w-0">
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                  Bank IFSC Code
                </span>
                <p className="font-mono font-bold text-sm text-slate-900 tracking-wider">
                  {detailWithdrawal.ifscCode}
                </p>
              </div>

              <button
                type="button"
                id="copy-ifsc-btn"
                onClick={() => handleCopy(detailWithdrawal.ifscCode, 'ifsc')}
                className="px-3.5 py-2 rounded-xl text-white font-bold text-xs shadow-xs hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                style={{ background: PRIMARY_GRADIENT }}
                title="Copy IFSC Code"
              >
                {copiedField === 'ifsc' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Bank Account Number (Pure White box, Copy button renamed to "Copy" with 3-Color Gradient) */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div className="space-y-1 min-w-0">
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                  Bank Account Number
                </span>
                <p className="font-mono font-black text-base text-slate-900 tracking-wide">
                  {detailWithdrawal.accountNumber || 'N/A'}
                </p>
              </div>

              <button
                type="button"
                id="copy-account-btn"
                onClick={() => handleCopy(detailWithdrawal.accountNumber || '', 'account')}
                className="px-3.5 py-2 rounded-xl text-white font-bold text-xs shadow-xs hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                style={{ background: PRIMARY_GRADIENT }}
                title="Copy Bank Account Number"
              >
                {copiedField === 'account' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Date & Time of Request (No clock icon, pure white background, accurate timestamp) */}
            <div 
              className="p-4 rounded-2xl border border-slate-200 space-y-1 md:col-span-2 shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider block">
                Date & Time
              </span>
              <p className="font-mono font-bold text-xs text-slate-700">
                {formatDepositTimestamp(detailWithdrawal.timestamp, detailWithdrawal.createdAt, detailWithdrawal.date)}
              </p>
            </div>
          </div>

          {/* Action Buttons: Delete record button removed; Close button renamed to Back and styled with 3-color brand gradient */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              id="detail-back-btn"
              onClick={() => {
                soundFx.playClick();
                setDetailWithdrawal(null);
              }}
              className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
              style={{ background: PRIMARY_GRADIENT }}
            >
              <ArrowLeft className="w-4 h-4 text-white" />
              <span>Back</span>
            </button>

            {isPending && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  id="detail-cancel-btn"
                  onClick={() => {
                    soundFx.playWrong();
                    onRejectWithdrawal(detailWithdrawal.id, 'cancelled');
                    setDetailWithdrawal(prev => prev ? { ...prev, status: 'cancelled' } : null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="Cancel withdrawal and refund wallet"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  id="detail-reject-btn"
                  onClick={() => {
                    soundFx.playWrong();
                    onRejectWithdrawal(detailWithdrawal.id, 'rejected');
                    setDetailWithdrawal(prev => prev ? { ...prev, status: 'rejected' } : null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="Reject withdrawal and refund wallet"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>

                <button
                  type="button"
                  id="detail-approve-btn"
                  onClick={() => {
                    soundFx.playCelebration();
                    onApproveWithdrawal(detailWithdrawal.id);
                    setDetailWithdrawal(prev => prev ? { ...prev, status: 'approved' } : null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                  style={{ background: PRIMARY_GRADIENT }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN LEDGER TABLE VIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        {/* Header: Title and Live Pending Counter Badge styled in 3-color primary gradient */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Withdrawal Approvals Ledger
            </h3>
            <span 
              className="px-3 py-0.5 rounded-full text-xs font-bold text-white shadow-xs inline-flex items-center"
              style={{ background: PRIMARY_GRADIENT }}
            >
              {pendingCount} Pending
            </span>
          </div>

          {/* Bulk Delete Controls when items are selected */}
          {selectedWithdrawalIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                {selectedWithdrawalIds.length} selected
              </span>
              <button
                type="button"
                id="bulk-delete-withdrawals-btn"
                onClick={() => {
                  soundFx.playClick();
                  // Strict validation: never delete pending requests
                  const allowedIds = selectedWithdrawalIds.filter(id => {
                    const item = withdrawals.find(w => w && w.id === id);
                    return item && item.status !== 'pending';
                  });
                  if (allowedIds.length === 0) {
                    soundFx.playWrong();
                    return;
                  }
                  onBulkDeleteWithdrawals(allowedIds);
                  setSelectedWithdrawalIds([]);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                title="Delete selected resolved withdrawal records from Admin view"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedWithdrawalIds([])}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Search & Date Filter Bar */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search by User Name, Mobile Number, or Account Number */}
            <div className="md:col-span-7 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by User Name, Mobile Number, or Account Number..."
                value={withdrawalSearch}
                onChange={(e) => setWithdrawalSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
              {withdrawalSearch && (
                <button
                  type="button"
                  onClick={() => setWithdrawalSearch('')}
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
                  value={withdrawalDateFilter}
                  onChange={(e) => setWithdrawalDateFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:border-blue-500 focus:bg-white transition-colors cursor-pointer"
                />
              </div>
              {withdrawalDateFilter && (
                <button
                  type="button"
                  onClick={() => setWithdrawalDateFilter('')}
                  className="px-2.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
                  title="Clear date filter"
                >
                  Clear Date
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills in a single horizontal row */}
          <div className="flex items-center justify-between gap-3 pt-1 w-full overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto py-1 shrink-0 max-w-full">
              {[
                { key: 'all', label: `All Withdrawals (${withdrawals.length})` },
                { key: 'pending', label: `Pending (${withdrawals.filter(w => w.status === 'pending').length})` },
                { key: 'approved', label: `Approved (${withdrawals.filter(w => w.status === 'approved').length})` },
                { key: 'rejected', label: `Rejected (${withdrawals.filter(w => w.status === 'rejected').length})` }
              ].map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setWithdrawalFilter(pill.key as typeof withdrawalFilter)}
                  className={`whitespace-nowrap shrink-0 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    withdrawalFilter === pill.key
                      ? 'text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  style={withdrawalFilter === pill.key ? { background: PRIMARY_GRADIENT } : undefined}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {resolvableWithdrawals.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (selectedWithdrawalIds.length === resolvableWithdrawals.length) {
                    setSelectedWithdrawalIds([]);
                  } else {
                    setSelectedWithdrawalIds(resolvableWithdrawals.map(w => w.id));
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer underline decoration-dotted whitespace-nowrap shrink-0"
              >
                {selectedWithdrawalIds.length === resolvableWithdrawals.length ? 'Deselect All' : 'Select All Resolved'}
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
                    aria-label="Select all resolved withdrawals"
                    disabled={resolvableWithdrawals.length === 0}
                    checked={resolvableWithdrawals.length > 0 && selectedWithdrawalIds.length === resolvableWithdrawals.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedWithdrawalIds(resolvableWithdrawals.map(w => w.id));
                      } else {
                        setSelectedWithdrawalIds([]);
                      }
                    }}
                    className={`rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${resolvableWithdrawals.length === 0 ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}`}
                    title={resolvableWithdrawals.length === 0 ? 'No resolved requests available for deletion' : 'Select all resolved requests'}
                  />
                </th>
                <th className="py-3 px-4 font-bold">Request ID</th>
                <th className="py-3 px-4 font-bold">Contestant</th>
                <th className="py-3 px-4 font-bold">Amount</th>
                <th className="py-3 px-4 font-bold">Bank Details</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    No withdrawal records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((wth, idx) => {
                  const displayId = formatWithdrawalId(wth.id, idx + 1);
                  const isSelected = selectedWithdrawalIds.includes(wth.id);
                  const isPending = wth.status === 'pending';

                  return (
                    <tr 
                      key={wth.id ? `admin-wth-${wth.id}-${idx}` : `admin-wth-${idx}`}
                      className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select withdrawal ${displayId}`}
                          checked={isSelected}
                          disabled={isPending}
                          onChange={(e) => {
                            if (isPending) return;
                            if (e.target.checked) {
                              setSelectedWithdrawalIds(prev => [...prev, wth.id]);
                            } else {
                              setSelectedWithdrawalIds(prev => prev.filter(id => id !== wth.id));
                            }
                          }}
                          className={`rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${isPending ? 'cursor-not-allowed opacity-30 bg-slate-100' : 'cursor-pointer'}`}
                          title={isPending ? 'Action Required: Process request (Approve, Reject, or Cancel) before selecting for deletion' : `Select withdrawal ${displayId}`}
                        />
                      </td>

                      {/* Request ID & Timestamp */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setDetailWithdrawal(wth);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-bold block"
                          title="Open Full Detail View"
                        >
                          {displayId}
                        </button>
                        <span className="block text-[10px] text-slate-500 font-medium tracking-wide mt-0.5 whitespace-nowrap">
                          {formatDepositTimestamp(wth.timestamp, wth.createdAt, wth.date)}
                        </span>
                      </td>

                      {/* Contestant */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">{wth.userName}</p>
                        <p className="text-[11px] text-slate-500">{wth.phone}</p>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          ₹{wth.amount}
                        </span>
                      </td>

                      {/* Bank Details & One-click copy */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800">{wth.accountHolderName || 'Account Holder'}</p>
                          <div className="flex items-center gap-1.5 font-mono text-slate-600 text-[11px]">
                            <span>••••{(wth.accountNumber || '').slice(-4) || '••••'}</span>
                            <span>•</span>
                            <span className="font-bold">{wth.ifscCode || 'N/A'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          wth.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : (wth.status === 'rejected' || wth.status === 'cancelled')
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          {wth.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Detail button */}
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.playClick();
                              setDetailWithdrawal(wth);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                            title="View Full Payout Details"
                          >
                            Details
                          </button>

                          {wth.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  soundFx.playCelebration();
                                  onApproveWithdrawal(wth.id);
                                }}
                                className="px-3 py-1.5 rounded-xl text-white font-bold text-xs shadow-xs transition-all hover:opacity-95 active:scale-95 cursor-pointer"
                                style={{ background: PRIMARY_GRADIENT }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                id={`reject-btn-${wth.id}`}
                                onClick={() => {
                                  soundFx.playWrong();
                                  onRejectWithdrawal(wth.id, 'rejected');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all cursor-pointer active:scale-95"
                                title="Reject and refund wallet"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                id={`cancel-btn-${wth.id}`}
                                onClick={() => {
                                  soundFx.playWrong();
                                  onRejectWithdrawal(wth.id, 'cancelled');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all cursor-pointer active:scale-95"
                                title="Cancel and refund wallet"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {wth.status !== 'pending' && (
                            <span className="text-[11px] text-slate-400 italic mr-1">Resolved</span>
                          )}

                          {isPending ? (
                            <button
                              type="button"
                              id={`trash-btn-${wth.id}`}
                              disabled={true}
                              className="p-1.5 rounded-lg text-slate-300 opacity-40 cursor-not-allowed transition-colors"
                              title="Action Required: Approve, Reject, or Cancel this pending request before deleting"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              id={`trash-btn-${wth.id}`}
                              onClick={() => {
                                soundFx.playClick();
                                onDeleteWithdrawal(wth.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-90"
                              title="Delete resolved withdrawal record from Admin view"
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
  );
};
