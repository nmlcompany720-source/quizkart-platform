import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { soundFx } from '../utils/audio';
import { Question } from '../types';

// Website Primary Brand Gradient Style
const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';
const BRAND_TEXT_STYLE: React.CSSProperties = {
  backgroundImage: BRAND_GRADIENT,
  WebkitBackgroundImage: BRAND_GRADIENT,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: '#417CF4',
};

interface PreQuizOnboardingProps {
  selectedLanguage: 'English' | 'Hindi';
  onSelectLanguage: (lang: 'English' | 'Hindi') => void;
  onDoneStartTest: () => void;
  onExit: () => void;
  totalQuestions?: number;
  totalDurationMinutes?: number;
  prizeTitle?: string;
  isPractice?: boolean;
  questions?: Question[];
  negativeMarks?: number;
}

// Category Subject Translations for Hindi/English
const translateSubject = (name: string, lang: 'English' | 'Hindi'): string => {
  if (lang !== 'Hindi') return name;
  const map: Record<string, string> = {
    'Science': 'विज्ञान',
    'Science & Tech': 'विज्ञान और प्रौद्योगिकी',
    'Geography': 'भूगोल',
    'Geography & Nature': 'भूगोल और प्रकृति',
    'History': 'इतिहास',
    'Indian Heritage': 'भारतीय विरासत व इतिहास',
    'GK & CA': 'सामान्य ज्ञान व समसामयिकी',
    'General Knowledge': 'सामान्य ज्ञान',
    'Current Affairs': 'समसामयिकी',
    'Tie-Breaker': 'टाई-ब्रेकर'
  };
  return map[name] || name;
};

