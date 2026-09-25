import type { HistoryEntry } from '../types';
import { History as HistoryIcon, Clock, Trash2, ArrowRight } from 'lucide-react';

interface Props {
  entries: HistoryEntry[];
  onClear: () => void;
}

export default function History({ entries, onClear }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Recent Batch Conversions
          </h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear history</span>
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-xs shadow-xs"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                <span className="truncate max-w-[200px]">{entry.filename}</span>
                <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="text-blue-700 dark:text-blue-400 font-mono truncate max-w-[200px]">{entry.outputFilename}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>·</span>
                <span>{entry.recordCount.toLocaleString()} record{entry.recordCount === 1 ? '' : 's'}</span>
                {entry.warningsCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">· {entry.warningsCount} warnings</span>
                )}
              </div>
            </div>
            <span className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-[11px] font-mono font-semibold uppercase shrink-0 ml-3">
              {entry.outputFormat}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
