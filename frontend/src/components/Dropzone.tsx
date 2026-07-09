import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';

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
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer
          ${isDragging
            ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
            : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500'}`}
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
        <div className="text-4xl">📄</div>
        {files.length > 0 ? (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">click or drop to add more</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">Drag & drop file(s) here, or click to browse</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Supports .mrc, .mrk, .csv, .xlsx, .xml</p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            >
              <span className="text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(index);
                }}
                className="text-slate-400 hover:text-rose-500 transition-colors ml-3"
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
