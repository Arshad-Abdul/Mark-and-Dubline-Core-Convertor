import { useEffect, useMemo, useState } from 'react';
import {
  Library,
  FileCode2,
  GraduationCap,
  Globe,
  Sun,
  Moon,
  Download,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import Dropzone from './components/Dropzone';
import FormatPicker from './components/FormatPicker';
import History from './components/History';
import TagFilter from './components/TagFilter';
import PreviewTable from './components/PreviewTable';
import WarningsPanel from './components/WarningsPanel';
import ScopusConverter from './components/ScopusConverter';
import WosConverter from './components/WosConverter';
import { convertFile, convertBatch, previewFile } from './api';
import type { HistoryEntry, MarcFormat, PreviewResult } from './types';

type AppMode = 'marc' | 'scopus' | 'wos';

const HISTORY_KEY = 'marc-convertor-history';
const THEME_KEY = 'marc-convertor-theme';
const SETTINGS_KEY = 'marc-convertor-settings';

function detectFormat(filename: string): MarcFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xls') return 'xlsx';
  if (ext === 'xml') return 'marcxml';
  if (ext === 'mrc' || ext === 'mrk' || ext === 'csv' || ext === 'xlsx') return ext;
  return null;
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

interface Settings {
  outputFormat: MarcFormat;
  includeLabels: boolean;
}

function loadSettings(): Settings {
  try {
    return { outputFormat: 'csv', includeLabels: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { outputFormat: 'csv', includeLabels: true };
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const [lastWarningsCount, setLastWarningsCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [mode, setMode] = useState<AppMode>('marc');
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem(THEME_KEY) === 'dark' ||
      (!localStorage.getItem(THEME_KEY) && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const inputFormat = useMemo(() => (files.length === 1 ? detectFormat(files[0].name) : null), [files]);

  useEffect(() => {
    if (files.length !== 1) {
      setPreview(null);
      setSelectedTags(new Set());
      return;
    }
    let cancelled = false;
    setIsPreviewLoading(true);
    setError(null);
    previewFile(files[0])
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setSelectedTags(new Set(result.tags.map((t) => t.tag)));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed.');
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [files]);

  const handleFilesSelected = (newFiles: File[]) => {
    setError(null);
    setSuccess(null);
    setFiles((prev) => {
      const merged = [...prev, ...newFiles];
      const seen = new Set<string>();
      return merged.filter((f) => {
        const key = `${f.name}-${f.size}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const setOutputFormat = (outputFormat: MarcFormat) => setSettings((s) => ({ ...s, outputFormat }));
  const setIncludeLabels = (includeLabels: boolean) => setSettings((s) => ({ ...s, includeLabels }));

  const handleConvert = async () => {
    if (files.length === 0) return;

    setIsConverting(true);
    setError(null);
    setSuccess(null);
    setLastWarnings([]);
    setLastWarningsCount(0);

    const includeTags = preview && selectedTags.size < preview.tags.length ? Array.from(selectedTags) : undefined;
    const options = { includeLabels: settings.includeLabels, includeTags };

    try {
      if (files.length === 1) {
        if (!inputFormat) {
          throw new Error('Could not detect the input format. Use a .mrc, .mrk, .csv, .xlsx or .xml file.');
        }
        const result = await convertFile(files[0], settings.outputFormat, options);
        downloadBlob(result.blob, result.filename);
        setSuccess(`Successfully converted ${result.recordCount} record${result.recordCount === 1 ? '' : 's'} → ${result.filename}`);
        setLastWarnings(result.warnings);
        setLastWarningsCount(result.warnings.length);
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            filename: files[0].name,
            outputFilename: result.filename,
            inputFormat,
            outputFormat: settings.outputFormat,
            recordCount: result.recordCount,
            warningsCount: result.warnings.length,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 20));
      } else {
        const result = await convertBatch(files, settings.outputFormat, options);
        downloadBlob(result.blob, 'converted-files.zip');
        setSuccess(`Successfully converted ${result.fileCount} files, ${result.recordCount.toLocaleString()} total records → converted-files.zip`);
        setLastWarningsCount(result.warningsCount);
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            filename: `${files.length} files`,
            outputFilename: 'converted-files.zip',
            inputFormat: 'mrc' as MarcFormat,
            outputFormat: settings.outputFormat,
            recordCount: result.recordCount,
            warningsCount: result.warningsCount,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 20));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">

        {/* Institutional App Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-blue-600 text-white shadow-xs shrink-0">
              <Library className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                  Metadata Ingestion Suite
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 px-2 py-0.5 text-[10px] font-mono font-medium text-blue-700 dark:text-blue-300">
                  DSpace 5–8 Ready
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Institutional Repository Interchange · Web of Science, Scopus &amp; MARC21
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/80 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Engine Active</span>
            </div>
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Mode Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5 mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-200/60 dark:bg-slate-900/80 p-1.5">
          {([
            ['marc',   FileCode2,     'MARC Conversion',          'MARC21'],
            ['scopus', GraduationCap, 'Scopus → Dublin Core',     'Scopus → DC'],
            ['wos',    Globe,         'Web of Science → Dublin Core', 'WoS → DC'],
          ] as const).map(([m, Icon, fullLabel, shortLabel]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs sm:text-sm font-medium transition-all text-center whitespace-nowrap cursor-pointer
                ${mode === m
                  ? 'bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-200 shadow-xs border border-slate-200/80 dark:border-slate-700 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/40'}`}
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="hidden md:inline">{fullLabel}</span>
              <span className="md:hidden">{shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Main Work Area Card */}
        <main className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-6 sm:p-7 shadow-xs">

          {/* ── Scopus mode ── */}
          {mode === 'scopus' && <ScopusConverter />}

          {/* ── Web of Science mode ── */}
          {mode === 'wos' && <WosConverter />}

          {/* ── MARC mode ── */}
          {mode === 'marc' && (
            <div className="flex flex-col gap-6">
              <Dropzone files={files} onFilesSelected={handleFilesSelected} onRemoveFile={handleRemoveFile} />

              {files.length === 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-800">
                  <span>Detected source format:</span>
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 uppercase">
                    {inputFormat || 'unknown'}
                  </span>
                </div>
              )}

              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5">
                  Target Export Format
                </h2>
                <FormatPicker value={settings.outputFormat} onChange={setOutputFormat} disabledFormat={inputFormat} />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.includeLabels}
                  onChange={(e) => setIncludeLabels(e.target.checked)}
                  className="accent-blue-600 rounded"
                />
                <span>Include human-readable field descriptors in CSV/Excel header (e.g. "245$a Title")</span>
              </label>

              {isPreviewLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <div className="h-3.5 w-3.5 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" />
                  <span>Generating schema inspection preview…</span>
                </div>
              )}

              {preview && !isPreviewLoading && (
                <div className="flex flex-col gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <TagFilter tags={preview.tags} selected={selectedTags} onChange={setSelectedTags} />
                  <PreviewTable
                    header={preview.header}
                    labelRow={preview.labelRow}
                    rows={preview.rows}
                    recordCount={preview.recordCount}
                    previewCount={preview.previewCount}
                  />
                  <WarningsPanel warnings={preview.warnings} totalCount={preview.warningsCount} />
                </div>
              )}

              {files.length > 1 && (
                <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
                  Batch mode active: {files.length} files selected. All detected MARC tags will be preserved; a conversion audit report will be bundled in the download zip.
                </p>
              )}

              {error && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs p-3.5 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs p-3.5 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{success}</span>
                </div>
              )}

              {!preview && <WarningsPanel warnings={lastWarnings} totalCount={lastWarningsCount} />}

              <button
                type="button"
                onClick={handleConvert}
                disabled={files.length === 0 || isConverting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium text-sm py-3.5 px-4 shadow-sm transition-all cursor-pointer"
              >
                {isConverting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Conversion…</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>{files.length > 1 ? `Convert ${files.length} Files & Download Archive` : 'Convert & Download'}</span>
                  </>
                )}
              </button>
            </div>
          )}

        </main>

        {mode === 'marc' && <History entries={history} onClear={() => setHistory([])} />}
      </div>
    </div>
  );
}
