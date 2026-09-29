import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { loadTabularRecords } from './tabularLoader.js';

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

// Aliases for intelligent auto-detection across diverse catalog and store export formats
const FIELD_ALIASES = {
  title: [
    'title', 'book title', 'book_title', 'item title', 'item_title', 'publication title',
    'article title', 'document title', 'work title', 'name', 'book name', 'ti', 'work',
  ],
  author: [
    'author', 'authors', 'author(s)', 'creator', 'creators', 'writer', 'writers',
    'written by', 'book author', 'book authors', 'author full names', 'author_name',
    'author name', 'au', 'contributor', 'contributors', 'primary author',
  ],
  isbn: [
    'isbn', 'isbn-13', 'isbn13', 'isbn-10', 'isbn10', 'isbn/issn', 'international standard book number',
    'standard number', 'book isbn', 'identifier', 'e-isbn', 'eisbn', 'isbn number',
  ],
  publisher: [
    'publisher', 'publisher name', 'publishing house', 'press', 'imprint', 'publication house',
    'pub', 'pu', 'published by', 'distributor',
  ],
  year: [
    'year', 'publication year', 'pub year', 'pub_year', 'published year', 'date',
    'publication date', 'pub date', 'issued', 'date issued', 'py', 'copyright year',
    'release year', 'pubdate', 'year published',
  ],
  subject: [
    'subject', 'subjects', 'subject(s)', 'topic', 'topics', 'keywords', 'keyword',
    'tags', 'tag', 'author keywords', 'mesh terms', 'index terms', 'discipline',
    'subject headings', 'heading',
  ],
  description: [
    'description', 'book description', 'abstract', 'summary', 'synopsis', 'overview',
    'about', 'notes', 'annotation', 'blurb', 'ab', 'details', 'comment',
  ],
  coverUrl: [
    'coverurl', 'cover_url', 'cover url', 'cover', 'cover image', 'coverimage',
    'cover_image', 'cover image url', 'image url', 'image', 'image_url', 'thumbnail',
    'thumbnail url', 'book cover', 'poster', 'cover_image_url', 'img_url', 'img',
  ],
  category: [
    'category', 'categories', 'genre', 'genres', 'classification', 'class', 'section',
    'collection', 'department', 'shelfmark', 'document type', 'type', 'format', 'call number',
  ],
  pages: [
    'pages', 'page count', 'pagecount', 'number of pages', 'num pages', 'no of pages',
    'pagination', 'extent', 'length', 'total pages', 'pgs', 'page',
  ],
  url: [
    'url', 'link', 'book url', 'book link', 'ebook url', 'e-book url', 'web link',
    'website', 'uri', 'permalink', 'view url', 'download url', 'doi link', 'link to book',
    'product url', 'source url', 'online link', 'doi',
  ],
  price: [
    'price', 'cost', 'amount', 'list price', 'retail price', 'mrp', 'rate', 'fee',
    'charge', 'selling price', 'book price', 'inr', 'usd', 'eur', 'price (inr)',
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

    // Check alias exact equality
    let matched = sourceHeaders.find((h) => {
      if (usedHeaders.has(h)) return false;
      const norm = normalizeHeader(h);
      return aliases.some((a) => normalizeHeader(a) === norm);
    });

    // Check if header starts with or contains alias
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
  // Remove "ISBN", "ISBN-13:", "ISBN-10:", etc.
  const stripped = str.replace(/^(isbn(-?1[03])?[:\s]*)/i, '').trim();
  // Extract alphanumeric sequences that match ISBN-10 or ISBN-13
  const matches = stripped.match(/[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9Xx]/g);
  if (matches && matches.length > 0) {
    return matches[0].replace(/\s+/g, '-').trim();
  }
  // Fallback to removing whitespace
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
 * Transforms records into standard Book Catalog format based on user or auto-detected mappings.
 *
 * @param {Buffer} fileBuffer
 * @param {object} options
 * @param {string} [options.filename='']
 * @param {Record<string, string | null>} [options.mapping={}] - TargetCol -> SourceCol
 * @param {Record<string, string>} [options.customDefaults={}] - TargetCol -> Fallback static string
 * @returns {Promise<{ csv: string, recordCount: number, detectedColumns: string[], effectiveMapping: Record<string, string | null> }>}
 */
export async function convertToBookCatalogCsv(fileBuffer, options = {}) {
  const records = await loadTabularRecords(fileBuffer, options.filename || '');
  if (!records || records.length === 0) {
    throw new Error('The uploaded file does not contain any valid records.');
  }

  const detectedColumns = Object.keys(records[0] || {});
  const suggestedMapping = autoDetectMapping(detectedColumns);
  const effectiveMapping = { ...suggestedMapping, ...(options.mapping || {}) };
  const customDefaults = options.customDefaults || {};

  const rows = [];
  for (const record of records) {
    const row = {};
    for (const col of BOOK_CATALOG_COLUMNS) {
      const sourceCol = effectiveMapping[col];
      let val = sourceCol && record[sourceCol] != null ? String(record[sourceCol]).trim() : '';

      // If mapped value is empty, use custom default if supplied
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
    effectiveMapping,
  };
}
