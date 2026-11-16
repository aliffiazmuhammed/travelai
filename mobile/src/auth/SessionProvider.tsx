import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getMe,
  signOut as apiSignOut,
  signin as apiSignin,
  signup as apiSignup,
  type SessionUser,
} from '@/api/auth';
import { ApiError } from '@/api/client';
import { clearSessionToken, getSessionToken } from '@/auth/tokenStorage';
import { queryClient } from '@/query/client';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; name?: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          if (active) setStatus('signedOut');
          return;
        }

        const me = await getMe();
        if (!active) return;
        setUser(me);
        setStatus('signedIn');
      } catch (error) {
        // A rejected token is worthless; a network failure is not, so keep it
        // for the next launch and just fall back to the sign-in screen.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearSessionToken().catch(() => {});
        }
        if (active) {
          setUser(null);
          setStatus('signedOut');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const nextUser = await apiSignin(email, password);
    queryClient.clear();
    setUser(nextUser);
    setStatus('signedIn');
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const nextUser = await apiSignup(input.email, input.password, input.name);
      queryClient.clear();
      setUser(nextUser);
      setStatus('signedIn');
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } finally {
      queryClient.clear();
      setUser(null);
      setStatus('signedOut');
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
