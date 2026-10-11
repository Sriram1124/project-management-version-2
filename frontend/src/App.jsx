import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './shared/components/ProtectedRoute';
import ErrorBoundary from './shared/components/ErrorBoundary';

import LoginView from './features/auth/LoginView';
import ManagerApp from './ManagerApp';
import InternApp from './features/intern/InternApp';
import SuperAdminApp from './features/super-admin/SuperAdminApp';

function AppRoutes() {
  const { logout } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={<LoginView />} />
      
      <Route 
        path="/manager/*" 
        element={
          <ProtectedRoute allowedRoles={['MANAGER']}>
            <ManagerApp />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/intern/*" 
        element={
          <ProtectedRoute allowedRoles={['INTERN', 'EMPLOYEE', 'TECH_LEAD']}>
            <InternApp onLogout={logout} />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/super-admin/*" 
        element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <SuperAdminApp />
          </ProtectedRoute>
        } 
      />

      <Route path="/unauthorized" element={<div className="p-8 text-center text-xl text-red-600">Coming Soon / Unauthorized</div>} />
      
      {/* Catch all redirects to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
