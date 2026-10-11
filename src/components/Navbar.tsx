import React, { useState, useRef, useEffect } from 'react';
import { Trophy, HelpCircle, User, ShieldCheck, Zap, Volume2, VolumeX, LogIn, Loader2 } from 'lucide-react';
import { UserProfile, PoolEconomics } from '../types';
import { soundFx } from '../utils/audio';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: any) => void;
  userProfile: UserProfile;
  poolData: PoolEconomics;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onEnterQuiz: () => void;
  isQuizActive: boolean;
  isContestLive?: boolean;
  onShowNotice?: (msg: string) => void;
  onTriggerAdmin: () => void;
  currentUser?: { displayName: string | null; email: string | null; photoURL: string | null } | null;
  onGoogleSignIn?: () => void;
  onLogoutAndOpenStep1?: () => Promise<void> | void;
  onOpenAuthModal?: (step?: 1 | 2 | 3) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  userProfile,
  soundEnabled,
  setSoundEnabled,
  onEnterQuiz,
  isQuizActive,
  isContestLive = false,
  onShowNotice,
  onTriggerAdmin,
  currentUser,
  onGoogleSignIn,
  onLogoutAndOpenStep1,
  onOpenAuthModal
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPressingRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Synchronized lightning click handler: blocks entry & triggers toast if inactive
  const handleLightningClick = () => {
    soundFx.playClick();
    if (!isContestLive) {
      onShowNotice?.("No contest live right now. Stay tuned for the next round!");
      return;
    }
    onEnterQuiz();
  };

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handlePressStart = (clientX?: number, clientY?: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    if (clientX !== undefined && clientY !== undefined) {
      touchStartPosRef.current = { x: clientX, y: clientY };
    }
    isPressingRef.current = true;

    // Start 3000ms continuous long-press timer (3 to 5 seconds threshold)
    longPressTimerRef.current = setTimeout(() => {
      if (isPressingRef.current) {
        isPressingRef.current = false;
        longPressTimerRef.current = null;
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([80, 50, 80]);
          }
        } catch {}
        soundFx.playSuccess();
        onTriggerAdmin();
      }
    }, 3000);
  };

  const handlePressCancel = () => {
    isPressingRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPressingRef.current && e.touches.length > 0) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      // Cancel long press if finger moved more than 10px (e.g., while scrolling)
      if (deltaX > 10 || deltaY > 10) {
        handlePressCancel();
      }
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFx.enabled = next;
    if (next) soundFx.playClick();
  };

  return (
    <>
      {/* Primary Brand Accent Gradient Definition for Vector Icons */}
      <svg className="w-0 h-0 absolute pointer-events-none opacity-0 overflow-hidden" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="brand-accent-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5F69EF" />
            <stop offset="35%" stopColor="#417CF4" />
            <stop offset="65%" stopColor="#3A81F5" />
            <stop offset="100%" stopColor="#20A5AC" />
          </linearGradient>
        </defs>
      </svg>
      <header id="main-header" className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo with Stylized 'Q' Gradient Icon & Clean Bold QuizKart */}
          <div className="flex items-center gap-2.5">
            {/* Dedicated 'Q' Logo with 3-to-5 Second Secure Long-Press Trigger (Strict 1:1 w-10 h-10 rounded-xl) */}
            <div 
              id="brand-logo-q-icon"
              title="QuizKart"
              onMouseDown={(e) => {
                if (e.button === 0) {
                  handlePressStart(e.clientX, e.clientY);
                }
              }}
              onMouseUp={handlePressCancel}
              onMouseLeave={handlePressCancel}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  handlePressStart(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
              onTouchEnd={handlePressCancel}
              onTouchCancel={handlePressCancel}
              onTouchMove={handleTouchMove}
              onContextMenu={(e) => {
                // Prevent browser context menu on long-press
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                // Completely disable direct short click/tap action
                e.preventDefault();
                e.stopPropagation();
              }}
              className="relative flex w-10 h-10 aspect-square shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-md transition-transform duration-200 select-none cursor-pointer active:scale-95"
              style={{ 
                background: 'linear-gradient(135deg, #4878F4 0%, #407EF5 25%, #3B8DDF 50%, #2998C6 75%, #19ABA0 100%)', 
                boxShadow: '0 4px 12px rgba(72, 120, 244, 0.3)',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              <span className="text-xl font-black text-white leading-none select-none tracking-tight pointer-events-none">
                Q
              </span>
            </div>

            {/* QuizKart Brand Text Button (Navigates to Home) */}
            <button
              id="brand-logo-btn"
              onClick={() => {
                if (!isQuizActive) {
                  soundFx.playClick();
                  setCurrentTab('home');
                }
              }}
              className="flex flex-col text-left focus:outline-none rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
            >
              <span 
                className="text-xl font-black tracking-tight select-none font-sans bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                QuizKart
              </span>
            </button>
          </div>

          {/* Desktop Navigation Links (Icon Only, Styled in Brand Accent Gradient) */}
          <nav className="hidden md:flex items-center gap-4">
            {/* Daily Quiz Option (Icon Only) - Centered & Unclipped Question Mark SVG */}
            <button
              id="nav-home-btn"
              title="Daily Quiz"
              aria-label="Daily Quiz"
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('home');
              }}
              disabled={isQuizActive}
              className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer ${
                currentTab === 'home'
                  ? 'bg-slate-100 shadow-2xs'
                  : 'hover:bg-slate-50 opacity-80 hover:opacity-100'
              } ${isQuizActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg 
                viewBox="0 0 24 24" 
                className="w-5 h-5 shrink-0" 
                fill="none" 
                style={{ overflow: 'visible' }}
              >
                <circle cx="12" cy="12" r="9.5" stroke="url(#brand-accent-gradient)" strokeWidth="1.8" />
                <path 
                  d="M9.5 9.2c0-1.6 1.1-2.7 2.5-2.7s2.5 1.1 2.5 2.5c0 1.3-.9 2.1-1.9 2.9-.5.4-.6.9-.6 1.6" 
                  stroke="url(#brand-accent-gradient)" 
                  strokeWidth="1.9" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
                <circle cx="12" cy="16.5" r="1.1" fill="url(#brand-accent-gradient)" />
              </svg>
              {currentTab === 'home' && (
                <span 
                  className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                />
              )}
            </button>

            {/* Pay ₹100 Option (Icon Only) - Synchronized with Contest Card state */}
            <button
              id="nav-quiz-pay-btn"
              title={isContestLive ? "Play ₹100 Quiz" : "No contest live right now. Stay tuned for the next round!"}
              aria-label="Play ₹100 Quiz"
              onClick={handleLightningClick}
              disabled={isQuizActive}
              className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer hover:bg-slate-50 opacity-80 hover:opacity-100 ${
                isQuizActive ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Zap className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)', fill: 'url(#brand-accent-gradient)' }} />
            </button>

            {/* Ranks Option (Icon Only) */}
            <button
              id="nav-leaderboard-btn"
              title="Ranks & Leaderboard"
              aria-label="Ranks & Leaderboard"
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('leaderboard');
              }}
              disabled={isQuizActive}
              className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer ${
                currentTab === 'leaderboard'
                  ? 'bg-slate-100 shadow-2xs'
                  : 'hover:bg-slate-50 opacity-80 hover:opacity-100'
              } ${isQuizActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Trophy className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
              {currentTab === 'leaderboard' && (
                <span 
                  className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                />
              )}
            </button>

            {/* Pool Option (Icon Only) */}
            <button
              id="nav-transparency-btn"
              title="Pool Transparency"
              aria-label="Pool Transparency"
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('transparency');
              }}
              disabled={isQuizActive}
              className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer ${
                currentTab === 'transparency'
                  ? 'bg-slate-100 shadow-2xs'
                  : 'hover:bg-slate-50 opacity-80 hover:opacity-100'
              } ${isQuizActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ShieldCheck className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
              {currentTab === 'transparency' && (
                <span 
                  className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                />
              )}
            </button>

            {/* Wallet / Profile Nav Option (Icon Only) */}
            <button
              id="nav-profile-tab-btn"
              title="Wallet & Profile"
              aria-label="Wallet & Profile"
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('profile');
              }}
              disabled={isQuizActive}
              className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-all relative cursor-pointer ${
                currentTab === 'profile' || currentTab === 'history'
                  ? 'bg-slate-100 shadow-2xs'
                  : 'hover:bg-slate-50 opacity-80 hover:opacity-100'
              } ${isQuizActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <User className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
              {(currentTab === 'profile' || currentTab === 'history') && (
                <span 
                  className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                />
              )}
            </button>
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sound Toggle Button - Colored in Brand Accent Gradient */}
            <button
              id="sound-toggle-btn"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
              title={soundEnabled ? 'Audio Effects ON' : 'Audio Effects Muted'}
              className="p-2 rounded-xl hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" style={{ stroke: 'url(#brand-accent-gradient)' }} />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Wallet Badge Improvement: NO "WALLET" text, ONLY bold "₹550" in Emerald Green, ultra-thin border & rounded-full */}
            <button
              id="nav-profile-btn"
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('profile');
              }}
              disabled={isQuizActive}
              title="Wallet Balance"
              aria-label={`Wallet Balance ₹${userProfile.walletBalance}`}
              className={`flex items-center rounded-full px-3.5 py-1.5 transition-all border border-slate-200 shadow-sm bg-white hover:bg-slate-50 cursor-pointer ${
                currentTab === 'profile'
                  ? 'ring-2 ring-emerald-500/20'
                  : ''
              } ${isQuizActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-bold text-sm tracking-tight" style={{ color: '#10B981' }}>
                ₹{userProfile.walletBalance}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Bar (Icon Only Navigation, Styled in Brand Accent Gradient) */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-200 bg-white px-2 py-2 text-xs">
        {/* Daily Quiz Option (Icon Only) - Centered & Unclipped Question Mark SVG */}
        <button
          id="mobile-tab-home"
          title="Daily Quiz"
          aria-label="Daily Quiz"
          onClick={() => { soundFx.playClick(); setCurrentTab('home'); }}
          disabled={isQuizActive}
          className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${currentTab === 'home' ? 'bg-slate-100' : 'hover:bg-slate-50 opacity-80 hover:opacity-100'}`}
        >
          <svg 
            viewBox="0 0 24 24" 
            className="w-5 h-5 shrink-0" 
            fill="none" 
            style={{ overflow: 'visible' }}
          >
            <circle cx="12" cy="12" r="9.5" stroke="url(#brand-accent-gradient)" strokeWidth="1.8" />
            <path 
              d="M9.5 9.2c0-1.6 1.1-2.7 2.5-2.7s2.5 1.1 2.5 2.5c0 1.3-.9 2.1-1.9 2.9-.5.4-.6.9-.6 1.6" 
              stroke="url(#brand-accent-gradient)" 
              strokeWidth="1.9" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            <circle cx="12" cy="16.5" r="1.1" fill="url(#brand-accent-gradient)" />
          </svg>
        </button>

        {/* Pay ₹100 Option (Icon Only) - Synchronized with Contest Card state */}
        <button
          id="mobile-tab-quiz"
          title={isContestLive ? "Play ₹100 Quiz" : "No contest live right now. Stay tuned for the next round!"}
          aria-label="Play ₹100 Quiz"
          onClick={handleLightningClick}
          disabled={isQuizActive}
          className="w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer hover:bg-slate-50 opacity-80 hover:opacity-100"
        >
          <Zap className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)', fill: 'url(#brand-accent-gradient)' }} />
        </button>

        {/* Ranks Option (Icon Only) */}
        <button
          id="mobile-tab-leaderboard"
          title="Ranks"
          aria-label="Ranks"
          onClick={() => { soundFx.playClick(); setCurrentTab('leaderboard'); }}
          disabled={isQuizActive}
          className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${currentTab === 'leaderboard' ? 'bg-slate-100' : 'hover:bg-slate-50 opacity-80 hover:opacity-100'}`}
        >
          <Trophy className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
        </button>

        {/* Pool Option (Icon Only) */}
        <button
          id="mobile-tab-transparency"
          title="Pool"
          aria-label="Pool"
          onClick={() => { soundFx.playClick(); setCurrentTab('transparency'); }}
          disabled={isQuizActive}
          className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${currentTab === 'transparency' ? 'bg-slate-100' : 'hover:bg-slate-50 opacity-80 hover:opacity-100'}`}
        >
          <ShieldCheck className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
        </button>

        {/* Wallet Option (Icon Only) */}
        <button
          id="mobile-tab-profile"
          title="Wallet"
          aria-label="Wallet"
          onClick={() => { soundFx.playClick(); setCurrentTab('profile'); }}
          disabled={isQuizActive}
          className={`w-10 h-10 flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            currentTab === 'profile' || currentTab === 'history' ? 'bg-slate-100' : 'hover:bg-slate-50 opacity-80 hover:opacity-100'
          }`}
        >
          <User className="w-5 h-5 shrink-0" style={{ stroke: 'url(#brand-accent-gradient)' }} />
        </button>
      </div>
    </header>
    </>
  );
};
