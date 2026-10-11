import { Question, DailyPrizeItem, LeaderboardEntry, UserProfile, PoolEconomics, BannerSlide, AnnouncementSettings, DepositRequest, WithdrawalRequest } from '../types';

export const TODAY_PRIZE: DailyPrizeItem = {
  id: 'prize-live-01',
  title: 'QuizKart Championship Tournament',
  brand: 'QuizKart',
  mrp: 5000,
  retailValue: 5000,
  category: 'Live Tournament',
  imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80',
  features: [
    '100% Skill-based Arena',
    'Certified Speed & Accuracy Scoring',
    'Instant Leaderboard Settlement',
    'Verified One-Click Dispatch'
  ],
  deliveryPartner: 'Amazon',
  estimatedDeliveryDays: '2 - 3 Days'
};

export const UPCOMING_PRIZES: DailyPrizeItem[] = [];

export const QUIZ_QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'Which Indian space mission successfully achieved the first-ever soft landing near the lunar south pole in August 2023?',
    options: ['Chandrayaan-1', 'Chandrayaan-2', 'Chandrayaan-3', 'Aditya-L1'],
    correctIndex: 2,
    category: 'Science & Tech',
    explanation: 'ISRO launched Chandrayaan-3 on July 14, 2023, and Vikram Lander touched down on the Moon’s southern polar region on August 23, 2023.',
    difficulty: 'Easy'
  },
  {
    id: 2,
    question: 'Which river in India is famously known as the "Dakshin Ganga" (Ganga of the South) due to its length and spiritual significance?',
    options: ['Krishna River', 'Godavari River', 'Cauvery River', 'Narmada River'],
    correctIndex: 1,
    category: 'Geography & Nature',
    explanation: 'The Godavari is the second longest river in India after the Ganga and is often referred to as Dakshin Ganga.',
    difficulty: 'Medium'
  },
  {
    id: 3,
    question: 'Who is recognized as the "Father of the Indian Constitution" and served as the Chairman of the Drafting Committee?',
    options: ['Mahatma Gandhi', 'Dr. B. R. Ambedkar', 'Jawaharlal Nehru', 'Sardar Vallabhbhai Patel'],
    correctIndex: 1,
    category: 'Indian Heritage',
    explanation: 'Dr. Bhimrao Ramji Ambedkar served as the chairman of the drafting committee of the Constituent Assembly.',
    difficulty: 'Easy'
  },
  {
    id: 4,
    question: 'What is the full form of the widely used Indian digital payment protocol "UPI"?',
    options: [
      'Universal Payment Interface',
      'Unified Payments Interface',
      'United Public Institution',
      'User Protocol Interlink'
    ],
    correctIndex: 1,
    category: 'General Knowledge',
    explanation: 'UPI stands for Unified Payments Interface, developed by the National Payments Corporation of India (NPCI).',
    difficulty: 'Easy'
  },
  {
    id: 5,
    question: 'Which sanctuary in Assam is the primary global natural habitat for the endangered Great Indian One-horned Rhinoceros?',
    options: ['Jim Corbett National Park', 'Kaziranga National Park', 'Sundarbans National Park', 'Gir National Park'],
    correctIndex: 1,
    category: 'Geography & Nature',
    explanation: 'Kaziranga National Park in Assam hosts two-thirds of the world’s great one-horned rhinoceroses and is a UNESCO World Heritage Site.',
    difficulty: 'Medium'
  },
  {
    id: 6,
    question: 'Which Indian scientist won the Nobel Prize in Physics in 1930 for the discovery of the molecular scattering of light?',
    options: ['Homi J. Bhabha', 'Jagadish Chandra Bose', 'Sir C. V. Raman', 'Satyendra Nath Bose'],
    correctIndex: 2,
    category: 'Science & Tech',
    explanation: 'Sir C. V. Raman discovered the Raman Effect in 1928 and was awarded the 1930 Nobel Prize in Physics.',
    difficulty: 'Easy'
  },
  {
    id: 7,
    question: 'What is the standard time difference between Indian Standard Time (IST) and Coordinated Universal Time (UTC)?',
    options: ['UTC +4:30', 'UTC +5:00', 'UTC +5:30', 'UTC +6:00'],
    correctIndex: 2,
    category: 'General Knowledge',
    explanation: 'Indian Standard Time is calculated based on the 82.5° E longitude near Mirzapur (UP), which is exactly UTC +05:30.',
    difficulty: 'Medium'
  },
  {
    id: 8,
    question: 'In Indian classical architecture, the Brihadeeswarar Temple in Thanjavur was built during the reign of which famous dynasty?',
    options: ['Chola Dynasty', 'Maurya Dynasty', 'Gupta Dynasty', 'Pallava Dynasty'],
    correctIndex: 0,
    category: 'Indian Heritage',
    explanation: 'The majestic Brihadeeswara temple was commissioned by Emperor Rajaraja Chola I and completed around 1010 CE.',
    difficulty: 'Hard'
  },
  {
    id: 9,
    question: 'Which indigenous satellite navigation system was developed by ISRO for civilian and strategic navigation across the Indian subcontinent?',
    options: ['GLONASS', 'NavIC (IRNSS)', 'BeiDou', 'Galileo'],
    correctIndex: 1,
    category: 'Science & Tech',
    explanation: 'NavIC (Navigation with Indian Constellation), operational name for IRNSS, provides accurate regional positioning.',
    difficulty: 'Medium'
  },
  {
    id: 10,
    question: 'Which city is officially known as the "Silicon Valley of India" and the primary hub for technology startups?',
    options: ['Hyderabad', 'Bengaluru (Bangalore)', 'Pune', 'Gurugram'],
    correctIndex: 1,
    category: 'General Knowledge',
    explanation: 'Bengaluru earned the title "Silicon Valley of India" due to its leading role as India’s information technology exporter.',
    difficulty: 'Easy'
  },
  {
    id: 11,
    question: 'In the Indian financial system, which apex organization regulates the securities and commodity market?',
    options: ['RBI', 'SEBI', 'IRDAI', 'NABARD'],
    correctIndex: 1,
    category: 'General Knowledge',
    explanation: 'SEBI (Securities and Exchange Board of India) was established in 1988 and given statutory powers under the SEBI Act 1992.',
    difficulty: 'Easy'
  },
  {
    id: 12,
    question: 'Which element has the highest thermal and electrical conductivity among all metals at room temperature?',
    options: ['Gold', 'Copper', 'Silver', 'Aluminium'],
    correctIndex: 2,
    category: 'Science & Tech',
    explanation: 'Silver has the highest electrical and thermal conductivity of any known metal.',
    difficulty: 'Medium'
  },
  {
    id: 13,
    question: 'Which constitutional article grants the President of India the power to promulgate ordinances during the recess of Parliament?',
    options: ['Article 72', 'Article 123', 'Article 213', 'Article 356'],
    correctIndex: 1,
    category: 'Indian Heritage',
    explanation: 'Article 123 empowers the President to issue ordinances when either House of Parliament is not in session.',
    difficulty: 'Hard'
  },
  {
    id: 14,
    question: 'What is the critical speed required for an object to permanently escape the gravitational pull of the Earth without propulsion?',
    options: ['7.9 km/s', '9.8 km/s', '11.2 km/s', '14.6 km/s'],
    correctIndex: 2,
    category: 'Science & Tech',
    explanation: 'Earth’s escape velocity from the surface is approximately 11.186 km/s (~11.2 km/s).',
    difficulty: 'Hard'
  },
  {
    id: 15,
    question: 'Which ancient Indian astronomical treatise by Aryabhata correctly asserted that the Earth is spherical and rotates on its own axis?',
    options: ['Surya Siddhanta', 'Aryabhatiya', 'Brahmasphutasiddhanta', 'Siddhanta Shiromani'],
    correctIndex: 1,
    category: 'Indian Heritage',
    explanation: 'The Aryabhatiya, composed in 499 CE, laid out the rotational model of Earth and accurate planetary calculations.',
    difficulty: 'Hard'
  },
  {
    id: 16,
    question: 'EXPERT TIE-BREAKER: In quantum computing, what mathematical theorem states that an unknown quantum state cannot be copied exactly?',
    options: ['Bell’s Theorem', 'No-Cloning Theorem', 'Heisenberg Uncertainty Theorem', 'Born Rule'],
    correctIndex: 1,
    category: 'Science & Tech',
    explanation: 'The No-Cloning Theorem proved by Wootters, Zurek, and Dieks in 1982 proves the impossibility of creating an identical copy of an arbitrary unknown quantum state.',
    difficulty: 'Expert'
  },
  {
    id: 17,
    question: 'EXPERT TIE-BREAKER: Which Chola monarch earned the historic title "Gangaikonda Chola" after leading an expedition to the River Ganga and constructing a new capital?',
    options: ['Rajaraja Chola I', 'Rajendra Chola I', 'Kulothunga Chola I', 'Sundara Chola'],
    correctIndex: 1,
    category: 'Indian Heritage',
    explanation: 'Rajendra Chola I marched to the banks of the Ganges around 1023 CE and founded Gangaikonda Cholapuram as his capital.',
    difficulty: 'Expert'
  },
  {
    id: 18,
    question: 'EXPERT TIE-BREAKER: In cryptography and UPI banking security, which mathematical difficulty underpins RSA asymmetric encryption?',
    options: ['Discrete Logarithm on Elliptic Curves', 'Prime Factorization of large semi-primes', 'Knapsack Lattice Packing', 'Quantum Shor Factorization'],
    correctIndex: 1,
    category: 'Science & Tech',
    explanation: 'RSA security relies on the practical intractability of factoring large numbers that are products of two large prime numbers.',
    difficulty: 'Expert'
  },
  {
    id: 19,
    question: 'EXPERT TIE-BREAKER: Which mountain pass situated at over 18,300 feet is historically renowned as one of the highest motorable road passes in Ladakh, India?',
    options: ['Rohtang La', 'Zoji La', 'Khardung La', 'Nathu La'],
    correctIndex: 2,
    category: 'Geography & Nature',
    explanation: 'Khardung La in the Ladakh range serves as the strategic gateway to the Shyok and Nubra valleys.',
    difficulty: 'Expert'
  }
];

