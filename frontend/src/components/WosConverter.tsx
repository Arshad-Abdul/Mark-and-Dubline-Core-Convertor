import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';

interface ConvertState {
  status: 'idle' | 'converting' | 'done' | 'error';
  message: string;
  recordCount: number;
  detectedColumns: string[];
}

const DC_ELEMENTS = [
  { key: 'dc.title',                  label: 'Article Title (TI)' },
  { key: 'dc.contributor.author',     label: 'Authors / Full Names (AU)' },
  { key: 'dc.subject',                label: 'Keywords (DE, ID)' },
  { key: 'dc.description.abstract',   label: 'Abstract, Conf., Funding' },
  { key: 'dc.publisher',              label: 'Publisher (PU)' },
  { key: 'dc.date.issued',            label: 'Publication Year (PY)' },
  { key: 'dc.type',                   label: 'Document Type (DT)' },
  { key: 'dc.identifier.doi',         label: 'DOI (DI)' },
  { key: 'dc.identifier.wos',         label: 'WoS Accession / UT' },
  { key: 'dc.identifier.issn',        label: 'ISSN / eISSN (SN)' },
  { key: 'dc.source',                 label: 'Journal, Vol., Issue, Pages' },
  { key: 'dc.language.iso',           label: 'Language (ISO 639-1)' },
  { key: 'dc.rights',                 label: 'Open Access (OA)' },
  { key: 'dc.description.provenance', label: 'Provenance: Web of Science' },
];

const WOS_COLUMNS_REFERENCE = [
  'Article Title', 'Authors', 'Author Full Names', 'Book Authors', 'Book Editors',
  'Source Title', 'Publication Year', 'Volume', 'Issue', 'Beginning Page', 'Ending Page',
  'Article Number', 'DOI', 'DOI Link', 'Abstract', 'Author Keywords', 'Keywords Plus',
  'Addresses', 'Affiliations', 'Reprint Address', 'Funding Orgs', 'Funding Text',
  'Cited References', 'Cited Reference Count', 'Times Cited, WoS Core', 'Publisher',
  'ISSN', 'eISSN', 'ISBN', 'Language', 'Document Type', 'Conference Title',
  'Conference Date', 'Conference Location', 'Conference Sponsor', 'UT (Unique WOS ID)',
  'Open Access Designations',
];

