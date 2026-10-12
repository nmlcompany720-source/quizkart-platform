import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Check, 
  AlertCircle, 
  Loader2,
  User as UserIcon,
  Phone,
  Mail,
  Lock,
  ArrowRight,
  ChevronDown,
  Search,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { UserProfile } from '../types';
import { soundFx } from '../utils/audio';
import { compressImage } from '../utils/imageCompressor';
import { syncUserProfile } from '../firebase';
import { User } from 'firebase/auth';
import { ALL_COUNTRY_CALLING_CODES } from '../data/countryCallingCodes';
import { DEFAULT_REGISTERED_USERS, isDemoSeedUser } from '../data/quizData';

// Exact Image 1 Linear Gradient
const IMAGE_1_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=160&auto=format&fit=crop&q=80'
];

function resolveStoredPassword(profile: UserProfile): string {
  const raw = profile.passwordStatus || '';
  if (
    raw &&
    raw.trim().length > 0 &&
    !raw.includes('••••') &&
    !raw.includes('......') &&
    !raw.toLowerCase().includes('secured')
  ) {
    return raw.trim();
  }
  try {
    const regRaw = localStorage.getItem('quizkart_registered_users');
    if (regRaw) {
      const list: UserProfile[] = JSON.parse(regRaw);
      if (Array.isArray(list)) {
        const match = list.find(
          (u) =>
            (u.id && profile.id && u.id === profile.id) ||
            (u.email && profile.email && u.email.toLowerCase() === profile.email.toLowerCase())
        );
        if (
          match?.passwordStatus &&
          !match.passwordStatus.includes('••••') &&
          !match.passwordStatus.toLowerCase().includes('secured')
        ) {
          return match.passwordStatus.trim();
        }
      }
    }
  } catch {}
  const seedMatch = DEFAULT_REGISTERED_USERS.find(
    (u) =>
      (u.id && profile.id && u.id === profile.id) ||
      (u.email && profile.email && u.email.toLowerCase() === profile.email.toLowerCase())
  );
  if (seedMatch?.passwordStatus) return seedMatch.passwordStatus;
  return 'rahul@123';
}

interface EditProfilePageProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
  onRedirectToChangeEmail?: () => void;
  currentUser?: User | null;
}

