import React from 'react';

/**
 * ProjectMethodologyBadge
 * Standardized badge component for Project Methodology (SCRUM vs KANBAN).
 *
 * Guarantees visual consistency across the entire application:
 * - Equal height & width (exact same dimensions: w-16 / 64px, h-5 / 20px)
 * - Identical vertical & horizontal alignment
 * - Identical typography (font-bold, text-[10px], uppercase, tracking-wider, leading-none)
 * - Identical border width and border radius (rounded-md)
 * - Distinct, accessible color schemes:
 *   - SCRUM:  Purple theme (bg-purple-50 text-purple-700 border-purple-200)
 *   - KANBAN: Indigo theme (bg-indigo-50 text-indigo-700 border-indigo-200)
 */
export function ProjectMethodologyBadge({
  methodology,
  size = 'sm',
  className = '',
  title,
}) {
  const isKanban = String(methodology || '').toUpperCase().trim() === 'KANBAN';
  const label = isKanban ? 'KANBAN' : 'SCRUM';

  const sizeClasses = size === 'md'
    ? 'w-20 h-6 text-xs px-2.5 rounded-lg'
    : 'w-16 h-5 text-[10px] px-1.5 rounded-md';

  const colorClasses = isKanban
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : 'bg-purple-50 text-purple-700 border-purple-200';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 font-bold uppercase tracking-wider leading-none text-center border whitespace-nowrap select-none transition-colors ${sizeClasses} ${colorClasses} ${className}`}
      title={title || `${label} Methodology`}
    >
      {label}
    </span>
  );
}

export default ProjectMethodologyBadge;
