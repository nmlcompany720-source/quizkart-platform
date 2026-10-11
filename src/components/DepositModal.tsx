import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Loader2
} from 'lucide-react';
import { DepositRequest } from '../types';
import { soundFx } from '../utils/audio';
import { compressImage } from '../utils/imageCompressor';
import phonepeQrImage from '../assets/images/phonepe_qr_code_1789873152962.jpg';
import { getActiveDepositQr } from '../utils/qrConfig';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  userPhone: string;
  userUpiId?: string;
  hasPendingDeposit: boolean;
  pendingDepositDetails?: DepositRequest;
  onSubmitDeposit: (deposit: Omit<DepositRequest, 'id' | 'timestamp' | 'status'>) => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  userName,
  userPhone,
  userUpiId,
  hasPendingDeposit,
  pendingDepositDetails,
  onSubmitDeposit
}) => {
  // 5-Minute Auto-Cancel Countdown Timer (300 seconds)
  const TOTAL_SECONDS = 300;
  const [secondsRemaining, setSecondsRemaining] = useState(TOTAL_SECONDS);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // Form State
  const [amount, setAmount] = useState<number>(100);
  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Submission Alert State
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);

  // Timer Effect: Starts when modal opens, counts down to 0, then auto-cancels
  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(TOTAL_SECONDS);
      setIsTimedOut(false);
      setShowSuccessAlert(false);
      setIsSubmitting(false);
      setErrorMsg('');
      return;
    }

    setSecondsRemaining(TOTAL_SECONDS);
    setIsTimedOut(false);

    const timerId = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          setIsTimedOut(true);
          soundFx.playTimerWarning();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [isOpen]);

  // Handle auto-cancel timeout
  useEffect(() => {
    if (isTimedOut && isOpen) {
      const timeoutId = setTimeout(() => {
        onClose();
      }, 3500);
      return () => clearTimeout(timeoutId);
    }
  }, [isTimedOut, isOpen, onClose]);

  if (!isOpen) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (JPG, PNG, WEBP).');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    try {
      setScreenshotFileName(file.name);
      const compressed = await compressImage(file, 900, 0.85);
      setScreenshotUrl(compressed);
      soundFx.playClick();
    } catch {
      setErrorMsg('Failed to process screenshot. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset input value so re-selecting same file triggers onChange
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (hasPendingDeposit) {
      setErrorMsg('A previous deposit is currently pending verification. You cannot submit another request.');
      return;
    }

    if (secondsRemaining <= 0) {
      setErrorMsg('Transaction session timed out. Please initiate a new deposit.');
      return;
    }

    if (amount < 100) {
      setErrorMsg('Minimum deposit allowed is ₹100.');
      return;
    }

    const trimmedUtr = utrNumber.trim();
    if (trimmedUtr.length < 6) {
      setErrorMsg('Please enter a valid UTR / Ref Number.');
      return;
    }

    if (!screenshotUrl) {
      setErrorMsg('Please upload your payment screenshot.');
      return;
    }

    // Directives: Show 1-second circular loading spinner before triggering submission event
    setIsSubmitting(true);
    soundFx.playClick();

    setTimeout(() => {
      soundFx.playSuccess();
      onSubmitDeposit({
        userName,
        phone: userPhone,
        upiId: userUpiId || 'Contestant UPI',
        amount: Number(amount),
        utrNumber: trimmedUtr,
        screenshotUrl,
        app: 'PhonePe'
      });

      setIsSubmitting(false);
      setShowSuccessAlert(true);
      setTimeout(() => {
        onClose();
        setShowSuccessAlert(false);
      }, 3000);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 3. HEADER: Shortened and clean top title line to concise "PhonePe Deposit" */}
        <div 
          className="px-5 py-3.5 text-white flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
        >
          <h3 className="text-base font-black tracking-tight leading-none">PhonePe Deposit</h3>

          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3. TIMER STRIP CLEANUP: Strip out "Session Expires In:", the session icon, and "(Auto-cancels at 00:00)". Show ONLY the live countdown timer badge centered cleanly */}
        <div className="py-2 flex items-center justify-center bg-slate-50 border-b border-slate-200/80">
          <span
            className="font-mono text-sm font-black tracking-widest px-3 py-0.5 rounded-full text-white shadow-xs"
            style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
          >
            {formatTimer(secondsRemaining)}
          </span>
        </div>

        {/* Timed Out Notification Overlay */}
        {isTimedOut && (
          <div className="p-6 text-center space-y-2 bg-rose-50/90 border-b border-rose-200">
            <h4 className="text-sm font-black text-rose-900">Session Timed Out</h4>
            <p className="text-xs text-rose-700 leading-relaxed max-w-xs mx-auto">
              The 5-minute transaction window has expired. Closing window...
            </p>
          </div>
        )}

        {/* Success Alert Modal (After submission) */}
        {showSuccessAlert ? (
          <div className="p-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div 
              className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
            >
              <CheckCircle2 className="w-9 h-9 text-white" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-lg font-black text-slate-900">Deposit Submitted!</h4>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto font-medium">
                Deposit submitted! Verification usually takes 24-48 hours. Please be patient.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-mono text-slate-600">
              UTR Reference: <span className="font-bold text-slate-900">{utrNumber}</span> • ₹{amount}
            </div>
            <p className="text-[11px] text-slate-400">Returning to wallet dashboard...</p>
          </div>
        ) : !isTimedOut && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Single Pending Deposit Restriction Banner */}
            {hasPendingDeposit && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pending Deposit In Queue</span>
                </div>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  You already have a deposit request of ₹{pendingDepositDetails?.amount || 100} awaiting verification.
                </p>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 4. QR CODE DISPLAY: Single clean container matching original square dimensions, no nested boxes, no banner, no UPI ID line */}
            <div className="flex justify-center">
              <div className="w-56 h-56 bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex items-center justify-center overflow-hidden">
                {(getActiveDepositQr() || phonepeQrImage) ? (
                  <img 
                    src={getActiveDepositQr() || phonepeQrImage} 
                    alt="PhonePe QR Code" 
                    className="w-full h-full object-contain rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </div>
            </div>

            {/* 4. DEPOSIT AMOUNT SELECTION: No currency icon in label, includes ₹1000 quick option, Signature 3-Color Gradient for active pill */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Deposit Amount
              </label>
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
                      }}
                      className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
                        isSelected
                          ? 'text-white shadow-xs border-transparent'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      style={isSelected ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' } : undefined}
                    >
                      ₹{amt}
                    </button>
                  );
                })}
              </div>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-bold outline-none focus:border-blue-500"
                  placeholder="Minimum ₹100"
                />
              </div>
            </div>

            {/* 5. UTR INPUT FIELD: Label "UTR / Ref Number", removed "0/12 Digits", removed placeholder and explanatory line */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                UTR / Ref Number
              </label>
              <input
                type="text"
                required
                maxLength={22}
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                className="w-full px-3 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-bold tracking-wider outline-none focus:border-blue-500"
              />
            </div>

            {/* 5. SCREENSHOT UPLOAD BOX: Title "Upload Screenshot", single clean upload icon, single-click upload */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Upload Screenshot
              </label>

              <input
                id="deposit-screenshot-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {screenshotUrl ? (
                <div className="relative p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <img 
                      src={screenshotUrl} 
                      alt="Screenshot Preview" 
                      className="w-12 h-12 object-cover rounded-xl border border-emerald-300 shrink-0" 
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-900 truncate">
                        {screenshotFileName || 'Payment_Proof.jpg'}
                      </p>
                      <p className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Screenshot Attached
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshotUrl('');
                      setScreenshotFileName('');
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label 
                  htmlFor="deposit-screenshot-upload"
                  className="block p-5 border border-dashed border-slate-300 hover:border-blue-500 rounded-2xl text-center bg-slate-50/60 hover:bg-blue-50/30 transition-all cursor-pointer"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div 
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                    >
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                      {isUploading ? 'Processing Image...' : 'Upload Screenshot'}
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* 6. SUBMIT, LOADING & CANCEL ACTIONS */}
            <div className="pt-2 space-y-2.5">
              <button
                type="submit"
                id="submit-deposit-btn"
                disabled={hasPendingDeposit || isUploading || isSubmitting}
                className={`w-full py-3 px-6 rounded-xl text-white text-xs font-bold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 ${
                  hasPendingDeposit || isUploading || isSubmitting
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:opacity-95 active:scale-[0.99] cursor-pointer'
                }`}
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit</span>
                )}
              </button>

              <button
                type="button"
                id="cancel-deposit-btn"
                onClick={() => {
                  soundFx.playClick();
                  onClose();
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl shadow-xs transition-opacity hover:opacity-95 active:scale-[0.99] cursor-pointer text-center"
                style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
