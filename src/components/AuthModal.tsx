import React, { useState, useRef, useEffect } from 'react';
import { 
  Lock, 
  User, 
  Camera, 
  Loader2, 
  AlertCircle,
  ChevronDown,
  Search,
  ArrowRight,
  Sparkles,
  Heart
} from 'lucide-react';
import { soundFx } from '../utils/audio';
import { compressImage } from '../utils/imageCompressor';
import { ALL_COUNTRY_CALLING_CODES } from '../data/countryCallingCodes';
import { DEFAULT_REGISTERED_USERS, isDemoSeedUser } from '../data/quizData';
import { UserProfile } from '../types';
import { LegalPolicyPage } from './LegalPolicyPage';

const IMAGE_1_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=160&auto=format&fit=crop&q=80'
];

function deriveFullNameFromEmail(email: string): string {
  const prefix = (email || '').split('@')[0] || '';
  const cleaned = prefix.replace(/[0-9]+/g, ' ').replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getDeletedUsersWithin30Days(): UserProfile[] {
  try {
    const raw = localStorage.getItem('quizkart_deleted_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        return parsed.filter((u: UserProfile) => {
          if (!u) return false;
          const ts = u.deletedTimestampMs || now;
          return now - ts < THIRTY_DAYS_MS;
        });
      }
    }
  } catch {}
  return [];
}

function isAccountDeletedWithin30Days(emailInput?: string, mobileInput?: string): boolean {
  const deletedList = getDeletedUsersWithin30Days();
  if (deletedList.length === 0) return false;

  const cleanEmail = (emailInput || '').trim().toLowerCase();
  const cleanMobile = (mobileInput || '').replace(/\D/g, '');

  return deletedList.some((u) => {
    const uEmail = (u.email || '').trim().toLowerCase();
    const uMobile = (u.mobile || '').replace(/\D/g, '');
    if (cleanEmail && uEmail && cleanEmail === uEmail) {
      return true;
    }
    if (cleanMobile && cleanMobile.length >= 7 && uMobile && cleanMobile === uMobile) {
      return true;
    }
    return false;
  });
}

function getAllDatabaseUsers(): UserProfile[] {
  const deletedList = getDeletedUsersWithin30Days();
  const isDeletedUser = (u: UserProfile) => {
    if (!u || isDemoSeedUser(u)) return true;
    const uEmail = (u.email || '').trim().toLowerCase();
    const uMobile = (u.mobile || '').replace(/\D/g, '');
    return deletedList.some((del) => {
      const delEmail = (del.email || '').trim().toLowerCase();
      const delMobile = (del.mobile || '').replace(/\D/g, '');
      if (u.id && del.id && u.id === del.id) return true;
      if (uEmail && delEmail && uEmail === delEmail) return true;
      if (uMobile && delMobile && uMobile === delMobile) return true;
      return false;
    });
  };

  const map = new Map<string, UserProfile>();
  try {
    const raw = localStorage.getItem('quizkart_registered_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((u: UserProfile) => {
          if (u && u.email && !isDeletedUser(u)) {
            map.set(u.email.trim().toLowerCase(), u);
          }
        });
      }
    }
  } catch {}
  try {
    const activeRaw = localStorage.getItem('quizkart_user_profile');
    if (activeRaw) {
      const activeUser: UserProfile = JSON.parse(activeRaw);
      if (activeUser && activeUser.email && activeUser.isRegistered && !isDeletedUser(activeUser)) {
        map.set(activeUser.email.trim().toLowerCase(), activeUser);
      }
    }
  } catch {}
  return Array.from(map.values());
}

function findExistingUserByEmail(emailInput: string): UserProfile | null {
  const clean = (emailInput || '').trim().toLowerCase();
  if (!clean) return null;
  const allUsers = getAllDatabaseUsers();
  const directMatch = allUsers.find((u) => u && u.email && u.email.trim().toLowerCase() === clean);
  return directMatch || null;
}

