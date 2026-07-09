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
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Fields to include ({selected.size}/{tags.length})
        </h3>
        <button
          onClick={() => onChange(allSelected ? new Set() : new Set(tags.map((t) => t.tag)))}
          className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        {tags.map(({ tag, count }) => (
          <label
            key={tag}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors
              ${selected.has(tag)
                ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
          >
            <input type="checkbox" className="hidden" checked={selected.has(tag)} onChange={() => toggle(tag)} />
            <span className="font-mono font-semibold">{tag}</span>
            <span className="opacity-60">×{count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
