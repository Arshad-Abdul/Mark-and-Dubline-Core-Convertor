import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { loadTabularRecords } from './tabularLoader.js';
import { parseMarcBinary } from './marcBinary.js';
import { parseMarcMnemonic } from './marcMnemonic.js';
import { parseMarcXml } from './marcXml.js';
import { recordsToGrid } from './tabular.js';
import { getFieldLabel, getSubfieldLabel } from './marcDictionary.js';

export const BOOK_CATALOG_COLUMNS = [
  'title',
  'author',
  'isbn',
  'publisher',
  'year',
  'subject',
  'description',
  'coverUrl',
  'category',
  'pages',
  'url',
  'price',
];

export const COLUMN_DEFINITIONS = {
  title:       { label: 'Book Title',               description: 'Book title',                     required: true },
  author:      { label: 'Author(s)',                description: 'Author name(s)',                 required: false },
  isbn:        { label: 'ISBN',                     description: 'ISBN-10 or ISBN-13',             required: false },
  publisher:   { label: 'Publisher',                description: 'Publisher name',                 required: false },
  year:        { label: 'Publication Year',         description: 'Publication year (YYYY)',        required: false },
  subject:     { label: 'Subject 1 (Primary)',      description: 'e.g. Computer Science, Physics', required: false },
  subject_2:   { label: 'Subject 2',                description: 'Secondary subject',              required: false },
  subject_3:   { label: 'Subject 3',                description: 'Tertiary subject',               required: false },
  subject_4:   { label: 'Subject 4',                description: 'Additional subject',              required: false },
  subject_5:   { label: 'Subject 5',                description: 'Additional subject',              required: false },
  description: { label: 'Description / Abstract',   description: 'Book description or abstract',   required: false },
  coverUrl:    { label: 'Cover Image URL',          description: 'https:// URL to cover image',    required: false },
  category:    { label: 'Category / Genre',         description: 'Category or genre',              required: false },
  pages:       { label: 'Page Count',               description: 'Number of pages',                required: false },
  url:         { label: 'Resource / Book URL',      description: 'Link to book / e-book',          required: false },
  price:       { label: 'Price',                    description: 'Price in local currency',        required: false },
};

