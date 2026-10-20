import React from 'react';
import { Users, FolderKanban, Check, Activity, PieChart } from 'lucide-react';

export default function MetricCards({ 
  metrics, 
  healthOverview, 
  healthLoading = false, 
  onCardClick 
}) {
  const summary = healthOverview?.summary || {};
  const healthyCount = Number(summary.healthy) || 0;
  const needsAttentionCount = Number(summary.needs_attention) || 0;
  const atRiskCount = typeof summary.at_risk_only === 'number'
    ? summary.at_risk_only
    : (Number(summary.at_risk) || 0) - needsAttentionCount >= 0
    ? (Number(summary.at_risk) || 0) - needsAttentionCount
    : Number(summary.at_risk) || 0;
  const criticalCount = Number(summary.critical) || 0;
  const notAssessedCount = Number(summary.not_assessed ?? summary.insufficient_data) || 0;

  // Assessed Projects = Healthy + Needs Attention + At Risk + Critical
  const assessedCount = typeof summary.assessed === 'number' 
    ? summary.assessed 
    : (healthyCount + needsAttentionCount + atRiskCount + criticalCount);
  const totalCount = typeof summary.total === 'number'
    ? summary.total
    : (assessedCount + notAssessedCount);

  // Category percentage calculation against the total portfolio project count
  const calcPct = (num, den) => {
    if (!den || den <= 0) return 0;
    return Number(((num / den) * 100).toFixed(1));
  };

  const formatPct = (val) => {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return '0%';
    const rounded = Math.round(val * 10) / 10;
    return rounded % 1 === 0 ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
  };

  const healthyPct = calcPct(healthyCount, totalCount);
  const needsAttentionPct = calcPct(needsAttentionCount, totalCount);
  const atRiskPct = calcPct(atRiskCount, totalCount);
  const criticalPct = calcPct(criticalCount, totalCount);
  const notAssessedPct = calcPct(notAssessedCount, totalCount);

  const categories = [
    {
      id: 'healthy',
      name: 'Healthy',
      count: healthyCount,
      percentage: healthyPct,
      color: '#10b981', // emerald-500
      bgClass: 'bg-emerald-500',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200',
      hoverBg: 'hover:bg-emerald-50/50',
    },
    {
      id: 'needs_attention',
      name: 'Needs Attention',
      count: needsAttentionCount,
      percentage: needsAttentionPct,
      color: '#f59e0b', // amber-500
      bgClass: 'bg-amber-500',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200',
      hoverBg: 'hover:bg-amber-50/50',
    },
    {
      id: 'at_risk',
      name: 'At Risk',
      count: atRiskCount,
      percentage: atRiskPct,
      color: '#f97316', // orange-500
      bgClass: 'bg-orange-500',
      textClass: 'text-orange-700',
      borderClass: 'border-orange-200',
      hoverBg: 'hover:bg-orange-50/50',
    },
    {
      id: 'critical',
      name: 'Critical',
      count: criticalCount,
      percentage: criticalPct,
      color: '#ef4444', // rose-500
      bgClass: 'bg-rose-500',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200',
      hoverBg: 'hover:bg-rose-50/50',
    },
    {
      id: 'not_assessed',
      name: 'Not Assessed',
      count: notAssessedCount,
      percentage: notAssessedPct,
      color: '#94a3b8', // slate-400
      bgClass: 'bg-slate-400',
      textClass: 'text-slate-600',
      borderClass: 'border-slate-200',
      hoverBg: 'hover:bg-slate-50',
    },
  ];

  // SVG Donut Calculations
  // Center: (90, 90), Radius: 60, Circumference: 2 * PI * 60 ~= 376.991
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const donutSegments = categories
    .filter((cat) => cat.count > 0 && totalCount > 0)
    .map((cat) => {
      const segmentRatio = cat.count / totalCount;
      const strokeLength = segmentRatio * circumference;
      const strokeSpace = circumference - strokeLength;
      const offset = cumulativeOffset;
      cumulativeOffset += strokeLength;
      return {
        ...cat,
        strokeDasharray: `${strokeLength} ${strokeSpace}`,
        strokeDashoffset: -offset,
      };
    });

  return (
    <div className="space-y-4">
      {/* Top Row: Total Interns & Active Projects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 1. Total Interns */}
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
              {metrics?.totalInterns?.value ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{metrics?.totalInterns?.change ?? '0 Active'}</span>
            </div>
          </div>
        </div>

        {/* 2. Active Projects */}
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
              {metrics?.activeProjects?.value ?? 0}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-400">
              {metrics?.activeProjects?.subtitle ?? '0 In Progress'}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Portfolio Health Card: Redesigned Donut Chart */}
      <div 
        onClick={() => onCardClick?.('projects')}
        className="w-full bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 tracking-tight block">
                Portfolio Health
              </span>
              <span className="text-[11px] text-slate-500">
                Delivery health distribution across all active portfolio projects
              </span>
            </div>
          </div>

          {/* Assessed Project Count Summary */}
          <div className="text-right">
            <div className="text-xs font-bold text-slate-900">
              {assessedCount} of {totalCount} projects assessed
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              {notAssessedCount > 0 
                ? `${notAssessedCount} Not Assessed (missing estimates)` 
                : totalCount > 0 
                ? 'All projects assessed' 
                : 'No projects in portfolio'}
            </div>
          </div>
        </div>

        {healthLoading ? (
          <div className="py-8 flex items-center justify-center gap-8 animate-pulse">
            <div className="w-44 h-44 rounded-full bg-slate-100 border-8 border-slate-200" />
            <div className="space-y-3 flex-1 max-w-sm">
              <div className="h-6 bg-slate-100 rounded-lg w-full" />
              <div className="h-6 bg-slate-100 rounded-lg w-full" />
              <div className="h-6 bg-slate-100 rounded-lg w-full" />
              <div className="h-6 bg-slate-100 rounded-lg w-full" />
            </div>
          </div>
        ) : (
          <div className="pt-4 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10">
            {/* Left: Donut Chart Visualization */}
            <div className="relative shrink-0 flex items-center justify-center">
              <svg 
                viewBox="0 0 180 180" 
                className="w-44 h-44 sm:w-48 sm:h-48 transform -rotate-90"
              >
                {/* Background Ring */}
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="20"
                />

                {/* Data Segments */}
                {donutSegments.length > 0 ? (
                  donutSegments.map((segment) => (
                    <circle
                      key={segment.id}
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="transparent"
                      stroke={segment.color}
                      strokeWidth="20"
                      strokeDasharray={segment.strokeDasharray}
                      strokeDashoffset={segment.strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-700 ease-out"
                    />
                  ))
                ) : (
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke="#e2e8f0"
                    strokeWidth="20"
                  />
                )}
              </svg>

              {/* Center Total Counter */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                  {totalCount}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  {totalCount === 1 ? 'Project' : 'Projects'}
                </span>
              </div>
            </div>

            {/* Right: Detailed Category Legend */}
            <div className="flex-1 w-full space-y-2">
              {categories.map((cat) => {
                const isZero = cat.count === 0;
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border border-slate-100 bg-white transition-all ${cat.hoverBg}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-3 h-3 rounded-full ${cat.bgClass} shadow-2xs shrink-0`} />
                      <span className={`text-xs font-semibold ${isZero ? 'text-slate-400' : 'text-slate-800'}`}>
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold ${isZero ? 'text-slate-400' : 'text-slate-900'}`}>
                        {cat.count} {cat.count === 1 ? 'project' : 'projects'}
                      </span>
                      <span className={`text-xs font-extrabold min-w-[44px] text-right ${isZero ? 'text-slate-400' : cat.textClass}`}>
                        {formatPct(cat.percentage)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
