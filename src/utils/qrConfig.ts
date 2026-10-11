import defaultQrImage from '../assets/images/phonepe_exact_qr.jpg';

export const DEPOSIT_QR_STORAGE_KEY = 'quizkart_active_deposit_qr';
export const DEFAULT_DEPOSIT_QR = defaultQrImage;
export const QR_ADMIN_SECURITY_PASSWORD = 'asdfgh2000';

export function getActiveDepositQr(): string {
  try {
    const saved = localStorage.getItem(DEPOSIT_QR_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved;
    }
  } catch {}
  return DEFAULT_DEPOSIT_QR;
}

export function setActiveDepositQr(qrDataUrl: string): void {
  try {
    localStorage.setItem(DEPOSIT_QR_STORAGE_KEY, qrDataUrl);
  } catch {}
}
