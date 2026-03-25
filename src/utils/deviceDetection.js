/**
 * src/utils/deviceDetection.js
 * Utilitas untuk deteksi perangkat, browser, dan pembuatan fingerprint hardware.
 * Versi EXTREME (V6): Chipset-First (A14-A16), Audio Fingerprinting, dan PWA-Safe.
 */
import { UAParser } from 'ua-parser-js';

let cachedAudioFingerprint = 'pending';

/**
 * Mendapatkan renderer WebGL dan Audit Ekstensi untuk audit hardware mendalam.
 */
function getWebGLAudit() {
    if (typeof document === 'undefined') return { renderer: 'unknown', extensions: 0 };
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { renderer: 'no-webgl', extensions: 0 };
        
        // Base renderer (masked/standard)
        let renderer = gl.getParameter(gl.RENDERER) || 'unknown';
        
        // Firefox warns about WEBGL_debug_renderer_info deprecation.
        // We skip it on Firefox to avoid the console warning, as recommended by the browser.
        const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');
        
        if (!isFirefox) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                if (unmasked) renderer = unmasked;
            }
        }
        
        const extensions = gl.getSupportedExtensions()?.length || 0;
        const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;

        return { renderer, extensions, maxTexture };
    } catch (_e) {
        return { renderer: 'error', extensions: 0 };
    }
}

/**
 * Audio Fingerprinting (Extreme Precision)
 */
export async function initializeAudioFingerprint() {
    if (typeof window === 'undefined' || cachedAudioFingerprint !== 'pending') return;
    
    try {
        const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioContext) {
            cachedAudioFingerprint = 'no-api';
            return;
        }

        const context = new AudioContext(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);

        const buffer = await context.startRendering();
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
        cachedAudioFingerprint = sum.toString().slice(0, 15);
    } catch (_e) {
        cachedAudioFingerprint = 'error';
    }
}

/**
 * Mendapatkan nilai pixel tepat dari Safe Area (iPhone differentiation).
 */
function getPixelPerfectInsets() {
    if (typeof document === 'undefined' || !document.body) return 0;
    try {
        const el = document.createElement('div');
        el.style.paddingTop = 'env(safe-area-inset-top)';
        el.style.visibility = 'hidden';
        el.style.position = 'absolute';
        document.body.appendChild(el);
        const inset = parseInt(window.getComputedStyle(el).paddingTop, 10) || 0;
        document.body.removeChild(el);
        return inset;
    } catch (_e) {
        return 0;
    }
}

function getAdvancedHardwareSignals() {
    if (typeof window === 'undefined') return {};
    return {
        p3: window.matchMedia?.('(color-gamut: p3)').matches || false,
        touch: navigator.maxTouchPoints || 0,
        safeInset: getPixelPerfectInsets(),
        cores: navigator.hardwareConcurrency || 'unknown'
    };
}

/**
 * Tabel lookup berbasis Chipset (GPU) + Resolusi.
 * Prioritas Chipset untuk membedakan iPhone 12 vs 13 vs 14.
 */
