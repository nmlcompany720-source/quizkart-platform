/**
 * High-performance Image Compression and Document Size Safeguard Utility
 * 
 * Prevents Firestore document write size limit errors (1,048,576 bytes / 1MB)
 * and LocalStorage 5MB quota errors by compressing user-uploaded device images
 * into compact, high-efficiency WebP/JPEG data URLs (typically 30KB - 80KB).
 * Fully supports and preserves animated GIF files (.gif) without flattening
 * when under safe Firestore document limits (<= 450KB).
 */

import { ActiveContest } from '../types';

export const DEFAULT_CASH_IMAGE = 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=80';
export const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';

// Maximum size allowed for an embedded data URL (approx 450 KB base64 = ~330 KB binary, safely within 1MB Firestore limit)
export const MAX_DATA_URL_LENGTH = 450_000;
// Maximum allowed document JSON string length before hard sanitization (750 KB, well below 1MB limit)
export const MAX_DOC_JSON_LENGTH = 750_000;

/**
 * Checks whether an image input or URL is an animated or static GIF.
 */
export function isGifImage(input: File | Blob | string): boolean {
  if (!input) return false;
  if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    return lower.startsWith('data:image/gif') || lower.endsWith('.gif') || lower.includes('.gif?');
  }
  if (typeof input === 'object' && input !== null) {
    if ('type' in input && (input as File | Blob).type === 'image/gif') return true;
    if ('name' in input && typeof (input as File).name === 'string') {
      return (input as File).name.toLowerCase().endsWith('.gif');
    }
  }
  return false;
}

/**
 * Compresses an image File, Blob, or base64 data URL to an optimized JPEG data URL.
 * Automatically preserves animated GIF files without flattening them through canvas
 * as long as they fit comfortably within Firestore's 1MB document limit (<= 450KB).
 * For oversized GIFs (>450KB), safely downscales the first frame through canvas
 * to prevent fatal Firestore payload rejections.
 */
export async function compressImage(
  input: File | Blob | string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.72
): Promise<string> {
  if (!input) return '';

  // If already an external HTTP/HTTPS URL, no compression needed
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return input;
  }

  // If animated GIF file or data URL:
  // If within safe size limit (<= 450KB), preserve all animation frames intact!
  if (isGifImage(input)) {
    if (typeof input === 'string') {
      if (input.length <= MAX_DATA_URL_LENGTH) {
        return input;
      }
      // If oversized GIF string (>450KB base64), fall through to canvas compression
      // so it converts to an optimized ~40KB image rather than crashing Firestore
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
      if (input.size <= 450_000) {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read GIF file'));
          reader.readAsDataURL(input);
        });
      }
      // If oversized GIF file (>450KB), fall through to canvas compression
    }
  }

  // If already a compact data URL, no need to recompress
  if (typeof input === 'string' && input.startsWith('data:image/') && input.length < 50_000) {
    return input;
  }

  // Convert File/Blob to data URL first if necessary
  let sourceUrl = '';
  if (typeof input === 'string') {
    sourceUrl = input;
  } else {
    sourceUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(input);
    });
  }

  return new Promise<string>((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || 800;
        let height = img.naturalHeight || img.height || 600;

        // Calculate scaled dimensions keeping aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback if canvas context is unavailable
          resolve(sourceUrl.length > MAX_DATA_URL_LENGTH ? DEFAULT_CASH_IMAGE : sourceUrl);
          return;
        }

        // Draw with white background in case of transparent PNG/GIF
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let compressed = canvas.toDataURL('image/jpeg', quality);

        // If still too large, perform an aggressive second pass
        if (compressed.length > MAX_DATA_URL_LENGTH) {
          const smallerCanvas = document.createElement('canvas');
          smallerCanvas.width = Math.round(width * 0.7);
          smallerCanvas.height = Math.round(height * 0.7);
          const smallCtx = smallerCanvas.getContext('2d');
          if (smallCtx) {
            smallCtx.fillStyle = '#FFFFFF';
            smallCtx.fillRect(0, 0, smallerCanvas.width, smallerCanvas.height);
            smallCtx.drawImage(img, 0, 0, smallerCanvas.width, smallerCanvas.height);
            compressed = smallerCanvas.toDataURL('image/jpeg', 0.55);
          }
        }

        resolve(compressed);
      } catch (err) {
        console.warn('Image compression warning, using safe fallback:', err);
        resolve(sourceUrl.length > MAX_DATA_URL_LENGTH ? DEFAULT_CASH_IMAGE : sourceUrl);
      }
    };

    img.onerror = () => {
      console.warn('Failed to load image for compression');
      resolve(sourceUrl.length > MAX_DATA_URL_LENGTH ? DEFAULT_CASH_IMAGE : sourceUrl);
    };

    // Only set crossOrigin for external URLs to prevent CORS/taint bugs on local data URLs
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.src = sourceUrl;
  });
}

/**
 * Robust helper specifically for user payment screenshot uploads.
 * Converts File/Blob to a valid, clean, optimized data URL without
 * ever breaking or returning mock placeholder images.
 */