// Prioritized aliases for auto-detection across CSV, Excel, and MARC (.mrc, .mrk, .xml)
const FIELD_ALIASES = {
  title: [
    '245$a+$b', '245$a', '245', 'title', 'book title', 'book_title', 'item title',
    'item_title', 'publication title', 'article title', 'document title', 'work title',
    'name', 'book name', 'ti', 'work', '246$a', '130$a', '240$a',
  ],
  author: [
    'MARC_AUTHORS', '100$a+700$a', '100$a', '700$a', '110$a', '710$a', 'author', 'authors',
    'author(s)', 'creator', 'creators', 'writer', 'writers', 'written by', 'book author',
    'book authors', 'author full names', 'author_name', 'author name', 'au', 'contributor',
    'contributors', 'primary author', '245$c',
  ],
  isbn: [
    'MARC_ISBN', '020$a', '020', 'isbn', 'isbn-13', 'isbn13', 'isbn-10', 'isbn10',
    'isbn/issn', 'international standard book number', 'standard number', 'book isbn',
    'identifier', '776$z', 'e-isbn', 'eisbn', 'isbn number', '022$a',
  ],
  publisher: [
    'MARC_PUBLISHER', '264$b', '260$b', '264', '260', 'publisher', 'publisher name',
    'publishing house', 'press', 'imprint', 'publication house', 'pub', 'pu',
    'published by', 'distributor',
  ],
  year: [
    'MARC_YEAR', '264$c', '260$c', 'year', 'publication year', 'pub year', 'pub_year',
    'published year', 'date', 'publication date', 'pub date', 'issued', 'date issued',
    'py', 'copyright year', 'release year', 'pubdate', 'year published', '008_year',
  ],
  subject: [
    'MARC_SUBJECT_1', 'subject_1', 'subject 1', '650$a', '651$a', '653$a', '600$a', '610$a',
    'subject', 'subjects', 'topic', 'topics', 'keywords', 'keyword', 'tags', 'tag',
    'disciplines', 'discipline', 'subject heading', 'subject headings', 'mesh', 'fast', 'MARC_SUBJECTS',
  ],
  subject_2: [
    'MARC_SUBJECT_2', 'subject_2', 'subject 2', 'topic_2', 'keyword_2',
  ],
  subject_3: [
    'MARC_SUBJECT_3', 'subject_3', 'subject 3', 'topic_3', 'keyword_3',
  ],
  subject_4: [
    'MARC_SUBJECT_4', 'subject_4', 'subject 4', 'topic_4', 'keyword_4',
  ],
  subject_5: [
    'MARC_SUBJECT_5', 'subject_5', 'subject 5', 'topic_5', 'keyword_5',
  ],
  description: [
    'MARC_DESCRIPTION', '520$a', '520', 'description', 'book description', 'abstract',
    'summary', 'synopsis', '505$t', '505$a', '500$a', 'overview', 'about', 'notes',
    'annotation', 'blurb', 'ab', 'details', 'comment',
  ],
  coverUrl: [
    'coverurl', 'cover_url', 'cover url', 'cover', 'cover image', 'coverimage',
    'cover_image', 'cover image url', 'image url', 'image', 'image_url', 'thumbnail',
    'thumbnail url', 'book cover', 'poster', 'cover_image_url', 'img_url', 'img',
  ],
  category: [
    'MARC_CATEGORY', '490$a', '830$a', '655$a', '082$a', '050$a', '084$a', '080$a',
    'category', 'categories', 'genre', 'genres', 'classification', 'class', 'section',
    'collection', 'department', 'shelfmark', 'document type', 'type', 'format',
    'call number',
  ],
  pages: [
    'MARC_PAGES', '300$a', '300', 'pages', 'page count', 'pagecount', 'number of pages',
    'num pages', 'no of pages', 'pagination', 'extent', 'length', 'total pages',
    'pgs', 'page',
  ],
  url: [
    '856$u', '856', 'url', 'link', 'book url', 'book link', 'ebook url', 'e-book url',
    'web link', 'website', 'uri', 'permalink', 'view url', 'download url', 'doi link',
    'link to book', 'product url', 'source url', 'online link', 'doi',
  ],
  price: [
    'MARC_PRICE', '020$c', '365$b', 'price', 'cost', 'amount', 'list price',
    'retail price', 'mrp', 'rate', 'fee', 'charge', 'selling price', 'book price',
  ],
};

