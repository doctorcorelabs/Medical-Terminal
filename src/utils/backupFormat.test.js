import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackupPayload, validateBackupPayload, buildBackupPayload } from './backupFormat.js';

test('parseBackupPayload - legacy v1 array format', () => {
    const data = [
        { id: '1', name: 'Patient A' },
        { id: '2', name: 'Patient B' },
    ];
    const result = parseBackupPayload(data);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.patients.length, 2);
    assert.strictEqual(result.stases.length, 0);
    assert.strictEqual(result.schedules.length, 0);
});

test('parseBackupPayload - v2 object with patients/stases/schedules', () => {
    const data = {
        version: 2,
        patients: [{ id: '1', name: 'Patient A' }],
        stases: [{ id: 's1', name: 'Stase A' }],
        schedules: [{ id: 'sc1', title: 'Event 1' }],
    };
    const result = parseBackupPayload(data);
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.patients.length, 1);
    assert.strictEqual(result.stases.length, 1);
    assert.strictEqual(result.schedules.length, 1);
});

test('parseBackupPayload - v2 bucket format { data: { patients, ... } }', () => {
    const data = {
        version: 2,
        data: {
            patients: [{ id: '1', name: 'Patient A' }],
            stases: [{ id: 's1', name: 'Stase A' }],
            schedules: [{ id: 'sc1', title: 'Event 1' }],
        },
    };
    const result = parseBackupPayload(data);
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.patients.length, 1);
    assert.strictEqual(result.stases.length, 1);
    assert.strictEqual(result.schedules.length, 1);
});

test('parseBackupPayload - unsupported format throws error', () => {
    assert.throws(() => parseBackupPayload({ invalid: 'format' }), /Unsupported backup format/);
    assert.throws(() => parseBackupPayload(null), /Unsupported backup format/);
    assert.throws(() => parseBackupPayload('string'), /Unsupported backup format/);
});

test('validateBackupPayload - accepts valid patients with name or id', () => {
    const parsed = {
        version: 1,
        patients: [
            { id: '1', name: 'Patient A' },
            { id: '2', name: 'Patient B' },
        ],
        stases: [],
        schedules: [],
    };
    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.patients.length, 2);
    assert.strictEqual(result.invalid.patients, 0);
});

test('validateBackupPayload - rejects patients without name and id', () => {
    const parsed = {
        version: 1,
        patients: [
            { id: '1', name: 'Patient A' },
            { age: 30 }, // Missing name and id
            { name: 'Patient C' },
        ],
        stases: [],
        schedules: [],
    };
    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.patients.length, 2); // 1 and C only
    assert.strictEqual(result.invalid.patients, 1); // age-only item
});

test('validateBackupPayload - rejects schedules without title or invalid date', () => {
    const parsed = {
        version: 1,
        patients: [],
        stases: [],
        schedules: [
            { id: 'sc1', title: 'Event 1', date: '2026-03-22' },
            { id: 'sc2', title: 'Event 2', date: 'invalid-date' }, // Invalid date format
            { id: 'sc3', date: '2026-03-22' }, // Missing title
            { id: 'sc4', title: 'Event 4', date: '2026-03-22' },
        ],
    };
    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.schedules.length, 2); // sc1 and sc4 only
    assert.strictEqual(result.invalid.schedules, 2); // sc2 and sc3
});

test('validateBackupPayload - counts total invalid items', () => {
    const parsed = {
        version: 1,
        patients: [{ age: 30 }, { name: 'Patient B' }], // 1 invalid
        stases: [{ name: 'Stase A' }, { age: 50 }], // 1 invalid
        schedules: [{ title: 'Event 1', date: 'bad' }], // 1 invalid
    };
    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.totalInvalid, 3);
    assert.strictEqual(result.invalid.patients, 1);
    assert.strictEqual(result.invalid.stases, 1);
    assert.strictEqual(result.invalid.schedules, 1);
});

test('validateBackupPayload - handles empty payloads gracefully', () => {
    const parsed = {
        version: 1,
        patients: [],
        stases: [],
        schedules: [],
    };
    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.patients.length, 0);
    assert.strictEqual(result.stases.length, 0);
    assert.strictEqual(result.schedules.length, 0);
    assert.strictEqual(result.totalInvalid, 0);
});

test('buildBackupPayload - builds v2 backup with metadata', () => {
    const input = {
        patients: [{ id: '1', name: 'Patient A' }],
        stases: [{ id: 's1', name: 'Stase A' }],
        schedules: [{ id: 'sc1', title: 'Event 1' }],
        userId: 'user-123',
    };
    const result = buildBackupPayload(input);
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.source, 'medical-terminal');
    assert.strictEqual(result.userId, 'user-123');
    assert.strictEqual(result.data.patients.length, 1);
    assert.strictEqual(result.data.stases.length, 1);
    assert.strictEqual(result.data.schedules.length, 1);
    assert(result.exportedAt, 'exportedAt should be defined');
});

