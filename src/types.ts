export type QuestionCategory = 'Maths' | 'Reasoning' | 'Science' | 'GK' | 'English';

export interface Question {
  id: number;
  stem?: string; // Question text
  question: string; // Question text (supports both stem and question)
  options: [string, string, string, string];
  correctIndex: number;
  correctKey?: 'A' | 'B' | 'C' | 'D';
  answer?: {
    key: 'A' | 'B' | 'C' | 'D';
    text: string;
  };
  category: QuestionCategory | 'General Knowledge' | 'Science & Tech' | 'Indian Heritage' | 'Current Affairs' | 'Geography & Nature' | string;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  createdAt?: string;
  updatedAt?: string;
  sessionUserId?: string;
  sessionId?: string;
  slotIndex?: number;
  isShuffledFallback?: boolean;
  assignedUserId?: string;
  isCustom?: boolean;
  isRetake?: boolean;
  originalSourceId?: number;
  subject?: string;
  blockNumber?: number;
  isDynamicBlock?: boolean;
}

export interface UserAddress {
  fullName: string;
  phoneNumber: string;
  flatHouse?: string;
  area?: string;
  streetAddress: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface EmailSubscriptionPreferences {
  isSubscribed: boolean;
  email: string;
  notifyJackpots: boolean;
  notifyDailyResults: boolean;
  notifyPrizeDispatch?: boolean;
  frequency: 'instant' | 'daily_digest';
  subscribedAt?: string;
}

export interface ReferralRecord {
  id: string;
  friendName: string;
  friendMobileMasked: string;
  signupDate: string;
  bonusAmount: number;
  status: 'credited' | 'pending';
}

export interface ReferralDetails {
  referralCode: string;
  referralLink: string;
  totalReferralsCount: number;
  totalBonusEarned: number;
  rewardPerReferral: number;
  friendBonus: number;
  history: ReferralRecord[];
}

export interface UserProfile {
  name: string;
  mobile: string;
  email: string;
  address: UserAddress;
  upiId: string;
  walletBalance: number;
  quizzesPlayed: number;
  totalWonAmount: number;
  productsWonCount: number;
  isRegistered: boolean;
  avatarUrl?: string;
  countryCode?: string;
  emailSubscription?: EmailSubscriptionPreferences;
  referrals?: ReferralDetails;
  kycStatus?: 'Verified' | 'Pending' | 'Unverified';
  kycDocType?: 'Aadhaar' | 'PAN';
  kycDocNumberMasked?: string;
  isVerifiedForOneClickDispatch?: boolean;
  id?: string;
  uid?: string;
  isBlocked?: boolean;
  blockReason?: string;
  registrationDate?: string;
  passwordStatus?: string;
  hasPassword?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedTimestampMs?: number;
  quizActivity?: QuizAttemptResult[];
}

export type ContestType = 'cash' | 'product';

export interface CashContestConfig {
  entryFee: number;
  prizePool: number;
  shareBreakdownType: 'single_winner' | 'multi_rank' | 'top_10' | 'top_20' | 'top_25' | 'top_50' | string;
  winnerShareSummary: string;
  cashImageUrl?: string;
}

export interface ProductContestConfig {
  itemTitle: string;
  brand: string;
  marketValue: number;
  retailValue: number;
  productImageUrl: string;
  ecommerceFulfillmentLink: string;
  deliveryPartner: string;
  estimatedDeliveryDays: string;
}

export interface ActiveContest {
  id: string;
  type: ContestType;
  title: string;
  overlayTitle?: string;
  badge?: string;
  entryFee: number;
  maxParticipants?: number;
  winnersCount?: number;
  realJoins?: number;
  totalRevenue?: number;
  cashConfig?: CashContestConfig;
  productConfig?: ProductContestConfig;
  status: 'active' | 'scheduled' | 'completed' | 'full';
  scheduledTime?: string; // Start Timer (ISO timestamp)
  endTime?: string;       // End Timer (ISO timestamp)
  activatedAt?: string;   // Timestamp when contest went LIVE
  randomBasePercent?: number; // Single random base (25% - 45%) generated 30s after LIVE
  autoPilotRecurring?: boolean;
  questionIds: number[];
  createdAt: string;
}

export type BannerTargetPage = 'home' | 'quiz_arena' | 'leaderboard' | 'transparency' | 'profile' | 'refer_earn' | 'withdrawal_history' | 'custom_url';

export interface BannerSlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  badge?: string;
  actionText?: string;
  actionTab?: BannerTargetPage;
  customUrl?: string;
  isEnabled: boolean;
}

