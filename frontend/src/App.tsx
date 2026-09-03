import { useEffect, useMemo, useState } from 'react';
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
        setSuccess(`Converted ${result.recordCount} record${result.recordCount === 1 ? '' : 's'} → ${result.filename}`);
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
        setSuccess(`Converted ${result.fileCount} files, ${result.recordCount} total records → converted-files.zip`);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">MARC Convertor</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Convert between .mrc, .mrk, CSV, Excel and MARCXML · Scopus &amp; WoS → Dublin Core</p>
          </div>
          <button
            onClick={() => setIsDark((d) => !d)}
            className="rounded-full border border-slate-200 dark:border-slate-700 w-10 h-10 flex items-center justify-center hover:border-violet-400 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? '🌙' : '☀️'}
          </button>
        </header>

        {/* Mode tabs */}
        <div className="grid grid-cols-3 gap-1.5 mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 p-1.5">
          {([
            ['marc',   '📄', 'MARC Conversion', 'MARC'],
            ['scopus', '🔬', 'Scopus → Dublin Core', 'Scopus → DC'],
            ['wos',    '🌐', 'Web of Science → Dublin Core', 'WoS → DC'],
          ] as const).map(([m, icon, fullLabel, shortLabel]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2.5 px-2 text-xs sm:text-sm font-medium transition-colors text-center whitespace-nowrap
                ${mode === m
                  ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <span className="text-base shrink-0">{icon}</span>
              <span className="hidden sm:inline">{fullLabel}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          ))}
        </div>

        <main className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-6 shadow-sm">

          {/* ── Scopus mode ── */}
          {mode === 'scopus' && <ScopusConverter />}

          {/* ── Web of Science mode ── */}
          {mode === 'wos' && <WosConverter />}

          {/* ── MARC mode ── */}
          {mode === 'marc' && (
            <>
              <Dropzone files={files} onFilesSelected={handleFilesSelected} onRemoveFile={handleRemoveFile} />

              {files.length === 1 && (
                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Detected input format:{' '}
                  <span className="font-semibold text-violet-600 dark:text-violet-400">
                    {inputFormat ? inputFormat.toUpperCase() : 'unknown'}
                  </span>
                </div>
              )}

              <div className="mt-6">
                <h2 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">Convert to</h2>
                <FormatPicker value={settings.outputFormat} onChange={setOutputFormat} disabledFormat={inputFormat} />
              </div>

              <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.includeLabels}
                  onChange={(e) => setIncludeLabels(e.target.checked)}
                  className="accent-violet-600"
                />
                Include readable field names in CSV/Excel headers (e.g. "245$a Title")
              </label>

              {isPreviewLoading && (
                <p className="mt-4 text-sm text-slate-400 animate-pulse">Loading preview…</p>
              )}

              {preview && !isPreviewLoading && (
                <div className="mt-6 flex flex-col gap-5">
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
                <p className="mt-4 text-xs text-slate-400">
                  Preview and field filtering are available when converting one file at a time. With multiple files, all
                  detected fields will be included; a conversion report is bundled in the downloaded zip.
                </p>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm px-4 py-2.5">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm px-4 py-2.5">
                  {success}
                </div>
              )}
              {!preview && <WarningsPanel warnings={lastWarnings} totalCount={lastWarningsCount} />}

              <button
                onClick={handleConvert}
                disabled={files.length === 0 || isConverting}
                className="mt-6 w-full rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
              >
                {isConverting ? 'Converting…' : files.length > 1 ? `Convert ${files.length} Files & Download Zip` : 'Convert & Download'}
              </button>
            </>
          )}

        </main>

        {mode === 'marc' && <History entries={history} onClear={() => setHistory([])} />}
      </div>
    </div>
  );
}
