import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

// 14 Dublin Core elements supported by DSpace's default metadata registry.
// dc.coverage is omitted — it is part of the DC spec but is NOT registered
// in DSpace by default and causes MetadataImportInvalidHeadingException.
export const DC_ELEMENTS = [
  'dc.title',
  'dc.creator',
  'dc.subject',
  'dc.description',
  'dc.publisher',
  'dc.contributor',
  'dc.date',
  'dc.type',
  'dc.format',
  'dc.identifier',
  'dc.source',
  'dc.language',
  'dc.relation',
  'dc.rights',
];

const DC_LABELS = {
  'dc.title':       'Title of the resource',
  'dc.creator':     'Primary author(s)',
  'dc.subject':     'Keywords / subject terms',
  'dc.description': 'Abstract or summary',
  'dc.publisher':   'Publisher name',
  'dc.contributor': 'Editor(s) / secondary contributors',
  'dc.date':        'Publication year / date',
  'dc.type':        'Document / resource type',
  'dc.format':      'Media / format type',
  'dc.identifier':  'DOI, ISSN, ISBN or other identifier',
  'dc.source':      'Journal / source with volume & pages',
  'dc.language':    'Language of the document',
  'dc.relation':    'Related resources / references',
  'dc.coverage':    'Conference / temporal / spatial coverage',
  'dc.rights':      'License / open access status',
};

const LABEL_ROW_MARKER = '↳ field name (for reference only)';

// Build a case-insensitive column-name → value lookup once per row.
function buildLookup(row) {
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    map.set(k.trim().toLowerCase(), v == null ? '' : String(v).trim());
  }
  return (names) => {
    for (const name of names) {
      const val = map.get(name.toLowerCase());
      if (val) return val;
    }
    return '';
  };
}

// Join non-empty parts with a separator, skipping duplicates.
function join(parts, sep = ' | ') {
  const seen = new Set();
  return parts
    .map((p) => (p || '').trim())
    .filter((p) => { if (!p || seen.has(p)) return false; seen.add(p); return true; })
    .join(sep);
}

function buildIdentifier(get) {
  const doi = get(['DOI']);
  const eid = get(['EID']);
  const pubmed = get(['PubMed ID', 'PubmedID', 'PMID']);
  const issn = get(['ISSN']);
  const isbn = get(['ISBN']);
  const link = get(['Link']);
  return join([
    doi    ? `https://doi.org/${doi}` : '',
    eid    ? `eid:${eid}` : '',
    pubmed ? `pmid:${pubmed}` : '',
    issn   ? `issn:${issn}` : '',
    isbn   ? `isbn:${isbn}` : '',
    link,
  ]);
}

function buildSource(get) {
  const journal  = get(['Source title', 'Journal', 'Publication Name']);
  const volume   = get(['Volume']);
  const issue    = get(['Issue']);
  const start    = get(['Page start']);
  const end      = get(['Page end']);
  const artNo    = get(['Art. No.', 'Article Number']);
  const abbrev   = get(['Abbreviated Source Title', 'Abbreviated source title']);
  if (!journal) return abbrev;
  let source = journal;
  if (abbrev && abbrev !== journal) source += ` (${abbrev})`;
  if (volume) source += `, vol. ${volume}`;
  if (issue)  source += `, no. ${issue}`;
  if (start && end)   source += `, pp. ${start}–${end}`;
  else if (start)     source += `, p. ${start}`;
  else if (artNo)     source += `, art. ${artNo}`;
  return source;
}

function buildCreator(get, maxAuthors = 0) {
  // "Author full names" comes as "Surname, Given (ScopusID); ..." — strip the IDs.
  // Fall back to "Authors" (abbreviated form) if full names not present.
  const raw = get(['Author full names']) || get(['Authors']);
  if (!raw) return '';

  const all = raw
    .split(';')
    .map((name) => name.trim().replace(/\s*\(\d+\)\s*$/, '').trim())
    .filter(Boolean);

  if (maxAuthors > 0 && all.length > maxAuthors) {
    return all.slice(0, maxAuthors).join('; ') + `; et al. (${all.length} authors total)`;
  }
  return all.join('; ');
}

function buildSubject(get) {
  return join([
    get(['Author Keywords', 'Author keywords']),
    get(['Index Keywords', 'Indexed keywords', 'Index keywords']),
  ], '; ');
}

function buildContributor(get) {
  return join([
    get(['Editors', 'Editor(s)', 'Editor']),
    get(['Correspondence Address', 'Correspondence address']),
  ]);
}


function buildRelation(get) {
  return join([
    get(['References']),
    get(['Molecular Sequence Numbers', 'Molecular sequence numbers']),
    get(['Chemicals/CAS', 'Chemicals']),
  ]);
}

function buildDescription(get) {
  const abstract = get(['Abstract']);
  const conference = join([
    get(['Conference name', 'Conference Name']),
    get(['Conference date', 'Conference Date']),
    get(['Conference location', 'Conference Location']),
  ], '; ');
  const funding = join([
    get(['Funding Details', 'Funding details']),
    get(['Funding Texts', 'Funding texts', 'Funding text']),
  ]);
  const parts = [];
  if (abstract)   parts.push(abstract);
  if (conference) parts.push(`Conference: ${conference}`);
  if (funding)    parts.push(`Funding: ${funding}`);
  return parts.join('\n\n');
}

function mapRowToDC(row, { maxAuthors = 0 } = {}) {
  const get = buildLookup(row);
  return {
    'dc.title':       get(['Title', 'Document title', 'Document Title']),
    'dc.creator':     buildCreator(get, maxAuthors),
    'dc.subject':     buildSubject(get),
    'dc.description': buildDescription(get),
    'dc.publisher':   get(['Publisher']),
    'dc.contributor': buildContributor(get),
    'dc.date':        get(['Year', 'Publication Year']),
    'dc.type':        get(['Document Type', 'Document type']),
    'dc.format':      get(['Medium']) || 'text',
    'dc.identifier':  buildIdentifier(get),
    'dc.source':      buildSource(get),
    'dc.language':    get(['Language of Original Document', 'Language of original document', 'Language']),
    'dc.relation':    buildRelation(get),
    'dc.rights':      get(['Open Access', 'Open access', 'License', 'Rights']),
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

  // DSpace CSV format requires `id` (+ for new items) and `collection`
  // (the handle of the destination collection) as the first two columns.
  const DSPACE_COLS = ['id', 'collection', ...DC_ELEMENTS];

  const dcRows = records.map((row) => {
    const mapped = mapRowToDC(row, { maxAuthors });
    return ['+', collectionHandle, ...DC_ELEMENTS.map((el) => mapped[el] || '')];
  });

  // No BOM — DSpace metadata-import rejects files with a BOM.
  // CRLF line endings keep Excel happy on Windows without the import wizard.
  const csv = stringifyCsv([DSPACE_COLS, ...dcRows], { record_delimiter: '\r\n' });

  return {
    csv,
    recordCount: records.length,
    detectedColumns: Object.keys(records[0]),
  };
}
