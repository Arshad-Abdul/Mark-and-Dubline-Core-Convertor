import {
  BOOK_CATALOG_COLUMNS,
  autoDetectMapping,
  cleanIsbn,
  extractYear,
  cleanPages,
  convertToBookCatalogCsv,
} from '../src/lib/bookCatalogMapper.js';
import { parse as parseCsv } from 'csv-parse/sync';

describe('Book Catalog Mapper', () => {
  test('defines exactly 12 standard columns in the required order', () => {
    expect(BOOK_CATALOG_COLUMNS).toEqual([
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
    ]);
  });

  test('autoDetectMapping matches common aliases accurately', () => {
    const sourceHeaders = [
      'Book Title',
      'Author Names',
      'ISBN-13',
      'Publishing House',
      'Publication Date',
      'Tags',
      'Synopsis',
      'Cover Image URL',
      'Genre',
      'Number of Pages',
      'Product Link',
      'Retail Price',
    ];

    const mapping = autoDetectMapping(sourceHeaders);
    expect(mapping.title).toBe('Book Title');
    expect(mapping.author).toBe('Author Names');
    expect(mapping.isbn).toBe('ISBN-13');
    expect(mapping.publisher).toBe('Publishing House');
    expect(mapping.year).toBe('Publication Date');
    expect(mapping.subject).toBe('Tags');
    expect(mapping.description).toBe('Synopsis');
    expect(mapping.coverUrl).toBe('Cover Image URL');
    expect(mapping.category).toBe('Genre');
    expect(mapping.pages).toBe('Number of Pages');
    expect(mapping.url).toBe('Product Link');
    expect(mapping.price).toBe('Retail Price');
  });

  test('cleanIsbn strips prefix and formats ISBN cleanly', () => {
    expect(cleanIsbn('ISBN: 978-0-13-468599-1')).toBe('978-0-13-468599-1');
    expect(cleanIsbn('ISBN-10: 0134685997')).toBe('0134685997');
    expect(cleanIsbn('978-3-16-148410-0')).toBe('978-3-16-148410-0');
  });

  test('extractYear extracts 4-digit year from dates and text', () => {
    expect(extractYear('2024-05-18')).toBe('2024');
    expect(extractYear('May 2021')).toBe('2021');
    expect(extractYear('c1998')).toBe('1998');
  });

  test('cleanPages extracts integer page counts', () => {
    expect(cleanPages('450 pages')).toBe('450');
    expect(cleanPages('xii, 328 p.')).toBe('328');
    expect(cleanPages('120')).toBe('120');
  });

  test('convertToBookCatalogCsv converts raw CSV into standard Book Catalog CSV', async () => {
    const inputCsv = `Book Name,Creator,Standard Number,Publisher,Release Year,Topic,Abstract,Poster,Section,Length,Web Link,Cost
"Clean Architecture","Martin, Robert C.","978-0134494166","Prentice Hall","2017-09-20","Software Architecture","A craftsman guide to software structure","https://example.com/cover.jpg","Technology","432 pages","https://example.com/clean-arch","$39.99"`;

    const result = await convertToBookCatalogCsv(Buffer.from(inputCsv, 'utf-8'), {
      filename: 'sample.csv',
    });

    expect(result.recordCount).toBe(1);
    expect(result.detectedColumns).toContain('Book Name');

    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed.length).toBe(1);
    const row = parsed[0];

    expect(row.title).toBe('Clean Architecture');
    expect(row.author).toBe('Martin, Robert C.');
    expect(row.isbn).toBe('978-0134494166');
    expect(row.publisher).toBe('Prentice Hall');
    expect(row.year).toBe('2017');
    expect(row.subject).toBe('Software Architecture');
    expect(row.description).toBe('A craftsman guide to software structure');
    expect(row.coverUrl).toBe('https://example.com/cover.jpg');
    expect(row.category).toBe('Technology');
    expect(row.pages).toBe('432');
    expect(row.url).toBe('https://example.com/clean-arch');
    expect(row.price).toBe('$39.99');
  });

  test('supports custom default fallback values for unmapped columns', async () => {
    const inputCsv = `Title,Author\n"Introduction to Algorithms","Cormen, T. H."`;

    const result = await convertToBookCatalogCsv(Buffer.from(inputCsv, 'utf-8'), {
      filename: 'test.csv',
      customDefaults: {
        category: 'Computer Science',
        year: '2022',
      },
    });

    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed[0].title).toBe('Introduction to Algorithms');
    expect(parsed[0].author).toBe('Cormen, T. H.');
    expect(parsed[0].category).toBe('Computer Science');
    expect(parsed[0].year).toBe('2022');
    expect(parsed[0].isbn).toBe('');
  });
});
