import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { generateReceiptPDF } from './receiptService.js';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 2000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (fs.existsSync(filePath)) return true;
        await wait(50);
    }
    return false;
}

test('generateReceiptPDF creates a non-empty receipt file', async () => {
    const orderId = `INV-UNIT-${Date.now()}`;
    const fileName = `Receipt-${orderId}.pdf`;
    const filePath = path.join(process.cwd(), fileName);

    try {
        generateReceiptPDF({
            order_id: orderId,
            user_name: 'Unit Test User',
            user_email: 'unit@example.com',
            plan_name: 'Specialist',
            amount: 199000,
            payment_method: 'qris',
            date: '2026-03-23T10:00:00Z',
        });

        const created = await waitForFile(filePath);
        assert.strictEqual(created, true);

        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 0);
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

test('generateReceiptPDF handles missing optional fields with fallbacks', async () => {
    const orderId = `INV-FALLBACK-${Date.now()}`;
    const fileName = `Receipt-${orderId}.pdf`;
    const filePath = path.join(process.cwd(), fileName);

    try {
        generateReceiptPDF({
            order_id: orderId,
            amount: 50000,
        });

        const created = await waitForFile(filePath);
        assert.strictEqual(created, true);

        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 0);
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});
