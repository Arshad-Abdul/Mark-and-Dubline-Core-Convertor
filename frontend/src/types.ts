export type MarcFormat = 'mrc' | 'mrk' | 'csv' | 'xlsx' | 'marcxml';

export interface FormatInfo {
  id: MarcFormat;
  label: string;
  extension: string;
  description: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'mrc', label: 'MARC Binary', extension: '.mrc', description: 'ISO 2709 binary MARC' },
  { id: 'mrk', label: 'MARC Mnemonic', extension: '.mrk', description: 'MarcEdit-style text' },
  { id: 'csv', label: 'CSV', extension: '.csv', description: 'Comma-separated values' },
  { id: 'xlsx', label: 'Excel', extension: '.xlsx', description: 'Excel workbook' },
  { id: 'marcxml', label: 'MARCXML', extension: '.xml', description: 'MARC XML schema' },
];

export interface HistoryEntry {
  id: string;
  filename: string;
  outputFilename: string;
  inputFormat: MarcFormat;
  outputFormat: MarcFormat;
  recordCount: number;
  warningsCount: number;
  timestamp: number;
}

export interface TagInfo {
  tag: string;
  count: number;
}

export interface PreviewResult {
  inputFormat: MarcFormat;
  recordCount: number;
  previewCount: number;
  tags: TagInfo[];
  header: string[];
  labelRow: string[] | null;
  rows: string[][];
  warnings: string[];
  warningsCount: number;
}

export interface ConvertOptions {
  includeLabels: boolean;
  includeTags?: string[];
}
