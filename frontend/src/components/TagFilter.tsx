import type { TagInfo } from '../types';

interface Props {
  tags: TagInfo[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function TagFilter({ tags, selected, onChange }: Props) {
  if (tags.length === 0) return null;

  const allSelected = selected.size === tags.length;

  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Fields to include ({selected.size}/{tags.length})
        </h3>
        <button
          type="button"
          onClick={() => onChange(allSelected ? new Set() : new Set(tags.map((t) => t.tag)))}
          className="text-xs text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3">
        {tags.map(({ tag, count }) => (
          <label
            key={tag}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs cursor-pointer transition-colors
              ${selected.has(tag)
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-medium'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}
          >
            <input type="checkbox" className="hidden" checked={selected.has(tag)} onChange={() => toggle(tag)} />
            <span className="font-mono font-semibold">{tag}</span>
            <span className="opacity-60 text-[10px]">×{count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
