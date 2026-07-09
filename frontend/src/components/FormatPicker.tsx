import { FORMATS } from '../types';
import type { MarcFormat } from '../types';

interface Props {
  value: MarcFormat;
  onChange: (format: MarcFormat) => void;
  disabledFormat?: MarcFormat | null;
}

export default function FormatPicker({ value, onChange, disabledFormat }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {FORMATS.map((format) => {
        const isDisabled = format.id === disabledFormat;
        const isSelected = format.id === value;
        return (
          <button
            key={format.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(format.id)}
            className={`rounded-xl border p-3 text-left transition-colors
              ${isSelected
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500'
                : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}
              ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{format.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{format.extension}</div>
          </button>
        );
      })}
    </div>
  );
}
