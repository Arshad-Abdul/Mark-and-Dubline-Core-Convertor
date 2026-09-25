import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  UploadCloud,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  Settings2,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Layers,
} from 'lucide-react';

interface ConvertState {
  status: 'idle' | 'converting' | 'done' | 'error';
  message: string;
  recordCount: number;
  detectedColumns: string[];
}

const DC_ELEMENTS = [
  { key: 'dc.title',                  label: 'Title',                       desc: 'Item title' },
  { key: 'dc.contributor.author',     label: 'Author(s)',                   desc: 'Delimited with ||' },
  { key: 'dc.subject',                label: 'Keywords (Author + Index)',   desc: 'Delimited with ||' },
  { key: 'dc.description.abstract',   label: 'Abstract, Conf., Funding',    desc: 'Merged & sanitized' },
  { key: 'dc.publisher',              label: 'Publisher',                   desc: 'Publisher name' },
  { key: 'dc.date.issued',            label: 'Publication Year',            desc: 'Year (YYYY)' },
  { key: 'dc.type',                   label: 'Document Type',               desc: 'Article, Conference, etc.' },
  { key: 'dc.identifier.doi',         label: 'DOI',                         desc: 'Normalized DOI' },
  { key: 'dc.identifier.scopus',      label: 'Scopus EID',                  desc: 'Unique Scopus identifier' },
  { key: 'dc.identifier.issn',        label: 'ISSN',                        desc: 'ISO 3297 (XXXX-XXXX)' },
  { key: 'dc.source',                 label: 'Journal, Vol., Issue, Pages', desc: 'Standard citation' },
  { key: 'dc.language.iso',           label: 'Language (ISO 639-1)',        desc: 'Normalized code (e.g. en)' },
  { key: 'dc.rights',                 label: 'Open Access',                 desc: 'Rights & access' },
  { key: 'dc.description.provenance', label: 'Provenance: Scopus',          desc: 'Fixed ingestion tag' },
];

const SCOPUS_COLUMNS_REFERENCE = [
  'Authors', 'Author full names', 'Author(s) ID', 'Title', 'Year', 'Source title',
  'Volume', 'Issue', 'Art. No.', 'Page start', 'Page end', 'Cited by', 'DOI', 'Link',
  'Affiliations', 'Authors with affiliations', 'Abstract', 'Author Keywords',
  'Index Keywords', 'Molecular Sequence Numbers', 'Chemicals/CAS', 'Tradenames',
  'Manufacturers', 'Funding Details', 'Funding Texts', 'References',
  'Correspondence Address', 'Editors', 'Publisher', 'Sponsors', 'Conference name',
  'Conference date', 'Conference location', 'Conference code', 'ISSN', 'ISBN',
  'CODEN', 'PubMed ID', 'Language of Original Document', 'Abbreviated Source Title',
  'Document Type', 'Publication Stage', 'Open Access', 'Source', 'EID',
];

