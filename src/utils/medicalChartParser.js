const OPEN_TAG_PATTERN = /<\s*medicalchart\b/i;
const CLOSE_TAG_PATTERN = /<\s*\/\s*medicalchart\s*>/i;
const ATTR_PATTERN = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function findTagEnd(text, startIndex) {
    let quote = null;
    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote && text[i - 1] !== '\\') {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (ch === '>') {
            return i;
        }
    }
    return -1;
}

function parseAttributes(openTagText) {
    const attrs = {};
    let match;
    ATTR_PATTERN.lastIndex = 0;

    while ((match = ATTR_PATTERN.exec(openTagText)) !== null) {
        const key = String(match[1] || '').toLowerCase();
        const value = match[3] ?? match[4] ?? match[5] ?? '';
        attrs[key] = value;
    }

    return attrs;
}

function findRecoveryCursor(text, fromIndex) {
    const nextNewline = text.indexOf('\n', fromIndex);
    if (nextNewline === -1) {
        return text.length;
    }
    return nextNewline + 1;
}

export function parseMedicalChartSegments(text) {
    const source = typeof text === 'string' ? text : '';
    const segments = [];
    const diagnostics = [];
    let cursor = 0;
    let chartIndex = 0;

    while (cursor < source.length) {
        const slice = source.slice(cursor);
        const openRel = slice.search(OPEN_TAG_PATTERN);

        if (openRel === -1) {
            if (cursor < source.length) {
                segments.push({
                    type: 'text',
                    content: source.slice(cursor),
                });
            }
            break;
        }

        const openStart = cursor + openRel;
        if (openStart > cursor) {
            segments.push({
                type: 'text',
                content: source.slice(cursor, openStart),
            });
        }

        const openEnd = findTagEnd(source, openStart);
        if (openEnd === -1) {
            const recoveryCursor = findRecoveryCursor(source, openStart);
            const malformedRaw = source.slice(openStart, recoveryCursor);
            diagnostics.push({
                code: 'parse-malformed-tag',
                reason: 'open-tag-not-closed',
                at: openStart,
            });
            segments.push({
                type: 'malformed-chart',
                raw: malformedRaw,
                reasonCode: 'open-tag-not-closed',
            });
            cursor = recoveryCursor > openStart ? recoveryCursor : openStart + 1;
            continue;
        }

        const openTagRaw = source.slice(openStart, openEnd + 1);
        const isSelfClosing = /\/\s*>\s*$/.test(openTagRaw);

        if (isSelfClosing) {
            segments.push({
                type: 'chart',
                chartIndex,
                raw: openTagRaw,
                attributes: parseAttributes(openTagRaw),
            });
            chartIndex += 1;
            cursor = openEnd + 1;
            continue;
        }

        const closeSlice = source.slice(openEnd + 1);
        const closeRel = closeSlice.search(CLOSE_TAG_PATTERN);
        if (closeRel === -1) {
            const malformedRaw = source.slice(openStart, openEnd + 1);
            diagnostics.push({
                code: 'parse-malformed-tag',
                reason: 'missing-close-tag',
                at: openStart,
            });
            segments.push({
                type: 'malformed-chart',
                raw: malformedRaw,
                reasonCode: 'missing-close-tag',
            });
            cursor = openEnd + 1;
            continue;
        }

        const closeStart = openEnd + 1 + closeRel;
        const closeEnd = findTagEnd(source, closeStart);
        if (closeEnd === -1) {
            const recoveryCursor = findRecoveryCursor(source, closeStart);
            const malformedRaw = source.slice(closeStart, recoveryCursor);
            diagnostics.push({
                code: 'parse-malformed-tag',
                reason: 'close-tag-not-closed',
                at: closeStart,
            });
            segments.push({
                type: 'malformed-chart',
                raw: malformedRaw,
                reasonCode: 'close-tag-not-closed',
            });
            cursor = recoveryCursor > closeStart ? recoveryCursor : closeStart + 1;
            continue;
        }

        const fullTagRaw = source.slice(openStart, closeEnd + 1);
        segments.push({
            type: 'chart',
            chartIndex,
            raw: fullTagRaw,
            attributes: parseAttributes(openTagRaw),
        });

        chartIndex += 1;
        cursor = closeEnd + 1;
    }

    const charts = segments.filter((segment) => segment.type === 'chart');
    const malformed = segments.filter((segment) => segment.type === 'malformed-chart');

    return {
        segments,
        charts,
        malformed,
        diagnostics,
    };
}

export function extractMedicalChartTags(text) {
    return parseMedicalChartSegments(text).charts.map((segment) => segment.raw);
}
