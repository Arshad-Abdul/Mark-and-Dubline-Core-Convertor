const FIELD_TERMINATOR = '\x1e';
const RECORD_TERMINATOR = '\x1d';
const SUBFIELD_DELIMITER = '\x1f';

// Parses a buffer containing one or more ISO 2709 MARC21 records (.mrc) into
// the canonical record shape: { leader, fields: [{ tag, value }|{ tag, ind1, ind2, subfields }] }
export function parseMarcBinary(buffer) {
  const text = buffer.toString('binary');
  const records = [];
  let offset = 0;

  while (offset < text.length) {
    const recordLengthStr = text.slice(offset, offset + 5);
    const recordLength = parseInt(recordLengthStr, 10);
    if (!recordLength || recordLength < 25) break;

    const recordText = text.slice(offset, offset + recordLength);
    records.push(parseOneRecord(recordText));
    offset += recordLength;
  }

  return records;
}

function parseOneRecord(recordText) {
  const leader = recordText.slice(0, 24);
  const baseAddress = parseInt(leader.slice(12, 17), 10);

  const directoryText = recordText.slice(24, baseAddress - 1);
  const dataText = recordText.slice(baseAddress);

  const fields = [];
  for (let i = 0; i < directoryText.length; i += 12) {
    const entry = directoryText.slice(i, i + 12);
    if (entry.length < 12) break;
    const tag = entry.slice(0, 3);
    const length = parseInt(entry.slice(3, 7), 10);
    const start = parseInt(entry.slice(7, 12), 10);

    let fieldData = dataText.slice(start, start + length);
    if (fieldData.endsWith(FIELD_TERMINATOR)) {
      fieldData = fieldData.slice(0, -1);
    }

    if (fieldData.includes(SUBFIELD_DELIMITER)) {
      const ind1 = fieldData[0] ?? ' ';
      const ind2 = fieldData[1] ?? ' ';
      const subfields = fieldData
        .slice(2)
        .split(SUBFIELD_DELIMITER)
        .filter((part) => part.length > 0)
        .map((part) => ({ code: part[0], value: part.slice(1) }));
      fields.push({ tag, ind1, ind2, subfields });
    } else {
      fields.push({ tag, value: fieldData });
    }
  }

  return { leader, fields };
}

// Serializes canonical records back into an ISO 2709 binary buffer.
export function writeMarcBinary(records) {
  const buffers = records.map(writeOneRecord);
  return Buffer.concat(buffers);
}

function writeOneRecord(record) {
  let directory = '';
  let data = '';
  let position = 0;

  for (const field of record.fields) {
    let fieldText;
    if (field.value !== undefined) {
      fieldText = field.value + FIELD_TERMINATOR;
    } else {
      const ind1 = field.ind1 ?? ' ';
      const ind2 = field.ind2 ?? ' ';
      const subfieldsText = (field.subfields || [])
        .map((sf) => `${SUBFIELD_DELIMITER}${sf.code}${sf.value}`)
        .join('');
      fieldText = `${ind1}${ind2}${subfieldsText}${FIELD_TERMINATOR}`;
    }

    const length = Buffer.byteLength(fieldText, 'binary');
    directory += `${field.tag.padStart(3, '0').slice(0, 3)}${String(length).padStart(4, '0')}${String(position).padStart(5, '0')}`;
    data += fieldText;
    position += length;
  }

  directory += FIELD_TERMINATOR;
  const baseAddress = 24 + directory.length;
  const recordText = data + RECORD_TERMINATOR;
  const totalLength = baseAddress + recordText.length;

  const leaderTemplate = (record.leader || ' '.repeat(24)).padEnd(24, ' ');
  const leader =
    String(totalLength).padStart(5, '0') +
    leaderTemplate.slice(5, 12) +
    String(baseAddress).padStart(5, '0') +
    leaderTemplate.slice(17);

  return Buffer.from(leader + directory + recordText, 'binary');
}