export const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: 'lb-1',
    rank: 1,
    userName: 'Aakash Sharma',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    score: 10,
    totalQuestions: 10,
    timeTakenSeconds: 142.4,
    formattedTime: '2m 22s',
    city: 'Jaipur',
    state: 'Rajasthan',
    rewardText: '🎁 Noise ColorFit Smartwatch (Dispatched)',
    rewardType: 'product',
    rewardAmount: 4999,
    timestamp: '10:45 AM',
    submittedAt: 'Today, 10:45 AM'
  },
  {
    id: 'lb-2',
    rank: 2,
    userName: 'Priya Sundaram',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    score: 10,
    totalQuestions: 10,
    timeTakenSeconds: 168.1,
    formattedTime: '2m 48s',
    city: 'Bengaluru',
    state: 'Karnataka',
    rewardText: '₹1,000 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 1000,
    timestamp: '11:12 AM',
    submittedAt: 'Today, 11:12 AM'
  },
  {
    id: 'lb-3',
    rank: 3,
    userName: 'Rohan Deshmukh',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80',
    score: 10,
    totalQuestions: 10,
    timeTakenSeconds: 185.5,
    formattedTime: '3m 05s',
    city: 'Pune',
    state: 'Maharashtra',
    rewardText: '₹600 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 600,
    timestamp: '11:30 AM',
    submittedAt: 'Today, 11:30 AM'
  },
  {
    id: 'lb-4',
    rank: 4,
    userName: 'Neha Verma',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    score: 9,
    totalQuestions: 10,
    timeTakenSeconds: 154.2,
    formattedTime: '2m 34s',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    rewardText: '₹400 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 400,
    timestamp: '12:05 PM',
    submittedAt: 'Today, 12:05 PM'
  },
  {
    id: 'lb-5',
    rank: 5,
    userName: 'Vikramjit Singh',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    score: 9,
    totalQuestions: 10,
    timeTakenSeconds: 172.9,
    formattedTime: '2m 52s',
    city: 'Chandigarh',
    state: 'Punjab',
    rewardText: '₹300 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 300,
    timestamp: '12:28 PM',
    submittedAt: 'Today, 12:28 PM'
  },
  {
    id: 'lb-6',
    rank: 6,
    userName: 'Ananya Mukherjee',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    score: 9,
    totalQuestions: 10,
    timeTakenSeconds: 198.0,
    formattedTime: '3m 18s',
    city: 'Kolkata',
    state: 'West Bengal',
    rewardText: '₹200 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 200,
    timestamp: '01:15 PM',
    submittedAt: 'Today, 01:15 PM'
  },
  {
    id: 'lb-7',
    rank: 7,
    userName: 'Karthik Raja',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    score: 8,
    totalQuestions: 10,
    timeTakenSeconds: 160.3,
    formattedTime: '2m 40s',
    city: 'Chennai',
    state: 'Tamil Nadu',
    rewardText: '₹150 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 150,
    timestamp: '01:42 PM',
    submittedAt: 'Today, 01:42 PM'
  },
  {
    id: 'lb-8',
    rank: 8,
    userName: 'Meera Nair',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    score: 8,
    totalQuestions: 10,
    timeTakenSeconds: 184.8,
    formattedTime: '3m 04s',
    city: 'Kochi',
    state: 'Kerala',
    rewardText: '₹120 UPI Cashback',
    rewardType: 'cashback',
    rewardAmount: 120,
    timestamp: '02:08 PM',
    submittedAt: 'Today, 02:08 PM'
  },
  {
    id: 'lb-9',
    rank: 9,
    userName: 'Devendra Patel',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    score: 8,
    totalQuestions: 10,
    timeTakenSeconds: 210.0,
    formattedTime: '3m 30s',
    city: 'Ahmedabad',
    state: 'Gujarat',
    rewardText: '₹100 UPI Refund',
    rewardType: 'cashback',
    rewardAmount: 100,
    timestamp: '02:35 PM',
    submittedAt: 'Today, 02:35 PM'
  },
  {
    id: 'lb-10',
    rank: 10,
    userName: 'Tanvi Joshi',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80',
    score: 7,
    totalQuestions: 10,
    timeTakenSeconds: 175.6,
    formattedTime: '2m 55s',
    city: 'Indore',
    state: 'Madhya Pradesh',
    rewardText: '₹100 UPI Refund',
    rewardType: 'cashback',
    rewardAmount: 100,
    timestamp: '03:10 PM',
    submittedAt: 'Today, 03:10 PM'
  }
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: 'USR-1001',
  uid: 'USR-1001',
  name: 'Rahul Sen',
  mobile: '9876543210',
  countryCode: '+91',
  email: 'rahul.sen@example.com',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  address: {
    fullName: 'Rahul Sen',
    phoneNumber: '9876543210',
    streetAddress: 'Flat 402, Sai Orchid Heights, Bannerghatta Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560076',
    landmark: 'Near Apollo Hospital'
  },
  upiId: 'rahulsen@okhdfcbank',
  walletBalance: 2200,
  quizzesPlayed: 5,
  totalWonAmount: 550,
  productsWonCount: 0,
  isRegistered: true,
  registrationDate: '2026-09-25',
  passwordStatus: 'rahul@123',
  hasPassword: true,
  emailSubscription: {
    isSubscribed: true,
    email: 'rahul.sen@example.com',
    notifyJackpots: true,
    notifyDailyResults: true,
    notifyPrizeDispatch: true,
    frequency: 'instant',
    subscribedAt: '2026-08-20'
  },
  referrals: {
    referralCode: 'RAHUL50',
    referralLink: typeof window !== 'undefined' ? `${window.location.origin}?ref=RAHUL50` : '?ref=RAHUL50',
    totalReferralsCount: 3,
    totalBonusEarned: 150,
    rewardPerReferral: 50,
    friendBonus: 50,
    history: [
      {
        id: 'ref-1',
        friendName: 'Ananya Verma',
        friendMobileMasked: '+91 98231 •••••',
        signupDate: '23 Aug 2026',
        bonusAmount: 50,
        status: 'credited'
      },
      {
        id: 'ref-2',
        friendName: 'Vikram Joshi',
        friendMobileMasked: '+91 97114 •••••',
        signupDate: '21 Aug 2026',
        bonusAmount: 50,
        status: 'credited'
      },
      {
        id: 'ref-3',
        friendName: 'Pooja Nair',
        friendMobileMasked: '+91 98452 •••••',
        signupDate: '19 Aug 2026',
        bonusAmount: 50,
        status: 'credited'
      }
    ]
  }
};

