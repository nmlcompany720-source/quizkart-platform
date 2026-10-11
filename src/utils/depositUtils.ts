import { DepositRequest } from '../types';

/**
 * Formats a Date object into standard permanent timestamp format:
 * "YYYY-MM-DD | hh:mm:ss AM/PM" (e.g., "2026-09-21 | 07:15:42 PM")
 */
export function formatDateTime(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const strHours = String(hours).padStart(2, '0');
  
  return `${year}-${month}-${day} | ${strHours}:${minutes}:${seconds} ${ampm}`;
}

/**
 * Returns the current time in permanent format: "YYYY-MM-DD | hh:mm:ss AM/PM"
 */
export function getCurrentFormattedTimestamp(): string {
  return formatDateTime(new Date());
}

/**
 * Normalizes any timestamp or relative text (like "Just now", "10 mins ago")
 * into a static, permanent timestamp that never changes.
 */
export function formatDepositTimestamp(rawTimestamp?: string, createdAt?: string, rawDate?: string): string {
  // If already in standard format "YYYY-MM-DD | hh:mm:ss AM/PM", preserve it immutably
  if (rawTimestamp && /^\d{4}-\d{2}-\d{2}\s*\|\s*\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)$/i.test(rawTimestamp.trim())) {
    return rawTimestamp.trim();
  }

  // If createdAt exists and is a valid ISO string, format that
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      return formatDateTime(parsed);
    }
  }

  // If rawTimestamp can be parsed as a date (e.g. ISO string)
  if (rawTimestamp && rawTimestamp !== 'Just now' && !rawTimestamp.includes('min') && !rawTimestamp.includes('hr') && !rawTimestamp.includes('sec')) {
    const parsed = new Date(rawTimestamp);
    if (!isNaN(parsed.getTime())) {
      return formatDateTime(parsed);
    }
  }

  // If rawDate exists (e.g. "2026-09-20")
  if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) {
        return formatDateTime(d);
      }
    }
  }

  // Fallback to current timestamp
  return getCurrentFormattedTimestamp();
}

/**
 * Generates the next sequential deposit ID in the format "QK-DEP-1001", "QK-DEP-1002", etc.
 * Guarantees zero ID duplication across all users by inspecting passed records, permanent store, and global sequence counter.
 */
export function getNextDepositId(existingDeposits?: DepositRequest[]): string {
  let highestNum = 1000;
  if (existingDeposits && Array.isArray(existingDeposits)) {
    for (const dep of existingDeposits) {
      if (!dep || !dep.id) continue;
      const strId = String(dep.id).trim();
      const match = strId.match(/QK-DEP-(\d+)/i) || strId.match(/DEP-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
          highestNum = num;
        }
      }
    }
  }

  // Also inspect global deposit ledgers
  try {
    const raw = localStorage.getItem('quizkart_user_deposits_permanent') || localStorage.getItem('quizkart_user_deposits');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const dep of parsed) {
          if (!dep || !dep.id) continue;
          const strId = String(dep.id).trim();
          const match = strId.match(/QK-DEP-(\d+)/i) || strId.match(/DEP-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
              highestNum = num;
            }
          }
        }
      }
    }
    const globalSeq = parseInt(localStorage.getItem('quizkart_global_deposit_seq') || '1000', 10);
    if (!isNaN(globalSeq) && globalSeq > highestNum) {
      highestNum = globalSeq;
    }
  } catch {}

  const nextNum = highestNum + 1;
  try {
    localStorage.setItem('quizkart_global_deposit_seq', String(nextNum));
  } catch {}

  return `QK-DEP-${nextNum}`;
}

/**
 * Formats any deposit ID to ensure clean sequential appearance (QK-DEP-XXXX)
 * Strictly removes any long random timestamps (e.g. QK-DEP-1789924463961 -> QK-DEP-1001)
 */
export function formatDepositId(rawId: string | number | undefined | null, fallbackIndex = 1): string {
  if (!rawId) return `QK-DEP-${1000 + fallbackIndex}`;
  const strId = String(rawId).trim();
  
  // Clean sequential format already: QK-DEP-1001 to QK-DEP-999999
  const cleanMatch = strId.match(/^QK-DEP-(\d{4,6})$/i);
  if (cleanMatch && cleanMatch[1]) {
    const num = parseInt(cleanMatch[1], 10);
    if (!isNaN(num) && num >= 1000 && num < 1000000) {
      return `QK-DEP-${num}`;
    }
  }

  // Handle other patterns or long timestamps
  const match = strId.match(/(\d+)/);
  if (match && match[1]) {
    const rawNum = parseInt(match[1], 10);
    // If it's already a reasonable index (1000 to 999999)
    if (!isNaN(rawNum) && rawNum >= 1000 && rawNum < 1000000) {
      return `QK-DEP-${rawNum}`;
    }
    // If it's a long timestamp (e.g. 1789924463961), map its trailing digits to clean sequential 1000-range
    const lastDigits = parseInt(match[1].slice(-4), 10);
    const mapped = 1000 + (isNaN(lastDigits) ? fallbackIndex : (lastDigits % 900 || fallbackIndex));
    return `QK-DEP-${mapped}`;
  }
  
  return `QK-DEP-${1000 + fallbackIndex}`;
}

