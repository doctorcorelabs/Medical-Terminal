import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBackupPayload, parseBackupPayload, validateBackupPayload } from '../utils/backupFormat.js';
import { getScheduleTemplateJson, parseImportedScheduleJson } from '../utils/scheduleImport.js';
import { mergeSchedules, schedulesDiffer } from '../utils/scheduleSync.js';

test('integration: import schedules then build+validate backup payload', () => {
    const rawImport = JSON.stringify({
        schedules: [
            {
                id: 's-1',
                title: 'Ward round',
                date: '2026-03-23',
                isAllDay: false,
                startTime: '08:00',
                endTime: '09:00',
                category: 'pasien',
                priority: 'tinggi',
                createdAt: '2026-03-23T07:00:00.000Z',
            },
            {
                id: 's-1',
                title: 'Ward round updated',
                date: '2026-03-23',
                isAllDay: false,
                startTime: '08:30',
                endTime: '09:30',
                category: 'pasien',
                priority: 'sedang',
                createdAt: '2026-03-23T07:30:00.000Z',
            },
            {
                title: '',
                date: '2026-03-23',
            },
        ],
    });

    const imported = parseImportedScheduleJson(rawImport);
    assert.strictEqual(imported.ok, true);
    assert.strictEqual(imported.validItems.length, 1);
    assert.strictEqual(imported.invalidItems.length, 1);
    assert.strictEqual(imported.duplicateIdsUpdated, 1);

    const backup = buildBackupPayload({
        patients: [{ id: 'p-1', name: 'Patient A' }],
        stases: [{ id: 'st-1', name: 'ICU' }],
        schedules: imported.validItems,
        userId: 'user-1',
    });

    const parsedBackup = parseBackupPayload(backup);
    const validated = validateBackupPayload(parsedBackup);

    assert.strictEqual(validated.patients.length, 1);
    assert.strictEqual(validated.stases.length, 1);
    assert.strictEqual(validated.schedules.length, 1);
    assert.strictEqual(validated.totalInvalid, 0);
});

test('integration: imported schedules merge with local state using server timestamp', () => {
    const imported = parseImportedScheduleJson(JSON.stringify({
        schedules: [
            {
                id: 's-1',
                title: 'Server newer title',
                date: '2026-03-23',
                isAllDay: true,
                category: 'pasien',
                priority: 'sedang',
                updatedAt: '2026-03-23T12:00:00.000Z',
                createdAt: '2026-03-23T12:00:00.000Z',
            },
        ],
    }));

    const localSchedules = [
        {
            id: 's-1',
            title: 'Local older title',
            date: '2026-03-23',
            updatedAt: '2026-03-23T09:00:00.000Z',
        },
        {
            id: 's-2',
            title: 'Locally deleted on server',
            date: '2026-03-20',
            updatedAt: '2026-03-23T09:00:00.000Z',
        },
    ];

    const merged = mergeSchedules(
        localSchedules,
        imported.validItems,
        '2026-03-23T10:00:00.000Z'
    );

    assert.strictEqual(merged.some((s) => s.id === 's-2'), false);
    assert.strictEqual(merged.find((s) => s.id === 's-1')?.title, 'Server newer title');
    assert.strictEqual(merged.length, 1);
});

test('integration: merged schedule collection remains stable for compare checks', () => {
    const first = [
        { id: 'a', title: 'A', date: '2026-03-23', updatedAt: '2026-03-23T10:00:00.000Z' },
        { id: 'b', title: 'B', date: '2026-03-24', updatedAt: '2026-03-23T10:00:00.000Z' },
    ];

    const second = [
        { id: 'b', date: '2026-03-24', title: 'B', updatedAt: '2026-03-23T10:00:00.000Z' },
        { id: 'a', date: '2026-03-23', title: 'A', updatedAt: '2026-03-23T10:00:00.000Z' },
    ];

    assert.strictEqual(schedulesDiffer(first, second), false);
});

test('integration: generated template can be re-imported and backed up', () => {
    const templateJson = getScheduleTemplateJson();
    const imported = parseImportedScheduleJson(templateJson);

    assert.strictEqual(imported.ok, true);
    assert.ok(imported.validItems.length >= 1);

    const backup = buildBackupPayload({
        patients: [],
        stases: [],
        schedules: imported.validItems,
        userId: 'template-user',
    });
    const validated = validateBackupPayload(parseBackupPayload(backup));

    assert.strictEqual(validated.invalid.schedules, 0);
    assert.strictEqual(validated.schedules.length, imported.validItems.length);
});
