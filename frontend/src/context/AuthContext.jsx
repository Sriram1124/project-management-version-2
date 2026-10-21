import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth.service';
import { isJwtExpired } from '../services/api';
import {
  getSafeStoredUser,
  setSafeStoredUser,
  getSafeToken,
  clearSafeAuthStorage,
} from '../utils/storageSecurity.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Hydrate validated user immediately from localStorage to avoid flashes while preventing storage poisoning
  const [user, setUser] = useState(() => {
    const token = getSafeToken('accessToken');
    const refreshToken = getSafeToken('refreshToken');
    if (!token && !refreshToken) return null;
    return getSafeStoredUser();
  });

  // Only block with isLoading if tokens exist but user is not hydrated yet
  const [isLoading, setIsLoading] = useState(() => {
    const token = getSafeToken('accessToken');
    const refreshToken = getSafeToken('refreshToken');
    if (!token && !refreshToken) return false;
    const cachedUser = getSafeStoredUser();
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
      const token = getSafeToken('accessToken');
      const refreshToken = getSafeToken('refreshToken');

      if (token || refreshToken) {
        const cachedUser = getSafeStoredUser();

        // Immediately unblock initial render if validated cached user exists (stale-while-revalidate)
        if (cachedUser && isMounted) {
          setIsLoading(false);
        }

        try {
          const userData = await authService.getCurrentUser();
          const activeUser = userData?.user || userData;
          if (activeUser && isMounted) {
            setUser((prev) => {
              if (
                !prev ||
                prev.name !== activeUser.name ||
                prev.email !== activeUser.email ||
                prev.role !== activeUser.role ||
                prev.user_code !== activeUser.user_code ||
                prev.id !== activeUser.id
              ) {
                return activeUser;
              }
              return prev;
            });
            setSafeStoredUser(activeUser);
          } else if (!activeUser) {
            // If getCurrentUser returned null because refresh failed
            if (!getSafeToken('accessToken') && !getSafeToken('refreshToken')) {
              if (isMounted) setUser(null);
            }
          }
        } catch (e) {
          // If token expired and couldn't be refreshed, clear auth state
          if (isMounted) {
            clearSafeAuthStorage();
            setUser(null);
          }
        }
      } else {
        if (isMounted) {
          clearSafeAuthStorage();
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
      setSafeStoredUser(activeUser);
    }
    return data;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (e) {
      // Ignore logout errors
    } finally {
      clearSafeAuthStorage();
      setUser(null);
    }
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const updated = { ...prev, ...updatedFields };
      setSafeStoredUser(updated);
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
