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

  test('converts .mrk (MarcEdit) file to standard Book Catalog CSV', async () => {
    const mrkText = `=LDR  00000cam a2200000 a 4500
=001  12345
=020  \\\\$a978-0-13-235088-4 (pbk.)$c42.00
=100  1\\$aMartin, Robert C.,$eauthor.
=245  10$aClean Code :$bA Handbook of Agile Software Craftsmanship /$cRobert C. Martin.
=260  \\\\$aUpper Saddle River, NJ :$bPrentice Hall,$cc2008.
=300  \\\\$axxix, 464 p. :$bill. ;$c24 cm.
=520  \\\\$aA handbook of agile software craftsmanship.
=650  \\0$aAgile Software Development
=082  04$a005.1$222
=856  40$uhttps://example.com/books/clean-code`;

    const result = await convertToBookCatalogCsv(Buffer.from(mrkText, 'utf-8'), {
      filename: 'catalog.mrk',
    });

    expect(result.recordCount).toBe(1);
    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed.length).toBe(1);
    const row = parsed[0];

    expect(row.title).toBe('Clean Code: A Handbook of Agile Software Craftsmanship');
    expect(row.author).toBe('Martin, Robert C.');
    expect(row.isbn).toBe('978-0-13-235088-4');
    expect(row.publisher).toBe('Prentice Hall');
    expect(row.year).toBe('2008');
    expect(row.pages).toBe('464');
    expect(row.subject).toBe('Agile Software Development');
    expect(row.description).toBe('A handbook of agile software craftsmanship.');
    expect(row.category).toBe('005.1');
    expect(row.url).toBe('https://example.com/books/clean-code');
    expect(row.price).toBe('42.00');
  });

  test('converts binary .mrc file to standard Book Catalog CSV', async () => {
    const { writeMarcBinary } = await import('../src/lib/marcBinary.js');
    const records = [
      {
        leader: '00000cam a2200000 a 4500',
        fields: [
          { tag: '001', value: 'REC001' },
          { tag: '020', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: '9780201616224' }] },
          { tag: '100', ind1: '1', ind2: ' ', subfields: [{ code: 'a', value: 'Hunt, Andrew,' }] },
          { tag: '245', ind1: '1', ind2: '4', subfields: [{ code: 'a', value: 'The Pragmatic Programmer :' }, { code: 'b', value: 'from journeyman to master /' }] },
          { tag: '260', ind1: ' ', ind2: ' ', subfields: [{ code: 'b', value: 'Addison-Wesley,' }, { code: 'c', value: '1999.' }] },
          { tag: '300', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: '352 pages' }] },
          { tag: '650', ind1: ' ', ind2: '0', subfields: [{ code: 'a', value: 'Computer programming' }] },
        ],
      },
    ];

    const mrcBuffer = writeMarcBinary(records);
    const result = await convertToBookCatalogCsv(mrcBuffer, { filename: 'sample.mrc' });

    expect(result.recordCount).toBe(1);
    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed.length).toBe(1);
    const row = parsed[0];

    expect(row.title).toBe('The Pragmatic Programmer: from journeyman to master');
    expect(row.author).toBe('Hunt, Andrew');
    expect(row.isbn).toBe('9780201616224');
    expect(row.publisher).toBe('Addison-Wesley');
    expect(row.year).toBe('1999');
    expect(row.pages).toBe('352');
    expect(row.subject).toBe('Computer programming');
  });
});


