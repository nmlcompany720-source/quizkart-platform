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

export const QUIZ_QUESTIONS: Question[] = [];

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
  id: 'QK-USR-1001',
  uid: 'QK-USR-1001',
  name: 'New Player',
  mobile: '',
  countryCode: '+91',
  email: '',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  address: {
    fullName: '',
    phoneNumber: '',
    streetAddress: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    landmark: ''
  },
  upiId: '',
  walletBalance: 0,
  quizzesPlayed: 0,
  totalWonAmount: 0,
  productsWonCount: 0,
  isRegistered: false,
  registrationDate: '',
  passwordStatus: '',
  hasPassword: false,
  emailSubscription: {
    isSubscribed: false,
    email: '',
    notifyJackpots: false,
    notifyDailyResults: false,
    notifyPrizeDispatch: false,
    frequency: 'instant',
    subscribedAt: ''
  },
  referrals: {
    referralCode: '',
    referralLink: '',
    totalReferralsCount: 0,
    totalBonusEarned: 0,
    rewardPerReferral: 50,
    friendBonus: 50,
    history: []
  }
};

export function isDemoSeedUser(u?: Partial<UserProfile> | null): boolean {
  if (!u) return true;
  // ABSOLUTE DATA PERSISTENCE: If user has an active/registered account, NEVER drop or hide them!
  if (u.isRegistered && u.email && !u.isDeleted) {
    return false;
  }
  const email = (u.email || '').trim().toLowerCase();
  const name = (u.name || '').trim().toLowerCase();
  if (email === 'player@quizkart.in' && !u.isRegistered) return true;
  if (name === 'nml admin' && !u.email) return true;
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

export const DEFAULT_BANNER_SLIDES: BannerSlide[] = Array.from({ length: 10 }, (_, i) => ({
  id: `slide-${i + 1}`,
  imageUrl: '',
  title: '',
  subtitle: '',
  badge: '',
  actionText: '',
  actionTab: 'quiz_arena',
  customUrl: '',
  isEnabled: false
}));

export const ensureTenSlides = (existing?: BannerSlide[]): BannerSlide[] => {
  const slides = Array.isArray(existing) ? [...existing] : [];
  const result: BannerSlide[] = [];
  
  // Helper to preserve user inputs with spaces and full string intact
  const cleanField = (val?: string) => {
    if (val === undefined || val === null || typeof val !== 'string') return '';
    return val;
  };

  for (let i = 0; i < 10; i++) {
    const slotId = `slide-${i + 1}`;
    const s = slides[i];
    if (s) {
      result.push({
        id: s.id || slotId,
        imageUrl: typeof s.imageUrl === 'string' ? s.imageUrl : '',
        title: cleanField(s.title),
        subtitle: cleanField(s.subtitle),
        badge: cleanField(s.badge),
        actionText: cleanField(s.actionText),
        actionTab: s.actionTab || 'quiz_arena',
        customUrl: typeof s.customUrl === 'string' ? s.customUrl : '',
        // Strictly respect admin's selection; never auto-enable unselected banners!
        isEnabled: Boolean(s.isEnabled)
      });
    } else {
      result.push({
        id: slotId,
        imageUrl: '',
        title: '',
        subtitle: '',
        badge: '',
        actionText: '',
        actionTab: 'quiz_arena',
        customUrl: '',
        isEnabled: false
      });
    }
  }
  return result;
};

export const DEFAULT_DEPOSIT_REQUESTS: DepositRequest[] = [];

export const DEFAULT_WITHDRAWAL_REQUESTS: WithdrawalRequest[] = [];

