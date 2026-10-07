import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth.service';

const AuthContext = createContext(null);

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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const userData = await authService.getCurrentUser();
          const activeUser = userData?.user || userData;
          if (activeUser && isMounted) {
            setUser(activeUser);
            localStorage.setItem('user', JSON.stringify(activeUser));
          }
        } catch (e) {
          // If token expired and couldn't be refreshed, clear auth state
          if (e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid access token')) {
            if (isMounted) {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('user');
              setUser(null);
            }
          }
          // On network blip, preserve cached user so user is not logged out
        }
      } else {
        if (isMounted) {
          localStorage.removeItem('user');
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
      localStorage.removeItem('user');
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
