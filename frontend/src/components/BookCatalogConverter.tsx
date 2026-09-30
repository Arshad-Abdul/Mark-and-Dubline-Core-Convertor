import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Download,
  Table2,
  Columns3,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Edit3,
} from 'lucide-react';

interface ConvertState {
  status: 'idle' | 'converting' | 'done' | 'error';
  message: string;
  recordCount: number;
}

interface PreviewData {
  recordCount: number;
  detectedColumns: string[];
  columnLabels?: Record<string, string>;
  effectiveMapping: Record<string, string | null>;
  header: string[];
  targetColumns?: string[];
  hasMultipleSubjects?: boolean;
  rows: string[][];
  previewCount: number;
}

export const TARGET_COLUMNS = [
  { key: 'title',       label: 'Book title',                 note: 'Book title',                     sample: 'Clean Code: A Handbook of Agile Software Craftsmanship' },
  { key: 'author',      label: 'Author name(s)',             note: 'Author name(s)',                 sample: 'Martin, Robert C.' },
  { key: 'isbn',        label: 'ISBN',                       note: 'ISBN-10 or ISBN-13',             sample: '978-0132350884' },
  { key: 'publisher',   label: 'Publisher',                  note: 'Publisher name',                 sample: 'Oxford University Press' },
  { key: 'year',        label: 'Publication year',           note: 'Publication year (YYYY)',        sample: '2022' },
  { key: 'subject',     label: 'Subject',                    note: 'Primary subject (one per col)',  sample: 'Nigeria -- History' },
  { key: 'description', label: 'Description or abstract',    note: 'Book description or abstract',   sample: 'The Oxford Handbook of Nigerian History provides...' },
  { key: 'coverUrl',    label: 'Cover image URL',            note: 'https:// URL to cover image',    sample: 'https://images.example.com/books/cover.jpg' },
  { key: 'category',    label: 'Category or genre',          note: 'Category or genre',              sample: 'History / African Studies' },
  { key: 'pages',       label: 'Number of pages',            note: 'Number of pages',                sample: '779' },
  { key: 'url',         label: 'Link to book / e-book',      note: 'Link to book / e-book',          sample: 'http://dx.doi.org/10.1093/oxfordhb/...' },
  { key: 'price',       label: 'Price in local currency',    note: 'Price in local currency',        sample: '$49.99' },
] as const;