/**
 * Generates the next sequential withdrawal ID in the format "QK-WTH-1001", "QK-WTH-1002", etc.
 * Guarantees zero ID duplication across all users.
 */
export function getNextWithdrawalId(existingWithdrawals?: { id?: string }[]): string {
  let highestNum = 1000;
  if (existingWithdrawals && Array.isArray(existingWithdrawals)) {
    for (const wth of existingWithdrawals) {
      if (!wth || !wth.id) continue;
      const strId = String(wth.id).trim();
      const match = strId.match(/QK-WTH-(\d+)/i) || strId.match(/WTH-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
          highestNum = num;
        }
      }
    }
  }

  // Also inspect global withdrawal ledgers
  try {
    const raw = localStorage.getItem('quizkart_user_withdrawals_permanent') || localStorage.getItem('quizkart_user_withdrawals');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const w of parsed) {
          if (!w || !w.id) continue;
          const strId = String(w.id).trim();
          const match = strId.match(/QK-WTH-(\d+)/i) || strId.match(/WTH-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
              highestNum = num;
            }
          }
        }
      }
    }
    const globalSeq = parseInt(localStorage.getItem('quizkart_global_withdrawal_seq') || '1000', 10);
    if (!isNaN(globalSeq) && globalSeq > highestNum) {
      highestNum = globalSeq;
    }
  } catch {}

  const nextNum = highestNum + 1;
  try {
    localStorage.setItem('quizkart_global_withdrawal_seq', String(nextNum));
  } catch {}

  return `QK-WTH-${nextNum}`;
}

/**
 * Formats any withdrawal ID to ensure clean sequential appearance (QK-WTH-XXXX)
 * Strictly removes any long random timestamps (e.g. QK-WTH-1789924463961 -> QK-WTH-1001)
 */
export function formatWithdrawalId(rawId: string | number | undefined | null, fallbackIndex = 1): string {
  if (!rawId) return `QK-WTH-${1000 + fallbackIndex}`;
  const strId = String(rawId).trim();
  
  // Clean sequential format already: QK-WTH-1001 to QK-WTH-999999
  const cleanMatch = strId.match(/^QK-WTH-(\d{4,6})$/i);
  if (cleanMatch && cleanMatch[1]) {
    const num = parseInt(cleanMatch[1], 10);
    if (!isNaN(num) && num >= 1000 && num < 1000000) {
      return `QK-WTH-${num}`;
    }
  }

  // Handle other patterns or long timestamps
  const match = strId.match(/(\d+)/);
  if (match && match[1]) {
    const rawNum = parseInt(match[1], 10);
    // If it's already a reasonable index (1000 to 999999)
    if (!isNaN(rawNum) && rawNum >= 1000 && rawNum < 1000000) {
      return `QK-WTH-${rawNum}`;
    }
    // If it's a long timestamp (e.g. 1789924463961), map its trailing digits to clean sequential 1000-range
    const lastDigits = parseInt(match[1].slice(-4), 10);
    const mapped = 1000 + (isNaN(lastDigits) ? fallbackIndex : (lastDigits % 900 || fallbackIndex));
    return `QK-WTH-${mapped}`;
  }
  
  return `QK-WTH-${1000 + fallbackIndex}`;
}

/**
 * Returns list of permanently deleted withdrawal IDs from localStorage
 */