function normalizeHeader(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips relator terms and cataloging punctuation from author names
 * e.g. "Falola, Toyin, editor." -> "Falola, Toyin"
 */
function cleanAuthorName(str) {
  if (!str) return '';
  return String(str)
    .replace(/,\s*(?:editor|author|ill|compiler|ed|tr|adapter|trans)\.?$/i, '')
    .replace(/\s*[,/]\s*$/, '')
    .trim();
}

/**
 * Loads catalog records from any file: MARC (.mrc, .mrk, .xml), CSV, TSV, TXT, Excel (.xlsx, .xls)
 * @param {Buffer} buffer
 * @param {string} [filename='']
 * @returns {Promise<{ records: Array<Record<string, string>>, detectedColumns: string[], columnLabels: Record<string, string>, hasMultipleSubjects: boolean }>}
 */
export async function loadCatalogRecords(buffer, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  let marcRecords = null;

  // 1. Check if MRC (binary MARC21)
  const isMrcExt = ext === 'mrc';
  const isMrcSignature = buffer.length >= 25 && /^\d{5}/.test(buffer.slice(0, 5).toString('binary'));
  if (isMrcExt || isMrcSignature) {
    try {
      const parsed = parseMarcBinary(buffer);
      if (parsed && parsed.length > 0) marcRecords = parsed;
    } catch (e) {
      console.warn('parseMarcBinary failed, falling back:', e.message);
    }
  }

  // 2. Check if MRK (MarcEdit / Mnemonic text)
  if (!marcRecords) {
    const isMrkExt = ext === 'mrk';
    const textSample = buffer.slice(0, 2000).toString('utf-8');
    const isMrkSignature = /^=(LDR|\d{3})\s/m.test(textSample);
    if (isMrkExt || isMrkSignature) {
      try {
        const parsed = parseMarcMnemonic(buffer.toString('utf-8'));
        if (parsed && parsed.length > 0) marcRecords = parsed;
      } catch (e) {
        console.warn('parseMarcMnemonic failed, falling back:', e.message);
      }
    }
  }

  // 3. Check if XML / MARCXML
  if (!marcRecords) {
    const isXmlExt = ext === 'xml' || ext === 'marcxml';
    const textSample = buffer.slice(0, 2000).toString('utf-8');
    const isXmlMarc = textSample.includes('<record') || textSample.includes('<collection');
    if (isXmlExt && isXmlMarc) {
      try {
        const parsed = parseMarcXml(buffer.toString('utf-8'));
        if (parsed && parsed.length > 0) marcRecords = parsed;
      } catch (e) {
        console.warn('parseMarcXml failed, falling back:', e.message);
      }
    }
  }

  let hasMultipleSubjects = false;

  // If MARC records detected:
  if (marcRecords && marcRecords.length > 0) {
    const grid = recordsToGrid(marcRecords, { includeLabels: false });
    const columnLabels = {};

    for (const key of grid.header) {
      const [tag, code] = key.split('$');
      const subLabel = code ? getSubfieldLabel(tag, code) : getFieldLabel(tag);
      columnLabels[key] = subLabel ? `${key} · ${subLabel}` : key;
    }

    let maxSubjectsInAnyRecord = 1;

    const rows = grid.rows.map((row, recordIdx) => {
      const obj = {};
      grid.header.forEach((key, i) => {
        obj[key] = row[i] || '';
      });

      // 1. Title
      const tA = (obj['245$a'] || '').replace(/\s*[:/=;,]\s*$/, '').trim();
      const tB = (obj['245$b'] || '').replace(/\s*[:/=;,]\s*$/, '').trim();
      obj['245$a+$b'] = tA && tB ? `${tA}: ${tB}` : (tA || tB || obj['246$a'] || obj['130$a'] || '');

      // 2. Authors (Combine 100$a, 700$a, 110$a, or 245$c)
      const authorsList = [];
      if (obj['100$a']) {
        authorsList.push(...obj['100$a'].split(' | ').map(cleanAuthorName));
      }
      if (obj['700$a']) {
        authorsList.push(...obj['700$a'].split(' | ').map(cleanAuthorName));
      }
      if (authorsList.length === 0 && obj['110$a']) {
        authorsList.push(...obj['110$a'].split(' | ').map(cleanAuthorName));
      }
      if (authorsList.length === 0 && obj['245$c']) {
        const rawC = obj['245$c'].replace(/^(?:edited by|by|written by|compiled by)\s+/i, '').replace(/\.$/, '').trim();
        if (rawC) authorsList.push(rawC);
      }
      obj['MARC_AUTHORS'] = [...new Set(authorsList.filter(Boolean))].join('; ');

      // 3. ISBN
      obj['MARC_ISBN'] = obj['020$a'] || obj['776$z'] || obj['022$a'] || '';

      // 4. Publisher
      const pub = obj['264$b'] || obj['260$b'] || '';
      obj['MARC_PUBLISHER'] = pub.replace(/\s*[,/;:.]\s*$/, '').trim();

      // 5. Year
      let yr = obj['264$c'] || obj['260$c'] || '';
      if (!yr && obj['008'] && obj['008'].length >= 11) {
        const match008 = obj['008'].slice(7, 11).match(/\b(1[789]\d{2}|20\d{2})\b/);
        if (match008) yr = match008[1];
      }
      obj['MARC_YEAR'] = yr;

      // 6. Subjects (600-699: 600, 610, 611, 630, 650, 651, 653, 654, 655, etc.) - EACH SUBJECT IN ITS OWN FIELD
      const subjectFields = (marcRecords[recordIdx]?.fields || []).filter(
        (f) => f.tag && /^6\d\d$/.test(f.tag)
      );

      const subjects = [];
      for (const f of subjectFields) {
        const subfields = f.subfields || [];
        const mainCodes = new Set(['a', 'b', 'c', 'd', 'q']);
        const subdivCodes = new Set(['v', 'x', 'y', 'z']);

        const mainParts = subfields
          .filter((s) => mainCodes.has(s.code))
          .map((s) => s.value.replace(/[,/;\.]\s*$/, '').trim())
          .filter(Boolean);
        const subdivParts = subfields
          .filter((s) => subdivCodes.has(s.code))
          .map((s) => s.value.replace(/[,/;\.]\s*$/, '').trim())
          .filter(Boolean);

        const mainStr = mainParts.join(' ');
        const allParts = [mainStr, ...subdivParts].filter(Boolean);
        if (allParts.length > 0) {
          subjects.push(allParts.join(' -- ').replace(/\s*--\s*$/, '').replace(/\.$/, '').trim());
        }
      }

      // Fallback if no 6xx fields found in raw fields: check grid values
      if (subjects.length === 0) {
        const fallbackSubjs = [
          ...(obj['650$a'] ? obj['650$a'].split(' | ') : []),
          ...(obj['651$a'] ? obj['651$a'].split(' | ') : []),
          ...(obj['653$a'] ? obj['653$a'].split(' | ') : []),
        ].map((s) => s.replace(/\.$/, '').trim()).filter(Boolean);
        subjects.push(...fallbackSubjs);
      }

      const uniqueSubjects = [...new Set(subjects.filter(Boolean))];
      if (uniqueSubjects.length > 1) hasMultipleSubjects = true;
      if (uniqueSubjects.length > maxSubjectsInAnyRecord) {
        maxSubjectsInAnyRecord = uniqueSubjects.length;
      }

      obj['MARC_SUBJECTS'] = uniqueSubjects.join('; ');
      for (let i = 0; i < Math.max(5, uniqueSubjects.length); i++) {
        obj[`MARC_SUBJECT_${i + 1}`] = uniqueSubjects[i] || '';
      }

      // 7. Description (520 Abstract preferred, fallback to 505 or 500)
      obj['MARC_DESCRIPTION'] = obj['520$a'] || obj['505$t'] || obj['505$a'] || obj['500$a'] || '';

      // 8. Category (490 series, 830, 655 genre, 082 Dewey, 050 LCC)
      obj['MARC_CATEGORY'] = obj['490$a'] || obj['830$a'] || obj['655$a'] || obj['082$a'] || obj['050$a'] || '';

      // 9. Pages
      obj['MARC_PAGES'] = obj['300$a'] || '';

      // 10. Price (Sanitize literal "No price" so manual price or fallback applies)
      let priceVal = obj['020$c'] || obj['365$b'] || '';
      if (/^(?:no price|unpriced|free|n\/?a)$/i.test(priceVal.trim())) {
        priceVal = '';
      }
      obj['MARC_PRICE'] = priceVal;

      return obj;
    });

    const synthesizedCols = [
      '245$a+$b',
      'MARC_AUTHORS',
      'MARC_ISBN',
      'MARC_PUBLISHER',
      'MARC_YEAR',
    ];
    for (let i = 1; i <= Math.max(2, maxSubjectsInAnyRecord); i++) {
      synthesizedCols.push(`MARC_SUBJECT_${i}`);
    }
    synthesizedCols.push(
      'MARC_SUBJECTS',
      'MARC_DESCRIPTION',
      'MARC_CATEGORY',
      'MARC_PAGES',
      'MARC_PRICE',
    );

    columnLabels['245$a+$b'] = '245$a+$b · Title (Title + Subtitle)';
    columnLabels['MARC_AUTHORS'] = 'MARC_AUTHORS · All Authors (100 + 700 + 245$c)';
    columnLabels['MARC_ISBN'] = 'MARC_ISBN · ISBN (020$a / 776$z)';
    columnLabels['MARC_PUBLISHER'] = 'MARC_PUBLISHER · Publisher (264$b / 260$b)';
    columnLabels['MARC_YEAR'] = 'MARC_YEAR · Publication Year (264$c / 260$c / 008)';
    columnLabels['MARC_SUBJECT_1'] = 'MARC_SUBJECT_1 · Primary Subject (Subject 1)';
    columnLabels['MARC_SUBJECT_2'] = 'MARC_SUBJECT_2 · Secondary Subject (Subject 2)';
    columnLabels['MARC_SUBJECT_3'] = 'MARC_SUBJECT_3 · Tertiary Subject (Subject 3)';
    for (let i = 4; i <= Math.max(2, maxSubjectsInAnyRecord); i++) {
      columnLabels[`MARC_SUBJECT_${i}`] = `MARC_SUBJECT_${i} · Subject ${i}`;
    }
    columnLabels['MARC_SUBJECTS'] = 'MARC_SUBJECTS · All Subjects Combined (semicolon)';
    columnLabels['MARC_DESCRIPTION'] = 'MARC_DESCRIPTION · Summary / Abstract (520$a / 505 / 500)';
    columnLabels['MARC_CATEGORY'] = 'MARC_CATEGORY · Category / Series (490 / 082 / 050)';
    columnLabels['MARC_PAGES'] = 'MARC_PAGES · Extent / Page Count (300$a)';
    columnLabels['MARC_PRICE'] = 'MARC_PRICE · Price (020$c / 365$b)';

    const allHeaders = [...synthesizedCols, ...grid.header];
    return { records: rows, detectedColumns: allHeaders, columnLabels, hasMultipleSubjects };
  }

  // 4. Tabular loader (CSV, TSV, TXT, Excel .xlsx, .xls)
  const rows = await loadTabularRecords(buffer, filename);
  const detectedColumns = Object.keys(rows[0] || {});
  const columnLabels = {};
  for (const c of detectedColumns) {
    columnLabels[c] = c;
  }

  // Check if CSV has a subject column with multiple values separated by semicolon
  const subjectKey = detectedColumns.find((c) => /^(subject|subjects|keywords|topic)$/i.test(c));
  if (subjectKey) {
    for (const r of rows) {
      const val = r[subjectKey];
      if (val && (val.includes(';') || val.includes('|'))) {
        hasMultipleSubjects = true;
        const parts = val.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
        r['subject_1'] = parts[0] || '';
        r['subject_2'] = parts[1] || '';
        r['subject_3'] = parts[2] || '';
        r['subject_4'] = parts[3] || '';
        r['subject_5'] = parts[4] || '';
      }
    }
    if (hasMultipleSubjects) {
      for (let i = 1; i <= 5; i++) {
        detectedColumns.unshift(`subject_${i}`);
        columnLabels[`subject_${i}`] = `Subject ${i}`;
      }
    }
  }

  return { records: rows, detectedColumns, columnLabels, hasMultipleSubjects };
}

/**
 * Automatically detects the best source column match for each of the target columns.
 * Prioritizes aliases in their defined order.
 *
 * @param {string[]} sourceHeaders
 * @param {string[]} [targetColumns=BOOK_CATALOG_COLUMNS]
 * @returns {Record<string, string | null>}
 */
export function autoDetectMapping(sourceHeaders = [], targetColumns = BOOK_CATALOG_COLUMNS, options = {}) {
  const mapping = {};
  const usedHeaders = new Set();

  for (const targetCol of targetColumns) {
    mapping[targetCol] = null;
  }

  // 1. Exact matches first (except 'subject' if 'subject_1' or 'MARC_SUBJECT_1' exists and splitting enabled)
  for (const targetCol of targetColumns) {
    if (targetCol === 'subject' && options.splitSubjects !== false) {
      if (sourceHeaders.includes('MARC_SUBJECT_1') || sourceHeaders.includes('subject_1')) {
        continue; // let alias matching assign MARC_SUBJECT_1 or subject_1 to subject
      }
    }
    const exact = sourceHeaders.find(
      (h) => !usedHeaders.has(h) && normalizeHeader(h) === normalizeHeader(targetCol)
    );
    if (exact) {
      mapping[targetCol] = exact;
      usedHeaders.add(exact);
    }
  }

  // 2. Alias matches in priority order
  for (const targetCol of targetColumns) {
    if (mapping[targetCol]) continue;
    
    let aliases = FIELD_ALIASES[targetCol] || [];
    if (targetCol.startsWith('subject_')) {
      const num = targetCol.replace('subject_', '');
      aliases = [
        `MARC_SUBJECT_${num}`,
        `subject_${num}`,
        `subject ${num}`,
        `topic_${num}`,
        `topic ${num}`,
        `keyword_${num}`,
        `keyword ${num}`,
      ];
    } else if (targetCol === 'subject' && options.splitSubjects === false) {
      aliases = [
        'MARC_SUBJECTS',
        ...aliases,
      ];
    }

    // Exact alias match by priority order of aliases
    let matched = null;
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias);
      const found = sourceHeaders.find(
        (h) => !usedHeaders.has(h) && normalizeHeader(h) === normAlias
      );
      if (found) {
        matched = found;
        break;
      }
    }

    // Substring / word match fallback
    if (!matched) {
      for (const alias of aliases) {
        const normA = normalizeHeader(alias);
        const found = sourceHeaders.find((h) => {
          if (usedHeaders.has(h)) return false;
          const norm = normalizeHeader(h);
          return norm === normA || norm.includes(` ${normA} `) || norm.startsWith(`${normA} `) || norm.endsWith(` ${normA}`);
        });
        if (found) {
          matched = found;
          break;
        }
      }
    }

    if (matched) {
      mapping[targetCol] = matched;
      usedHeaders.add(matched);
    }
  }

  return mapping;
}

