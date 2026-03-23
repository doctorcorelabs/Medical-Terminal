import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBackupPayload, validateBackupPayload, buildBackupPayload } from './backupFormat.js';
import { sanitizePdfText, cleanLabel } from './pdfTextSanitizer.js';

// -----------------------------------------------------------------------------
// sanitizePdfText
// -----------------------------------------------------------------------------

test('sanitizePdfText replaces common medical symbols', () => {
    const input = 'SpO2 ≥ 95% ± 2%';
    const output = sanitizePdfText(input);
    assert.strictEqual(output, 'SpO2 >= 95% +/- 2%');
});

test('sanitizePdfText converts arrow symbols consistently', () => {
    const input = 'Trend: ↑ BP, ↓ HR, A → B';
    const output = sanitizePdfText(input);
    assert.strictEqual(output, 'Trend: [up] BP, [down] HR, A -> B');
});

test('sanitizePdfText removes control characters', () => {
    const input = 'A\u0000B\u0009C\u001FD';
    const output = sanitizePdfText(input);
    assert.strictEqual(output, 'ABCD');
});

test('sanitizePdfText collapses whitespace by default', () => {
    const input = '  Demam   tinggi\n\nsejak  2 hari  ';
    const output = sanitizePdfText(input);
    assert.strictEqual(output, 'Demam tinggisejak 2 hari');
});

test('sanitizePdfText can preserve whitespace when collapseWhitespace=false', () => {
    const input = 'A   B\nC';
    const output = sanitizePdfText(input, { collapseWhitespace: false, trim: true });
    assert.strictEqual(output, 'A   BC');
});

test('sanitizePdfText can keep leading and trailing spaces when trim=false', () => {
    const input = '  label  ';
    const output = sanitizePdfText(input, { collapseWhitespace: false, trim: false });
    assert.strictEqual(output, '  label  ');
});

test('sanitizePdfText stringifies null and undefined safely', () => {
    assert.strictEqual(sanitizePdfText(null), '');
    assert.strictEqual(sanitizePdfText(undefined), '');
});

test('sanitizePdfText replaces unsupported unicode with spaces', () => {
    const input = 'EKG 😀 stabil';
    const output = sanitizePdfText(input);
    assert.strictEqual(output, 'EKG stabil');
});

// -----------------------------------------------------------------------------
// cleanLabel
// -----------------------------------------------------------------------------

test('cleanLabel returns fallback dash for empty string', () => {
    assert.strictEqual(cleanLabel(''), '-');
});

test('cleanLabel returns fallback dash for whitespace-only string', () => {
    assert.strictEqual(cleanLabel('   \n  '), '-');
});

test('cleanLabel keeps normal readable labels', () => {
    assert.strictEqual(cleanLabel('Tekanan Darah'), 'Tekanan Darah');
});

test('cleanLabel sanitizes symbols and keeps readable output', () => {
    assert.strictEqual(cleanLabel('HR ≥ 100 ✓'), 'HR >= 100 [OK]');
});

// -----------------------------------------------------------------------------
// parseBackupPayload + validateBackupPayload
// -----------------------------------------------------------------------------

test('parseBackupPayload accepts object payload with version coercion', () => {
    const parsed = parseBackupPayload({
        version: '3',
        patients: [{ id: 'p1' }],
        stases: [],
        schedules: [],
    });

    assert.strictEqual(parsed.version, 3);
    assert.strictEqual(parsed.patients.length, 1);
});

test('parseBackupPayload falls back to version 1 when version is invalid', () => {
    const parsed = parseBackupPayload({
        version: 'abc',
        patients: [{ id: 'p1' }],
        stases: [],
        schedules: [],
    });

    assert.strictEqual(parsed.version, 1);
});

test('parseBackupPayload filters non-object items from arrays', () => {
    const parsed = parseBackupPayload({
        version: 2,
        patients: [{ id: 'p1' }, null, 'x', 123, { name: 'Budi' }],
        stases: [undefined, { id: 's1' }],
        schedules: ['invalid', { title: 'Round', date: '2026-03-23' }],
    });

    assert.strictEqual(parsed.patients.length, 2);
    assert.strictEqual(parsed.stases.length, 1);
    assert.strictEqual(parsed.schedules.length, 1);
});