export const EditProfilePage: React.FC<EditProfilePageProps> = ({
  userProfile,
  onUpdateProfile,
  onBack,
  onRedirectToChangeEmail,
  currentUser
}) => {
  // Guarantee persistent initial values so user details never clear or reset automatically
  const [editName, setEditName] = useState<string>(() => {
    if (userProfile.name && userProfile.name.trim()) return userProfile.name;
    try {
      const saved = JSON.parse(localStorage.getItem('quizkart_user_profile') || '{}');
      if (saved.name) return saved.name;
    } catch {}
    return currentUser?.displayName || 'Rahul Sen';
  });

  const [editMobile, setEditMobile] = useState<string>(() => {
    if (userProfile.mobile && userProfile.mobile.trim()) return userProfile.mobile;
    try {
      const saved = JSON.parse(localStorage.getItem('quizkart_user_profile') || '{}');
      if (saved.mobile) return saved.mobile;
    } catch {}
    return '9876543210';
  });

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(() => {
    return userProfile.countryCode || '+91';
  });

  const [editAvatar, setEditAvatar] = useState<string>(() => {
    if (userProfile.avatarUrl && userProfile.avatarUrl.trim()) return userProfile.avatarUrl;
    try {
      const saved = JSON.parse(localStorage.getItem('quizkart_user_profile') || '{}');
      if (saved.avatarUrl) return saved.avatarUrl;
    } catch {}
    return currentUser?.photoURL || AVATAR_PRESETS[0];
  });

  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<'name' | 'mobile' | null>(null);

  // Full-Page Change Password View State
  const [isPasswordViewOpen, setIsPasswordViewOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Email Change Security Reauthentication State
  const [editEmail, setEditEmail] = useState<string>(() => userProfile.email || 'rahul.sen@example.com');
  const [isEmailUnlocked, setIsEmailUnlocked] = useState(false);
  const [isEmailAuthPromptOpen, setIsEmailAuthPromptOpen] = useState(false);
  const [emailVerifyPassword, setEmailVerifyPassword] = useState('');
  const [showEmailVerifyPass, setShowEmailVerifyPass] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Sync non-empty updates if userProfile changes (e.g., after email change redirect) without ever clearing user fields
  useEffect(() => {
    if (userProfile.name && userProfile.name.trim()) {
      setEditName((prev) => prev || userProfile.name);
    }
    if (userProfile.mobile && userProfile.mobile.trim()) {
      setEditMobile((prev) => prev || userProfile.mobile);
    }
    if (userProfile.avatarUrl && userProfile.avatarUrl.trim()) {
      setEditAvatar((prev) => prev || userProfile.avatarUrl!);
    }
    if (userProfile.email && userProfile.email.trim() && !isEmailUnlocked) {
      setEditEmail(userProfile.email);
    }
  }, [userProfile.name, userProfile.mobile, userProfile.avatarUrl, userProfile.email, isEmailUnlocked]);

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

  // Resolve sequential Registration ID for display at the top of Edit Profile (100% synced with Admin Panel)
  const displayRegistrationId = (() => {
    const targetEmail = (userProfile.email || editEmail || '').trim().toLowerCase();
    const targetMobile = (userProfile.mobile || editMobile || '').replace(/\D/g, '');
    const targetId = (userProfile.id && /^USR-\d+$/i.test(userProfile.id.trim())) ? userProfile.id.trim().toUpperCase() : '';

    try {
      const regRaw = localStorage.getItem('quizkart_registered_users');
      const parsedList: UserProfile[] = regRaw ? JSON.parse(regRaw) : [];
      const list = Array.isArray(parsedList)
        ? parsedList.filter((u) => u && !isDemoSeedUser(u))
        : [];

      // Priority 1: Match by email
      if (targetEmail) {
        const emailIdx = list.findIndex((u) => {
          if (!u || !u.email) return false;
          return u.email.trim().toLowerCase() === targetEmail;
        });
        if (emailIdx >= 0) {
          return `USR-${1001 + emailIdx}`;
        }
      }

      // Priority 2: Match by mobile number only if emails do not conflict
      if (targetMobile && targetMobile.length >= 7) {
        const mobIdx = list.findIndex((u) => {
          if (!u || !u.mobile) return false;
          const uMob = u.mobile.replace(/\D/g, '');
          const uEmail = (u.email || '').trim().toLowerCase();
          if (uMob !== targetMobile) return false;
          if (targetEmail && uEmail && targetEmail !== uEmail) return false;
          return true;
        });
        if (mobIdx >= 0) {
          return `USR-${1001 + mobIdx}`;
        }
      }

      // Priority 3: Match by valid USR-XXXX ID only if emails do not conflict
      if (targetId) {
        const idIdx = list.findIndex((u) => {
          if (!u || !u.id) return false;
          const uId = u.id.trim().toUpperCase();
          const uEmail = (u.email || '').trim().toLowerCase();
          if (uId !== targetId) return false;
          if (targetEmail && uEmail && targetEmail !== uEmail) return false;
          return true;
        });
        if (idIdx >= 0) {
          return `USR-${1001 + idIdx}`;
        }
      }
    } catch {}

    return 'USR-1001';
  })();

  // Instant local device image upload
  const handleDeviceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      soundFx.playClick();
      const compressedDataUrl = await compressImage(file, 400, 400, 0.85);
      setEditAvatar(compressedDataUrl);
      setEditError(null);
    } catch {
      setEditError('Could not process selected image. Please choose another image.');
    } finally {
      e.target.value = '';
    }
  };

  // Save Password Handler on Dedicated Full-Page Password Change View
  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPassword) return;
    setPasswordError(null);

    const storedPassword = resolveStoredPassword(userProfile);
    if (!currentPasswordInput.trim()) {
      setPasswordError('Please enter your current password.');
      soundFx.playWrong();
      return;
    }

    if (currentPasswordInput.trim() !== storedPassword) {
      setPasswordError('Current password is incorrect.');
      soundFx.playWrong();
      return;
    }

    if (!newPasswordInput.trim() || newPasswordInput.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      soundFx.playWrong();
      return;
    }

    if (newPasswordInput.trim() !== confirmNewPasswordInput.trim()) {
      setPasswordError('New password and confirm password do not match.');
      soundFx.playWrong();
      return;
    }

    setIsSavingPassword(true);
    soundFx.playClick();

    setTimeout(async () => {
      const cleanNewPass = newPasswordInput.trim();
      const updatedProfile: UserProfile = {
        ...userProfile,
        id: displayRegistrationId,
        name: editName.trim() || userProfile.name,
        mobile: editMobile.replace(/\D/g, '') || userProfile.mobile,
        countryCode: selectedCountryCode,
        avatarUrl: editAvatar,
        passwordStatus: cleanNewPass,
        hasPassword: true,
        isRegistered: true
      };

      onUpdateProfile(updatedProfile);
      try {
        localStorage.setItem('quizkart_user_profile', JSON.stringify(updatedProfile));
        localStorage.setItem('quizkart_profile_manually_saved', 'true');

        // Synchronize new password to Admin Panel registered users database
        const rawUsers = localStorage.getItem('quizkart_registered_users');
        const list: UserProfile[] = rawUsers ? JSON.parse(rawUsers) : [...DEFAULT_REGISTERED_USERS];
        if (Array.isArray(list)) {
          const idx = list.findIndex(
            (u) =>
              u &&
              ((u.id && updatedProfile.id && u.id === updatedProfile.id) ||
                (u.email && updatedProfile.email && u.email.toLowerCase() === updatedProfile.email.toLowerCase()))
          );
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              ...updatedProfile,
              passwordStatus: cleanNewPass,
              hasPassword: true
            };
          } else {
            list.unshift(updatedProfile);
          }
          localStorage.setItem('quizkart_registered_users', JSON.stringify(list));
        }
      } catch {}

      try {
        await syncUserProfile(updatedProfile);
      } catch {}

      setIsSavingPassword(false);
      setIsPasswordViewOpen(false);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setEditSuccessMsg('Password updated and synchronized with Admin Panel!');
      setTimeout(() => setEditSuccessMsg(null), 3500);
      soundFx.playSuccess();
    }, 600);
  };

  // Save Edit Profile Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!editName.trim()) {
      setEditError('Please enter your full name');
      return;
    }

    const cleanMobile = editMobile.replace(/\D/g, '');
    if (cleanMobile.length < 7 || cleanMobile.length > 15) {
      setEditError('Please enter a valid mobile number (7-15 digits)');
      return;
    }

    setIsSaving(true);
    setEditError(null);
    soundFx.playClick();

    setTimeout(async () => {
      const updated: UserProfile = {
        ...userProfile,
        id: displayRegistrationId,
        name: editName.trim(),
        email: (editEmail && editEmail.trim()) ? editEmail.trim() : userProfile.email,
        mobile: cleanMobile,
        countryCode: selectedCountryCode,
        avatarUrl: editAvatar,
        passwordStatus: resolveStoredPassword(userProfile),
        hasPassword: true,
        isRegistered: true,
        address: {
          ...userProfile.address,
          fullName: editName.trim(),
          phoneNumber: cleanMobile
        }
      };

      onUpdateProfile(updated);
      try {
        localStorage.setItem('quizkart_user_profile', JSON.stringify(updated));
        localStorage.setItem('quizkart_profile_manually_saved', 'true');

        const rawUsers = localStorage.getItem('quizkart_registered_users');
        const list: UserProfile[] = rawUsers ? JSON.parse(rawUsers) : [...DEFAULT_REGISTERED_USERS];
        if (Array.isArray(list)) {
          const idx = list.findIndex(
            (u) =>
              u &&
              ((u.id && updated.id && u.id === updated.id) ||
                (u.email && updated.email && u.email.toLowerCase() === updated.email.toLowerCase()))
          );
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...updated };
          } else {
            list.unshift(updated);
          }
          localStorage.setItem('quizkart_registered_users', JSON.stringify(list));
        }
      } catch {}

      try {
        await syncUserProfile(updated);
      } catch (err) {
        console.warn('Could not sync updated profile to Firestore:', err);
      }

      setIsSaving(false);
      soundFx.playSuccess();
      onBack();
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

  // ============================================================================
  // DEDICATED FULL-PAGE CHANGE PASSWORD VIEW
  // ============================================================================
  if (isPasswordViewOpen) {
    return (
      <div
        id="change-password-full-page-view"
        className="fixed inset-0 z-50 min-h-screen w-full bg-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
          <defs>
            <linearGradient id="pw-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5F69EF" />
              <stop offset="35%" stopColor="#417CF4" />
              <stop offset="65%" stopColor="#3A81F5" />
              <stop offset="100%" stopColor="#20A5AC" />
            </linearGradient>
          </defs>
        </svg>

        <div
          className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden my-auto"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {/* Top Accent Strip with IMAGE 1 GRADIENT */}
          <div className="w-full h-2" style={{ background: IMAGE_1_GRADIENT }} />

          <div className="p-6 sm:p-8 space-y-5" style={{ backgroundColor: '#FFFFFF' }}>
            {passwordError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              {/* 1. Current Password Input Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="current-password-input"
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-3.5 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 cursor-pointer flex items-center justify-center"
                  >
                    {showCurrentPass ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 2. Create New Password Input Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Create New Password
                </label>
                <div className="relative">
                  <input
                    id="create-new-password-input"
                    type={showNewPass ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-3.5 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 cursor-pointer flex items-center justify-center"
                  >
                    {showNewPass ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 3. Confirm New Password Input Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-new-password-input"
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmNewPasswordInput}
                    onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                    required
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="pure-white-input w-full pl-3.5 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 cursor-pointer flex items-center justify-center"
                  >
                    {showConfirmPass ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="url(#pw-icon-gradient)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 4. Back and Save Buttons with IMAGE 1 GRADIENT Background */}
              <div className="pt-2 grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  disabled={isSavingPassword}
                  onClick={() => {
                    soundFx.playClick();
                    setPasswordError(null);
                    setIsPasswordViewOpen(false);
                  }}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="py-3.5 px-5 rounded-xl text-white text-xs sm:text-sm font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer text-center disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  id="save-new-password-btn"
                  disabled={isSavingPassword}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="py-3.5 px-5 rounded-xl text-white text-xs sm:text-sm font-bold tracking-wide shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75"
                >
                  {isSavingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN STANDALONE FULL-PAGE EDIT PROFILE VIEW (IMAGE 8)
  // ============================================================================
  return (
    <div
      className="w-full max-w-lg mx-auto py-6 sm:py-10 pb-16"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Hidden file input for instant device camera/gallery upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDeviceImageUpload}
        accept="image/*"
        className="hidden"
        aria-hidden="true"
      />

      {/* Main Standalone Full-Page Card */}
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Top Accent Strip matching IMAGE 1 GRADIENT */}
        <div
          className="w-full h-2"
          style={{ background: IMAGE_1_GRADIENT }}
        />

        <div className="p-6 sm:p-8 space-y-5" style={{ backgroundColor: '#FFFFFF' }}>
          {/* Top Unique Registration ID Display */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ backgroundColor: '#FFFFFF' }}>
            <span className="text-xs font-bold text-slate-600">Registration ID</span>
            <span
              id="edit-profile-registration-id"
              className="text-xs sm:text-sm font-mono font-black tracking-wide"
              style={{
                background: IMAGE_1_GRADIENT,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              {displayRegistrationId}
            </span>
          </div>

          {/* Success Alert */}
          {editSuccessMsg && (
            <div
              className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{editSuccessMsg}</span>
            </div>
          )}

          {/* Error Alert */}
          {editError && (
            <div
              className="p-3.5 rounded-2xl bg-white border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            {/* 1. Avatar Selection Area */}
            <div
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <label className="block text-xs sm:text-sm font-bold text-slate-900">
                Choose Player Avatar
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Primary Avatar Preview with IMAGE 1 GRADIENT Ring & Glow */}
                <div className="relative group shrink-0">
                  <div
                    className="p-[3px] rounded-2xl transition-all duration-200"
                    style={{
                      background: IMAGE_1_GRADIENT,
                      boxShadow: '0 0 16px rgba(74, 125, 243, 0.45)'
                    }}
                  >
                    <div className="w-16 h-16 rounded-[13px] overflow-hidden bg-white p-[1.5px] flex items-center justify-center">
                      {editAvatar ? (
                        <img src={editAvatar} alt="Profile Preview" className="w-full h-full rounded-[11px] object-cover" />
                      ) : (
                        <span className="text-slate-900 font-black text-xl">
                          {editName ? editName.charAt(0).toUpperCase() : 'U'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Instant Camera Trigger */}
                  <button
                    type="button"
                    id="edit-profile-camera-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md cursor-pointer hover:scale-105 active:scale-95 transition-all"
                    style={{ background: IMAGE_1_GRADIENT }}
                    title="Upload photo from device"
                    aria-label="Upload photo from device"
                  >
                    <Camera className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>

                {/* Presets Grid */}
                <div className="flex-1 w-full">
                  <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
                    {AVATAR_PRESETS.map((url, idx) => {
                      const isSelected = editAvatar === url;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setEditAvatar(url);
                          }}
                          className={`relative aspect-square rounded-2xl p-[2.5px] transition-all duration-200 cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'scale-105 z-10'
                              : 'bg-white border border-slate-200 opacity-80 hover:opacity-100 hover:border-blue-400'
                          }`}
                          style={
                            isSelected
                              ? {
                                  background: IMAGE_1_GRADIENT,
                                  boxShadow: '0 0 14px rgba(74, 125, 243, 0.45)'
                                }
                              : { background: '#FFFFFF' }
                          }
                        >
                          <div className="w-full h-full rounded-[13px] overflow-hidden bg-white p-[1px]">
                            {url ? (
                              <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full rounded-[11px] object-cover" />
                            ) : null}
                          </div>
                          {isSelected && (
                            <span
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center shadow-xs"
                              style={{ background: IMAGE_1_GRADIENT }}
                            >
                              <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Full Name Input */}
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-900">
                Full Name
              </label>
              <div
                className="relative rounded-xl transition-all duration-150"
                style={
                  focusedField === 'name'
                    ? {
                        padding: '2px',
                        background: IMAGE_1_GRADIENT,
                        boxShadow: '0 0 12px rgba(74, 125, 243, 0.25)'
                      }
                    : { padding: '0px', background: '#FFFFFF' }
                }
              >
                <div className="relative bg-white rounded-[10px]" style={{ backgroundColor: '#FFFFFF' }}>
                  <input
                    type="text"
                    required
                    value={editName}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your full name"
                    style={{ backgroundColor: '#FFFFFF' }}
                    className={`pure-white-input w-full pl-10 pr-4 py-3 bg-white rounded-[10px] text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-semibold outline-none transition-all ${
                      focusedField === 'name' ? 'border-transparent' : 'border border-slate-300'
                    }`}
                  />
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* 3. Mobile Number Input Field with Country Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-900">
                Mobile Number
              </label>
              <div className="flex items-stretch gap-2.5">
                <div className="relative" ref={countryDropdownRef}>
                  <button
                    type="button"
                    id="country-code-selector"
                    onClick={() => setIsCountryDropdownOpen((prev) => !prev)}
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="h-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900 select-none shrink-0 shadow-2xs cursor-pointer"
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
                        {filteredCountries.map((item) => (
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
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Digits Input */}
                <div
                  className="relative flex-1 rounded-xl transition-all duration-150"
                  style={
                    focusedField === 'mobile'
                      ? {
                          padding: '2px',
                          background: IMAGE_1_GRADIENT,
                          boxShadow: '0 0 12px rgba(74, 125, 243, 0.25)'
                        }
                      : { padding: '0px', background: '#FFFFFF' }
                  }
                >
                  <div className="relative h-full bg-white rounded-[10px]" style={{ backgroundColor: '#FFFFFF' }}>
                    <input
                      type="tel"
                      required
                      value={editMobile}
                      onFocus={() => setFocusedField('mobile')}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => setEditMobile(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={15}
                      style={{ backgroundColor: '#FFFFFF' }}
                      className={`pure-white-input w-full h-full pl-10 pr-4 py-3 bg-white rounded-[10px] text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-semibold outline-none transition-all font-mono ${
                        focusedField === 'mobile' ? 'border-transparent' : 'border border-slate-300'
                      }`}
                    />
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. EMAIL CHANGE OPTION: Email Field Box with Security Reauthentication */}
            <div className="space-y-2">
              <label className="block text-xs sm:text-sm font-bold text-slate-900">
                Email Address
              </label>
              <div className="relative flex items-center">
                <input
                  ref={emailInputRef}
                  id="edit-profile-email-input"
                  type="email"
                  readOnly={!isEmailUnlocked}
                  value={editEmail}
                  onChange={(e) => {
                    if (isEmailUnlocked) {
                      setEditEmail(e.target.value);
                    }
                  }}
                  placeholder="Enter Email Address"
                  style={{ backgroundColor: '#FFFFFF' }}
                  className={`pure-white-input w-full pl-10 pr-13 py-3 bg-white rounded-xl text-xs sm:text-sm text-slate-800 font-semibold outline-none transition-all ${
                    isEmailUnlocked
                      ? 'border-2 border-blue-500 ring-2 ring-blue-500/15'
                      : 'border border-slate-300'
                  }`}
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  id="edit-profile-email-redirect-btn"
                  onClick={() => {
                    soundFx.playClick();
                    if (!isEmailUnlocked) {
                      setEmailVerifyError(null);
                      setEmailVerifyPassword('');
                      setIsEmailAuthPromptOpen(true);
                    } else {
                      const cleanNewEmail = editEmail.trim();
                      if (!cleanNewEmail || !cleanNewEmail.includes('@')) {
                        setEditError('Please enter a valid email address.');
                        soundFx.playWrong();
                        return;
                      }
                      const updated: UserProfile = {
                        ...userProfile,
                        id: displayRegistrationId,
                        email: cleanNewEmail,
                        isRegistered: true
                      };
                      onUpdateProfile(updated);
                      setIsEmailUnlocked(false);
                      setEditSuccessMsg('Email address updated and synced with Admin Panel!');
                      setTimeout(() => setEditSuccessMsg(null), 3500);
                      soundFx.playSuccess();
                    }
                  }}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg text-white flex items-center justify-center shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                  title={isEmailUnlocked ? 'Save New Email' : 'Verify Password to Edit Email'}
                  aria-label="Change Email"
                >
                  {isEmailUnlocked ? (
                    <Check className="w-4 h-4 text-white stroke-[2.5]" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-white stroke-[2.5]" />
                  )}
                </button>
              </div>

              {/* Current Password Security Reauthentication Prompt for Email Editing */}
              {isEmailAuthPromptOpen && !isEmailUnlocked && (
                <div
                  id="email-reauth-password-prompt"
                  className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3 animate-in fade-in duration-150"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Enter Current Password to Unlock Email Editing
                    </span>
                  </div>

                  {emailVerifyError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{emailVerifyError}</span>
                    </div>
                  )}

                  <div className="relative flex items-center">
                    <input
                      id="email-verify-current-password-input"
                      type={showEmailVerifyPass ? 'text' : 'password'}
                      value={emailVerifyPassword}
                      onChange={(e) => {
                        setEmailVerifyPassword(e.target.value);
                        if (emailVerifyError) setEmailVerifyError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const storedPass = resolveStoredPassword(userProfile);
                          if (!emailVerifyPassword.trim() || emailVerifyPassword.trim() !== storedPass) {
                            setEmailVerifyError('Invalid password. Email editing is blocked.');
                            soundFx.playWrong();
                            return;
                          }
                          soundFx.playSuccess();
                          setIsEmailUnlocked(true);
                          setIsEmailAuthPromptOpen(false);
                          setEmailVerifyError(null);
                          setEmailVerifyPassword('');
                          setTimeout(() => {
                            emailInputRef.current?.focus();
                            emailInputRef.current?.select();
                          }, 50);
                        }
                      }}
                      placeholder="Enter Current Password"
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="pure-white-input w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailVerifyPass(!showEmailVerifyPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setIsEmailAuthPromptOpen(false);
                        setEmailVerifyError(null);
                        setEmailVerifyPassword('');
                      }}
                      className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="verify-email-password-btn"
                      onClick={() => {
                        const storedPass = resolveStoredPassword(userProfile);
                        if (!emailVerifyPassword.trim() || emailVerifyPassword.trim() !== storedPass) {
                          setEmailVerifyError('Invalid password. Email editing is blocked.');
                          soundFx.playWrong();
                          return;
                        }
                        soundFx.playSuccess();
                        setIsEmailUnlocked(true);
                        setIsEmailAuthPromptOpen(false);
                        setEmailVerifyError(null);
                        setEmailVerifyPassword('');
                        setTimeout(() => {
                          emailInputRef.current?.focus();
                          emailInputRef.current?.select();
                        }, 50);
                      }}
                      style={{ background: IMAGE_1_GRADIENT }}
                      className="py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer"
                    >
                      Verify Password
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. PASSWORD CHANGE OPTION: Password Field Box with Icon Button Styled with Image 1 Gradient */}
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-900">
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  type="password"
                  readOnly
                  value={resolveStoredPassword(userProfile)}
                  style={{ backgroundColor: '#FFFFFF' }}
                  className="pure-white-input w-full pl-10 pr-13 py-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold outline-none"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  id="edit-profile-password-change-btn"
                  onClick={() => {
                    soundFx.playClick();
                    setPasswordError(null);
                    setCurrentPasswordInput('');
                    setNewPasswordInput('');
                    setConfirmNewPasswordInput('');
                    setIsPasswordViewOpen(true);
                  }}
                  style={{ background: IMAGE_1_GRADIENT }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg text-white flex items-center justify-center shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                  title="Change Password"
                  aria-label="Change Password"
                >
                  <KeyRound className="w-4 h-4 text-white stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* 6. Action Buttons: Back and Sign Up / Save */}
            <div className="pt-2 grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  onBack();
                }}
                disabled={isSaving}
                className="py-3.5 px-5 rounded-xl text-white text-xs sm:text-sm font-bold tracking-wide shadow-md hover:opacity-95 hover:shadow-lg active:scale-[0.99] transition-all duration-200 cursor-pointer text-center disabled:opacity-50"
                style={{ background: IMAGE_1_GRADIENT }}
              >
                Back
              </button>

              <button
                type="submit"
                id="save-profile-btn"
                disabled={isSaving}
                className="py-3.5 px-5 rounded-xl text-white text-xs sm:text-sm font-bold tracking-wide shadow-md hover:opacity-95 hover:shadow-lg active:scale-[0.99] transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75"
                style={{ background: IMAGE_1_GRADIENT }}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