function getIOSModel() {
    if (typeof window === 'undefined') return 'iPhone/iPad';
    
    const w = screen.width;
    const h = screen.height;
    const ratio = window.devicePixelRatio || 1;
    const res = `${Math.min(w, h)}x${Math.max(w, h)}@${ratio}x`;
    const audit = getWebGLAudit();
    const signals = getAdvancedHardwareSignals();
    
    const gpu = audit.renderer.toUpperCase();

    // 1. A16 / A17 Chipsets (iPhone 14 Pro, 15, 15 Pro, 16)
    if (gpu.includes('A16') || gpu.includes('A17')) {
        if (res === '393x852@3x') return 'iPhone 14 Pro / 15 / 16';
        if (res === '430x932@3x') return 'iPhone 14 Pro Max / 15 Plus / 16 Plus';
        return 'iPhone (A16/A17)';
    }

    // 2. A15 Chipsets (iPhone 13 Series, iPhone 14 Standard)
    if (gpu.includes('A15')) {
        if (res === '390x844@3x') {
            // Membedakan iPhone 13 Pro vs 14 via Safe Area jika tersedia
            return signals.safeInset > 47 ? 'iPhone 13 Pro / 14' : 'iPhone 13';
        }
        if (res === '428x926@3x') return 'iPhone 13 Pro Max / 14 Plus';
        if (res === '375x812@3x') return 'iPhone 13 Mini';
        return 'iPhone (A15)';
    }

    // 3. A14 Chipsets (iPhone 12 Series)
    if (gpu.includes('A14')) {
        if (res === '390x844@3x') return 'iPhone 12 / 12 Pro';
        if (res === '428x926@3x') return 'iPhone 12 Pro Max';
        if (res === '375x812@3x') return 'iPhone 12 Mini';
        return 'iPhone 12 Series';
    }

    // Fallback: Resolution based lookup (Standard)
    const models = {
        '375x667@2x': 'iPhone 6/7/8/SE',
        '414x736@3x': 'iPhone 6+/7+/8+',
        '375x812@3x': 'iPhone X/XS/11 Pro/13 Mini',
        '414x896@2x': 'iPhone XR/11',
        '414x896@3x': 'iPhone XS Max/11 Pro Max',
        // iPads
        '768x1024@2x': 'iPad Mini/Air',
        '810x1080@2x': 'iPad 7/8/9/10th Gen',
        '820x1180@2x': 'iPad Air 4/5',
        '834x1194@2x': 'iPad Pro 11',
        '1024x1366@2x': 'iPad Pro 12.9'
    };

    return models[res] || 'iPhone / iPad';
}

export function getDeviceName(customUa) {
    const parser = new UAParser(customUa);
    const res = parser.getResult();
    if (res.os.name === 'iOS' || res.device.vendor === 'Apple') return getIOSModel();
    const brand = res.device.vendor || '';
    const model = res.device.model || '';
    if (brand || model) return `${brand} ${model}`.trim();
    if (res.os.name) return `${res.os.name} Desktop`;
    return 'Unknown Device';
}

export function getBrowserName(customUa) {
    const parser = new UAParser(customUa);
    return parser.getBrowser().name || 'Other Browser';
}

function normalizeUAForFingerprint(ua) {
    if (!ua) return 'unknown-ua';
    return ua.replace(/\/[0-9.]+/g, '')
             .replace(/Standalone|Mobile\/\w+|Version|Safari/g, '')
             .replace(/\s+/g, '')
             .toLowerCase();
}

/**
 * Fingerprint EXTREME (V6)
 */
export function getDeviceFingerprint(options = {}) {
    try {
        const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : {});
        const scr = options.screen || (typeof screen !== 'undefined' ? screen : {});
        const adv = getAdvancedHardwareSignals();
        const audit = getWebGLAudit();
        const normUa = normalizeUAForFingerprint(nav.userAgent);

        const signals = [
            nav.platform || 'unknown',
            adv.cores,
            adv.touch,
            adv.p3 ? 'p3' : 'np3',
            adv.safeInset,
            scr.width,
            scr.height,
            scr.colorDepth,
            audit.renderer,
            audit.extensions,
            audit.maxTexture,
            normUa,
            cachedAudioFingerprint
        ];

        let canvasHash = 'no-canvas';
        if (typeof document !== 'undefined') {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = 160;
                    canvas.height = 30;
                    ctx.font = "bold 14px 'Inter', sans-serif";
                    ctx.fillText("MT-SECURE-V6", 5, 20); // V6 for force reload
                    canvasHash = canvas.toDataURL().slice(-45);
                }
            } catch (_e) { /* ignore */ }
        }

        const rawData = [...signals, canvasHash].join('::');
        let h = 0;
        for (let i = 0; i < rawData.length; i++) {
            h = ((h << 5) - h) + rawData.charCodeAt(i);
            h |= 0;
        }
        return 'dev-' + Math.abs(h).toString(36);
    } catch (_err) {
        return 'hw-fallback-' + Math.random().toString(36).slice(2, 10);
    }
}

export function getDeviceTypeIcon(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
    const parser = new UAParser(ua);
    const type = parser.getDevice().type;
    if (type === 'tablet') return 'tablet_mac';
    if (type === 'mobile') return 'smartphone';
    return 'desktop_windows';
}
