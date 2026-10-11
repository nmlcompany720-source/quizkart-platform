import React from 'react';
import { 
  X, 
  Wallet, 
  AlertCircle, 
  ShieldCheck 
} from 'lucide-react';
import { soundFx } from '../utils/audio';

interface WalletEntryConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryFee: number;
  walletBalance: number;
  onConfirmAndJoin: () => void;
  onAddFunds: () => void;
}

export const WalletEntryConfirmModal: React.FC<WalletEntryConfirmModalProps> = ({
  isOpen,
  onClose,
  entryFee,
  walletBalance,
  onConfirmAndJoin,
  onAddFunds
}) => {
  if (!isOpen) return null;

  const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
  const hasSufficientBalance = walletBalance >= entryFee;
  const remainingBalance = Math.max(0, walletBalance - entryFee);

  const handleConfirm = () => {
    soundFx.playClick();
    onConfirmAndJoin();
  };

  const handleAddFunds = () => {
    soundFx.playClick();
    onAddFunds();
  };

  const handleCancel = () => {
    soundFx.playClick();
    onClose();
  };

  return (
    <div 
      id="wallet-confirm-modal-overlay"
      className="min-h-screen bg-slate-900/60 backdrop-blur-sm fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div 
        id="wallet-confirm-modal"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col my-auto transition-all transform animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ background: BRAND_GRADIENT }}
            >
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Confirm Entry
              </h2>
            </div>
          </div>

          <button
            id="wallet-modal-close-btn"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Contest Fee & Balance Summary Card (Crisp White #FFFFFF) */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-600">
                Wallet Balance
              </span>
              <span className={`text-base font-black ${hasSufficientBalance ? 'text-emerald-700' : 'text-rose-600'}`}>
                ₹{walletBalance}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm pt-2.5 border-t border-slate-100">
              <span className="font-semibold text-slate-600">
                Entry Fee
              </span>
              <span className="text-base font-black text-slate-900">
                ₹{entryFee}
              </span>
            </div>

            {hasSufficientBalance && (
              <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-100 text-slate-500">
                <span className="font-medium">Net Balance</span>
                <span className="font-bold text-slate-800">₹{remainingBalance}</span>
              </div>
            )}
          </div>

          {/* Insufficient Balance State Alert (if balance is lower than entry fee) */}
          {!hasSufficientBalance && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-50/90 border border-rose-200">
              <AlertCircle className="w-5 h-5 shrink-0" style={{ color: '#C62828' }} />
              <p className="text-sm font-black tracking-tight" style={{ color: '#C62828' }}>
                Insufficient Wallet Balance
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons: Stacked with Primary on Top, Cancel Below */}
        <div className="px-5 py-4 bg-slate-50/90 border-t border-slate-100 flex flex-col gap-2.5">
          {hasSufficientBalance ? (
            <button
              type="button"
              id="wallet-confirm-btn"
              onClick={handleConfirm}
              className="w-full py-3 px-6 rounded-xl text-white text-sm font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
              style={{ background: BRAND_GRADIENT }}
            >
              <span>Confirm & Join →</span>
            </button>
          ) : (
            <button
              type="button"
              id="wallet-add-funds-btn"
              onClick={handleAddFunds}
              className="w-full py-3 px-6 rounded-xl text-white text-sm font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center"
              style={{ background: BRAND_GRADIENT }}
            >
              <span>Add Funds</span>
            </button>
          )}

          <button
            type="button"
            id="wallet-cancel-btn"
            onClick={handleCancel}
            className="w-full py-2.5 px-5 rounded-xl text-white text-sm font-bold shadow-xs hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer text-center"
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
