function escapeCsvValue(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map(c => escapeCsvValue(c.label)).join(',');
  const body = rows.map((row) => columns.map(c => escapeCsvValue(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv({ rows, columns, filename }) {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
