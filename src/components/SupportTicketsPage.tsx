import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock,
  ExternalLink,
  Send,
  X,
  Ticket,
  Trash2
} from 'lucide-react';
import { UserProfile, SupportTicket, ChatMessage } from '../types';
import { soundFx } from '../utils/audio';
import { formatDateTime, formatTicketId, isTicketDeleted, addDeletedTicketId } from '../utils/depositUtils';
import { deleteSupportTicketFromFirestore, fetchSupportTicketsFromFirestore } from '../firebase';

interface SupportTicketsPageProps {
  userProfile?: UserProfile;
  onBack: () => void;
  onShowToast?: (msg: string) => void;
}

const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

export const SupportTicketsPage: React.FC<SupportTicketsPageProps> = ({
  userProfile,
  onBack,
  onShowToast
}) => {
  // Current user's email & name resolution
  const currentEmail = (userProfile?.email || (() => {
    try {
      const p = localStorage.getItem('quizkart_user_profile');
      return p ? JSON.parse(p).email : '';
    } catch {
      return '';
    }
  })() || '').trim().toLowerCase();

  const currentName = userProfile?.name || (() => {
    try {
      const p = localStorage.getItem('quizkart_user_profile');
      return p ? JSON.parse(p).name : '';
    } catch {
      return 'You';
    }
  })() || 'You';

  // Dynamic editable admin name configured in backend/admin settings
  const [dynamicAdminName, setDynamicAdminName] = useState<string>(() => {
    try {
      return localStorage.getItem('quizkart_support_admin_name') || 'QuizKart Support Team';
    } catch {
      return 'QuizKart Support Team';
    }
  });

  useEffect(() => {
    const handleAdminNameSync = () => {
      try {
        const name = localStorage.getItem('quizkart_support_admin_name') || 'QuizKart Support Team';
        setDynamicAdminName(name);
      } catch {}
    };
    window.addEventListener('storage', handleAdminNameSync);
    window.addEventListener('quizkart_support_admin_name_updated', handleAdminNameSync);
    return () => {
      window.removeEventListener('storage', handleAdminNameSync);
      window.removeEventListener('quizkart_support_admin_name_updated', handleAdminNameSync);
    };
  }, []);

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
    fetchSupportTicketsFromFirestore().then((remoteTickets) => {
      if (remoteTickets && remoteTickets.length > 0) {
        const valid = remoteTickets.filter(t => t && t.id && !isTicketDeleted(t.id));
        setTicketsList(prev => {
          const raw = localStorage.getItem('quizkart_support_tickets');
          const localList: SupportTicket[] = raw ? JSON.parse(raw) : prev;
          const mergedMap = new Map<string, SupportTicket>();
          localList.forEach(t => { if (t && t.id && !isTicketDeleted(t.id)) mergedMap.set(t.id, t); });
          valid.forEach(t => {
            if (t && t.id && !isTicketDeleted(t.id) && !mergedMap.has(t.id)) {
              mergedMap.set(t.id, t);
            }
          });
          const merged = Array.from(mergedMap.values());
          localStorage.setItem('quizkart_support_tickets', JSON.stringify(merged));
          return merged;
        });
      }
    }).catch(() => {});
    return () => {
      window.removeEventListener('storage', syncTickets);
      window.removeEventListener('quizkart_support_tickets_updated', syncTickets);
    };
  }, []);

  // Filter tickets for current user (excluding permanently deleted)
  const userTickets = ticketsList.filter(t => {
    if (!t || !t.id || isTicketDeleted(t.id)) return false;
    if (!currentEmail) return true;
    return (t.userEmail || '').trim().toLowerCase() === currentEmail;
  });

  // Mark all unread admin replies as read when entering this page
  useEffect(() => {
    try {
      const raw = localStorage.getItem('quizkart_support_tickets');
      if (raw) {
        const allTickets: SupportTicket[] = JSON.parse(raw);
        let modified = false;
        const updated = allTickets.map(t => {
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
  }, [currentEmail]);

  // Full-screen screenshot modal state
  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState<string | null>(null);

  // Per-ticket inline reply drafts
  const [replyDrafts, setReplyDrafts] = useState<{ [ticketId: string]: string }>({});
  const [isSendingReply, setIsSendingReply] = useState<string | null>(null);

  // Helper to build chat message list for a ticket
  const getTicketMessages = (ticket: SupportTicket): ChatMessage[] => {
    if (ticket.messages && Array.isArray(ticket.messages) && ticket.messages.length > 0) {
      return ticket.messages;
    }
    const msgs: ChatMessage[] = [];
    if (ticket.problemDescription) {
      msgs.push({
        id: `init-${ticket.id}`,
        sender: 'user',
        senderName: ticket.userName || currentName,
        message: ticket.problemDescription,
        timestamp: ticket.createdAt || Date.now()
      });
    }
    if (ticket.adminReply) {
      msgs.push({
        id: `reply-${ticket.id}`,
        sender: 'admin',
        senderName: ticket.adminName || dynamicAdminName,
        message: ticket.adminReply,
        timestamp: ticket.adminRepliedAt || ticket.createdAt || Date.now()
      });
    }
    return msgs;
  };

  // Helper to format WhatsApp-style date separators
  const getMessageDateLabel = (timestamp: number): string => {
    const msgDate = new Date(timestamp);
    const today = new Date();
    
    if (
      msgDate.getDate() === today.getDate() &&
      msgDate.getMonth() === today.getMonth() &&
      msgDate.getFullYear() === today.getFullYear()
    ) {
      return 'Today';
    }
    
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (
      msgDate.getDate() === yesterday.getDate() &&
      msgDate.getMonth() === yesterday.getMonth() &&
      msgDate.getFullYear() === yesterday.getFullYear()
    ) {
      return 'Yesterday';
    }
    
    return msgDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: msgDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  // Helper to format message time inside bubbles
  const formatBubbleTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // User inline reply handler
  const handleSendUserReply = (ticketId: string) => {
    const text = (replyDrafts[ticketId] || '').trim();
    if (!text) return;

    try {
      setIsSendingReply(ticketId);
      const raw = localStorage.getItem('quizkart_support_tickets');
      const all: SupportTicket[] = raw ? JSON.parse(raw) : ticketsList;

      const updated = all.map(t => {
        if (t.id === ticketId) {
          const currentMsgs = getTicketMessages(t);
          const newMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            sender: 'user',
            senderName: t.userName || currentName,
            message: text,
            timestamp: Date.now()
          };
          return {
            ...t,
            status: t.status === 'Resolved' ? 'In Progress' : t.status,
            messages: [...currentMsgs, newMsg]
          };
        }
        return t;
      });

      localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
      setTicketsList(updated);
      window.dispatchEvent(new Event('quizkart_support_tickets_updated'));

      soundFx.playSuccess();
      setReplyDrafts(prev => ({ ...prev, [ticketId]: '' }));
      if (onShowToast) {
        onShowToast('Reply sent to support!');
      }
    } catch {
      if (onShowToast) onShowToast('Failed to send reply. Please try again.');
    } finally {
      setIsSendingReply(null);
    }
  };

  // User delete ticket handler - permanently deletes from both user and admin databases
  const handleDeleteUserTicket = async (ticketId: string, formattedId: string) => {
    soundFx.playClick();
    try {
      // 1. Blacklist ID permanently
      addDeletedTicketId(ticketId);
      addDeletedTicketId(formattedId);

      // 2. Remove from local store
      const raw = localStorage.getItem('quizkart_support_tickets');
      const all: SupportTicket[] = raw ? JSON.parse(raw) : ticketsList;
      const updated = all.filter(t => t.id !== ticketId && formatTicketId(t.id) !== formattedId && t.id !== formattedId);
      localStorage.setItem('quizkart_support_tickets', JSON.stringify(updated));
      setTicketsList(updated);

      // 3. Delete permanently from Firestore cloud database
      await Promise.all([
        deleteSupportTicketFromFirestore(ticketId),
        deleteSupportTicketFromFirestore(formattedId)
      ]);

      // 4. Notify all components & tabs
      window.dispatchEvent(new Event('quizkart_support_tickets_updated'));
      window.dispatchEvent(new Event('storage'));

      soundFx.playSuccess();
      if (onShowToast) {
        onShowToast(`Ticket ${formattedId} deleted permanently`);
      }
    } catch {
      if (onShowToast) onShowToast('Failed to delete ticket');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 pb-16 animate-in fade-in duration-150">
      {/* 1. TOP HEADER NAVIGATION - Short, compact, highly professional title, icon-only back button */}
      <div className="relative flex items-center justify-between pb-1">
        <button
          type="button"
          id="support-tickets-back-btn"
          onClick={() => {
            soundFx.playClick();
            onBack();
          }}
          className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs z-10"
          style={{ backgroundColor: '#FFFFFF' }}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>

        {/* Short, Compact, Highly Professional Title */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <h1 className="text-sm sm:text-base font-bold text-slate-900 text-center tracking-tight">
            Support Tickets
          </h1>
        </div>

        {/* Empty placeholder spacer on far right to preserve perfect center alignment */}
        <div className="w-10 h-10 pointer-events-none" />
      </div>

      {/* Main Support Tickets Content Area */}
      <div className="space-y-4">
        {userTickets.length === 0 ? (
          <div 
            className="py-12 px-4 rounded-3xl border border-dashed border-slate-200 text-center space-y-3 bg-white shadow-2xs"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div 
              className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-sm"
              style={{ background: BRAND_GRADIENT }}
            >
              <Ticket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                No Support Tickets Found
              </h3>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {userTickets.map((t, idx) => {
              // Enforce global sequential ticket ID format starting from QK-TK-1001
              const formattedTicketId = formatTicketId(t.id, idx + 1);

              // Full timestamp (Date + Time): e.g. 2026-10-04 | 08:26:41 PM
              const createdDateObj = t.createdAt ? new Date(t.createdAt) : new Date();
              const formattedTimestamp = formatDateTime(isNaN(createdDateObj.getTime()) ? new Date() : createdDateObj);

              // Status badge styling
              const statusRaw = (t.status || 'OPEN').toUpperCase();
              const isResolved = statusRaw === 'RESOLVED';
              const isInProgress = statusRaw === 'IN PROGRESS';

              // Messages list for WhatsApp style two-way thread
              const messages = getTicketMessages(t);

              return (
                /* SINGLE UNIFIED CARD CONTAINER: Pure White (#FFFFFF) background, no nested outer boxes */
                <div 
                  key={t.id || idx}
                  className="rounded-2xl border border-slate-200 p-4 sm:p-6 transition-all shadow-xs space-y-4 bg-white w-full max-w-full box-border"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  {/* HEADER LINE RE-ALIGNMENT:
                      - Timer clock icon removed from in front of timestamp
                      - Delete icon directly below status badge in primary brand theme color
                      - "RESOLVED" status badge strictly on FAR RIGHT side inside its existing badge box
                      - No brand logo inside the ticket card */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 w-full min-w-0">
                    <div className="flex flex-col items-start gap-0.5 min-w-0">
                      <span className="font-mono font-black text-sm sm:text-base text-slate-900 tracking-tight shrink-0">
                        {formattedTicketId}
                      </span>
                      <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
                        {formattedTimestamp}
                      </span>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5 ml-auto">
                      <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider text-center ${
                        isResolved
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isInProgress
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {statusRaw}
                      </span>
                      {/* Delete (trash) icon directly below the status badge, styled in primary brand theme color */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUserTicket(t.id, formattedTicketId);
                        }}
                        className="p-1.5 rounded-lg border border-[#4A7DF3]/30 bg-blue-50/40 text-[#4A7DF3] hover:bg-[#4A7DF3] hover:text-white transition-all cursor-pointer shadow-2xs flex items-center justify-center self-end"
                        title="Delete Ticket"
                        aria-label="Delete Ticket"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ATTACHMENT CONTAINER SIMPLIFICATION:
                      - SINGLE clean preview box instead of nested double boxes
                      - "View Full" text label removed
                      - Expand icon color converted to match website brand theme color (#4A7DF3) */}
                  {t.screenshotUrl && (
                    <div 
                      className="relative rounded-xl border border-slate-200 p-2.5 bg-white overflow-hidden flex items-center justify-center group"
                      style={{ backgroundColor: '#FFFFFF' }}
                    >
                      <img 
                        src={t.screenshotUrl} 
                        alt="Ticket attachment" 
                        className="w-full max-h-56 object-contain rounded-lg bg-white"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          setSelectedScreenshotModal(t.screenshotUrl || null);
                        }}
                        className="absolute bottom-3 right-3 p-2 rounded-xl bg-white border border-slate-200 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                        style={{ backgroundColor: '#FFFFFF' }}
                        title="Expand attachment"
                        aria-label="Expand attachment"
                      >
                        <ExternalLink className="w-4 h-4 text-[#4A7DF3]" style={{ color: '#4A7DF3' }} />
                      </button>
                    </div>
                  )}

                  {/* WHATSAPP-STYLE CHAT & REPLY INTERFACE:
                      - Top header line ("Support Conversation", "Support team", "LIVE THREAD" + clock) completely removed
                      - Entire chat container background changed from grey to Pure White (#FFFFFF)
                      - "Support" tag removed from admin message header
                      - WhatsApp style layout: sender name at top, date separators (Today, Yesterday), right-aligned timestamp inside bubble
                      - Reply bar: placeholder removed, "Reply" word removed (send icon only), expanded textarea */}
                  <div 
                    className="rounded-2xl border border-slate-200 p-3 sm:p-4 bg-white space-y-3"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    {/* WhatsApp-Style Message Bubbles with Daily Date Separators */}
                    <div className="space-y-3 max-h-96 overflow-y-auto px-1 py-1">
                      {messages.map((msg, mIdx) => {
                        const isUser = msg.sender === 'user';
                        const msgDateLabel = getMessageDateLabel(msg.timestamp);
                        const prevMsg = mIdx > 0 ? messages[mIdx - 1] : null;
                        const prevDateLabel = prevMsg ? getMessageDateLabel(prevMsg.timestamp) : null;
                        const showDateSeparator = mIdx === 0 || msgDateLabel !== prevDateLabel;
                        const timeStr = formatBubbleTime(msg.timestamp);

                        return (
                          <React.Fragment key={msg.id}>
                            {/* Clear Date Separators between daily message groups */}
                            {showDateSeparator && (
                              <div className="flex items-center justify-center my-2">
                                <span className="px-3 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/60 shadow-2xs">
                                  {msgDateLabel}
                                </span>
                              </div>
                            )}

                            {isUser ? (
                              /* User Message Bubble (Sent on Right) */
                              <div className="flex justify-end">
                                <div 
                                  className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs px-4 py-2.5 text-xs text-white shadow-xs space-y-1"
                                  style={{ background: BRAND_GRADIENT }}
                                >
                                  {/* Sender name clearly at top of message bubble */}
                                  <div className="font-bold text-[11px] text-white/90">
                                    {msg.senderName || 'You'}
                                  </div>
                                  <p className="whitespace-pre-wrap leading-relaxed font-normal text-xs sm:text-[13px]">
                                    {msg.message}
                                  </p>
                                  {/* Precise timestamp aligned right inside bubble in WhatsApp style */}
                                  <div className="text-[10px] text-white/75 text-right font-medium pt-0.5">
                                    {timeStr}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Admin Response Bubble (Received on Left, No "support" tag) */
                              <div className="flex justify-start">
                                <div 
                                  className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-xs px-4 py-2.5 text-xs text-slate-800 border border-slate-200 bg-slate-50 shadow-2xs space-y-1"
                                >
                                  {/* Sender name clearly at top of message bubble (NO "support" tag) */}
                                  <div className="font-bold text-[11px] text-[#4A7DF3]">
                                    {msg.senderName || dynamicAdminName}
                                  </div>
                                  <p className="whitespace-pre-wrap leading-relaxed text-slate-700 font-normal text-xs sm:text-[13px]">
                                    {msg.message}
                                  </p>
                                  {/* Precise timestamp aligned right inside bubble in WhatsApp style */}
                                  <div className="text-[10px] text-slate-400 text-right font-medium pt-0.5">
                                    {timeStr}
                                  </div>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Reply Bar Improvements:
                        - Reduced horizontal width (narrower) of textarea and send icon box
                        - Proper line height preserved */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendUserReply(t.id);
                      }}
                      className="flex items-center justify-center gap-2 pt-2.5 max-w-sm sm:max-w-md mx-auto w-full"
                    >
                      <textarea
                        rows={1}
                        value={replyDrafts[t.id] || ''}
                        onChange={(e) => setReplyDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendUserReply(t.id);
                          }
                        }}
                        placeholder=""
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-[#4A7DF3] focus:ring-1 focus:ring-[#4A7DF3] bg-white pure-white-input resize-none min-h-[40px] max-h-[72px] leading-normal"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                      <button
                        type="submit"
                        disabled={!replyDrafts[t.id]?.trim() || isSendingReply === t.id}
                        className="w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center shadow-xs hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                        style={{ background: BRAND_GRADIENT }}
                        title="Send"
                        aria-label="Send"
                      >
                        <Send className="w-4 h-4 text-white" />
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* High-Resolution Full-Screen Modal for Screenshot Attachments */}
      {selectedScreenshotModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setSelectedScreenshotModal(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[92vh] w-full bg-white rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-col items-center border border-slate-200"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">Screenshot Full-Screen View</span>
              <button
                type="button"
                onClick={() => setSelectedScreenshotModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full flex items-center justify-center p-2 overflow-auto max-h-[80vh]">
              {selectedScreenshotModal ? (
                <img 
                  src={selectedScreenshotModal} 
                  alt="High-resolution full view" 
                  className="max-h-[75vh] w-auto object-contain rounded-lg"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
