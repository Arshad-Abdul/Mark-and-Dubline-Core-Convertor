import { FORMATS } from '../types';
import type { MarcFormat } from '../types';

interface Props {
  value: MarcFormat;
  onChange: (format: MarcFormat) => void;
  disabledFormat?: MarcFormat | null;
}

export default function FormatPicker({ value, onChange, disabledFormat }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {FORMATS.map((format) => {
        const isDisabled = format.id === disabledFormat;
        const isSelected = format.id === value;
        return (
          <button
            key={format.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(format.id)}
            className={`rounded-xl border p-3 text-left transition-all
              ${isSelected
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-600/20 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'}
              ${isDisabled ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-950' : 'cursor-pointer'}`}
          >
            <div className="font-semibold text-xs tracking-tight">{format.label}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{format.extension}</div>
          </button>
        );
      })}
    </div>
  );
}
