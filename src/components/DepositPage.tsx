import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
  Upload, 
  AlertCircle, 
  Check, 
  Loader2,
  Clock
} from 'lucide-react';
import { DepositRequest, UserProfile } from '../types';
import { soundFx } from '../utils/audio';
import { compressScreenshot, normalizeImageUrl } from '../utils/imageCompressor';
import phonepeExactQr from '../assets/images/phonepe_exact_qr.jpg';
import { saveDepositToFirestore } from '../firebase';
import { getNextDepositId, getCurrentFormattedTimestamp, getDeletedDepositIds, formatDepositId } from '../utils/depositUtils';
import { getActiveDepositQr } from '../utils/qrConfig';

interface DepositPageProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  deposits: DepositRequest[];
  onAddDeposit: (deposit: Omit<DepositRequest, 'id' | 'timestamp' | 'status'> & { id?: string }) => void;
  onBackToDashboard: () => void;
  onBackToProfile: () => void;
  onOpenHistory?: () => void;
  activeDepositQr?: string;
}

const GRADIENT_BG = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const DRAFT_STORAGE_KEY = 'quizkart_deposit_flow_draft';
const TIMER_STORAGE_KEY = 'quizkart_deposit_timer_deadline';
const TOTAL_SECONDS = 300;

export const DepositPage: React.FC<DepositPageProps> = ({
  userProfile,
  deposits,
  onAddDeposit,
  onBackToDashboard,
  onBackToProfile,
  onOpenHistory,
  activeDepositQr: propActiveDepositQr
}) => {
  // Dynamic Active QR Source synced with Admin QR Management
  const [activeQr, setActiveQr] = useState<string>(() => {
    return propActiveDepositQr || getActiveDepositQr();
  });

  useEffect(() => {
    if (propActiveDepositQr) {
      setActiveQr(propActiveDepositQr);
    }
  }, [propActiveDepositQr]);

  useEffect(() => {
    const handleStorageChange = () => {
      const latest = getActiveDepositQr();
      if (latest) {
        setActiveQr(latest);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  // Read persistent flow draft from localStorage so state persists when switching to UPI apps
  const savedDraft = (() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  })();

  // Flow Step: 1 = Amount Selection, 2 = Payment Checkout Page
  const [step, setStep] = useState<1 | 2>(() => {
    if (savedDraft && savedDraft.step === 2 && savedDraft.amount >= 100) {
      return 2;
    }
    return 1;
  });

  // Global 5-Minute Countdown Timer that runs continuously across all deposit pages
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(TIMER_STORAGE_KEY);
      if (stored) {
        const deadline = parseInt(stored, 10);
        const diff = Math.floor((deadline - Date.now()) / 1000);
        if (diff > 0 && diff <= TOTAL_SECONDS) {
          return diff;
        }
      }
      const newDeadline = Date.now() + TOTAL_SECONDS * 1000;
      localStorage.setItem(TIMER_STORAGE_KEY, newDeadline.toString());
      return TOTAL_SECONDS;
    } catch {
      return TOTAL_SECONDS;
    }
  });

  // Form State with state persistence
  const [amount, setAmount] = useState<number>(() => {
    if (savedDraft && typeof savedDraft.amount === 'number' && savedDraft.amount >= 100) {
      return savedDraft.amount;
    }
    return 100;
  });
  const [utrNumber, setUtrNumber] = useState<string>(() => {
    return savedDraft?.utrNumber || '';
  });
  const [screenshotUrl, setScreenshotUrl] = useState<string>(() => {
    return savedDraft?.screenshotUrl || '';
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentUserEmail = (userProfile.email || '').trim().toLowerCase();

  // Track the ID of the submitted or active pending deposit strictly for current email
  const [submittedDepositId, setSubmittedDepositId] = useState<string | null>(() => {
    try {
      const deletedDeposits = getDeletedDepositIds();
      const activeId = localStorage.getItem('quizkart_active_pending_deposit_id');
      if (activeId && currentUserEmail) {
        const normActiveId = formatDepositId(activeId);
        if (deletedDeposits.includes(activeId) || deletedDeposits.includes(normActiveId)) {
          localStorage.removeItem('quizkart_active_pending_deposit_id');
          return null;
        }
        const found = deposits.find((d) => {
          if (!d) return false;
          const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
          return dEmail === currentUserEmail && (d.id === activeId || formatDepositId(d.id) === normActiveId);
        });
        if (found) {
          if (found.status === 'pending') return activeId;
          localStorage.removeItem('quizkart_active_pending_deposit_id');
          return null;
        }
        // If not found for this email, clear lock
        localStorage.removeItem('quizkart_active_pending_deposit_id');
        return null;
      }
    } catch {}

    if (!currentUserEmail) return null;
    const deletedDeposits = getDeletedDepositIds();
    const existing = deposits.find((d) => {
      if (!d || d.status !== 'pending') return false;
      if (deletedDeposits.includes(d.id) || deletedDeposits.includes(formatDepositId(d.id))) return false;
      const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
      return Boolean(dEmail && dEmail === currentUserEmail);
    });
    return existing ? existing.id : null;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current user has an active pending deposit strictly by email
  const activePendingDeposit = deposits.find((d) => {
    if (!d || d.status !== 'pending' || !currentUserEmail) return false;
    if (getDeletedDepositIds().includes(d.id) || getDeletedDepositIds().includes(formatDepositId(d.id))) return false;
    const dEmail = (d.userEmail || d.email || '').trim().toLowerCase();
    return Boolean(dEmail && dEmail === currentUserEmail);
  });

  const isPendingActive = Boolean(activePendingDeposit);

  // Sync draft to localStorage on any modification so app switches do NOT reset inputs
  useEffect(() => {
    if (isPendingActive) return;
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          step,
          amount,
          utrNumber,
          screenshotUrl
        })
      );
    } catch {}
  }, [step, amount, utrNumber, screenshotUrl, isPendingActive]);

  // Global 5-minute Countdown Timer (continuous across all deposit pages)
  useEffect(() => {
    if (isPendingActive) return;

    const timerId = setInterval(() => {
      try {
        const stored = localStorage.getItem(TIMER_STORAGE_KEY);
        if (stored) {
          const deadline = parseInt(stored, 10);
          const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
          if (remaining <= 0) {
            // Refresh deadline seamlessly so app switching never expires the session
            const newDeadline = Date.now() + TOTAL_SECONDS * 1000;
            localStorage.setItem(TIMER_STORAGE_KEY, newDeadline.toString());
            setSecondsRemaining(TOTAL_SECONDS);
          } else {
            setSecondsRemaining(remaining);
          }
        } else {
          setSecondsRemaining((prev) => {
            if (prev <= 1) {
              return TOTAL_SECONDS;
            }
            return prev - 1;
          });
        }
      } catch {
        setSecondsRemaining((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(timerId);
  }, [isPendingActive]);

  // Real-time synchronization: listen for admin processing (approve/reject/delete) across tabs and views
  useEffect(() => {
    const handleStatusChange = () => {
      try {
        const activeId = localStorage.getItem('quizkart_active_pending_deposit_id');
        if (!activeId) {
          setSubmittedDepositId(null);
        }
      } catch {}
    };

    window.addEventListener('quizkart_deposit_status_changed', handleStatusChange);
    window.addEventListener('storage', handleStatusChange);
    return () => {
      window.removeEventListener('quizkart_deposit_status_changed', handleStatusChange);
      window.removeEventListener('storage', handleStatusChange);
    };
  }, []);

  // AUTOMATIC CREDIT & APPROVAL WATCHER:
  // When Admin approves the pending deposit, instantly credit wallet and navigate back to main dashboard
  useEffect(() => {
    const activeId = submittedDepositId || (() => {
      try {
        return localStorage.getItem('quizkart_active_pending_deposit_id');
      } catch {
        return null;
      }
    })();

    if (!activeId) return;

    const dep = deposits.find((d) => d && d.id === activeId);
    if (!dep) return;

    if (dep.status === 'approved') {
      try {
        localStorage.removeItem('quizkart_active_pending_deposit_id');
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        localStorage.removeItem(TIMER_STORAGE_KEY);
      } catch {}
      setSubmittedDepositId(null);
      soundFx.playSuccess();
      onBackToDashboard();
    } else if (dep.status === 'rejected') {
      try {
        localStorage.removeItem('quizkart_active_pending_deposit_id');
        localStorage.removeItem(TIMER_STORAGE_KEY);
      } catch {}
      soundFx.playWrong();
      setSubmittedDepositId(null);
      setErrorMsg('Your previous deposit request was rejected by admin. You may initiate a new deposit.');
    }
  }, [deposits, submittedDepositId, onBackToDashboard]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Step 1: Handle Proceed to Pay button
  const handleProceedToPay = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (userProfile.isBlocked) {
      setErrorMsg('Your Account has been Blocked by Admin');
      soundFx.playWrong();
      return;
    }

    if (amount < 100) {
      setErrorMsg('Minimum deposit amount is ₹100.');
      soundFx.playWrong();
      return;
    }

    soundFx.playClick();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Upload Payment Screenshot with robust compression and preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (JPG, PNG, or WebP).');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    try {
      const dataUrl = await compressScreenshot(file);
      setScreenshotUrl(dataUrl);
      soundFx.playClick();
    } catch {
      setErrorMsg('Failed to process screenshot. Please try selecting the image again.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDropzoneClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  // Step 2: Finalize Deposit Submission
  const handleSubmitDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (userProfile.isBlocked) {
      setErrorMsg('Your Account has been Blocked by Admin');
      soundFx.playWrong();
      return;
    }

    if (isPendingActive) {
      setErrorMsg('A deposit request is currently pending admin verification.');
      return;
    }

    if (secondsRemaining <= 0) {
      setErrorMsg('Transaction session timed out. Please refresh to start a new session.');
      return;
    }

    if (amount < 100) {
      setErrorMsg('Minimum deposit allowed is ₹100.');
      return;
    }

    const trimmedUtr = utrNumber.trim();
    if (trimmedUtr.length < 6) {
      setErrorMsg('Please enter a valid 12-digit UTR / Reference Number.');
      return;
    }

    if (!screenshotUrl) {
      setErrorMsg('Please upload your payment screenshot.');
      return;
    }

    setIsSubmitting(true);
    soundFx.playClick();

    setTimeout(() => {
      const newId = getNextDepositId(deposits);
      const now = new Date();

      const newDepositItem: DepositRequest = {
        id: newId,
        userName: userProfile.name,
        userEmail: userProfile.email,
        email: userProfile.email,
        phone: userProfile.mobile,
        upiId: userProfile.upiId || 'Contestant UPI',
        amount: Number(amount),
        utrNumber: trimmedUtr,
        screenshotUrl,
        app: 'PhonePe',
        timestamp: getCurrentFormattedTimestamp(),
        date: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        status: 'pending'
      };

      onAddDeposit(newDepositItem);
      setSubmittedDepositId(newId);

      try {
        localStorage.setItem('quizkart_active_pending_deposit_id', newId);
        localStorage.removeItem(DRAFT_STORAGE_KEY);

        // Store into user permanent audit log (never deleted by admin actions)
        const savedPerm = localStorage.getItem('quizkart_user_deposits_permanent');
        const list = savedPerm ? JSON.parse(savedPerm) : [];
        if (Array.isArray(list)) {
          const filtered = list.filter((item: any) => item && item.id !== newId);
          localStorage.setItem('quizkart_user_deposits_permanent', JSON.stringify([newDepositItem, ...filtered]));
        }
      } catch {}

      saveDepositToFirestore(newDepositItem).catch((err) => {
        console.warn('Firestore deposit sync notice:', err);
      });

      setIsSubmitting(false);
      soundFx.playSuccess();
    }, 1000);
  };

  // CONFIRMATION & PENDING APPROVAL SCREEN
  if (isPendingActive) {
    return (
      <div className="min-h-[75vh] w-full flex flex-col items-center justify-center p-4 space-y-4">
        <div 
          id="deposit-pending-card"
          className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 text-center shadow-xl border border-slate-200/90 space-y-6 animate-in zoom-in-95 duration-200"
        >
          <div 
            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white shadow-lg"
            style={{ background: GRADIENT_BG }}
          >
            <Check className="w-10 h-10 text-white stroke-[3.5]" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              Deposit Submitted
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto font-medium leading-relaxed">
              Verification takes 24-48 hours. Please be patient.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-center">
            <span 
              className="text-xs sm:text-sm font-bold tracking-wide"
              style={{
                background: GRADIENT_BG,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Waiting for Admin Approval...
            </span>
          </div>
        </div>

        <div className="w-full max-w-md">
          <button
            type="button"
            id="deposit-back-to-dashboard-btn"
            onClick={() => {
              soundFx.playClick();
              onBackToDashboard();
            }}
            className="w-full py-3.5 px-6 rounded-2xl text-white font-bold text-sm tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
            style={{ background: GRADIENT_BG }}
          >
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PAGE 1: DEPOSIT AMOUNT SELECTION (IMAGE 1 REF)
  // - "Deposit" text directly adjacent to back arrow icon
  // - Global continuous 5-minute countdown timer on right
  // - Cleaned: removed "STEP 1 OF 2", "Select Deposit Amount", subtext, "Quick Presets"
  // - Action Button: "Proceed to Pay" (no checkmark icon, no amount number)
  // =========================================================================
  if (step === 1) {
    return (
      <div className="w-full max-w-md mx-auto space-y-5 pb-10">
        {/* Header Bar: "Deposit" directly adjacent to back arrow, timer on right */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onBackToProfile();
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Back to Wallet"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Deposit
            </h1>
          </div>

          {/* History Shortcut Icon strictly to the far right corner with pure white background */}
          {onOpenHistory && (
            <button
              type="button"
              id="deposit-history-btn"
              onClick={() => {
                soundFx.playClick();
                onOpenHistory();
              }}
              className="w-9 h-9 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 border border-slate-200 shrink-0 ml-auto"
              style={{ backgroundColor: '#FFFFFF' }}
              title="Deposit Transaction History"
              aria-label="Deposit Transaction History"
            >
              <Clock className="w-4.5 h-4.5 text-slate-700" />
            </button>
          )}
        </div>

        {/* Clean Amount Selection Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-6">
          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleProceedToPay} className="space-y-5">
            {/* Quick preset amount buttons (without "Quick Presets" title) */}
            <div className="grid grid-cols-4 gap-2">
              {[100, 200, 500, 1000].map((amt) => {
                const isSelected = amount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      soundFx.playClick();
                      setAmount(amt);
                      setErrorMsg('');
                    }}
                    className={`py-3 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
                      isSelected
                        ? 'text-white shadow-md scale-[1.02]'
                        : 'border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                    style={isSelected ? { background: GRADIENT_BG } : undefined}
                  >
                    ₹{amt}
                  </button>
                );
              })}
            </div>

            {/* Custom Amount input box */}
            <div className="space-y-1.5">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">₹</span>
                <input
                  type="number"
                  min={100}
                  step={1}
                  placeholder="Enter custom amount"
                  value={amount > 0 ? amount : ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setAmount(0);
                    } else {
                      const num = parseInt(raw, 10);
                      setAmount(isNaN(num) ? 0 : Math.max(0, num));
                    }
                    setErrorMsg('');
                  }}
                  className="w-full pl-8 pr-4 py-3 text-sm bg-white border border-slate-300 rounded-2xl text-slate-900 font-black outline-none focus:border-[#06b6d4] focus:ring-2 focus:ring-[#4f46e5]/15 transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Minimum deposit amount is ₹100</p>
            </div>

            {/* "Proceed to Pay" button: No checkmark icon, no amount number */}
            <div className="pt-2">
              <button
                type="submit"
                id="proceed-to-pay-btn"
                className="w-full py-3.5 px-6 rounded-2xl text-white text-sm font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center"
                style={{ background: GRADIENT_BG }}
              >
                <span>Proceed to Pay</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PAGE 2: PAYMENT CHECKOUT PAGE (LONG SINGLE PAGE LAYOUT)
  // - "Payment Checkout" directly adjacent to back arrow icon
  // - Removed green amount badge
  // - STEP 1: only number "1", simplified title, no subtext, no amount badge,
  //   clean exact QR Code from Image 6, shorter professional "Pay via UPI" button (no arrow)
  // - STEP 2: only number "2", simplified title "Enter UTR", no subtext,
  //   no external label, no placeholder, no bottom hint, removed official UPI card
  // - STEP 3: only number "3", simplified title "Upload Screenshot", no subtext,
  //   no upload label, no text inside/below upload logo, Submit Deposit button (no amount)
  // =========================================================================
  return (
    <div className="w-full max-w-xl mx-auto space-y-5 pb-16">
      {/* Top Header Bar: "Payment Checkout" directly adjacent to back arrow, timer on right */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setStep(1);
            }}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Change Amount"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Payment Checkout
          </h1>
        </div>

        {/* History Shortcut Icon strictly to the far right corner with pure white background */}
        {onOpenHistory && (
          <button
            type="button"
            id="checkout-history-btn"
            onClick={() => {
              soundFx.playClick();
              onOpenHistory();
            }}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 border border-slate-200 shrink-0 ml-auto"
            style={{ backgroundColor: '#FFFFFF' }}
            title="Deposit Transaction History"
            aria-label="Deposit Transaction History"
          >
            <Clock className="w-4.5 h-4.5 text-slate-700" />
          </button>
        )}
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* LONG SINGLE PAGE CHECKOUT CONTAINER */}
      <div className="space-y-6">

        {/* ------------------------------------------------------------- */}
        {/* STEP 1: QR CODE CONTAINER                                     */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-5">
          {/* Step Header: Only number '1', simplified title */}
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div 
              className="w-7 h-7 rounded-xl text-white font-black text-xs flex items-center justify-center shadow-xs"
              style={{ background: GRADIENT_BG }}
            >
              1
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Scan QR Code
            </h3>
          </div>

          {/* EXACT QR CODE: Untouched QR Code image inside this container box */}
          <div className="w-full max-w-xs sm:max-w-sm mx-auto flex items-center justify-center">
            {(activeQr || phonepeExactQr) ? (
              <img 
                src={activeQr || phonepeExactQr} 
                alt="Payment QR Code" 
                className="w-full h-auto max-h-[380px] object-contain rounded-2xl"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* STEP 2: ENTER UTR / REFERENCE NUMBER                          */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-4">
          {/* Step Header: Only number '2', simplified title, no subtext */}
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div 
              className="w-7 h-7 rounded-xl text-white font-black text-xs flex items-center justify-center shadow-xs"
              style={{ background: GRADIENT_BG }}
            >
              2
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Enter UTR
            </h3>
          </div>

          {/* Clean Input Box: No external label, no placeholder, no bottom hint */}
          <div>
            <input
              type="text"
              required
              maxLength={22}
              value={utrNumber}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                setUtrNumber(cleaned);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3 text-xs sm:text-sm bg-white border border-slate-300 rounded-2xl text-slate-900 font-mono font-bold tracking-wider outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* STEP 3: UPLOAD SCREENSHOT PROOF & SUBMIT                       */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-5">
          {/* Step Header: Only number '3', simplified title, no subtext */}
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div 
              className="w-7 h-7 rounded-xl text-white font-black text-xs flex items-center justify-center shadow-xs"
              style={{ background: GRADIENT_BG }}
            >
              3
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Upload Screenshot
            </h3>
          </div>

          <form onSubmit={handleSubmitDeposit} className="space-y-5">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {screenshotUrl ? (
                /* SELECTED PREVIEW STATE: Clean thumbnail with click-to-change */
                <div 
                  onClick={handleDropzoneClick}
                  className="w-full p-3 rounded-2xl bg-slate-50 border-2 border-dashed border-emerald-400/80 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-emerald-50/30 transition-all"
                  title="Click to change screenshot"
                >
                  <div className="max-w-[200px] max-h-[160px] rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs p-1 flex items-center justify-center">
                    {normalizeImageUrl(screenshotUrl) ? (
                      <img 
                        src={normalizeImageUrl(screenshotUrl)} 
                        alt="Payment Proof Preview" 
                        style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }}
                        className="max-h-[150px] w-auto object-contain rounded-lg" 
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    Click to change screenshot
                  </span>
                </div>
              ) : (
                /* UNSELECTED STATE: Clean icon dropzone without internal text */
                <div 
                  onClick={handleDropzoneClick}
                  className="w-full py-8 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl flex items-center justify-center bg-slate-50/70 hover:bg-blue-50/30 transition-all cursor-pointer"
                  title="Upload screenshot"
                >
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xs"
                    style={{ background: GRADIENT_BG }}
                  >
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    ) : (
                      <Upload className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SUBMIT DEPOSIT BUTTON: "Submit Deposit" (without amount) */}
            <div className="pt-2">
              <button
                type="submit"
                id="submit-deposit-btn"
                disabled={isUploading || isSubmitting || secondsRemaining <= 0 || !utrNumber.trim() || !screenshotUrl}
                className={`w-full py-3.5 px-6 rounded-2xl text-white text-xs sm:text-sm font-bold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 ${
                  isUploading || isSubmitting || secondsRemaining <= 0 || !utrNumber.trim() || !screenshotUrl
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:opacity-95 active:scale-[0.99] cursor-pointer'
                }`}
                style={{ background: GRADIENT_BG }}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Submitting Deposit...</span>
                  </div>
                ) : (
                  <span>Submit Deposit</span>
                )}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};
