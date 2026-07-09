import { formatFieldContent, parseFieldContent } from './fieldFormat.js';

// Parses .mrk (MARC mnemonic / breaker) text into canonical records.
// Record boundaries are driven by `=LDR` (every record has exactly one),
// not blank lines, since real-world exports aren't always consistently
// blank-line-separated.
export function parseMarcMnemonic(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const records = [];
  let current = null;

  const flush = () => {
    if (current && (current.fields.length > 0 || current.leader)) {
      records.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) continue;

    const match = line.match(/^=(\S\S\S)\s\s?(.*)$/);
    if (!match) continue;

    const [, tag, content] = match;

    if (tag === 'LDR') {
      flush();
      current = { leader: content, fields: [] };
      continue;
    }

    if (!current) current = { leader: '', fields: [] };
    current.fields.push(parseFieldContent(tag, content));
  }

  flush();
  return records;
}

// Serializes canonical records into .mrk text.
export function writeMarcMnemonic(records) {
  const blocks = records.map((record) => {
    const lines = [`=LDR  ${record.leader || ''}`];
    for (const field of record.fields) {
      lines.push(`=${field.tag}  ${formatFieldContent(field)}`);
    }
    return lines.join('\n');
  });
  return blocks.join('\n\n') + '\n';
}
