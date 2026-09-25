import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { loadTabularRecords } from './tabularLoader.js';

// Order matches the required DSpace CSV column layout.
export const DEFAULT_DC_ELEMENTS = [
  'dc.title',
  'dc.contributor.author',
  'dc.subject',
  'dc.description.abstract',
  'dc.publisher',
  'dc.date.issued',
  'dc.type',
  'dc.identifier.doi',
  'dc.identifier.wos',
  'dc.identifier.issn',
  'dc.source',
  'dc.language.iso',
  'dc.rights',
  'dc.description.provenance',
];

// Language name → ISO 639-1 code
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
  const clean = language.trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(clean)) return clean;
  return LANGUAGE_ISO[clean] || language.trim();
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
  // WoS headers: "Author Full Names", "Authors", "AF", "AU"
  const raw = get('Author Full Names', 'Authors', 'AF', 'AU');
  // Editors: "Book Editors", "Editors", "ED"
  const editorRaw = get('Book Editors', 'Editors', 'ED');

  if (!raw && !editorRaw) return '';

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
  // WoS Author Keywords (DE) + Keywords Plus (ID) + Categories (WC)
  const authorKw = get('Author Keywords', 'DE');
  const plusKw = get('Keywords Plus', 'ID', 'Keywords');
  return multiJoin([authorKw, plusKw]);
}

function formatIssn(value) {
  if (!value) return '';
  const parts = String(value)
    .split(/[;,|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts
    .map((part) => {
      if (/^[0-9A-Za-z]{4}-[0-9A-Za-z]{4}$/.test(part)) {
        return part.toUpperCase();
      }
      const clean = part.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (clean.length >= 5 && clean.length <= 8) {
        const padded = clean.padStart(8, '0');
        return `${padded.slice(0, 4)}-${padded.slice(4)}`;
      }
      return part;
    })
    .join('||');
}

function buildSource(get) {
  const journal = get('Source Title', 'Source', 'SO');
  if (!journal) return '';

  const volume = get('Volume', 'VL');
  const issue = get('Issue', 'IS');
  const start = get('Beginning Page', 'Page start', 'BP', 'Start Page');
  const end = get('Ending Page', 'Page end', 'EP', 'End Page');
  const artNo = get('Article Number', 'Art. No.', 'AR');

  let src = journal;
  if (volume) src += `, vol. ${volume}`;
  if (issue) src += `, no. ${issue}`;
  if (start && end) src += `, pp. ${start}-${end}`;
  else if (start) src += `, p. ${start}`;
  else if (artNo) src += `, art. ${artNo}`;

  return src;
}

function buildDescription(get) {
  const abstract = get('Abstract', 'AB');
  const conference = [
    get('Conference Title', 'Conference name', 'CT'),
    get('Conference Date', 'CD'),
    get('Conference Location', 'CL'),
    get('Conference Sponsor', 'HO'),
  ].filter(Boolean).join('; ');

  const funding = [
    get('Funding Orgs', 'FU'),
    get('Funding Text', 'FX'),
  ].filter(Boolean).join(' ');

  const parts = [];
  if (abstract) parts.push(abstract);
  if (conference) parts.push(`Conference: ${conference}`);
  if (funding) parts.push(`Funding: ${funding}`);

  // DSpace Java CSV parser does not support multiline cells — join with pipe
  return parts.join(' | ');
}

function buildYear(get) {
  const year = get('Publication Year', 'Year', 'PY');
  if (year) return year;
  const dateStr = get('Publication Date', 'PD', 'Early Access Date', 'EA');
  if (dateStr) {
    const m = dateStr.match(/\b(19\d\d|20\d\d)\b/);
    if (m) return m[1];
  }
  return '';
}

function buildDoi(get) {
  const rawDoi = get('DOI', 'DI', 'DOI Link');
  if (!rawDoi) return '';
  return rawDoi.replace(/^https?:\/\/doi\.org\//i, '').trim();
}

function mapRowToDC(row, { maxAuthors = 0, wosIdField = 'dc.identifier.wos' } = {}) {
  const get = buildLookup(row);
  const wosId = get('UT (Unique WOS ID)', 'Accession Number', 'UT');

  const mapped = {
    'dc.title': get('Article Title', 'Title', 'TI', 'Document Title'),
    'dc.contributor.author': buildAuthors(get, maxAuthors),
    'dc.subject': buildSubject(get),
    'dc.description.abstract': buildDescription(get),
    'dc.publisher': get('Publisher', 'PU'),
    'dc.date.issued': buildYear(get),
    'dc.type': get('Document Type', 'DT'),
    'dc.identifier.doi': buildDoi(get),
    'dc.identifier.issn': formatIssn(get('ISSN', 'SN', 'eISSN', 'EI')),
    'dc.source': buildSource(get),
    'dc.language.iso': toIso(get('Language', 'LA')),
    'dc.rights': get('Open Access Designations', 'Open Access', 'OA'),
    'dc.description.provenance': 'Web of Science',
  };

  // Map the WoS unique identifier to the chosen field (dc.identifier.wos or dc.identifier.other)
  mapped[wosIdField] = wosId;

  return mapped;
}

/**
 * Converts Web of Science tabular data (Buffer from CSV, TSV, TXT, XLSX, XLS)
 * into a DSpace metadata-import Dublin Core CSV string.
 *
 * @param {Buffer} buffer
 * @param {object} options
 * @param {string} [options.filename='']
 * @param {number} [options.maxAuthors=0]
 * @param {string} [options.collectionHandle='']
 * @param {string} [options.wosIdField='dc.identifier.wos']
 * @returns {Promise<{ csv: string, recordCount: number, detectedColumns: string[] }>}
 */
export async function wosToDublinCoreCsv(buffer, {
  filename = '',
  maxAuthors = 0,
  collectionHandle = '',
  wosIdField = 'dc.identifier.wos',
} = {}) {
  const records = await loadTabularRecords(buffer, filename);

  if (!records || records.length === 0) {
    throw new Error('No records found in the uploaded Web of Science file.');
  }

  // Customize DC elements if user selected dc.identifier.other instead of dc.identifier.wos
  const dcElements = DEFAULT_DC_ELEMENTS.map((el) => (el === 'dc.identifier.wos' ? wosIdField : el));

  // DSpace CSV requirement: id and collection must be first two columns
  const HEADER = ['id', 'collection', ...dcElements];

  const rows = records.map((row) => {
    const mapped = mapRowToDC(row, { maxAuthors, wosIdField });
    // DSpace's MetadataImport CSV parser does not support multi-line quoted cells.
    // Strip all newlines from every field value so each record stays on one CSV line.
    return [
      '+',
      collectionHandle,
      ...dcElements.map((el) => (mapped[el] || '').replace(/\r?\n/g, ' ')),
    ];
  });

  // Windows CRLF for Excel compatibility
  const csv = stringifyCsv([HEADER, ...rows], { record_delimiter: '\r\n' });

  return {
    csv,
    recordCount: records.length,
    detectedColumns: Object.keys(records[0] || {}),
  };
}

