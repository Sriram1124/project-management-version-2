import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth.service';
import { isJwtExpired } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Hydrate user immediately from localStorage to avoid flashes or unauthenticated redirects on refresh
  const [user, setUser] = useState(() => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
      if (!token && !refreshToken) return null;
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  // Only block with isLoading if tokens exist but user is not hydrated yet
  const [isLoading, setIsLoading] = useState(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (!token && !refreshToken) return false;
    const cachedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    return !cachedUser;
  });

  // Listen for unauthorized/logout events dispatched from api.js
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (token || refreshToken) {
        const lastVerifiedStr = localStorage.getItem('user_last_verified');
        const lastVerified = lastVerifiedStr ? Number(lastVerifiedStr) : 0;
        const now = Date.now();
        const cachedUser = localStorage.getItem('user');

        // Throttle verification: if user was verified in last 60s and token is not expired, skip redundant /me fetch
        if (cachedUser && (now - lastVerified < 60_000) && token && !isJwtExpired(token)) {
          if (isMounted) setIsLoading(false);
          return;
        }

        try {
          const userData = await authService.getCurrentUser();
          const activeUser = userData?.user || userData;
          if (activeUser && isMounted) {
            setUser(activeUser);
            localStorage.setItem('user', JSON.stringify(activeUser));
            localStorage.setItem('user_last_verified', String(Date.now()));
          } else if (!activeUser) {
            // If getCurrentUser returned null because refresh failed
            if (!localStorage.getItem('accessToken') && !localStorage.getItem('refreshToken')) {
              if (isMounted) setUser(null);
            }
          }
        } catch (e) {
          // If token expired and couldn't be refreshed, clear auth state
          if (isMounted) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('sessionId');
            localStorage.removeItem('user');
            localStorage.removeItem('user_last_verified');
            setUser(null);
          }
        }
      } else {
        if (isMounted) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('sessionId');
          localStorage.removeItem('user');
          localStorage.removeItem('user_last_verified');
          setUser(null);
        }
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (identifier, password, organization_id = null) => {
    const data = await authService.login(identifier, password, organization_id);
    const activeUser = data.user || data;
    setUser(activeUser);
    if (activeUser) {
      localStorage.setItem('user', JSON.stringify(activeUser));
      localStorage.setItem('user_last_verified', String(Date.now()));
    }
    return data;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (e) {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('sessionId');
      localStorage.removeItem('user');
      localStorage.removeItem('user_last_verified');
      setUser(null);
    }
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, setUser, updateUser, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
