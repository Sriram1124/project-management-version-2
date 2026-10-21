import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './shared/components/ProtectedRoute';
import ErrorBoundary from './shared/components/ErrorBoundary';

// Lazy-load root portal applications for minimal initial bundle payload
const LoginView = lazy(() => import('./features/auth/LoginView'));
const ManagerApp = lazy(() => import('./ManagerApp'));
const InternApp = lazy(() => import('./features/intern/InternApp'));
const SuperAdminApp = lazy(() => import('./features/super-admin/SuperAdminApp'));

function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F7FB]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500 tracking-wide">Loading workspace...</span>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { logout } = useAuth();
  
  return (
    <Suspense fallback={<PageLoadingFallback />}>
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
    </Suspense>
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