export const PreQuizOnboarding: React.FC<PreQuizOnboardingProps> = ({
  selectedLanguage,
  onSelectLanguage,
  onDoneStartTest,
  onExit,
  totalQuestions = 10,
  totalDurationMinutes = 10,
  isPractice = false,
  questions = [],
  negativeMarks = 0.33
}) => {
  const [step, setStep] = useState<'language' | 'instructions'>('language');
  const [agreedToRules, setAgreedToRules] = useState<boolean>(false);

  // Dynamic Subject Breakdown aggregated from Admin Question Bank
  const subjectList = useMemo(() => {
    if (questions && questions.length > 0) {
      const map: Record<string, number> = {};
      questions.forEach((q) => {
        const cat = q.category || 'General Knowledge';
        map[cat] = (map[cat] || 0) + 1;
      });
      return Object.entries(map).map(([name, count]) => ({
        name,
        questions: count,
        marks: count * 1,
      }));
    }
    // Default standard breakdown
    return [
      { name: 'Science', questions: 4, marks: 4 },
      { name: 'Geography', questions: 4, marks: 4 },
      { name: 'History', questions: 4, marks: 4 },
      { name: 'GK & CA', questions: 4, marks: 4 },
      { name: 'Tie-Breaker', questions: 3, marks: 3 },
    ];
  }, [questions]);

  const totalQuestionsCalculated = subjectList.reduce((acc, s) => acc + s.questions, 0);
  const totalMarksCalculated = subjectList.reduce((acc, s) => acc + s.marks, 0);
  const effectiveTotalQuestions = questions.length > 0 ? questions.length : (totalQuestions || totalQuestionsCalculated);
  const effectiveTotalMarks = totalMarksCalculated || effectiveTotalQuestions;

  // Persist user selected language preference globally across session
  const handleLanguageSelect = (lang: 'English' | 'Hindi') => {
    try {
      localStorage.setItem('quizkart_selected_language', lang);
      sessionStorage.setItem('quizkart_selected_language', lang);
    } catch {}
    onSelectLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-slate-900/60 backdrop-blur-sm fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col my-auto"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Compact Header Bar with Signature Gradient Accent */}
        <div 
          className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 flex items-center justify-between bg-white"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              Q
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                {step === 'language' 
                  ? (selectedLanguage === 'Hindi' ? 'भाषा चुनें' : 'Select Language') 
                  : (selectedLanguage === 'Hindi' ? 'परीक्षण निर्देश' : 'Test Instructions')}
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
          <div 
            className="p-4 sm:p-5 space-y-4 bg-white"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* Sleek, compact horizontal radio tiles side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Tile: [En] English */}
              <button
                type="button"
                id="language-tile-english"
                onClick={() => {
                  soundFx.playClick();
                  handleLanguageSelect('English');
                }}
                className="p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between text-left shadow-xs"
                style={
                  selectedLanguage === 'English'
                    ? {
                        border: '2px solid transparent',
                        background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%) border-box',
                        boxShadow: '0 4px 12px rgba(65, 124, 244, 0.2)'
                      }
                    : {
                        border: '2px solid #e2e8f0',
                        background: '#ffffff'
                      }
                }
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-7 h-7 rounded-lg text-white shadow-xs flex items-center justify-center font-black text-xs shrink-0"
                    style={{ background: BRAND_GRADIENT }}
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
                      ? { background: BRAND_GRADIENT } 
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
                  handleLanguageSelect('Hindi');
                }}
                className="p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between text-left shadow-xs"
                style={
                  selectedLanguage === 'Hindi'
                    ? {
                        border: '2px solid transparent',
                        background: 'linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%) border-box',
                        boxShadow: '0 4px 12px rgba(65, 124, 244, 0.2)'
                      }
                    : {
                        border: '2px solid #e2e8f0',
                        background: '#ffffff'
                      }
                }
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-7 h-7 rounded-lg text-white shadow-xs flex items-center justify-center font-black text-xs shrink-0"
                    style={{ background: BRAND_GRADIENT }}
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
                      ? { background: BRAND_GRADIENT } 
                      : undefined
                  }
                >
                  {selectedLanguage === 'Hindi' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>

            {/* Bottom Footer Action: Both Cancel & Proceed (Arrow '→' completely removed) */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                id="pre-quiz-cancel-btn"
                onClick={() => {
                  soundFx.playClick();
                  onExit();
                }}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 font-bold text-xs hover:bg-slate-100 active:scale-98 transition-all cursor-pointer border border-slate-200 bg-white"
              >
                {selectedLanguage === 'Hindi' ? 'रद्द करें' : 'Cancel'}
              </button>

              <button
                id="pre-quiz-continue-to-step2"
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setStep('instructions');
                }}
                className="px-6 py-2 rounded-xl text-white font-bold text-xs shadow-sm hover:opacity-95 active:scale-98 transition-all flex items-center justify-center cursor-pointer"
                style={{ background: BRAND_GRADIENT }}
              >
                <span>{selectedLanguage === 'Hindi' ? 'आगे बढ़ें' : 'Proceed'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SUMMARY STATS STRIP, COMPACT TABLE & CONDENSED RULES (Test Instructions) */}
        {step === 'instructions' && (
          <div 
            className="p-4 sm:p-5 space-y-3.5 bg-white"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* 1. Four Top Summary Boxes: Pure White Background (#FFFFFF) & Internal Icons Removed */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <div 
                className="px-2 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[11px] sm:text-xs font-bold text-slate-900 shadow-2xs text-center"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <span className="truncate">{totalDurationMinutes} {selectedLanguage === 'Hindi' ? 'मिनट' : 'Mins'}</span>
              </div>

              <div 
                className="px-2 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[11px] sm:text-xs font-bold text-slate-900 shadow-2xs text-center"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <span className="truncate">{effectiveTotalQuestions} {selectedLanguage === 'Hindi' ? 'प्रश्न' : 'Questions'}</span>
              </div>

              <div 
                className="px-2 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[11px] sm:text-xs font-bold text-slate-900 shadow-2xs text-center"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <span className="truncate">{effectiveTotalMarks} {selectedLanguage === 'Hindi' ? 'अंक' : 'Marks'}</span>
              </div>

              <div 
                className="px-2 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[11px] sm:text-xs font-black text-red-600 shadow-2xs text-center"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <span className="truncate">-{negativeMarks} {selectedLanguage === 'Hindi' ? 'नेगेटिव' : 'Neg'}</span>
              </div>
            </div>

            {/* Medium Selector: Dark black 'Medium:' text with Brand Gradient Selected Text and Link */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-semibold" style={{ color: '#000000' }}>
                {selectedLanguage === 'Hindi' ? 'माध्यम:' : 'Medium:'}{' '}
                <strong style={BRAND_TEXT_STYLE} className="font-extrabold ml-1">
                  {selectedLanguage === 'Hindi' ? 'हिन्दी' : 'English'}
                </strong>
              </span>
              <button
                type="button"
                id="pre-quiz-change-medium-link"
                onClick={() => {
                  soundFx.playClick();
                  setStep('language');
                }}
                style={BRAND_TEXT_STYLE}
                className="font-extrabold underline cursor-pointer text-xs transition-opacity hover:opacity-85"
              >
                {selectedLanguage === 'Hindi' ? 'माध्यम बदलें' : 'Change Medium'}
              </button>
            </div>

            {/* 2. Subject Breakdown Table: Header pure white (#FFFFFF), dark black text, and Total row */}
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs bg-white shadow-2xs">
              <div 
                className="px-3 py-2 font-black grid grid-cols-12 text-[11px] uppercase tracking-wider border-b border-slate-200 bg-white"
                style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
              >
                <div className="col-span-6" style={{ color: '#000000' }}>
                  {selectedLanguage === 'Hindi' ? 'विषय' : 'Subject'}
                </div>
                <div className="col-span-3 text-center" style={{ color: '#000000' }}>
                  {selectedLanguage === 'Hindi' ? 'प्रश्न' : 'Questions'}
                </div>
                <div className="col-span-3 text-right" style={{ color: '#000000' }}>
                  {selectedLanguage === 'Hindi' ? 'अंक' : 'Marks'}
                </div>
              </div>
              <div className="divide-y divide-slate-100 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                {subjectList.map((row, idx) => (
                  <div key={idx} className="px-3 py-2 grid grid-cols-12 items-center text-xs bg-white">
                    <div className="col-span-6 font-semibold" style={{ color: '#000000' }}>
                      {translateSubject(row.name, selectedLanguage)}
                    </div>
                    <div className="col-span-3 text-center font-bold" style={{ color: '#000000' }}>
                      {row.questions}
                    </div>
                    <div className="col-span-3 text-right font-bold" style={{ color: '#000000' }}>
                      {row.marks}
                    </div>
                  </div>
                ))}
                {/* Dynamic Total Summary Row */}
                <div 
                  className="px-3 py-2.5 grid grid-cols-12 items-center text-xs font-black border-t-2 border-slate-200 bg-white"
                  style={{ backgroundColor: '#FFFFFF', color: '#000000' }}
                >
                  <div className="col-span-6 font-black uppercase tracking-wide" style={{ color: '#000000' }}>
                    {selectedLanguage === 'Hindi' ? 'कुल' : 'Total'}
                  </div>
                  <div className="col-span-3 text-center font-black" style={{ color: '#000000' }}>
                    {totalQuestionsCalculated}
                  </div>
                  <div className="col-span-3 text-right font-black" style={{ color: '#000000' }}>
                    {totalMarksCalculated}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Instructions List: Pure white box background (#FFFFFF), Primary Blue bullets, dynamic rules and bilingual text */}
            <div 
              className="rounded-xl bg-white border border-slate-200 p-3 space-y-2 text-xs text-slate-700"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>प्रश्न टाइमर:</strong> प्रत्येक प्रश्न के लिए 59 सेकंड का समय, समय समाप्त होने पर स्वतः अगले प्रश्न पर अग्रसर।</>
                  ) : (
                    <><strong>Question Timer:</strong> 59s timer per question with auto-advance to the next question.</>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>अंकन योजना:</strong> प्रत्येक सही उत्तर पर <strong>+1.0 अंक</strong>, गलत उत्तर पर <strong>-0.33 नकारात्मक अंकन</strong>।</>
                  ) : (
                    <><strong>Marking Scheme:</strong> <strong>+1.0 mark</strong> for each correct answer, <strong>-0.33</strong> for incorrect answer.</>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>प्रॉक्टर्ड परीक्षा:</strong> परीक्षा के दौरान विंडो मिनिमाइज़ करना या टैब बदलना सख्त मना है (स्वतः सबमिट होगा)।</>
                  ) : (
                    <><strong>Anti-Cheating Proctored:</strong> Tab switching or minimizing window triggers instant auto-submit.</>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>इंटरनेट स्थिरता:</strong> स्थिर इंटरनेट कनेक्शन बनाए रखें। परीक्षा शुरू होने के बाद दोबारा मौका नहीं मिलेगा।</>
                  ) : (
                    <><strong>Internet Stability:</strong> Ensure a stable internet connection. No re-attempts allowed once started.</>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                <span className="leading-relaxed">
                  {selectedLanguage === 'Hindi' ? (
                    <><strong>एंटी-बॉट नीति:</strong> एक से अधिक लॉगिन या स्वचालित स्क्रिप्ट का उपयोग करने पर तुरंत अयोग्य घोषित किया जाएगा।</>
                  ) : (
                    <><strong>Anti-Bot Policy:</strong> Multiple logins or automated scripts trigger immediate disqualification.</>
                  )}
                </span>
              </div>
            </div>

            {/* 4. Agreement Checkbox & Buttons: Gate start with checkbox, Back button with brand gradient, Start Test button translated to 'परीक्षण शुरू करें' */}
            <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={agreedToRules} 
                  onChange={(e) => setAgreedToRules(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                />
                <span className="text-[11px] sm:text-xs font-medium">
                  {selectedLanguage === 'Hindi' 
                    ? 'मैं परीक्षा के सभी नियमों और शर्तों से सहमत हूँ।' 
                    : 'I agree to all tournament examination rules.'}
                </span>
              </label>

              <div className="flex items-center justify-between gap-2.5 pt-1">
                {/* Back Button: Styled with primary website brand gradient/color */}
                <button
                  type="button"
                  id="pre-quiz-back-btn"
                  onClick={() => {
                    soundFx.playClick();
                    setStep('language');
                  }}
                  className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm hover:opacity-95 active:scale-98 transition-all flex items-center justify-center cursor-pointer"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <span>{selectedLanguage === 'Hindi' ? 'वापस' : 'Back'}</span>
                </button>

                {/* Start Button: Left-side icon removed, text translated to 'परीक्षण शुरू करें' when in Hindi mode, gated by checkbox */}
                <button
                  id="pre-quiz-done-start-test-btn"
                  type="button"
                  disabled={!agreedToRules}
                  onClick={() => {
                    if (!agreedToRules) return;
                    soundFx.playSuccess();
                    onDoneStartTest();
                  }}
                  className={`px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center cursor-pointer active:scale-98 ${
                    !agreedToRules ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:brightness-105'
                  }`}
                  style={{ background: BRAND_GRADIENT }}
                >
                  <span>{selectedLanguage === 'Hindi' ? 'परीक्षण शुरू करें' : 'Start Test'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

