import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Download,
  Terminal,
  Copy,
  Check,
  Table2,
  Columns3,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface ConvertState {
  status: 'idle' | 'converting' | 'done' | 'error';
  message: string;
  recordCount: number;
  detectedColumns: string[];
}

interface PreviewData {
  recordCount: number;
  detectedColumns: string[];
  header: string[];
  rows: string[][];
  previewCount: number;
}

const DC_ELEMENTS = [
  { key: 'dc.title',                  tag: 'TI',      label: 'Article Title',                 sample: 'Deep learning approaches for metadata extraction' },
  { key: 'dc.contributor.author',     tag: 'AU / AF', label: 'Authors (Full Names)',          sample: 'Sharma, R.||Patel, A. K.||Verma, S.' },
  { key: 'dc.source',                 tag: 'SO / VL', label: 'Journal, Vol, Issue, Pages',    sample: 'Journal of Informetrics, vol. 18, no. 3, pp. 2412-2425' },
  { key: 'dc.identifier.issn',        tag: 'SN / EI', label: 'ISSN / eISSN (ISO 3297)',       sample: '0022-3229||1875-5879' },
  { key: 'dc.identifier.doi',         tag: 'DI',      label: 'Digital Object Identifier',     sample: '10.1016/j.joi.2025.101422' },
  { key: 'dc.identifier.wos',         tag: 'UT',      label: 'Web of Science Accession ID',   sample: 'WOS:001194827100001' },
  { key: 'dc.date.issued',            tag: 'PY',      label: 'Publication Year',              sample: '2025' },
  { key: 'dc.type',                   tag: 'DT',      label: 'Document Type',                 sample: 'Article' },
  { key: 'dc.subject',                tag: 'DE / ID', label: 'Author Keywords & Keywords+',   sample: 'Bibliometrics||Institutional Repositories||DSpace' },
  { key: 'dc.publisher',              tag: 'PU',      label: 'Publisher Name',                sample: 'Elsevier BV' },
  { key: 'dc.language.iso',           tag: 'LA',      label: 'Language (ISO 639-1)',          sample: 'en' },
  { key: 'dc.rights',                 tag: 'OA',      label: 'Open Access Designation',       sample: 'Gold Open Access' },
  { key: 'dc.description.abstract',   tag: 'AB / FU', label: 'Abstract, Conf. & Funding',     sample: 'This study investigates automated cataloging workflows...' },
  { key: 'dc.description.provenance', tag: 'FIXED',   label: 'Repository Provenance Stamp',   sample: 'Web of Science' },
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
  const [collectionHandle, setCollectionHandle] = useState<string>('123456789/1');
  const [wosIdField, setWosIdField] = useState<'dc.identifier.wos' | 'dc.identifier.other'>('dc.identifier.wos');
  const [activeTab, setActiveTab] = useState<'preview' | 'columns'>('preview');
  const [copiedCli, setCopiedCli] = useState(false);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [state, setState] = useState<ConvertState>({
    status: 'idle', message: '', recordCount: 0, detectedColumns: [],
  });
  const [handleWarning, setHandleWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Automatically fetch live preview whenever file or maxAuthors changes
  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('maxAuthors', String(maxAuthors));
    form.append('wosIdField', wosIdField);
    form.append('collectionHandle', collectionHandle.trim() || '123456789/1');

    fetch('/api/wos-to-dc/preview', { method: 'POST', body: form })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Preview failed (${res.status})`);
        }
        return res.json() as Promise<PreviewData>;
      })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Unable to parse file preview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, maxAuthors, wosIdField]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setState({ status: 'idle', message: '', recordCount: 0, detectedColumns: [] });
    }
  }, []);

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
      const filename = match?.[1] || 'wos_dublin_core.csv';
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
        message: `Exported ${recordCount.toLocaleString()} records → ${filename}`,
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

  const outputFilename = file
    ? `${file.name.replace(/\.[^.]+$/, '')}_dublin_core.csv`
    : 'wos_export_dublin_core.csv';

  const cliCommand = `dspace metadata-import -f "${outputFilename}" -e admin@institution.edu`;

  const copyCli = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const detectedCols = preview?.detectedColumns || state.detectedColumns;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ── LEFT WORKSTATION COLUMN: FILE BAR & DATA INSPECTOR (8 Cols) ── */}
      <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">

        {/* Compact Horizontal Ingestion Bar */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 cursor-pointer transition-all
            ${isDragging
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
              : file
                ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                : 'border-dashed border-2 border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-white dark:hover:bg-slate-900'}`}
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

          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border
              ${file
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 group-hover:text-blue-600'}`}>
              {file ? <FileSpreadsheet className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </div>

            <div className="min-w-0">
              {file ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {file.name}
                    </span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    {preview && (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
                        {preview.recordCount.toLocaleString()} Records
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Web of Science Core Collection export · Click or drag another file to replace
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    Load Web of Science Export File (.xls, .xlsx, .tsv, .txt, .csv)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Auto-detects Clarivate BIFF8 (.xls), UTF-16LE Tab-delimited, and Full Record Excel exports
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {!file && (
              <div className="hidden xl:flex items-center gap-1 mr-1">
                {['.XLS', '.XLSX', '.TSV', '.CSV'].map((ext) => (
                  <span key={ext} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {ext}
                  </span>
                ))}
              </div>
            )}
            <span className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 group-hover:border-blue-500 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
              {file ? 'Replace File' : 'Browse File…'}
            </span>
          </div>
        </div>

        {/* Data Inspector Panel */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
          {/* Inspector Subheader */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer
                  ${activeTab === 'preview'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
              >
                <Table2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>{preview ? `Live DSpace Preview (${preview.previewCount} of ${preview.recordCount.toLocaleString()})` : 'Dublin Core Crosswalk Specification'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('columns')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer
                  ${activeTab === 'columns'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
              >
                <Columns3 className="h-3.5 w-3.5 text-slate-500" />
                <span>Source Columns ({detectedCols.length || WOS_COLUMNS_REFERENCE.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                ISSN ISO-3297
              </span>
              <span className="inline-flex items-center gap-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                UTF-8 BOM
              </span>
            </div>
          </div>

          {/* Loading State */}
          {isPreviewLoading && (
            <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Inspecting & mapping Web of Science records…</p>
            </div>
          )}

          {/* Error State */}
          {!isPreviewLoading && previewError && (
            <div className="p-6 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {/* Tab 1: Preview Table or Schema Specification Table */}
          {!isPreviewLoading && !previewError && activeTab === 'preview' && (
            <>
              {preview && preview.rows.length > 0 ? (
                <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200/70 dark:border-slate-700 w-10 text-center">
                          #
                        </th>
                        {preview.header.map((col, idx) => {
                          const displayCol = col === 'dc.identifier.wos' || col === 'dc.identifier.other' ? wosIdField : col;
                          return (
                            <th
                              key={idx}
                              className="py-2.5 px-3 font-mono text-[11px] font-semibold text-blue-900 dark:text-blue-300 border-r border-slate-200/70 dark:border-slate-700 whitespace-nowrap"
                            >
                              {displayCol}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-sans">
                      {preview.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-2 px-2.5 font-mono text-[11px] text-slate-400 border-r border-slate-200/60 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50">
                            {rIdx + 1}
                          </td>
                          {preview.header.map((col, cIdx) => {
                            let val = row[cIdx] ?? '';
                            if (col === 'collection') {
                              val = collectionHandle.trim() || '123456789/1';
                            }
                            const isMono = col === 'id' || col === 'collection' || col.startsWith('dc.identifier') || col === 'dc.date.issued' || col === 'dc.language.iso';
                            const isProvenance = col === 'dc.description.provenance';
                            return (
                              <td
                                key={cIdx}
                                title={val}
                                className={`py-2 px-3 border-r border-slate-100 dark:border-slate-800/70 max-w-[240px] truncate
                                  ${isMono ? 'font-mono text-[11px] text-slate-700 dark:text-slate-300' : 'text-slate-800 dark:text-slate-200'}`}
                              >
                                {isProvenance ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                                    {val}
                                  </span>
                                ) : val ? (
                                  val
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Specification Crosswalk Table when no file is uploaded yet */
                <div className="overflow-x-auto">
                  <div className="px-4 py-2.5 bg-blue-50/50 dark:bg-blue-950/20 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>Showing DSpace 5–8 Dublin Core Crosswalk Schema. Select a file above to inspect live converted records.</span>
                    <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300 font-medium">14 Target Fields</span>
                  </div>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3.5 font-mono text-[11px] font-semibold">Target DSpace Field</th>
                        <th className="py-2.5 px-3 font-mono text-[11px] font-semibold">WoS Tag</th>
                        <th className="py-2.5 px-3 font-semibold">Source Description</th>
                        <th className="py-2.5 px-3.5 font-semibold">Formatted Output Standard</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                      {DC_ELEMENTS.map(({ key, tag, label, sample }) => {
                        const displayKey = key === 'dc.identifier.wos' ? wosIdField : key;
                        return (
                          <tr key={key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-3.5 font-mono text-[11px] font-semibold text-blue-800 dark:text-blue-300 whitespace-nowrap">
                              {displayKey}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                {tag}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {label}
                            </td>
                            <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                              {sample}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Source Columns Inspector */}
          {!isPreviewLoading && activeTab === 'columns' && (
            <div className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {detectedCols.length > 0
                  ? `Detected ${detectedCols.length} columns in the uploaded Web of Science file (highlighted in green):`
                  : 'Standard Web of Science Core Collection columns recognized by the parser:'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {WOS_COLUMNS_REFERENCE.map((col) => {
                  const isPresent = detectedCols.some((d) => d.toLowerCase() === col.toLowerCase());
                  return (
                    <div
                      key={col}
                      className={`px-2.5 py-1.5 rounded-md border text-xs font-mono truncate flex items-center gap-1.5
                        ${isPresent
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isPresent ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="truncate">{col}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT WORKSTATION COLUMN: DSPACE INGESTION PARAMETERS & CLI (4 Cols) ── */}
      <div className="lg:col-span-4 flex flex-col gap-4">

        {/* Ingestion Configuration Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200/70 dark:divide-slate-800 shadow-2xs">
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Batch Export Configuration
              </h2>
            </div>
            <span className="font-mono text-[10px] text-slate-400">CSV / UTF-8</span>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Target Collection Handle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Target Collection Handle <span className="text-rose-500">*</span>
                </label>
                <span className="font-mono text-[10px] text-slate-400">collection</span>
              </div>
              <input
                type="text"
                value={collectionHandle}
                onChange={(e) => {
                  setCollectionHandle(e.target.value);
                  setHandleWarning(false);
                }}
                placeholder="e.g. 123456789/42"
                className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 transition-all
                  ${handleWarning
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:border-blue-600 focus:ring-blue-600/20'}`}
              />
              {handleWarning ? (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Enter a valid DSpace collection handle.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Mapped to the <code className="font-mono">collection</code> column for batch import.
                </p>
              )}
            </div>

            {/* Target Identifier Schema Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Accession Number Target Field
                </label>
                <span className="font-mono text-[10px] text-slate-400">UT Tag</span>
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-950 p-0.5 gap-0.5">
                {([
                  ['dc.identifier.wos', 'dc.identifier.wos'],
                  ['dc.identifier.other', 'dc.identifier.other'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setWosIdField(val)}
                    className={`rounded-md py-1.5 px-2 text-[11px] font-mono transition-all cursor-pointer truncate
                      ${wosIdField === val
                        ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-2xs border border-slate-200/80 dark:border-slate-700 font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Author Cap */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Max Authors per Record
                </label>
                <span className="font-mono text-[10px] text-slate-400">dc.contributor.author</span>
              </div>
              <div className="grid grid-cols-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-950 p-0.5 gap-0.5">
                {[5, 10, 20, 50, 0].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxAuthors(n)}
                    className={`rounded-md py-1.5 text-xs font-mono transition-all cursor-pointer
                      ${maxAuthors === n
                        ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-2xs border border-slate-200/80 dark:border-slate-700 font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                  >
                    {n === 0 ? 'All' : n}
                  </button>
                ))}
              </div>
            </div>

            {/* Provenance Indicator */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">dc.description.provenance</span>
              <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200/70 dark:border-blue-800">
                Web of Science
              </span>
            </div>

            {/* Primary Export Action Button */}
            <button
              type="button"
              onClick={handleConvert}
              disabled={!file || state.status === 'converting'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold text-xs py-3 px-4 shadow-xs transition-all cursor-pointer"
            >
              {state.status === 'converting' ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Generating DSpace CSV…</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Export DSpace Dublin Core CSV</span>
                </>
              )}
            </button>

            {/* Status Alerts */}
            {state.status === 'done' && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{state.message}</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Ready for DSpace Batch Metadata Import.
                  </p>
                </div>
              </div>
            )}

            {state.status === 'error' && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* DSpace CLI Helper Box */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Terminal className="h-3.5 w-3.5 text-blue-400" />
              <span>DSpace CLI Batch Import</span>
            </div>
            <button
              type="button"
              onClick={copyCli}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              {copiedCli ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedCli ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="font-mono text-[11px] text-blue-300 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800 overflow-x-auto">
            <code>{cliCommand}</code>
          </pre>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            Or upload via DSpace Web UI: <span className="text-slate-300 font-medium">Admin Sidebar → Import → Batch Metadata Import (CSV)</span>.
          </p>
        </div>

      </div>
    </div>
  );
}
