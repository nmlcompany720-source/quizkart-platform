/**
 * Safe clipboard helper that works reliably across browsers and inside sandboxed iframes.
 * Prevents uncaught "Failed to execute 'writeText' on 'Clipboard': Document is not focused" errors.
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  // Helper: Synchronous textarea fallback using document.execCommand('copy')
  const fallbackCopy = (content: string): boolean => {
    try {
      if (typeof document === 'undefined' || !document.body) {
        return false;
      }
      const textarea = document.createElement('textarea');
      textarea.value = content;
      // Position off-screen / fixed so it doesn't trigger scroll
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textarea);
      
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  };

  // Try navigator.clipboard.writeText only if supported and document has focus
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    const isFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' 
      ? document.hasFocus() 
      : true;

    if (isFocused) {
      try {
        await navigator.clipboard.writeText(text).catch(() => {
          // Suppress unhandled rejection if focus was lost mid-operation
          return fallbackCopy(text);
        });
        return true;
      } catch {
        return fallbackCopy(text);
      }
    } else {
      // Document is not focused (e.g. iframe context or active popup)
      return fallbackCopy(text);
    }
  }

  return fallbackCopy(text);
}
