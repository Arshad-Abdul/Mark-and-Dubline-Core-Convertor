import { parseMarcBinary, writeMarcBinary } from './marcBinary.js';
import { parseMarcMnemonic, writeMarcMnemonic } from './marcMnemonic.js';
import { parseMarcXml, writeMarcXml } from './marcXml.js';
import { recordsToGrid, gridToRecords, gridToCsv, csvToGrid, gridToXlsx, xlsxToGrid } from './tabular.js';
import { validateRecords } from './validate.js';

export const SUPPORTED_FORMATS = ['mrc', 'mrk', 'csv', 'xlsx', 'marcxml'];

export async function parseInput(buffer, format) {
  switch (format) {
    case 'mrc':
      return parseMarcBinary(buffer);
    case 'mrk':
      return parseMarcMnemonic(buffer.toString('utf-8'));
    case 'marcxml':
      return parseMarcXml(buffer.toString('utf-8'));
    case 'csv':
      return gridToRecords(csvToGrid(buffer.toString('utf-8')));
    case 'xlsx':
      return gridToRecords(await xlsxToGrid(buffer));
    default:
      throw new Error(`Unsupported input format: ${format}`);
  }
}

export async function writeOutput(records, format, options = {}) {
  switch (format) {
    case 'mrc':
      return writeMarcBinary(records);
    case 'mrk':
      return Buffer.from(writeMarcMnemonic(records), 'utf-8');
    case 'marcxml':
      return Buffer.from(writeMarcXml(records), 'utf-8');
    case 'csv':
      return Buffer.from(gridToCsv(recordsToGrid(records, options)), 'utf-8');
    case 'xlsx':
      return Buffer.from(await gridToXlsx(recordsToGrid(records, options)));
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }
}

const EXTENSION_TO_FORMAT = { xls: 'xlsx', xml: 'marcxml' };

export function detectFormatFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (EXTENSION_TO_FORMAT[ext]) return EXTENSION_TO_FORMAT[ext];
  if (SUPPORTED_FORMATS.includes(ext)) return ext;
  return null;
}

export function listTags(records) {
  const tags = new Map(); // tag -> count

  for (const record of records) {
    for (const field of record.fields) {
      tags.set(field.tag, (tags.get(field.tag) || 0) + 1);
    }
  }

  return [...tags.entries()]
    .sort((a, b) => {
      const na = parseInt(a[0], 10);
      const nb = parseInt(b[0], 10);
      return (Number.isNaN(na) ? 999 : na) - (Number.isNaN(nb) ? 999 : nb);
    })
    .map(([tag, count]) => ({ tag, count }));
}

// Keeps only the given tags on every record (LDR/leader is always kept).
// `includeTags` of null/undefined means "keep everything".
export function filterFields(records, includeTags) {
  if (!includeTags || includeTags.length === 0) return records;
  const allowed = new Set(includeTags);
  return records.map((record) => ({
    ...record,
    fields: record.fields.filter((field) => allowed.has(field.tag)),
  }));
}

export async function convert(buffer, inputFormat, outputFormat, options = {}) {
  let records = await parseInput(buffer, inputFormat);
  const warnings = validateRecords(records);
  records = filterFields(records, options.includeTags);
  const output = await writeOutput(records, outputFormat, options);
  return { output, recordCount: records.length, warnings };
}
