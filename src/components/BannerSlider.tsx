import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BannerSlide, BannerTargetPage } from '../types';
import { soundFx } from '../utils/audio';

interface BannerSliderProps {
  slides: BannerSlide[];
  isLiveContest?: boolean;
  onSlideAction: (tab: BannerTargetPage, customUrl?: string) => void;
  activeSlideIndex?: number;
  showAllSlides?: boolean;
}

export const BannerSlider: React.FC<BannerSliderProps> = ({ 
  slides, 
  isLiveContest = false, 
  onSlideAction,
  activeSlideIndex,
  showAllSlides = false
}) => {
  const activeSlides = showAllSlides
    ? (slides || [])
    : (slides || []).filter(s => s && s.isEnabled && (Boolean(s.imageUrl) || Boolean(s.title)));

  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (typeof activeSlideIndex === 'number' && activeSlideIndex >= 0) {
      return Math.min(activeSlideIndex, Math.max(0, activeSlides.length - 1));
    }
    return 0;
  });
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number | null>(null);
  const dragEndXRef = useRef<number | null>(null);

  // Sync forced active slide index (e.g. Admin Preview box)
  useEffect(() => {
    if (typeof activeSlideIndex === 'number' && activeSlideIndex >= 0) {
      if (showAllSlides) {
        if (activeSlideIndex < activeSlides.length) {
          setCurrentIdx(activeSlideIndex);
        }
      } else {
        const targetSlide = slides[activeSlideIndex];
        if (targetSlide) {
          const matchIdx = activeSlides.findIndex(s => s.id === targetSlide.id);
          if (matchIdx !== -1) {
            setCurrentIdx(matchIdx);
          }
        }
      }
    }
  }, [activeSlideIndex, showAllSlides, slides, activeSlides]);

  // Keep index within bounds if active slides list changes
  useEffect(() => {
    if (activeSlides.length > 0 && currentIdx >= activeSlides.length) {
      setCurrentIdx(0);
    }
  }, [activeSlides.length, currentIdx]);

  // Auto-advance every 5 seconds (disabled when previewing specific slide index)
  useEffect(() => {
    if (typeof activeSlideIndex === 'number') return;
    if (activeSlides.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % activeSlides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [activeSlides.length, isPaused, activeSlideIndex]);

  if (activeSlides.length === 0) return null;

  const currentSlide = activeSlides[currentIdx] || activeSlides[0];

  const goToPrev = () => {
    soundFx.playClick();
    setCurrentIdx(prev => (prev - 1 + activeSlides.length) % activeSlides.length);
  };

  const goToNext = () => {
    soundFx.playClick();
    setCurrentIdx(prev => (prev + 1) % activeSlides.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    goToPrev();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    goToNext();
  };

  const lastActionTimeRef = useRef<number>(0);

  const handleAction = (tab?: BannerTargetPage, customUrl?: string) => {
    soundFx.playClick();
    onSlideAction(tab || 'quiz_arena', customUrl);
  };

  const handleBannerBtnClick = (e: React.SyntheticEvent) => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 450) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastActionTimeRef.current = now;
    e.preventDefault();
    e.stopPropagation();
    const isLeaderboardAction = 
      currentSlide.actionTab === 'leaderboard' ||
      (currentSlide.actionText && currentSlide.actionText.toLowerCase().includes('leaderboard')) ||
      (currentSlide.title && currentSlide.title.toLowerCase().includes('leaderboard'));
    const targetTab = isLeaderboardAction ? 'leaderboard' : (currentSlide.actionTab || 'quiz_arena');
    handleAction(targetTab, currentSlide.customUrl);
  };

  // Touch Swipe Handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = null;
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const distance = touchStartXRef.current - touchEndXRef.current;
      if (Math.abs(distance) > 40) {
        if (distance > 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
    setIsPaused(false);
  };

  // Mouse Drag / Swipe Handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // Only drag with primary mouse button
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragEndXRef.current = null;
    setIsPaused(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    dragEndXRef.current = e.clientX;
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current && dragStartXRef.current !== null && dragEndXRef.current !== null) {
      const distance = dragStartXRef.current - dragEndXRef.current;
      if (Math.abs(distance) > 45) {
        if (distance > 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    }
    isDraggingRef.current = false;
    dragStartXRef.current = null;
    dragEndXRef.current = null;
    setIsPaused(false);
  };

  // Wheel Horizontal Scroll handler
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > 35) {
      if (e.deltaX > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  };

  return (
    <div 
      id="front-page-banner-slider"
      className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-slate-200/90 group touch-pan-y select-none cursor-grab active:cursor-grabbing"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        if (isDraggingRef.current) {
          handleMouseUp();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Slide Image Background */}
      <div className="relative w-full h-44 sm:h-56 md:h-64 lg:h-72 bg-slate-900 overflow-hidden">
        {currentSlide?.imageUrl ? (
          <img
            key={currentSlide.id}
            src={currentSlide.imageUrl}
            alt={currentSlide.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 pointer-events-none"
          />
        ) : null}

        {/* Cinematic Gradient Overlays for High Contrast Typography */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none" />

        {/* Content Container: Shifted upward with generous bottom breathing room */}
        <div className="absolute inset-0 p-5 sm:p-8 md:p-10 pb-7 sm:pb-9 md:pb-11 flex flex-col justify-center max-w-2xl pointer-events-auto">
          {/* Badge Tag & Title & Subtitle & CTA */}
          <div className="space-y-2 sm:space-y-3">
            {/* Real-time Badge Tag */}
            {Boolean(currentSlide.badge && currentSlide.badge.trim()) && (
              <div>
                <span 
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black tracking-wider uppercase text-white shadow-xs"
                  style={{
                    background: 'linear-gradient(135deg, #6366F1 0%, #3B82F6 50%, #10B981 100%)',
                  }}
                >
                  {currentSlide.badge}
                </span>
              </div>
            )}

            {/* Real-time Heading */}
            <h2 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight drop-shadow-sm">
              {currentSlide.title}
            </h2>

            {/* Real-time Subtitle */}
            {Boolean(currentSlide.subtitle && currentSlide.subtitle.trim()) && (
              <p className="text-xs sm:text-sm md:text-base text-slate-200 font-medium line-clamp-2 max-w-xl">
                {currentSlide.subtitle}
              </p>
            )}

            {/* Real-time Action CTA Button: displays exact actionText, single tap immediate navigation */}
            {Boolean(currentSlide.actionText && currentSlide.actionText.trim()) && (
              <div className="pt-1.5 sm:pt-2 relative z-30 pointer-events-auto">
                <button
                  type="button"
                  id="banner-cta-action-btn"
                  onClick={handleBannerBtnClick}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchEnd={handleBannerBtnClick}
                  className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer hover:opacity-95 select-none relative z-30 touch-manipulation"
                  style={{
                    background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                    boxShadow: '0 4px 14px rgba(65, 124, 244, 0.35)',
                  }}
                >
                  <span>{currentSlide.actionText}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Prev / Next Chevrons */}
        {activeSlides.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-white/20 z-20"
              aria-label="Previous Slide"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-white/20 z-20"
              aria-label="Next Slide"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Indicators styled in primary Website Brand Gradient Color */}
        {activeSlides.length > 1 && (
          <div className="absolute bottom-3 right-4 flex items-center gap-1.5 z-10">
            {activeSlides.map((slide, idx) => (
              <button
                key={slide.id || `indicator-${idx}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundFx.playClick();
                  setCurrentIdx(idx);
                }}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentIdx ? 'w-6 shadow-sm' : 'w-2 opacity-50 hover:opacity-80'
                }`}
                style={{
                  background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                }}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
