import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Upload,
  X,
  Ticket,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { UserProfile, DepositRequest, WithdrawalRequest, SupportTicket } from '../types';
import { soundFx } from '../utils/audio';
import { compressImage } from '../utils/imageCompressor';
import { formatDepositId, formatWithdrawalId, formatDepositTimestamp, getNextTicketId, formatTicketId } from '../utils/depositUtils';
import { saveSupportTicketToFirestore } from '../firebase';

interface SupportPageProps {
  userProfile?: UserProfile;
  deposits?: DepositRequest[];
  withdrawals?: WithdrawalRequest[];
  userQuizAttempts?: any[];
  onBack: () => void;
  onViewTickets?: () => void;
  onShowToast?: (msg: string) => void;
}

const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const RECORD_ITEMS_PER_PAGE = 10;

type SupportCategory = 'Deposit Issue' | 'Withdrawal Issue' | 'Quiz Issue' | 'Other Query';

export const SupportPage: React.FC<SupportPageProps> = ({
  userProfile,
  deposits = [],
  withdrawals = [],
  userQuizAttempts = [],
  onBack,
  onViewTickets,
  onShowToast
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory>('Deposit Issue');
  const [selectedTxId, setSelectedTxId] = useState<string>('');
  const [selectedTxDetails, setSelectedTxDetails] = useState<string>('');
  const [problemDescription, setProblemDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSubmitSuccess, setTicketSubmitSuccess] = useState<string | null>(null);
  const [recordPage, setRecordPage] = useState<number>(1);

  // Auto-dismiss confirmation banner after exactly 5 seconds
  useEffect(() => {
    if (ticketSubmitSuccess) {
      const timer = setTimeout(() => {
        setTicketSubmitSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [ticketSubmitSuccess]);

  // Profile resolution
  const currentEmail = (userProfile?.email || (() => {
    try {
      const p = localStorage.getItem('quizkart_user_profile');
      return p ? JSON.parse(p).email : '';
    } catch {
      return '';
    }
  })() || '').trim().toLowerCase();

  const currentPhone = userProfile?.mobile || (() => {
    try {
      const p = localStorage.getItem('quizkart_user_profile');
      return p ? JSON.parse(p).mobile : '';
    } catch {
      return '';
    }
  })() || '';

  const currentName = userProfile?.name || (() => {
    try {
      const p = localStorage.getItem('quizkart_user_profile');
      return p ? JSON.parse(p).name : '';
    } catch {
      return 'Valued Player';
    }
  })() || 'Valued Player';

  const [contactEmail, setContactEmail] = useState(currentEmail);
  const [contactPhone, setContactPhone] = useState(currentPhone);

  useEffect(() => {
    if (currentEmail && !contactEmail) setContactEmail(currentEmail);
    if (currentPhone && !contactPhone) setContactPhone(currentPhone);
  }, [currentEmail, currentPhone]);

  // Support Tickets from localStorage
  const [ticketsList, setTicketsList] = useState<SupportTicket[]>(() => {
    try {
      const raw = localStorage.getItem('quizkart_support_tickets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const syncTickets = () => {
    try {
      const raw = localStorage.getItem('quizkart_support_tickets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setTicketsList(parsed);
      }
    } catch {}
  };

  useEffect(() => {
    window.addEventListener('storage', syncTickets);
    window.addEventListener('quizkart_support_tickets_updated', syncTickets);
    return () => {
      window.removeEventListener('storage', syncTickets);
      window.removeEventListener('quizkart_support_tickets_updated', syncTickets);
    };
  }, []);

  const userTickets = ticketsList.filter(t => {
    if (!currentEmail) return true;
    return (t.userEmail || '').trim().toLowerCase() === currentEmail;
  });

  const hasUnreadAdminReply = userTickets.some(t => Boolean(t.adminReply) && !t.userReadAdminReply);

  // ALL User deposits list (dynamic, no 5 item restriction)
  const allUserDeposits: DepositRequest[] = (() => {
    let list = deposits.length > 0 ? [...deposits] : [];
    if (list.length === 0) {
      try {
        const raw = localStorage.getItem('quizkart_user_deposits_permanent') || localStorage.getItem('quizkart_user_deposits');
        if (raw) list = JSON.parse(raw);
      } catch {}
    }
    if (currentEmail) {
      list = list.filter(d => (d.userEmail || d.email || '').trim().toLowerCase() === currentEmail);
    }
    return list;
  })();

  // ALL User withdrawals list (dynamic, no 5 item restriction)
  const allUserWithdrawals: WithdrawalRequest[] = (() => {
    let list = withdrawals.length > 0 ? [...withdrawals] : [];
    if (list.length === 0) {
      try {
        const raw = localStorage.getItem('quizkart_user_withdrawals_permanent') || localStorage.getItem('quizkart_user_withdrawals');
        if (raw) list = JSON.parse(raw);
      } catch {}
    }
    if (currentEmail) {
      list = list.filter(w => (w.userEmail || w.email || '').trim().toLowerCase() === currentEmail);
    }
    return list;
  })();

  // ALL User quiz attempts list (dynamic, no 5 item restriction)
  const allUserQuizzes = (() => {
    let list = userQuizAttempts.length > 0 ? [...userQuizAttempts] : [];
    if (list.length === 0) {
      try {
        const raw = localStorage.getItem('quizkart_completed_quizzes');
        if (raw) list = JSON.parse(raw);
      } catch {}
    }
    return list;
  })();

  // Active records depending on selected category
  const activeRecords = selectedCategory === 'Deposit Issue' 
    ? allUserDeposits 
    : selectedCategory === 'Withdrawal Issue' 
    ? allUserWithdrawals 
    : selectedCategory === 'Quiz Issue' 
    ? allUserQuizzes 
    : [];

  const totalRecordPages = Math.max(1, Math.ceil(activeRecords.length / RECORD_ITEMS_PER_PAGE));

  useEffect(() => {
    if (recordPage > totalRecordPages) {
      setRecordPage(totalRecordPages);
    }
  }, [totalRecordPages, recordPage]);

  // Paginated records (exactly 10 per page)
  const startIndex = (recordPage - 1) * RECORD_ITEMS_PER_PAGE;
  const paginatedDeposits = allUserDeposits.slice(startIndex, startIndex + RECORD_ITEMS_PER_PAGE);
  const paginatedWithdrawals = allUserWithdrawals.slice(startIndex, startIndex + RECORD_ITEMS_PER_PAGE);
  const paginatedQuizzes = allUserQuizzes.slice(startIndex, startIndex + RECORD_ITEMS_PER_PAGE);

  // Screenshot upload handler
  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingScreenshot(true);
      const compressed = await compressImage(file, 900, 900, 0.75);
      setScreenshotUrl(compressed);
      if (onShowToast) onShowToast('Screenshot attached successfully');
    } catch {
      if (onShowToast) onShowToast('Failed to upload screenshot. Please try a smaller image.');
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  // Submit Ticket handler with sequential QK-TK-1001 ID generation
  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();

    if (!problemDescription.trim()) {
      soundFx.playWrong();
      if (onShowToast) onShowToast('Please provide a description of your issue.');
      return;
    }

    if (!contactEmail.trim()) {
      soundFx.playWrong();
      if (onShowToast) onShowToast('Please provide your email address so we can reply.');
      return;
    }

    setIsSubmittingTicket(true);
    soundFx.playClick();

    // Read current tickets to generate next sequential ID QK-TK-1001, QK-TK-1002, etc.
    let currentExistingTickets: SupportTicket[] = [];
    try {
      const raw = localStorage.getItem('quizkart_support_tickets');
      if (raw) currentExistingTickets = JSON.parse(raw);
    } catch {}

    const newTicketId = getNextTicketId(currentExistingTickets);

    const newTicket: SupportTicket = {
      id: newTicketId,
      userName: currentName,
      userEmail: contactEmail.trim().toLowerCase(),
      userPhone: contactPhone.trim(),
      category: selectedCategory,
      relatedTransactionId: selectedTxId || undefined,
      relatedTransactionDetails: selectedTxDetails || undefined,
      problemDescription: problemDescription.trim(),
      screenshotUrl: screenshotUrl || undefined,
      status: 'Open',
      createdAt: Date.now(),
      userReadAdminReply: false
    };

    try {
      const updated = [newTicket, ...currentExistingTickets];
      localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
      setTicketsList(updated);
      saveSupportTicketToFirestore(newTicket).catch(() => {});
      window.dispatchEvent(new Event('quizkart_support_tickets_updated'));

      soundFx.playSuccess();
      setTicketSubmitSuccess(newTicketId);
      setProblemDescription('');
      setScreenshotUrl('');
      setSelectedTxId('');
      setSelectedTxDetails('');

      if (onShowToast) {
        onShowToast(`Ticket #${newTicketId} submitted! Support will respond shortly.`);
      }
    } catch {
      if (onShowToast) onShowToast('Failed to save ticket. Please try again.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 pb-16 animate-in fade-in duration-150">
      {/* Top Header Navigation Bar with Icon-Only Back Button and Ticket History Action Icon Button */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          id="support-back-btn"
          onClick={() => {
            soundFx.playClick();
            onBack();
          }}
          className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
          style={{ backgroundColor: '#FFFFFF' }}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>

        {/* Dedicated Compact History/Ticket Icon Button (Brand Theme Color + Unread Dot) */}
        <button
          type="button"
          id="support-view-tickets-header-btn"
          onClick={() => {
            soundFx.playClick();
            // Automatically clear/remove unread notification dot upon opening tickets
            try {
              const raw = localStorage.getItem('quizkart_support_tickets');
              if (raw) {
                const all: SupportTicket[] = JSON.parse(raw);
                let modified = false;
                const updated = all.map(t => {
                  const matchesUser = !currentEmail || (t.userEmail || '').trim().toLowerCase() === currentEmail;
                  if (matchesUser && t.adminReply && !t.userReadAdminReply) {
                    modified = true;
                    return { ...t, userReadAdminReply: true };
                  }
                  return t;
                });
                if (modified) {
                  localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
                  setTicketsList(updated);
                  window.dispatchEvent(new Event('quizkart_support_tickets_updated'));
                }
              }
            } catch {}
            if (onViewTickets) {
              onViewTickets();
            }
          }}
          className="relative w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:border-[#4A7DF3]"
          style={{ backgroundColor: '#FFFFFF' }}
          title="Support Tickets"
          aria-label="Support Tickets"
        >
          <Ticket className="w-5 h-5 text-[#4A7DF3]" />
          {hasUnreadAdminReply && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>
      </div>

      {/* Main Support Card */}
      <div 
        className="rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6 bg-white"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Success Notification Alert with Primary Brand Theme Color Gradient (Concise, No Checkmark, 5s Auto-dismiss, Manual X Close) */}
        {ticketSubmitSuccess && (
          <div 
            className="px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs animate-in fade-in"
            style={{ background: BRAND_GRADIENT }}
          >
            <span>Ticket #{formatTicketId(ticketSubmitSuccess)} Created!</span>
            <button 
              type="button"
              onClick={() => setTicketSubmitSuccess(null)}
              className="text-white hover:opacity-80 p-1 cursor-pointer ml-3 shrink-0"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 1: QUERY CATEGORY SELECTION - Pure Text Only, No Icons, 2px Brand Border on Select */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">
            Step 1: Select Query Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(['Deposit Issue', 'Withdrawal Issue', 'Quiz Issue', 'Other Query'] as const).map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setSelectedCategory(cat);
                    setSelectedTxId('');
                    setSelectedTxDetails('');
                    setRecordPage(1);
                  }}
                  className={`py-3 px-3 rounded-xl border-2 text-center transition-all cursor-pointer font-bold text-xs sm:text-sm shadow-2xs ${
                    isSelected 
                      ? 'border-[#4A7DF3] bg-blue-50/40 text-[#4A7DF3] shadow-xs' 
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                  style={{ backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF' }}
                >
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: SELECT RELATED RECORD & OTHER INQUIRY */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              Step 2: Select Record
            </label>
            {selectedTxId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTxId('');
                  setSelectedTxDetails('');
                }}
                style={{ color: '#4A7DF3' }}
                className="text-xs font-bold hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* "Other Query" Description Card */}
          {selectedCategory === 'Other Query' && (
            <div 
              className="p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed shadow-2xs"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              Submit general inquiries, feedback, or rule clarifications directly below.
            </div>
          )}

          {/* Deposit Records List: Paginated (10/page), Full ID, Complete Timestamp (Date + Time), Status on Far Right */}
          {selectedCategory === 'Deposit Issue' && (
            <div className="space-y-2">
              {allUserDeposits.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {paginatedDeposits.map((dep, idx) => {
                    const globalIdx = startIndex + idx;
                    const fullId = formatDepositId(dep.id, globalIdx + 1);
                    const formattedTimestamp = formatDepositTimestamp(dep.timestamp, (dep as any).createdAt, (dep as any).date);
                    const isSelected = selectedTxId === fullId || selectedTxId === dep.id;
                    const statusUpper = (dep.status || '').toUpperCase();

                    return (
                      <div
                        key={dep.id || globalIdx}
                        onClick={() => {
                          soundFx.playClick();
                          if (isSelected) {
                            setSelectedTxId('');
                            setSelectedTxDetails('');
                          } else {
                            setSelectedTxId(fullId);
                            setSelectedTxDetails(`Deposit ₹${dep.amount} (${fullId})`);
                          }
                        }}
                        className={`p-3.5 rounded-xl border-2 flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#4A7DF3] bg-blue-50/40 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        style={{ backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF' }}
                      >
                        {/* Left info: Amount + Full ID + Complete Timestamp (Date + Time) */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                            ₹{dep.amount}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm font-mono whitespace-nowrap">
                              {fullId}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {formattedTimestamp}
                            </div>
                          </div>
                        </div>

                        {/* Far Right: Status Badge */}
                        <div className="shrink-0 pl-3">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                            statusUpper === 'APPROVED' || statusUpper === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                            statusUpper === 'REJECTED' || statusUpper === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {dep.status || 'pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div 
                  className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  No recent deposit records found under your account. You can describe your deposit below.
                </div>
              )}
            </div>
          )}

          {/* Withdrawal Records List: Paginated (10/page), Full ID, Complete Timestamp (Date + Time), Status on Far Right */}
          {selectedCategory === 'Withdrawal Issue' && (
            <div className="space-y-2">
              {allUserWithdrawals.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {paginatedWithdrawals.map((w, idx) => {
                    const globalIdx = startIndex + idx;
                    const fullId = formatWithdrawalId(w.id, globalIdx + 1);
                    const formattedTimestamp = formatDepositTimestamp(w.timestamp, (w as any).createdAt, (w as any).date);
                    const isSelected = selectedTxId === fullId || selectedTxId === w.id;
                    const statusUpper = (w.status || '').toUpperCase();

                    return (
                      <div
                        key={w.id || globalIdx}
                        onClick={() => {
                          soundFx.playClick();
                          if (isSelected) {
                            setSelectedTxId('');
                            setSelectedTxDetails('');
                          } else {
                            setSelectedTxId(fullId);
                            setSelectedTxDetails(`Withdrawal ₹${w.amount} (${fullId})`);
                          }
                        }}
                        className={`p-3.5 rounded-xl border-2 flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#4A7DF3] bg-blue-50/40 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        style={{ backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF' }}
                      >
                        {/* Left info: Amount + Full ID + Complete Timestamp (Date + Time) */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-black text-xs shrink-0">
                            ₹{w.amount}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm font-mono whitespace-nowrap">
                              {fullId}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {formattedTimestamp}
                            </div>
                          </div>
                        </div>

                        {/* Far Right: Status Badge */}
                        <div className="shrink-0 pl-3">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                            statusUpper === 'APPROVED' || statusUpper === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                            statusUpper === 'REJECTED' || statusUpper === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {w.status || 'pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div 
                  className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  No recent withdrawal records found under your account. You can describe your withdrawal below.
                </div>
              )}
            </div>
          )}

          {/* Quiz Records List: Paginated (10/page) */}
          {selectedCategory === 'Quiz Issue' && (
            <div className="space-y-2">
              {allUserQuizzes.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {paginatedQuizzes.map((q: any, idx: number) => {
                    const globalIdx = startIndex + idx;
                    const qId = q.id || `quiz-${globalIdx}`;
                    const isSelected = selectedTxId === qId;
                    return (
                      <div
                        key={qId}
                        onClick={() => {
                          soundFx.playClick();
                          if (isSelected) {
                            setSelectedTxId('');
                            setSelectedTxDetails('');
                          } else {
                            setSelectedTxId(qId);
                            setSelectedTxDetails(`Quiz: ${q.contestName || q.prizeTitle || 'Daily Quiz'} (Score: ${q.score ?? 0})`);
                          }
                        }}
                        className={`p-3.5 rounded-xl border-2 flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#4A7DF3] bg-blue-50/40 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                        style={{ backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF' }}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm">
                            {q.contestName || q.prizeTitle || 'Daily Quiz Contest'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {q.date || 'Completed'}
                          </div>
                        </div>

                        <div className="shrink-0 pl-3">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-800">
                            Score: {q.score ?? 0}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div 
                  className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  No recent quiz attempts found. You can describe your inquiry below.
                </div>
              )}
            </div>
          )}

          {/* Multi-Record Pagination Controls Widget - Bottom-Right Corner (10 Records per Page) */}
          {selectedCategory !== 'Other Query' && activeRecords.length > 0 && (
            <div className="flex items-center justify-end pt-2">
              <div 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-md text-white font-mono text-xs font-bold select-none"
                style={{ background: BRAND_GRADIENT }}
              >
                <button
                  type="button"
                  id="record-page-prev-btn"
                  disabled={recordPage <= 1}
                  onClick={() => {
                    if (recordPage > 1) {
                      soundFx.playClick();
                      setRecordPage(prev => Math.max(1, prev - 1));
                    }
                  }}
                  className={`p-1 rounded-lg transition-all flex items-center justify-center ${
                    recordPage <= 1 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:bg-white/20 active:scale-90 cursor-pointer text-white'
                  }`}
                  aria-label="Previous page"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 text-white stroke-[2.5]" />
                </button>

                <span className="px-2 text-white tracking-widest text-xs font-black">
                  {recordPage} / {totalRecordPages}
                </span>

                <button
                  type="button"
                  id="record-page-next-btn"
                  disabled={recordPage >= totalRecordPages}
                  onClick={() => {
                    if (recordPage < totalRecordPages) {
                      soundFx.playClick();
                      setRecordPage(prev => Math.min(totalRecordPages, prev + 1));
                    }
                  }}
                  className={`p-1 rounded-lg transition-all flex items-center justify-center ${
                    recordPage >= totalRecordPages 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:bg-white/20 active:scale-90 cursor-pointer text-white'
                  }`}
                  aria-label="Next page"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4 text-white stroke-[2.5]" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* STEP 3: ISSUE DETAILS */}
        <form onSubmit={handleSubmitTicket} className="space-y-4">
          <label className="text-xs font-bold text-slate-700 block">
            Step 3: Issue Details
          </label>

          {/* Clean Centered Upload Box: ONLY Upload Icon inside, Sub-text Completely Removed */}
          {(selectedCategory === 'Deposit Issue' || selectedCategory === 'Withdrawal Issue') && (
            <div className="space-y-1.5">
              {screenshotUrl ? (
                <div className="relative w-full border border-slate-200 rounded-xl overflow-hidden p-2 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                  <img 
                    src={screenshotUrl} 
                    alt="Attached Screenshot" 
                    className="w-full max-h-48 object-contain rounded-lg bg-white" 
                    style={{ backgroundColor: '#FFFFFF' }}
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshotUrl('')}
                    className="absolute top-3 right-3 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700 cursor-pointer"
                    title="Remove Screenshot"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label 
                  className="border-2 border-dashed border-slate-200 hover:border-[#4A7DF3] rounded-xl p-6 flex items-center justify-center cursor-pointer transition-colors w-full text-center"
                  style={{ backgroundColor: '#FFFFFF' }}
                  title="Upload screenshot"
                >
                  <Upload className="w-6 h-6" style={{ color: '#4A7DF3' }} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleScreenshotChange} 
                    className="hidden" 
                    disabled={isUploadingScreenshot}
                  />
                </label>
              )}
            </div>
          )}

          {/* Problem Description Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Description
            </label>
            <textarea
              rows={3}
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder=""
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3] transition-all resize-none pure-white-input"
              style={{ backgroundColor: '#FFFFFF' }}
              required
            />
          </div>

          {/* Input Fields Background Color Lock: Email and Phone strictly Pure White (#FFFFFF) at all times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#4A7DF3] pure-white-input"
                style={{ backgroundColor: '#FFFFFF', WebkitBoxShadow: '0 0 0 1000px #FFFFFF inset' }}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Phone Number</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#4A7DF3] pure-white-input"
                style={{ backgroundColor: '#FFFFFF', WebkitBoxShadow: '0 0 0 1000px #FFFFFF inset' }}
              />
            </div>
          </div>

          {/* Submit Ticket Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmittingTicket}
              className="w-full py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm cursor-pointer shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center"
              style={{ background: BRAND_GRADIENT }}
            >
              <span>{isSubmittingTicket ? 'Submitting Ticket...' : 'Submit Ticket'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
