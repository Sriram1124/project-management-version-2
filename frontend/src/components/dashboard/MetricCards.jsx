import React from 'react';
import { Users, FolderKanban, Check, Activity } from 'lucide-react';

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

  const calcPct = (num, den) => {
    if (!den || den <= 0) return 0;
    return (num / den) * 100;
  };

  const formatPct = (val) => {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return '0%';
    const rounded = Math.round(val * 10) / 10;
    return rounded % 1 === 0 ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
  };

  const healthyPctNum = calcPct(healthyCount, assessedCount);
  const needsAttentionPctNum = calcPct(needsAttentionCount, assessedCount);
  const atRiskPctNum = calcPct(atRiskCount, assessedCount);
  const criticalPctNum = calcPct(criticalCount, assessedCount);

  const healthyPctFormatted = formatPct(healthyPctNum);
  const needsAttentionPctFormatted = formatPct(needsAttentionPctNum);
  const atRiskPctFormatted = formatPct(atRiskPctNum);
  const criticalPctFormatted = formatPct(criticalPctNum);

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

      {/* Full-Width Portfolio Health Card */}
      <div 
        onClick={() => onCardClick?.('projects')}
        className="w-full bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Portfolio Health
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <Activity className="w-4 h-4" />
          </div>
        </div>

        {healthLoading ? (
          <div className="space-y-3 animate-pulse mt-3">
            <div className="h-8 w-52 bg-slate-200 rounded-lg" />
            <div className="h-2.5 w-full bg-slate-100 rounded-full" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
              <div className="h-12 bg-slate-100 rounded-xl" />
              <div className="h-12 bg-slate-100 rounded-xl" />
              <div className="h-12 bg-slate-100 rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="mt-3">
            {/* Primary Assessed Metric + Exclusion note */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {assessedCount}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {assessedCount === 1 ? 'Project Assessed' : 'Projects Assessed'}
                </span>
                {totalCount > assessedCount && (
                  <span className="text-xs text-slate-400 font-medium">
                    ({totalCount} total in portfolio)
                  </span>
                )}
              </div>

              {notAssessedCount > 0 ? (
                <div className="text-xs text-slate-500 flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>
                    {notAssessedCount} unassessed {notAssessedCount === 1 ? 'project' : 'projects'} excluded from ratio
                  </span>
                </div>
              ) : assessedCount > 0 ? (
                <div className="text-xs text-emerald-700 flex items-center gap-1.5 self-start sm:self-auto bg-emerald-50/60 px-2.5 py-1 rounded-lg border border-emerald-100">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>All portfolio projects assessed</span>
                </div>
              ) : null}
            </div>

            {/* Segmented Horizontal Distribution Bar */}
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex my-3.5 shadow-2xs">
              {assessedCount > 0 ? (
                <>
                  {healthyPctNum > 0 && (
                    <div 
                      style={{ width: `${healthyPctNum}%` }} 
                      className="bg-emerald-500 h-full transition-all duration-300" 
                      title={`Healthy: ${healthyCount} (${healthyPctFormatted})`}
                    />
                  )}
                  {needsAttentionPctNum > 0 && (
                    <div 
                      style={{ width: `${needsAttentionPctNum}%` }} 
                      className="bg-amber-500 h-full transition-all duration-300" 
                      title={`Needs Attention: ${needsAttentionCount} (${needsAttentionPctFormatted})`}
                    />
                  )}
                  {atRiskPctNum > 0 && (
                    <div 
                      style={{ width: `${atRiskPctNum}%` }} 
                      className="bg-orange-500 h-full transition-all duration-300" 
                      title={`At Risk: ${atRiskCount} (${atRiskPctFormatted})`}
                    />
                  )}
                  {criticalPctNum > 0 && (
                    <div 
                      style={{ width: `${criticalPctNum}%` }} 
                      className="bg-rose-500 h-full transition-all duration-300" 
                      title={`Critical: ${criticalCount} (${criticalPctFormatted})`}
                    />
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-slate-200" title="No assessed projects" />
              )}
            </div>

            {/* Four Evenly Spaced Sections: Healthy, Needs Attention, At Risk, Critical */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-3 border-t border-slate-100">
              {/* Healthy */}
              <div className="flex flex-col sm:border-r sm:border-slate-100 sm:pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-2xs" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate">
                    Healthy
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {healthyCount}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">
                    {healthyPctFormatted}
                  </span>
                </div>
              </div>

              {/* Needs Attention */}
              <div className="flex flex-col sm:border-r sm:border-slate-100 sm:pr-3 sm:pl-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-2xs" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate">
                    Needs Attention
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {needsAttentionCount}
                  </span>
                  <span className="text-xs font-bold text-amber-600">
                    {needsAttentionPctFormatted}
                  </span>
                </div>
              </div>

              {/* At Risk */}
              <div className="flex flex-col sm:border-r sm:border-slate-100 sm:pr-3 sm:pl-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0 shadow-2xs" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate">
                    At Risk
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {atRiskCount}
                  </span>
                  <span className="text-xs font-bold text-orange-600">
                    {atRiskPctFormatted}
                  </span>
                </div>
              </div>

              {/* Critical */}
              <div className="flex flex-col sm:pl-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 shadow-2xs" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate">
                    Critical
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {criticalCount}
                  </span>
                  <span className="text-xs font-bold text-rose-600">
                    {criticalPctFormatted}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

