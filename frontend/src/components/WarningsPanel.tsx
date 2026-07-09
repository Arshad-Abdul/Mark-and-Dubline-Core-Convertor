import { useState } from 'react';

interface Props {
  warnings: string[];
  totalCount: number;
}

export default function WarningsPanel({ warnings, totalCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (totalCount === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300"
      >
        <span>⚠️ {totalCount} warning{totalCount === 1 ? '' : 's'} found</span>
        <span className="text-xs">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <ul className="px-4 pb-3 flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-400 max-h-40 overflow-y-auto">
          {warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
          {totalCount > warnings.length && <li className="opacity-70">…and {totalCount - warnings.length} more.</li>}
        </ul>
      )}
    </div>
  );
}