export async function compressScreenshot(file: File | Blob): Promise<string> {
  if (!file) return '';

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl || typeof dataUrl !== 'string') {
        reject(new Error('Could not read image file'));
        return;
      }

      // For small images (< 250KB), resolve directly
      if (file instanceof File && file.size < 250_000 && (file.type.includes('jpeg') || file.type.includes('png') || file.type.includes('webp'))) {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          // Ensure opaque background (replaces alpha with white for transparent screenshots)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          const result = canvas.toDataURL('image/jpeg', 0.82);
          resolve(result || dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Normalizes an image or proof URL so that raw base64 or prefixed strings
 * display reliably in <img> tags.
 */
export function normalizeImageUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  // Raw base64 data without data: URI scheme header
  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`;
  }
  if (trimmed.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${trimmed}`;
  }
  if (trimmed.startsWith('UklGR')) {
    return `data:image/webp;base64,${trimmed}`;
  }
  // Base64 GIF header (GIF87a or GIF89a)
  if (trimmed.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${trimmed}`;
  }
  return trimmed;
}

/**
 * Synchronously sanitizes a contest document to guarantee it NEVER exceeds
 * Firestore's 1MB limit or crashes during writes.
 * Preserves all valid user-uploaded images and animated GIFs (< 450KB) intact.
 * Only replaces excessively oversized data URLs (>450KB base64, like the 18.8MB payload)
 * with safe CDN links to protect both Firestore (1MB max) and LocalStorage (5MB max).
 */
export function sanitizeContestSynchronous(contest: ActiveContest): ActiveContest {
  if (!contest || typeof contest !== 'object') return contest;

  let copy: ActiveContest;
  try {
    copy = JSON.parse(JSON.stringify(contest));
  } catch {
    copy = { ...contest };
  }

  if (copy.cashConfig?.cashImageUrl && typeof copy.cashConfig.cashImageUrl === 'string') {
    if (copy.cashConfig.cashImageUrl.startsWith('data:image/') && copy.cashConfig.cashImageUrl.length > MAX_DATA_URL_LENGTH) {
      console.warn(`[Firestore Safeguard] Sanitizing oversized cash image (${copy.cashConfig.cashImageUrl.length} chars) for contest ${copy.id}`);
      copy.cashConfig.cashImageUrl = DEFAULT_CASH_IMAGE;
    }
  }

  if (copy.productConfig?.productImageUrl && typeof copy.productConfig.productImageUrl === 'string') {
    if (copy.productConfig.productImageUrl.startsWith('data:image/') && copy.productConfig.productImageUrl.length > MAX_DATA_URL_LENGTH) {
      console.warn(`[Firestore Safeguard] Sanitizing oversized product image (${copy.productConfig.productImageUrl.length} chars) for contest ${copy.id}`);
      copy.productConfig.productImageUrl = DEFAULT_PRODUCT_IMAGE;
    }
  }

  return copy;
}

/**
 * Prepares a contest document for Firestore writes:
 * Preserves animated GIFs and custom images intact while ensuring safety.
 * For oversized images (>450KB data URL), compresses them so they can be saved safely.
 */
export async function prepareContestForFirestore(contest: ActiveContest): Promise<ActiveContest> {
  if (!contest || !contest.id) return contest;

  let copy: ActiveContest;
  try {
    copy = JSON.parse(JSON.stringify(contest));
  } catch {
    copy = { ...contest };
  }

  // If cash image is an oversized data URL (> 450KB), compress it down to ~40KB
  if (copy.cashConfig?.cashImageUrl && copy.cashConfig.cashImageUrl.startsWith('data:image/')) {
    if (copy.cashConfig.cashImageUrl.length > MAX_DATA_URL_LENGTH) {
      try {
        const compressed = await compressImage(copy.cashConfig.cashImageUrl, 800, 600, 0.72);
        copy.cashConfig.cashImageUrl = compressed.length <= MAX_DATA_URL_LENGTH ? compressed : DEFAULT_CASH_IMAGE;
      } catch {
        copy.cashConfig.cashImageUrl = DEFAULT_CASH_IMAGE;
      }
    }
  }

  // If product image is an oversized data URL (> 450KB), compress it down to ~40KB
  if (copy.productConfig?.productImageUrl && copy.productConfig.productImageUrl.startsWith('data:image/')) {
    if (copy.productConfig.productImageUrl.length > MAX_DATA_URL_LENGTH) {
      try {
        const compressed = await compressImage(copy.productConfig.productImageUrl, 800, 600, 0.72);
        copy.productConfig.productImageUrl = compressed.length <= MAX_DATA_URL_LENGTH ? compressed : DEFAULT_PRODUCT_IMAGE;
      } catch {
        copy.productConfig.productImageUrl = DEFAULT_PRODUCT_IMAGE;
      }
    }
  }

  // Hard safety check: ensure the document JSON does not exceed Firestore's limit
  try {
    if (JSON.stringify(copy).length > MAX_DOC_JSON_LENGTH) {
      return sanitizeContestSynchronous(copy);
    }
  } catch {}

  return copy;
}
