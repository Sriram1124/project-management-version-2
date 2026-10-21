import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function InternAttendance({ attendanceData, onDrilldown }) {
  if (!attendanceData || !attendanceData.percentage) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Intern Attendance
          </h3>
          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
            Planned for V2
          </span>
        </div>
        <div className="py-12 text-center text-slate-400">
          <p className="font-semibold text-slate-700 text-sm">No Attendance Recorded</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            Attendance check-ins, timesheet reconciliation, and absence alerts are planned for V2.
          </p>
        </div>
      </div>
    );
  }

  const [timeframe, setTimeframe] = useState('This Week');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // SVG Gauge calculations
  const size = 180;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const percent = attendanceData.percentage;
  const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
      {/* Header with Dropdown */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">
          Intern Attendance
        </h3>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:text-slate-700 bg-white shadow-2xs transition-colors"
          >
            <span>{timeframe}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20">
              {['Today', 'This Week', 'This Month', 'Sprint 2'].map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setTimeframe(option);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 hover:text-purple-700 transition-colors ${
                    timeframe === option ? 'text-purple-600 font-semibold bg-purple-50/50' : 'text-slate-600'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SVG Donut Gauge */}
      <div className="my-6 flex flex-col items-center justify-center relative">
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#F59E0B"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Present (Green) segment */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#10B981"
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={0}
              fill="transparent"
              strokeLinecap="butt"
              className="transition-all duration-700"
            />
          </svg>

          {/* Center text inside Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
              {percent}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-1">
              Attendance
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Metrics */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 pt-2 border-t border-slate-100 text-center">
        <button type="button" className="w-full text-center px-1 cursor-pointer hover:bg-slate-50 py-1 rounded-lg transition-colors" onClick={() => onDrilldown?.('present')}>
          <div className="text-base font-bold text-slate-800">
            {attendanceData.present}
          </div>
          <div className="text-[11px] font-medium text-slate-400">
            Present
          </div>
        </button>
        <button type="button" className="w-full text-center px-1 cursor-pointer hover:bg-slate-50 py-1 rounded-lg transition-colors" onClick={() => onDrilldown?.('absent')}>
          <div className="text-base font-bold text-rose-500">
            {attendanceData.absent}
          </div>
          <div className="text-[11px] font-medium text-slate-400">
            Absent
          </div>
        </button>
        <button type="button" className="w-full text-center px-1 cursor-pointer hover:bg-slate-50 py-1 rounded-lg transition-colors" onClick={() => onDrilldown?.('late')}>
          <div className="text-base font-bold text-amber-500">
            {attendanceData.late}
          </div>
          <div className="text-[11px] font-medium text-slate-400">
            Late
          </div>
        </button>
      </div>
    </div>
  );
}

