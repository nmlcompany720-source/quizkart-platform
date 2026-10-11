import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Plus, 
  RefreshCw, 
  X, 
  Trash2, 
  Smile, 
  Share2, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  MessageCircle,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Trophy
} from 'lucide-react';
import { googleChatService, GoogleChatSpace, GoogleChatMessage } from '../services/googleChatService';
import { getCachedAccessToken, signInWithGoogle, logOutUser, auth } from '../firebase';
import { DailyPrizeItem } from '../types';

interface GoogleChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayPrize?: DailyPrizeItem;
  userScore?: number;
  userRank?: number;
}

export const GoogleChatModal: React.FC<GoogleChatModalProps> = ({
  isOpen,
  onClose,
  todayPrize,
  userScore,
  userRank
}) => {
  // Auth state
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Spaces & Messages state
  const [spaces, setSpaces] = useState<GoogleChatSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<GoogleChatSpace | null>(null);
  const [messages, setMessages] = useState<GoogleChatMessage[]>([]);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Message compose state
  const [messageDraft, setMessageDraft] = useState<string>('');

  // Space Creation state
  const [isCreatingSpace, setIsCreatingSpace] = useState<boolean>(false);
  const [newSpaceName, setNewSpaceName] = useState<string>('');

  // MANDATORY USER CONFIRMATION MODAL STATE FOR MUTATING/DESTRUCTIVE ACTIONS
  const [pendingAction, setPendingAction] = useState<{
    type: 'send_message' | 'delete_message';
    spaceName: string;
    spaceTitle: string;
    messageText?: string;
    messageId?: string;
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);

  // Check auth on open
  useEffect(() => {
    if (isOpen) {
      const token = getCachedAccessToken();
      if (token) {
        setHasToken(true);
        loadSpaces();
      } else {
        setHasToken(false);
      }
    }
  }, [isOpen]);

  // Load messages when space changes
  useEffect(() => {
    if (selectedSpace) {
      loadMessages(selectedSpace.name);
    } else {
      setMessages([]);
    }
  }, [selectedSpace]);

  // Notification helper
  const showNotice = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Google Sign-In with Chat Scopes
  const handleConnectGoogle = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const { accessToken } = await signInWithGoogle();
      if (accessToken) {
        setHasToken(true);
        showNotice('Successfully connected to Google Chat!', 'success');
        await loadSpaces();
      } else {
        setAuthError('Sign-in cancelled or no access token received.');
      }
    } catch (err: any) {
      console.error('Chat sign-in error:', err);
      setAuthError(err?.message || 'Failed to authenticate with Google Chat.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Fetch Spaces
  const loadSpaces = async () => {
    setIsLoadingSpaces(true);
    try {
      const list = await googleChatService.listSpaces();
      setSpaces(list);
      if (list.length > 0 && !selectedSpace) {
        setSelectedSpace(list[0]);
      }
    } catch (err: any) {
      console.error('Error loading spaces:', err);
      if (err?.message?.includes('401') || err?.message?.includes('token')) {
        setHasToken(false);
      }
      showNotice(err?.message || 'Could not load Google Chat spaces.', 'error');
    } finally {
      setIsLoadingSpaces(false);
    }
  };

  // Fetch Messages
  const loadMessages = async (spaceName: string) => {
    setIsLoadingMessages(true);
    try {
      const msgs = await googleChatService.listMessages(spaceName);
      setMessages(msgs);
    } catch (err: any) {
      console.error('Error loading messages:', err);
      showNotice(err?.message || 'Could not load space messages.', 'error');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Prompt Send Message Confirmation (Mandatory)
  const handleInitiateSendMessage = () => {
    if (!selectedSpace || !messageDraft.trim()) return;
    setPendingAction({
      type: 'send_message',
      spaceName: selectedSpace.name,
      spaceTitle: selectedSpace.displayName || 'Selected Space',
      messageText: messageDraft.trim(),
    });
  };

  // Quick Tournament Invite Template
  const handleInsertTournamentTemplate = () => {
    const prizeName = todayPrize?.title || 'Smartwatch';
    const mrp = todayPrize?.mrp || 7999;
    const template = `🎯 *QuizKart Daily Tournament Alert!* 🏆\nToday's Prize: *${prizeName}* (₹${mrp.toLocaleString('en-IN')})\nCompete in 10 skill questions, beat the timer, and claim the daily top spot!\nPlay now on QuizKart: https://quizkart.in`;
    setMessageDraft(template);
  };

  // Quick Score Share Template
  const handleInsertScoreTemplate = () => {
    const scoreVal = userScore !== undefined ? userScore.toFixed(2) : '10.00';
    const rankVal = userRank !== undefined ? `#${userRank}` : '#1';
    const template = `⚡ *I just scored ${scoreVal} pts (Rank ${rankVal}) on QuizKart!* Can you beat my time and score in today's tournament? Play here: https://quizkart.in`;
    setMessageDraft(template);
  };

  // Prompt Delete Message Confirmation (Mandatory)
  const handleInitiateDeleteMessage = (msg: GoogleChatMessage) => {
    if (!selectedSpace) return;
    setPendingAction({
      type: 'delete_message',
      spaceName: selectedSpace.name,
      spaceTitle: selectedSpace.displayName || 'Selected Space',
      messageId: msg.name,
      messageText: msg.text || '(Empty content)',
    });
  };

  // Execute Confirmed Mutating Action
  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setIsExecutingAction(true);

    try {
      if (pendingAction.type === 'send_message' && pendingAction.messageText) {
        await googleChatService.sendMessage(pendingAction.spaceName, pendingAction.messageText);
        setMessageDraft('');
        showNotice('Message posted to Google Chat!', 'success');
        if (selectedSpace) {
          await loadMessages(selectedSpace.name);
        }
      } else if (pendingAction.type === 'delete_message' && pendingAction.messageId) {
        await googleChatService.deleteMessage(pendingAction.messageId);
        showNotice('Message deleted from Google Chat.', 'info');
        if (selectedSpace) {
          await loadMessages(selectedSpace.name);
        }
      }
    } catch (err: any) {
      console.error('Error executing chat action:', err);
      showNotice(err?.message || 'Action failed on Google Chat.', 'error');
    } finally {
      setIsExecutingAction(false);
      setPendingAction(null);
    }
  };

  // Create New Space
  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;

    try {
      const created = await googleChatService.createSpace(newSpaceName.trim());
      showNotice(`Created space "${created.displayName || newSpaceName}"!`, 'success');
      setNewSpaceName('');
      setIsCreatingSpace(false);
      await loadSpaces();
      setSelectedSpace(created);
    } catch (err: any) {
      console.error('Error creating space:', err);
      showNotice(err?.message || 'Could not create Google Chat space.', 'error');
    }
  };

  // Add emoji reaction
  const handleReaction = async (msg: GoogleChatMessage, emoji: string) => {
    try {
      await googleChatService.reactToMessage(msg.name, emoji);
      showNotice(`Added reaction ${emoji}`, 'success');
      if (selectedSpace) {
        await loadMessages(selectedSpace.name);
      }
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Google Chat Integration</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Workspace Live
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Share tournament challenges, discuss quiz results, and chat with participants
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b animate-in fade-in duration-150 ${
              actionNotice.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : actionNotice.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : actionNotice.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-blue-600" />
              )}
              <span>{actionNotice.text}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Auth Required State */}
        {!hasToken ? (
          <div className="flex-1 p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-bold text-slate-900 mb-2">Connect Google Chat</h4>
            <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
              Connect your Google Workspace account to browse your Chat spaces, send daily tournament invites, and communicate with fellow contestants.
            </p>

            {authError && (
              <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 max-w-md">
                {authError}
              </div>
            )}

            {/* Official Google Sign In Style Button */}
            <button
              onClick={handleConnectGoogle}
              disabled={isAuthenticating}
              className="flex items-center gap-3 px-6 py-3.5 bg-white border border-slate-300 rounded-xl shadow-sm hover:shadow-md hover:bg-slate-50 active:scale-95 transition-all text-sm font-semibold text-slate-700 cursor-pointer disabled:opacity-60"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{isAuthenticating ? 'Authorizing Google Chat...' : 'Sign in with Google'}</span>
            </button>

            <p className="text-[11px] text-slate-400 mt-4 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Authorized via secure Google OAuth tokens with explicit user consent.
            </p>
          </div>
        ) : (
          /* Main Two-Column Interface: Left Spaces List, Right Conversation & Composer */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[480px]">
            {/* Left Sidebar: Spaces */}
            <div className="w-full md:w-72 border-r border-slate-200 bg-slate-50 flex flex-col">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Spaces ({spaces.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={loadSpaces}
                    disabled={isLoadingSpaces}
                    className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                    title="Refresh Spaces"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSpaces ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setIsCreatingSpace(!isCreatingSpace)}
                    className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-lg hover:bg-indigo-50 transition-colors"
                    title="Create Space"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Space Creation Form */}
              {isCreatingSpace && (
                <form onSubmit={handleCreateSpace} className="p-3 bg-white border-b border-indigo-100 shadow-xs">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    New Space Display Name
                  </label>
                  <input
                    type="text"
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    placeholder="e.g. QuizKart Champions"
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 mb-2"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsCreatingSpace(false)}
                      className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newSpaceName.trim()}
                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}

              {/* Spaces List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoadingSpaces ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading spaces...
                  </div>
                ) : spaces.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No spaces found. Click <span className="font-semibold text-indigo-600">+</span> above to create your first space!
                  </div>
                ) : (
                  spaces.map((sp) => {
                    const isSelected = selectedSpace?.name === sp.name;
                    return (
                      <button
                        key={sp.name}
                        onClick={() => setSelectedSpace(sp)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                            : 'text-slate-700 hover:bg-slate-200/70'
                        }`}
                      >
                        <Users className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate flex-1">
                          {sp.displayName || 'Direct Message'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Messages & Composer */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
              {/* Active Space Header */}
              {selectedSpace ? (
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{selectedSpace.displayName || 'Selected Conversation'}</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">{selectedSpace.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadMessages(selectedSpace.name)}
                      disabled={isLoadingMessages}
                      className="text-xs text-slate-600 hover:text-slate-900 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                      title="Refresh Messages"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMessages ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-b border-slate-200 text-xs text-slate-500">
                  Select a space to view discussion
                </div>
              )}

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {isLoadingMessages ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading conversation...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No messages yet in this space. Start the conversation or share a tournament challenge below!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender?.name?.includes(auth.currentUser?.uid || 'xyz') || false;
                    return (
                      <div
                        key={msg.name}
                        className={`group relative flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200">
                          {msg.sender?.displayName?.[0] || 'U'}
                        </div>

                        {/* Message Box */}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-xs ${
                          isMe 
                            ? 'bg-indigo-600 text-white rounded-tr-xs' 
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-semibold text-[11px] ${isMe ? 'text-indigo-100' : 'text-slate-900'}`}>
                              {msg.sender?.displayName || 'User'}
                            </span>
                            {msg.createTime && (
                              <span className={`text-[10px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                {new Date(msg.createTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          <div className="whitespace-pre-wrap leading-relaxed">
                            {msg.text}
                          </div>

                          {/* Reactions display */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {msg.reactions.map((r, i) => (
                                <span key={i} className="text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full border border-slate-200">
                                  {r.emoji?.unicode} {r.count}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Message Actions (Reactions & Delete) */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100/50">
                            <button
                              onClick={() => handleReaction(msg, '👍')}
                              className="p-1 hover:bg-black/10 rounded text-[11px]"
                              title="Thumbs up"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => handleReaction(msg, '🏆')}
                              className="p-1 hover:bg-black/10 rounded text-[11px]"
                              title="Trophy"
                            >
                              🏆
                            </button>
                            <button
                              onClick={() => handleReaction(msg, '🔥')}
                              className="p-1 hover:bg-black/10 rounded text-[11px]"
                              title="Fire"
                            >
                              🔥
                            </button>
                            <button
                              onClick={() => handleInitiateDeleteMessage(msg)}
                              className={`ml-auto p-1 rounded hover:bg-rose-50 hover:text-rose-600 transition-colors ${
                                isMe ? 'text-indigo-200 hover:text-white' : 'text-slate-400'
                              }`}
                              title="Delete message"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer and Quick Share Templates */}
              <div className="p-3 border-t border-slate-200 bg-white">
                {/* Quick Share Chips */}
                <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
                  <span className="text-[11px] text-slate-400 font-medium shrink-0">Quick Templates:</span>
                  <button
                    type="button"
                    onClick={handleInsertTournamentTemplate}
                    className="px-2.5 py-1 text-[11px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-full shrink-0 flex items-center gap-1"
                  >
                    <Trophy className="w-3 h-3" />
                    <span>Tournament Invite</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertScoreTemplate}
                    className="px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-full shrink-0 flex items-center gap-1"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Share My Score</span>
                  </button>
                </div>

                {/* Textarea Input and Send Action */}
                <div className="flex items-end gap-2">
                  <textarea
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    placeholder={selectedSpace ? `Write a message to ${selectedSpace.displayName || 'space'}...` : 'Select a space first...'}
                    disabled={!selectedSpace}
                    rows={2}
                    className="flex-1 text-xs p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleInitiateSendMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleInitiateSendMessage}
                    disabled={!selectedSpace || !messageDraft.trim()}
                    className="h-10 px-4 bg-indigo-600 text-white rounded-xl font-medium text-xs flex items-center gap-1.5 hover:bg-indigo-700 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MANDATORY USER CONFIRMATION DIALOG (FOR SENDING OR DELETING MESSAGES) */}
        {/* ========================================================================= */}
        {pendingAction && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  pendingAction.type === 'delete_message'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {pendingAction.type === 'delete_message' ? (
                    <Trash2 className="w-5 h-5" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900">
                    {pendingAction.type === 'delete_message'
                      ? 'Confirm Message Deletion'
                      : 'Confirm Message Transmission'}
                  </h5>
                  <p className="text-xs text-slate-500">
                    Destination: <span className="font-semibold text-slate-700">{pendingAction.spaceTitle}</span>
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-5 text-xs text-slate-700">
                <p className="font-semibold mb-1 text-[11px] text-slate-500 uppercase tracking-wider">
                  {pendingAction.type === 'delete_message' ? 'Message to be deleted:' : 'Content to be posted:'}
                </p>
                <p className="whitespace-pre-wrap italic">
                  "{pendingAction.messageText}"
                </p>
              </div>

              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                {pendingAction.type === 'delete_message'
                  ? 'This action will permanently remove the message from the Google Chat space. Are you sure you want to proceed?'
                  : 'This action will post this message to Google Chat on behalf of your authorized account. Are you sure you want to send?'}
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={isExecutingAction}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={isExecutingAction}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                    pendingAction.type === 'delete_message'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isExecutingAction ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>{pendingAction.type === 'delete_message' ? 'Yes, Delete Message' : 'Yes, Send to Google Chat'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
