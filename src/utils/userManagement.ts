import { UserProfile } from '../types';

export const INITIAL_REGISTERED_USERS: UserProfile[] = [
  {
    id: 'usr-1001',
    uid: 'usr-1001',
    name: 'Rahul Sen',
    mobile: '9876543210',
    countryCode: '+91',
    email: 'rahul.sen@example.com',
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
    walletBalance: 500,
    quizzesPlayed: 4,
    totalWonAmount: 450,
    productsWonCount: 0,
    isRegistered: true,
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
    registrationDate: '2026-09-15',
    passwordStatus: 'Configured',
    hasPassword: true,
    isBlocked: false
  },
  {
    id: 'usr-1002',
    uid: 'usr-1002',
    name: 'Priya Sundaram',
    mobile: '9840211983',
    countryCode: '+91',
    email: 'priya.sundar@ibl',
    address: {
      fullName: 'Priya Sundaram',
      phoneNumber: '9840211983',
      streetAddress: '12th Cross, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038'
    },
    upiId: 'priya.sundar@ibl',
    walletBalance: 1000,
    quizzesPlayed: 7,
    totalWonAmount: 1200,
    productsWonCount: 1,
    isRegistered: true,
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
    registrationDate: '2026-09-18',
    passwordStatus: 'Configured',
    hasPassword: true,
    isBlocked: false
  },
  {
    id: 'usr-1003',
    uid: 'usr-1003',
    name: 'Rohan Deshmukh',
    mobile: '9823144521',
    countryCode: '+91',
    email: 'rohan.desh@okaxis',
    address: {
      fullName: 'Rohan Deshmukh',
      phoneNumber: '9823144521',
      streetAddress: 'MG Road, Camp',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001'
    },
    upiId: 'rohan.desh@okaxis',
    walletBalance: 600,
    quizzesPlayed: 5,
    totalWonAmount: 850,
    productsWonCount: 0,
    isRegistered: true,
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=160&auto=format&fit=crop&q=80',
    registrationDate: '2026-09-19',
    passwordStatus: 'Configured',
    hasPassword: true,
    isBlocked: false
  },
  {
    id: 'usr-1004',
    uid: 'usr-1004',
    name: 'Aakash Verma',
    mobile: '9711209841',
    countryCode: '+91',
    email: 'verma.aakash@paytm',
    address: {
      fullName: 'Aakash Verma',
      phoneNumber: '9711209841',
      streetAddress: 'C-Scheme',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001'
    },
    upiId: 'verma.aakash@paytm',
    walletBalance: 300,
    quizzesPlayed: 3,
    totalWonAmount: 300,
    productsWonCount: 0,
    isRegistered: true,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
    registrationDate: '2026-09-20',
    passwordStatus: 'Configured',
    hasPassword: true,
    isBlocked: false
  },
  {
    id: 'usr-1005',
    uid: 'usr-1005',
    name: 'Sneha Patel',
    mobile: '9822100192',
    countryCode: '+91',
    email: 'sneha.patel@gmail.com',
    address: {
      fullName: 'Sneha Patel',
      phoneNumber: '9822100192',
      streetAddress: 'Satellite Road',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380015'
    },
    upiId: 'sneha@oksbi',
    walletBalance: 450,
    quizzesPlayed: 6,
    totalWonAmount: 500,
    productsWonCount: 0,
    isRegistered: true,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
    registrationDate: '2026-09-21',
    passwordStatus: 'Configured',
    hasPassword: true,
    isBlocked: false
  }
];

export const USERS_STORAGE_KEY = 'quizkart_registered_users';

export function getStoredRegisteredUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_REGISTERED_USERS;
}

export function saveStoredRegisteredUsers(users: UserProfile[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {}
}

export function upsertRegisteredUser(user: Partial<UserProfile> & { email: string; name: string }): UserProfile[] {
  const users = getStoredRegisteredUsers();
  const cleanEmail = user.email.trim().toLowerCase();
  const index = users.findIndex(u => u.email.trim().toLowerCase() === cleanEmail);

  const now = new Date().toISOString().split('T')[0];

  if (index >= 0) {
    const existing = users[index];
    const updated: UserProfile = {
      ...existing,
      ...user,
      name: user.name.trim() || existing.name,
      mobile: user.mobile ? user.mobile.replace(/\D/g, '') : existing.mobile,
      avatarUrl: user.avatarUrl || existing.avatarUrl,
      passwordStatus: user.passwordStatus || existing.passwordStatus || 'Configured',
      hasPassword: true,
      isRegistered: true,
      walletBalance: user.walletBalance !== undefined ? user.walletBalance : existing.walletBalance,
      isBlocked: existing.isBlocked ?? false
    };
    users[index] = updated;
    saveStoredRegisteredUsers(users);
    return users;
  } else {
    const newUser: UserProfile = {
      id: user.uid || `usr-${Date.now()}`,
      uid: user.uid || `usr-${Date.now()}`,
      name: user.name.trim(),
      mobile: user.mobile ? user.mobile.replace(/\D/g, '') : '9876543210',
      countryCode: user.countryCode || '+91',
      email: user.email.trim(),
      address: user.address || {
        fullName: user.name.trim(),
        phoneNumber: user.mobile || '9876543210',
        streetAddress: 'Main Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001'
      },
      upiId: user.upiId || `${user.email.split('@')[0]}@upi`,
      walletBalance: user.walletBalance !== undefined ? user.walletBalance : 0,
      quizzesPlayed: user.quizzesPlayed || 0,
      totalWonAmount: user.totalWonAmount || 0,
      productsWonCount: user.productsWonCount || 0,
      isRegistered: true,
      avatarUrl: user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
      registrationDate: user.registrationDate || now,
      passwordStatus: 'Configured',
      hasPassword: true,
      isBlocked: false
    };
    const updated = [newUser, ...users];
    saveStoredRegisteredUsers(updated);
    return updated;
  }
}

export function toggleUserBlockInStorage(emailOrUid: string): { updatedUsers: UserProfile[]; targetUser: UserProfile | null } {
  const users = getStoredRegisteredUsers();
  const cleanKey = emailOrUid.trim().toLowerCase();
  let targetUser: UserProfile | null = null;

  const updatedUsers = users.map(u => {
    const match = (u.email && u.email.trim().toLowerCase() === cleanKey) ||
                  (u.uid && u.uid.toLowerCase() === cleanKey) ||
                  (u.id && u.id.toLowerCase() === cleanKey);
    if (match) {
      const nextBlocked = !u.isBlocked;
      targetUser = { ...u, isBlocked: nextBlocked };
      return targetUser;
    }
    return u;
  });

  saveStoredRegisteredUsers(updatedUsers);

  // Dispatch custom event for real-time app reactivity
  if (typeof window !== 'undefined' && targetUser) {
    window.dispatchEvent(new CustomEvent('quizkart_user_blocked_changed', { 
      detail: { user: targetUser, isBlocked: (targetUser as UserProfile).isBlocked } 
    }));
  }

  return { updatedUsers, targetUser };
}