/**
 * Normalizes an ISBN value: removes prefixes, preserves digits and trailing X.
 */
export function cleanIsbn(val) {
  if (!val) return '';
  const str = String(val).trim();
  const stripped = str.replace(/^(isbn(-?1[03])?[:\s]*)/i, '').trim();
  const matches = stripped.match(/[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9Xx]/g);
  if (matches && matches.length > 0) {
    return matches[0].replace(/\s+/g, '-').trim();
  }
  return stripped.replace(/\s+/g, ' ');
}

/**
 * Extracts a 4-digit publication year from strings like "2023", "2023-08-14", "c2021", etc.
 */
export function extractYear(val) {
  if (!val) return '';
  const str = String(val).trim();
  const match = str.match(/(?:^|\D)(1[789]\d{2}|20\d{2}|2100)(?:\D|$)/);
  return match ? match[1] : str;
}

/**
 * Cleans page numbers, e.g. "ix, 342 p." -> "342" or "256 pages" -> "256".
 */
export function cleanPages(val) {
  if (!val) return '';
  const str = String(val).trim();
  const match = str.match(/\b(\d+)\s*(?:p(?:ages?|\.)?|$)/i);
  return match ? match[1] : str;
}

/**
 * Cleans trailing cataloging punctuation like " /", " :", " =;,." from bibliographic fields
 */