export function isDemoSeedUser(u?: Partial<UserProfile> | null): boolean {
  if (!u) return true;
  const email = (u.email || '').trim().toLowerCase();
  const name = (u.name || '').trim().toLowerCase();
  const mobile = (u.mobile || '').replace(/\D/g, '');
  const upi = (u.upiId || '').trim().toLowerCase();

  // Hardcoded demo emails from legacy seed data
  if (
    [
      'rahul.sen@example.com',
      'rahul.sen@gmail.com',
      'rahulsen@example.com',
      'priya.sundar@gmail.com',
      'verma.aakash@gmail.com',
      'sneha.patel@gmail.com',
      'rohan.deshmukh@gmail.com',
      'player@quizkart.in'
    ].includes(email)
  ) {
    return true;
  }

  // Hardcoded demo names from legacy seed data
  if (
    [
      'rahul sen',
      'nml admin',
      'priya sundaram',
      'aakash verma',
      'sneha patel',
      'rohan deshmukh'
    ].includes(name)
  ) {
    return true;
  }

  // Hardcoded NML Admin dummy seed record
  if (upi === 'nmladmin@okaxis' || mobile === '9800112233') {
    return true;
  }

  return false;
}

export const DEFAULT_REGISTERED_USERS: UserProfile[] = [];

