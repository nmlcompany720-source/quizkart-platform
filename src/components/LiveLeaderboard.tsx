import React, { useState } from 'react';
import { 
  Search, 
  ShieldAlert
} from 'lucide-react';
import { LeaderboardEntry, UserProfile, ActiveContest, DailyPrizeItem } from '../types';
import { soundFx } from '../utils/audio';

interface LiveLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  currentUserId?: string;
  currentUserUid?: string;
  userAvatar?: string;
  userProfile?: UserProfile;
  activeContest?: ActiveContest | null;
  isContestLive?: boolean;
  todayPrize?: DailyPrizeItem;
  hasUserCompletedAttempt?: boolean;
  onEnterQuiz: () => void;
  isQuizActive: boolean;
}

function formatTimeDisplay(secs?: number): string {
  if (secs === undefined || secs === null || secs <= 0) return '—';
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export const LiveLeaderboard: React.FC<LiveLeaderboardProps> = ({
  leaderboard,
  currentUserId,
  currentUserUid,
  userAvatar,
  userProfile,
  activeContest,
  isContestLive = false,
  todayPrize,
  hasUserCompletedAttempt = false,
  onEnterQuiz,
  isQuizActive
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'winners' | 'my_rank'>('all');
  const [selectedCardRank, setSelectedCardRank] = useState<number | 'user'>(1);

  const safeLeaderboard = leaderboard || [];
  const effectiveCurrentUid = currentUserUid || userProfile?.uid || userProfile?.id;

  const isRealSubmission = (e?: LeaderboardEntry | null) => {
    if (!e) return false;
    // Exclude demo placeholder rows
    if (e.userName === 'User 1' || e.userName === 'User 2') return false;
    if (e.id && e.id.startsWith('lb-')) return false;
    if (e.ownerUid && (e.ownerUid.startsWith('demo-') || e.ownerUid.startsWith('seed-'))) return false;

    // Explicit real submission indicators
    if (e.id && (e.id.startsWith('ENTRY-') || e.id.startsWith('user-') || e.id.startsWith('sub-') || e.id.startsWith('att-') || e.id.startsWith('real-'))) return true;
    if (e.entryId && (e.entryId.startsWith('ENTRY-') || e.entryId.startsWith('user-') || e.entryId.startsWith('sub-') || e.entryId.startsWith('att-'))) return true;
    if (e.score !== undefined && e.score !== null && !isNaN(Number(e.score))) return true;
    return Boolean(e.submittedAt && !e.id?.startsWith('lb-'));
  };

  // Zero Mock Data: strictly show only genuine real-time entries when contest is active and users have joined
  const realLeaderboard = safeLeaderboard.filter(entry => isRealSubmission(entry) && entry.rank != null && entry.rank > 0);
  const hasRealJoins = realLeaderboard.length > 0;

  const filteredEntries = realLeaderboard.filter(entry => {
    if (!entry) return false;
    const matchesSearch = 
      (entry.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.state || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'winners') {
      const dynamicWinnerSlots = Math.max(1, Math.ceil(realLeaderboard.length / 3));
      return entry.rank <= dynamicWinnerSlots || (entry.rewardAmount !== undefined && entry.rewardAmount > 0) || entry.rewardType === 'product';
    }
    if (filterType === 'my_rank') {
      return Boolean(
        effectiveCurrentUid && entry.ownerUid && entry.ownerUid === effectiveCurrentUid
      );
    }
    return true;
  });

  const userEntry = safeLeaderboard.find(e => 
    e && 
    isRealSubmission(e) && 
    Boolean(effectiveCurrentUid && e.ownerUid && e.ownerUid === effectiveCurrentUid)
  ) || null;

  const getEntryForRank = (rank: number): LeaderboardEntry | null => {
    return realLeaderboard.find(e => e && e.rank === rank) || null;
  };

  // Fixed Calendar Date formatter (replaces any "Today" with exact fixed calendar date)
  const formatSubmissionDate = (entry: LeaderboardEntry): string => {
    const raw = entry.submittedAt || entry.timestamp || '';
    const fallbackCalendarDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    if (!raw) return fallbackCalendarDate;

    if (/^today/i.test(raw.trim())) {
      const timePart = raw.replace(/^today,?\s*/i, '').trim();
      return timePart ? `${fallbackCalendarDate}, ${timePart}` : fallbackCalendarDate;
    }

    return raw;
  };

  // Clean Monetary Reward Formatter strictly mapped to contest prize tiers
  const renderPrize = (entry: LeaderboardEntry) => {
    if (entry.securityBreached || entry.rewardText === 'Disqualified (Violation)') {
      return (
        <span className="w-20 h-7 inline-flex items-center justify-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 rounded-lg border border-rose-200 shadow-2xs whitespace-nowrap shrink-0">
          <ShieldAlert className="w-3 h-3 text-rose-500 shrink-0" />
          Disqualified
        </span>
      );
    }

    const prize = entry.rewardAmount !== undefined ? entry.rewardAmount : 0;
    return (
      <span className="w-20 h-7 inline-flex items-center justify-center font-extrabold text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 shadow-2xs whitespace-nowrap tabular-nums shrink-0">
        ₹{prize.toLocaleString('en-IN')}
      </span>
    );
  };

  const hasValidUserEntry = Boolean(
    hasUserCompletedAttempt &&
    userEntry &&
    isRealSubmission(userEntry) &&
    userEntry.score !== undefined
  );

  // Smart Visibility Logic:
  // If the logged-in user's live rank is 1, 2, or 3, completely HIDE the separate "Your Contest Rank" card
  // (since they are already featured in the main top winner cards).
  // If their rank is 4th or lower, display the card accurately with live score, time, and rank details.
  const shouldShowUserRankCard = Boolean(
    hasValidUserEntry &&
    userEntry &&
    userEntry.rank >= 4
  );

  const renderWinnerCard = (rank: number, orderClass: string) => {
    const entry = getEntryForRank(rank);
    const isSelected = selectedCardRank === rank;
    const realEntry = isRealSubmission(entry) ? entry : null;
    const isCurrent = Boolean(
      realEntry && effectiveCurrentUid && realEntry.ownerUid === effectiveCurrentUid
    );

    const hasLiveEntry = Boolean(hasRealJoins && realEntry && realEntry.userName && realEntry.userName.trim());
    const displayName = hasLiveEntry ? realEntry.userName.trim() : (hasRealJoins ? 'Awaiting Player' : 'USER');
    const avatarSrc = hasLiveEntry ? (realEntry.avatar || null) : null;
    const scoreDisplay = hasLiveEntry
      ? `${realEntry.score}/${realEntry.totalQuestions || 10}`
      : '—';
    const timeDisplay = hasLiveEntry
      ? (realEntry.formattedTime ? realEntry.formattedTime.replace(/^in\s+/, '') : (realEntry.timeTakenSeconds ? `${Math.round(realEntry.timeTakenSeconds)}s` : '0m 00s'))
      : '—';

    // Strict Contest Engine Prize Rules:
    // Demo behavior (before any real user joins): Rank 1 -> ₹180, Rank 2 -> ₹120, Rank 3 -> ₹60
    // As soon as first verified real user joins:
    // - Remove all demo prize data.
    // - Display only actual contest calculations.
    // - Only actual winning entries receive prizes. Non-winning users must show ₹0.
    let prizeText = '₹0';
    if (!hasRealJoins) {
      if (rank === 1) prizeText = '₹180';
      else if (rank === 2) prizeText = '₹120';
      else if (rank === 3) prizeText = '₹60';
    } else {
      if (realEntry && realEntry.rewardAmount !== undefined) {
        prizeText = `₹${realEntry.rewardAmount.toLocaleString('en-IN')}`;
      } else {
        prizeText = '₹0';
      }
    }

    return (
      <div
        key={rank}
        onClick={() => {
          soundFx.playClick();
          setSelectedCardRank(rank);
        }}
        className={`${orderClass} rounded-2xl p-5 min-h-[175px] flex flex-col justify-between relative transition-all duration-200 cursor-pointer ${
          isSelected
            ? 'border-2 border-[#3A81F5] shadow-md ring-2 ring-[#3A81F5]/20'
            : 'border border-slate-200/90 shadow-xs hover:border-slate-300'
        }`}
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={displayName}
                className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0 shadow-xs"
              />
            ) : (
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 shadow-xs"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 truncate leading-tight">
                <span className="truncate">{displayName}</span>
                {isCurrent && hasLiveEntry && (
                  <span
                    className="text-[9px] text-white px-2 py-0.5 rounded-full font-bold shadow-2xs shrink-0"
                    style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                  >
                    YOU
                  </span>
                )}
              </h4>
            </div>
          </div>
          <span
            className={`text-base font-black shrink-0 ${
              isSelected ? 'text-[#3A81F5]' : 'text-slate-400'
            }`}
          >
            {rank}
          </span>
        </div>

        {/* Standardized Score & Timer Layout */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
          <span className="font-extrabold text-sm text-slate-900 whitespace-nowrap tabular-nums">
            {scoreDisplay}
          </span>
          <span className="font-mono text-xs font-semibold text-slate-500 whitespace-nowrap tabular-nums text-right">
            {timeDisplay}
          </span>
        </div>

        {/* Centered Contest-Linked Prize Badge with identical dimensions */}
        <div className="mt-3 h-8 w-full rounded-xl bg-emerald-50 border border-emerald-200 text-center flex items-center justify-center shadow-2xs shrink-0">
          <span className="text-xs font-extrabold text-emerald-700 tracking-wide whitespace-nowrap tabular-nums">
            {prizeText}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-6 pb-6">
      {/* Header Bar */}
      <div 
        className="flex flex-col items-center justify-center text-center gap-3.5 p-6 rounded-2xl border border-slate-200/90 shadow-sm"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight text-center">
          Live Standings & Rankings
        </h2>

        {!isQuizActive && (
          <button
            id="leaderboard-enter-btn"
            onClick={() => {
              soundFx.playClick();
              onEnterQuiz();
            }}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm flex items-center justify-center cursor-pointer transition-all hover:opacity-95 active:scale-98"
            style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
          >
            Play Quiz Now
          </button>
        )}
      </div>

      {/* Top 3 High-Density Podium Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {renderWinnerCard(2, 'order-2 md:order-1')}
        {renderWinnerCard(1, 'order-1 md:order-2')}
        {renderWinnerCard(3, 'order-3 md:order-3')}
      </div>

      {/* User's Own Rank Card - Only displayed when rank is 4th or lower; hidden when rank is 1st to 3rd or unassigned */}
      {shouldShowUserRankCard && userEntry && (
        <div 
          onClick={() => {
            soundFx.playClick();
            setSelectedCardRank('user');
          }}
          className={`rounded-2xl p-5 min-h-[175px] flex flex-col justify-between shadow-sm relative transition-all duration-200 cursor-pointer ${
            selectedCardRank === 'user'
              ? 'border-2 border-[#3A81F5] shadow-md ring-2 ring-[#3A81F5]/20'
              : 'border border-slate-200/90 shadow-xs hover:border-slate-300'
          }`}
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {userEntry.avatar ? (
                <img
                  src={userEntry.avatar}
                  alt={userEntry.userName}
                  className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0 shadow-xs"
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0 shadow-xs"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  {(userEntry.userName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 truncate leading-tight">
                <span className="truncate">{userEntry.userName}</span>
                <span
                  className="text-[9px] text-white px-2 py-0.5 rounded-full font-bold shadow-2xs shrink-0"
                  style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                >
                  YOU
                </span>
              </h4>
            </div>

            <span className="text-base font-black text-[#3A81F5] shrink-0">
              {userEntry.rank}
            </span>
          </div>

          {/* Standardized Score & Timer Layout: precisely matches winner card format */}
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
            <span className="font-extrabold text-sm text-slate-900 whitespace-nowrap tabular-nums">
              {`${userEntry.score}/${userEntry.totalQuestions || 10}`}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500 whitespace-nowrap tabular-nums text-right">
              {userEntry.formattedTime ? userEntry.formattedTime.replace(/^in\s+/, '') : (userEntry.timeTakenSeconds ? `${Math.round(userEntry.timeTakenSeconds)}s` : '0m 00s')}
            </span>
          </div>

          {/* Centered Contest-Linked Prize Badge with identical dimensions */}
          <div className="mt-3 h-8 w-full rounded-xl bg-emerald-50 border border-emerald-200 text-center flex items-center justify-center shadow-2xs shrink-0">
            <span className="text-xs font-extrabold text-emerald-700 tracking-wide whitespace-nowrap tabular-nums">
              {userEntry.rewardAmount !== undefined ? `₹${userEntry.rewardAmount.toLocaleString('en-IN')}` : '₹0'}
            </span>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search input with perfectly centered icon and text */}
        <div className="relative flex-1 flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="leaderboard-search-input"
            type="text"
            placeholder="Search by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl leading-normal text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#3A81F5] focus:border-[#3A81F5] outline-none shadow-2xs"
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { soundFx.playClick(); setFilterType('all'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              filterType === 'all'
                ? 'text-white shadow-sm'
                : 'text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
            style={filterType === 'all'
              ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }
              : { backgroundColor: '#FFFFFF' }
            }
          >
            All ({realLeaderboard.length})
          </button>
          <button
            onClick={() => { soundFx.playClick(); setFilterType('winners'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              filterType === 'winners'
                ? 'text-white shadow-sm'
                : 'text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
            style={filterType === 'winners'
              ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }
              : { backgroundColor: '#FFFFFF' }
            }
          >
            Top 10 Rewards
          </button>
          <button
            onClick={() => { soundFx.playClick(); setFilterType('my_rank'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              filterType === 'my_rank'
                ? 'text-white shadow-sm'
                : 'text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
            style={filterType === 'my_rank'
              ? { background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }
              : { backgroundColor: '#FFFFFF' }
            }
          >
            My Rank
          </button>
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                <th className="py-3 px-4 w-16 whitespace-nowrap">Rank</th>
                <th className="py-3 px-4 min-w-[140px]">Contestant</th>
                <th className="py-3 px-4 text-center w-24 whitespace-nowrap">Score</th>
                <th className="py-3 px-4 text-center w-28 whitespace-nowrap">Time Taken</th>
                <th className="py-3 px-4 text-center w-28 whitespace-nowrap">Prize</th>
                <th className="py-3 px-4 text-center w-36 whitespace-nowrap">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!hasRealJoins || filteredEntries.length === 0) ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-slate-400 font-medium text-xs bg-white">
                    {filterType === 'my_rank'
                      ? 'You have not joined this contest yet. Join now to view your rank!'
                      : 'No active submissions. Play now to join the rankings!'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isUser = Boolean(
                    effectiveCurrentUid && entry.ownerUid && entry.ownerUid === effectiveCurrentUid
                  );
                  const contestantName = entry.userName;

                  return (
                    <tr 
                      key={entry.id}
                      className={`transition-colors ${
                        isUser 
                          ? 'bg-blue-50/70 font-semibold' 
                          : 'hover:bg-slate-50/80 bg-white'
                      }`}
                    >
                      {/* Rank Number: clean circular badge styled with primary brand theme */}
                      <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                        <div className="flex items-center">
                          <span
                            className="w-7 h-7 rounded-full text-white font-black text-xs flex items-center justify-center shadow-2xs"
                            style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                          >
                            {entry.rank}
                          </span>
                        </div>
                      </td>

                      {/* Contestant: clean user name and badges only, without location text or avatar thumbnails */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                          <span className="truncate">{contestantName}</span>
                          {isUser && (
                            <span
                              className="text-[9px] text-white px-2 py-0.5 rounded-full font-bold shadow-2xs shrink-0"
                              style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Score: styled with website's primary brand accent color */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap align-middle">
                        <span className="w-14 h-7 inline-flex items-center justify-center rounded-lg font-black text-xs text-[#3A81F5] bg-blue-50 border border-blue-200/80 shadow-2xs tabular-nums">
                          {entry.score}/{entry.totalQuestions || 10}
                        </span>
                      </td>

                      {/* Time Taken: small rounded timer box matching Admin Panel Score & Speed */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center align-middle">
                        <div className="flex items-center justify-center">
                          <span className="min-w-[76px] px-2.5 h-7 inline-flex items-center justify-center rounded-lg font-mono font-semibold text-xs text-slate-700 bg-slate-50 border border-slate-200 shadow-2xs tabular-nums whitespace-nowrap">
                            {formatTimeDisplay(entry.timeTakenSeconds)}
                          </span>
                        </div>
                      </td>

                      {/* Prize: exact backend waterfall prize amount, centered directly below PRIZE */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center align-middle">
                        <div className="flex items-center justify-center">
                          {renderPrize(entry)}
                        </div>
                      </td>

                      {/* Submitted At: exact fixed calendar date, centered directly below heading */}
                      <td className="py-3.5 px-4 text-center text-[11px] font-medium text-slate-500 whitespace-nowrap tabular-nums align-middle">
                        {formatSubmissionDate(entry)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

