import { detectFormatFromFilename, SUPPORTED_FORMATS } from '../src/lib/convert.js';

describe('detectFormatFromFilename', () => {
  it('detects .mrc', () => {
    expect(detectFormatFromFilename('file.mrc')).toBe('mrc');
  });

  it('detects .mrk', () => {
    expect(detectFormatFromFilename('file.mrk')).toBe('mrk');
  });

  it('detects .csv', () => {
    expect(detectFormatFromFilename('file.csv')).toBe('csv');
  });

  it('detects .xlsx', () => {
    expect(detectFormatFromFilename('file.xlsx')).toBe('xlsx');
  });

  it('detects .xls as xlsx', () => {
    expect(detectFormatFromFilename('file.xls')).toBe('xlsx');
  });

  it('detects .xml as marcxml', () => {
    expect(detectFormatFromFilename('file.xml')).toBe('marcxml');
  });

  it('returns null for unsupported formats', () => {
    expect(detectFormatFromFilename('file.txt')).toBeNull();
    expect(detectFormatFromFilename('file.exe')).toBeNull();
  });
});