export const INITIAL_POOL_ECONOMICS: PoolEconomics = {
  entryFee: 100,
  activeParticipants: 41,
  targetParticipants: 50,
  totalPoolAmount: 4100,
  productSharePercentage: 50,
  runnerUpCashbackPercentage: 45,
  platformFeePercentage: 5,
  productPrizeValue: 2050, // 50%
  runnerUpPoolValue: 1845,  // 45%
  platformFeeValue: 205     // 5%
};

export const DEFAULT_ANNOUNCEMENT_SETTINGS: AnnouncementSettings = {
  text: 'QuizKart is 100% Skill-Based Quiz • 18+ Only • Pure Knowledge Test • Instant UPI Cash Prize Disbursement ⚡',
  isEnabled: true,
  speed: 'normal'
};

export const DEFAULT_BANNER_SLIDES: BannerSlide[] = [
  {
    id: 'slide-1',
    imageUrl: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1200&auto=format&fit=crop&q=80',
    title: 'MEGA CASH JACKPOT ARENA',
    subtitle: 'Rank #1 claims ₹5,199 instant UPI cash prize. Certified 0.1s millisecond accuracy.',
    badge: 'LIVE CASH TOURNAMENT',
    actionText: 'Enter Cash Arena',
    actionTab: 'quiz_arena',
    isEnabled: true
  },
  {
    id: 'slide-2',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&auto=format&fit=crop&q=80',
    title: 'Win Genuine Tech Gadgets',
    subtitle: 'Certified smartwatches and electronics delivered directly to your doorstep with 100% free delivery.',
    badge: 'FREE DOORSTEP DELIVERY',
    actionText: 'Explore Prizes',
    actionTab: 'home',
    isEnabled: true
  },
  {
    id: 'slide-3',
    imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80',
    title: 'Transparent 0.1s Atomic Leaderboard',
    subtitle: 'Tamper-proof speed and accuracy calculations with immediate automated prize payout.',
    badge: '0.1s ATOMIC TIMER',
    actionText: 'View Live Standings',
    actionTab: 'leaderboard',
    isEnabled: true
  },
  {
    id: 'slide-4',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
    title: 'Daily High-Stakes Blitz Rounds',
    subtitle: 'Daily quiz challenges released every morning. Test your knowledge, conquer the ranks, win big.',
    badge: 'DAILY BLITZ',
    actionText: 'Play Quiz Now',
    actionTab: 'quiz_arena',
    isEnabled: true
  },
  {
    id: 'slide-5',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
    title: 'Weekend Mega Showdown',
    subtitle: 'Compete with top quizzers across India and win grand cash prizes every weekend.',
    badge: 'WEEKEND SPECIAL',
    actionText: 'Join Now',
    actionTab: 'quiz_arena',
    isEnabled: true
  },
  {
    id: 'slide-6',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    title: 'Tech & Gadgets Championship',
    subtitle: 'Answer technology trivia and win cutting-edge smart devices directly delivered.',
    badge: 'TECH ARENA',
    actionText: 'Compete Now',
    actionTab: 'quiz_arena',
    isEnabled: true
  },
  {
    id: 'slide-7',
    imageUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop&q=80',
    title: 'Instant UPI Prize Payouts',
    subtitle: 'Guaranteed instant withdrawals directly credited to your verified UPI ID.',
    badge: 'INSTANT PAYOUT',
    actionText: 'Check Wallet',
    actionTab: 'profile',
    isEnabled: true
  },
  {
    id: 'slide-8',
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80',
    title: 'Refer & Earn Unlimited Bonus',
    subtitle: 'Invite your friends to QuizKart and earn cash bonuses directly in your winning wallet.',
    badge: 'REFERRAL BONUS',
    actionText: 'Invite Friends',
    actionTab: 'refer_earn',
    isEnabled: true
  },
  {
    id: 'slide-9',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    title: 'Daily General Knowledge Blitz',
    subtitle: 'Sharpen your brain and claim guaranteed rewards in fast 10-question rounds.',
    badge: 'DAILY BLITZ',
    actionText: 'Play Blitz',
    actionTab: 'quiz_arena',
    isEnabled: true
  },
  {
    id: 'slide-10',
    imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80',
    title: 'Certified 100% Fair Play',
    subtitle: 'Atomic precision timing with fair anti-cheat proctoring certified for all players.',
    badge: 'VERIFIED FAIR',
    actionText: 'View Rules',
    actionTab: 'transparency',
    isEnabled: true
  }
];

