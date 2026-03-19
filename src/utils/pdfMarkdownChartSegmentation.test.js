import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPdfMarkdownFromSegments, CHART_MARKER_PREFIX } from './pdfMarkdownChartSegmentation.js';

test('buildPdfMarkdownFromSegments replaces chart tags with stable chart markers', () => {
    const source = [
        'Paragraf awal',
        '',
        '<MedicalChart type="trend" data="[]" />',
        '',
        'Paragraf tengah',
        '<MedicalChart type="radar">x</MedicalChart>',
        'Paragraf akhir'
    ].join('\n');

    const result = buildPdfMarkdownFromSegments(source);

    assert.equal(result.parsed.charts.length, 2);
    assert.match(result.normalizedText, new RegExp(`${CHART_MARKER_PREFIX}0`));
    assert.match(result.normalizedText, new RegExp(`${CHART_MARKER_PREFIX}1`));
    assert.equal(result.normalizedText.includes('<MedicalChart'), false);
});

test('buildPdfMarkdownFromSegments emits malformed marker when MedicalChart tag is invalid', () => {
    const source = 'Awal\n<MedicalChart type="trend"\nAkhir';
    const result = buildPdfMarkdownFromSegments(source);

    assert.equal(result.parsed.malformed.length, 1);
    assert.match(result.normalizedText, /Tag MedicalChart Tidak Valid/);
    assert.match(result.normalizedText, /reason=open-tag-not-closed/);
});
