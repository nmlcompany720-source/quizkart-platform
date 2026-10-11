import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, FileText, Lock } from 'lucide-react';
import { soundFx } from '../utils/audio';

export const BRAND_GRADIENT = 'linear-gradient(135deg, #5F69EF 0%, #417CF4 35%, #3A81F5 65%, #20A5AC 100%)';

interface LegalPolicyPageProps {
  policyType: 'terms' | 'privacy';
  onBack: () => void;
  onAcceptAndBack?: () => void;
  onSwitchPolicy?: (type: 'terms' | 'privacy') => void;
}

export const LegalPolicyPage: React.FC<LegalPolicyPageProps> = ({
  policyType,
  onBack,
  onAcceptAndBack
}) => {
  // Render all legal text in English by default; toggle dynamically converts entire page to Hindi
  const [language, setLanguage] = useState<'en' | 'hi'>('en');

  const handleToggleLanguage = () => {
    soundFx.playClick();
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  const isTerms = policyType === 'terms';

  return (
    <div
      id={isTerms ? 'full-page-terms-conditions' : 'full-page-privacy-policy'}
      className="min-h-screen w-full bg-white text-slate-900 flex flex-col antialiased"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Top Brand Gradient Accent Bar */}
      <div className="w-full h-2 shrink-0" style={{ background: BRAND_GRADIENT }} />

      {/* Sticky Top Header with Back Button, Title & Top-Right Dynamic Language Switcher */}
      <header
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              id="legal-page-back-btn"
              onClick={() => {
                soundFx.playClick();
                onBack();
              }}
              className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer shrink-0"
              style={{ background: BRAND_GRADIENT }}
              title={language === 'en' ? 'Back' : 'वापस जाएं'}
              aria-label={language === 'en' ? 'Back' : 'वापस जाएं'}
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl text-white hidden sm:flex items-center justify-center shadow-xs shrink-0"
                style={{ background: BRAND_GRADIENT }}
              >
                {isTerms ? <FileText className="w-4 h-4 text-white" /> : <Lock className="w-4 h-4 text-white" />}
              </div>
              <div className="min-w-0">
                <h1
                  className="text-base sm:text-xl font-black tracking-tight truncate"
                  style={{
                    background: BRAND_GRADIENT,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}
                >
                  {isTerms
                    ? language === 'en'
                      ? 'Terms & Conditions'
                      : 'नियम और शर्तें'
                    : language === 'en'
                    ? 'Privacy Policy'
                    : 'गोपनीयता नीति'}
                </h1>
              </div>
            </div>
          </div>

          {/* Top-Right Dynamic Language Toggle Button (Globe Icon Removed) */}
          <button
            type="button"
            id="legal-language-toggle-btn"
            onClick={handleToggleLanguage}
            style={{ background: BRAND_GRADIENT }}
            className="px-3.5 sm:px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0"
          >
            <span>{language === 'en' ? 'Switch to Hindi' : 'Switch to English'}</span>
          </button>
        </div>
      </header>

      {/* Main Full-Page Legal Content Container */}
      <main
        className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 bg-white"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* ===================================================================== */}
        {/* VIEW A: COMPREHENSIVE TERMS & CONDITIONS                              */}
        {/* ===================================================================== */}
        {isTerms ? (
          <div className="space-y-6 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
            {/* Certification Heading & Text Rendered Plainly on Clean Page Without Card/Box Wrapper */}
            <div className="space-y-1.5 text-xs sm:text-sm bg-white" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="font-black text-slate-900 text-sm sm:text-base">
                {language === 'en'
                  ? '100% Certified Game of Skill — Not Gambling or Betting'
                  : '100% प्रमाणित कौशल का खेल (Game of Skill) — जुआ या सट्टेबाजी नहीं'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'en'
                  ? 'QuizKart operates strictly as a competitive knowledge, memory recall, and speed-based quiz platform governed under Indian constitutional and judicial protections for Games of Skill.'
                  : 'QuizKart पूर्णतः भारतीय कानूनों और सर्वोच्च न्यायालय के दिशानिर्देशों के अंतर्गत एक 100% ज्ञान, स्मरण शक्ति और गति-आधारित कौशल प्रतियोगिता (Game of Skill) मंच के रूप में कार्य करता है।'}
              </p>
            </div>

            {/* Section 1 */}
            <section className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  1
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Skill-Gaming Certification & Legal Status'
                    : 'कौशल-आधारित गेमिंग प्रमाणन और कानूनी स्थिति'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'QuizKart is a 100% skill, factual knowledge, and response-speed competitive quiz platform. It does not involve any element of chance, dice, roulette, lottery, betting, or gambling. Under established Indian legal standards (including the Public Gambling Act, 1867 exemptions for games of mere skill), competitions where the outcome is determined predominantly by a participant’s superior knowledge, training, attention, and speed are legally recognized as protected Games of Skill.'
                  : 'QuizKart एक 100% कौशल, सामान्य ज्ञान और उत्तर देने की गति पर आधारित प्रतियोगी क्विज़ प्लेटफॉर्म है। इसमें किसी भी प्रकार के संयोग, लॉटरी, सट्टेबाजी या जुए (Gambling/Betting) का कोई स्थान नहीं है। भारतीय विधिक मानकों (पब्लिक गैंबलिंग एक्ट, 1867 के अंतर्गत कौशल के खेलों को प्राप्त छूट सहित) के अनुसार, वे प्रतियोगिताएं जिनमें परिणाम प्रतिभागी के ज्ञान, प्रशिक्षण, एकाग्रता और गति से तय होता है, पूर्णतः वैध "कौशल के खेल" (Game of Skill) हैं।'}
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  2
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Eligibility Requirements (Strictly 18+ & Indian Citizens Only)'
                    : 'पात्रता आवश्यकताएँ (केवल 18+ वर्ष की आयु और भारतीय नागरिक)'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'Access to QuizKart and participation in any tournament is strictly restricted to individuals who are at least 18 years of age (18+) at the time of registration and are legal citizens and residents of India. Minors (below 18 years) and non-residents are strictly prohibited from creating an account, adding funds to the wallet, or entering any quiz round. QuizKart reserves the right to request age and identity verification at any stage.'
                  : 'QuizKart पर खाता बनाने और किसी भी प्रतियोगिता में भाग लेने के लिए उपयोगकर्ता की आयु पंजीकरण के समय कम से कम 18 वर्ष (18+) होनी चाहिए और वह भारत का वैध नागरिक एवं निवासी होना चाहिए। 18 वर्ष से कम आयु के नाबालिगों को खाता बनाने, वॉलेट में पैसे जोड़ने या किसी भी क्विज़ में भाग लेने की सख्त मनाही है। प्लेटफॉर्म किसी भी समय आयु और पहचान के प्रमाण की मांग कर सकता है।'}
              </p>
            </section>

            {/* Section 3: Restricted States Statutory Notice Integrated Cleanly */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  3
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Restricted States Statutory Notice & Forfeiture Policy'
                    : 'प्रतिबंधित राज्यों के लिए वैधानिक सूचना और बैलेंस जब्ती नीति'}
                </h3>
              </div>
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8 space-y-2">
                <p>
                  {language === 'en' ? (
                    <>
                      Residents of <strong>Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim</strong>, as well as any other state or jurisdiction in India where pay-to-play online skill competitions are prohibited by local statute, are <strong>strictly prohibited from participating in paid tournaments or depositing funds</strong> on QuizKart.
                    </>
                  ) : (
                    <>
                      <strong>असम, ओडिशा, तेलंगाना, आंध्र प्रदेश, नागालैंड और सिक्किम</strong> तथा भारत के किसी भी अन्य राज्य या क्षेत्र (जहाँ स्थानीय कानूनों द्वारा सशुल्क ऑनलाइन कौशल-आधारित प्रतियोगिताओं पर प्रतिबंध है) के निवासियों को QuizKart पर <strong>सशुल्क टूर्नामेंट में भाग लेने या वॉलेट में धनराशि जमा करने की सख्त मनाही है</strong>।
                    </>
                  )}
                </p>
                <p>
                  {language === 'en'
                    ? 'By registering or depositing funds, you legally affirm that you are not a resident of, nor accessing the platform from, any restricted state. Any violation, misrepresentation of residency, or attempt to bypass regional restrictions will result in immediate account suspension and permanent forfeiture of your wallet balance and winnings without prior notice.'
                    : 'पंजीकरण या डिपॉजिट करते समय आप यह पुष्टि करते हैं कि आप किसी भी प्रतिबंधित राज्य के निवासी नहीं हैं। इस नियम का किसी भी प्रकार से उल्लंघन करने या गलत जानकारी देने पर बिना किसी पूर्व सूचना के तत्काल खाता निलंबित (Account Suspension) कर दिया जाएगा और आपका संपूर्ण वॉलेट बैलेंस एवं पुरस्कार राशि स्थायी रूप से जब्त (Forfeit) कर ली जाएगी।'}
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  4
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Tournament Rules, Scoring Formula & Tie-Breaker'
                    : 'टूर्नामेंट नियम, स्कोरिंग प्रणाली और टाई-ब्रेकर'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'Every live quiz tournament presents objective multiple-choice questions. Each correct response awards +1.0 point, each incorrect response incurs a -0.33 negative mark, and unattempted questions carry 0 points. Final leaderboard standings are ranked first by the highest net score, and in the event of an exact score tie, the contestant who completed and submitted the quiz in the shortest elapsed time is ranked higher.'
                  : 'प्रत्येक लाइव क्विज़ प्रतियोगिता में वस्तुनिष्ठ बहुविकल्पीय प्रश्न होते हैं। प्रत्येक सही उत्तर के लिए +1.0 अंक दिया जाता है, प्रत्येक गलत उत्तर पर -0.33 की नेगेटिव मार्किंग होती है, और छोड़े गए प्रश्नों के लिए 0 अंक मिलते हैं। लीडरबोर्ड रैंकिंग में सबसे पहले उच्चतम कुल स्कोर देखा जाता है, और समान स्कोर होने (Tie) की स्थिति में सबसे कम समय में क्विज़ पूरा करने वाले प्रतिभागी को उच्च रैंक दी जाती है।'}
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  5
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Fair Play, Anti-Cheating & Automated Proctoring'
                    : 'निष्पक्ष खेल (Fair Play), एंटी-चीटिंग और प्रॉक्टरिंग'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'QuizKart enforces strict real-time proctoring during live contests. Switching browser tabs, minimizing the window, opening split-screen apps, taking screenshots, using AI/search assistants, running automated scripts/bots, or operating multiple accounts is strictly forbidden. Any detected violation automatically submits the quiz with 0 points and flags the account for permanent suspension by Admin.'
                  : 'QuizKart लाइव प्रतियोगिता के दौरान सख्त रीयल-टाइम सुरक्षा निगरानी (Proctoring) लागू करता है। क्विज़ के दौरान ब्राउज़र टैब बदलना, विंडो मिनिमाइज़ करना, स्प्लिट-स्क्रीन का उपयोग करना, स्क्रीनशॉट लेना, बाहरी सहायता या बॉट्स का उपयोग करना, अथवा एक से अधिक खाते चलाना सख्त वर्जित है। किसी भी उल्लंघन का पता चलने पर क्विज़ तुरंत 0 अंकों के साथ ऑटो-सबमिट हो जाएगा और एडमिन द्वारा खाता ब्लॉक कर दिया जाएगा।'}
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  6
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Wallet Deposits, Entry Fees & Bank Withdrawals'
                    : 'वॉलेट डिपॉजिट, प्रवेश शुल्क और बैंक निकासी नियम'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'The minimum deposit amount is ₹100 via the official UPI QR code accompanied by a valid 12-digit UTR number and payment screenshot proof. Deposit verification takes 24–48 hours. Submitting fake, duplicate, or edited UTR screenshots will result in immediate account blocking. Bank withdrawals are permitted between a minimum of ₹100 and a maximum of ₹5,000 per request to a verified Indian bank account with a valid IFSC code.'
                  : 'आधिकारिक UPI QR कोड के माध्यम से न्यूनतम डिपॉजिट राशि ₹100 है, जिसके साथ वैध 12-अंकीय UTR नंबर और भुगतान स्क्रीनशॉट अपलोड करना अनिवार्य है। डिपॉजिट सत्यापन में 24–48 घंटे का समय लगता है। नकली या एडिटेड स्क्रीनशॉट/UTR जमा करने पर खाता तुरंत ब्लॉक कर दिया जाएगा। बैंक निकासी (Withdrawal) की सीमा प्रति अनुरोध न्यूनतम ₹100 और अधिकतम ₹5,000 है।'}
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  7
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Account Deletion, 30-Day Lock & Governing Law'
                    : 'खाता हटाना, 30-दिन का लॉक और लागू कानून'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'Users may delete their account at any time from their Profile page. Once deleted, the associated email address is blocked from logging in or re-registering for 30 days. These Terms & Conditions are governed by and construed in accordance with the laws of India, and any disputes shall be subject to the exclusive jurisdiction of the courts in Jaipur, Rajasthan, India.'
                  : 'उपयोगकर्ता किसी भी समय अपने प्रोफ़ाइल पेज से अपना खाता हटा सकते हैं। खाता हटाने के बाद संबंधित ईमेल पते को सुरक्षा कारणों से 30 दिनों के लिए लॉगिन या पुनः पंजीकरण से ब्लॉक कर दिया जाता है। ये नियम और शर्तें भारतीय कानूनों द्वारा शासित हैं और किसी भी विवाद का न्यायक्षेत्र जयपुर, राजस्थान, भारत के न्यायालय होंगे।'}
              </p>
            </section>
          </div>
        ) : (
          /* ===================================================================== */
          /* VIEW B: COMPREHENSIVE PRIVACY POLICY                                  */
          /* ===================================================================== */
          <div className="space-y-6 bg-white" style={{ backgroundColor: '#FFFFFF' }}>
            {/* Strict Data Privacy Heading & Text Rendered Plainly & Cleanly on Solid White (#FFFFFF) Without Card Wrapper or Lock Icon */}
            <div className="space-y-1.5 text-xs sm:text-sm bg-white" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="font-black text-slate-900 text-sm sm:text-base">
                {language === 'en'
                  ? 'Strict Data Privacy, Encryption & Zero Marketing Sharing'
                  : 'कठोर डेटा गोपनीयता, एन्क्रिप्शन और शून्य मार्केटिंग साझाकरण'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'en'
                  ? 'Your personal identity, email session presence, and financial records are encrypted and used exclusively for tournament operations and verified prize settlements.'
                  : 'आपकी व्यक्तिगत पहचान, ईमेल सेशन और वित्तीय जानकारी पूरी तरह एन्क्रिप्टेड हैं और इनका उपयोग केवल टूर्नामेंट संचालन एवं पुरस्कार वितरण के लिए किया जाता है।'}
              </p>
            </div>

            {/* Section 1 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  1
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Information & Personal Data We Collect'
                    : 'हमारे द्वारा एकत्रित की जाने वाली व्यक्तिगत जानकारी और डेटा'}
                </h3>
              </div>
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8 space-y-2">
                <p>
                  {language === 'en'
                    ? 'QuizKart collects only essential information required to operate legal skill-based tournaments, verify participant identity, and process wallet transactions:'
                    : 'QuizKart केवल कानूनी कौशल-आधारित टूर्नामेंट संचालित करने, प्रतिभागी की पहचान सत्यापित करने और वॉलेट लेनदेन पूरा करने के लिए आवश्यक डेटा ही एकत्र करता है:'}
                </p>
                <ul className="list-disc list-inside pl-0 ml-0 space-y-1.5">
                  <li>
                    {language === 'en' ? (
                      <>
                        <strong>Identity & Profile Information:</strong> Full Name, Email Address, Mobile Number with Country Calling Code, Profile Avatar, and unique User ID (e.g., USR-1001).
                      </>
                    ) : (
                      <>
                        <strong>पहचान और प्रोफ़ाइल विवरण:</strong> पूरा नाम, ईमेल पता, कंट्री कोड के साथ मोबाइल नंबर, प्रोफ़ाइल अवतार और विशिष्ट यूजर आईडी (जैसे USR-1001)।
                      </>
                    )}
                  </li>
                  <li>
                    {language === 'en' ? (
                      <>
                        <strong>Financial & Transaction Metadata:</strong> Deposit amounts, 12-digit UPI UTR/Reference numbers, payment confirmation screenshots, Bank Account Holder Name, Bank Account Number, IFSC Code (for withdrawals), and shipping address for physical product rewards.
                      </>
                    ) : (
                      <>
                        <strong>वित्तीय और लेनदेन मेटाडेटा:</strong> डिपॉजिट राशि, 12-अंकीय UPI UTR नंबर, भुगतान स्क्रीनशॉट, बैंक खाताधारक का नाम, खाता संख्या, IFSC कोड (निकासी के लिए), और उत्पाद पुरस्कारों की डिलीवरी का पता।
                      </>
                    )}
                  </li>
                  <li>
                    {language === 'en' ? (
                      <>
                        <strong>Device, IP & Proctoring Telemetry:</strong> IP address, browser/device type, real-time active email session status, and focus/blur integrity signals during live quiz rounds.
                      </>
                    ) : (
                      <>
                        <strong>डिवाइस, IP और सुरक्षा टेलीमेट्री:</strong> IP पता, ब्राउज़र/डिवाइस जानकारी, रीयल-टाइम सक्रिय ईमेल सेशन स्थिति, और लाइव क्विज़ के दौरान एंटी-चीटिंग सुरक्षा सिग्नल।
                      </>
                    )}
                  </li>
                  <li>
                    {language === 'en' ? (
                      <>
                        <strong>Restricted States Statutory Compliance:</strong> Residents of <strong>Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim</strong> (and any other jurisdiction where pay-to-play online skill competitions are prohibited by local statute) are strictly prohibited from participating in paid tournaments or depositing funds on QuizKart. Any violation results in immediate account suspension and permanent forfeiture of wallet balance and winnings.
                      </>
                    ) : (
                      <>
                        <strong>प्रतिबंधित राज्यों के लिए वैधानिक अनुपालन:</strong> <strong>असम, ओडिशा, तेलंगाना, आंध्र प्रदेश, नागालैंड और सिक्किम</strong> (तथा अन्य ऐसे राज्य जहाँ सशुल्क कौशल खेल प्रतिबंधित हैं) के निवासियों को सशुल्क टूर्नामेंट में भाग लेने या धनराशि जमा करने की सख्त मनाही है। उल्लंघन करने पर तत्काल खाता निलंबित कर दिया जाएगा और वॉलेट बैलेंस जब्त कर लिया जाएगा।
                      </>
                    )}
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 2 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  2
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'How We Use Your Information'
                    : 'हम आपकी जानकारी का उपयोग कैसे करते हैं'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'Your collected data is used strictly for: (a) authenticating your account and synchronizing your unique User ID across your Profile and the Admin system; (b) verifying UPI deposits and disbursing bank withdrawals accurately; (c) calculating live quiz scores and leaderboard rankings; and (d) preventing multi-accounting, UTR fraud, and participation from restricted states (Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim).'
                  : 'एकत्र किए गए डेटा का उपयोग केवल इन उद्देश्यों के लिए किया जाता है: (क) आपके खाते को प्रमाणित करना और आपकी यूजर आईडी को प्रोफ़ाइल एवं एडमिन सिस्टम के बीच सिंक रखना; (ख) UPI डिपॉजिट का सत्यापन और बैंक निकासी का सुरक्षित भुगतान करना; (ग) लाइव क्विज़ स्कोर और लीडरबोर्ड रैंक की गणना करना; तथा (घ) धोखाधड़ी, एकाधिक खातों और प्रतिबंधित राज्यों (असम, ओडिशा, तेलंगाना, आंध्र प्रदेश, नागालैंड और सिक्किम) से भागीदारी को रोकना।'}
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  3
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Data Protection, Encryption & Zero Marketing Disclosure'
                    : 'डेटा सुरक्षा, एन्क्रिप्शन और तृतीय-पक्ष मार्केटिंग से सुरक्षा'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'All user profiles, wallet balances, and transaction histories are safeguarded using industry-standard encryption and strict access controls. QuizKart NEVER sells, rents, trades, or shares your personal data, email address, mobile number, or banking details with third-party marketing agencies, spam networks, or external advertisers.'
                  : 'सभी उपयोगकर्ता प्रोफ़ाइल, वॉलेट बैलेंस और लेनदेन रिकॉर्ड उच्च-स्तरीय एन्क्रिप्शन और कड़े सुरक्षा नियंत्रणों द्वारा सुरक्षित रखे जाते हैं। QuizKart आपकी व्यक्तिगत जानकारी, ईमेल पता, मोबाइल नंबर या बैंक विवरण किसी भी तृतीय-पक्ष मार्केटिंग एजेंसी, विज्ञापनदाता या बाहरी ब्रोकर को कभी नहीं बेचता या साझा नहीं करता है।'}
              </p>
            </section>

            {/* Section 4 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  4
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Account Deletion Workflow & Mandatory 30-Day Restriction'
                    : 'खाता हटाने की प्रक्रिया और अनिवार्य 30-दिन का प्रतिबंध'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'You have full control to permanently delete your account at any time using the "Delete Account" option in your Profile. Upon confirmation, your active profile is immediately terminated and transferred to the Admin compliance archive ("Deleted Users"). To prevent fraud, ban evasion, and account abuse, your deleted email address (and linked mobile number) is strictly blocked from logging in or re-registering for 30 days from the deletion timestamp. After the 30-day restriction period concludes, any return to the platform requires fresh account registration.'
                  : 'आप अपने प्रोफ़ाइल में दिए गए "Delete Account" विकल्प का उपयोग करके किसी भी समय अपना खाता स्थायी रूप से हटा सकते हैं। पुष्टि करने पर आपका सक्रिय खाता तुरंत समाप्त कर दिया जाता है और एडमिन के "Deleted Users" रिकॉर्ड में स्थानांतरित कर दिया जाता है। धोखाधड़ी और दुरुपयोग को रोकने के लिए, हटाए गए खाते के ईमेल पते (और मोबाइल नंबर) को 30 दिनों के लिए दोबारा लॉगिन या पुनः पंजीकरण करने से सख्त रूप से ब्लॉक कर दिया जाता है। 30 दिनों की अवधि समाप्त होने के बाद ही नया खाता बनाया जा सकता है।'}
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  5
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Real-Time Active Session Tracking'
                    : 'रीयल-टाइम सक्रिय सेशन ट्रैकिंग'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'QuizKart links active session presence strictly to your registered Email Address. Your account is marked "ACTIVE" in the system only while your browser tab/session is actively open on the website. The moment you close the browser tab, leave the website, or log out, your active session status is immediately terminated in real time.'
                  : 'QuizKart सक्रिय सेशन की स्थिति को केवल आपके पंजीकृत ईमेल पते (Email Address) से जोड़ता है। आपका खाता केवल तभी "ACTIVE" दिखाया जाता है जब आपका ब्राउज़र टैब या सेशन वेबसाइट पर खुला होता है। जैसे ही आप वेबसाइट या ब्राउज़र टैब बंद करते हैं अथवा लॉग आउट करते हैं, आपकी सक्रिय स्थिति रीयल-टाइम में तुरंत समाप्त हो जाती है।'}
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0"
                  style={{ background: BRAND_GRADIENT }}
                >
                  6
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  {language === 'en'
                    ? 'Legal Compliance & Grievance Redressal'
                    : 'कानूनी अनुपालन और शिकायत निवारण'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-8">
                {language === 'en'
                  ? 'This Privacy Policy complies with the Information Technology Act, 2000 and the Digital Personal Data Protection Act (DPDP Act), India. For any issues or queries, please visit Customer Support and create a ticket to reach out to us (Jaipur, Rajasthan, India).'
                  : 'यह गोपनीयता नीति सूचना प्रौद्योगिकी अधिनियम, 2000 और डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम (DPDP Act), भारत के अनुरूप है। किसी भी समस्या या प्रश्न के लिए, कृपया Customer Support पर जाएँ और हमसे संपर्क करने के लिए एक टिकट बनाएं (जयपुर, राजस्थान, भारत)।'}
              </p>
            </section>
          </div>
        )}

        {/* Bottom Clean Agree Button Only (No left-side text, no divider line, compact & professional) */}
        <div
          className="pt-2 flex items-center justify-end bg-white"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <button
            type="button"
            id="legal-bottom-accept-btn"
            onClick={() => {
              soundFx.playClick();
              if (onAcceptAndBack) {
                onAcceptAndBack();
              } else {
                onBack();
              }
            }}
            style={{ background: BRAND_GRADIENT }}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0"
          >
            <span>
              {language === 'en' ? 'I Understand & Agree' : 'मैं सहमत हूँ'}
            </span>
          </button>
        </div>
      </main>
    </div>
  );
};
