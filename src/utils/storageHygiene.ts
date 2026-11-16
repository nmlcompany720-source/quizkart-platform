import { ActiveContest, BannerSlide, DepositRequest, UserProfile } from '../types';

export function isStorageQuotaError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as any;
  const name = String(errObj?.name || '');
  const code = errObj?.code;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    msg.toLowerCase().includes('exceeded the quota') ||
    msg.toLowerCase().includes('quotaexceeded')
  );
}

/**
 * Strips oversized inline Base64 data URLs from the localStorage mirror ONLY.
 * Real avatars in Firestore and live React state remain 100% untouched.
 */
export function compactRegisteredUsersForLocalCache(users: UserProfile[]): UserProfile[] {
  if (!Array.isArray(users)) return [];
  return users.map((u) => {
    if (!u || typeof u !== 'object') return u;
    const avatar = u.avatarUrl;
    if (typeof avatar === 'string' && avatar.startsWith('data:image/') && avatar.length > 16_000) {
      return { ...u, avatarUrl: '' };
    }
    return u;
  });
}

/**
 * Strips oversized inline Base64 payment screenshots from synced Firestore deposits
 * inside the localStorage mirror ONLY so Firestore holds full screenshots without
 * exhausting the 5MB browser localStorage quota.
 */
export function compactDepositsForLocalCache(deposits: DepositRequest[]): DepositRequest[] {
  if (!Array.isArray(deposits)) return [];
  return deposits.map((d, idx) => {
    if (!d || typeof d !== 'object') return d;
    const screenshot = d.screenshotUrl;
    const isSyncedCloudDoc = Boolean(d.id && !String(d.id).startsWith('local_'));
    if (
      typeof screenshot === 'string' &&
      screenshot.startsWith('data:image/') &&
      (screenshot.length > 40_000 || (isSyncedCloudDoc && idx >= 3 && screenshot.length > 8_000))
    ) {
      return { ...d, screenshotUrl: '' };
    }
    return d;
  });
}

/**
 * Keeps contest metadata in localStorage while excluding oversized Base64 blobs
 * already stored in Firestore so contests + auth share storage cleanly.
 */
export function compactContestsForLocalCache(contests: ActiveContest[]): ActiveContest[] {
  if (!Array.isArray(contests)) return [];
  return contests.map((c) => {
    if (!c || typeof c !== 'object') return c;
    let next = c;
    if (c.cashConfig?.cashImageUrl?.startsWith('data:image/') && c.cashConfig.cashImageUrl.length > 60_000) {
      next = {
        ...next,
        cashConfig: { ...c.cashConfig, cashImageUrl: '' }
      };
    }
    if (next.productConfig?.productImageUrl?.startsWith('data:image/') && next.productConfig.productImageUrl.length > 60_000) {
      next = {
        ...next,
        productConfig: { ...next.productConfig, productImageUrl: '' }
      };
    }
    return next;
  });
}

export function compactBannerSlidesForLocalCache(slides: BannerSlide[]): BannerSlide[] {
  if (!Array.isArray(slides)) return [];
  const rawLen = (() => {
    try {
      return JSON.stringify(slides).length;
    } catch {
      return 0;
    }
  })();
  if (rawLen <= 400_000) return slides;
  return slides.map((s) => {
    if (!s || typeof s !== 'object') return s;
    if (typeof s.imageUrl === 'string' && s.imageUrl.startsWith('data:image/') && s.imageUrl.length > 80_000) {
      return { ...s, imageUrl: '' };
    }
    return s;
  });
}

function reclaimOversizedImageMirrorsOnly(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    // 1. If IndexedDB exists, drop duplicate multi-hundred-KB question cache copy from localStorage
    //    (questionPoolManager keeps the full 30,000+ bank in IndexedDB quizkart_high_capacity_db).
    if (typeof window.indexedDB !== 'undefined') {
      const qRaw = localStorage.getItem('quizkart_questions');
      if (qRaw && qRaw.length > 150_000) {
        localStorage.removeItem('quizkart_questions');
        localStorage.setItem('quizkart_questions_initialized', 'true');
      }
      const basePoolRaw = localStorage.getItem('quizkart_base_contest_pool');
      if (basePoolRaw && basePoolRaw.length > 200_000) {
        localStorage.removeItem('quizkart_base_contest_pool');
      }
    }
  } catch {}

  try {
    // 2. Compact Base64 screenshots/avatars inside localStorage mirrors only (never deleting records)
    const usersRaw = localStorage.getItem('quizkart_registered_users');
    if (usersRaw && usersRaw.length > 120_000) {
      const parsed = JSON.parse(usersRaw);
      if (Array.isArray(parsed)) {
        localStorage.setItem('quizkart_registered_users', JSON.stringify(compactRegisteredUsersForLocalCache(parsed)));
      }
    }
  } catch {}

  try {
    const depRaw = localStorage.getItem('quizkart_admin_deposits');
    if (depRaw && depRaw.length > 120_000) {
      const parsed = JSON.parse(depRaw);
      if (Array.isArray(parsed)) {
        localStorage.setItem('quizkart_admin_deposits', JSON.stringify(compactDepositsForLocalCache(parsed)));
      }
    }
  } catch {}

  try {
    const contestRaw = localStorage.getItem('quizkart_active_contests');
    if (contestRaw && contestRaw.length > 120_000) {
      const parsed = JSON.parse(contestRaw);
      if (Array.isArray(parsed)) {
        localStorage.setItem('quizkart_active_contests', JSON.stringify(compactContestsForLocalCache(parsed)));
      }
    }
  } catch {}

  try {
    const bannerRaw = localStorage.getItem('quizkart_banner_slides');
    if (bannerRaw && bannerRaw.length > 350_000) {
      const parsed = JSON.parse(bannerRaw);
      if (Array.isArray(parsed)) {
        localStorage.setItem('quizkart_banner_slides', JSON.stringify(compactBannerSlidesForLocalCache(parsed)));
      }
    }
  } catch {}
}

/**
 * Safely cleans ONLY redundant bloated image/question mirrors when localStorage is tight.
 * Never deletes localStorage/sessionStorage/IndexedDB or user profiles, registration IDs,
 * wallets, deposits, withdrawals, or contest results.
 */
export function ensureLocalStorageHeadroomForAuth(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const probeKey = '__quizkart_storage_probe__';
    localStorage.setItem(probeKey, 'ok');
    localStorage.removeItem(probeKey);
    // Still compact bloated non-auth Base64/question duplicates when IndexedDB handles questions
    reclaimOversizedImageMirrorsOnly();
  } catch (err) {
    if (isStorageQuotaError(err)) {
      reclaimOversizedImageMirrorsOnly();
    }
  }
}

export function safeSetLocalStorageItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isStorageQuotaError(err)) {
      reclaimOversizedImageMirrorsOnly();
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.warn(`LocalStorage quota notice while caching "${key}":`, retryErr);
        return false;
      }
    }
    console.warn(`LocalStorage write notice for "${key}":`, err);
    return false;
  }
}

export function safeSetLocalStorageJson(key: string, data: unknown): boolean {
  try {
    return safeSetLocalStorageItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Failed to serialize JSON for "${key}":`, err);
    return false;
  }
}
