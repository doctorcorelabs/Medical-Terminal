import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceName, getBrowserName, getDeviceFingerprint } from './deviceDetection.js';

const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    platform: 'Win32',
    hardwareConcurrency: 8,
    language: 'en-US'
};

const mockScreen = {
    width: 1920,
    height: 1080,
    colorDepth: 24
};

test('getDeviceName identifies Windows 10/11', () => {
    const name = getDeviceName(mockNavigator.userAgent);
    assert.strictEqual(name, 'Windows 10/11 Desktop');
});

test('getBrowserName identifies Edge', () => {
    const name = getBrowserName(mockNavigator.userAgent);
    assert.strictEqual(name, 'Edge');
});

test('getDeviceFingerprint is stable', () => {
    const f1 = getDeviceFingerprint({ navigator: mockNavigator, screen: mockScreen, timezone: 'Asia/Jakarta' });
    const f2 = getDeviceFingerprint({ navigator: mockNavigator, screen: mockScreen, timezone: 'Asia/Jakarta' });
    assert.strictEqual(f1, f2);
    assert.ok(f1.startsWith('hw-'));
});

test('getDeviceFingerprint changes with screen size', () => {
    const f1 = getDeviceFingerprint({ navigator: mockNavigator, screen: mockScreen, timezone: 'Asia/Jakarta' });
    const f2 = getDeviceFingerprint({ 
        navigator: mockNavigator, 
        screen: { ...mockScreen, width: 800 }, 
        timezone: 'Asia/Jakarta' 
    });
    assert.notStrictEqual(f1, f2);
});
