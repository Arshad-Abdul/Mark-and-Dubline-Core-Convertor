import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';

/**
 * Loads tabular data from a Buffer (CSV, TSV, TXT, XLSX, XLS)
 * into an array of plain JavaScript objects: [ { [columnHeader]: value } ]
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} [filename=''] - Original filename to help detect extension
 * @returns {Promise<Array<Record<string, string>>>}
 */
export async function loadTabularRecords(buffer, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  // 1. Try Excel parsing if extension is .xlsx, .xls, .xlsb, or .xlsm
  // Check magic bytes:
  // - OpenXML (.xlsx): 50 4B 03 04 (PK..)
  // - Compound Document / BIFF8 (.xls): D0 CF 11 E0 (magic ole header)
  const isExcelExt = ['xlsx', 'xls', 'xlsb', 'xlsm'].includes(ext);
  const isExcelMagic = buffer.length >= 4 && (
    (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) ||
    (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
  );

  if (isExcelExt || isExcelMagic) {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = wb.SheetNames[0];
      if (firstSheetName) {
        const sheet = wb.Sheets[firstSheetName];
        // raw: false converts numbers and dates into formatted strings
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        if (rows && rows.length > 0) {
          return rows;
        }
      }
    } catch (excelErr) {
      // If loading as binary/xml Excel failed, fall through to text parsing below
      console.warn(`Excel load attempt failed (${excelErr.message}), falling back to text parsing.`);
    }
  }

  // 2. Text parsing (CSV, TSV, TXT, or text-fallback)
  let text = '';
  // Check for UTF-16LE BOM (0xFF, 0xFE) frequently produced by Web of Science exports
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    text = buffer.toString('utf16le');
  } else {
    text = buffer.toString('utf-8');
  }

  // Strip leading UTF-8 BOM if present
  text = text.replace(/^\uFEFF/, '');

  // Detect delimiter from the first non-empty line
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ',';
  if (ext === 'tsv' || ext === 'tab' || (tabCount > commaCount && tabCount > semicolonCount)) {
    delimiter = '\t';
  } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  }

  const isTabDelimited = delimiter === '\t';

  try {
    return parseCsv(text, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: false, // trim: true causes CSV_INVALID_CLOSING_QUOTE on unescaped quotes
      quote: isTabDelimited ? null : '"',
    });
  } catch (parseErr) {
    // If quote parsing failed, fallback to literal parsing with quote: null
    console.warn(`Initial CSV parse failed (${parseErr.message}), retrying with quote: null fallback.`);
    return parseCsv(text, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      quote: null,
    });
  }
}
