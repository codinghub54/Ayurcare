'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { installSessionRefresh, refreshSessionOnce } from '@/lib/session-client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  status: string;
  phone?: string;
  avatarImage?: string;
  patientProfile?: any;
  doctorProfile?: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userData: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchMe = async (): Promise<User | null> => {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
  };

  const refreshUser = async () => {
    try {
      let current = await fetchMe();
      // Access token may have expired while the refresh token is still valid
      if (!current && (await refreshSessionOnce())) {
        current = await fetchMe();
      }
      setUser(current);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Renew expired sessions transparently for every API call in the app
    installSessionRefresh(() => setUser(null));
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep an active session alive: renew shortly before the 15-minute access token expires
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      refreshSessionOnce();
    }, 12 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const login = (userData: User) => {
    setUser(userData);
    // Redirect based on role
    if (userData.role === 'ADMIN') {
      router.push('/admin/dashboard');
    } else if (userData.role === 'DOCTOR') {
      if (userData.status === 'PENDING') {
        router.push('/doctor/pending');
      } else {
        router.push('/doctor/dashboard');
      }
    } else {
      router.push('/patient/dashboard');
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // Clear per-tab chat history so the next person on this browser can't see it
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith('ayurbot-conversation-'))
          .forEach((k) => sessionStorage.removeItem(k));
      } catch {}
      setUser(null);
      router.push('/');
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
