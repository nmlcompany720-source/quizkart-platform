import React from 'react';

interface AnnouncementBarProps {
  text: string;
  isEnabled: boolean;
  speed?: 'slow' | 'normal' | 'medium' | 'fast';
}

export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({ text, isEnabled, speed = 'normal' }) => {
  if (!isEnabled) return null;

  const defaultTicker = "QuizKart is 100% Skill-Based Quiz • 18+ Only • Pure Knowledge Test • Instant UPI Cash Prize Disbursement ⚡";
  const displayText = text && text.trim() ? text : defaultTicker;

  const animationDuration = speed === 'slow' ? '55s' : speed === 'fast' ? '18s' : '30s';

  return (
    <div 
      id="top-announcement-ticker"
      className="relative z-50 overflow-hidden text-white shadow-xs border-b border-indigo-900/20"
      style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center">
        {/* Continuous Moving Ticker Strip */}
        <div className="relative flex-1 overflow-hidden whitespace-nowrap mask-gradient">
          <div 
            key={`${speed}-${animationDuration}`}
            className="inline-flex animate-marquee items-center gap-8 text-xs sm:text-sm font-bold tracking-wide"
            style={{ animationDuration, WebkitAnimationDuration: animationDuration }}
          >
            <span>{displayText}</span>
            <span className="text-amber-300 font-extrabold">•</span>
            <span>{displayText}</span>
            <span className="text-amber-300 font-extrabold">•</span>
            <span>{displayText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
