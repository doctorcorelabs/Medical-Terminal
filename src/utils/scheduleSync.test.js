import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getScheduleStorageKey,
    mergeSchedules,
    parseStoredSchedules,
    schedulesDiffer,
} from './scheduleSync.js';

test('getScheduleStorageKey scopes storage by user id', () => {
    assert.equal(getScheduleStorageKey(), 'medterminal_schedules');
    assert.equal(getScheduleStorageKey('user-123'), 'medterminal_schedules:user-123');
});

test('parseStoredSchedules rejects non-array payloads', () => {
    assert.deepEqual(parseStoredSchedules('{"foo":1}'), []);
});

test('parseStoredSchedules keeps recent schedules and purges expired items', () => {
    const now = new Date();
    const recent = new Date(now);
    recent.setDate(now.getDate() - 5);
    const expired = new Date(now);
    expired.setDate(now.getDate() - 45);

    const payload = JSON.stringify([
        { id: 'recent', date: recent.toISOString().slice(0, 10), title: 'Recent' },
        { id: 'expired', date: expired.toISOString().slice(0, 10), title: 'Expired' },
    ]);

    assert.deepEqual(parseStoredSchedules(payload), [
        { id: 'recent', date: recent.toISOString().slice(0, 10), title: 'Recent' },
    ]);
});

test('mergeSchedules appends server-only items and keeps local version for same id', () => {
    const local = [
        { id: 'same', title: 'Local copy', date: '2026-03-14' },
        { id: 'local-only', title: 'Only local', date: '2026-03-15' },
    ];
    const server = [
        { id: 'same', title: 'Server copy', date: '2026-03-14' },
        { id: 'server-only', title: 'Only server', date: '2026-03-16' },
    ];

    assert.deepEqual(mergeSchedules(local, server), [
        { id: 'same', title: 'Local copy', date: '2026-03-14' },
        { id: 'local-only', title: 'Only local', date: '2026-03-15' },
        { id: 'server-only', title: 'Only server', date: '2026-03-16' },
    ]);
});

test('schedulesDiffer compares schedule content independent of order', () => {
    const left = [
        { id: 'a', title: 'A', date: '2026-03-14', startTime: '08:00' },
        { id: 'b', title: 'B', date: '2026-03-15' },
    ];
    const reordered = [
        { id: 'b', title: 'B', date: '2026-03-15' },
        { id: 'a', title: 'A', date: '2026-03-14', startTime: '08:00' },
    ];
    const changed = [
        { id: 'a', title: 'A revised', date: '2026-03-14', startTime: '08:00' },
        { id: 'b', title: 'B', date: '2026-03-15' },
    ];

    assert.equal(schedulesDiffer(left, reordered), false);
    assert.equal(schedulesDiffer(left, changed), true);
});