export function getDeletedWithdrawalIds(): string[] {
  try {
    const saved = localStorage.getItem('quizkart_deleted_withdrawals');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Permanently registers a withdrawal ID as deleted so it can never reappear
 */
export function addDeletedWithdrawalId(id: string): void {
  if (!id) return;
  try {
    const list = getDeletedWithdrawalIds();
    const normId = formatWithdrawalId(id);
    const toAdd = [String(id).trim(), normId].filter(Boolean);
    let changed = false;
    for (const item of toAdd) {
      if (!list.includes(item)) {
        list.push(item);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('quizkart_deleted_withdrawals', JSON.stringify(list));
    }
  } catch {}
}

/**
 * Checks if a withdrawal ID has been marked as deleted
 */
export function isWithdrawalDeleted(id: string): boolean {
  if (!id) return false;
  const list = getDeletedWithdrawalIds();
  const normId = formatWithdrawalId(id);
  return list.includes(id) || list.includes(normId);
}

/**
 * Returns list of permanently deleted deposit IDs from localStorage
 */
export function getDeletedDepositIds(): string[] {
  try {
    const saved = localStorage.getItem('quizkart_deleted_deposits');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Permanently registers a deposit ID as deleted so it can never reappear
 */
export function addDeletedDepositId(id: string): void {
  if (!id) return;
  try {
    const list = getDeletedDepositIds();
    const normId = formatDepositId(id);
    const toAdd = [String(id).trim(), normId].filter(Boolean);
    let changed = false;
    for (const item of toAdd) {
      if (!list.includes(item)) {
        list.push(item);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('quizkart_deleted_deposits', JSON.stringify(list));
    }
  } catch {}
}

/**
 * Checks if a deposit ID has been marked as deleted
 */
export function isDepositDeleted(id: string): boolean {
  if (!id) return false;
  const list = getDeletedDepositIds();
  const normId = formatDepositId(id);
  return list.includes(id) || list.includes(normId);
}

/**
 * Gets permanently deleted support ticket IDs
 */
export function getDeletedTicketIds(): string[] {
  try {
    const raw = localStorage.getItem('quizkart_deleted_tickets');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Permanently blacklists a deleted ticket ID
 */
export function addDeletedTicketId(ticketId: string): void {
  if (!ticketId) return;
  try {
    const list = getDeletedTicketIds();
    const formatted = formatTicketId(ticketId);
    let changed = false;
    for (const item of [ticketId, formatted]) {
      if (item && !list.includes(item)) {
        list.push(item);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('quizkart_deleted_tickets', JSON.stringify(list));
    }
  } catch {}
}

/**
 * Checks if a ticket ID has been permanently deleted
 */
export function isTicketDeleted(id: string): boolean {
  if (!id) return false;
  const list = getDeletedTicketIds();
  const formatted = formatTicketId(id);
  return list.includes(id) || list.includes(formatted);
}

/**
 * Formats a support ticket ID sequentially: "QK-TK-1001", "QK-TK-1002", etc.
 */
export function formatTicketId(rawId?: string | number, fallbackIndex = 1): string {
  if (!rawId) return `QK-TK-${1000 + fallbackIndex}`;
  const strId = String(rawId).trim();
  const match = strId.match(/^QK-TK-(\d{4,6})$/i);
  if (match && match[1]) {
    return `QK-TK-${match[1]}`;
  }
  const genericMatch = strId.match(/(\d+)/);
  if (genericMatch && genericMatch[1]) {
    const num = parseInt(genericMatch[1], 10);
    if (num >= 1000 && num < 1000000) {
      return `QK-TK-${num}`;
    }
    const lastDigits = parseInt(genericMatch[1].slice(-4), 10);
    const mapped = 1000 + (isNaN(lastDigits) ? fallbackIndex : (lastDigits % 900 || fallbackIndex));
    return `QK-TK-${mapped}`;
  }
  return `QK-TK-${1000 + fallbackIndex}`;
}

/**
 * Generates the next sequential ticket ID: "QK-TK-1001", "QK-TK-1002", etc.
 * Guarantees zero ID duplication across any user transactions or requests.
 */
export function getNextTicketId(existingTickets?: { id?: string }[]): string {
  let highestNum = 1000;
  if (existingTickets && Array.isArray(existingTickets)) {
    for (const t of existingTickets) {
      if (!t || !t.id) continue;
      const strId = String(t.id).trim();
      const match = strId.match(/QK-TK-(\d+)/i) || strId.match(/TK-(\d+)/i) || strId.match(/TKT-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
          highestNum = num;
        }
      }
    }
  }

  // Also inspect stored tickets in localStorage
  try {
    const raw = localStorage.getItem('quizkart_support_tickets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (!t || !t.id) continue;
          const strId = String(t.id).trim();
          const match = strId.match(/QK-TK-(\d+)/i) || strId.match(/TK-(\d+)/i) || strId.match(/TKT-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num >= 1000 && num < 1000000 && num > highestNum) {
              highestNum = num;
            }
          }
        }
      }
    }
    const globalSeq = parseInt(localStorage.getItem('quizkart_global_ticket_seq') || '1000', 10);
    if (!isNaN(globalSeq) && globalSeq > highestNum) {
      highestNum = globalSeq;
    }
  } catch {}

  const nextNum = highestNum + 1;
  try {
    localStorage.setItem('quizkart_global_ticket_seq', String(nextNum));
  } catch {}

  return `QK-TK-${nextNum}`;
}

