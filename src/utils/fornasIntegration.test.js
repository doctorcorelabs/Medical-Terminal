import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildFornasSearchQuery,
    getActiveFornasFlags,
    getFornasRestrictionLines,
    hasCriticalFornasRestriction,
    findBestFornasMatch,
    hasAnyCriticalRestrictions,
} from './fornasIntegration.js';

test('buildFornasSearchQuery normalizes and picks first token from regimen', () => {
    const query = buildFornasSearchQuery('Ceftriaxone + Azithromycin 500 mg');
    assert.strictEqual(query, 'ceftriaxone');
});

test('buildFornasSearchQuery strips units and punctuation', () => {
    const query = buildFornasSearchQuery('Amoxicillin 500mg (PO)');
    assert.strictEqual(query, 'amoxicillin');
});

test('getActiveFornasFlags returns only true flags', () => {
    const drug = {
        flag_oen: true,
        flag_fpktl: false,
        flag_fpktp: true,
        flag_prb: false,
    };
    const active = getActiveFornasFlags(drug);
    const keys = active.map((f) => f.key);

    assert.ok(keys.includes('flag_oen'));
    assert.ok(keys.includes('flag_fpktp'));
    assert.strictEqual(keys.includes('flag_fpktl'), false);
});

test('getFornasRestrictionLines collects non-empty restriction fields', () => {
    const drug = {
        restriction_drug: 'Hanya untuk infeksi berat',
        restriction_form: '',
        restriction_note_l1: 'Wajib monitoring',
        restriction_note_l2: null,
    };
    const lines = getFornasRestrictionLines(drug);

    assert.deepStrictEqual(lines, ['Hanya untuk infeksi berat', 'Wajib monitoring']);
});

test('hasCriticalFornasRestriction returns false when no restrictions', () => {
    assert.strictEqual(hasCriticalFornasRestriction({}), false);
    assert.strictEqual(hasCriticalFornasRestriction(null), false);
});

test('hasCriticalFornasRestriction detects critical phrases', () => {
    const drug = {
        restriction_note_l1: 'Tidak boleh digunakan pada kondisi tertentu',
    };
    assert.strictEqual(hasCriticalFornasRestriction(drug), true);
});

test('findBestFornasMatch returns null for empty inputs', () => {
    assert.strictEqual(findBestFornasMatch([], 'amoxicillin'), null);
    assert.strictEqual(findBestFornasMatch(null, 'amoxicillin'), null);
    assert.strictEqual(findBestFornasMatch([{ name: 'amoxicillin' }], ''), null);
});

test('findBestFornasMatch prefers exact name match', () => {
    const rows = [
        { id: 1, name: 'amoxicillin', name_international: '', label: '' },
        { id: 2, name: 'amox', name_international: '', label: '' },
    ];

    const best = findBestFornasMatch(rows, 'amoxicillin');
    assert.ok(best);
    assert.strictEqual(best.id, 1);
});

test('findBestFornasMatch supports synonym expansion (amoxicillin -> amoksisilin)', () => {
    const rows = [
        { id: 10, name: 'amoksisilin', name_international: 'amoksisilin', label: 'antibiotik' },
        { id: 11, name: 'cefixime', name_international: 'cefixime', label: 'antibiotik' },
    ];

    const best = findBestFornasMatch(rows, 'amoxicillin');
    assert.ok(best);
    assert.strictEqual(best.id, 10);
});

test('findBestFornasMatch can match by international name or label', () => {
    const rows = [
        { id: 21, name: 'unknown', name_international: 'linezolid', label: 'anti gram positif' },
        { id: 22, name: 'other', name_international: 'other', label: 'misc' },
    ];

    const best = findBestFornasMatch(rows, 'linezolid');
    assert.ok(best);
    assert.strictEqual(best.id, 21);
});

test('findBestFornasMatch returns null when best score below threshold', () => {
    const rows = [
        { id: 1, name: 'xylophone', name_international: 'music', label: 'instrument' },
    ];

    const best = findBestFornasMatch(rows, 'amoxicillin');
    assert.strictEqual(best, null);
});

test('hasAnyCriticalRestrictions returns true when any row is critical', () => {
    const rows = [
        { restriction_note_l1: 'informasi biasa' },
        { restriction_note_l1: 'Harus diberikan dengan pengawasan ketat' },
    ];

    assert.strictEqual(hasAnyCriticalRestrictions(rows), true);
});

test('hasAnyCriticalRestrictions returns false for non-array and non-critical rows', () => {
    assert.strictEqual(hasAnyCriticalRestrictions(null), false);
    assert.strictEqual(
        hasAnyCriticalRestrictions([{ restriction_note_l1: 'informasi tambahan' }]),
        false
    );
});