export default function BookCatalogConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'columns'>('preview');

  // Split multiple subjects into individual columns (subject, subject_2, subject_3...)
  const [splitSubjects, setSplitSubjects] = useState<boolean>(true);
  // Format ISBN with hyphens (e.g. 978-xxx) so Microsoft Excel won't display it as 9.78E+12
  const [excelSafeIsbn, setExcelSafeIsbn] = useState<boolean>(false);

  // Mapping state: targetCol -> sourceCol | ''
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // Custom static defaults: targetCol -> string (fallback if source is empty)
  const [customDefaults, setCustomDefaults] = useState<Record<string, string>>({});
  // Custom manual overrides: targetCol -> string (overrides all records)
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  // Field input mode: 'column' (from source column) or 'manual' (explicit manual value)
  const [fieldModes, setFieldModes] = useState<Record<string, 'column' | 'manual'>>({});

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [state, setState] = useState<ConvertState>({
    status: 'idle', message: '', recordCount: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamically compute active target columns (including separate subject_2, subject_3...)
  const activeTargetColumns = useMemo(() => {
    if (!preview?.targetColumns || preview.targetColumns.length === 0) {
      return TARGET_COLUMNS.map((c) => ({ ...c, isDynamicSubject: false }));
    }
    return preview.targetColumns.map((colKey) => {
      const standard = TARGET_COLUMNS.find((c) => c.key === colKey);
      if (standard) return { ...standard, isDynamicSubject: false };
      if (colKey.startsWith('subject_')) {
        const num = colKey.replace('subject_', '');
        return {
          key: colKey,
          label: `Subject ${num}`,
          note: `Secondary subject (#${num}) in separate column`,
          sample: num === '2' ? 'Nigeria -- Civilization' : 'Additional Subject',
          isDynamicSubject: true,
        };
      }
      return {
        key: colKey,
        label: colKey,
        note: colKey,
        sample: '',
        isDynamicSubject: false,
      };
    });
  }, [preview?.targetColumns]);

  // Fetch initial auto-detected preview when a new file is uploaded
  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPreviewError(null);
      setMapping({});
      setCustomDefaults({});
      setCustomOverrides({});
      setFieldModes({});
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('splitSubjects', String(splitSubjects));
    form.append('excelSafeIsbn', String(excelSafeIsbn));
    fetch('/api/book-catalog/preview', { method: 'POST', body: form })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 502) {
            throw new Error('Backend server is temporarily unreachable or restarting (502 Bad Gateway). Please make sure the backend is running on port 4000 and try again.');
          }
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Preview failed (${res.status})`);
        }
        return res.json() as Promise<PreviewData>;
      })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        const init: Record<string, string> = {};
        const colsToInit = data.targetColumns && data.targetColumns.length > 0
          ? data.targetColumns
          : TARGET_COLUMNS.map((c) => c.key);
        for (const colKey of colsToInit) {
          init[colKey] = data.effectiveMapping[colKey] || '';
        }
        setMapping(init);
        setCustomDefaults({});
        setCustomOverrides({});
        setFieldModes({});
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
  }, [file]);

  const fetchOverridePreview = useCallback((
    currentMapping: Record<string, string>,
    currentDefaults: Record<string, string>,
    currentOverrides: Record<string, string>,
    currentSplitSubjects: boolean = splitSubjects,
    currentExcelSafeIsbn: boolean = excelSafeIsbn,
  ) => {
    if (!file) return;
    setIsPreviewLoading(true);
    setPreviewError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('splitSubjects', String(currentSplitSubjects));
    form.append('excelSafeIsbn', String(currentExcelSafeIsbn));
    if (Object.keys(currentMapping).length > 0) {
      form.append('mapping', JSON.stringify(currentMapping));
    }
    if (Object.keys(currentDefaults).length > 0) {
      form.append('customDefaults', JSON.stringify(currentDefaults));
    }
    if (Object.keys(currentOverrides).length > 0) {
      form.append('customOverrides', JSON.stringify(currentOverrides));
    }

    fetch('/api/book-catalog/preview', { method: 'POST', body: form })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 502) {
            throw new Error('Backend server is temporarily unreachable or restarting (502 Bad Gateway). Please make sure the backend is running on port 4000 and try again.');
          }
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Preview failed (${res.status})`);
        }
        return res.json() as Promise<PreviewData>;
      })
      .then((data) => {
        setPreview(data);
      })
      .catch((err) => {
        setPreviewError(err instanceof Error ? err.message : 'Unable to update preview.');
      })
      .finally(() => {
        setIsPreviewLoading(false);
      });
  }, [file, splitSubjects, excelSafeIsbn]);

  const handleToggleSplitSubjects = (val: boolean) => {
    setSplitSubjects(val);
    fetchOverridePreview(mapping, customDefaults, customOverrides, val, excelSafeIsbn);
  };

  const handleToggleExcelSafeIsbn = (val: boolean) => {
    setExcelSafeIsbn(val);
    fetchOverridePreview(mapping, customDefaults, customOverrides, splitSubjects, val);
  };

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setState({ status: 'idle', message: '', recordCount: 0 });
    }
  }, []);

  const handleMappingChange = (targetKey: string, sourceCol: string) => {
    const nextMapping = { ...mapping, [targetKey]: sourceCol };
    setMapping(nextMapping);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchOverridePreview(nextMapping, customDefaults, customOverrides);
    }, 200);
  };

  const handleDefaultChange = (targetKey: string, val: string) => {
    const nextDefaults = { ...customDefaults, [targetKey]: val };
    setCustomDefaults(nextDefaults);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchOverridePreview(mapping, nextDefaults, customOverrides);
    }, 250);
  };

  const handleOverrideChange = (targetKey: string, val: string) => {
    const nextOverrides = { ...customOverrides, [targetKey]: val };
    setCustomOverrides(nextOverrides);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchOverridePreview(mapping, customDefaults, nextOverrides);
    }, 250);
  };

  const toggleFieldMode = (targetKey: string, mode: 'column' | 'manual') => {
    setFieldModes((prev) => ({ ...prev, [targetKey]: mode }));
    if (mode === 'manual' && customOverrides[targetKey]) {
      fetchOverridePreview(mapping, customDefaults, customOverrides);
    } else if (mode === 'column') {
      const nextOverrides = { ...customOverrides };
      delete nextOverrides[targetKey];
      setCustomOverrides(nextOverrides);
      fetchOverridePreview(mapping, customDefaults, nextOverrides);
    }
  };

  const resetToAuto = () => {
    if (!preview) return;
    const init: Record<string, string> = {};
    const colsToInit = preview.targetColumns && preview.targetColumns.length > 0
      ? preview.targetColumns
      : TARGET_COLUMNS.map((c) => c.key);
    for (const colKey of colsToInit) {
      init[colKey] = preview.effectiveMapping[colKey] || '';
    }
    setMapping(init);
    setCustomDefaults({});
    setCustomOverrides({});
    setFieldModes({});
    fetchOverridePreview(init, {}, {}, splitSubjects, excelSafeIsbn);
  };

  const handleConvert = async () => {
    if (!file) return;
    setState({ status: 'converting', message: '', recordCount: 0 });

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('splitSubjects', String(splitSubjects));
      form.append('excelSafeIsbn', String(excelSafeIsbn));
      if (Object.keys(mapping).length > 0) {
        form.append('mapping', JSON.stringify(mapping));
      }
      if (Object.keys(customDefaults).length > 0) {
        form.append('customDefaults', JSON.stringify(customDefaults));
      }
      if (Object.keys(customOverrides).length > 0) {
        form.append('customOverrides', JSON.stringify(customOverrides));
      }

      const res = await fetch('/api/book-catalog/convert', { method: 'POST', body: form });

      if (!res.ok) {
        if (res.status === 502) {
          throw new Error('Backend server is temporarily unreachable or restarting (502 Bad Gateway). Please make sure the backend is running on port 4000 and try again.');
        }
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Conversion failed (${res.status})`);
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] || `${file.name.replace(/\.[^.]+$/, '')}_standard_books.csv`;
      const recordCount = Number(res.headers.get('X-Record-Count') || '0');

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
        message: `Successfully exported ${recordCount.toLocaleString()} records → ${filename}`,
        recordCount,
      });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Conversion failed.',
        recordCount: 0,
      });
    }
  };

  const detectedCols = preview?.detectedColumns || [];
  const mappedCount = activeTargetColumns.filter((c) => {
    if (fieldModes[c.key] === 'manual') {
      return Boolean(customOverrides[c.key]);
    }
    return Boolean(mapping[c.key] || customDefaults[c.key]);
  }).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ── LEFT WORKSTATION COLUMN: INGESTION BAR & DATA INSPECTOR (8 Cols) ── */}
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
            accept=".csv,.tsv,.txt,.xlsx,.xls,.mrc,.mrk,.xml,.marcxml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                setState({ status: 'idle', message: '', recordCount: 0 });
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
                    Source file loaded · Click or drag another file to replace
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    Load Any Catalog File: MARC21 (.mrc), MarcEdit (.mrk), Excel, or CSV
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Smart auto-maps any .mrc, .mrk, .xml, .xlsx, .xls, or .csv file into the standard 12-column Book Catalog format
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {!file && (
              <div className="hidden xl:flex items-center gap-1 mr-1">
                {['.MRC', '.MRK', '.CSV', '.XLSX', '.XLS', '.TSV', '.XML'].map((ext) => (
                  <span key={ext} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
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
          {/* Inspector Header */}
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
                <span>
                  {preview
                    ? `Live Output Table (${preview.previewCount} of ${preview.recordCount.toLocaleString()})`
                    : 'Standard Book Catalog Specification (12 Columns)'}
                </span>
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
                <span>Source Columns ({detectedCols.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              {file && (
                <>
                  <label
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-medium cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    title="Separate multiple subjects into distinct columns (subject, subject_2, etc.)"
                  >
                    <input
                      type="checkbox"
                      checked={splitSubjects}
                      onChange={(e) => handleToggleSplitSubjects(e.target.checked)}
                      className="rounded border-blue-400 text-blue-600 focus:ring-blue-500 h-3 w-3"
                    />
                    <span>1 Subject / Col</span>
                  </label>

                  <label
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    title="Prefixes 13-digit ISBNs as 978-xxx so Microsoft Excel will treat them as text instead of scientific notation (9.78E+12)"
                  >
                    <input
                      type="checkbox"
                      checked={excelSafeIsbn}
                      onChange={(e) => handleToggleExcelSafeIsbn(e.target.checked)}
                      className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 h-3 w-3"
                    />
                    <span>Excel-Safe ISBN</span>
                  </label>
                </>
              )}
              <span
                className="inline-flex items-center gap-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                title="Automatically restores real ISBN from DOI or links if corrupted by Excel (9.78E+12)"
              >
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                ISBN Protected
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
              <p className="text-xs font-medium">Extracting records & compiling live preview…</p>
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
                <div className="overflow-x-auto max-h-[490px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200/70 dark:border-slate-700 w-10 text-center">
                          #
                        </th>
                        {preview.header.map((col, idx) => (
                          <th
                            key={idx}
                            className="py-2.5 px-3 font-mono text-[11px] font-semibold text-blue-900 dark:text-blue-300 border-r border-slate-200/70 dark:border-slate-700 whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
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
                            const val = row[cIdx] ?? '';
                            const isMono = col === 'isbn' || col === 'year' || col === 'pages' || col === 'price';
                            return (
                              <td
                                key={cIdx}
                                title={val}
                                className={`py-2 px-3 border-r border-slate-100 dark:border-slate-800/70 max-w-[220px] truncate
                                  ${isMono ? 'font-mono text-[11px] text-slate-700 dark:text-slate-300' : 'text-slate-800 dark:text-slate-200'}`}
                              >
                                {val ? val : <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Specification Table when no file is uploaded yet */
                <div className="overflow-x-auto">
                  <div className="px-4 py-2.5 bg-blue-50/50 dark:bg-blue-950/20 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>Target CSV Schema Specification. Upload any file above to preview auto-mapped records.</span>
                    <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300 font-medium">12 Target Columns</span>
                  </div>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3.5 font-mono text-[11px] font-semibold">Column</th>
                        <th className="py-2.5 px-3 font-semibold">Description</th>
                        <th className="py-2.5 px-3.5 font-semibold">Notes / Sample Output</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                      {TARGET_COLUMNS.map(({ key, label, note, sample }) => (
                        <tr key={key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3.5 font-mono text-[11px] font-semibold text-blue-800 dark:text-blue-300 whitespace-nowrap">
                            {key}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium">
                            {label}
                          </td>
                          <td className="py-2 px-3.5 text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                            <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">{sample}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">({note})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Detected Columns */}
          {!isPreviewLoading && activeTab === 'columns' && (
            <div className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {detectedCols.length > 0
                  ? `Detected ${detectedCols.length} columns in the uploaded file:`
                  : 'Upload a file to inspect its source columns.'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {detectedCols.map((col) => {
                  const mappedTo = Object.entries(mapping).find(([_, src]) => src === col)?.[0];
                  return (
                    <div
                      key={col}
                      className={`px-2.5 py-1.5 rounded-md border text-xs font-mono truncate flex items-center justify-between gap-1.5
                        ${mappedTo
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}
                      title={preview?.columnLabels?.[col] || col}
                    >
                      <span className="truncate">{preview?.columnLabels?.[col] || col}</span>
                      {mappedTo && (
                        <span className="text-[10px] px-1 rounded bg-emerald-200/60 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-mono shrink-0 ml-1">
                          → {mappedTo}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT WORKSTATION COLUMN: COLUMN MAPPING & MANUAL EDIT STUDIO (4 Cols) ── */}
      <div className="lg:col-span-4 flex flex-col gap-4">

        {/* Column Mapping Studio Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200/70 dark:divide-slate-800 shadow-2xs">
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Field Mapping &amp; Manual Edit
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {mappedCount} / {activeTargetColumns.length} Configured
              </span>
              {file && (
                <button
                  type="button"
                  onClick={resetToAuto}
                  title="Reset to auto-detected mappings"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {preview?.hasMultipleSubjects && (
            <div className="px-3.5 py-2 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-200/60 dark:border-blue-800 flex items-center justify-between gap-2 text-xs">
              <span className="text-blue-900 dark:text-blue-200 font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                Separate Subject Columns
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-blue-800 dark:text-blue-300">
                <input
                  type="checkbox"
                  checked={splitSubjects}
                  onChange={(e) => handleToggleSplitSubjects(e.target.checked)}
                  className="rounded border-blue-400 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span>{splitSubjects ? '1 subject per column' : 'Combined in 1 column'}</span>
              </label>
            </div>
          )}

          <div className="p-3.5 flex flex-col gap-3 max-h-[520px] overflow-y-auto">
            {activeTargetColumns.map(({ key, label, isDynamicSubject }) => {
              const currentSrc = mapping[key] || '';
              const isAutoMatched = preview?.effectiveMapping[key] === currentSrc && currentSrc !== '';
              const currentDefault = customDefaults[key] || '';
              const currentOverride = customOverrides[key] || '';
              const mode = fieldModes[key] || (currentOverride ? 'manual' : 'column');

              return (
                <div key={key} className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-semibold text-blue-900 dark:text-blue-300">
                        {key}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        ({label})
                      </span>
                      {isDynamicSubject && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono">
                          distinct col
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {isAutoMatched && mode === 'column' && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-200/60 shrink-0">
                          <Sparkles className="h-2.5 w-2.5" />
                          auto
                        </span>
                      )}

                      {/* Mode Toggle: Column vs Manual Value */}
                      <div className="flex rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => toggleFieldMode(key, 'column')}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                            mode === 'column'
                              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-semibold shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          Col
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFieldMode(key, 'manual')}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-all flex items-center gap-0.5 ${
                            mode === 'manual'
                              ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          Manual
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Mode 1: From File Column */}
                  {mode === 'column' ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={currentSrc}
                        onChange={(e) => handleMappingChange(key, e.target.value)}
                        disabled={detectedCols.length === 0}
                        className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 truncate"
                      >
                        <option value="">(None / Blank)</option>
                        {detectedCols.map((col) => (
                          <option key={col} value={col}>
                            {preview?.columnLabels?.[col] || col}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        placeholder="Fallback if empty"
                        value={currentDefault}
                        onChange={(e) => handleDefaultChange(key, e.target.value)}
                        title={`Optional fallback value if source ${key} is empty`}
                        className="w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono truncate"
                      />
                    </div>
                  ) : (
                    /* Mode 2: Manual Fixed Override */
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder={`Manual ${label} for all records (e.g. ${
                          key === 'publisher'
                            ? 'Oxford University Press'
                            : key === 'price'
                            ? '$49.99'
                            : key === 'category'
                            ? 'History'
                            : key === 'coverUrl'
                            ? 'https://example.com/cover.jpg'
                            : 'custom value'
                        })`}
                        value={currentOverride}
                        onChange={(e) => handleOverrideChange(key, e.target.value)}
                        className="flex-1 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                      {currentOverride && (
                        <button
                          type="button"
                          onClick={() => handleOverrideChange(key, '')}
                          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1 cursor-pointer"
                          title="Clear manual value"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleConvert}
              disabled={!file || state.status === 'converting'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold text-xs py-3 px-4 shadow-xs transition-all cursor-pointer"
            >
              {state.status === 'converting' ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Transforming & Exporting…</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Export Standard Book CSV</span>
                </>
              )}
            </button>

            {/* Status alerts */}
            {state.status === 'done' && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="font-semibold">{state.message}</p>
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

      </div>
    </div>
  );
}
