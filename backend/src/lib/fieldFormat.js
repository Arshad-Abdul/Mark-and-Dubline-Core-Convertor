const CONTROL_TAGS = new Set(['LDR', '001', '002', '003', '004', '005', '006', '007', '008', '009']);

export function isControlTag(tag) {
  return CONTROL_TAGS.has(tag);
}

// Renders the portion of a field that follows the tag, e.g. `10$aTitle :$bSubtitle /`
// for data fields, or the raw value for control fields / LDR.
export function formatFieldContent(field) {
  if (isControlTag(field.tag)) {
    return field.value ?? '';
  }
  const ind1 = field.ind1 === ' ' || !field.ind1 ? '\\' : field.ind1;
  const ind2 = field.ind2 === ' ' || !field.ind2 ? '\\' : field.ind2;
  const subfields = (field.subfields || [])
    .map((sf) => `$${sf.code}${sf.value}`)
    .join('');
  return `${ind1}${ind2}${subfields}`;
}

// Parses the portion of a field that follows the tag back into a field object.
export function parseFieldContent(tag, content) {
  if (isControlTag(tag)) {
    return { tag, value: content };
  }
  const rawInd1 = content[0] ?? ' ';
  const rawInd2 = content[1] ?? ' ';
  const ind1 = rawInd1 === '\\' ? ' ' : rawInd1;
  const ind2 = rawInd2 === '\\' ? ' ' : rawInd2;
  const rest = content.slice(2);
  const subfields = [];
  if (rest.length > 0) {
    const parts = rest.split('$').slice(1); // first split chunk is empty (before first $)
    for (const part of parts) {
      if (part.length === 0) continue;
      subfields.push({ code: part[0], value: part.slice(1) });
    }
  }
  return { tag, ind1, ind2, subfields };
}
