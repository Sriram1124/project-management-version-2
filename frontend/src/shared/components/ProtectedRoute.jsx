import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const hasRole = !allowedRoles || allowedRoles.includes(user.role);
  const hasManagerPermissions = allowedRoles?.includes('MANAGER') && Array.isArray(user.permissions) && user.permissions.length > 0;

  if (!hasRole && !hasManagerPermissions) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (user.must_change_password) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
