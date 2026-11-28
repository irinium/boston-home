// Replaces `@/providers/auth` in screen tests. Each test sets the state it needs.
import type { ReactNode } from 'react';

import type { MyAccount } from '@/lib/types';

export const ME = 'user-me';

export const mockAuth = {
  ready: true,
  session: null as { user: { id: string } } | null,
  account: null as MyAccount | null,
  refreshAccount: jest.fn(async () => {}),
  signInWithApple: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
};

export function signIn(account: Partial<MyAccount> = {}) {
  mockAuth.session = { user: { id: ME } };
  mockAuth.account = {
    id: ME,
    display_name: 'Anna',
    verification_status: 'unverified',
    trusted: true,
    photo_path: `${ME}/face.jpg`,
    is_suspended: false,
    credits: 1,
    has_listing: false,
    ...account,
  };
}

export function signOutState() {
  mockAuth.session = null;
  mockAuth.account = null;
}

export const useAuth = () => mockAuth;
export const AuthProvider = ({ children }: { children: ReactNode }) => children;
