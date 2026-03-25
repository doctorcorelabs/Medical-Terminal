/**
 * src/utils/deviceDetection.js
 * Utilitas untuk deteksi perangkat, browser, dan pembuatan fingerprint hardware.
 * Versi EXTREME (V5): Audio Fingerprinting, Safe-Area Precision, dan WebGL Audit.
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
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'masked';
        const extensions = gl.getSupportedExtensions()?.length || 0;
        const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;

        return { renderer, extensions, maxTexture };
    } catch (_e) {
        return { renderer: 'error', extensions: 0 };
    }
}

/**
 * Audio Fingerprinting (Extreme Precision)
 * Menganalisis variasi manufaktur pada chip audio.
 */
export async function initializeAudioFingerprint() {
    if (typeof window === 'undefined' || cachedAudioFingerprint !== 'pending') return;
    
    try {
        const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioContext) {
            cachedAudioFingerprint = 'no-api';
            return;
        }

        // 1 sample @ 44.1kHz
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
        for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(data[i]);
        }
        cachedAudioFingerprint = sum.toString().slice(0, 15);
    } catch (_e) {
        cachedAudioFingerprint = 'error';
    }
}

/**
 * Mendapatkan nilai pixel tepat dari Safe Area (iPhone differentiation).
 */
function getPixelPerfectInsets() {
    if (typeof document === 'undefined') return 0;
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
 * Tabel lookup dengan Safe Area Precision.
 */
function getIOSModel() {
    if (typeof window === 'undefined') return 'iPhone/iPad';
    
    const w = screen.width;
    const h = screen.height;
    const ratio = window.devicePixelRatio || 1;
    const res = `${Math.min(w, h)}x${Math.max(w, h)}@${ratio}x`;
    const audit = getWebGLAudit();
    const signals = getAdvancedHardwareSignals();

    const models = {
        '320x480@2x': 'iPhone 4/4S',
        '320x568@2x': 'iPhone 5/5S/5C/SE1',
        '375x667@2x': 'iPhone 6/6S/7/8/SE2/SE3',
        '414x736@3x': 'iPhone 6+/7+/8+',
        '375x812@3x': audit.renderer.includes('A11') ? 'iPhone X' : 'iPhone 11 Pro/12 Mini/13 Mini',
        '414x896@2x': 'iPhone XR/11',
        '414x896@3x': 'iPhone XS Max/11 Pro Max',
        // Recent with Safe Area Precision
        '390x844@3x': signals.safeInset > 47 ? 'iPhone 13/14' : 'iPhone 12',
        '393x852@3x': 'iPhone 14 Pro/15/15 Pro',
        '430x932@3x': 'iPhone 14 Pro Max/15 Plus/15 Pro Max',
        '428x926@3x': 'iPhone 12/13/14 Pro Max/14 Plus',
    };

    let modelName = models[res];
    if (!modelName) {
        if (audit.renderer.includes('A16')) modelName = 'iPhone 14 Pro/15 Series';
        else if (audit.renderer.includes('A15')) modelName = 'iPhone 13/14 Series';
        else modelName = 'iPhone/iPad';
    }

    return modelName;
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
 * Fingerprint EXTREME (V5)
 * Menggabungkan Audio Fingerprint, WebGL Audit, dan Safe-Area Precision.
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
            cachedAudioFingerprint // Nilai audio yang di-cache
        ];

        let canvasHash = 'no-canvas';
        if (typeof document !== 'undefined') {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = 150;
                    canvas.height = 30;
                    ctx.font = "bold 14px 'Inter', system-ui";
                    ctx.fillText("MT-EXTREME-V5", 5, 20);
                    canvasHash = canvas.toDataURL().slice(-40);
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