export interface AnnouncementSettings {
  text: string;
  isEnabled: boolean;
  speed?: 'normal' | 'slow' | 'fast';
}

export interface AutoPilotSettings {
  isEnabled: boolean;
  dailyTime: string; // e.g. "8:00 PM Daily Blitz"
  contestType: ContestType;
  entryFee: number;
  cashPrizePool?: number;
  productItemTitle?: string;
  productMarketValue?: number;
  productImageUrl?: string;
  ecommerceFulfillmentLink?: string;
  lastAutoRunDate?: string;
  nextRunTimeDisplay: string;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  userName: string;
  avatar: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  formattedTime: string;
  city: string;
  state: string;
  rewardText: string;
  rewardType: 'product' | 'cashback' | 'none';
  rewardAmount?: number;
  isCurrentUser?: boolean;
  timestamp: string;
  submittedAt: string;
}

export interface QuizAttemptResult {
  attemptId: string;
  userId?: string;
  userName?: string;
  quizDate: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  answers: Record<number, number>; // questionId -> selectedIndex
  markedForReview: number[];
  rank: number;
  totalParticipants: number;
  rewardWon: string;
  rewardType: 'product' | 'cashback' | 'none';
  rewardAmount?: number;
  deliveryAddress?: UserAddress;
  upiId?: string;
  securityBreached?: boolean;
  securityBreachReason?: string;
  title?: string;
  submittedAt?: string;
}

export interface DailyPrizeItem {
  id: string;
  title: string;
  badge?: string;
  mrp: number;
  retailValue: number;
  brand: string;
  category: string;
  imageUrl: string;
  features: string[];
  deliveryPartner: string;
  estimatedDeliveryDays: string;
}

export interface PoolEconomics {
  entryFee: number;
  activeParticipants: number;
  targetParticipants: number;
  totalPoolAmount: number;
  productSharePercentage: number; // 50%
  runnerUpCashbackPercentage: number; // 45%
  platformFeePercentage: number; // 5%
  productPrizeValue: number;
  runnerUpPoolValue: number;
  platformFeeValue: number;
}

export interface SecurityViolationLog {
  id: string;
  userName: string;
  phone?: string;
  city?: string;
  timestamp: string;
  violationType: string;
  severity: 'Critical (Disqualified)' | 'High (Forced Termination)' | 'Warning';
  actionTaken: string;
  deviceInfo: string;
  status: 'Flagged' | 'Reviewed' | 'Dismissed';
}

export type PoolBreakdown = PoolEconomics;

export interface DepositRequest {
  id: string;
  userName: string;
  userEmail?: string;
  email?: string;
  phone: string;
  upiId?: string;
  amount: number;
  utrNumber: string;
  screenshotUrl?: string;
  app?: 'Google Pay' | 'PhonePe' | 'Paytm' | 'BHIM' | string;
  timestamp: string;
  date?: string;
  createdAt?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface WithdrawalRequest {
  id: string;
  userName: string;
  userEmail?: string;
  email?: string;
  phone: string;
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber?: string;
  ifscCode: string;
  amount: number;
  timestamp: string;
  date?: string;
  createdAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  referenceId?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName?: string;
  message: string;
  timestamp: number;
}

export interface SupportTicket {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  category: 'Deposit Issue' | 'Withdrawal Issue' | 'Quiz Issue' | 'Other Query';
  relatedTransactionId?: string;
  relatedTransactionDetails?: string;
  problemDescription: string;
  screenshotUrl?: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  createdAt: number;
  adminReply?: string;
  adminRepliedAt?: number;
  adminName?: string;
  userReadAdminReply?: boolean;
  messages?: ChatMessage[];
}
