export function sanitizePdfText(value, { collapseWhitespace = true, trim = true } = {}) {
    const base = String(value ?? '')
        .replace(/≈/g, '~')
        .replace(/→/g, ' -> ')
        .replace(/↑/g, ' [up] ')
        .replace(/↓/g, ' [down] ')
        .replace(/─/g, '-')
        .replace(/✓/g, '[OK]')
        .replace(/⚠/g, '[!]')
        .replace(/≥/g, '>=')
        .replace(/≤/g, '<=')
        .replace(/±/g, '+/-')
        .replace(/×/g, 'x')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

    const normalized = collapseWhitespace ? base.replace(/\s+/g, ' ') : base;
    const bounded = trim ? normalized.trim() : normalized;
    return bounded;
}

export function cleanLabel(label) {
    const cleaned = sanitizePdfText(label, { collapseWhitespace: true, trim: true });
    return cleaned || '-';
}
