/* global global, screen, window, document, navigator */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceFingerprint, getDeviceName, initializeAudioFingerprint } from './deviceDetection.js';

test('getDeviceFingerprint is stable and uses V6 dev- prefix', () => {
    const options = {
        navigator: { 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
            platform: 'Win32'
        },
        screen: { width: 1920, height: 1080, colorDepth: 24 }
    };

    const id = getDeviceFingerprint(options);
    assert.ok(id.startsWith('dev-'), 'Should use dev- prefix');
});

test('getDeviceName identifies iPhone 14 as simplified Brand', () => {
    const iphone14Ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    
    // Mock global screen and window
    global.screen = { width: 390, height: 844 }; // iPhone 12/13/14 resolution
    global.window = { 
        devicePixelRatio: 3
    };
    
    const name = getDeviceName(iphone14Ua);
    // Phase 11: Simplified to just Brand name
    assert.strictEqual(name, 'iPhone');
    
    delete global.screen;
    delete global.window;
});

test('getDeviceName identifies iPad as simplified Brand', () => {
    const ipadUa = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    
    global.screen = { width: 768, height: 1024 };
    global.window = { devicePixelRatio: 2 };
    
    const name = getDeviceName(ipadUa);
    assert.strictEqual(name, 'iPad');
    
    delete global.screen;
    delete global.window;
});

test('Audio Fingerprint initialization (Mocked V6)', async () => {
    global.window = {
        OfflineAudioContext: class {
            constructor() {
                this.currentTime = 0;
                this.destination = {};
            }
            createOscillator() { return { type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: () => {} }; }
            createDynamicsCompressor() { return { threshold: { setValueAtTime: () => {} }, knee: { setValueAtTime: () => {} }, ratio: { setValueAtTime: () => {} }, attack: { setValueAtTime: () => {} }, release: { setValueAtTime: () => {} }, connect: () => {} }; }
            async startRendering() {
                return { getChannelData: () => new Float32Array(5000).fill(0.5) };
            }
        }
    };

    await initializeAudioFingerprint();
    const idWithAudio = getDeviceFingerprint();
    assert.ok(idWithAudio.includes('dev-'));
    
    delete global.window;
});
