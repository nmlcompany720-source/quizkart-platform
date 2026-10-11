import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, AlertCircle, X, Loader2, Key } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [isLoadingUnlock, setIsLoadingUnlock] = useState<boolean>(false);
  const [isLoadingCancel, setIsLoadingCancel] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCancel = () => {
    if (isLoadingCancel || isLoadingUnlock) return;
    setIsLoadingCancel(true);
    soundFx.playClick();
    setTimeout(() => {
      setIsLoadingCancel(false);
      setPasswordInput('');
      setAuthError('');
      onClose();
    }, 1000);
  };

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoadingUnlock || isLoadingCancel) return;
    setIsLoadingUnlock(true);
    soundFx.playClick();

    setTimeout(() => {
      setIsLoadingUnlock(false);
      if (passwordInput.trim() === 'quizkart1') {
        setAuthError('');
        setPasswordInput('');
        soundFx.playSuccess();
        onSuccess();
      } else {
        setAuthError('Invalid Access Key. Access Denied.');
        soundFx.playWrong();
      }
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        id="admin-auth-modal"
        className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          onClick={handleCancel}
          disabled={isLoadingCancel || isLoadingUnlock}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Sleek modern shield logo matching the brand gradient (#5F69EF -> #20A5AC) */}
        <div 
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg mb-6"
          style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
        >
          <ShieldCheck className="w-7 h-7" strokeWidth={2.3} />
        </div>

        {authError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleAuthenticate} className="space-y-4">
          <div className="text-left">
            <div className="relative">
              {/* STRICT FOCUS LOCK: Pure White background (#FFFFFF), border remains strictly unchanged */}
              <input
                id="admin-password-input"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (authError) setAuthError('');
                }}
                placeholder="Enter Password"
                className="w-full px-4 py-3 bg-white rounded-xl text-slate-900 font-mono text-sm pr-11 border border-slate-200 outline-none ring-0 focus:outline-none focus:ring-0 focus:border-slate-200 shadow-none focus:shadow-none"
                style={{
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  boxShadow: 'none',
                  border: '1px solid #E2E8F0'
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            {/* Cancel Button: Close Cross Icon ('✕'), Official Primary Brand Gradient Theme */}
            <button
              type="button"
              id="admin-auth-cancel-btn"
              onClick={handleCancel}
              disabled={isLoadingCancel || isLoadingUnlock}
              title="Cancel / Exit"
              className="flex-1 py-3 text-xs font-bold rounded-xl shadow-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-75 active:scale-95 text-white"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              {isLoadingCancel ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              )}
            </button>
            
            {/* Unlock Panel Button: Key Icon, Official Primary Brand Gradient Theme */}
            <button
              type="submit"
              id="admin-auth-submit-btn"
              disabled={isLoadingCancel || isLoadingUnlock}
              title="Unlock Panel"
              className="flex-1 py-3 text-xs font-bold rounded-xl shadow-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-75 active:scale-95 text-white"
              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
            >
              {isLoadingUnlock ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <Key className="w-5 h-5 text-white" strokeWidth={2.3} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

