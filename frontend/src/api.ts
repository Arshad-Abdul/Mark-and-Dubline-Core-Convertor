import type { ConvertOptions, MarcFormat, PreviewResult } from './types';

export interface ConvertResult {
  blob: Blob;
  filename: string;
  recordCount: number;
  warnings: string[];
}

export interface BatchResult {
  blob: Blob;
  fileCount: number;
  recordCount: number;
  warningsCount: number;
}

function appendOptions(form: FormData, options?: ConvertOptions) {
  if (!options) return;
  form.append('includeLabels', String(options.includeLabels));
  if (options.includeTags && options.includeTags.length > 0) {
    form.append('includeTags', options.includeTags.join(','));
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const message = await res.json().catch(() => null);
  return message?.error || `${fallback} (${res.status})`;
}

export async function convertFile(file: File, outputFormat: MarcFormat, options?: ConvertOptions): Promise<ConvertResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('outputFormat', outputFormat);
  appendOptions(form, options);

  const res = await fetch('/api/convert', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Conversion failed'));

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  const filename = match?.[1] || `converted.${outputFormat}`;
  const recordCount = Number(res.headers.get('X-Record-Count') || '0');
  const warningsHeader = res.headers.get('X-Warnings');
  const warnings: string[] = warningsHeader ? JSON.parse(decodeURIComponent(warningsHeader)) : [];
  const blob = await res.blob();

  return { blob, filename, recordCount, warnings };
}

export async function convertBatch(files: File[], outputFormat: MarcFormat, options?: ConvertOptions): Promise<BatchResult> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  form.append('outputFormat', outputFormat);
  appendOptions(form, options);

  const res = await fetch('/api/convert/batch', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Batch conversion failed'));

  const fileCount = Number(res.headers.get('X-File-Count') || '0');
  const recordCount = Number(res.headers.get('X-Record-Count') || '0');
  const warningsCount = Number(res.headers.get('X-Warnings-Count') || '0');
  const blob = await res.blob();

  return { blob, fileCount, recordCount, warningsCount };
}

export async function previewFile(file: File): Promise<PreviewResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/preview', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Preview failed'));

  return res.json();
}