export const ensureTenSlides = (existing?: BannerSlide[]): BannerSlide[] => {
  const slides = Array.isArray(existing) ? [...existing] : [];
  const result: BannerSlide[] = [];
  for (let i = 0; i < 10; i++) {
    const slotId = `slide-${i + 1}`;
    const defaultSlide = DEFAULT_BANNER_SLIDES[i] || {
      id: slotId,
      imageUrl: '',
      title: `Banner Slot ${i + 1}`,
      subtitle: '',
      badge: '',
      actionText: 'Join Now',
      actionTab: 'quiz_arena',
      isEnabled: true
    };

    if (slides[i]) {
      result.push({
        ...defaultSlide,
        ...slides[i],
        id: slides[i].id || slotId,
        isEnabled: typeof slides[i].isEnabled === 'boolean' ? slides[i].isEnabled : true,
      });
    } else {
      result.push(defaultSlide);
    }
  }
  return result;
};

export const DEFAULT_DEPOSIT_REQUESTS: DepositRequest[] = [
  {
    id: 'QK-DEP-1001',
    userName: 'Rohan Deshmukh',
    userEmail: 'rohan.deshmukh@gmail.com',
    email: 'rohan.deshmukh@gmail.com',
    phone: '+91 98231 44521',
    upiId: 'rohan.desh@okaxis',
    amount: 100,
    utrNumber: '428901238910',
    screenshotUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    app: 'PhonePe',
    timestamp: '2026-09-20 | 06:15:20 PM',
    date: '2026-09-20',
    status: 'pending'
  },
  {
    id: 'QK-DEP-1002',
    userName: 'Priya Sundaram',
    userEmail: 'priya.sundar@gmail.com',
    email: 'priya.sundar@gmail.com',
    phone: '+91 98402 11983',
    upiId: 'priya.sundar@ibl',
    amount: 500,
    utrNumber: '428901241190',
    screenshotUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    app: 'PhonePe',
    timestamp: '2026-09-20 | 05:40:12 PM',
    date: '2026-09-20',
    status: 'pending'
  },
  {
    id: 'QK-DEP-1003',
    userName: 'Aakash Verma',
    userEmail: 'verma.aakash@gmail.com',
    email: 'verma.aakash@gmail.com',
    phone: '+91 97112 09841',
    upiId: 'verma.aakash@paytm',
    amount: 200,
    utrNumber: '428901198421',
    screenshotUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    app: 'PhonePe',
    timestamp: '2026-09-20 | 04:10:05 PM',
    date: '2026-09-20',
    status: 'approved'
  }
];

export const DEFAULT_WITHDRAWAL_REQUESTS: WithdrawalRequest[] = [
  {
    id: 'QK-WTH-1002',
    userName: 'Sneha Patel',
    userEmail: 'sneha.patel@gmail.com',
    email: 'sneha.patel@gmail.com',
    phone: '+91 98221 00192',
    accountHolderName: 'Sneha Patel',
    accountNumber: '32910491823901',
    ifscCode: 'SBIN0004521',
    amount: 500,
    timestamp: '2026-09-20 | 03:15:40 PM',
    date: '2026-09-20',
    status: 'approved'
  }
];

