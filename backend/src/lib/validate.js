// Lightweight sanity checks on parsed records. Returns warnings; never throws -
// conversion should still proceed even if a record looks off.
export function validateRecords(records) {
  const warnings = [];
  const seenControlNumbers = new Map(); // value -> first record index

  records.forEach((record, index) => {
    const label = `Record ${index + 1}`;

    if (!record.leader || record.leader.trim().length === 0) {
      warnings.push(`${label}: missing leader.`);
    } else if (record.leader.length !== 24) {
      warnings.push(`${label}: leader is ${record.leader.length} characters, expected 24.`);
    }

    const hasTitle = record.fields.some((f) => f.tag === '245');
    if (!hasTitle) {
      warnings.push(`${label}: no 245 (title) field.`);
    }

    const controlNumberField = record.fields.find((f) => f.tag === '001');
    if (controlNumberField) {
      const value = controlNumberField.value;
      if (seenControlNumbers.has(value)) {
        warnings.push(`${label}: duplicate control number "${value}" (also in Record ${seenControlNumbers.get(value) + 1}).`);
      } else {
        seenControlNumbers.set(value, index);
      }
    }

    for (const field of record.fields) {
      if (!/^[0-9A-Za-z]{3}$/.test(field.tag)) {
        warnings.push(`${label}: field has an invalid tag "${field.tag}".`);
      }
      if (!Object.prototype.hasOwnProperty.call(field, 'value') && (!field.subfields || field.subfields.length === 0)) {
        warnings.push(`${label}: field ${field.tag} has no data.`);
      }
    }
  });

  return warnings;
}
