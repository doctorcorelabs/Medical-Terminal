import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMedicalChartSegments } from './medicalChartParser.js';

test('parseMedicalChartSegments captures multiline self-closing tags', () => {
    const input = `Ringkasan awal\n\n<MedicalChart\n  type="trend"\n  title="BP Trend"\n  data='[{"time":"08:00","vitals":120}]'\n/>\n\nRingkasan akhir`;

    const parsed = parseMedicalChartSegments(input);

    assert.equal(parsed.charts.length, 1);
    assert.equal(parsed.charts[0].attributes.type, 'trend');
    assert.equal(parsed.charts[0].chartIndex, 0);
    assert.equal(parsed.malformed.length, 0);
    assert.match(parsed.charts[0].raw, /<MedicalChart[\s\S]*?\/>/i);
});

test('parseMedicalChartSegments captures paired tags and keeps ordering', () => {
    const input = `A\n<MedicalChart type="trend">ignored</MedicalChart>\nB\n<MedicalChart type='radar' data='[]' />\nC`;
    const parsed = parseMedicalChartSegments(input);

    assert.equal(parsed.charts.length, 2);
    assert.equal(parsed.charts[0].attributes.type, 'trend');
    assert.equal(parsed.charts[1].attributes.type, 'radar');
    assert.equal(parsed.charts[0].chartIndex, 0);
    assert.equal(parsed.charts[1].chartIndex, 1);

    const textJoined = parsed.segments
        .filter((segment) => segment.type === 'text')
        .map((segment) => segment.content)
        .join('');

    assert.match(textJoined, /A/);
    assert.match(textJoined, /B/);
    assert.match(textJoined, /C/);
});

test('parseMedicalChartSegments reports malformed open tag without dropping trailing text', () => {
    const input = `Teks\n<MedicalChart type="trend" data='[]'\nLanjutan`;
    const parsed = parseMedicalChartSegments(input);

    assert.equal(parsed.charts.length, 0);
    assert.equal(parsed.malformed.length, 1);
    assert.equal(parsed.malformed[0].reasonCode, 'open-tag-not-closed');
    assert.equal(parsed.diagnostics[0].code, 'parse-malformed-tag');
    assert.match(parsed.malformed[0].raw, /<MedicalChart/i);
});

test('parseMedicalChartSegments reports missing close tag for paired form', () => {
    const input = `X\n<MedicalChart type="timeline">\nY`;
    const parsed = parseMedicalChartSegments(input);

    assert.equal(parsed.charts.length, 0);
    assert.equal(parsed.malformed.length, 1);
    assert.equal(parsed.malformed[0].reasonCode, 'missing-close-tag');
});
