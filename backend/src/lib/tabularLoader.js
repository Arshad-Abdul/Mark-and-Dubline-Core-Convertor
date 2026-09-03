import ExcelJS from 'exceljs';
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

  // 1. Try Excel parsing if extension is .xlsx or .xls
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        throw new Error('Excel workbook has no sheets.');
      }

      const rows = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        // row.values is 1-indexed in ExcelJS; slice(1) aligns with columns
        const vals = row.values.slice(1).map((v) => {
          if (v == null) return '';
          if (typeof v === 'object') {
            if (v.text != null) return String(v.text).trim();
            if (v.result != null) return String(v.result).trim();
            return JSON.stringify(v);
          }
          return String(v).trim();
        });
        rows.push(vals);
      });

      if (rows.length > 0) {
        const headers = rows[0].map((h) => String(h || '').trim());
        const records = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row.some((cell) => cell && cell.length > 0)) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            if (h) obj[h] = row[idx] !== undefined ? row[idx] : '';
          });
          records.push(obj);
        }
        if (records.length > 0) {
          return records;
        }
      }
    } catch (excelErr) {
      // If loading as binary xlsx failed (e.g. file is actually a tab-delimited text file named .xls),
      // fall through to text parsing below.
      console.warn(`ExcelJS load attempt failed (${excelErr.message}), falling back to text parsing.`);
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

  const records = parseCsv(text, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    relax_quotes: true,
  });

  return records;
}

