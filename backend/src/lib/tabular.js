import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { isControlTag } from './fieldFormat.js';
import { getFieldLabel, getSubfieldLabel } from './marcDictionary.js';

const VALUE_SEPARATOR = ' | ';

// Marks the optional label row so it can be reliably skipped when reading a
// grid back in, instead of being mistaken for a data row.
const LABEL_ROW_MARKER = '↳ field name (for reference only)';

function tagSortKey(tag) {
  if (tag === 'LDR') return -1;
  const n = parseInt(tag, 10);
  return Number.isNaN(n) ? 999 : n;
}

function columnKey(tag, code) {
  return code ? `${tag}$${code}` : tag;
}

function columnLabel(tag, code) {
  return (code ? getSubfieldLabel(tag, code) : getFieldLabel(tag)) || '';
}

const HEADER_PREFIX_RE = /^(LDR|[0-9A-Za-z]{3})(?:\$([0-9A-Za-z]))?/;

function parseColumnHeader(header) {
  const match = String(header).match(HEADER_PREFIX_RE);
  if (!match) return { tag: header, code: null };
  const [, tag, code] = match;
  return { tag, code: code || null };
}

// Converts canonical records into a { header, labelRow, rows } grid, one row
// per record. Columns are one per control tag (LDR, 001-009), and one per
// (tag, subfield code) for data fields, sorted in MARC tag order. Cell values
// are plain text - no indicator placeholders or subfield-delimiter symbols
// leak into the data. `header` always stays a plain tag/code (e.g. "245$a")
// so it round-trips cleanly; `labelRow` is an optional second header row with
// human-readable field names (e.g. "Title") for display only.
export function recordsToGrid(records, { includeLabels = true } = {}) {
  const columns = new Map(); // key -> { tag, code }

  for (const record of records) {
    if (!columns.has('LDR')) columns.set('LDR', { tag: 'LDR', code: null });
    for (const field of record.fields) {
      if (isControlTag(field.tag)) {
        const key = columnKey(field.tag, null);
        if (!columns.has(key)) columns.set(key, { tag: field.tag, code: null });
      } else {
        for (const sf of field.subfields || []) {
          const key = columnKey(field.tag, sf.code);
          if (!columns.has(key)) columns.set(key, { tag: field.tag, code: sf.code });
        }
      }
    }
  }

  const orderedKeys = [...columns.keys()].sort((a, b) => {
    const colA = columns.get(a);
    const colB = columns.get(b);
    const tagDiff = tagSortKey(colA.tag) - tagSortKey(colB.tag);
    if (tagDiff !== 0) return tagDiff;
    return (colA.code || '').localeCompare(colB.code || '');
  });

  const rows = records.map((record) => {
    const values = new Map(); // key -> string[]

    const push = (key, value) => {
      if (!values.has(key)) values.set(key, []);
      values.get(key).push(value);
    };

    push('LDR', record.leader || '');
    for (const field of record.fields) {
      if (isControlTag(field.tag)) {
        push(columnKey(field.tag, null), field.value ?? '');
      } else {
        for (const sf of field.subfields || []) {
          push(columnKey(field.tag, sf.code), sf.value);
        }
      }
    }

    return orderedKeys.map((key) => (values.get(key) || []).join(VALUE_SEPARATOR));
  });

  const header = [...orderedKeys];
  const labelRow = includeLabels
    ? orderedKeys.map((key, i) => {
        if (i === 0) return LABEL_ROW_MARKER;
        const { tag, code } = columns.get(key);
        return columnLabel(tag, code);
      })
    : null;

  return { header, labelRow, rows };
}

// Converts a { header, rows } grid back into canonical records. Since
// subfields are flattened into separate columns, repeated subfields/fields are
// reconstructed positionally from the `|`-joined values; indicators are not
// recoverable from tabular data and default to blank.
export function gridToRecords({ header, rows }) {
  const columns = header.map((key) => parseColumnHeader(key));

  return rows.map((row) => {
    const record = { leader: '', fields: [] };
    const byTag = new Map(); // tag -> { code -> string[] }

    columns.forEach((col, colIndex) => {
      const cell = row[colIndex];
      if (cell === undefined || cell === null || cell === '') return;
      const values = String(cell).split(VALUE_SEPARATOR);

      if (col.tag === 'LDR') {
        record.leader = values[0] || '';
        return;
      }
      if (!byTag.has(col.tag)) byTag.set(col.tag, new Map());
      byTag.get(col.tag).set(col.code, values);
    });

    const tags = [...byTag.keys()].sort((a, b) => tagSortKey(a) - tagSortKey(b));
    for (const tag of tags) {
      const codeMap = byTag.get(tag);
      if (isControlTag(tag)) {
        for (const value of codeMap.get(null) || []) {
          record.fields.push({ tag, value });
        }
        continue;
      }

      const occurrenceCount = Math.max(...[...codeMap.values()].map((v) => v.length));
      for (let i = 0; i < occurrenceCount; i++) {
        const subfields = [];
        for (const [code, values] of codeMap.entries()) {
          if (values[i] !== undefined) subfields.push({ code, value: values[i] });
        }
        if (subfields.length > 0) {
          record.fields.push({ tag, ind1: ' ', ind2: ' ', subfields });
        }
      }
    }

    return record;
  });
}

function stripLabelRow(rows) {
  if (rows.length > 0 && rows[0][0] === LABEL_ROW_MARKER) {
    return rows.slice(1);
  }
  return rows;
}

export function gridToCsv({ header, labelRow, rows }) {
  const allRows = [header, ...(labelRow ? [labelRow] : []), ...rows];
  // UTF-8 BOM + CRLF so Excel on Windows opens UTF-8 characters cleanly on double-click.
  return '\uFEFF' + stringifyCsv(allRows, { record_delimiter: '\r\n' });
}

export function csvToGrid(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows = parseCsv(clean, { relax_column_count: true });
  const [header, ...rest] = rows;
  return { header: header || [], rows: stripLabelRow(rest) };
}

export async function gridToXlsx({ header, labelRow, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MARC Records');
  sheet.addRow(header);
  if (labelRow) sheet.addRow(labelRow);
  for (const row of rows) sheet.addRow(row);

  sheet.getRow(1).font = { bold: true };
  if (labelRow) {
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };
  }
  sheet.views = [{ state: 'frozen', ySplit: labelRow ? 2 : 1 }];

  sheet.columns.forEach((col) => {
    col.width = 24;
    col.alignment = { wrapText: true, vertical: 'top' };
    // Force text format so tag-like values (e.g. "001", "020") keep
    // leading zeros instead of being reinterpreted as numbers by Excel.
    col.numFmt = '@';
  });
  return workbook.xlsx.writeBuffer();
}

export async function xlsxToGrid(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows = [];
  sheet.eachRow((row) => {
    rows.push(row.values.slice(1).map((v) => (v == null ? '' : String(v))));
  });
  const [header, ...rest] = rows;
  return { header: header || [], rows: stripLabelRow(rest) };
}
