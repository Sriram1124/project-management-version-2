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
  const hasManagerPermissions =
    allowedRoles?.includes('MANAGER') &&
    user.role !== 'INTERN' &&
    user.role !== 'EMPLOYEE' &&
    Array.isArray(user.permissions) &&
    user.permissions.some((p) => ['USER_READ', 'USER_CREATE', 'ORGANIZATION_READ'].includes(p));

  if (!hasRole && !hasManagerPermissions) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (user.must_change_password) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
