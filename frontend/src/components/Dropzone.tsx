import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

interface Props {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}

const ACCEPTED_EXTENSIONS = ['.mrc', '.mrk', '.csv', '.xlsx', '.xls', '.xml'];

export default function Dropzone({ files, onFilesSelected, onRemoveFile }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) onFilesSelected(Array.from(e.dataTransfer.files));
    },
    [onFilesSelected],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/30 dark:bg-slate-900/30'}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFilesSelected(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:scale-105 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all">
          <UploadCloud className="h-6 w-6" />
        </div>
        {files.length > 0 ? (
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              {files.length} file{files.length === 1 ? '' : 's'} queued for processing
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click or drop additional files to add</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Select or drop MARC files here
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supports Binary MARC (.mrc), Mnemonic (.mrk), MARCXML (.xml), CSV, Excel (.xlsx, .xls)
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {['.MRC', '.MRK', '.XML', '.CSV', '.XLSX'].map((ext) => (
                <span key={ext} className="font-mono text-[10px] uppercase font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-4 w-4 text-blue-700 dark:text-blue-400 shrink-0" />
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{file.name}</span>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(index);
                }}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors p-1"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
