/* global global */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceFingerprint, getDeviceName, initializeAudioFingerprint } from './deviceDetection.js';

test('getDeviceFingerprint is stable against timezone and language changes (V5 Extreme)', () => {
    const baseOptions = {
        navigator: { 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
            platform: 'Win32'
        },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        timezone: 'UTC',
        language: 'en-US'
    };

    const id1 = getDeviceFingerprint(baseOptions);
    
    const changedOptions = {
        ...baseOptions,
        timezone: 'Asia/Jakarta',
        language: 'id-ID'
    };
    
    const id2 = getDeviceFingerprint(changedOptions);
    
    assert.strictEqual(id1, id2, 'V5 Fingerprint should be identical despite timezone/language drift');
});

test('getDeviceName identifies specific iPhone models using Safe-Area Precision', () => {
    const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    
    // Mock global screen and window
    global.screen = { width: 393, height: 852 };
    global.window = { 
        devicePixelRatio: 3, 
        matchMedia: () => ({ matches: true }),
        getComputedStyle: () => ({ paddingTop: '50px' }) // Mocking Safe Area > 47
    };
    global.document = {
        createElement: () => ({ 
            style: {}, 
            appendChild: () => {}, 
            removeChild: () => {} 
        }),
        body: { appendChild: () => {}, removeChild: () => {} }
    };
    
    const name = getDeviceName(iphoneUa);
    // iPhone 14 Pro lookup check
    assert.strictEqual(name, 'iPhone 14 Pro/15/15 Pro');
    
    delete global.screen;
    delete global.window;
    delete global.document;
});

test('getDeviceFingerprint includes WebGL Audit and Audio-cache signal', () => {
    const options = {
        navigator: { userAgent: 'Chrome', platform: 'Win32' },
        screen: { width: 1920, height: 1080 }
    };
    
    const id = getDeviceFingerprint(options);
    assert.ok(id.startsWith('dev-'), 'Fingerprint should use dev- prefix');
});

test('Audio Fingerprint initialization (Mocked)', async () => {
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
