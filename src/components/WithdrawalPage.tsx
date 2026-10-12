import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Landmark, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';
import { WithdrawalRequest, UserProfile } from '../types';
import { soundFx } from '../utils/audio';
import { getCurrentFormattedTimestamp, getNextWithdrawalId, formatWithdrawalId, getDeletedWithdrawalIds } from '../utils/depositUtils';
import { saveWithdrawalToFirestore } from '../firebase';

interface WithdrawalPageProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onSubmitWithdrawal: (withdrawal: WithdrawalRequest) => void;
  existingWithdrawals?: WithdrawalRequest[];
  onBackToProfile: () => void;
  onOpenHistory: () => void;
}

const PRIMARY_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

export const WithdrawalPage: React.FC<WithdrawalPageProps> = ({
  userProfile,
  onUpdateProfile,
  onSubmitWithdrawal,
  existingWithdrawals = [],
  onBackToProfile,
  onOpenHistory
}) => {
  const [fullName, setFullName] = useState(userProfile.name || '');
  const [mobileNumber, setMobileNumber] = useState(userProfile.mobile || '');
  const [accountHolderName, setAccountHolderName] = useState(userProfile.name || '');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [amount, setAmount] = useState<number>(100);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<WithdrawalRequest | null>(null);

  const walletBalance = userProfile.walletBalance || 0;
  const remainingBalance = Math.max(0, walletBalance - (Number(amount) || 0));

  // Dynamic refresh trigger for real-time unlock synchronization
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Real-time synchronization: listen for admin processing (approve/reject/cancel/delete) across tabs and views
  React.useEffect(() => {
    const handleStatusChange = () => {
      setSubmittedRequest(null);
      try {
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      } catch {}
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('quizkart_withdrawal_status_changed', handleStatusChange);
    window.addEventListener('storage', handleStatusChange);
    return () => {
      window.removeEventListener('quizkart_withdrawal_status_changed', handleStatusChange);
      window.removeEventListener('storage', handleStatusChange);
    };
  }, []);

  // Synchronize submittedRequest with latest existingWithdrawals state
  React.useEffect(() => {
    if (submittedRequest) {
      const deletedWithdrawals = getDeletedWithdrawalIds();
      const normSubmittedId = formatWithdrawalId(submittedRequest.id);

      if (deletedWithdrawals.includes(submittedRequest.id) || deletedWithdrawals.includes(normSubmittedId)) {
        setSubmittedRequest(null);
        try {
          localStorage.removeItem('quizkart_active_pending_withdrawal_id');
        } catch {}
        return;
      }

      const match = (existingWithdrawals || []).find(w => 
        w && (w.id === submittedRequest.id || formatWithdrawalId(w.id) === normSubmittedId)
      );

      // If missing from existingWithdrawals (deleted by admin) or resolved (approved/rejected/cancelled)
      if (!match || match.status !== 'pending') {
        setSubmittedRequest(null);
        try {
          localStorage.removeItem('quizkart_active_pending_withdrawal_id');
        } catch {}
      }
    }
  }, [existingWithdrawals, submittedRequest]);

  // MANDATORY PENDING SCREEN LOCK:
  // Dynamically checks whether a valid, non-deleted, active pending withdrawal exists strictly for this user's email.
  // As soon as Admin Approves, Rejects, Cancels, or Deletes the request, this returns null and unlocks the form.
  const activePendingWithdrawal = useMemo(() => {
    const currentUserEmail = (userProfile.email || '').trim().toLowerCase();
    if (!currentUserEmail) return null;

    const deletedWithdrawals = getDeletedWithdrawalIds();
    const isBuggedSeedWth = (w: WithdrawalRequest) =>
      Boolean(
        w &&
        (w.id === 'QK-WTH-1001' || formatWithdrawalId(w.id) === 'QK-WTH-1001') &&
        Number(w.amount) === 250 &&
        (String(w.timestamp || '').includes('2026-09-20') || String(w.date || '').includes('2026-09-20'))
      );

    // 1. Check if there is an active pending withdrawal ID saved in localStorage that belongs to this email
    let activeId: string | null = null;
    try {
      activeId = localStorage.getItem('quizkart_active_pending_withdrawal_id');
    } catch {}

    if (activeId) {
      const normActiveId = formatWithdrawalId(activeId);
      // If deleted by admin, lift lock immediately
      if (deletedWithdrawals.includes(activeId) || deletedWithdrawals.includes(normActiveId)) {
        try {
          localStorage.removeItem('quizkart_active_pending_withdrawal_id');
        } catch {}
        return null;
      }

      const match = (existingWithdrawals || []).find(w => {
        if (!w || isBuggedSeedWth(w)) return false;
        const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
        return wEmail === currentUserEmail && (w.id === activeId || formatWithdrawalId(w.id) === normActiveId);
      });

      if (match) {
        if (match.status === 'pending') {
          return match;
        } else {
          // If already approved, rejected, or cancelled, lift the lock immediately
          try {
            localStorage.removeItem('quizkart_active_pending_withdrawal_id');
          } catch {}
          return null;
        }
      } else {
        // If not found for this email, clear lock
        try {
          localStorage.removeItem('quizkart_active_pending_withdrawal_id');
        } catch {}
      }
    }

    // 2. Also check if any withdrawal in existingWithdrawals strictly belongs to this user's email and is still 'pending'
    const pendingFromProps = (existingWithdrawals || []).find(w => {
      if (!w || w.status !== 'pending' || isBuggedSeedWth(w)) return false;
      const normWId = formatWithdrawalId(w.id);
      if (deletedWithdrawals.includes(w.id) || deletedWithdrawals.includes(normWId)) return false;

      const wEmail = (w.userEmail || w.email || '').trim().toLowerCase();
      return Boolean(wEmail && wEmail === currentUserEmail);
    });

    if (pendingFromProps) {
      try {
        localStorage.setItem('quizkart_active_pending_withdrawal_id', pendingFromProps.id);
      } catch {}
      return pendingFromProps;
    }

    return null;
  }, [existingWithdrawals, userProfile.email, refreshTrigger]);

  const displayedPendingRequest = submittedRequest || activePendingWithdrawal;
  const isScreenLocked = Boolean(displayedPendingRequest && displayedPendingRequest.status === 'pending');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (userProfile.isBlocked) {
      setErrorMsg('Your Account has been Blocked by Admin');
      soundFx.playWrong();
      return;
    }

    // Transaction Limits: Min ₹100 – Max ₹5000
    if (amount < 100) {
      setErrorMsg('Minimum withdrawal amount is ₹100.');
      soundFx.playWrong();
      return;
    }

    if (amount > 5000) {
      setErrorMsg('Maximum withdrawal amount is ₹5000 per request.');
      soundFx.playWrong();
      return;
    }

    if (amount > walletBalance) {
      setErrorMsg(`Insufficient wallet balance. You only have ₹${walletBalance} available.`);
      soundFx.playWrong();
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      soundFx.playWrong();
      return;
    }

    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length < 7 || cleanMobile.length > 15) {
      setErrorMsg('Please enter a valid mobile number.');
      soundFx.playWrong();
      return;
    }

    if (!accountHolderName.trim()) {
      setErrorMsg('Please enter the bank account holder name.');
      soundFx.playWrong();
      return;
    }

    const cleanAcc = accountNumber.trim();
    if (cleanAcc.length < 9 || cleanAcc.length > 18) {
      setErrorMsg('Please enter a valid bank account number (9 to 18 digits).');
      soundFx.playWrong();
      return;
    }

    if (cleanAcc !== confirmAccountNumber.trim()) {
      setErrorMsg('Bank account numbers do not match. Please re-check.');
      soundFx.playWrong();
      return;
    }

    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (cleanIfsc.length !== 11) {
      setErrorMsg('Please enter a valid 11-character IFSC code.');
      soundFx.playWrong();
      return;
    }

    // 1-second visual execution feedback
    setIsSubmitting(true);
    soundFx.playClick();

    setTimeout(() => {
      // 1. Instantly deduct requested amount from user's Available Wallet Balance
      const nextBalance = Math.max(0, walletBalance - Number(amount));
      const updatedProfile: UserProfile = {
        ...userProfile,
        walletBalance: nextBalance
      };
      onUpdateProfile(updatedProfile);

      // 2. Log payout request marked as 'Pending' with fixed real-time Date & Time stamp
      const now = new Date();
      const formattedTimestamp = getCurrentFormattedTimestamp();
      const newWithdrawalId = getNextWithdrawalId(existingWithdrawals);

      const newWithdrawal: WithdrawalRequest = {
        id: newWithdrawalId,
        userName: fullName.trim(),
        userEmail: userProfile.email,
        email: userProfile.email,
        phone: cleanMobile,
        accountHolderName: accountHolderName.trim(),
        accountNumber: cleanAcc,
        confirmAccountNumber: confirmAccountNumber.trim(),
        ifscCode: cleanIfsc,
        amount: Number(amount),
        timestamp: formattedTimestamp,
        date: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        status: 'pending'
      };

      onSubmitWithdrawal(newWithdrawal);

      // Store persistent screen lock
      try {
        localStorage.setItem('quizkart_active_pending_withdrawal_id', newWithdrawalId);
      } catch {}

      // Store into user permanent audit log (never deleted by admin actions)
      try {
        const savedPerm = localStorage.getItem('quizkart_user_withdrawals_permanent');
        const list = savedPerm ? JSON.parse(savedPerm) : [];
        if (Array.isArray(list)) {
          const filtered = list.filter((item: any) => item && item.id !== newWithdrawalId);
          localStorage.setItem('quizkart_user_withdrawals_permanent', JSON.stringify([newWithdrawal, ...filtered]));
        }
      } catch {}

      saveWithdrawalToFirestore(newWithdrawal).catch(err => {
        console.warn('Firestore withdrawal sync notice:', err);
      });

      setSubmittedRequest(newWithdrawal);
      setIsSubmitting(false);
      soundFx.playSuccess();
    }, 1000);
  };

  const handleCancel = () => {
    if (isSubmitting || isCancelling) return;
    soundFx.playClick();
    setIsCancelling(true);
    setTimeout(() => {
      setIsCancelling(false);
      onBackToProfile();
    }, 1000);
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 pb-16">
      {/* Top Navigation Bar: Back Arrow, Bank Withdrawal Title with modern icon, and Withdrawal History Icon */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              onBackToProfile();
            }}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Back to Profile"
            aria-label="Back to Profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: PRIMARY_GRADIENT }}
            >
              <Landmark className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
              Bank Withdrawal
            </h1>
          </div>
        </div>

        {/* Withdrawal History Shortcut Icon Button strictly to the far right corner with pure white background */}
        <button
          type="button"
          id="withdrawal-history-shortcut-btn"
          onClick={() => {
            soundFx.playClick();
            onOpenHistory();
          }}
          className="w-9 h-9 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 border border-slate-200 ml-auto"
          style={{ backgroundColor: '#FFFFFF' }}
          title="Withdrawal Transaction History"
          aria-label="Withdrawal Transaction History"
        >
          <Clock className="w-4.5 h-4.5 text-slate-700" />
        </button>
      </div>

      {isScreenLocked && displayedPendingRequest ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
          <div 
            className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg"
            style={{ background: PRIMARY_GRADIENT }}
          >
            <CheckCircle2 className="w-9 h-9 text-white" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Withdrawal Submitted!</h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto font-medium">
              Your withdrawal request has been successfully submitted and is under verification.
            </p>
          </div>

          {/* Details Card */}
          <div
            className="p-4 bg-white rounded-2xl border border-slate-200 text-xs space-y-2 text-left max-w-sm mx-auto"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Request ID</span>
              <span className="font-mono font-bold text-slate-900">{formatWithdrawalId(displayedPendingRequest.id)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Account Number</span>
              <span className="font-mono font-bold text-slate-900">••••{(displayedPendingRequest.accountNumber || '').slice(-4) || '••••'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">IFSC Code</span>
              <span className="font-mono font-bold text-slate-900">{displayedPendingRequest.ifscCode || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Timestamp</span>
              <span className="font-medium text-slate-700">{displayedPendingRequest.timestamp}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-medium">Status</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                Pending Verification
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onBackToProfile();
              }}
              className="py-2.5 px-6 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer hover:opacity-95 active:scale-95 transition-all"
              style={{ background: PRIMARY_GRADIENT }}
            >
              Back to Profile
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onOpenHistory();
              }}
              className="py-2.5 px-6 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer hover:opacity-95 active:scale-95 transition-all"
              style={{ background: PRIMARY_GRADIENT }}
            >
              View History
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-6">
          {/* Wallet Balance & Limits Card */}
          <div
            className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-2.5 text-xs"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Available Wallet Balance</span>
              <span className="font-black text-base text-emerald-600" style={{ color: '#16A34A' }}>₹{walletBalance}</span>
            </div>

            {amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Requested Withdrawal</span>
                <span className="font-bold text-sm text-red-600" style={{ color: '#DC2626' }}>-₹{amount}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <span className="font-semibold text-slate-600">Net Remaining Balance</span>
              <span className="font-black text-sm text-emerald-600" style={{ color: '#16A34A' }}>₹{remainingBalance}</span>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-200/80">
              <span className="text-[11px] text-slate-500 font-medium">Transaction Limits</span>
              <span 
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-2xs"
                style={{ background: PRIMARY_GRADIENT }}
              >
                Min ₹100 - Max ₹5000
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick Amount Selector & Custom Amount */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Withdrawal Amount (₹)
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[100, 250, 500, 1000].map((quickAmt) => {
                  const isSelected = amount === quickAmt;
                  return (
                    <button
                      key={quickAmt}
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setAmount(quickAmt);
                        setErrorMsg('');
                      }}
                      className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        isSelected
                          ? 'text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      style={isSelected ? { background: PRIMARY_GRADIENT } : undefined}
                    >
                      ₹{quickAmt}
                    </button>
                  );
                })}
              </div>

              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{ backgroundColor: '#FFFFFF' }}
                  className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold text-xs outline-none focus:border-slate-400 shadow-2xs"
                />
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{ backgroundColor: '#FFFFFF' }}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-semibold outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Mobile Number
              </label>
              <input
                type="tel"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={15}
                style={{ backgroundColor: '#FFFFFF' }}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-semibold outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>

            {/* Account Holder Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                style={{ backgroundColor: '#FFFFFF' }}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-semibold outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>

            {/* Bank Account Number with Visibility Toggle Eye Icon */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Bank Account Number
              </label>
              <div className="relative">
                <input
                  type={showAccountNumber ? 'text' : 'password'}
                  required
                  maxLength={18}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ backgroundColor: '#FFFFFF' }}
                  className="w-full pl-4 pr-11 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-semibold outline-none focus:border-indigo-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowAccountNumber(!showAccountNumber)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  tabIndex={-1}
                  aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                >
                  {showAccountNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Re-enter Bank Account Number with Visibility Toggle Eye Icon */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Re-enter Bank Account Number
              </label>
              <div className="relative">
                <input
                  type={showConfirmAccountNumber ? 'text' : 'password'}
                  required
                  maxLength={18}
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ backgroundColor: '#FFFFFF' }}
                  className="w-full pl-4 pr-11 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-semibold outline-none focus:border-indigo-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmAccountNumber(!showConfirmAccountNumber)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  tabIndex={-1}
                  aria-label={showConfirmAccountNumber ? 'Hide account number' : 'Show account number'}
                >
                  {showConfirmAccountNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bank IFSC Code (STRICT RULE: DO NOT alter, modify, or add any icon to IFSC field) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Bank IFSC Code
              </label>
              <input
                type="text"
                required
                maxLength={11}
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                style={{ backgroundColor: '#FFFFFF' }}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-bold tracking-wider outline-none focus:border-indigo-500 shadow-2xs uppercase"
              />
            </div>

            {/* Actions: Cancel & Submit Withdrawal Request (1-second spinner feedback) */}
            <div className="pt-3 space-y-2.5">
              {/* Submit Button (Exact Image 1 Gradient) */}
              <button
                type="submit"
                id="submit-withdrawal-btn"
                disabled={isSubmitting || isCancelling}
                className={`w-full py-3.5 px-6 rounded-xl text-white text-xs font-bold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 ${
                  isSubmitting || isCancelling
                    ? 'opacity-70 cursor-not-allowed'
                    : 'hover:opacity-95 active:scale-[0.99] cursor-pointer'
                }`}
                style={{ background: PRIMARY_GRADIENT }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Processing Request...</span>
                  </>
                ) : (
                  <span>Submit Withdrawal Request</span>
                )}
              </button>

              {/* Cancel Button Styled with Exact Image 1 Gradient */}
              <button
                type="button"
                id="cancel-withdrawal-btn"
                disabled={isSubmitting || isCancelling}
                onClick={handleCancel}
                className={`w-full py-3 px-6 rounded-xl text-white text-xs font-bold tracking-wide shadow-sm transition-all text-center flex items-center justify-center gap-2 ${
                  isSubmitting || isCancelling
                    ? 'opacity-70 cursor-not-allowed'
                    : 'hover:opacity-95 active:scale-[0.99] cursor-pointer'
                }`}
                style={{ background: PRIMARY_GRADIENT }}
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Cancel</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
