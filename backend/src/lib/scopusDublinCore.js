import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

// Exact DC fields registered in this DSpace instance — verified against the
// metadata registry. Order matches the required DSpace CSV column layout.
export const DC_ELEMENTS = [
  'dc.title',
  'dc.contributor.author',
  'dc.subject',
  'dc.description.abstract',
  'dc.publisher',
  'dc.date.issued',
  'dc.type',
  'dc.identifier.doi',
  'dc.identifier.scopus',
  'dc.identifier.issn',
  'dc.source',
  'dc.language.iso',
  'dc.rights',
];

// Language name → ISO 639-1 code (covers most Scopus language values).
const LANGUAGE_ISO = {
  'english': 'en', 'french': 'fr', 'german': 'de', 'spanish': 'es',
  'portuguese': 'pt', 'italian': 'it', 'dutch': 'nl', 'russian': 'ru',
  'chinese': 'zh', 'japanese': 'ja', 'korean': 'ko', 'arabic': 'ar',
  'hindi': 'hi', 'turkish': 'tr', 'polish': 'pl', 'swedish': 'sv',
  'danish': 'da', 'norwegian': 'no', 'finnish': 'fi', 'czech': 'cs',
  'hungarian': 'hu', 'greek': 'el', 'romanian': 'ro', 'ukrainian': 'uk',
  'hebrew': 'he', 'indonesian': 'id', 'malay': 'ms', 'thai': 'th',
  'vietnamese': 'vi', 'persian': 'fa', 'bengali': 'bn',
};

function toIso(language) {
  if (!language) return '';
  // Already a short code like "en"
  if (/^[a-z]{2,3}$/.test(language.trim().toLowerCase())) return language.trim().toLowerCase();
  return LANGUAGE_ISO[language.trim().toLowerCase()] || language.trim();
}

// Case-insensitive column lookup for a row.
function buildLookup(row) {
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    map.set(k.trim().toLowerCase(), v == null ? '' : String(v).trim());
  }
  return (...names) => {
    for (const name of names) {
      const val = map.get(name.toLowerCase());
      if (val) return val;
    }
    return '';
  };
}

// DSpace uses || as the multi-value delimiter — ; is treated as literal text.
function multiJoin(values) {
  return values
    .flatMap((v) => (v || '').split(';').map((s) => s.trim()))
    .filter(Boolean)
    .join('||');
}

function buildAuthors(get, maxAuthors) {
  const raw = get('Author full names', 'Authors');
  const editorRaw = get('Editors', 'Editor(s)', 'Editor');

  if (!raw && !editorRaw) return '';

  // No authors — fall back to editors marked with (Ed.)
  if (!raw && editorRaw) {
    return editorRaw
      .split(';')
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => `${e} (Ed.)`)
      .join('||');
  }

  const all = raw
    .split(';')
    .map((name) => name.trim().replace(/\s*\(\d+\)\s*$/, '').trim())
    .filter(Boolean);
  const list = maxAuthors > 0 && all.length > maxAuthors ? all.slice(0, maxAuthors) : all;
  return list.join('||');
}

function buildSubject(get) {
  const authorKw = get('Author Keywords', 'Author keywords');
  const indexKw  = get('Index Keywords', 'Indexed keywords');
  return multiJoin([authorKw, indexKw]);
}

function buildSource(get) {
  const journal = get('Source title');
  if (!journal) return '';
  const volume = get('Volume');
  const issue  = get('Issue');
  const start  = get('Page start');
  const end    = get('Page end');
  const artNo  = get('Art. No.', 'Article Number');
  let src = journal;
  if (volume) src += `, vol. ${volume}`;
  if (issue)  src += `, no. ${issue}`;
  if (start && end) src += `, pp. ${start}–${end}`;
  else if (start)   src += `, p. ${start}`;
  else if (artNo)   src += `, art. ${artNo}`;
  return src;
}

function buildDescription(get) {
  const abstract  = get('Abstract');
  const conference = [
    get('Conference name', 'Conference Name'),
    get('Conference date', 'Conference Date'),
    get('Conference location', 'Conference Location'),
  ].filter(Boolean).join('; ');
  const funding = [
    get('Funding Details', 'Funding details'),
    get('Funding Texts', 'Funding texts', 'Funding text'),
  ].filter(Boolean).join(' ');
  const parts = [];
  if (abstract)   parts.push(abstract);
  if (conference) parts.push(`Conference: ${conference}`);
  if (funding)    parts.push(`Funding: ${funding}`);
  return parts.join('\n\n');
}

function mapRowToDC(row, { maxAuthors = 0 } = {}) {
  const get = buildLookup(row);
  return {
    'dc.title':               get('Title', 'Document title', 'Document Title'),
    'dc.contributor.author':  buildAuthors(get, maxAuthors),
    'dc.subject':             buildSubject(get),
    'dc.description.abstract': buildDescription(get),
    'dc.publisher':           get('Publisher'),
    'dc.date.issued':         get('Year', 'Publication Year'),
    'dc.type':                get('Document Type', 'Document type'),
    'dc.identifier.doi':      get('DOI'),
    'dc.identifier.scopus':   get('EID'),
    'dc.identifier.issn':     get('ISSN'),
    'dc.source':              buildSource(get),
    'dc.language.iso':        toIso(get('Language of Original Document', 'Language')),
    'dc.rights':              get('Open Access', 'Open access'),
  };
}

export function scopusCsvToDublinCoreCsv(buffer, { maxAuthors = 0, collectionHandle = '' } = {}) {
  const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (records.length === 0) throw new Error('No records found in the Scopus CSV.');

  // DSpace CSV: id and collection must be the first two columns.
  const HEADER = ['id', 'collection', ...DC_ELEMENTS];

  const rows = records.map((row) => {
    const mapped = mapRowToDC(row, { maxAuthors });
    return ['+', collectionHandle, ...DC_ELEMENTS.map((el) => mapped[el] || '')];
  });

  // No BOM. CRLF for Excel compatibility on Windows.
  const csv = stringifyCsv([HEADER, ...rows], { record_delimiter: '\r\n' });

  return {
    csv,
    recordCount: records.length,
    detectedColumns: Object.keys(records[0]),
  };
}
