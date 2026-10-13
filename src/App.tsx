import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { WalletEntryConfirmModal } from './components/WalletEntryConfirmModal';
import { QuizArena } from './components/QuizArena';
import { QuizResult } from './components/QuizResult';
import { LiveLeaderboard } from './components/LiveLeaderboard';
import { TransparencySection } from './components/TransparencySection';
import { ProfileWallet } from './components/ProfileWallet';
import { DepositPage } from './components/DepositPage';
import { TransactionHistoryPage } from './components/TransactionHistoryPage';
import { EditProfilePage } from './components/EditProfilePage';
import { WithdrawalPage } from './components/WithdrawalPage';
import { AdminAuthModal } from './components/AdminAuthModal';
import { AdminPage } from './components/AdminPage';
import { AuthModal } from './components/AuthModal';
import { LegalPolicyPage } from './components/LegalPolicyPage';
import { SupportPage } from './components/SupportPage';
import { SupportTicketsPage } from './components/SupportTicketsPage';

import { 
  TODAY_PRIZE, 
  QUIZ_QUESTIONS, 
  INITIAL_LEADERBOARD, 
  DEFAULT_USER_PROFILE, 
  DEFAULT_REGISTERED_USERS,
  isDemoSeedUser,
  INITIAL_POOL_ECONOMICS,
  DEFAULT_BANNER_SLIDES,
  ensureTenSlides,
  DEFAULT_ANNOUNCEMENT_SETTINGS,
  DEFAULT_DEPOSIT_REQUESTS,
  DEFAULT_WITHDRAWAL_REQUESTS
} from './data/quizData';
import { 
  UserProfile, 
  LeaderboardEntry, 
  QuizAttemptResult, 
  PoolEconomics,
  DailyPrizeItem,
  Question,
  ActiveContest,
  BannerSlide,
  AnnouncementSettings,
  DepositRequest,
  WithdrawalRequest
} from './types';
import { AnnouncementBar } from './components/AnnouncementBar';
import { BannerSlider } from './components/BannerSlider';
import { soundFx } from './utils/audio';
import { 
  subscribeToAuth, 
  signInWithGoogle, 
  logOutUser, 
  syncUserProfile, 
  fetchUserProfile, 
  fetchQuestionsFromFirestore, 
  fetchLeaderboardFromFirestore, 
  recordQuizAttemptInFirestore,
  fetchContestsFromFirestore,
  removeContestFromFirestore,
  saveContestToFirestore,
  fetchDepositsFromFirestore,
  saveDepositToFirestore,
  fetchWithdrawalsFromFirestore,
  saveWithdrawalToFirestore,
  fetchDepositQrFromFirestore,
  subscribeToUserQuizAttempts,
  fetchQuizTimerFromFirestore,
  subscribeToQuizTimer,
  saveQuizTimerToFirestore,
  fetchBannerSlidesFromFirestore,
  saveBannerSlidesToFirestore,
  isFirestoreQuotaExceeded,
  isWithinRetentionWindow
} from './firebase';
import { 
  getNextDepositId, 
  getNextWithdrawalId, 
  formatDepositId, 
  formatWithdrawalId, 
  formatDepositTimestamp, 
  getCurrentFormattedTimestamp,
  getDeletedDepositIds,
  getDeletedWithdrawalIds
} from './utils/depositUtils';
import { parseTargetTimestamp, getCountdown } from './utils/timerUtils';
import { calculateDynamicPool } from './utils/poolUtils';
import { sanitizeContestSynchronous } from './utils/imageCompressor';
import { getActiveDepositQr, setActiveDepositQr } from './utils/qrConfig';
import { User } from 'firebase/auth';
import { Bell, Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function App() {
  const checkIsUserAuthenticated = (): boolean => {
    try {
      const isAuthFlag = localStorage.getItem('quizkart_is_authenticated') === 'true';
      const manuallySaved = localStorage.getItem('quizkart_profile_manually_saved') === 'true';
      if (!isAuthFlag && !manuallySaved) return false;
      const raw = localStorage.getItem('quizkart_user_profile');
      if (!raw) return false;
      const parsed: UserProfile = JSON.parse(raw);
      if (!parsed || !parsed.email || !parsed.isRegistered || parsed.isDeleted || isDemoSeedUser(parsed)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const [isUserAuthenticated, setIsUserAuthenticated] = useState<boolean>(() => checkIsUserAuthenticated());

  const [currentTab, setCurrentTab] = useState<'home' | 'quiz_arena' | 'leaderboard' | 'transparency' | 'profile' | 'deposit' | 'history' | 'edit_profile' | 'withdrawal' | 'terms_conditions' | 'privacy_policy' | 'support' | 'support_tickets'>(() => {
    try {
      const saved = localStorage.getItem('quizkart_current_tab');
      if (saved && ['home', 'leaderboard', 'transparency', 'profile', 'deposit', 'history', 'edit_profile', 'withdrawal', 'terms_conditions', 'privacy_policy', 'support', 'support_tickets'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'home';
  });

  const [historyInitialTab, setHistoryInitialTab] = useState<'deposits' | 'withdrawals'>('deposits');

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_current_tab', currentTab);
    } catch {}
  }, [currentTab]);
  const [isWalletConfirmModalOpen, setIsWalletConfirmModalOpen] = useState<boolean>(false);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState<boolean>(false);
  const [isAdminPageActive, setIsAdminPageActive] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => !checkIsUserAuthenticated());
  const [authModalStep, setAuthModalStep] = useState<1 | 2 | 3>(1);
  const [isEmailChangeMode, setIsEmailChangeMode] = useState<boolean>(false);

  // PWA Deferred App Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any)?.standalone === true;
    }
    return false;
  });
  const [isInstallBannerDismissed, setIsInstallBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('quizkart_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  // Capture and defer beforeinstallprompt event, preventing the default browser prompt
  useEffect(() => {
    const checkStandalone = () => {
      if (typeof window !== 'undefined') {
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any)?.standalone === true;
        if (isStandalone) {
          setIsAppInstalled(true);
        }
      }
    };
    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's default prompt banner from showing automatically at inconvenient times
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      setIsInstallBannerDismissed(true);
      try {
        sessionStorage.setItem('quizkart_pwa_banner_dismissed', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Enforce redirect to Registration/Login page for non-logged-in users attempting to access internal app pages
  useEffect(() => {
    if (!isUserAuthenticated && !isAdminPageActive && !isAdminAuthModalOpen && currentTab !== 'terms_conditions' && currentTab !== 'privacy_policy') {
      if (!isAuthModalOpen) {
        setAuthModalStep(1);
        setIsAuthModalOpen(true);
      }
    }
  }, [isUserAuthenticated, isAdminPageActive, isAdminAuthModalOpen, currentTab, isAuthModalOpen]);

  const handleOpenAuthModal = useCallback((step: 1 | 2 | 3 = 1) => {
    setIsEmailChangeMode(false);
    setAuthModalStep(step);
    setIsAuthModalOpen(true);
  }, []);

  const handleLogoutAndOpenStep1 = useCallback(async () => {
    try {
      localStorage.removeItem('quizkart_is_authenticated');
      localStorage.removeItem('quizkart_profile_manually_saved');
      localStorage.setItem('quizkart_current_tab', 'home');
      await logOutUser();
    } catch {}
    setIsUserAuthenticated(false);
    setIsEmailChangeMode(false);
    setCurrentTab('home');
    setAuthModalStep(1);
    setIsAuthModalOpen(true);
  }, []);

  const handleShowNotice = useCallback((msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(null), 4500);
  }, []);

  // Persistent contests collection: reliable storage without hardcoded fake demo contest
  const [contests, setContests] = useState<ActiveContest[]>(() => {
    try {
      let deletedList: string[] = [];
      try {
        deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
      } catch {}
      const saved = localStorage.getItem('quizkart_active_contests');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const list = parsed
            .filter((c: any) => c && c.id && !deletedList.includes(c.id) && c.id !== 'CNT-CASH-LIVE' && c.id !== 'CNT-FALLBACK-PLACEHOLDER' && c.id !== 'CNT-PROD-101' && c.id !== 'CNT-CASH-202')
            .map(sanitizeContestSynchronous);
          if (list.length > 0) return list;
        }
      }
    } catch {}
    return [];
  });

  // Persistent active contest pointer: only real active contests
  const [activeContestId, setActiveContestId] = useState<string | null>(() => {
    try {
      let deletedList: string[] = [];
      try {
        deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
      } catch {}
      const saved = localStorage.getItem('quizkart_active_contest_id');
      if (saved && !deletedList.includes(saved) && saved !== 'CNT-CASH-LIVE' && saved !== 'CNT-FALLBACK-PLACEHOLDER') {
        return saved;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Determine active contest accurately: strictly returns currently active tournament
  const activeContest: ActiveContest | null = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}
    const activeContests = contests.filter(c => c && c.id && !deletedList.includes(c.id) && c.status === 'active');
    if (activeContestId && !deletedList.includes(activeContestId)) {
      const matched = activeContests.find(c => c.id === activeContestId);
      if (matched) return matched;
    }
    return activeContests[0] || null;
  }, [contests, activeContestId]);

  // Immediate permanent deletion handler to synchronize front-end and storage
  const handleDeleteContest = useCallback((contestId: string) => {
    try {
      const deletedList: string[] = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
      if (!deletedList.includes(contestId)) {
        deletedList.push(contestId);
        localStorage.setItem('quizkart_deleted_contests', JSON.stringify(deletedList));
      }
    } catch {}

    removeContestFromFirestore(contestId).catch(err => console.warn('Firestore remove error:', err));

    setContests(prev => {
      const filtered = prev.filter(c => c && c.id !== contestId);
      let nextActiveId: string | null = null;
      let updatedList = filtered;

      // If active contest was deleted, automatically transition next queued upcoming contest into LIVE NOW
      if (activeContestId === contestId || !filtered.some(c => c.status === 'active')) {
        const queuedUpcoming = filtered
          .filter(c => c.status === 'scheduled')
          .sort((a, b) => parseTargetTimestamp(a.scheduledTime) - parseTargetTimestamp(b.scheduledTime));
        const nextToPromote = queuedUpcoming[0] || null;

        if (nextToPromote) {
          nextActiveId = nextToPromote.id;
          updatedList = filtered.map(c => {
            if (c.id === nextToPromote.id) {
              return { ...c, status: 'active' as const, activatedAt: new Date().toISOString() };
            }
            return c;
          });
          if (!isFirestoreQuotaExceeded()) {
            saveContestToFirestore({ ...nextToPromote, status: 'active' }).catch(() => {});
          }
        }
      }

      try {
        localStorage.setItem('quizkart_active_contests', JSON.stringify(updatedList));
        if (nextActiveId) {
          localStorage.setItem('quizkart_active_contest_id', nextActiveId);
          localStorage.setItem('quizkart_current_active_contest', JSON.stringify(updatedList.find(c => c.id === nextActiveId)));
        } else if (activeContestId === contestId) {
          localStorage.removeItem('quizkart_current_active_contest');
          localStorage.setItem('quizkart_active_contest_id', '');
        }
      } catch {}

      if (nextActiveId) {
        setActiveContestId(nextActiveId);
      } else if (activeContestId === contestId) {
        setActiveContestId(null);
      }

      return updatedList;
    });
  }, [activeContestId]);

  // Track strictly real-time participant active joins for Admin visibility
  const [realActiveParticipants, setRealActiveParticipants] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('quizkart_real_active_participants');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch {}
    return 0; // Genuine user entries only
  });

  const setActiveContest = (contest: ActiveContest | null) => {
    if (contest) {
      const nowIso = new Date().toISOString();
      try {
        localStorage.setItem(`quizkart_contest_activated_${contest.id}`, String(Date.now()));
      } catch {}
      setActiveContestId(contest.id);
      try {
        localStorage.setItem('quizkart_active_contest_id', contest.id);
      } catch {}
      setContests(prev => {
        const updated = prev.map(c => {
          if (c.id === contest.id) {
            return { ...c, status: 'active' as const, activatedAt: c.activatedAt || nowIso };
          }
          if (c.status === 'active') {
            return { ...c, status: 'completed' as const };
          }
          return c;
        }).map(sanitizeContestSynchronous);
        try {
          localStorage.setItem('quizkart_active_contests', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    } else {
      setActiveContestId(null);
      try {
        localStorage.removeItem('quizkart_active_contest_id');
      } catch {}
    }
  };

  // Sync contests to localStorage safely
  useEffect(() => {
    try {
      const safe = contests.map(sanitizeContestSynchronous);
      localStorage.setItem('quizkart_active_contests', JSON.stringify(safe));
    } catch {}
  }, [contests]);

  // Load contests from Firestore on mount & merge
  useEffect(() => {
    async function loadContestsFromCloud() {
      try {
        const cloudContests = await fetchContestsFromFirestore();
        if (cloudContests && cloudContests.length > 0) {
          let deletedList: string[] = [];
          try {
            deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
          } catch {}
          const validCloud = cloudContests
            .filter((c: any) => c && c.id && !deletedList.includes(c.id) && c.id !== 'CNT-PROD-101' && c.id !== 'CNT-CASH-202');
          if (validCloud.length > 0) {
            setContests(prev => {
              const prevMap = new Map<string, ActiveContest>();
              prev.forEach(p => prevMap.set(p.id, p));

              const map = new Map<string, ActiveContest>();
              validCloud.forEach(c => {
                const localExisting = prevMap.get(c.id);
                // Preserve local uploaded image/GIF if local copy has custom image
                const preservedCashImage = localExisting?.cashConfig?.cashImageUrl?.startsWith('data:image/')
                  ? localExisting.cashConfig.cashImageUrl
                  : c.cashConfig?.cashImageUrl;
                const preservedProdImage = localExisting?.productConfig?.productImageUrl?.startsWith('data:image/')
                  ? localExisting.productConfig.productImageUrl
                  : c.productConfig?.productImageUrl;

                const mergedContest: ActiveContest = {
                  ...c,
                  cashConfig: c.cashConfig ? { ...c.cashConfig, cashImageUrl: preservedCashImage } : c.cashConfig,
                  productConfig: c.productConfig ? { ...c.productConfig, productImageUrl: preservedProdImage } : c.productConfig,
                };
                map.set(c.id, mergedContest);
              });

              prev.forEach(c => {
                if (!map.has(c.id) && !deletedList.includes(c.id)) map.set(c.id, c);
              });
              const merged = Array.from(map.values());
              try {
                localStorage.setItem('quizkart_active_contests', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Firestore contests load error:', err);
      }
    }

    loadContestsFromCloud();
  }, []);

  // Timed transition handler: automatically transition contest to LIVE when start timer triggers
  const handleContestStarted = useCallback((contestId: string) => {
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(`quizkart_contest_activated_${contestId}`, String(Date.now()));
    } catch {}

    setContests(prev => {
      const target = prev.find(c => c.id === contestId);
      if (!target || target.status === 'active') return prev;

      const updated = prev.map(c => {
        if (c.id === contestId) {
          return { ...c, status: 'active' as const, activatedAt: nowIso };
        }
        if (c.status === 'active') {
          return { ...c, status: 'completed' as const };
        }
        return c;
      });

      setActiveContestId(contestId);
      try {
        localStorage.setItem('quizkart_active_contest_id', contestId);
        localStorage.setItem('quizkart_active_contests', JSON.stringify(updated));
      } catch {}

      // Automatically update state in Admin Panel database (Firestore) if quota allows
      if (!isFirestoreQuotaExceeded()) {
        const liveContest = updated.find(c => c.id === contestId);
        if (liveContest) {
          saveContestToFirestore(liveContest).catch(() => {});
        }
      }

      return updated;
    });
  }, []);

  // Front-End Website & Contest Sync & Auto-Rotation Logic:
  // When an active tournament ends (00:00:00), immediately auto-promote next queued upcoming contest into LIVE NOW
  const handleContestExpired = useCallback((expiredContestId: string) => {
    setContests(prev => {
      const contestToExpire = prev.find(c => c.id === expiredContestId);
      if (!contestToExpire || contestToExpire.status === 'completed') {
        return prev;
      }

      const updated = prev.map(c => {
        if (c.id === expiredContestId) {
          return { ...c, status: 'completed' as const };
        }
        return c;
      });

      // Find the next queued upcoming tournament sorted by scheduled time
      const queuedUpcoming = updated
        .filter(c => c.id !== expiredContestId && c.status === 'scheduled')
        .sort((a, b) => parseTargetTimestamp(a.scheduledTime) - parseTargetTimestamp(b.scheduledTime));

      const nextToPromote = queuedUpcoming[0] || null;

      if (nextToPromote) {
        const withPromoted = updated.map(c => {
          if (c.id === nextToPromote.id) {
            return { ...c, status: 'active' as const, activatedAt: new Date().toISOString() };
          }
          if (c.status === 'active' && c.id !== nextToPromote.id) {
            return { ...c, status: 'completed' as const };
          }
          return c;
        });

        setTimeout(() => {
          setActiveContestId(nextToPromote.id);
          try {
            localStorage.setItem('quizkart_active_contest_id', nextToPromote.id);
            localStorage.setItem('quizkart_active_contests', JSON.stringify(withPromoted));
            localStorage.setItem('quizkart_current_active_contest', JSON.stringify(nextToPromote));
          } catch {}

          // Automatically sync updated statuses to Firestore if quota allows
          if (!isFirestoreQuotaExceeded()) {
            saveContestToFirestore(nextToPromote).catch(() => {});
          }
        }, 0);

        return withPromoted;
      } else {
        setTimeout(() => {
          setActiveContestId(null);
          try {
            localStorage.setItem('quizkart_active_contest_id', '');
            localStorage.setItem('quizkart_active_contests', JSON.stringify(updated));
            localStorage.removeItem('quizkart_current_active_contest');
          } catch {}
        }, 0);

        return updated;
      }
    });
  }, []);

  // Real-Time Interval checking for scheduled starts and automatic rotation on expiration
  useEffect(() => {
    const syncContests = () => {
      const now = Date.now();
      setContests(prev => {
        // 1. Check if an active contest's endTime has expired (00:00:00 reached)
        const currentActive = prev.find(c => c.status === 'active');
        if (currentActive && currentActive.endTime) {
          const endMs = parseTargetTimestamp(currentActive.endTime);
          if (endMs > 0 && now >= endMs) {
            setTimeout(() => {
              handleContestExpired(currentActive.id);
            }, 0);
            return prev;
          }
        }

        // 2. Strict Single-Live Rule: If NO contest is currently active, promote next queued upcoming contest if ready
        if (!currentActive) {
          const queuedUpcoming = prev
            .filter(c => c.status === 'scheduled')
            .sort((a, b) => parseTargetTimestamp(a.scheduledTime) - parseTargetTimestamp(b.scheduledTime));

          const readyContest = queuedUpcoming.find(c => {
            const startMs = parseTargetTimestamp(c.scheduledTime);
            return startMs > 0 && now >= startMs;
          });

          if (readyContest) {
            const finalized = prev.map(c => {
              if (c.id === readyContest.id) {
                return { ...c, status: 'active' as const, activatedAt: new Date().toISOString() };
              }
              if (c.status === 'active') {
                return { ...c, status: 'completed' as const };
              }
              return c;
            });
            setActiveContestId(readyContest.id);
            try {
              localStorage.setItem('quizkart_active_contest_id', readyContest.id);
              localStorage.setItem('quizkart_active_contests', JSON.stringify(finalized));
              localStorage.setItem('quizkart_current_active_contest', JSON.stringify(readyContest));
            } catch {}

            if (!isFirestoreQuotaExceeded()) {
              saveContestToFirestore(readyContest).catch(() => {});
            }

            return finalized;
          }
        }

        return prev;
      });
    };

    const interval = setInterval(syncContests, 1000);
    return () => clearInterval(interval);
  }, [handleContestExpired]);

  // When activeContest changes, sync todayPrize and poolData in real-time
  useEffect(() => {
    if (!activeContest) return;

    if (activeContest.type === 'product' && activeContest.productConfig) {
      setTodayPrize(prev => {
        if (prev.id === activeContest.id && prev.retailValue === activeContest.productConfig?.retailValue) {
          return prev;
        }
        return {
          id: activeContest.id,
          title: activeContest.title,
          badge: activeContest.badge || 'RANK #1',
          brand: activeContest.title,
          mrp: activeContest.productConfig.marketValue,
          retailValue: activeContest.productConfig.retailValue,
          category: 'Product Tournament',
          imageUrl: activeContest.productConfig.productImageUrl,
          deliveryPartner: activeContest.productConfig.deliveryPartner,
          estimatedDeliveryDays: activeContest.productConfig.estimatedDeliveryDays,
          features: [
            '100% Skill-based Speed Quiz',
            'Rank 1 wins product with free door delivery',
            'Real-time live leaderboard rank tracking',
            'Assured dispatch via Amazon/Meesho'
          ]
        };
      });
      setPoolData(prev => {
        if (
          prev.entryFee === activeContest.entryFee &&
          prev.productPrizeValue === activeContest.productConfig?.retailValue &&
          prev.targetParticipants === (activeContest.maxParticipants || prev.targetParticipants)
        ) {
          return prev;
        }
        return {
          ...prev,
          entryFee: activeContest.entryFee,
          productPrizeValue: activeContest.productConfig!.retailValue,
          targetParticipants: activeContest.maxParticipants || prev.targetParticipants
        };
      });
    } else if (activeContest.type === 'cash' && activeContest.cashConfig) {
      setTodayPrize(prev => {
        if (prev.id === activeContest.id && prev.retailValue === activeContest.cashConfig?.prizePool) {
          return prev;
        }
        return {
          id: activeContest.id,
          title: activeContest.title,
          badge: activeContest.badge || 'INSTANT UPI',
          brand: activeContest.title,
          mrp: activeContest.cashConfig.prizePool,
          retailValue: activeContest.cashConfig.prizePool,
          category: 'Cash Tournament',
          imageUrl: activeContest.cashConfig.cashImageUrl || 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80',
          deliveryPartner: 'Instant UPI Payout',
          estimatedDeliveryDays: 'Instant',
          features: [
            activeContest.cashConfig.winnerShareSummary || 'Instant UPI Payout to Top Rankers',
            'Speed and accuracy determine ranking',
            'Transparent automated platform settlement'
          ]
        };
      });
      setPoolData(prev => {
        if (
          prev.entryFee === activeContest.entryFee &&
          prev.totalPoolAmount === activeContest.cashConfig?.prizePool &&
          prev.targetParticipants === (activeContest.maxParticipants || prev.targetParticipants)
        ) {
          return prev;
        }
        return {
          ...prev,
          entryFee: activeContest.entryFee,
          totalPoolAmount: activeContest.cashConfig!.prizePool,
          targetParticipants: activeContest.maxParticipants || prev.targetParticipants
        };
      });
    }
  }, [activeContest]);

  // Top Moving Ticker Announcement State
  const [announcement, setAnnouncement] = useState<AnnouncementSettings>(() => {
    try {
      const saved = localStorage.getItem('quizkart_announcement_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.text || parsed.text.includes('MEGA CASH JACKPOT')) {
          return DEFAULT_ANNOUNCEMENT_SETTINGS;
        }
        return parsed;
      }
      return DEFAULT_ANNOUNCEMENT_SETTINGS;
    } catch {
      return DEFAULT_ANNOUNCEMENT_SETTINGS;
    }
  });

  // Front-Page Carousel Banners State (10 Slots)
  const [bannerSlides, setBannerSlides] = useState<BannerSlide[]>(() => {
    try {
      const saved = localStorage.getItem('quizkart_banner_slides');
      return ensureTenSlides(saved ? JSON.parse(saved) : DEFAULT_BANNER_SLIDES);
    } catch {
      return ensureTenSlides(DEFAULT_BANNER_SLIDES);
    }
  });

  const handleUpdateAnnouncement = (settings: AnnouncementSettings) => {
    setAnnouncement(settings);
    try {
      localStorage.setItem('quizkart_announcement_settings', JSON.stringify(settings));
    } catch {}
  };

  const handleUpdateBannerSlides = (slides: BannerSlide[]) => {
    const validated = ensureTenSlides(slides);
    setBannerSlides(validated);
    try {
      localStorage.setItem('quizkart_banner_slides', JSON.stringify(validated));
    } catch {}
    saveBannerSlidesToFirestore(validated).catch(() => {});
  };

  // Load Banner Slides from Firestore on mount & merge
  useEffect(() => {
    async function loadCloudBanners() {
      try {
        const cloudBanners = await fetchBannerSlidesFromFirestore();
        if (cloudBanners && cloudBanners.length > 0) {
          setBannerSlides(prev => {
            const validated = ensureTenSlides(cloudBanners);
            const merged = validated.map((b, idx) => {
              const local = prev[idx];
              const img = local?.imageUrl && local.imageUrl.startsWith('data:image/') ? local.imageUrl : b.imageUrl;
              return { ...b, imageUrl: img };
            });
            try {
              localStorage.setItem('quizkart_banner_slides', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      } catch (err) {
        console.warn('Firestore load banners notice:', err);
      }
    }
    loadCloudBanners();
  }, []);

  // Front-Page Carousel Banners Visibility Toggle (Admin Controlled)
  const [bannerSliderEnabled, setBannerSliderEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('quizkart_banner_slider_enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const handleUpdateBannerSliderEnabled = (enabled: boolean) => {
    setBannerSliderEnabled(enabled);
    try {
      localStorage.setItem('quizkart_banner_slider_enabled', JSON.stringify(enabled));
    } catch {}
  };

  // Local storage synced states for dynamically configurable Quiz Data & Today's Prize
  const [todayPrize, setTodayPrize] = useState<DailyPrizeItem>(() => {
    try {
      const saved = localStorage.getItem('quizkart_today_prize');
      return saved ? JSON.parse(saved) : TODAY_PRIZE;
    } catch {
      return TODAY_PRIZE;
    }
  });

  // Real-time ticking clock for dynamic contest state & hero slider synchronization
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Dynamic check: true if an active or scheduled tournament exists with time remaining
  const hasRealActiveOrUpcomingContest = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}

    // 1. Check activeContest pointer
    if (
      activeContest &&
      activeContest.id &&
      !deletedList.includes(activeContest.id) &&
      activeContest.status !== 'completed'
    ) {
      const timeStr = activeContest.status === 'scheduled'
        ? (activeContest.scheduledTime || todayPrize.scheduledTime)
        : (activeContest.endTime || activeContest.scheduledTime || todayPrize.scheduledTime);
      const target = parseTargetTimestamp(timeStr);
      const cd = getCountdown(target, nowMs);
      if (!cd.isFinished) {
        return true;
      }
    }

    // 2. Check contests list
    const valid = (contests || []).some(c => {
      if (!c || !c.id || deletedList.includes(c.id) || c.status === 'completed') {
        return false;
      }
      const timeStr = c.status === 'scheduled' ? c.scheduledTime : (c.endTime || c.scheduledTime);
      const target = parseTargetTimestamp(timeStr);
      return getCountdown(target, nowMs).totalSecondsRemaining > 0;
    });

    return valid;
  }, [activeContest, contests, nowMs, todayPrize.scheduledTime]);

  // Track live state reported from HeroSection (guarantees 100% synchronicity with 'Join Now' vs 'Coming Soon' state)
  const [heroReportedLive, setHeroReportedLive] = useState<boolean | null>(null);

  // Compute contest status: checks whether the current contest is in 'STARTS IN' (upcoming) or 'ENDS IN' (live) state
  const currentPrimaryContest = useMemo(() => {
    let deletedList: string[] = [];
    try {
      deletedList = JSON.parse(localStorage.getItem('quizkart_deleted_contests') || '[]');
    } catch {}

    const isRealActive = (c?: ActiveContest | null) => {
      if (!c || !c.id) return false;
      if (deletedList.includes(c.id)) return false;
      if (c.id === 'CNT-CASH-LIVE' || c.id === 'CNT-FALLBACK-PLACEHOLDER' || c.id === 'CNT-PROD-101' || c.id === 'CNT-CASH-202') return false;
      if (c.status !== 'active' && c.status !== 'full') return false;
      const timeStr = c.endTime || c.scheduledTime;
      if (timeStr) {
        const target = parseTargetTimestamp(timeStr);
        if (target > 0 && nowMs >= target) return false;
      }
      return true;
    };

    if (isRealActive(activeContest)) return activeContest;
    const valid = (contests || []).find(isRealActive);
    if (valid) return valid;

    const isRealUpcoming = (c?: ActiveContest | null) => {
      if (!c || !c.id) return false;
      if (deletedList.includes(c.id)) return false;
      if (c.id === 'CNT-CASH-LIVE' || c.id === 'CNT-FALLBACK-PLACEHOLDER' || c.id === 'CNT-PROD-101' || c.id === 'CNT-CASH-202') return false;
      if (c.status === 'scheduled') return true;
      if (c.scheduledTime) {
        const target = parseTargetTimestamp(c.scheduledTime);
        if (target > 0 && target > nowMs) return true;
      }
      return false;
    };

    if (isRealUpcoming(activeContest)) return activeContest;
    const upcoming = (contests || []).find(isRealUpcoming);
    return upcoming || null;
  }, [activeContest, contests, nowMs]);

  // Check whether the tournament is currently in the pre-contest / 'STARTS IN' state
  const isCurrentContestUpcoming = useMemo(() => {
    if (!currentPrimaryContest) return true;
    if (currentPrimaryContest.status === 'scheduled') {
      const target = parseTargetTimestamp(currentPrimaryContest.scheduledTime);
      if (target > 0) return nowMs < target;
      return true;
    }
    if (currentPrimaryContest.scheduledTime) {
      const target = parseTargetTimestamp(currentPrimaryContest.scheduledTime);
      if (target > 0 && nowMs < target) return true;
    }
    return false;
  }, [currentPrimaryContest, nowMs]);

  // Check if a contest is actively LIVE ('Join Now' state):
  // True ONLY when an active contest exists, the start countdown has finished, and it is NOT upcoming or expired!
  const isContestLive = useMemo(() => {
    if (heroReportedLive !== null) {
      return heroReportedLive;
    }
    if (!currentPrimaryContest) return false;
    if (isCurrentContestUpcoming) return false;
    if (currentPrimaryContest.status === 'completed') return false;
    if (currentPrimaryContest.endTime) {
      const endTarget = parseTargetTimestamp(currentPrimaryContest.endTime);
      if (endTarget > 0 && nowMs >= endTarget) return false;
    }
    return true;
  }, [heroReportedLive, currentPrimaryContest, isCurrentContestUpcoming, nowMs]);

  // Dynamic Hero Slider Synchronization:
  // - WHEN AN ACTIVE / UPCOMING CONTEST EXISTS: Automatically HIDE the top Hero Banner Slider.
  // - WHEN CONTEST ENDS OR NO ACTIVE/UPCOMING CONTEST EXISTS: Immediately SHOW the Hero Banner Slider.
  const showHeroSlider = !hasRealActiveOrUpcomingContest;

  // Sleek User-Friendly Notification Toast State
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  const showTunedToast = useCallback((customMsg?: string) => {
    soundFx.playClick();
    const msg = customMsg || "No contest live right now. Stay tuned for the next round!";
    setGlobalNotice(msg);
  }, []);

  useEffect(() => {
    if (!globalNotice) return;
    const timer = setTimeout(() => {
      setGlobalNotice(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [globalNotice]);

  // PWA Install Handlers
  const handleInstallApp = async () => {
    soundFx.playClick();
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsAppInstalled(true);
        }
        setDeferredPrompt(null);
        setIsInstallBannerDismissed(true);
        try {
          sessionStorage.setItem('quizkart_pwa_banner_dismissed', 'true');
        } catch {}
      } catch (err) {
        console.warn('Install prompt error:', err);
        setIsInstallBannerDismissed(true);
      }
    } else {
      // Guide user if running in browser or iOS Safari
      showTunedToast('To install QuizKart on your home screen, tap your browser menu (or Safari Share) and choose "Add to Home Screen".');
      setIsInstallBannerDismissed(true);
      try {
        sessionStorage.setItem('quizkart_pwa_banner_dismissed', 'true');
      } catch {}
    }
  };

  const handleDismissInstallBanner = () => {
    soundFx.playClick();
    setIsInstallBannerDismissed(true);
    try {
      sessionStorage.setItem('quizkart_pwa_banner_dismissed', 'true');
    } catch {}
  };

  const [globalQuizTimer, setGlobalQuizTimer] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('quizkart_global_quiz_timer');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return 600; // 600 seconds (10 minutes) locked master default
  });

  const [quizQuestions, setQuizQuestions] = useState<Question[]>(() => {
    try {
      const saved = localStorage.getItem('quizkart_questions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((q): q is Question => Boolean(q && q.id != null));
          if (valid.length > 0) return valid;
        }
      }
      return QUIZ_QUESTIONS;
    } catch {
      return QUIZ_QUESTIONS;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('quizkart_user_profile');
      return saved ? JSON.parse(saved) : DEFAULT_USER_PROFILE;
    } catch {
      return DEFAULT_USER_PROFILE;
    }
  });

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    try {
      const saved = localStorage.getItem('quizkart_leaderboard');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((e): e is LeaderboardEntry => Boolean(e && e.id != null));
          if (valid.length > 0) return valid;
        }
      }
      return INITIAL_LEADERBOARD;
    } catch {
      return INITIAL_LEADERBOARD;
    }
  });

  const [poolData, setPoolData] = useState<PoolEconomics>(() => {
    try {
      const saved = localStorage.getItem('quizkart_pool');
      return saved ? JSON.parse(saved) : INITIAL_POOL_ECONOMICS;
    } catch {
      return INITIAL_POOL_ECONOMICS;
    }
  });

  const [deposits, setDeposits] = useState<DepositRequest[]>(() => {
    try {
      const deletedDeposits = getDeletedDepositIds();
      const saved = localStorage.getItem('quizkart_admin_deposits');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((d: DepositRequest) => d && d.id && !deletedDeposits.includes(d.id) && !deletedDeposits.includes(formatDepositId(d.id)))
            .map((d: DepositRequest, idx: number) => ({
              ...d,
              id: formatDepositId(d.id, idx + 1),
              timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date)
            }));
        }
      }
      return DEFAULT_DEPOSIT_REQUESTS
        .filter((d) => d && d.id && !deletedDeposits.includes(d.id) && !deletedDeposits.includes(formatDepositId(d.id)))
        .map((d, idx) => ({
          ...d,
          id: formatDepositId(d.id, idx + 1)
        }));
    } catch {
      return DEFAULT_DEPOSIT_REQUESTS;
    }
  });

  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>(() => {
    const isBuggedSeedWth = (w: WithdrawalRequest) =>
      Boolean(
        w &&
        (w.id === 'QK-WTH-1001' || formatWithdrawalId(w.id) === 'QK-WTH-1001') &&
        Number(w.amount) === 250 &&
        (String(w.timestamp || '').includes('2026-09-20') || String(w.date || '').includes('2026-09-20'))
      );
    try {
      const deletedWithdrawals = getDeletedWithdrawalIds();
      const saved = localStorage.getItem('quizkart_admin_withdrawals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((w: WithdrawalRequest) => w && w.id && !isBuggedSeedWth(w) && !deletedWithdrawals.includes(w.id) && !deletedWithdrawals.includes(formatWithdrawalId(w.id)))
            .map((w: WithdrawalRequest, idx: number) => ({
              ...w,
              id: formatWithdrawalId(w.id, idx + 1),
              timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
            }));
        }
      }
      return DEFAULT_WITHDRAWAL_REQUESTS
        .filter((w) => w && w.id && !isBuggedSeedWth(w) && !deletedWithdrawals.includes(w.id) && !deletedWithdrawals.includes(formatWithdrawalId(w.id)))
        .map((w, idx) => ({
          ...w,
          id: formatWithdrawalId(w.id, idx + 1)
        }));
    } catch {
      return DEFAULT_WITHDRAWAL_REQUESTS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_admin_deposits', JSON.stringify(deposits));
    } catch {}
  }, [deposits]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_admin_withdrawals', JSON.stringify(withdrawals));
    } catch {}
  }, [withdrawals]);

  // Synchronize deposits & withdrawals across tabs and view changes immediately
  useEffect(() => {
    const handleSync = () => {
      try {
        const deletedWithdrawals = getDeletedWithdrawalIds();
        const savedW = localStorage.getItem('quizkart_admin_withdrawals');
        if (savedW) {
          const parsed = JSON.parse(savedW);
          if (Array.isArray(parsed)) {
            setWithdrawals(
              parsed.filter((w: WithdrawalRequest) => w && w.id && !deletedWithdrawals.includes(w.id) && !deletedWithdrawals.includes(formatWithdrawalId(w.id)))
            );
          }
        }
      } catch {}

      try {
        const deletedDeposits = getDeletedDepositIds();
        const savedD = localStorage.getItem('quizkart_admin_deposits');
        if (savedD) {
          const parsed = JSON.parse(savedD);
          if (Array.isArray(parsed)) {
            setDeposits(
              parsed.filter((d: DepositRequest) => d && d.id && !deletedDeposits.includes(d.id) && !deletedDeposits.includes(formatDepositId(d.id)))
            );
          }
        }
      } catch {}
    };

    const handleBlockSync = () => {
      try {
        const savedProf = localStorage.getItem('quizkart_user_profile');
        if (savedProf) {
          const parsed = JSON.parse(savedProf);
          if (parsed && typeof parsed.isBlocked === 'boolean') {
            setUserProfile((prev) => ({
              ...prev,
              isBlocked: parsed.isBlocked,
              blockReason: parsed.blockReason || ''
            }));
          }
        }
      } catch {}
    };

    window.addEventListener('quizkart_withdrawal_status_changed', handleSync);
    window.addEventListener('quizkart_deposit_status_changed', handleSync);
    window.addEventListener('quizkart_user_block_changed', handleBlockSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('quizkart_withdrawal_status_changed', handleSync);
      window.removeEventListener('quizkart_deposit_status_changed', handleSync);
      window.removeEventListener('quizkart_user_block_changed', handleBlockSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Sanitize permanent user transaction history so only records with an explicit email are retained (never match or seed by phone/name)
  useEffect(() => {
    try {
      const savedPermW = localStorage.getItem('quizkart_user_withdrawals_permanent');
      if (savedPermW) {
        const parsedW = JSON.parse(savedPermW);
        if (Array.isArray(parsedW)) {
          const emailBoundW = parsedW.filter((w: any) => w && Boolean((w.userEmail || w.email || '').trim()));
          localStorage.setItem('quizkart_user_withdrawals_permanent', JSON.stringify(emailBoundW));
        }
      }
      const savedPermD = localStorage.getItem('quizkart_user_deposits_permanent');
      if (savedPermD) {
        const parsedD = JSON.parse(savedPermD);
        if (Array.isArray(parsedD)) {
          const emailBoundD = parsedD.filter((d: any) => d && Boolean((d.userEmail || d.email || '').trim()));
          localStorage.setItem('quizkart_user_deposits_permanent', JSON.stringify(emailBoundD));
        }
      }
    } catch {}
  }, [userProfile.email]);

  const handleAddDeposit = useCallback((newDeposit: Partial<DepositRequest> & { amount: number }) => {
    setDeposits((prev) => {
      const resolvedEmail = (newDeposit.userEmail || newDeposit.email || userProfile.email || '').trim();
      const fullDeposit: DepositRequest = {
        ...newDeposit,
        id: newDeposit.id ? formatDepositId(newDeposit.id) : getNextDepositId(prev),
        userName: newDeposit.userName || userProfile.name,
        userEmail: resolvedEmail,
        email: resolvedEmail,
        phone: newDeposit.phone || userProfile.mobile,
        upiId: newDeposit.upiId || userProfile.upiId || 'Contestant UPI',
        amount: newDeposit.amount,
        utrNumber: newDeposit.utrNumber || '',
        screenshotUrl: newDeposit.screenshotUrl,
        app: (newDeposit.app as any) || 'PhonePe',
        timestamp: formatDepositTimestamp(newDeposit.timestamp, newDeposit.createdAt, newDeposit.date),
        date: newDeposit.date || new Date().toISOString().split('T')[0],
        createdAt: newDeposit.createdAt || new Date().toISOString(),
        status: newDeposit.status || 'pending'
      };

      // Ensure persistence in permanent user log (zero-deletion policy)
      try {
        const savedPerm = localStorage.getItem('quizkart_user_deposits_permanent');
        const list = savedPerm ? JSON.parse(savedPerm) : [];
        if (Array.isArray(list)) {
          const filtered = list.filter((item: any) => item && item.id !== fullDeposit.id);
          localStorage.setItem('quizkart_user_deposits_permanent', JSON.stringify([fullDeposit, ...filtered]));
        }
      } catch {}

      saveDepositToFirestore(fullDeposit).catch(err => console.warn('Firestore deposit sync notice:', err));
      return [fullDeposit, ...prev];
    });
  }, [userProfile]);

  const handleAddWithdrawal = useCallback((newWithdrawal: Partial<WithdrawalRequest> & { amount: number }) => {
    setWithdrawals((prev) => {
      const resolvedEmail = (newWithdrawal.userEmail || newWithdrawal.email || userProfile.email || '').trim();
      const fullWithdrawal: WithdrawalRequest = {
        ...newWithdrawal,
        id: newWithdrawal.id ? formatWithdrawalId(newWithdrawal.id) : getNextWithdrawalId(prev),
        userName: newWithdrawal.userName || userProfile.name,
        userEmail: resolvedEmail,
        email: resolvedEmail,
        phone: newWithdrawal.phone || userProfile.mobile,
        accountHolderName: newWithdrawal.accountHolderName || userProfile.name,
        accountNumber: newWithdrawal.accountNumber || '',
        confirmAccountNumber: newWithdrawal.confirmAccountNumber || newWithdrawal.accountNumber || '',
        ifscCode: newWithdrawal.ifscCode || '',
        amount: newWithdrawal.amount,
        timestamp: newWithdrawal.timestamp || getCurrentFormattedTimestamp(),
        date: newWithdrawal.date || new Date().toISOString().split('T')[0],
        createdAt: newWithdrawal.createdAt || new Date().toISOString(),
        status: newWithdrawal.status || 'pending'
      };

      // Ensure persistence in permanent user log (zero-deletion policy)
      try {
        const savedPerm = localStorage.getItem('quizkart_user_withdrawals_permanent');
        const list = savedPerm ? JSON.parse(savedPerm) : [];
        if (Array.isArray(list)) {
          const filtered = list.filter((item: any) => item && item.id !== fullWithdrawal.id);
          localStorage.setItem('quizkart_user_withdrawals_permanent', JSON.stringify([fullWithdrawal, ...filtered]));
        }
      } catch {}

      saveWithdrawalToFirestore(fullWithdrawal).catch(err => console.warn('Firestore withdrawal sync notice:', err));
      return [fullWithdrawal, ...prev];
    });
  }, [userProfile]);

  // Dynamic Active Deposit QR state synced with Firestore & LocalStorage
  const [activeDepositQr, setActiveDepositQrState] = useState<string>(() => {
    return getActiveDepositQr();
  });

  useEffect(() => {
    fetchDepositQrFromFirestore().then((remoteQr) => {
      if (remoteQr && remoteQr.trim().length > 0) {
        setActiveDepositQrState(remoteQr);
        setActiveDepositQr(remoteQr);
      }
    }).catch(() => {});
  }, []);

  // Global Quiz Timer Firestore Synchronization & Lock Subscription
  useEffect(() => {
    fetchQuizTimerFromFirestore().then((remoteTimer) => {
      if (typeof remoteTimer === 'number' && remoteTimer > 0) {
        setGlobalQuizTimer(remoteTimer);
        try {
          localStorage.setItem('quizkart_global_quiz_timer', remoteTimer.toString());
        } catch {}
      }
    }).catch(() => {});

    const unsubscribeTimer = subscribeToQuizTimer((remoteTimer) => {
      if (typeof remoteTimer === 'number' && remoteTimer > 0) {
        setGlobalQuizTimer(remoteTimer);
        try {
          localStorage.setItem('quizkart_global_quiz_timer', remoteTimer.toString());
        } catch {}
      }
    });

    return () => {
      unsubscribeTimer();
    };
  }, []);

  const handleUpdateDepositQr = useCallback((newQr: string) => {
    setActiveDepositQrState(newQr);
    setActiveDepositQr(newQr);
  }, []);

  const [lastQuizResult, setLastQuizResult] = useState<QuizAttemptResult | null>(() => {
    try {
      const saved = localStorage.getItem('quizkart_last_result');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // User's Real-time Quiz Attempts (Live Tournament Records - Strict 30-Day Rolling Retention Window)
  const [userQuizAttempts, setUserQuizAttempts] = useState<QuizAttemptResult[]>(() => {
    try {
      const saved = localStorage.getItem('quizkart_user_quiz_attempts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(a => a && isWithinRetentionWindow(a.submittedAt));
        }
      }
    } catch {}
    return [];
  });

  // Subscribe to real-time user quiz attempts from Firestore (Strict 30-Day Retention Window)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsubscribe = subscribeToUserQuizAttempts(currentUser.uid, (cloudAttempts) => {
      if (cloudAttempts && cloudAttempts.length > 0) {
        setUserQuizAttempts(prev => {
          const map = new Map<string, QuizAttemptResult>();
          prev.forEach(a => { 
            if (a && a.attemptId && isWithinRetentionWindow(a.submittedAt)) {
              map.set(a.attemptId, a); 
            }
          });
          cloudAttempts.forEach(a => { 
            if (a && a.attemptId && isWithinRetentionWindow(a.submittedAt)) {
              map.set(a.attemptId, a); 
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => {
            const timeA = new Date(a.submittedAt || 0).getTime();
            const timeB = new Date(b.submittedAt || 0).getTime();
            return timeB - timeA;
          });
          try {
            localStorage.setItem('quizkart_user_quiz_attempts', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('quizkart_today_prize', JSON.stringify(todayPrize));
    } catch {}
  }, [todayPrize]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_questions', JSON.stringify(quizQuestions));
    } catch {}
  }, [quizQuestions]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_user_profile', JSON.stringify(userProfile));
      if (userProfile && userProfile.email && !isDemoSeedUser(userProfile)) {
        const rawUsers = localStorage.getItem('quizkart_registered_users');
        const parsedList: UserProfile[] = rawUsers ? JSON.parse(rawUsers) : [];
        const list = Array.isArray(parsedList) ? parsedList.filter((u) => u && !isDemoSeedUser(u)) : [];
        const idx = list.findIndex(
          (u) =>
            u &&
            ((u.email && u.email.toLowerCase() === userProfile.email.toLowerCase()) ||
              (u.id && userProfile.id && u.id === userProfile.id))
        );
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            ...userProfile,
            id: `USR-${1001 + idx}`,
            registrationDate: list[idx].registrationDate || userProfile.registrationDate || getCurrentFormattedTimestamp(),
            passwordStatus:
              userProfile.passwordStatus && !userProfile.passwordStatus.includes('••••') && !userProfile.passwordStatus.includes('Secured')
                ? userProfile.passwordStatus
                : list[idx].passwordStatus && !list[idx].passwordStatus.includes('••••') && !list[idx].passwordStatus.includes('Secured')
                ? list[idx].passwordStatus
                : 'player@123'
          };
        } else {
          list.push({
            ...userProfile,
            id: `USR-${1001 + list.length}`
          });
        }
        const reindexed = list.map((u, i) => ({ ...u, id: `USR-${1001 + i}` }));
        localStorage.setItem('quizkart_registered_users', JSON.stringify(reindexed));
        window.dispatchEvent(new Event('quizkart_users_updated'));
      }
    } catch {}
  }, [userProfile]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_leaderboard', JSON.stringify(leaderboard));
    } catch {}
  }, [leaderboard]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_pool', JSON.stringify(poolData));
    } catch {}
  }, [poolData]);

  useEffect(() => {
    try {
      localStorage.setItem('quizkart_global_quiz_timer', globalQuizTimer.toString());
    } catch {}
  }, [globalQuizTimer]);

  useEffect(() => {
    try {
      if (lastQuizResult) {
        localStorage.setItem('quizkart_last_result', JSON.stringify(lastQuizResult));
      }
    } catch {}
  }, [lastQuizResult]);

  // Firebase Auth listener and Cloud Profile synchronization
  useEffect(() => {
    const resolveCanonicalUserId = (email?: string, fallbackId?: string): string => {
      const cleanEmail = (email || '').trim().toLowerCase();
      try {
        const raw = localStorage.getItem('quizkart_registered_users');
        const parsed: UserProfile[] = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? parsed.filter((u) => u && !isDemoSeedUser(u)) : [];
        if (cleanEmail) {
          const idx = list.findIndex((u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail);
          if (idx >= 0) {
            return `USR-${1001 + idx}`;
          }
        }
      } catch {}
      if (fallbackId && /^USR-\d+$/i.test(fallbackId.trim())) {
        return fallbackId.trim().toUpperCase();
      }
      return 'USR-1001';
    };

    const unsubscribe = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const manuallySaved = localStorage.getItem('quizkart_profile_manually_saved') === 'true';
          let localSaved: Partial<UserProfile> = {};
          try {
            localSaved = JSON.parse(localStorage.getItem('quizkart_user_profile') || '{}');
          } catch {}

          // If user already manually logged in or registered via AuthModal, preserve their exact profile & ID
          if (manuallySaved && localSaved && localSaved.email) {
            const canonicalId = resolveCanonicalUserId(localSaved.email, localSaved.id);
            if (localSaved.id !== canonicalId) {
              const syncedLocal = { ...(localSaved as UserProfile), id: canonicalId };
              setUserProfile(syncedLocal);
              try {
                localStorage.setItem('quizkart_user_profile', JSON.stringify(syncedLocal));
              } catch {}
            }
            return;
          }

          const remoteProfile = await fetchUserProfile(user.uid);

          if (remoteProfile) {
            setUserProfile(prev => {
              const resolvedEmail = localSaved.email || remoteProfile.email || user.email || prev.email;
              const canonicalId = resolveCanonicalUserId(resolvedEmail, localSaved.id || remoteProfile.id || prev.id);
              const merged: UserProfile = {
                ...prev,
                ...remoteProfile,
                ...localSaved,
                id: canonicalId,
                name: localSaved.name || remoteProfile.name || user.displayName || prev.name,
                email: resolvedEmail,
                avatarUrl: localSaved.avatarUrl || remoteProfile.avatarUrl || user.photoURL || prev.avatarUrl,
                mobile: localSaved.mobile || remoteProfile.mobile || prev.mobile,
                countryCode: localSaved.countryCode || remoteProfile.countryCode || prev.countryCode || '+91',
                walletBalance: (localSaved.walletBalance !== undefined) ? localSaved.walletBalance : (remoteProfile.walletBalance ?? prev.walletBalance)
              };
              try {
                localStorage.setItem('quizkart_user_profile', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          } else {
            const resolvedEmail = localSaved.email || user.email || userProfile.email;
            const canonicalId = resolveCanonicalUserId(resolvedEmail, localSaved.id || userProfile.id);
            const initialSync: UserProfile = {
              ...userProfile,
              ...localSaved,
              id: canonicalId,
              name: localSaved.name || user.displayName || userProfile.name,
              email: resolvedEmail,
              avatarUrl: localSaved.avatarUrl || user.photoURL || userProfile.avatarUrl,
              countryCode: localSaved.countryCode || userProfile.countryCode || '+91'
            };
            setUserProfile(initialSync);
            try {
              localStorage.setItem('quizkart_user_profile', JSON.stringify(initialSync));
            } catch {}
            await syncUserProfile(initialSync);
          }
        } catch (err) {
          console.warn('Firebase profile sync notice:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch Questions & Leaderboard from Firestore
  useEffect(() => {
    async function loadCloudData() {
      try {
        const cloudQuestions = await fetchQuestionsFromFirestore();
        if (cloudQuestions && cloudQuestions.length > 0) {
          const valid = cloudQuestions.filter((q): q is Question => Boolean(q && q.id != null));
          if (valid.length > 0) {
            setQuizQuestions(valid);
          }
        }
      } catch (err) {
        console.warn('Firestore questions load notice:', err);
      }

      try {
        const cloudLeaderboard = await fetchLeaderboardFromFirestore();
        if (cloudLeaderboard && cloudLeaderboard.length > 0) {
          const valid = cloudLeaderboard.filter((e): e is LeaderboardEntry => Boolean(e && e.id != null));
          if (valid.length > 0) {
            setLeaderboard(valid);
          }
        }
      } catch (err) {
        console.warn('Firestore leaderboard load notice:', err);
      }

      try {
        const cloudDeposits = await fetchDepositsFromFirestore();
        if (cloudDeposits && cloudDeposits.length > 0) {
          const deletedDeposits = getDeletedDepositIds();
          setDeposits((prev) => {
            const map = new Map<string, DepositRequest>();
            cloudDeposits.forEach((d, idx) => { 
              if (d && d.id) {
                const normId = formatDepositId(d.id, idx + 1);
                if (!deletedDeposits.includes(d.id) && !deletedDeposits.includes(normId)) {
                  map.set(normId, {
                    ...d,
                    id: normId,
                    timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date)
                  });
                }
              } 
            });
            prev.forEach((d, idx) => { 
              if (d && d.id) {
                const normId = formatDepositId(d.id, idx + 1);
                if (!deletedDeposits.includes(d.id) && !deletedDeposits.includes(normId) && !map.has(normId)) {
                  map.set(normId, {
                    ...d,
                    id: normId,
                    timestamp: formatDepositTimestamp(d.timestamp, d.createdAt, d.date)
                  });
                }
              } 
            });
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Firestore deposits load notice:', err);
      }

      try {
        const cloudWithdrawals = await fetchWithdrawalsFromFirestore();
        if (cloudWithdrawals && cloudWithdrawals.length > 0) {
          const deletedWithdrawals = getDeletedWithdrawalIds();
          setWithdrawals((prev) => {
            const map = new Map<string, WithdrawalRequest>();
            cloudWithdrawals.forEach((w, idx) => { 
              if (w && w.id) {
                const normId = formatWithdrawalId(w.id, idx + 1);
                if (!deletedWithdrawals.includes(w.id) && !deletedWithdrawals.includes(normId)) {
                  map.set(normId, {
                    ...w,
                    id: normId,
                    timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
                  });
                }
              } 
            });
            prev.forEach((w, idx) => { 
              if (w && w.id) {
                const normId = formatWithdrawalId(w.id, idx + 1);
                if (!deletedWithdrawals.includes(w.id) && !deletedWithdrawals.includes(normId) && !map.has(normId)) {
                  map.set(normId, {
                    ...w,
                    id: normId,
                    timestamp: formatDepositTimestamp(w.timestamp, w.createdAt, w.date)
                  });
                }
              } 
            });
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Firestore withdrawals load notice:', err);
      }
    }

    loadCloudData();
  }, []);

  // Complete Registration / Login Handler (Dynamic State Logic for New User vs Returning Logged-In User)
  const handleCompleteSignUp = useCallback(async (userData: {
    email: string;
    password?: string;
    name: string;
    mobile: string;
    countryCode?: string;
    avatarUrl?: string;
    isExistingLogin?: boolean;
  }) => {
    const todayDateOnly = new Date().toISOString().split('T')[0];
    let existingUsers: UserProfile[] = [];
    try {
      const raw = localStorage.getItem('quizkart_registered_users');
      const parsed = raw ? JSON.parse(raw) : [];
      existingUsers = Array.isArray(parsed) ? parsed.filter((u) => u && !isDemoSeedUser(u)) : [];
    } catch {
      existingUsers = [];
    }

    // Ensure current real userProfile is saved in existingUsers before switching
    if (userProfile && userProfile.email && !isDemoSeedUser(userProfile)) {
      const currentIdx = existingUsers.findIndex(
        (u) =>
          u &&
          ((u.id && userProfile.id && u.id === userProfile.id) ||
            (u.email && u.email.toLowerCase() === userProfile.email.toLowerCase()))
      );
      if (currentIdx >= 0) {
        existingUsers[currentIdx] = {
          ...existingUsers[currentIdx],
          ...userProfile,
          registrationDate: (existingUsers[currentIdx].registrationDate || userProfile.registrationDate || todayDateOnly).split('|')[0].trim(),
          passwordStatus:
            userProfile.passwordStatus && !userProfile.passwordStatus.includes('••••') && !userProfile.passwordStatus.includes('Secured')
              ? userProfile.passwordStatus
              : existingUsers[currentIdx].passwordStatus || 'player@123'
        };
      }
      try {
        localStorage.setItem(
          `quizkart_user_quiz_attempts_${userProfile.email.toLowerCase()}_${(userProfile.name || '').toLowerCase()}`,
          JSON.stringify(userQuizAttempts)
        );
      } catch {}
    }

    const cleanInputEmail = userData.email.trim().toLowerCase();
    const cleanInputMobile = userData.mobile.replace(/\D/g, '');

    // Match returning real user by email
    const existingMatch = existingUsers.find((u) => {
      if (!u) return false;
      const uEmail = (u.email || '').trim().toLowerCase();
      return uEmail === cleanInputEmail;
    });

    const plainPassword =
      userData.password && userData.password.trim()
        ? userData.password.trim()
        : existingMatch?.passwordStatus &&
          !existingMatch.passwordStatus.includes('••••') &&
          !existingMatch.passwordStatus.includes('Secured')
        ? existingMatch.passwordStatus
        : 'player@123';

    let updatedProfile: UserProfile;

    if (existingMatch) {
      const matchIdx = existingUsers.indexOf(existingMatch);
      const canonicalId = `USR-${1001 + (matchIdx >= 0 ? matchIdx : 0)}`;
      // RETURNING LOGGED-IN USER: Persist and load their actual real-time database state without resetting
      updatedProfile = {
        ...existingMatch,
        id: canonicalId,
        uid: currentUser?.uid || existingMatch.uid || canonicalId,
        name: existingMatch.name || userData.name.trim(),
        mobile: existingMatch.mobile || cleanInputMobile,
        countryCode: existingMatch.countryCode || userData.countryCode || '+91',
        email: userData.email.trim() || existingMatch.email,
        avatarUrl: existingMatch.avatarUrl || userData.avatarUrl,
        walletBalance: existingMatch.walletBalance ?? 0,
        totalWonAmount: existingMatch.totalWonAmount ?? 0,
        quizzesPlayed: existingMatch.quizzesPlayed ?? 0,
        productsWonCount: existingMatch.productsWonCount ?? 0,
        isRegistered: true,
        isBlocked: existingMatch.isBlocked ?? false,
        registrationDate: (existingMatch.registrationDate || todayDateOnly).split('|')[0].trim(),
        passwordStatus: plainPassword,
        hasPassword: true
      };

      // Restore returning user's quiz attempts
      try {
        const savedUserAttempts = localStorage.getItem(
          `quizkart_user_quiz_attempts_${updatedProfile.email.toLowerCase()}_${updatedProfile.name.toLowerCase()}`
        );
        if (savedUserAttempts) {
          const parsedAttempts = JSON.parse(savedUserAttempts);
          if (Array.isArray(parsedAttempts)) {
            setUserQuizAttempts(parsedAttempts);
            localStorage.setItem('quizkart_user_quiz_attempts', JSON.stringify(parsedAttempts));
          }
        }
      } catch {}
    } else {
      // NEW USER REGISTRATION: Sequential ID starting at USR-1001 + 0 for Wallet, Total Won, and Quizzes Played
      const nextSeqNum = 1001 + existingUsers.length;
      const sequentialId = `USR-${nextSeqNum}`;
      updatedProfile = {
        id: sequentialId,
        uid: currentUser?.uid || sequentialId,
        name: userData.name.trim(),
        mobile: cleanInputMobile,
        countryCode: userData.countryCode || '+91',
        email: userData.email.trim(),
        avatarUrl: userData.avatarUrl || DEFAULT_USER_PROFILE.avatarUrl,
        address: {
          fullName: userData.name.trim(),
          phoneNumber: cleanInputMobile,
          streetAddress: '',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001'
        },
        upiId: '',
        walletBalance: 0,
        quizzesPlayed: 0,
        totalWonAmount: 0,
        productsWonCount: 0,
        isRegistered: true,
        isBlocked: false,
        registrationDate: todayDateOnly,
        passwordStatus: plainPassword,
        hasPassword: true
      };

      // Clean slate initialization for brand new user accounts: completely empty transaction histories (₹0 Deposits, 0 Withdrawals)
      setUserQuizAttempts([]);
      setLastQuizResult(null);
      try {
        localStorage.setItem(`quizkart_user_deposits_permanent_${cleanInputEmail}`, JSON.stringify([]));
        localStorage.setItem(`quizkart_user_withdrawals_permanent_${cleanInputEmail}`, JSON.stringify([]));
        localStorage.setItem('quizkart_user_quiz_attempts', JSON.stringify([]));
        localStorage.removeItem('quizkart_last_result');
        localStorage.removeItem('quizkart_active_pending_withdrawal_id');
      } catch {}
    }

    setUserProfile(updatedProfile);
    setIsUserAuthenticated(true);
    setIsAuthModalOpen(false);
    try {
      localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('quizkart_profile_manually_saved', 'true');
      localStorage.setItem('quizkart_is_authenticated', 'true');

      const matchIdx = existingUsers.findIndex((u) => {
        if (!u) return false;
        if (existingMatch && u.id === existingMatch.id) return true;
        return (u.email || '').toLowerCase() === updatedProfile.email.toLowerCase();
      });

      if (matchIdx >= 0) {
        existingUsers[matchIdx] = updatedProfile;
      } else {
        existingUsers.push(updatedProfile);
      }
      localStorage.setItem('quizkart_registered_users', JSON.stringify(existingUsers));
    } catch {}

    setCurrentTab('home');
    await syncUserProfile(updatedProfile);
    handleShowNotice(`Welcome ${updatedProfile.name}!`);
  }, [userProfile, currentUser, handleShowNotice, userQuizAttempts]);

  // Handler when user updates their Email from Edit Profile -> Initial Auth Screen
  const handleUpdateEmailOnly = useCallback(async (newEmail: string) => {
    const cleanEmail = newEmail.trim();
    if (!cleanEmail) return;

    const updated: UserProfile = {
      ...userProfile,
      email: cleanEmail,
      isRegistered: true
    };

    setUserProfile(updated);
    try {
      localStorage.setItem('quizkart_user_profile', JSON.stringify(updated));
      localStorage.setItem('quizkart_profile_manually_saved', 'true');

      const rawUsers = localStorage.getItem('quizkart_registered_users');
      const existingUsers: UserProfile[] = rawUsers ? JSON.parse(rawUsers) : [...DEFAULT_REGISTERED_USERS];
      if (Array.isArray(existingUsers)) {
        const idx = existingUsers.findIndex(
          (u) =>
            u &&
            ((u.id && userProfile.id && u.id === userProfile.id) ||
              (u.email && userProfile.email && u.email.toLowerCase() === userProfile.email.toLowerCase()))
        );
        if (idx >= 0) {
          existingUsers[idx] = { ...existingUsers[idx], ...updated, email: cleanEmail };
        } else {
          existingUsers.unshift(updated);
        }
        localStorage.setItem('quizkart_registered_users', JSON.stringify(existingUsers));
      }
    } catch {}

    setIsEmailChangeMode(false);
    await syncUserProfile(updated);
    handleShowNotice(`Email updated to ${cleanEmail} and synced with Admin Panel!`);
  }, [userProfile, handleShowNotice]);

  // Dedicated profile update handler with synchronous localStorage & cloud persistence
  const handleUpdateProfile = useCallback((updated: UserProfile) => {
    setUserProfile(updated);
    try {
      localStorage.setItem('quizkart_user_profile', JSON.stringify(updated));
      localStorage.setItem('quizkart_profile_manually_saved', 'true');

      const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem('quizkart_registered_users') || '[]');
      if (Array.isArray(existingUsers)) {
        const idx = existingUsers.findIndex(
          (u) =>
            (u.email && updated.email && u.email.toLowerCase() === updated.email.toLowerCase()) ||
            (u.id && updated.id && u.id === updated.id)
        );
        if (idx >= 0) {
          existingUsers[idx] = { ...existingUsers[idx], ...updated };
        } else {
          existingUsers.push(updated);
        }
        localStorage.setItem('quizkart_registered_users', JSON.stringify(existingUsers));
      }
    } catch {}
    syncUserProfile(updated).catch(err => console.warn('Sync profile error:', err));
  }, []);

  // Real-time Active User Session Presence Tracker (strictly linked to User Email Address while browser tab/session is open)
  useEffect(() => {
    const emailKey = (userProfile?.email || '').trim().toLowerCase();
    const isSessionLoggedOut = !isUserAuthenticated || (isAuthModalOpen && !isEmailChangeMode) || isDemoSeedUser(userProfile);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('quizkart_presence_channel');
      }
    } catch {}

    const notifyPresenceChannel = () => {
      window.dispatchEvent(new CustomEvent('quizkart_presence_updated'));
      try {
        bc?.postMessage({ type: 'presence_updated', timestamp: Date.now() });
      } catch {}
    };

    const updateSessionPresence = (isOnline: boolean) => {
      if (!emailKey) return;
      try {
        const raw = localStorage.getItem('quizkart_active_sessions');
        const sessions: Record<string, { email: string; lastSeen: number }> = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        // Prune stale sessions (> 6 seconds old)
        Object.keys(sessions).forEach((k) => {
          if (!sessions[k] || !sessions[k].email || now - sessions[k].lastSeen > 6000) {
            delete sessions[k];
          }
        });
        if (isOnline && !isSessionLoggedOut && !userProfile?.isBlocked && !userProfile?.isDeleted) {
          sessions[emailKey] = {
            email: emailKey,
            lastSeen: now
          };
        } else {
          delete sessions[emailKey];
        }
        localStorage.setItem('quizkart_active_sessions', JSON.stringify(sessions));
        notifyPresenceChannel();
      } catch {}
    };

    if (isSessionLoggedOut) {
      updateSessionPresence(false);
      try {
        bc?.close();
      } catch {}
      return;
    }

    updateSessionPresence(document.visibilityState !== 'hidden');

    const heartbeatInterval = setInterval(() => {
      updateSessionPresence(document.visibilityState !== 'hidden');
    }, 1500);

    const handleVisibilityChange = () => {
      updateSessionPresence(document.visibilityState !== 'hidden');
    };

    const handleUnload = () => {
      updateSessionPresence(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      try {
        bc?.close();
      } catch {}
    };
  }, [userProfile?.email, userProfile?.isBlocked, userProfile?.isDeleted, isUserAuthenticated, isAuthModalOpen, isEmailChangeMode]);

  // Sync user profile updates to Firestore
  useEffect(() => {
    if (currentUser && !isFirestoreQuotaExceeded() && userProfile?.isRegistered && !userProfile?.isDeleted) {
      syncUserProfile(userProfile).catch(() => {});
    }
  }, [userProfile?.walletBalance, userProfile?.totalWonAmount, userProfile?.name, userProfile?.email, currentUser]);

  // JavaScript Dynamic URL & Hash Listener for Secret Admin Route (#admin-gate-99)
  useEffect(() => {
    const handleHashCheck = () => {
      if (typeof window === 'undefined') return;
      
      const currentHash = window.location.hash || '';
      const currentHref = window.location.href || '';
      const isTargetHash = currentHash === '#admin-gate-99' || 
                           currentHash.includes('admin-gate-99') || 
                           currentHref.endsWith('#admin-gate-99') ||
                           currentHref.includes('#admin-gate-99');

      if (isTargetHash) {
        if (!isAdminPageActive && !isAdminAuthModalOpen) {
          setIsAdminAuthModalOpen(true);
        }
      }
    };

    // Check hash on initial render
    handleHashCheck();

    // Listen to live hash changes and browser navigation events
    window.addEventListener('hashchange', handleHashCheck);
    window.addEventListener('popstate', handleHashCheck);

    const handleKeyCombo = (e: KeyboardEvent) => {
      if ((e.altKey && (e.key === 'a' || e.key === 'A')) || (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))) {
        setIsAdminAuthModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyCombo);

    // Polling interval to catch immediate address bar edits in all iframe & browser environments
    const intervalId = setInterval(handleHashCheck, 300);

    return () => {
      window.removeEventListener('hashchange', handleHashCheck);
      window.removeEventListener('popstate', handleHashCheck);
      window.removeEventListener('keydown', handleKeyCombo);
      clearInterval(intervalId);
    };
  }, [isAdminPageActive]);

  // Clean URL hash helper (removes #admin-gate-99 dynamically from address bar)
  const clearAdminHash = () => {
    if (typeof window === 'undefined') return;
    const currentHash = window.location.hash || '';
    const currentHref = window.location.href || '';

    if (currentHash.includes('admin-gate-99') || currentHref.includes('#admin-gate-99')) {
      try {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);
      } catch {
        window.location.hash = '';
      }
    }
  };

  // Dynamic active contest entry fee synced with active contest
  const activeContestEntryFee = useMemo(() => {
    if (activeContest?.entryFee) return activeContest.entryFee;
    if (poolData.entryFee) return poolData.entryFee;
    return 100;
  }, [activeContest, poolData.entryFee]);

  // Handler to open Wallet Confirmation Modal on 'Join Now' click
  const handleStartRealQuiz = () => {
    if (userProfile.isBlocked) {
      soundFx.playWrong();
      showTunedToast("Account Blocked by Admin: You are restricted from joining quizzes.");
      return;
    }
    if (!isContestLive) {
      showTunedToast("No contest live right now. Stay tuned for the next round!");
      return;
    }
    // Check if dynamic pool is full
    const maxCap = activeContest?.maxParticipants || poolData.targetParticipants || 50;
    const realJoinsCount = activeContest?.realJoins !== undefined ? activeContest.realJoins : realActiveParticipants;
    const poolMetrics = calculateDynamicPool({
      maxParticipants: maxCap,
      realJoinsCount,
      isUpcoming: activeContest?.status === 'scheduled',
      contestId: activeContest?.id || 'live_round',
      activatedAt: activeContest?.activatedAt,
      randomBasePercent: activeContest?.randomBasePercent
    });
    if (poolMetrics.isPoolFull || activeContest?.status === 'full') {
      showTunedToast("Contest Full! Stay tuned for the next contest.");
      return;
    }
    setIsPracticeMode(false);
    setIsWalletConfirmModalOpen(true);
  };

  // Handler to open Practice Demo Mode
  const handleStartPracticeDemo = () => {
    setIsPracticeMode(true);
    handleLaunchQuiz(true);
  };

  // Handler upon clicking 'Confirm & Join Arena' inside Wallet Entry Confirmation Modal
  const handleConfirmWalletEntry = () => {
    setIsWalletConfirmModalOpen(false);
    const feeToDeduct = isPracticeMode ? 0 : activeContestEntryFee;

    // Instantly deduct entry fee from user wallet balance
    if (feeToDeduct > 0) {
      setUserProfile(prev => {
        const nextBal = Math.max(0, (prev.walletBalance || 0) - feeToDeduct);
        const updated = {
          ...prev,
          walletBalance: nextBal
        };
        try {
          localStorage.setItem('quizkart_user_profile', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }

    handleLaunchQuiz(isPracticeMode);
  };

  // Handler when user clicks '+ Add Funds to Wallet' inside Wallet Modal
  const handleAddFundsFromModal = () => {
    setIsWalletConfirmModalOpen(false);
    setCurrentTab('deposit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Start actual Quiz Arena after wallet confirmation (immediately navigates to Language Selection)
  const handleLaunchQuiz = (practice: boolean) => {
    setIsWalletConfirmModalOpen(false);
    setIsPracticeMode(practice);
    setLastQuizResult(null);

    // If real quiz, record real-time participant join for Admin
    if (!practice) {
      setRealActiveParticipants(prev => {
        const next = prev + 1;
        try {
          localStorage.setItem('quizkart_real_active_participants', next.toString());
        } catch {}
        return next;
      });

      // Update active contest's realJoins and totalRevenue, persist dynamically to Firestore
      setContests(prev => {
        const updated = prev.map(c => {
          if (c.id === activeContest?.id || c.status === 'active') {
            const currentJoins = (c.realJoins || 0) + 1;
            const currentRev = (c.totalRevenue || 0) + (c.entryFee || 100);
            const targetCap = c.maxParticipants || poolData.targetParticipants || 50;
            const isNowFull = currentJoins >= targetCap;
            return {
              ...c,
              realJoins: currentJoins,
              totalRevenue: currentRev,
              status: isNowFull ? ('full' as const) : c.status
            };
          }
          return c;
        });
        try {
          localStorage.setItem('quizkart_active_contests', JSON.stringify(updated));
        } catch {}
        if (!isFirestoreQuotaExceeded()) {
          const joinedContest = updated.find(c => c.id === activeContest?.id || c.status === 'active');
          if (joinedContest) {
            saveContestToFirestore(joinedContest).catch(() => {});
          }
        }
        return updated;
      });
    }

    // Random question generation (shuffle questions for unique order per contestant)
    setQuizQuestions(prev => {
      const shuffled = [...prev].sort(() => Math.random() - 0.5);
      return shuffled;
    });
    setCurrentTab('quiz_arena');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Process Quiz Submission & Score Calculation
  const handleQuizSubmit = (
    answers: Record<number, number>,
    markedForReview: number[],
    timeTakenSeconds: number,
    securityBreached?: boolean,
    securityBreachReason?: string
  ) => {
    // 1. Calculate score with +1.0 for correct, -0.33 for incorrect, 0 for unattempted
    let calculatedScore = 0;
    if (securityBreached) {
      calculatedScore = 0;
      try {
        const newViolation = {
          id: `SEC-${Math.floor(1000 + Math.random() * 9000)}`,
          userName: userProfile.name || 'Anonymous Contestant',
          phone: userProfile.mobile || '+91 98XXX XXXXX',
          city: userProfile.address.city || 'Bengaluru',
          timestamp: getCurrentFormattedTimestamp(),
          violationType: securityBreachReason || 'Proctor Violation: Window blur or tab switch detected',
          severity: 'Critical (Disqualified)' as const,
          actionTaken: 'Immediate Auto-Submit with 0 Points & Integrity Flagged',
          deviceInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'} • Strict Canvas Active` : 'Web Browser',
          status: 'Flagged' as const
        };
        const existingLogs = localStorage.getItem('quizkart_security_logs');
        const parsed = existingLogs ? JSON.parse(existingLogs) : [];
        localStorage.setItem('quizkart_security_logs', JSON.stringify([newViolation, ...parsed]));
      } catch {}
    } else {
      (quizQuestions || []).filter(q => q && q.id != null).forEach((q) => {
        const selected = answers[q.id];
        if (selected !== undefined) {
          if (selected === q.correctIndex) {
            calculatedScore += 1;
          } else {
            calculatedScore -= 0.33; // -0.33 negative marking
          }
        }
      });
      // Floor score at 0 and round to 2 decimal places
      calculatedScore = Math.max(0, Math.round(calculatedScore * 100) / 100);
    }

    const formatSecs = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      return `${m}m ${s.toString().padStart(2, '0')}s`;
    };

    // 2. Insert into competitive leaderboard (remove existing user entry first if any)
    const existingClean = (leaderboard || []).filter(e => e && e.id && !e.isCurrentUser && e.userName !== userProfile.name);
    
    // Create new entry
    const newUserEntry: LeaderboardEntry = {
      id: `user-${Date.now()}`,
      rank: 1, // temporary
      userName: userProfile.name || 'You',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      score: calculatedScore,
      totalQuestions: quizQuestions.length,
      timeTakenSeconds,
      formattedTime: formatSecs(timeTakenSeconds),
      city: userProfile.address.city || 'Bengaluru',
      state: userProfile.address.state || 'Karnataka',
      rewardText: '',
      rewardType: 'none',
      isCurrentUser: true,
      timestamp: 'Just now',
      submittedAt: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Sort all entries: Score DESC, then TimeTaken ASC
    const allEntries = [...existingClean, newUserEntry].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    // Assign final dynamic ranks & rewards
    let userRank = 1;
    let rewardWonText = 'Consolation Certificate';
    let rewardType: 'product' | 'cashback' | 'none' = 'none';
    let rewardAmount = 0;

    const rankedLeaderboard: LeaderboardEntry[] = allEntries.map((entry, idx) => {
      const rank = idx + 1;
      let rewardText = 'Consolation Certificate';
      let rType: 'product' | 'cashback' | 'none' = 'none';
      let rAmt = 0;

      if (rank === 1) {
        rewardText = `🎁 ${todayPrize.brand} Smartwatch (${entry.city})`;
        rType = 'product';
        rAmt = todayPrize.retailValue;
      } else if (rank === 2) {
        rewardText = '₹1,000 UPI Cashback';
        rType = 'cashback';
        rAmt = 1000;
      } else if (rank === 3) {
        rewardText = '₹600 UPI Cashback';
        rType = 'cashback';
        rAmt = 600;
      } else if (rank === 4) {
        rewardText = '₹400 UPI Cashback';
        rType = 'cashback';
        rAmt = 400;
      } else if (rank === 5) {
        rewardText = '₹300 UPI Cashback';
        rType = 'cashback';
        rAmt = 300;
      } else if (rank === 6) {
        rewardText = '₹200 UPI Cashback';
        rType = 'cashback';
        rAmt = 200;
      } else if (rank <= 8) {
        rewardText = '₹150 UPI Cashback';
        rType = 'cashback';
        rAmt = 150;
      } else if (rank <= 10) {
        rewardText = '₹100 UPI Refund';
        rType = 'cashback';
        rAmt = 100;
      }

      if (entry.isCurrentUser) {
        userRank = rank;
        rewardWonText = rewardText;
        rewardType = rType;
        rewardAmount = rAmt;
      }

      return {
        ...entry,
        rank,
        rewardText,
        rewardType: rType,
        rewardAmount: rAmt
      };
    });

    setLeaderboard(rankedLeaderboard);

    // 3. Build Result Object
    const attemptResult: QuizAttemptResult = {
      attemptId: `att-${Date.now()}`,
      quizDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      score: calculatedScore,
      totalQuestions: quizQuestions.length,
      timeTakenSeconds,
      answers,
      markedForReview,
      rank: userRank,
      totalParticipants: rankedLeaderboard.length,
      rewardWon: rewardWonText,
      rewardType,
      rewardAmount,
      deliveryAddress: userProfile.address,
      upiId: userProfile.upiId,
      securityBreached,
      securityBreachReason,
      title: activeContest?.title || 'Cash Tournament',
      submittedAt: new Date().toISOString()
    };

    setLastQuizResult(attemptResult);

    // Update real-time user quiz attempts immediately (Strict 30-Day Retention Window)
    setUserQuizAttempts(prev => {
      const updated = [attemptResult, ...prev.filter(a => a.attemptId !== attemptResult.attemptId)]
        .filter(a => isWithinRetentionWindow(a.submittedAt));
      try {
        localStorage.setItem('quizkart_user_quiz_attempts', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 4. Update user profile stats if not practice
    if (!isPracticeMode) {
      if (currentUser) {
        recordQuizAttemptInFirestore(attemptResult).catch(err => console.warn('Record attempt error:', err));
      }

      setUserProfile(prev => ({
        ...prev,
        quizzesPlayed: prev.quizzesPlayed + 1,
        totalWonAmount: prev.totalWonAmount + (rewardType === 'cashback' ? rewardAmount : 0),
        productsWonCount: prev.productsWonCount + (rewardType === 'product' ? 1 : 0),
        walletBalance: prev.walletBalance + (rewardType === 'cashback' ? rewardAmount : 0)
      }));

      setPoolData(prev => {
        const nextParticipants = prev.activeParticipants + 1;
        const total = nextParticipants * prev.entryFee;
        return {
          ...prev,
          activeParticipants: nextParticipants,
          totalPoolAmount: total,
          productPrizeValue: Math.round(total * (prev.productSharePercentage / 100)),
          runnerUpPoolValue: Math.round(total * (prev.runnerUpCashbackPercentage / 100)),
          platformFeeValue: Math.round(total * (prev.platformFeePercentage / 100))
        };
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isQuizActive = currentTab === 'quiz_arena' && !lastQuizResult;

  // If Admin Full-Screen Page is active, render it exclusively
  if (isAdminPageActive) {
    return (
      <AdminPage
        onExitAdmin={() => {
          setIsAdminPageActive(false);
          clearAdminHash();
        }}
        questions={quizQuestions}
        onUpdateQuestions={setQuizQuestions}
        todayPrize={todayPrize}
        onUpdatePrize={setTodayPrize}
        leaderboard={leaderboard}
        onUpdateLeaderboard={setLeaderboard}
        poolData={poolData}
        onUpdatePoolData={setPoolData}
        globalQuizTimer={globalQuizTimer}
        onUpdateQuizTimer={setGlobalQuizTimer}
        userProfile={userProfile}
        onUpdateProfile={setUserProfile}
        activeContest={activeContest}
        onUpdateActiveContest={setActiveContest}
        contests={contests}
        onUpdateContests={setContests}
        onDeleteContest={handleDeleteContest}
        announcement={announcement}
        onUpdateAnnouncement={handleUpdateAnnouncement}
        bannerSlides={bannerSlides}
        onUpdateBannerSlides={handleUpdateBannerSlides}
        bannerSliderEnabled={bannerSliderEnabled}
        onToggleBannerSlider={handleUpdateBannerSliderEnabled}
        realParticipantsCount={realActiveParticipants}
        deposits={deposits}
        onUpdateDeposits={setDeposits}
        withdrawals={withdrawals}
        onUpdateWithdrawals={setWithdrawals}
        activeDepositQr={activeDepositQr}
        onUpdateDepositQr={handleUpdateDepositQr}
      />
    );
  }

  // If Full-Screen Legal Policy Page (Terms & Conditions or Privacy Policy) is active, render it exclusively
  if (currentTab === 'terms_conditions' || currentTab === 'privacy_policy') {
    return (
      <LegalPolicyPage
        policyType={currentTab === 'terms_conditions' ? 'terms' : 'privacy'}
        onBack={() => {
          setCurrentTab('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSwitchPolicy={(nextType) => {
          setCurrentTab(nextType === 'terms' ? 'terms_conditions' : 'privacy_policy');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  // Strict Route Guard: Non-authenticated/unregistered users cannot view or access any internal app system;
  // they must strictly see the Login/Registration screen first, and logged-out users are redirected here.
  if (!isUserAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 antialiased relative">
        <AuthModal
          isOpen={!isAdminAuthModalOpen}
          onClose={() => {}}
          initialStep={authModalStep}
          onGoogleSignInPopup={signInWithGoogle}
          onCompleteSignUp={handleCompleteSignUp}
          onUpdateEmailOnly={handleUpdateEmailOnly}
          isEmailChangeMode={false}
          prefilledEmail={userProfile.email}
          prefilledName={userProfile.name}
          prefilledMobile={userProfile.mobile}
          prefilledCountryCode={userProfile.countryCode || '+91'}
          prefilledAvatar={userProfile.avatarUrl}
          isAlreadySignedUp={Boolean(userProfile.isRegistered && userProfile.email)}
        />
        <AdminAuthModal
          isOpen={isAdminAuthModalOpen}
          onClose={() => {
            setIsAdminAuthModalOpen(false);
            clearAdminHash();
          }}
          onSuccess={() => {
            setIsAdminAuthModalOpen(false);
            setIsAdminPageActive(true);
          }}
        />
      </div>
    );
  }

  const isTestTakingActive = currentTab === 'quiz_arena' && !lastQuizResult;
  const isStandalonePage = currentTab === 'deposit' || currentTab === 'history' || currentTab === 'edit_profile' || currentTab === 'withdrawal';

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-slate-900 antialiased selection:bg-blue-600 selection:text-white relative" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Top Blue Moving Ticker Announcement Strip - Hidden in Test Mode */}
      {!isStandalonePage && !isTestTakingActive && (
        <AnnouncementBar 
          text={announcement.text} 
          isEnabled={announcement.isEnabled} 
          speed={announcement.speed} 
        />
      )}

      {/* Global Sleek Floating Toast Notification */}
      {globalNotice && (
        <div 
          id="global-tuned-notice-toast"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] sm:w-auto px-5 py-3.5 rounded-2xl text-white shadow-lg flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
            color: '#FFFFFF',
            boxShadow: '0 4px 14px rgba(74, 125, 243, 0.35)'
          }}
        >
          <div className="text-xs sm:text-sm font-bold leading-snug text-center" style={{ color: '#FFFFFF' }}>
            {globalNotice}
          </div>
        </div>
      )}

      {/* Top Navigation - Completely hidden whenever a user is inside the active test-taking screen */}
      {!isStandalonePage && !isTestTakingActive && (
        <Navbar
          currentTab={currentTab}
          setCurrentTab={(tab) => {
            setLastQuizResult(null);
            setCurrentTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          userProfile={userProfile}
          poolData={poolData}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          onEnterQuiz={handleStartRealQuiz}
          isQuizActive={isQuizActive}
          isContestLive={isContestLive}
          onShowNotice={showTunedToast}
          onTriggerAdmin={() => setIsAdminAuthModalOpen(true)}
          currentUser={currentUser}
          onGoogleSignIn={() => handleOpenAuthModal(1)}
          onLogoutAndOpenStep1={handleLogoutAndOpenStep1}
          onOpenAuthModal={handleOpenAuthModal}
        />
      )}

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto ${isTestTakingActive ? 'max-w-7xl px-3 sm:px-6 py-3' : isStandalonePage ? 'max-w-4xl px-4 sm:px-6 py-6' : 'max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-12'}`}>
        {/* VIEW 1: HOME */}
        {currentTab === 'home' && (
          <div className="space-y-6">
            {/* Clean, Non-Intrusive PWA Install Banner (ONLY on Home Tab) */}
            {!isAppInstalled && !isInstallBannerDismissed && (
              <div 
                id="pwa-install-banner"
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 transition-all duration-300"
                style={{ background: '#FFFFFF' }}
              >
                {/* Top Brand Accent Line */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Official QuizKart logo image next to app title and description */}
                  <div className="flex items-center gap-3.5 pr-8 sm:pr-0">
                    <div className="relative flex w-12 h-12 aspect-square shrink-0 items-center justify-center rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-white">
                      <img 
                        src="/icon.svg" 
                        alt="QuizKart" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                          Install QuizKart App
                        </h3>
                        <span 
                          className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white rounded-full shadow-xs shrink-0"
                          style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                        >
                          App
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Fast access & better quiz experience
                      </p>
                    </div>
                  </div>

                  {/* Actions: Later / Close and Install */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center w-full sm:w-auto">
                    <button
                      type="button"
                      id="pwa-later-btn"
                      onClick={handleDismissInstallBanner}
                      className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer text-center"
                    >
                      Later
                    </button>

                    <button
                      type="button"
                      id="pwa-install-btn"
                      onClick={handleInstallApp}
                      className="flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-bold text-white rounded-xl shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      Install
                    </button>
                  </div>
                </div>

                {/* Mobile top-right close dismiss button */}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={handleDismissInstallBanner}
                  className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-lg sm:hidden cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* Front-Page Carousel Banner Slider: Fully preserved and rendered (Image 1000155983) */}
            {bannerSliderEnabled && (
              <BannerSlider 
                slides={bannerSlides} 
                isLiveContest={isContestLive}
                onSlideAction={(tab, customUrl) => {
                  if (tab === 'leaderboard' || (tab as any) === 'leaderboards') {
                    setCurrentTab('leaderboard');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } else if (tab === 'quiz_arena' || (tab as any) === 'tournaments') {
                    if (isContestLive) {
                      handleStartRealQuiz();
                    } else {
                      setCurrentTab('home');
                      const tournamentSection = document.getElementById('upcoming-prizes-section') || document.getElementById('how-it-works-section');
                      if (tournamentSection) {
                        tournamentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      } else {
                        window.scrollTo({ top: 380, behavior: 'smooth' });
                      }
                      showTunedToast("Explore Upcoming Tournaments below! Stay tuned for the next round.");
                    }
                  } else if (tab === 'refer_earn') {
                    setCurrentTab('profile');
                    showTunedToast("🎁 Refer & Earn: Share QuizKart with friends from your Profile & Wallet to earn bonus cash!");
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } else if (tab === 'withdrawal_history') {
                    setCurrentTab('history');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } else if (tab === 'custom_url') {
                    if (customUrl) {
                      if (customUrl.startsWith('http://') || customUrl.startsWith('https://')) {
                        window.location.href = customUrl;
                      } else {
                        window.location.href = `https://${customUrl}`;
                      }
                    }
                  } else {
                    setCurrentTab(tab as any);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }} 
              />
            )}

            {/* Main Interactive Hero Tournament Dashboard: All UI sections preserved (Contest Details, Live Standings, Instructions, Upcoming Rounds) */}
            <HeroSection
              todayPrize={todayPrize}
              poolData={poolData}
              onEnterQuiz={handleStartRealQuiz}
              onViewLeaderboard={() => {
                setCurrentTab('leaderboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewTransparency={() => {
                setCurrentTab('transparency');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onShowNotice={showTunedToast}
              activeContest={activeContest}
              contests={contests}
              onContestExpired={handleContestExpired}
              onContestStarted={handleContestStarted}
              onLiveStateChange={setHeroReportedLive}
              contestDurationSeconds={globalQuizTimer}
            />
          </div>
        )}

        {/* VIEW 2: QUIZ ARENA (Active Test or Results) */}
        {currentTab === 'quiz_arena' && (
          <>
            {lastQuizResult ? (
              <QuizResult
                result={lastQuizResult}
                questions={quizQuestions}
                todayPrize={todayPrize}
                onViewLeaderboard={() => {
                  setCurrentTab('leaderboard');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onRetakeOrHome={() => {
                  setLastQuizResult(null);
                  setCurrentTab('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : (
              <QuizArena
                questions={quizQuestions}
                onSubmitQuiz={handleQuizSubmit}
                isPractice={isPracticeMode}
                todayPrize={todayPrize}
                poolData={poolData}
                contestDurationSeconds={globalQuizTimer}
                onQuitQuiz={() => {
                  setCurrentTab('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </>
        )}

        {/* VIEW 3: LIVE LEADERBOARD */}
        {currentTab === 'leaderboard' && (
          <LiveLeaderboard
            leaderboard={leaderboard}
            currentUserId={userProfile.name}
            onEnterQuiz={handleStartRealQuiz}
            isQuizActive={isQuizActive}
          />
        )}

        {/* VIEW 4: TRANSPARENCY & POOL ECONOMICS */}
        {currentTab === 'transparency' && (
          <TransparencySection
            initialPool={poolData}
            onEnterQuiz={handleStartRealQuiz}
            isQuizActive={isQuizActive}
            userProfile={userProfile}
            deposits={deposits}
            withdrawals={withdrawals}
            userQuizAttempts={userQuizAttempts}
            onShowToast={showTunedToast}
            onOpenSupport={() => {
              setCurrentTab('support');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 5: PROFILE & WALLET */}
        {currentTab === 'profile' && (
          <ProfileWallet
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            onEnterQuiz={handleStartRealQuiz}
            isQuizActive={isQuizActive}
            currentUser={currentUser}
            onGoogleSignIn={async () => handleOpenAuthModal(1)}
            onSignOut={async () => {
              try {
                localStorage.removeItem('quizkart_is_authenticated');
                localStorage.removeItem('quizkart_profile_manually_saved');
                localStorage.setItem('quizkart_current_tab', 'home');
              } catch {}
              setIsUserAuthenticated(false);
              setCurrentTab('home');
              setAuthModalStep(1);
              setIsAuthModalOpen(true);
              await logOutUser();
            }}
            onDeleteAccount={async () => {
              try {
                localStorage.removeItem('quizkart_is_authenticated');
                localStorage.removeItem('quizkart_profile_manually_saved');
                localStorage.setItem('quizkart_current_tab', 'home');
              } catch {}
              setIsUserAuthenticated(false);
              setCurrentTab('home');
              await logOutUser();
              setAuthModalStep(1);
              setIsAuthModalOpen(true);
            }}
            onOpenAuthModal={handleOpenAuthModal}
            onShowNotice={showTunedToast}
            deposits={deposits}
            onAddDeposit={handleAddDeposit}
            withdrawals={withdrawals}
            onAddWithdrawal={handleAddWithdrawal}
            quizAttempts={userQuizAttempts}
            onOpenDeposit={() => {
              if (userProfile.isBlocked) {
                soundFx.playWrong();
                showTunedToast('Account Blocked by Admin: Deposits are restricted for your account.');
                return;
              }
              setCurrentTab('deposit');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenWithdraw={() => {
              if (userProfile.isBlocked) {
                soundFx.playWrong();
                showTunedToast('Account Blocked by Admin: Withdrawals are restricted for your account.');
                return;
              }
              setCurrentTab('withdrawal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenEditProfile={() => {
              setCurrentTab('edit_profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenHistory={(tab) => {
              setHistoryInitialTab(tab || 'deposits');
              setCurrentTab('history');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 6: DEDICATED FULL-PAGE DEPOSIT SCREEN */}
        {currentTab === 'deposit' && (
          <DepositPage
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            deposits={deposits}
            onAddDeposit={handleAddDeposit}
            onBackToDashboard={() => {
              setCurrentTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onBackToProfile={() => {
              setCurrentTab('profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenHistory={() => {
              setHistoryInitialTab('deposits');
              setCurrentTab('history');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            activeDepositQr={activeDepositQr}
          />
        )}

        {/* VIEW 7: DEDICATED FULL-PAGE TRANSACTION HISTORY SCREEN */}
        {currentTab === 'history' && (
          <TransactionHistoryPage
            userProfile={userProfile}
            deposits={deposits}
            withdrawals={withdrawals}
            initialTab={historyInitialTab}
            onBack={() => {
              setCurrentTab('profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 8: DEDICATED FULL-PAGE EDIT PROFILE SCREEN (IMAGE 1 REF) */}
        {currentTab === 'edit_profile' && (
          <EditProfilePage
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            onRedirectToChangeEmail={() => {
              setIsEmailChangeMode(true);
              setAuthModalStep(1);
              setIsAuthModalOpen(true);
            }}
            onBack={() => {
              setCurrentTab('profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 9: DEDICATED FULL-PAGE WITHDRAWAL SCREEN (IMAGES 5 & 6 REF) */}
        {currentTab === 'withdrawal' && (
          <WithdrawalPage
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            onSubmitWithdrawal={handleAddWithdrawal}
            existingWithdrawals={withdrawals}
            onBackToProfile={() => {
              setCurrentTab('profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenHistory={() => {
              setHistoryInitialTab('withdrawals');
              setCurrentTab('history');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 10: DEDICATED FULL-PAGE CUSTOMER SUPPORT SCREEN */}
        {currentTab === 'support' && (
          <SupportPage
            userProfile={userProfile}
            deposits={deposits}
            withdrawals={withdrawals}
            userQuizAttempts={userQuizAttempts}
            onBack={() => {
              setCurrentTab('transparency');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onViewTickets={() => {
              setCurrentTab('support_tickets');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onShowToast={showTunedToast}
          />
        )}

        {/* VIEW 11: DEDICATED FULL-PAGE SUPPORT TICKETS SCREEN */}
        {currentTab === 'support_tickets' && (
          <SupportTicketsPage
            userProfile={userProfile}
            onBack={() => {
              setCurrentTab('support');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onShowToast={showTunedToast}
          />
        )}
      </main>

      {/* Wallet Entry Confirmation Modal */}
      <WalletEntryConfirmModal
        isOpen={isWalletConfirmModalOpen}
        onClose={() => setIsWalletConfirmModalOpen(false)}
        entryFee={activeContestEntryFee}
        walletBalance={userProfile.walletBalance}
        onConfirmAndJoin={handleConfirmWalletEntry}
        onAddFunds={handleAddFundsFromModal}
      />

      {/* 3-Step Google Authentication & Profile Setup Full-Page View */}
      <AuthModal
        isOpen={isAuthModalOpen && !isAdminPageActive && !isAdminAuthModalOpen}
        onClose={() => {
          if (isUserAuthenticated || isEmailChangeMode) {
            setIsAuthModalOpen(false);
            setIsEmailChangeMode(false);
          }
        }}
        initialStep={authModalStep}
        onGoogleSignInPopup={signInWithGoogle}
        onCompleteSignUp={handleCompleteSignUp}
        onUpdateEmailOnly={handleUpdateEmailOnly}
        isEmailChangeMode={isEmailChangeMode}
        prefilledEmail={userProfile.email}
        prefilledName={userProfile.name}
        prefilledMobile={userProfile.mobile}
        prefilledCountryCode={userProfile.countryCode || '+91'}
        prefilledAvatar={userProfile.avatarUrl}
        isAlreadySignedUp={Boolean(userProfile.isRegistered && userProfile.email)}
      />

      {/* Secret Admin Authentication Modal */}
      <AdminAuthModal
        isOpen={isAdminAuthModalOpen}
        onClose={() => {
          setIsAdminAuthModalOpen(false);
          clearAdminHash();
        }}
        onSuccess={() => {
          setIsAdminAuthModalOpen(false);
          setIsAdminPageActive(true);
        }}
      />

      {/* Floating Notice Toast */}
      {toastNotice && (
        <div
          id="welcome-toast-banner"
          style={{
            background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
            color: '#FFFFFF'
          }}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center px-5 py-3 text-white rounded-xl shadow-2xl text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-bottom-2"
        >
          <span>{toastNotice}</span>
        </div>
      )}
    </div>
  );
}
