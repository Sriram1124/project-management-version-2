import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth.service';

const AuthContext = createContext(null);

// Helper to check if a JWT is expired without server round-trip
function isJwtExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    // Buffer of 15 seconds before expiry
    return Date.now() >= payload.exp * 1000 - 15000;
  } catch (e) {
    return true;
  }
}

export const AuthProvider = ({ children }) => {
  // Hydrate user immediately from localStorage to avoid flashes or unauthenticated redirects on refresh
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  // Only block with isLoading if an accessToken exists but user is not hydrated yet
  const [isLoading, setIsLoading] = useState(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) return false;
    const cachedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    return !cachedUser;
  });

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const lastVerifiedStr = localStorage.getItem('user_last_verified');
        const lastVerified = lastVerifiedStr ? Number(lastVerifiedStr) : 0;
        const now = Date.now();
        const cachedUser = localStorage.getItem('user');

        // Throttle verification: if user was verified in last 60s and token is not expired, skip redundant /me fetch
        if (cachedUser && (now - lastVerified < 60_000) && !isJwtExpired(token)) {
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
          }
        } catch (e) {
          // If token expired and couldn't be refreshed, clear auth state
          if (e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid access token')) {
            if (isMounted) {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('sessionId');
              localStorage.removeItem('user');
              localStorage.removeItem('user_last_verified');
              setUser(null);
            }
          }
          // On network blip, preserve cached user so user is not logged out
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
