import React from 'react';
import { Sparkles, ShieldCheck, Heart, Mail, Phone, MapPin, Award, CheckCircle2 } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface FooterProps {
  onNavigate: (tab: 'home' | 'quiz_arena' | 'leaderboard' | 'transparency' | 'profile' | 'terms_conditions' | 'privacy_policy') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer id="main-footer" className="bg-slate-50 text-slate-600 border-t border-slate-200 text-xs mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Mission */}
          <div className="space-y-3.5 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm"
                style={{ background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)' }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span 
                className="text-lg font-black tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                QuizKart.in
              </span>
            </div>
            <p className="text-slate-600 max-w-sm leading-relaxed text-xs">
              India's premier 100% skill-based daily quiz arena. Win verified e-commerce products delivered straight from Amazon & Meesho, and automated UPI cashbacks with full mathematical transparency.
            </p>
            <div className="flex items-center gap-2 pt-1 text-xs text-emerald-700 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Exempted Game of Skill under Indian Legal Standards</span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Quick Navigation</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('home'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600"
                >
                  Home & Today's Prize
                </button>
              </li>
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('leaderboard'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600"
                >
                  Live Leaderboard & Ranks
                </button>
              </li>
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('transparency'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600"
                >
                  50-45-5 Pool Transparency
                </button>
              </li>
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('profile'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600"
                >
                  Delivery Address & UPI Wallet
                </button>
              </li>
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('terms_conditions'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600 font-semibold"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  onClick={() => { soundFx.playClick(); onNavigate('privacy_policy'); }}
                  className="hover:text-slate-900 transition-colors cursor-pointer text-slate-600 font-semibold"
                >
                  Privacy Policy
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance Disclaimers */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Support & Compliance</h4>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>support@quizkart.in</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>+91 80 4928 1000 (10 AM - 7 PM IST)</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Koramangala, Bengaluru, Karnataka 560034</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer Box (Image 5 Restricted States Statutory Notice) */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1.5 shadow-xs">
          <div className="font-bold text-slate-900">Skill-Gaming Statutory Notice:</div>
          <p>
            This quiz is a 100% test of skill, factual knowledge, and recall speed (not gambling or betting). Outcomes are determined solely by participant accuracy and elapsed response time. Strictly open only to Indian citizens aged 18+. Residents of <strong>Assam, Odisha, Telangana, Andhra Pradesh</strong>, and other pay-to-play restricted states are strictly prohibited from participating in paid tournaments. Any violation will result in immediate account suspension and permanent wallet balance forfeiture.
          </p>
        </div>

        {/* Bottom copyright & Centered Branding */}
        <div className="pt-6 border-t border-slate-200 flex flex-col items-center justify-center gap-2 text-center text-slate-500 text-xs">
          <div className="flex items-center justify-center gap-1.5 text-slate-700 font-semibold text-xs">
            <span>Crafted for Indian Quizzers with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </div>
          <p className="text-[11px] text-slate-400">
            © {new Date().getFullYear()} QuizKart.in Technologies Private Limited. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

