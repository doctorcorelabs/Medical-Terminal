import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { parseImportedScheduleJson, getScheduleTemplateJson } from './scheduleImport.js';

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

test('parseImportedScheduleJson parses valid schedules object', () => {
    const json = JSON.stringify({
        schedules: [
            {
                id: 'sch-1',
                title: 'Visit ICU',
                date: '2026-03-20',
                isAllDay: false,
                startTime: '08:00',
                endTime: '09:00',
                category: 'pasien',
                priority: 'tinggi',
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.totalItems, 1);
    assert.equal(result.validItems.length, 1);
    assert.equal(result.invalidItems.length, 0);
    assert.equal(result.validItems[0].id, 'sch-1');
    assert.equal(result.validItems[0].title, 'Visit ICU');
});

test('parseImportedScheduleJson accepts array root payload', () => {
    const json = JSON.stringify([
        {
            title: 'Rapat harian',
            date: '2026-03-21',
            isAllDay: true,
            category: 'rapat',
            priority: 'sedang',
        },
    ]);

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.totalItems, 1);
    assert.equal(result.validItems.length, 1);
});

test('parseImportedScheduleJson rejects invalid JSON text', () => {
    const result = parseImportedScheduleJson('{ invalid-json');
    assert.equal(result.ok, false);
    assert.equal(result.totalItems, 0);
    assert.equal(result.validItems.length, 0);
    assert.match(result.error, /JSON/i);
});

test('parseImportedScheduleJson rejects item without required title/date', () => {
    const json = JSON.stringify({
        schedules: [
            { date: '2026-03-20' },
            { title: 'No Date' },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.totalItems, 2);
    assert.equal(result.validItems.length, 0);
    assert.equal(result.invalidItems.length, 2);
});

test('parseImportedScheduleJson updates duplicate id using latest item', () => {
    const json = JSON.stringify({
        schedules: [
            { id: 'dup-1', title: 'Versi Lama', date: '2026-03-22', isAllDay: true },
            { id: 'dup-1', title: 'Versi Baru', date: '2026-03-22', isAllDay: true },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems.length, 1);
    assert.equal(result.duplicateIdsUpdated, 1);
    assert.equal(result.validItems[0].title, 'Versi Baru');
});

test('parseImportedScheduleJson normalizes invalid enum values', () => {
    const json = JSON.stringify({
        schedules: [
            {
                title: 'Enum fallback',
                date: '2026-03-23',
                category: 'unknown',
                priority: 'urgent',
                isAllDay: true,
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems[0].category, 'lainnya');
    assert.equal(result.validItems[0].priority, 'sedang');
    assert.ok(result.warnings.length >= 1);
});

test('parseImportedScheduleJson clears endTime when earlier than startTime', () => {
    const json = JSON.stringify({
        schedules: [
            {
                title: 'Time correction',
                date: '2026-03-24',
                isAllDay: false,
                startTime: '10:00',
                endTime: '09:00',
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems[0].endTime, '');
    assert.ok(result.warnings.some(w => w.includes('endTime')));
});

test('getScheduleTemplateJson returns schedules template payload', () => {
    const template = JSON.parse(getScheduleTemplateJson());
    assert.equal(template.version, 'medterminal-schedule-v1');
    assert.ok(Array.isArray(template.schedules));
    assert.ok(template.schedules.length >= 1);
    assert.ok(template.schedules.every(item => item.title && item.date));
});

test('parseImportedScheduleJson rejects unsupported top-level shape', () => {
    const json = JSON.stringify({ foo: 'bar' });
    const result = parseImportedScheduleJson(json);

    assert.equal(result.ok, false);
    assert.match(result.error, /Format tidak didukung/i);
});

test('parseImportedScheduleJson rejects impossible calendar date', () => {
    const json = JSON.stringify({
        schedules: [
            {
                title: 'Bad date',
                date: '2026-02-30',
                isAllDay: true,
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems.length, 0);
    assert.equal(result.invalidItems.length, 1);
    assert.match(result.invalidItems[0].reason, /YYYY-MM-DD/i);
});

test('parseImportedScheduleJson rejects invalid startTime format', () => {
    const json = JSON.stringify({
        schedules: [
            {
                title: 'Bad time',
                date: '2026-03-24',
                isAllDay: false,
                startTime: '24:10',
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems.length, 0);
    assert.equal(result.invalidItems.length, 1);
    assert.match(result.invalidItems[0].reason, /startTime/i);
});

test('parseImportedScheduleJson rejects invalid endTime format', () => {
    const json = JSON.stringify({
        schedules: [
            {
                title: 'Bad end time',
                date: '2026-03-24',
                isAllDay: false,
                startTime: '08:00',
                endTime: '08:99',
            },
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems.length, 0);
    assert.equal(result.invalidItems.length, 1);
    assert.match(result.invalidItems[0].reason, /endTime/i);
});

test('parseImportedScheduleJson rejects non-object schedule rows', () => {
    const json = JSON.stringify({
        schedules: [
            'not-an-object',
            123,
            null,
        ],
    });

    const result = parseImportedScheduleJson(json);
    assert.equal(result.ok, true);
    assert.equal(result.validItems.length, 0);
    assert.equal(result.invalidItems.length, 3);
    assert.ok(result.invalidItems.every((item) => /object/i.test(item.reason)));
});
