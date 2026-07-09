import { XMLParser } from 'fast-xml-parser';
import { isControlTag } from './fieldFormat.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['record', 'controlfield', 'datafield', 'subfield'].includes(name),
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Parses MARCXML text into canonical records.
export function parseMarcXml(text) {
  const doc = parser.parse(text);
  const collection = doc.collection || doc;
  const rawRecords = collection.record || [];

  return rawRecords.map((raw) => {
    const leader = typeof raw.leader === 'object' ? raw.leader['#text'] ?? '' : raw.leader ?? '';
    const fields = [];

    for (const cf of raw.controlfield || []) {
      fields.push({ tag: cf['@_tag'], value: typeof cf === 'object' ? cf['#text'] ?? '' : cf });
    }

    for (const df of raw.datafield || []) {
      const subfields = (df.subfield || []).map((sf) => ({
        code: sf['@_code'],
        value: typeof sf === 'object' ? sf['#text'] ?? '' : sf,
      }));
      fields.push({
        tag: df['@_tag'],
        ind1: df['@_ind1'] || ' ',
        ind2: df['@_ind2'] || ' ',
        subfields,
      });
    }

    return { leader, fields };
  });
}

// Serializes canonical records into MARCXML text.
export function writeMarcXml(records) {
  const recordsXml = records
    .map((record) => {
      const lines = [`  <record>`, `    <leader>${escapeXml(record.leader || '')}</leader>`];
      for (const field of record.fields) {
        if (isControlTag(field.tag)) {
          lines.push(`    <controlfield tag="${escapeXml(field.tag)}">${escapeXml(field.value)}</controlfield>`);
        } else {
          const ind1 = escapeXml(field.ind1 || ' ');
          const ind2 = escapeXml(field.ind2 || ' ');
          lines.push(`    <datafield tag="${escapeXml(field.tag)}" ind1="${ind1}" ind2="${ind2}">`);
          for (const sf of field.subfields || []) {
            lines.push(`      <subfield code="${escapeXml(sf.code)}">${escapeXml(sf.value)}</subfield>`);
          }
          lines.push(`    </datafield>`);
        }
      }
      lines.push(`  </record>`);
      return lines.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<collection xmlns="http://www.loc.gov/MARC21/slim">\n${recordsXml}\n</collection>\n`;
}
