import React, { useState } from 'react';
import { 
  ArrowRight, 
  ChevronLeft, 
  Zap,
  X
} from 'lucide-react';
import { soundFx } from '../utils/audio';

interface PreQuizOnboardingProps {
  selectedLanguage: 'English' | 'Hindi';
  onSelectLanguage: (lang: 'English' | 'Hindi') => void;
  onDoneStartTest: () => void;
  onExit: () => void;
  totalQuestions?: number;
  totalDurationMinutes?: number;
  prizeTitle?: string;
  isPractice?: boolean;
}

export const PreQuizOnboarding: React.FC<PreQuizOnboardingProps> = ({
  selectedLanguage,
  onSelectLanguage,
  onDoneStartTest,
  onExit,
  totalQuestions = 19,
  totalDurationMinutes = 10,
  isPractice = false
}) => {
  const [step, setStep] = useState<'language' | 'instructions'>('language');
  const [agreedToRules, setAgreedToRules] = useState<boolean>(true);

  // Compact Subject breakdown with simplified names for fast readability
  const compactSubjects = [
    { name: 'Science', questions: 4, marks: 4 },
    { name: 'Geography', questions: 4, marks: 4 },
    { name: 'History', questions: 4, marks: 4 },
    { name: 'GK & CA', questions: 4, marks: 4 },
    { name: 'Tie-Breaker', questions: 3, marks: 3 },
  ];

  return (
    <div className="min-h-screen bg-slate-900/60 backdrop-blur-sm fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col my-auto">
        {/* Compact Header Bar with Signature Gradient Accent */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
            >
              Q
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                {step === 'language' ? 'Select Language' : 'Paper Pattern & Instructions'}
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              soundFx.playClick();
              onExit();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Exit Arena"
            aria-label="Exit Arena"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: COMPACT LANGUAGE SELECTION */}
        {step === 'language' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Sleek, compact horizontal radio tiles side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Tile: [En] English */}
              <button
                type="button"
                id="language-tile-english"
                onClick={() => {
                  soundFx.playClick();
                  onSelectLanguage('English');
                }}
                className="p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between text-left shadow-xs"
                style={
                  selectedLanguage === 'English'
                    ? {
                        border: '2px solid transparent',
                        background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%) border-box',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
                      }
                    : {
                        border: '2px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }
                }
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-7 h-7 rounded-lg text-white shadow-xs flex items-center justify-center font-black text-xs shrink-0"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    En
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">English</div>
                  </div>
                </div>
                <div 
                  className={`w-4 h-4 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    selectedLanguage === 'English' ? 'text-white' : 'border-2 border-slate-300 bg-white'
                  }`}
                  style={
                    selectedLanguage === 'English' 
                      ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' } 
                      : undefined
                  }
                >
                  {selectedLanguage === 'English' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              {/* Right Tile: [हि] हिन्दी */}
              <button
                type="button"
                id="language-tile-hindi"
                onClick={() => {
                  soundFx.playClick();
                  onSelectLanguage('Hindi');
                }}
                className="p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between text-left shadow-xs"
                style={
                  selectedLanguage === 'Hindi'
                    ? {
                        border: '2px solid transparent',
                        background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%) border-box',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
                      }
                    : {
                        border: '2px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }
                }
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-7 h-7 rounded-lg text-white shadow-xs flex items-center justify-center font-black text-xs shrink-0"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                  >
                    हि
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">हिन्दी</div>
                  </div>
                </div>
                <div 
                  className={`w-4 h-4 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    selectedLanguage === 'Hindi' ? 'text-white' : 'border-2 border-slate-300 bg-white'
                  }`}
                  style={
                    selectedLanguage === 'Hindi' 
                      ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' } 
                      : undefined
                  }
                >
                  {selectedLanguage === 'Hindi' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>

            {/* Bottom Footer Action: Both Cancel & Proceed with Signature 3-Color Gradient */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                id="pre-quiz-cancel-btn"
                onClick={() => {
                  soundFx.playClick();
                  onExit();
                }}
                className="px-4 py-2 rounded-xl text-white font-bold text-xs shadow-xs hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
              >
                Cancel
              </button>

              <button
                id="pre-quiz-continue-to-step2"
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setStep('instructions');
                }}
                className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-sm hover:opacity-95 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
              >
                <span>Proceed →</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SUMMARY STATS STRIP, COMPACT TABLE & CONDENSED RULES */}
        {step === 'instructions' && (
          <div className="p-4 sm:p-5 space-y-3.5">
            {/* 1. Single Horizontal Badge Row: [⏱️ 10 Mins] [❓ 19 Questions] [🎯 19 Marks] [⚠️ -0.33 Neg] */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <div className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-slate-800">
                <span>⏱️</span>
                <span className="truncate">{totalDurationMinutes} Mins</span>
              </div>

              <div className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-slate-800">
                <span>❓</span>
                <span className="truncate">{totalQuestions} Questions</span>
              </div>

              <div className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-slate-800">
                <span>🎯</span>
                <span className="truncate">{totalQuestions} Marks</span>
              </div>

              <div className="px-2 py-1.5 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center gap-1 text-[11px] sm:text-xs font-black text-red-600">
                <span>⚠️</span>
                <span className="truncate">-0.33 Neg</span>
              </div>
            </div>

            {/* Language Pill with quick toggle */}
            <div className="flex items-center justify-between text-[11px] px-1 text-slate-500">
              <span>Medium: <strong className="text-slate-800">{selectedLanguage}</strong></span>
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setStep('language');
                }}
                className="text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
              >
                Change Medium
              </button>
            </div>

            {/* 2. Compact Subject Breakdown Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <div className="bg-slate-100/90 px-3 py-1.5 font-bold text-slate-700 grid grid-cols-12 text-[11px] uppercase tracking-wider border-b border-slate-200">
                <div className="col-span-6">Subject</div>
                <div className="col-span-3 text-center">Questions</div>
                <div className="col-span-3 text-right">Marks</div>
              </div>
              <div className="divide-y divide-slate-100 bg-white">
                {compactSubjects.map((row, idx) => (
                  <div key={idx} className="px-3 py-1.5 grid grid-cols-12 items-center text-xs text-slate-700">
                    <div className="col-span-6 font-semibold text-slate-900">{row.name}</div>
                    <div className="col-span-3 text-center font-medium text-slate-600">{row.questions}</div>
                    <div className="col-span-3 text-right font-bold text-indigo-600">{row.marks}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Condensed 3-Bullet Rules */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-1.5 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                <span><strong>59s timer per question</strong> with auto-advance.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                <span><strong>+1.0 mark</strong> for correct, <strong>-0.33</strong> for incorrect.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>Proctored:</strong> Tab switching triggers instant auto-submit.</span>
              </div>
            </div>

            {/* 4. Footer Streamlining: Agreement Checkbox & Actions Button */}
            <div className="pt-2.5 border-t border-slate-100 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={agreedToRules} 
                  onChange={(e) => setAgreedToRules(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                />
                <span className="text-[11px] sm:text-xs">I agree to all tournament examination rules.</span>
              </label>

              <div className="flex items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setStep('language');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <button
                  id="pre-quiz-done-start-test-btn"
                  type="button"
                  disabled={!agreedToRules}
                  onClick={() => {
                    soundFx.playSuccess();
                    onDoneStartTest();
                  }}
                  className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                    !agreedToRules ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:brightness-105'
                  }`}
                  style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #059669 100%)' }}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                  <span>Done — Start Test (10 Mins)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