test('validateBackupPayload accepts patient with only name', () => {
    const validated = validateBackupPayload({
        version: 2,
        patients: [{ name: 'Pasien Tanpa ID' }],
        stases: [],
        schedules: [],
    });

    assert.strictEqual(validated.patients.length, 1);
    assert.strictEqual(validated.invalid.patients, 0);
});

test('validateBackupPayload accepts stase with only id', () => {
    const validated = validateBackupPayload({
        version: 2,
        patients: [],
        stases: [{ id: 'stase-1' }],
        schedules: [],
    });

    assert.strictEqual(validated.stases.length, 1);
    assert.strictEqual(validated.invalid.stases, 0);
});

test('validateBackupPayload rejects schedule when title is empty after trim', () => {
    const validated = validateBackupPayload({
        version: 2,
        patients: [],
        stases: [],
        schedules: [{ title: '   ', date: '2026-03-23' }],
    });

    assert.strictEqual(validated.schedules.length, 0);
    assert.strictEqual(validated.invalid.schedules, 1);
});

test('validateBackupPayload rejects schedule when date format is invalid', () => {
    const validated = validateBackupPayload({
        version: 2,
        patients: [],
        stases: [],
        schedules: [{ title: 'Visit', date: '23-03-2026' }],
    });

    assert.strictEqual(validated.schedules.length, 0);
    assert.strictEqual(validated.invalid.schedules, 1);
});

test('validateBackupPayload keeps version fallback at 1 for missing parsed object', () => {
    const validated = validateBackupPayload(null);
    assert.strictEqual(validated.version, 1);
    assert.strictEqual(validated.totalInvalid, 0);
});

test('validateBackupPayload reports totalInvalid as sum of all invalid buckets', () => {
    const validated = validateBackupPayload({
        version: 2,
        patients: [{}, { id: 'p-ok' }],
        stases: [{}, { name: 'Anak' }],
        schedules: [{ title: '', date: '2026-03-23' }, { title: 'OK', date: '2026-03-23' }],
    });

    const summed = validated.invalid.patients + validated.invalid.stases + validated.invalid.schedules;
    assert.strictEqual(validated.totalInvalid, summed);
    assert.strictEqual(validated.totalInvalid, 3);
});

// -----------------------------------------------------------------------------
// buildBackupPayload
// -----------------------------------------------------------------------------

test('buildBackupPayload produces v2 shape with source and exportedAt', () => {
    const payload = buildBackupPayload({
        patients: [{ id: 'p1' }],
        stases: [{ id: 's1' }],
        schedules: [{ id: 'sc1', title: 'Round', date: '2026-03-23' }],
        userId: 'user-123',
    });

    assert.strictEqual(payload.version, 2);
    assert.strictEqual(payload.source, 'medical-terminal');
    assert.strictEqual(payload.userId, 'user-123');
    assert.ok(typeof payload.exportedAt === 'string');
    assert.ok(payload.data);
});

test('buildBackupPayload coerces non-array fields into empty arrays', () => {
    const payload = buildBackupPayload({
        patients: 'not-array',
        stases: null,
        schedules: undefined,
        userId: null,
    });

    assert.deepStrictEqual(payload.data.patients, []);
    assert.deepStrictEqual(payload.data.stases, []);
    assert.deepStrictEqual(payload.data.schedules, []);
    assert.strictEqual(payload.userId, null);
});

test('buildBackupPayload can round-trip through parse + validate', () => {
    const built = buildBackupPayload({
        patients: [{ id: 'p1', name: 'A' }, { name: 'B' }],
        stases: [{ id: 's1', name: 'ICU' }],
        schedules: [{ title: 'Round', date: '2026-03-23' }, { title: 'Bad', date: '03/23/2026' }],
        userId: 'u-1',
    });

    const parsed = parseBackupPayload(built);
    const validated = validateBackupPayload(parsed);

    assert.strictEqual(validated.patients.length, 2);
    assert.strictEqual(validated.stases.length, 1);
    assert.strictEqual(validated.schedules.length, 1);
    assert.strictEqual(validated.invalid.schedules, 1);
});
