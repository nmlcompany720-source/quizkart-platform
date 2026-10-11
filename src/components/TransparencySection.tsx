import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Server, 
  Scale, 
  HelpCircle,
  Wallet,
  Check
} from 'lucide-react';
import { PoolEconomics, UserProfile, DepositRequest, WithdrawalRequest } from '../types';
import { soundFx } from '../utils/audio';

interface TransparencySectionProps {
  initialPool: PoolEconomics;
  onEnterQuiz: () => void;
  isQuizActive: boolean;
  userProfile?: UserProfile;
  deposits?: DepositRequest[];
  withdrawals?: WithdrawalRequest[];
  userQuizAttempts?: any[];
  onShowToast?: (msg: string) => void;
  onOpenSupport?: () => void;
}

const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

const TYPEWRITER_LINES = [
  '100% Verified & Fair Play Guaranteed',
  'Play with Knowledge • Win Direct Cash',
  'Instant Payouts • 0% Platform Fees'
];

export const TransparencySection: React.FC<TransparencySectionProps> = ({
  onEnterQuiz,
  isQuizActive,
  userProfile,
  deposits = [],
  withdrawals = [],
  userQuizAttempts = [],
  onShowToast,
  onOpenSupport
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Typewriter animation state for hero heading
  const [lineIdx, setLineIdx] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFullText = TYPEWRITER_LINES[lineIdx];
    const typingSpeed = isDeleting ? 28 : 55;
    const pauseAtEnd = 2200;
    const pauseAtStart = 350;

    let timer: NodeJS.Timeout;

    if (!isDeleting && displayText === currentFullText) {
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, pauseAtEnd);
    } else if (isDeleting && displayText === '') {
      setIsDeleting(false);
      setLineIdx((prev) => (prev + 1) % TYPEWRITER_LINES.length);
      timer = setTimeout(() => {}, pauseAtStart);
    } else {
      timer = setTimeout(() => {
        const next = isDeleting
          ? currentFullText.substring(0, displayText.length - 1)
          : currentFullText.substring(0, displayText.length + 1);
        setDisplayText(next);
      }, typingSpeed);
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, lineIdx]);

  const faqs = [
    {
      q: 'Are there any hidden delivery or withdrawal fees?',
      a: 'No. All direct bank transfers and winning payouts are 100% free with zero hidden deductions.'
    },
    {
      q: 'How fast are bank withdrawals credited?',
      a: 'Bank payouts are processed automatically via secure banking APIs directly into your bank account right after quiz evaluation.'
    },
    {
      q: 'How are cash winnings credited to my bank account?',
      a: 'Cash prizes are transferred directly to your verified bank account via automated, secure banking APIs with instant processing.'
    },
    {
      q: 'Is this legal in India under Skill Gaming regulations?',
      a: 'Yes. QuizKart.in is 100% a Game of Skill exempted under the Public Gambling Act, 1867 and affirmed by the Supreme Court of India. Rankings depend purely on factual knowledge, cognitive recall speed, and hand-eye accuracy without any random number generator (RNG) elements.'
    },
    {
      q: 'What happens if there is a tie in score?',
      a: 'All ties are broken by completion time measured to the tenth of a second (0.1s). If User A scored 10/10 in 2m 14s and User B scored 10/10 in 2m 45s, User A ranks higher.'
    },
    {
      q: 'What is the minimum age requirement to play on QuizKart?',
      a: 'Users must be 18 years or older to participate in real-money quiz contests.'
    },
    {
      q: 'What should I do if my deposit or withdrawal fails?',
      a: 'You can instantly raise a ticket via Contact Support, and our team will assist you within 24 hours.'
    }
  ];

  return (
    <div className="w-full space-y-6 pb-6">
      {/* Header Bar with Typewriter Heading */}
      <div 
        className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="min-w-0 flex-1">
          <div className="h-8 sm:h-9 flex items-center">
            <h2 
              className="text-base sm:text-xl md:text-2xl font-black tracking-tight truncate flex items-center"
              style={{ color: '#111827' }}
            >
              <span>{displayText}</span>
              <span 
                className="inline-block w-0.5 h-4 sm:h-5 ml-1 animate-pulse"
                style={{ backgroundColor: '#4A7DF3' }}
              />
            </h2>
          </div>
        </div>

        {!isQuizActive && (
          <button
            onClick={() => {
              soundFx.playClick();
              onEnterQuiz();
            }}
            className="px-4 py-2 rounded-xl text-white font-bold text-xs shrink-0 self-start sm:self-auto cursor-pointer shadow-sm hover:opacity-95 active:scale-95 transition-all"
            style={{ background: BRAND_GRADIENT }}
          >
            <span>Play Quiz</span>
          </button>
        )}
      </div>

      {/* 3 Clean Trust Pillars (Direct Bank Cash Rewards & Fair Play) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1 */}
        <div 
          className="rounded-2xl bg-white border border-slate-200 px-4 py-3.5 shadow-sm space-y-2 transition-all hover:border-slate-300"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              Direct Bank Payouts
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Winnings are transferred directly to your registered Bank Account / UPI within minutes after quiz completion.
          </p>
        </div>

        {/* Pillar 2 */}
        <div 
          className="rounded-2xl bg-white border border-slate-200 px-4 py-3.5 shadow-sm space-y-2 transition-all hover:border-slate-300"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              Zero Withdrawal Deductions
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            100% of your winning amount is transferred directly with zero platform fees or hidden charges.
          </p>
        </div>

        {/* Pillar 3 */}
        <div 
          className="rounded-2xl bg-white border border-slate-200 px-4 py-3.5 shadow-sm space-y-2 transition-all hover:border-slate-300"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              <Server className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              Anti-Cheat Protection
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Server-level 0.1s timestamping ensuring strict fair play for every participant.
          </p>
        </div>
      </div>

      {/* 1. LEGAL & FAIR PLAY GUARANTEES - Strictly single vertical column stack with aligned icons & text start */}
      <div 
        className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-sm"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="flex items-center gap-3 px-4">
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ background: BRAND_GRADIENT }}
          >
            <Scale className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 
            className="text-xs sm:text-sm font-bold uppercase tracking-wider"
            style={{ color: '#000000' }}
          >
            LEGAL & FAIR PLAY GUARANTEES
          </h3>
        </div>

        {/* 4 Inner Legal Feature Cards Aligned Strictly in a Single Vertical Line */}
        <div className="grid grid-cols-1 gap-3 text-xs">
          {/* Card 1 */}
          <div 
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 flex items-center justify-center shrink-0 mt-0.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-2xs"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                  100% Skill-Based (Supreme Court Certified)
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                  Recognized as a legal Game of Skill under Indian judicial precedents.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div 
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 flex items-center justify-center shrink-0 mt-0.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-2xs"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                  Anti-Cheat Server Timestamping
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                  Submissions recorded on secure cloud servers down to 0.1s to prevent timer tampering.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div 
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 flex items-center justify-center shrink-0 mt-0.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-2xs"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                  Direct Bank Cash Payouts
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                  Instant direct-to-bank transfers to your registered account with zero manual delays.
                </p>
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div 
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 flex items-center justify-center shrink-0 mt-0.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-2xs"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                  Secure Banking API Integration
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                  100% encrypted, Bank-grade API transfers powered by verified financial partners.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. STANDALONE RESTRICTED STATES STATUTORY NOTICE CARD */}
      <div 
        className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm space-y-2"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div 
          className="font-bold text-xs uppercase tracking-wider"
          style={{ color: '#DC2626' }}
        >
          RESTRICTED STATES STATUTORY NOTICE:
        </div>
        <p 
          className="text-xs sm:text-sm leading-relaxed"
          style={{ color: '#111827' }}
        >
          Residents of{' '}
          <strong 
            className="font-bold"
            style={{ color: '#4A7DF3' }}
          >
            Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim
          </strong>{' '}
          are strictly prohibited from participating in pay-to-play skill contests on QuizKart.in as per state statutory regulations.
        </p>
      </div>

      {/* Frequently Asked Questions Accordion */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ background: BRAND_GRADIENT }}
          >
            <HelpCircle className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 
            className="text-xs sm:text-sm font-bold uppercase tracking-wider"
            style={{ color: '#000000' }}
          >
            Transparency FAQs
          </h3>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div 
                key={idx}
                className="rounded-xl overflow-hidden shadow-xs transition-all border border-slate-200 bg-white"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setOpenFaq(isOpen ? null : idx);
                  }}
                  className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-bold transition-opacity hover:opacity-95 cursor-pointer bg-white"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <span 
                    className="font-bold text-xs sm:text-sm"
                    style={{ color: '#4A7DF3' }}
                  >
                    {faq.q}
                  </span>
                  <span 
                    className="w-6 h-6 rounded-lg flex items-center justify-center font-mono text-sm font-bold shrink-0 text-white shadow-xs"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div 
                    className="px-4 pb-4 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100 bg-white"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CUSTOMER SUPPORT INITIAL TRIGGER BUTTON - Clean Standalone Button Centered on Main Background */}
      <div className="w-full pt-2 pb-4">
        <button
          id="contact-support-btn"
          type="button"
          onClick={() => {
            soundFx.playClick();
            if (onOpenSupport) {
              onOpenSupport();
            }
          }}
          className="w-full px-6 py-4 h-[56px] sm:h-[60px] min-h-[56px] sm:min-h-[60px] rounded-2xl text-white font-extrabold text-sm sm:text-base shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          style={{ background: BRAND_GRADIENT }}
        >
          Contact Support
        </button>
      </div>
    </div>
  );
};
