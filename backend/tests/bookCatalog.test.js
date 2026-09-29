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

  test('splits multiple subjects into separate columns (subject, subject_2...) for MARC records', async () => {
    const mrkText = `=LDR  04706nam  2200409 i 4500
=001  EDZ0002719268
=020  \\\\$a9780190050108 (ebook) :$cNo price
=245  04$aThe Oxford handbook of Nigerian history /$cedited by Toyin Falola and Matthew M. Heaton.
=264  \\1$aNew York :$bOxford University Press,$c2022.
=300  \\\\$a1 online resource (xii, 779 pages).
=520  8\\$a'The Oxford Handbook of Nigerian History' provides a comprehensive history...
=651  \\0$aNigeria$xHistory.
=651  \\0$aNigeria$xCivilization.
=700  1\\$aFalola, Toyin,$eeditor.
=700  1\\$aHeaton, Matthew M.,$eeditor.
=856  40$uhttp://dx.doi.org/10.1093/oxfordhb/9780190050092.001.0001`;

    const result = await convertToBookCatalogCsv(Buffer.from(mrkText, 'utf-8'), {
      filename: 'nigeria.mrk',
      splitSubjects: true,
    });

    expect(result.recordCount).toBe(1);
    expect(result.hasMultipleSubjects).toBe(true);
    expect(result.targetColumns).toContain('subject');
    expect(result.targetColumns).toContain('subject_2');

    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed[0].title).toBe('The Oxford handbook of Nigerian history');
    expect(parsed[0].author).toBe('Falola, Toyin; Heaton, Matthew M.');
    expect(parsed[0].publisher).toBe('Oxford University Press');
    expect(parsed[0].year).toBe('2022');
    expect(parsed[0].subject).toBe('Nigeria -- History');
    expect(parsed[0].subject_2).toBe('Nigeria -- Civilization');
    expect(parsed[0].pages).toBe('779');
  });

  test('splits semicolon-separated subjects in CSV when splitSubjects is enabled', async () => {
    const csvInput = `title,author,subject\n"Quantum Physics","Feynman, Richard","Physics; Quantum Mechanics; Particle Physics"`;

    const result = await convertToBookCatalogCsv(Buffer.from(csvInput, 'utf-8'), {
      filename: 'physics.csv',
      splitSubjects: true,
    });

    expect(result.targetColumns).toContain('subject');
    expect(result.targetColumns).toContain('subject_2');
    expect(result.targetColumns).toContain('subject_3');

    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed[0].subject).toBe('Physics');
    expect(parsed[0].subject_2).toBe('Quantum Mechanics');
    expect(parsed[0].subject_3).toBe('Particle Physics');
  });

  test('applies customOverrides (manual edit) over extracted data', async () => {
    const csvInput = `title,publisher,price\n"Sample Book","Auto Publisher","$10.00"`;

    const result = await convertToBookCatalogCsv(Buffer.from(csvInput, 'utf-8'), {
      filename: 'sample.csv',
      customOverrides: {
        publisher: 'Manual Fixed Press',
        price: '£25.00',
      },
    });

    const parsed = parseCsv(result.csv, { columns: true });
    expect(parsed[0].publisher).toBe('Manual Fixed Press');
    expect(parsed[0].price).toBe('£25.00');
  });
});



