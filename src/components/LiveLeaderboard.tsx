import React, { useState } from 'react';
import { 
  Trophy, 
  Medal, 
  Clock, 
  Search, 
  Sparkles, 
  Gift, 
  Smartphone, 
  ArrowUpRight, 
  CheckCircle2, 
  Filter,
  Users,
  ShieldCheck
} from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { soundFx } from '../utils/audio';

interface LiveLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  currentUserId?: string;
  onEnterQuiz: () => void;
  isQuizActive: boolean;
}

export const LiveLeaderboard: React.FC<LiveLeaderboardProps> = ({
  leaderboard,
  currentUserId,
  onEnterQuiz,
  isQuizActive
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'winners' | 'my_rank'>('all');

  const safeLeaderboard = leaderboard || [];

  const filteredEntries = safeLeaderboard.filter(entry => {
    if (!entry) return false;
    const matchesSearch = 
      (entry.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.state || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'winners') {
      return entry.rank <= 10;
    }
    if (filterType === 'my_rank') {
      return entry.isCurrentUser;
    }
    return true;
  });

  const top3 = safeLeaderboard.slice(0, 3);
  const userEntry = safeLeaderboard.find(e => e && e.isCurrentUser);

  return (
    <div className="w-full space-y-6 pb-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Trophy className="w-3.5 h-3.5 text-indigo-600" />
              Live Arena #348 Standings
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time Atomic Sync
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-2">
            Skill Leaderboard & Prize Allocation
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Rankings determined strictly by <strong className="text-slate-900">Correct Answers</strong> & <strong className="text-slate-900">Atomic Completion Speed</strong>.
          </p>
        </div>

        {!isQuizActive && (
          <button
            id="leaderboard-enter-btn"
            onClick={() => {
              soundFx.playClick();
              onEnterQuiz();
            }}
            className="px-5 py-3 rounded-xl text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 gemini-glow"
            style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
          >
            <span>Play ₹100 Quiz Now</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Top 3 High-Density Podium Cards */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {/* Rank 2 (Silver) */}
          <div className="order-2 md:order-1 rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between relative transition-all hover:border-slate-300">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-base shadow-xs">
                  🥈
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    {top3[1].userName}
                    {top3[1].isCurrentUser && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">YOU</span>}
                  </h4>
                  <p className="text-xs text-slate-500">{top3[1].city}, {top3[1].state}</p>
                </div>
              </div>
              <span className="text-sm font-black text-slate-400">#2</span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                Score: {top3[1].score}/10
              </span>
              <span className="font-mono text-slate-700 flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {top3[1].formattedTime}
              </span>
            </div>

            <div className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{top3[1].rewardText}</span>
            </div>
          </div>

          {/* Rank 1 (Gold Winner - Highlighted) */}
          <div className="order-1 md:order-2 rounded-2xl bg-amber-50/50 border-2 border-amber-300 p-5 shadow-sm flex flex-col justify-between relative transition-all hover:border-amber-400">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  👑
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                    Rank #1 Winner
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5 mt-1">
                    {top3[0].userName}
                    {top3[0].isCurrentUser && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">YOU</span>}
                  </h4>
                  <p className="text-xs text-slate-600">{top3[0].city}, {top3[0].state}</p>
                </div>
              </div>
              <span className="text-lg font-black text-amber-600">#1</span>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/80 flex items-center justify-between text-xs">
              <span className="font-black text-amber-900 bg-amber-100 px-3 py-1 rounded-lg border border-amber-300">
                Score: {top3[0].score}/10
              </span>
              <span className="font-mono font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                {top3[0].formattedTime}
              </span>
            </div>

            <div className="mt-3 text-xs font-bold text-amber-900 bg-amber-100/80 p-2.5 rounded-xl border border-amber-300 flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">{top3[0].rewardText}</span>
            </div>
          </div>

          {/* Rank 3 (Bronze) */}
          <div className="order-3 md:order-3 rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between relative transition-all hover:border-slate-300">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-700 font-bold text-base shadow-xs">
                  🥉
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    {top3[2].userName}
                    {top3[2].isCurrentUser && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">YOU</span>}
                  </h4>
                  <p className="text-xs text-slate-500">{top3[2].city}, {top3[2].state}</p>
                </div>
              </div>
              <span className="text-sm font-black text-slate-400">#3</span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                Score: {top3[2].score}/10
              </span>
              <span className="font-mono text-slate-700 flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {top3[2].formattedTime}
              </span>
            </div>

            <div className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{top3[2].rewardText}</span>
            </div>
          </div>
        </div>
      )}

      {/* User's Own Rank Spotlight Strip if available */}
      {userEntry && (
        <div className="rounded-2xl bg-indigo-50 text-indigo-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border border-indigo-200">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm text-white shadow-xs">
              #{userEntry.rank}
            </div>
            <div>
              <div className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Your Contest Rank</div>
              <div className="font-extrabold text-slate-900 text-sm">
                {userEntry.userName} • {userEntry.score}/10 in {userEntry.formattedTime}
              </div>
            </div>
          </div>
          <div className="text-xs font-bold bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-emerald-700 flex items-center gap-1.5 self-start sm:self-auto shadow-xs">
            <span>{userEntry.rewardText}</span>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            id="leaderboard-search-input"
            type="text"
            placeholder="Search contestant by name, city, or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { soundFx.playClick(); setFilterType('all'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All ({leaderboard.length})
          </button>
          <button
            onClick={() => { soundFx.playClick(); setFilterType('winners'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filterType === 'winners'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Top 10 Rewards
          </button>
          {userEntry && (
            <button
              onClick={() => { soundFx.playClick(); setFilterType('my_rank'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                filterType === 'my_rank'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              My Rank
            </button>
          )}
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Contestant</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4">Time Taken</th>
                <th className="py-3 px-4">Reward Qualification</th>
                <th className="py-3 px-4 text-right">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.map((entry) => {
                const isUser = entry.isCurrentUser;
                const isTop1 = entry.rank === 1;
                const isTop10 = entry.rank <= 10;

                return (
                  <tr 
                    key={entry.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isUser ? 'bg-indigo-50/60 font-semibold' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {entry.rank === 1 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-900 font-black text-[11px] flex items-center justify-center shadow-xs">
                            1
                          </span>
                        ) : entry.rank === 2 ? (
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center justify-center">
                            2
                          </span>
                        ) : entry.rank === 3 ? (
                          <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-800 font-bold text-[11px] flex items-center justify-center border border-orange-200">
                            3
                          </span>
                        ) : (
                          <span className="w-6 h-6 rounded-full text-slate-500 font-bold text-[11px] flex items-center justify-center">
                            #{entry.rank}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Contestant */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 border border-slate-200">
                          {entry.userName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {entry.userName}
                            {isUser && (
                              <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded-full">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {entry.city}, {entry.state}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-[11px] ${
                        entry.score === 10
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : entry.score >= 8
                          ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {entry.score} / {entry.totalQuestions}
                      </span>
                    </td>

                    {/* Time Taken */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{entry.formattedTime}</span>
                      </div>
                    </td>

                    {/* Reward */}
                    <td className="py-3 px-4">
                      {isTop1 ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          <Gift className="w-3.5 h-3.5 text-amber-600" />
                          {entry.rewardText}
                        </span>
                      ) : isTop10 ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          {entry.rewardText}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          Consolation Certificate
                        </span>
                      )}
                    </td>

                    {/* Submitted At */}
                    <td className="py-3 px-4 text-right text-[11px] text-slate-500 whitespace-nowrap">
                      {entry.submittedAt || entry.timestamp}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

