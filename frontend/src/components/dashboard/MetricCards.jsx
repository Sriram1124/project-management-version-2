import React from 'react';
import { Users, FolderKanban, Check, AlertCircle } from 'lucide-react';

export default function MetricCards({ metrics, onCardClick }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Interns */}
      <div 
        onClick={() => onCardClick?.('interns')}
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Interns
          </span>
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {metrics.totalInterns.value}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{metrics.totalInterns.change}</span>
          </div>
        </div>
      </div>

      {/* Active Projects */}
      <div 
        onClick={() => onCardClick?.('projects')}
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Active Projects
          </span>
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <FolderKanban className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {metrics.activeProjects.value}
          </div>
          <div className="mt-1 text-xs font-medium text-slate-400">
            {metrics.activeProjects.subtitle}
          </div>
        </div>
      </div>

      {/* Tasks Completed */}
      <div 
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card flex flex-col justify-between select-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tasks Completed
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <Check className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {metrics.tasksCompleted.value}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{metrics.tasksCompleted.change}</span>
          </div>
        </div>
      </div>

      {/* Overdue Tasks */}
      <div 
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card flex flex-col justify-between select-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Overdue Tasks
          </span>
          <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {metrics.overdueTasks.value}
          </div>
          <div className="mt-1 text-xs font-semibold text-rose-500">
            {metrics.overdueTasks.subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