export default function WosConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [maxAuthors, setMaxAuthors] = useState<number>(20);
  const [collectionHandle, setCollectionHandle] = useState<string>('');
  const [wosIdField, setWosIdField] = useState<'dc.identifier.wos' | 'dc.identifier.other'>('dc.identifier.wos');
  const [state, setState] = useState<ConvertState>({
    status: 'idle', message: '', recordCount: 0, detectedColumns: [],
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) { setFile(dropped); setState({ status: 'idle', message: '', recordCount: 0, detectedColumns: [] }); }
  }, []);

  const [handleWarning, setHandleWarning] = useState(false);

  const handleConvert = async () => {
    if (!file) return;
    if (!collectionHandle.trim()) {
      setHandleWarning(true);
      return;
    }
    setHandleWarning(false);
    setState({ status: 'converting', message: '', recordCount: 0, detectedColumns: [] });

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('maxAuthors', String(maxAuthors));
      form.append('wosIdField', wosIdField);
      if (collectionHandle.trim()) form.append('collectionHandle', collectionHandle.trim());
      const res = await fetch('/api/wos-to-dc', { method: 'POST', body: form });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Conversion failed (${res.status})`);
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] || 'dublin_core.csv';
      const recordCount = Number(res.headers.get('X-Record-Count') || '0');
      const colsHeader = res.headers.get('X-Detected-Columns');
      const detectedColumns: string[] = colsHeader ? JSON.parse(decodeURIComponent(colsHeader)) : [];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);

      setState({ status: 'done', message: `Converted ${recordCount} records → ${filename}`, recordCount, detectedColumns });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Conversion failed.', recordCount: 0, detectedColumns: [] });
    }
  };

  const missing = state.status === 'done'
    ? WOS_COLUMNS_REFERENCE.filter(
        (c) => !state.detectedColumns.some((d) => d.toLowerCase() === c.toLowerCase()),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                       : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setState({ status: 'idle', message: '', recordCount: 0, detectedColumns: [] }); }
            e.target.value = '';
          }}
        />
        <div className="text-4xl">🌐</div>
        {file ? (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">{file.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB — click or drop to replace</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">Drop your Web of Science export file here, or click to browse</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Supports Excel (.xlsx, .xls), CSV (.csv), and Tab-delimited (.tsv, .txt). Full records & custom selections supported.
            </p>
          </div>
        )}
      </div>

      {/* DSpace collection handle */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          DSpace Collection Handle
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
          Required for DSpace import. Find it in your collection's URL, e.g. <span className="font-mono">123456789/42</span>. Leave blank to fill in later.
        </p>
        <input
          type="text"
          value={collectionHandle}
          onChange={(e) => { setCollectionHandle(e.target.value); setHandleWarning(false); }}
          placeholder="e.g. 123456789/42"
          className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2
            ${handleWarning
              ? 'border-rose-400 focus:ring-rose-400'
              : 'border-slate-200 dark:border-slate-700 focus:ring-violet-400'}`}
        />
        {handleWarning && (
          <p className="mt-1.5 text-xs text-rose-500">
            Required — DSpace will reject the file without a collection handle. Find it in your collection's URL after <span className="font-mono">/handle/</span>.
          </p>
        )}
      </div>

      {/* WoS Identifier Field & Author limit row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Identifier column in DSpace */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">WoS Identifier Field</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Column name in your DSpace schema for the UT / Accession number.
            </p>
          </div>
          <div className="flex gap-2 mt-3">
            {([
              ['dc.identifier.wos', 'dc.identifier.wos'],
              ['dc.identifier.other', 'dc.identifier.other'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setWosIdField(val)}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors
                  ${wosIdField === val
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-violet-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Max authors */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Max authors per record</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Limits authors per row to keep cells readable. 0 means all authors.
            </p>
          </div>
          <div className="flex gap-1.5 mt-3 shrink-0">
            {[5, 10, 20, 50, 0].map((n) => (
              <button
                key={n}
                onClick={() => setMaxAuthors(n)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium border transition-colors
                  ${maxAuthors === n
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-violet-300'}`}
              >
                {n === 0 ? 'All' : n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DC mapping reference */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Web of Science → Dublin Core field mapping</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
          {DC_ELEMENTS.map(({ key, label }) => {
            const displayKey = key === 'dc.identifier.wos' ? wosIdField : key;
            return (
              <div key={key} className="flex items-baseline gap-1.5">
                <span className="font-mono text-violet-600 dark:text-violet-400 shrink-0">{displayKey}</span>
                <span className="text-slate-400 dark:text-slate-500">→</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {state.status === 'error' && (
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm px-4 py-2.5">
          {state.message}
        </div>
      )}
      {state.status === 'done' && (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm px-4 py-2.5">
            {state.message}
          </div>
          {state.detectedColumns.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">{state.detectedColumns.length} WoS columns detected</span>
              {missing.length > 0 && (
                <> · <span className="text-amber-600 dark:text-amber-400">{missing.length} reference columns not present in this custom selection:</span>
                {' '}{missing.slice(0, 6).join(', ')}{missing.length > 6 ? ` +${missing.length - 6} more` : ''}</>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleConvert}
        disabled={!file || state.status === 'converting'}
        className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
      >
        {state.status === 'converting' ? 'Converting…' : 'Convert to Dublin Core CSV'}
      </button>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center -mt-2">
        Output is a DSpace Dublin Core CSV format with collection handle and <span className="font-mono">dc.description.provenance = "Web of Science"</span>.
      </p>
    </div>
  );
}