export default function ScopusConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [maxAuthors, setMaxAuthors] = useState<number>(20);
  const [collectionHandle, setCollectionHandle] = useState<string>('');
  const [showSchema, setShowSchema] = useState<boolean>(false);
  const [state, setState] = useState<ConvertState>({
    status: 'idle', message: '', recordCount: 0, detectedColumns: [],
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setState({ status: 'idle', message: '', recordCount: 0, detectedColumns: [] });
    }
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
      if (collectionHandle.trim()) form.append('collectionHandle', collectionHandle.trim());
      const res = await fetch('/api/scopus-to-dc', { method: 'POST', body: form });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Conversion failed (${res.status})`);
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] || 'scopus_dublin_core.csv';
      const recordCount = Number(res.headers.get('X-Record-Count') || '0');
      const colsHeader = res.headers.get('X-Detected-Columns');
      const detectedColumns: string[] = colsHeader ? JSON.parse(decodeURIComponent(colsHeader)) : [];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setState({
        status: 'done',
        message: `Successfully converted ${recordCount.toLocaleString()} records → ${filename}`,
        recordCount,
        detectedColumns,
      });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Conversion failed.',
        recordCount: 0,
        detectedColumns: [],
      });
    }
  };

  const missing = state.status === 'done'
    ? SCOPUS_COLUMNS_REFERENCE.filter(
        (c) => !state.detectedColumns.some((d) => d.toLowerCase() === c.toLowerCase()),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* File Ingestion Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center gap-3.5 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-150
          ${isDragging
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
            : file
              ? 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 hover:border-slate-400 dark:hover:border-slate-600'
              : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white/50 dark:bg-slate-900/30'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              setState({ status: 'idle', message: '', recordCount: 0, detectedColumns: [] });
            }
            e.target.value = '';
          }}
        />

        {file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm tracking-tight">{file.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · Click or drop another file to replace
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:scale-105 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                Select or drop Scopus export file
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supports CSV (.csv), Excel (.xlsx, .xls), and Tab-delimited (.tsv, .txt)
              </p>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {['.CSV', '.XLSX', '.XLS', '.TSV'].map((ext) => (
                <span key={ext} className="font-mono text-[10px] uppercase font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DSpace Ingestion Settings Panel */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              DSpace Ingestion Configuration
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">DSpace 5–8 Ready</span>
        </div>

        {/* Collection Handle */}
        <div className="p-5">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Target Collection Handle <span className="text-rose-500">*</span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            The destination DSpace community/collection handle identifier (found in the URL, e.g. <span className="font-mono text-slate-700 dark:text-slate-300">123456789/42</span>).
          </p>
          <input
            type="text"
            value={collectionHandle}
            onChange={(e) => {
              setCollectionHandle(e.target.value);
              setHandleWarning(false);
            }}
            placeholder="e.g. 123456789/42"
            className={`w-full rounded-lg border bg-slate-50/50 dark:bg-slate-950/60 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 font-mono transition-all
              ${handleWarning
                ? 'border-rose-400 focus:ring-rose-400 focus:bg-white'
                : 'border-slate-200 dark:border-slate-700 focus:border-blue-600 focus:ring-blue-600/20 focus:bg-white dark:focus:bg-slate-950'}`}
          />
          {handleWarning && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Collection handle is required for DSpace batch metadata import.
            </p>
          )}
        </div>

        {/* Identifier Field Info & Max Authors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 p-5 gap-5 sm:gap-6">
          {/* Target Identifier Info */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Scopus Identifier Schema
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Mapped automatically to the Scopus unique identifier field (<span className="font-mono text-[11px]">EID</span>).
            </p>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2">
              <span className="font-mono text-xs text-blue-700 dark:text-blue-300 font-medium">
                dc.identifier.scopus
              </span>
            </div>
          </div>

          {/* Author Cap */}
          <div className="sm:pl-1">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Author Cap per Record
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Truncates ultra-long author lists to keep records manageable.
            </p>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-1 gap-1">
              {[5, 10, 20, 50, 0].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxAuthors(n)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all text-center
                    ${maxAuthors === n
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-xs border border-slate-200/80 dark:border-slate-700 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                >
                  {n === 0 ? 'All' : n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DSpace Dublin Core Schema Drawer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSchema(!showSchema)}
          className="w-full px-5 py-3 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Dublin Core Target Schema & Field Mapping
            </span>
            <span className="text-[10px] font-mono uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
              14 Registered Fields
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-400 text-xs">
            <span>{showSchema ? 'Hide details' : 'Show details'}</span>
            {showSchema ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showSchema && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {DC_ELEMENTS.map(({ key, label, desc }) => (
                <div key={key} className="flex items-baseline justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="font-mono text-blue-800 dark:text-blue-300 font-medium shrink-0">
                      {key}
                    </span>
                    <span className="text-slate-400 dark:text-slate-600">→</span>
                    <span className="text-slate-700 dark:text-slate-300 truncate">{label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-2 shrink-0">
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Messages */}
      {state.status === 'error' && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Conversion Error</p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'done' && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm font-semibold">{state.message}</p>
          </div>
          {state.detectedColumns.length > 0 && (
            <div className="text-xs text-emerald-800 dark:text-emerald-300/80 ml-7.5">
              <span className="font-medium">{state.detectedColumns.length} Scopus source columns processed.</span>
              {missing.length > 0 && (
                <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                  ({missing.length} optional reference fields were not present in this export).
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Action Button */}
      <button
        type="button"
        onClick={handleConvert}
        disabled={!file || state.status === 'converting'}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium text-sm py-3.5 px-4 shadow-sm transition-all cursor-pointer"
      >
        {state.status === 'converting' ? (
          <>
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Parsing & Formatting Records…</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>Generate & Download DSpace Dublin Core CSV</span>
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 text-center">
        <Info className="h-3.5 w-3.5 text-slate-400" />
        <span>Output formatted with UTF-8 BOM, standard ISO hyphens, and <code className="font-mono text-slate-700 dark:text-slate-300">dc.description.provenance = "Scopus"</code></span>
      </div>
    </div>
  );
}
