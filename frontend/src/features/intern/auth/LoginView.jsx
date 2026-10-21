import React, { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginView({ onLogin }) {
  const [selectedRole, setSelectedRole] = useState('manager');
  const [email, setEmail] = useState('sarah.m@dailoqa.com');
  const [password, setPassword] = useState('••••••••••••');

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    if (role === 'manager') {
      setEmail('sarah.m@dailoqa.com');
    } else {
      setEmail('aarav.p@dailoqa.com');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(selectedRole);
  };

  return (
    <div className="min-h-screen bg-[#f7f4ff] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl rounded-[32px] border border-violet-200 bg-white/80 p-6 shadow-[0_32px_80px_rgba(109,40,217,0.08)] backdrop-blur-md sm:p-8 lg:p-10">
        <div className="mb-8">
          <div className="text-xl font-bold tracking-tight text-slate-900">Project Management</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-violet-100 bg-violet-50/40 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Select your role</h2>
            <p className="mt-1 text-sm text-slate-500">Use your Dailoqa user credentials to continue.</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleSelectRole('manager')}
                className={`w-full cursor-pointer rounded-2xl border p-4 text-center transition ${
                  selectedRole === 'manager'
                    ? 'border-violet-300 bg-white shadow-md'
                    : 'border-violet-100 bg-white/70 hover:border-violet-200'
                }`}
              >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">SM</div>
                <div className="text-sm font-bold text-slate-900">Sarah Mitchell</div>
                <div className="mt-1 text-[11px] font-medium text-violet-700">Program Manager</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRole('intern')}
                className={`w-full cursor-pointer rounded-2xl border p-4 text-center transition ${
                  selectedRole === 'intern'
                    ? 'border-violet-300 bg-white shadow-md'
                    : 'border-violet-100 bg-white/70 hover:border-violet-200'
                }`}
              >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">AP</div>
                <div className="text-sm font-bold text-slate-900">Aarav Patel</div>
                <div className="mt-1 text-[11px] font-medium text-violet-700">Engineering Intern</div>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-sm">
              <div>
                <label htmlFor="intern-demo-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="intern-demo-email" type="email" value={email} readOnly className="w-full rounded-2xl border border-violet-200 bg-white py-3 pl-10 pr-3 text-slate-700" />
                </div>
              </div>

              <div>
                <label htmlFor="intern-demo-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="intern-demo-password" type="password" value={password} readOnly className="w-full rounded-2xl border border-violet-200 bg-white py-3 pl-10 pr-3 text-slate-700" />
                </div>
              </div>

              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700">
                {selectedRole === 'manager' ? 'Sign In to Manager Console' : 'Sign In to Intern Workspace'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6 sm:p-8">
            <div className="absolute left-[-2rem] top-[-2rem] h-40 w-40 rounded-full bg-violet-200/70 blur-3xl" />
            <div className="absolute bottom-[-2rem] right-[-2rem] h-40 w-40 rounded-full bg-purple-200/80 blur-3xl" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-violet-600 text-3xl font-black text-white shadow-lg shadow-violet-200">D</div>
              <div className="text-4xl font-black tracking-[-0.08em] text-slate-900">Dailoqa</div>
              <p className="mt-3 max-w-sm text-sm text-slate-600">Project management, intern performance, and team operations centralized in one secure platform.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