function getExpectedPasswordForUser(user: UserProfile): string {
  const raw = user.passwordStatus || '';
  if (
    raw &&
    raw.trim().length > 0 &&
    !raw.includes('••••') &&
    !raw.includes('......') &&
    !raw.toLowerCase().includes('secured')
  ) {
    return raw.trim();
  }
  const lowerEmail = (user.email || '').toLowerCase();
  const lowerName = (user.name || '').toLowerCase();
  if (lowerEmail.includes('nmlcompany720') || lowerName.includes('admin')) return 'admin@720';
  if (lowerEmail.includes('priya') || lowerName.includes('priya')) return 'priya@123';
  if (lowerEmail.includes('aakash') || lowerName.includes('aakash')) return 'aakash@123';
  if (lowerEmail.includes('sneha') || lowerName.includes('sneha')) return 'sneha@123';
  if (lowerEmail.includes('rohan') || lowerName.includes('rohan')) return 'rohan@123';
  if (lowerEmail.includes('rahul') || lowerName.includes('rahul')) return 'rahul@123';
  return 'player@123';
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: 1 | 2 | 3;
  onGoogleSignInPopup?: () => Promise<{ user: any; accessToken: string | null } | null>;
  onCompleteSignUp: (userData: {
    email: string;
    password?: string;
    name: string;
    mobile: string;
    countryCode?: string;
    avatarUrl?: string;
    isExistingLogin?: boolean;
  }) => Promise<void>;
  onUpdateEmailOnly?: (newEmail: string) => Promise<void> | void;
  isEmailChangeMode?: boolean;
  prefilledEmail?: string;
  prefilledName?: string;
  prefilledMobile?: string;
  prefilledCountryCode?: string;
  prefilledAvatar?: string;
  isAlreadySignedUp?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialStep = 1,
  onCompleteSignUp,
  onUpdateEmailOnly,
  isEmailChangeMode = false,
  prefilledEmail = '',
  prefilledName = '',
  prefilledMobile = '',
  prefilledCountryCode = '+91',
  prefilledAvatar = ''
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [name, setName] = useState<string>(prefilledName || '');
  const [mobile, setMobile] = useState<string>('');
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(prefilledCountryCode || '+91');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState<boolean>(false);
  const [countrySearch, setCountrySearch] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(prefilledAvatar || AVATAR_PRESETS[0]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [comingSoonToast, setComingSoonToast] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [policyModalType, setPolicyModalType] = useState<'privacy' | 'terms' | null>(null);
  const [isExistingUser, setIsExistingUser] = useState<boolean>(false);
  const [matchedDatabaseUser, setMatchedDatabaseUser] = useState<UserProfile | null>(null);
  const [activeAuthMethod, setActiveAuthMethod] = useState<'email' | 'google'>('email');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      setAuthError(null);
      setComingSoonToast(false);
      setAgreedToTerms(false);
      setPolicyModalType(null);
      setPassword('');
      setSelectedEmail('');
      setMobile('');
      setActiveAuthMethod('email');
      if (prefilledName) setName(prefilledName);
      if (prefilledCountryCode) setSelectedCountryCode(prefilledCountryCode);
      if (prefilledAvatar) setSelectedAvatar(prefilledAvatar);
    }
  }, [isOpen, initialStep, prefilledEmail, prefilledName, prefilledMobile, prefilledCountryCode, prefilledAvatar]);

  // Close country dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };
    if (isCountryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCountryDropdownOpen]);

  if (!isOpen) return null;

  // Step 1: Full-Page Legal Policy View (Completely replaces modal popups)
  if (policyModalType) {
    return (
      <div className="fixed inset-0 z-50 min-h-screen w-full bg-white overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
        <LegalPolicyPage
          policyType={policyModalType}
          onBack={() => {
            setPolicyModalType(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onAcceptAndBack={() => {
            setAgreedToTerms(true);
            if (authError) setAuthError(null);
            setPolicyModalType(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onSwitchPolicy={(nextType) => {
            setPolicyModalType(nextType);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    );
  }

  // Detect in real time whether the entered email belongs to an existing registered user (Sign In) vs New User (Registration)
  const detectedExistingUser = selectedEmail.trim() ? findExistingUserByEmail(selectedEmail.trim()) : null;
  const isPerformingSignIn = Boolean(detectedExistingUser) || isEmailChangeMode;

  // Step 1: "Sign in with Google" Button -> Positions checkbox below Google button and shows "Coming Soon" outside below main card
  const handleGoogleSignInClick = () => {
    soundFx.playClick();
    setAuthError(null);
    setActiveAuthMethod('google');
    setComingSoonToast(true);
    setTimeout(() => {
      setComingSoonToast(false);
    }, 3200);
  };

  // Step 1: Arrow (→) Click Handler inside Email Input Box
  const handleEmailArrowSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    soundFx.playClick();
    setAuthError(null);
    setActiveAuthMethod('email');

    const trimmedEmail = selectedEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      soundFx.playWrong();
      return;
    }

    if (isAccountDeletedWithin30Days(trimmedEmail)) {
      setAuthError('This account was permanently deleted. Re-registration or login using this email is restricted for 30 days.');
      soundFx.playWrong();
      return;
    }

    // If navigated from Edit Profile -> Email Change Option:
    if (isEmailChangeMode && onUpdateEmailOnly) {
      setIsSubmitting(true);
      try {
        await onUpdateEmailOnly(trimmedEmail);
        soundFx.playSuccess();
        setIsSubmitting(false);
        onClose();
      } catch (err: any) {
        setIsSubmitting(false);
        setAuthError(err?.message || 'Could not update email address.');
      }
      return;
    }

    // Check if the entered email exists in the database
    const existingUser = findExistingUserByEmail(trimmedEmail);
    if (existingUser) {
      // EXISTING USER SIGN-IN: Do NOT require or show Terms checkbox; redirect directly to Enter Password screen
      setIsExistingUser(true);
      setMatchedDatabaseUser(existingUser);
      setPassword('');
      setStep(2);
    } else {
      // NEW USER REGISTRATION: Require Terms & Privacy checkbox before allowing user to proceed
      if (!agreedToTerms) {
        setAuthError('Please agree to the Privacy Policy and Terms & Conditions to continue registration.');
        soundFx.playWrong();
        return;
      }
      setIsExistingUser(false);
      setMatchedDatabaseUser(null);
      setPassword('');
      setStep(2);
    }
  };

  // Step 2: Password / Account Creation Submit
  const handlePasswordNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedEmail = selectedEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      soundFx.playWrong();
      return;
    }

    if (isAccountDeletedWithin30Days(trimmedEmail)) {
      setAuthError('This account was permanently deleted. Re-registration or login using this email is restricted for 30 days.');
      soundFx.playWrong();
      return;
    }

    if (!password.trim()) {
      setAuthError(isExistingUser ? 'Please enter your password.' : 'Please create a password.');
      soundFx.playWrong();
      return;
    }

    if (isExistingUser) {
      // Re-verify against database user
      const dbUser = matchedDatabaseUser || findExistingUserByEmail(trimmedEmail);
      if (dbUser) {
        const expectedPassword = getExpectedPasswordForUser(dbUser);
        if (password.trim() !== expectedPassword) {
          setAuthError('Incorrect password. Please enter the correct password for this account.');
          soundFx.playWrong();
          return;
        }

        // Password matches! Authenticate and redirect directly to the main dashboard (skip Profile Setup screen completely)
        setIsSubmitting(true);
        soundFx.playClick();
        try {
          await onCompleteSignUp({
            email: trimmedEmail,
            password: expectedPassword,
            name: dbUser.name,
            mobile: dbUser.mobile,
            countryCode: dbUser.countryCode || '+91',
            avatarUrl: dbUser.avatarUrl || AVATAR_PRESETS[0],
            isExistingLogin: true
          });
          soundFx.playSuccess();
          setIsSubmitting(false);
          onClose();
        } catch (err: any) {
          setIsSubmitting(false);
          setAuthError(err?.message || 'Login failed. Please try again.');
          soundFx.playWrong();
        }
        return;
      }
    }

    // NEW USER: Validate password length, then auto-fill Email, Password, and derived Full Name into Profile Setup (Step 3)
    if (password.trim().length < 6) {
      setAuthError('Password must be at least 6 characters.');
      soundFx.playWrong();
      return;
    }

    soundFx.playClick();
    const derivedName = deriveFullNameFromEmail(trimmedEmail);
    setName(derivedName || 'Player');
    setMobile('');
    setSelectedCountryCode('+91');
    setSelectedAvatar(AVATAR_PRESETS[0]);
    setStep(3);
  };

  // Step 3: Avatar Upload from Device Gallery (Single-click gallery selection)
  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      soundFx.playClick();
      const compressed = await compressImage(file, 200, 200, 0.85);
      setSelectedAvatar(compressed);
    } catch {
      setAuthError('Could not process avatar image. Please try again.');
    } finally {
      e.target.value = '';
    }
  };

  // Step 3: Final Sign Up Submission (Only for New Users)
  const handleFinalSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!agreedToTerms) {
      setAuthError('Please agree to the Privacy Policy and Terms & Conditions to continue.');
      soundFx.playWrong();
      return;
    }

    if (!name.trim()) {
      setAuthError('Please enter your full name.');
      soundFx.playWrong();
      return;
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    if (cleanMobile.length < 7 || cleanMobile.length > 15) {
      setAuthError('Please enter a valid mobile number.');
      soundFx.playWrong();
      return;
    }

    if (isAccountDeletedWithin30Days(selectedEmail.trim(), cleanMobile)) {
      setAuthError('This account was permanently deleted. Re-registration or login using the same email or mobile is restricted for 30 days.');
      soundFx.playWrong();
      return;
    }

    setIsSubmitting(true);
    soundFx.playClick();

    setTimeout(async () => {
      try {
        await onCompleteSignUp({
          email: selectedEmail.trim(),
          password: password.trim(),
          name: name.trim(),
          mobile: cleanMobile,
          countryCode: selectedCountryCode,
          avatarUrl: selectedAvatar,
          isExistingLogin: false
        });
        soundFx.playSuccess();
        setIsSubmitting(false);
        onClose();
      } catch (err: any) {
        setIsSubmitting(false);
        setAuthError(err?.message || 'Failed to complete registration. Please try again.');
        soundFx.playWrong();
      }
    }, 800);
  };

  const filteredCountries = ALL_COUNTRY_CALLING_CODES.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.code.includes(countrySearch)
  );
  const currentCountry =
    ALL_COUNTRY_CALLING_CODES.find((c) => c.code === selectedCountryCode) ||
    ALL_COUNTRY_CALLING_CODES[0];

  return (
    <div
      id="auth-full-page-view"
      className="fixed inset-0 z-50 min-h-screen w-full bg-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Shared SVG Gradient Definitions for IMAGE 1 GRADIENT Icons */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="image1-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5F69EF" />
            <stop offset="35%" stopColor="#417CF4" />
            <stop offset="65%" stopColor="#3A81F5" />
            <stop offset="100%" stopColor="#20A5AC" />
          </linearGradient>
        </defs>
      </svg>

      <div
        className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden relative my-auto"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Top Accent Line with IMAGE 1 GRADIENT */}
        <div className="w-full bg-slate-100 h-2 flex">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: step === 1 ? '33.33%' : step === 2 ? '66.66%' : '100%',
              background: IMAGE_1_GRADIENT
            }}
          />
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-5" style={{ backgroundColor: '#FFFFFF' }}>
          {authError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold leading-relaxed">{authError}</div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 1: INITIAL LOGIN / SIGN-IN BOX (IMAGE 2 & 5)              */}
          {/* ============================================================== */}
          {step === 1 && (
            <div className="space-y-4 py-1">
              {/* Brand Header at the top inside the box */}
              <div className="text-center pb-1">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight inline-flex items-center justify-center select-none">
                  <span
                    style={{
                      background: IMAGE_1_GRADIENT,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent'
                    }}
                  >
                    QuizKart
                  </span>
                </h2>
              </div>

              {/* Clean Header Label directly above the email address box */}
              <div className="space-y-2">
                <h3 className="text-xs sm:text-sm font-semibold text-slate-700 tracking-tight">
                  Sign In / Register
                </h3>

                {/* Email Input Field with Right-Side Arrow (→) Button in Image 1 Gradient */}
                <form onSubmit={handleEmailArrowSubmit} className="relative flex items-center">
                  <input
                    id="auth-initial-email-input"
                    type="email"
                    value={selectedEmail}
                    onFocus={() => setActiveAuthMethod('email')}
                    onChange={(e) => {
                      setSelectedEmail(e.target.value);
                      setActiveAuthMethod('email');
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Enter Email Address"
                    required
                    style={{ backgroundColor: '#FFFFFF', fontWeight: 400 }}
                    className="pure-white-input w-full pl-4 pr-14 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 placeholder:font-normal text-xs sm:text-sm font-normal outline-none focus:border-blue-500 transition-all shadow-2xs"
                  />
                  <button
                    type="submit"
                    id="auth-email-arrow-btn"
                    disabled={isSubmitting}
                    style={{ background: IMAGE_1_GRADIENT }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                    title="Continue"
                    aria-label="Continue with Email"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-white stroke-[2.5]" />
                    )}
                  </button>
                </form>

                {/* Dynamic Policy Checkbox directly under Email Input field when using Email for Registration */}
                {!isPerformingSignIn && activeAuthMethod === 'email' && (
                  <div className="pt-1.5 flex items-start gap-2.5">
                    <input
                      id="auth-terms-privacy-checkbox"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => {
                        soundFx.playClick();
                        setAgreedToTerms(e.target.checked);
                        if (e.target.checked && authError) {
                          setAuthError(null);
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#4A7DF3] focus:ring-[#4A7DF3] accent-[#4A7DF3] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="auth-terms-privacy-checkbox"
                      className="text-xs text-slate-600 leading-relaxed select-none cursor-pointer"
                    >
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          soundFx.playClick();
                          setPolicyModalType('privacy');
                        }}
                        className="font-semibold underline underline-offset-2 cursor-pointer"
                        style={{
                          background: IMAGE_1_GRADIENT,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent'
                        }}
                      >
                        Privacy Policy
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          soundFx.playClick();
                          setPolicyModalType('terms');
                        }}
                        className="font-semibold underline underline-offset-2 cursor-pointer"
                        style={{
                          background: IMAGE_1_GRADIENT,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent'
                        }}
                      >
                        Terms &amp; Conditions
                      </button>
                    </label>
                  </div>
                )}
              </div>

              {/* Clean "OR" Divider between Email Input container and Sign in with Google button */}
              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink-0 mx-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">
                  OR
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Primary "Sign in with Google" Button + Dynamic Policy Checkbox directly attached below when using Google Auth */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  id="modal-google-signin-btn"
                  onClick={handleGoogleSignInClick}
                  className="w-full py-4 px-5 rounded-2xl text-white font-bold text-sm sm:text-base tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-3"
                  style={{ background: IMAGE_1_GRADIENT }}
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </button>

                {!isPerformingSignIn && activeAuthMethod === 'google' && (
                  <div className="pt-1 flex items-start gap-2.5">
                    <input
                      id="auth-terms-privacy-checkbox"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => {
                        soundFx.playClick();
                        setAgreedToTerms(e.target.checked);
                        if (e.target.checked && authError) {
                          setAuthError(null);
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#4A7DF3] focus:ring-[#4A7DF3] accent-[#4A7DF3] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="auth-terms-privacy-checkbox"
                      className="text-xs text-slate-600 leading-relaxed select-none cursor-pointer"
                    >
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          soundFx.playClick();
                          setPolicyModalType('privacy');
                        }}
                        className="font-semibold underline underline-offset-2 cursor-pointer"
                        style={{
                          background: IMAGE_1_GRADIENT,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent'
                        }}
                      >
                        Privacy Policy
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          soundFx.playClick();
                          setPolicyModalType('terms');
                        }}
                        className="font-semibold underline underline-offset-2 cursor-pointer"
                        style={{
                          background: IMAGE_1_GRADIENT,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent'
                        }}
                      >
                        Terms &amp; Conditions
                      </button>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: ENTER PASSWORD (EXISTING USER) OR CREATE EMAIL/PASSWORD (NEW USER) */}
          {/* ============================================================== */}
          {step === 2 && (
            <form onSubmit={handlePasswordNext} className="space-y-5">
              {/* Email Field: "Google Account" for Existing User, "Create Email" for New User */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {isExistingUser ? 'Google Account' : 'Create Email'}
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={selectedEmail}
                    readOnly
                    tabIndex={-1}
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-9 pr-9 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 transition-colors pointer-events-none select-none"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {/* Right-side checkmark icon using IMAGE 1 GRADIENT */}
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#image1-icon-gradient)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Password Field: "Enter Password" for Existing User, "Create Password" for New User */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {isExistingUser ? 'Enter Password' : 'Create Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-3.5 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-80 cursor-pointer flex items-center justify-center"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#image1-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#image1-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Back & Next Buttons with IMAGE 1 GRADIENT (No arrow icon on Next) */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setAuthError(null);
                    setStep(1);
                  }}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="px-5 py-3 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  id="modal-password-next-btn"
                  disabled={isSubmitting}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="flex-1 py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Next</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 3: PROFILE SETUP FULL PAGE (EXCLUSIVELY FOR NEW USERS)    */}
          {/* ============================================================== */}
          {step === 3 && !isExistingUser && (
            <form onSubmit={handleFinalSignUp} className="space-y-5">
              {/* Hidden file input for single-click custom avatar upload from gallery */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleCustomAvatarUpload}
                accept="image/*"
                className="hidden"
              />

              {/* Avatar Selector Presets with IMAGE 1 GRADIENT Border/Glow Ring & Camera Icon */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Choose Player Avatar
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div
                      className="w-15 h-15 rounded-2xl p-[2.5px] flex items-center justify-center"
                      style={{
                        background: IMAGE_1_GRADIENT,
                        boxShadow: '0 0 14px rgba(74, 125, 243, 0.45)'
                      }}
                    >
                      {selectedAvatar ? (
                        <img
                          src={selectedAvatar}
                          alt="Selected avatar"
                          className="w-full h-full rounded-[14px] object-cover bg-white"
                        />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      id="profile-setup-camera-btn"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ background: IMAGE_1_GRADIENT }}
                      className="absolute -bottom-1 -right-1 p-1.5 rounded-full text-white shadow-md hover:opacity-95 transition-all cursor-pointer"
                      title="Upload from Gallery"
                    >
                      <Camera className="w-3 h-3 text-white" />
                    </button>
                  </div>

                  <div className="flex-1 grid grid-cols-6 gap-1.5">
                    {AVATAR_PRESETS.map((preset, idx) => {
                      const isSelected = selectedAvatar === preset;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setSelectedAvatar(preset);
                          }}
                          style={
                            isSelected
                              ? {
                                  background: IMAGE_1_GRADIENT,
                                  padding: '2px',
                                  boxShadow: '0 0 10px rgba(74, 125, 243, 0.45)'
                                }
                              : undefined
                          }
                          className={`w-9 h-9 rounded-xl overflow-hidden transition-all cursor-pointer ${
                            isSelected
                              ? 'scale-105'
                              : 'border-2 border-transparent opacity-70 hover:opacity-100'
                          }`}
                        >
                          {preset ? (
                            <img
                              src={preset}
                              alt={`Avatar option ${idx + 1}`}
                              className="w-full h-full rounded-[10px] object-cover"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Full Name Input (Auto-filled from Email Prefix, Editable, Permanent PURE WHITE Background) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-9 pr-3.5 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold outline-none focus:border-blue-500 transition-colors"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Mobile Number Input with Universal International Country Code Selector Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Mobile Number
                </label>
                <div className="flex items-center gap-2">
                  {/* Universal Country Calling Code Selector Dropdown */}
                  <div className="relative" ref={countryDropdownRef}>
                    <button
                      type="button"
                      id="signup-country-code-selector"
                      onClick={() => setIsCountryDropdownOpen((prev) => !prev)}
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="pure-white-input h-[44px] px-3 bg-white border border-slate-200 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800 hover:border-blue-400 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer shrink-0"
                      aria-label="Select Country Calling Code"
                    >
                      <span className="text-base leading-none">{currentCountry?.flag || '🌐'}</span>
                      <span>{selectedCountryCode}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCountryDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-1.5 w-64 max-h-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden animate-in fade-in duration-150"
                        style={{ backgroundColor: '#FFFFFF' }}
                      >
                        <div className="p-2 border-b border-slate-100 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              placeholder="Search country or code..."
                              value={countrySearch}
                              onChange={(e) => setCountrySearch(e.target.value)}
                              autoFocus
                              style={{ backgroundColor: '#FFFFFF' }}
                              className="pure-white-input w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium"
                            />
                          </div>
                        </div>

                        <div className="overflow-y-auto flex-1 p-1 divide-y divide-slate-50 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                          {filteredCountries.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400 font-medium">
                              No country found
                            </div>
                          ) : (
                            filteredCountries.map((item) => (
                              <button
                                key={`${item.code}-${item.name}`}
                                type="button"
                                onClick={() => {
                                  setSelectedCountryCode(item.code);
                                  setIsCountryDropdownOpen(false);
                                  setCountrySearch('');
                                  soundFx.playClick();
                                }}
                                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between rounded-lg hover:bg-slate-50 cursor-pointer transition-colors ${
                                  selectedCountryCode === item.code
                                    ? 'bg-blue-50/70 text-blue-700 font-bold'
                                    : 'text-slate-700 font-medium'
                                }`}
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <span className="text-base">{item.flag}</span>
                                  <span className="truncate">{item.name}</span>
                                </span>
                                <span className="font-mono font-bold text-slate-500 shrink-0 ml-2">
                                  {item.code}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mobile Number Input (Permanent PURE WHITE Background) */}
                  <input
                    type="tel"
                    placeholder="Enter Mobile Number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input flex-1 px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold outline-none focus:border-blue-500 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Back & Sign Up Buttons with IMAGE 1 GRADIENT */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setStep(2)}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  type="submit"
                  id="modal-signup-submit-btn"
                  disabled={isSubmitting}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Signing Up...</span>
                    </>
                  ) : (
                    <span>Sign Up</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Coming Soon Notice positioned BELOW the main white container card box (outside the main auth card) */}
      {step === 1 && comingSoonToast && (
        <div className="w-full max-w-md mt-4 flex justify-center animate-in fade-in duration-200">
          <div
            id="google-auth-coming-soon-toast"
            style={{ background: IMAGE_1_GRADIENT, color: '#FFFFFF' }}
            className="px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center"
          >
            <span>Coming Soon</span>
          </div>
        </div>
      )}

      {/* Footer Creator Line: visible throughout authentication workflow centrally directly underneath main card */}
      <div className="w-full max-w-md mt-5 pb-2 flex items-center justify-center gap-1.5 text-slate-500 text-xs text-center select-none">
        <span>Crafted for Indian Quizzers with</span>
        <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0" />
      </div>
    </div>
  );
};
