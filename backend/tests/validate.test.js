import { validateRecords } from '../src/lib/validate.js';

describe('validateRecords', () => {
  it('warns if leader is missing', () => {
    const records = [{ fields: [{ tag: '245', value: 'Title' }] }];
    const warnings = validateRecords(records);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/missing leader/);
  });

  it('warns if leader is not 24 characters', () => {
    const records = [{ leader: '123', fields: [{ tag: '245', value: 'Title' }] }];
    const warnings = validateRecords(records);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/expected 24/);
  });

  it('warns if 245 (title) field is missing', () => {
    const records = [{ leader: '012345678901234567890123', fields: [{ tag: '100', value: 'Author' }] }];
    const warnings = validateRecords(records);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/no 245 \(title\) field/);
  });

  it('warns on duplicate control numbers (001)', () => {
    const records = [
      { leader: '012345678901234567890123', fields: [{ tag: '245', value: 'Title 1' }, { tag: '001', value: 'ID123' }] },
      { leader: '012345678901234567890123', fields: [{ tag: '245', value: 'Title 2' }, { tag: '001', value: 'ID123' }] }
    ];
    const warnings = validateRecords(records);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/duplicate control number/);
  });

  it('passes valid records without warnings', () => {
    const records = [
      { leader: '012345678901234567890123', fields: [{ tag: '245', value: 'Valid Title' }, { tag: '001', value: 'ID123' }] }
    ];
    const warnings = validateRecords(records);
    expect(warnings.length).toBe(0);
  });
});
