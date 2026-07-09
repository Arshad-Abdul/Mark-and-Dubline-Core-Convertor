import type { HistoryEntry } from '../types';

interface Props {
  entries: HistoryEntry[];
  onClear: () => void;
}

export default function History({ entries, onClear }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent conversions</h2>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {entry.filename} <span className="text-slate-400">→</span> {entry.outputFilename}
              </span>
              <span className="text-xs text-slate-400">
                {entry.recordCount} record{entry.recordCount === 1 ? '' : 's'}
                {entry.warningsCount > 0 && <> · {entry.warningsCount} warning{entry.warningsCount === 1 ? '' : 's'}</>}
                {' · '}
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            <span className="rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-xs font-medium uppercase">
              {entry.outputFormat}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