export function cleanPunctuation(val) {
  if (val == null) return '';
  return String(val)
    .replace(/\s*[:/=;,]\s*$/, '')
    .trim();
}

/**
 * Sanitizes multi-line text into clean single-line or normalized representation.
 */
export function sanitizeText(val) {
  if (val == null) return '';
  return String(val)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves the list of target columns for export.
 * If splitSubjects is enabled, splits into subject, subject_2, subject_3...
 */
export function resolveTargetColumns(options = {}, records = []) {
  if (Array.isArray(options.targetColumns) && options.targetColumns.length > 0) {
    return options.targetColumns;
  }

  const shouldSplit = options.splitSubjects !== false; // enabled by default if multiple subjects exist

  let maxSubjectCount = 1;
  if (shouldSplit) {
    for (const r of records) {
      for (let i = 15; i >= 2; i--) {
        if (r[`MARC_SUBJECT_${i}`] || r[`subject_${i}`]) {
          if (i > maxSubjectCount) maxSubjectCount = i;
          break;
        }
      }
    }
  }

  const cols = [];
  for (const col of BOOK_CATALOG_COLUMNS) {
    cols.push(col);
    if (col === 'subject' && shouldSplit && maxSubjectCount > 1) {
      for (let i = 2; i <= maxSubjectCount; i++) {
        cols.push(`subject_${i}`);
      }
    }
  }

  return cols;
}

/**
 * Transforms records from ANY format (MARC .mrc/.mrk/.xml, CSV, Excel, TSV)
 * into standard Book Catalog CSV format.
 *
 * Each subject is cleanly output in its own column (subject, subject_2, subject_3...).
 *
 * @param {Buffer} fileBuffer
 * @param {object} options
 * @param {string} [options.filename='']
 * @param {boolean} [options.splitSubjects=true]
 * @param {string[]} [options.targetColumns]
 * @param {Record<string, string | null>} [options.mapping={}]
 * @param {Record<string, string>} [options.customDefaults={}]
 * @param {Record<string, string>} [options.customOverrides={}]
 * @returns {Promise<{ csv: string, recordCount: number, detectedColumns: string[], columnLabels: Record<string, string>, effectiveMapping: Record<string, string | null>, targetColumns: string[], hasMultipleSubjects: boolean }>}
 */
export async function convertToBookCatalogCsv(fileBuffer, options = {}) {
  const { records, detectedColumns, columnLabels, hasMultipleSubjects } = await loadCatalogRecords(fileBuffer, options.filename || '');
  if (!records || records.length === 0) {
    throw new Error('The uploaded file does not contain any valid records.');
  }

  const targetColumns = resolveTargetColumns(options, records);
  const suggestedMapping = autoDetectMapping(detectedColumns, targetColumns, options);
  const effectiveMapping = { ...suggestedMapping, ...(options.mapping || {}) };
  const customDefaults = options.customDefaults || {};
  const customOverrides = options.customOverrides || {};

  const rows = [];
  for (const record of records) {
    const row = {};
    for (const col of targetColumns) {
      let val = '';

      if (customOverrides[col] !== undefined && customOverrides[col] !== '') {
        val = String(customOverrides[col]).trim();
      } else {
        const sourceCol = effectiveMapping[col];
        val = sourceCol && record[sourceCol] != null ? String(record[sourceCol]).trim() : '';

        if (col === 'price' && /^(?:no price|unpriced|n\/?a)$/i.test(val)) {
          val = '';
        }

        if (!val && customDefaults[col]) {
          val = String(customDefaults[col]).trim();
        }
      }

      // Column-specific cleaning
      if (col === 'isbn') {
        val = cleanIsbn(val);
      } else if (col === 'year') {
        val = extractYear(val);
      } else if (col === 'pages') {
        val = cleanPages(val);
      } else if (col === 'title' || col === 'author' || col === 'publisher') {
        val = cleanPunctuation(sanitizeText(val));
      } else {
        val = sanitizeText(val);
      }

      row[col] = val;
    }
    rows.push(row);
  }

  const csv = stringifyCsv(rows, {
    header: true,
    columns: targetColumns,
    quoted_string: true,
    quoted_empty: false,
  });

  return {
    csv,
    recordCount: rows.length,
    detectedColumns,
    columnLabels,
    effectiveMapping,
    targetColumns,
    hasMultipleSubjects,
  };
}
