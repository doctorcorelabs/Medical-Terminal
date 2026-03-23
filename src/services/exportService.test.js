import test from 'node:test';
import assert from 'node:assert/strict';

import { toCsv, downloadCsv } from './exportService.js';

test('toCsv builds header and rows', () => {
    const rows = [
        { name: 'Ari', age: 24 },
        { name: 'Bima', age: 30 },
    ];
    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'age', label: 'Age' },
    ];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'Name,Age\nAri,24\nBima,30');
});

test('toCsv escapes double quotes', () => {
    const rows = [{ note: 'He said "Hello"' }];
    const columns = [{ key: 'note', label: 'Note' }];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'Note\n"He said ""Hello"""');
});

test('toCsv wraps values with commas', () => {
    const rows = [{ city: 'Jakarta, ID' }];
    const columns = [{ key: 'city', label: 'City' }];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'City\n"Jakarta, ID"');
});

test('toCsv wraps values with newlines', () => {
    const rows = [{ diagnosis: 'Line1\nLine2' }];
    const columns = [{ key: 'diagnosis', label: 'Diagnosis' }];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'Diagnosis\n"Line1\nLine2"');
});

test('toCsv renders null/undefined as empty string', () => {
    const rows = [{ a: null, b: undefined }];
    const columns = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
    ];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'A,B\n,');
});

test('toCsv returns header-only when rows empty', () => {
    const rows = [];
    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'age', label: 'Age' },
    ];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, 'Name,Age\n');
});

test('toCsv escapes header labels too', () => {
    const rows = [{ a: 'x' }];
    const columns = [{ key: 'a', label: 'Field, "A"' }];

    const csv = toCsv(rows, columns);
    assert.strictEqual(csv, '"Field, ""A"""\nx');
});

test('downloadCsv creates blob URL, triggers click, and revokes URL', () => {
    let capturedCsv = null;
    let capturedBlobType = null;
    const createdUrls = [];
    const revokedUrls = [];
    let clicked = false;
    const anchor = {
        href: '',
        download: '',
        click: () => {
            clicked = true;
        },
    };

    const originalBlob = globalThis.Blob;
    const originalURL = globalThis.URL;
    const originalDocument = globalThis.document;

    globalThis.Blob = class MockBlob {
        constructor(parts, options) {
            capturedCsv = parts[0];
            capturedBlobType = options?.type || null;
        }
    };

    globalThis.URL = {
        createObjectURL: () => {
            const u = 'blob:mock-url';
            createdUrls.push(u);
            return u;
        },
        revokeObjectURL: (u) => {
            revokedUrls.push(u);
        },
    };

    globalThis.document = {
        createElement: (tag) => {
            assert.strictEqual(tag, 'a');
            return anchor;
        },
    };

    try {
        downloadCsv({
            rows: [{ patient: 'Nadia', note: 'Stable' }],
            columns: [
                { key: 'patient', label: 'Patient' },
                { key: 'note', label: 'Note' },
            ],
            filename: 'report.csv',
        });

        assert.strictEqual(capturedCsv, 'Patient,Note\nNadia,Stable');
        assert.strictEqual(capturedBlobType, 'text/csv;charset=utf-8;');
        assert.deepStrictEqual(createdUrls, ['blob:mock-url']);
        assert.strictEqual(anchor.href, 'blob:mock-url');
        assert.strictEqual(anchor.download, 'report.csv');
        assert.strictEqual(clicked, true);
        assert.deepStrictEqual(revokedUrls, ['blob:mock-url']);
    } finally {
        globalThis.Blob = originalBlob;
        globalThis.URL = originalURL;
        globalThis.document = originalDocument;
    }
});