test('buildBackupPayload - includes exportedAt timestamp', () => {
    const before = new Date();
    const result = buildBackupPayload({
        patients: [],
        stases: [],
        schedules: [],
    });
    const after = new Date();
    const exportedAt = new Date(result.exportedAt);
    assert(exportedAt >= before && exportedAt <= after, 'exportedAt should be between before and after');
});

test('integration - realistic backup with mix of valid/invalid items', () => {
    const rawBackup = {
        version: 2,
        exportedAt: '2026-03-22T10:00:00Z',
        source: 'medical-terminal',
        userId: 'user-123',
        data: {
            patients: [
                { id: '1', name: 'Patient A', age: 30 },
                { id: '2', name: 'Patient B', age: 25 },
                { invalid: true }, // Will be filtered
            ],
            stases: [
                { id: 's1', name: 'Stase ICU' },
                { id: 's2' }, // Missing name, but has id - valid by relaxed rule
            ],
            schedules: [
                { id: 'sc1', title: 'Visit', date: '2026-03-15', isAllDay: true },
                { id: 'sc2', title: 'Surgery', date: 'invalid-date' }, // Invalid
            ],
        },
    };

    const parsed = parseBackupPayload(rawBackup);
    assert.strictEqual(parsed.version, 2);
    assert.strictEqual(parsed.patients.length, 3);
    assert.strictEqual(parsed.stases.length, 2);
    assert.strictEqual(parsed.schedules.length, 2);

    const validated = validateBackupPayload(parsed);
    assert.strictEqual(validated.patients.length, 2); // A, B only
    assert.strictEqual(validated.stases.length, 2); // s1 and s2 (has id) both valid
    assert.strictEqual(validated.schedules.length, 1); // sc1 only
    assert.strictEqual(validated.totalInvalid, 2); // only invalid: object without id/name, and bad schedule date
});

test('parseBackupPayload - defaults version to 1 when object version is not numeric', () => {
    const data = {
        version: 'abc',
        patients: [{ id: '1', name: 'Patient A' }],
        stases: [],
        schedules: [],
    };
    const result = parseBackupPayload(data);
    assert.strictEqual(result.version, 1);
});

test('parseBackupPayload - filters out non-object items from all arrays', () => {
    const data = {
        version: 2,
        patients: [{ id: '1' }, null, 1, 'x', { name: 'B' }],
        stases: [{ id: 's1' }, false, undefined],
        schedules: [{ title: 'A', date: '2026-03-23' }, 123],
    };
    const result = parseBackupPayload(data);

    assert.strictEqual(result.patients.length, 2);
    assert.strictEqual(result.stases.length, 1);
    assert.strictEqual(result.schedules.length, 1);
});

test('validateBackupPayload - trims text fields when validating title/date/name/id', () => {
    const parsed = {
        version: 2,
        patients: [{ id: '   ' }, { name: '   Patient Trim   ' }],
        stases: [{ name: '   ICU   ' }],
        schedules: [{ title: '   Visit   ', date: ' 2026-03-23 ' }],
    };

    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.patients.length, 1);
    assert.strictEqual(result.stases.length, 1);
    assert.strictEqual(result.schedules.length, 1);
});

test('validateBackupPayload - keeps invalid counts when arrays contain only invalid objects', () => {
    const parsed = {
        version: 1,
        patients: [{ foo: 'bar' }, { age: 10 }],
        stases: [{ foo: 'bar' }],
        schedules: [{ title: '', date: 'bad' }],
    };

    const result = validateBackupPayload(parsed);
    assert.strictEqual(result.patients.length, 0);
    assert.strictEqual(result.stases.length, 0);
    assert.strictEqual(result.schedules.length, 0);
    assert.strictEqual(result.invalid.patients, 2);
    assert.strictEqual(result.invalid.stases, 1);
    assert.strictEqual(result.invalid.schedules, 1);
    assert.strictEqual(result.totalInvalid, 4);
});

test('buildBackupPayload - coerces non-array input to empty arrays', () => {
    const result = buildBackupPayload({
        patients: 'x',
        stases: null,
        schedules: 123,
    });

    assert.deepStrictEqual(result.data.patients, []);
    assert.deepStrictEqual(result.data.stases, []);
    assert.deepStrictEqual(result.data.schedules, []);
});

test('buildBackupPayload - sets null userId when undefined', () => {
    const result = buildBackupPayload({
        patients: [],
        stases: [],
        schedules: [],
    });
    assert.strictEqual(result.userId, null);
});
