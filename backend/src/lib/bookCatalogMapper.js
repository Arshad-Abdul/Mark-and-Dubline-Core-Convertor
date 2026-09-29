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
  subject:     { label: 'Subject',                  description: 'e.g. Computer Science, Physics', required: false },
  description: { label: 'Description / Abstract',   description: 'Book description or abstract',   required: false },
  coverUrl:    { label: 'Cover Image URL',          description: 'https:// URL to cover image',    required: false },
  category:    { label: 'Category / Genre',         description: 'Category or genre',              required: false },
  pages:       { label: 'Page Count',               description: 'Number of pages',                required: false },
  url:         { label: 'Resource / Book URL',      description: 'Link to book / e-book',          required: false },
  price:       { label: 'Price',                    description: 'Price in local currency',        required: false },
};

// Aliases for intelligent auto-detection across CSV, Excel, and MARC (.mrc, .mrk, .xml)
const FIELD_ALIASES = {
  title: [
    '245$a+$b', '245$a', '245', 'title', 'book title', 'book_title', 'item title',
    'item_title', 'publication title', 'article title', 'document title', 'work title',
    'name', 'book name', 'ti', 'work',
  ],
  author: [
    '100$a+700$a', '100$a', '100', '700$a', '110$a', 'author', 'authors', 'author(s)',
    'creator', 'creators', 'writer', 'writers', 'written by', 'book author', 'book authors',
    'author full names', 'author_name', 'author name', 'au', 'contributor', 'contributors',
    'primary author',
  ],
  isbn: [
    '020$a', '020', 'isbn', 'isbn-13', 'isbn13', 'isbn-10', 'isbn10', 'isbn/issn',
    'international standard book number', 'standard number', 'book isbn', 'identifier',
    'e-isbn', 'eisbn', 'isbn number',
  ],
  publisher: [
    '264$b', '260$b', '264', '260', 'publisher', 'publisher name', 'publishing house',
    'press', 'imprint', 'publication house', 'pub', 'pu', 'published by', 'distributor',
  ],
  year: [
    '264$c', '260$c', 'year', 'publication year', 'pub year', 'pub_year', 'published year',
    'date', 'publication date', 'pub date', 'issued', 'date issued', 'py', 'copyright year',
    'release year', 'pubdate', 'year published',
  ],
  subject: [
    '650$a', '650', '653$a', '651$a', '600$a', 'subject', 'subjects', 'subject(s)',
    'topic', 'topics', 'keywords', 'keyword', 'tags', 'tag', 'author keywords', 'mesh terms',
    'index terms', 'discipline', 'subject headings', 'heading',
  ],
  description: [
    '520$a', '520', '500$a', 'description', 'book description', 'abstract', 'summary',
    'synopsis', 'overview', 'about', 'notes', 'annotation', 'blurb', 'ab', 'details', 'comment',
  ],
  coverUrl: [
    'coverurl', 'cover_url', 'cover url', 'cover', 'cover image', 'coverimage',
    'cover_image', 'cover image url', 'image url', 'image', 'image_url', 'thumbnail',
    'thumbnail url', 'book cover', 'poster', 'cover_image_url', 'img_url', 'img',
  ],
  category: [
    '082$a', '050$a', '084$a', '080$a', 'category', 'categories', 'genre', 'genres',
    'classification', 'class', 'section', 'collection', 'department', 'shelfmark',
    'document type', 'type', 'format', 'call number',
  ],
  pages: [
    '300$a', '300', 'pages', 'page count', 'pagecount', 'number of pages', 'num pages',
    'no of pages', 'pagination', 'extent', 'length', 'total pages', 'pgs', 'page',
  ],
  url: [
    '856$u', '856', 'url', 'link', 'book url', 'book link', 'ebook url', 'e-book url',
    'web link', 'website', 'uri', 'permalink', 'view url', 'download url', 'doi link',
    'link to book', 'product url', 'source url', 'online link', 'doi',
  ],
  price: [
    '020$c', '365$b', 'price', 'cost', 'amount', 'list price', 'retail price', 'mrp',
    'rate', 'fee', 'charge', 'selling price', 'book price', 'inr', 'usd', 'eur',
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
 * Loads catalog records from any file: MARC (.mrc, .mrk, .xml), CSV, TSV, TXT, Excel (.xlsx, .xls)
 * @param {Buffer} buffer
 * @param {string} [filename='']
 * @returns {Promise<{ records: Array<Record<string, string>>, detectedColumns: string[], columnLabels: Record<string, string> }>}
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

  // If MARC records detected:
  if (marcRecords && marcRecords.length > 0) {
    const grid = recordsToGrid(marcRecords, { includeLabels: false });
    const columnLabels = {};

    for (const key of grid.header) {
      const [tag, code] = key.split('$');
      const subLabel = code ? getSubfieldLabel(tag, code) : getFieldLabel(tag);
      columnLabels[key] = subLabel ? `${key} · ${subLabel}` : key;
    }

    const has245a = grid.header.includes('245$a');
    const has245b = grid.header.includes('245$b');
    const has100a = grid.header.includes('100$a');
    const has700a = grid.header.includes('700$a');

    const synthesizedCols = [];
    if (has245a && has245b) {
      synthesizedCols.push('245$a+$b');
      columnLabels['245$a+$b'] = '245$a+$b · Full Title (Title + Subtitle)';
    }
    if (has100a && has700a) {
      synthesizedCols.push('100$a+700$a');
      columnLabels['100$a+700$a'] = '100$a+700$a · All Authors (Primary + Added)';
    }

    const rows = grid.rows.map((row) => {
      const obj = {};
      grid.header.forEach((key, i) => {
        obj[key] = row[i] || '';
      });

      if (has245a && has245b) {
        const tA = (obj['245$a'] || '').replace(/\s*[:/=;,]\s*$/, '').trim();
        const tB = (obj['245$b'] || '').replace(/\s*[:/=;,]\s*$/, '').trim();
        obj['245$a+$b'] = tA && tB ? `${tA}: ${tB}` : (tA || tB);
      }
      if (has100a && has700a) {
        const a1 = (obj['100$a'] || '').replace(/\s*[,/]\s*$/, '').trim();
        const a7 = (obj['700$a'] || '').replace(/\s*[,/]\s*$/, '').trim();
        obj['100$a+700$a'] = [a1, a7].filter(Boolean).join(' || ');
      }

      return obj;
    });

    const allHeaders = [...synthesizedCols, ...grid.header];
    return { records: rows, detectedColumns: allHeaders, columnLabels };
  }

  // 4. Tabular loader (CSV, TSV, TXT, Excel .xlsx, .xls)
  const rows = await loadTabularRecords(buffer, filename);
  const detectedColumns = Object.keys(rows[0] || {});
  const columnLabels = {};
  for (const c of detectedColumns) {
    columnLabels[c] = c;
  }
  return { records: rows, detectedColumns, columnLabels };
}

/**
 * Automatically detects the best source column match for each of the 12 target columns.
 * @param {string[]} sourceHeaders
 * @returns {Record<string, string | null>}
 */
export function autoDetectMapping(sourceHeaders = []) {
  const mapping = {};
  const usedHeaders = new Set();

  for (const targetCol of BOOK_CATALOG_COLUMNS) {
    mapping[targetCol] = null;
  }

  // 1. Exact matches first
  for (const targetCol of BOOK_CATALOG_COLUMNS) {
    const exact = sourceHeaders.find(
      (h) => !usedHeaders.has(h) && normalizeHeader(h) === normalizeHeader(targetCol)
    );
    if (exact) {
      mapping[targetCol] = exact;
      usedHeaders.add(exact);
    }
  }

  // 2. Alias matches
  for (const targetCol of BOOK_CATALOG_COLUMNS) {
    if (mapping[targetCol]) continue;
    const aliases = FIELD_ALIASES[targetCol] || [];

    // Exact alias match
    let matched = sourceHeaders.find((h) => {
      if (usedHeaders.has(h)) return false;
      const norm = normalizeHeader(h);
      return aliases.some((a) => normalizeHeader(a) === norm);
    });

    // Substring / word match
    if (!matched) {
      matched = sourceHeaders.find((h) => {
        if (usedHeaders.has(h)) return false;
        const norm = normalizeHeader(h);
        return aliases.some((a) => {
          const normA = normalizeHeader(a);
          return norm === normA || norm.includes(` ${normA} `) || norm.startsWith(`${normA} `) || norm.endsWith(` ${normA}`);
        });
      });
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
 * Cleans trailing punctuation like " /", " :", " =;,." from bibliographic fields
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
 * Transforms records from ANY format (MARC .mrc/.mrk/.xml, CSV, Excel, TSV)
 * into standard Book Catalog CSV format.
 *
 * @param {Buffer} fileBuffer
 * @param {object} options
 * @param {string} [options.filename='']
 * @param {Record<string, string | null>} [options.mapping={}]
 * @param {Record<string, string>} [options.customDefaults={}]
 * @returns {Promise<{ csv: string, recordCount: number, detectedColumns: string[], columnLabels: Record<string, string>, effectiveMapping: Record<string, string | null> }>}
 */
export async function convertToBookCatalogCsv(fileBuffer, options = {}) {
  const { records, detectedColumns, columnLabels } = await loadCatalogRecords(fileBuffer, options.filename || '');
  if (!records || records.length === 0) {
    throw new Error('The uploaded file does not contain any valid records.');
  }

  const suggestedMapping = autoDetectMapping(detectedColumns);
  const effectiveMapping = { ...suggestedMapping, ...(options.mapping || {}) };
  const customDefaults = options.customDefaults || {};

  const rows = [];
  for (const record of records) {
    const row = {};
    for (const col of BOOK_CATALOG_COLUMNS) {
      const sourceCol = effectiveMapping[col];
      let val = sourceCol && record[sourceCol] != null ? String(record[sourceCol]).trim() : '';

      if (!val && customDefaults[col]) {
        val = String(customDefaults[col]).trim();
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
    columns: BOOK_CATALOG_COLUMNS,
    quoted_string: true,
    quoted_empty: false,
  });

  return {
    csv,
    recordCount: rows.length,
    detectedColumns,
    columnLabels,
    effectiveMapping,
  };
}
