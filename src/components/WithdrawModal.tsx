import React, { useState } from 'react';
import { 
  X, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Wallet,
  Info
} from 'lucide-react';
import { WithdrawalRequest } from '../types';
import { soundFx } from '../utils/audio';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  userName: string;
  userPhone: string;
  onSubmitWithdrawal: (withdrawal: Omit<WithdrawalRequest, 'id' | 'timestamp' | 'status'>) => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  walletBalance,
  userName,
  userPhone,
  onSubmitWithdrawal
}) => {
  const [accountHolderName, setAccountHolderName] = useState(userName || '');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [amount, setAmount] = useState<number>(100);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Transaction Limits: Min ₹100 – Max ₹5000
    if (amount < 100) {
      setErrorMsg('Minimum withdrawal amount is ₹100.');
      return;
    }

    if (amount > 5000) {
      setErrorMsg('Maximum withdrawal amount is ₹5000 per request.');
      return;
    }

    if (amount > walletBalance) {
      setErrorMsg(`Insufficient wallet balance. You only have ₹${walletBalance} available.`);
      return;
    }

    if (!accountHolderName.trim()) {
      setErrorMsg('Please enter the bank account holder name.');
      return;
    }

    const cleanAcc = accountNumber.trim();
    if (cleanAcc.length < 9 || cleanAcc.length > 18) {
      setErrorMsg('Please enter a valid bank account number (9 to 18 digits).');
      return;
    }

    if (cleanAcc !== confirmAccountNumber.trim()) {
      setErrorMsg('Bank account numbers do not match. Please re-check.');
      return;
    }

    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (cleanIfsc.length !== 11) {
      setErrorMsg('Please enter a valid 11-character IFSC code (e.g. HDFC0001234).');
      return;
    }

    soundFx.playSuccess();
    onSubmitWithdrawal({
      userName,
      phone: userPhone,
      accountHolderName: accountHolderName.trim(),
      accountNumber: cleanAcc,
      ifscCode: cleanIfsc,
      amount: Number(amount)
    });

    setShowSuccessAlert(true);
    setTimeout(() => {
      onClose();
      setShowSuccessAlert(false);
      setAccountNumber('');
      setConfirmAccountNumber('');
    }, 3200);
  };

  const remainingBalance = Math.max(0, walletBalance - (Number(amount) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Strip with Clean White Background & Image 1 Gradient Bank Icon */}
        <div className="px-5 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight leading-tight">Bank Withdrawal</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showSuccessAlert ? (
          <div className="p-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div 
              className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              <CheckCircle2 className="w-9 h-9 text-white" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-lg font-black text-slate-900">Withdrawal Submitted!</h4>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto font-medium">
                Withdrawal request of ₹{amount} submitted! Verification & NEFT transfer usually takes 24-48 hours.
              </p>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-slate-200 text-xs font-mono text-slate-600" style={{ backgroundColor: '#FFFFFF' }}>
              Account: <span className="font-bold text-slate-900">••••{(accountNumber || '').slice(-4) || '••••'}</span> • IFSC: <span className="font-bold text-slate-900">{(ifscCode || '').toUpperCase()}</span>
            </div>
            <p className="text-[11px] text-slate-400">Updating wallet balance & returning...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Balance Overview Card */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Available Wallet Balance</span>
                <span className="font-bold text-emerald-600" style={{ color: '#16A34A' }}>₹{walletBalance}</span>
              </div>
              {amount > 0 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-medium">Requested Withdrawal</span>
                  <span className="font-bold text-red-600" style={{ color: '#DC2626' }}>-₹{amount}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-slate-700">
                <span className="font-medium">Net Remaining Balance</span>
                <span className="font-bold text-emerald-600" style={{ color: '#16A34A' }}>₹{remainingBalance}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-slate-600">
                <span className="font-medium">Transaction Limits</span>
                <span 
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-2xs"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  Min ₹100 - Max ₹5000
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Withdrawal Amount */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                Withdrawal Amount (₹)
              </label>
              <div className="flex items-center gap-2">
                {[100, 250, 500, 1000].map((quickAmt) => (
                  <button
                    key={quickAmt}
                    type="button"
                    onClick={() => {
                      soundFx.playClick();
                      setAmount(quickAmt);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      amount === quickAmt
                        ? 'text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    style={
                      amount === quickAmt
                        ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }
                        : undefined
                    }
                  >
                    ₹{quickAmt}
                  </button>
                ))}
              </div>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min={100}
                  max={Math.min(5000, walletBalance)}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-bold outline-none focus:border-indigo-500"
                  placeholder="Enter amount between ₹100 and ₹5000"
                />
              </div>
            </div>

            {/* Account Holder Name */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as per Bank Account"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            {/* Bank Account Number */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Bank Account Number
              </label>
              <input
                type="text"
                required
                maxLength={18}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Enter 9 to 18 digit account number"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-mono outline-none focus:border-indigo-500"
              />
            </div>

            {/* Re-enter Bank Account Number */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Re-enter Bank Account Number
              </label>
              <input
                type="password"
                required
                maxLength={18}
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Re-enter to confirm"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-mono outline-none focus:border-indigo-500"
              />
            </div>

            {/* IFSC Code */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  Bank IFSC Code
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  11 Characters
                </span>
              </div>
              <input
                type="text"
                required
                maxLength={11}
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                placeholder="e.g. HDFC0001234"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-bold tracking-wider outline-none focus:border-indigo-500"
              />
            </div>

            {/* Submit & Cancel Actions */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                id="submit-withdrawal-btn"
                className="w-full py-3 px-6 rounded-xl text-white text-xs font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              >
                <span>Submit Withdrawal Request</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  onClose();
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl shadow-xs hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer text-center"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
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
