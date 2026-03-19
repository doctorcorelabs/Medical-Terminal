import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanLabel, sanitizePdfText } from '../utils/pdfTextSanitizer.js';

test('sanitizePdfText keeps medical symbols readable in ASCII-safe output', () => {
    const text = 'HR ↑, trend → membaik, saturasi ≥ 95%, delta ±2, ketidakpastian ≈ kecil';
    const result = sanitizePdfText(text, { collapseWhitespace: true, trim: true });

    assert.equal(result.includes('[up]'), true);
    assert.equal(result.includes('->'), true);
    assert.equal(result.includes('>='), true);
    assert.equal(result.includes('+/-2'), true);
    assert.equal(result.includes('~ kecil'), true);
});

test('sanitizePdfText can preserve spacing for rich markdown line rendering', () => {
    const text = 'A  →  B';
    const result = sanitizePdfText(text, { collapseWhitespace: false, trim: false });

    assert.match(result, /A\s+->\s+B/);
});

test('cleanLabel strips unsupported characters and produces fallback dash', () => {
    assert.equal(cleanLabel('\u0000\u0001'), '-');
    assert.equal(cleanLabel('Status ⚠  tinggi'), 'Status [!] tinggi');
});
