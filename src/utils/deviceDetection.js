/**
 * src/utils/deviceDetection.js
 * Utilitas untuk deteksi perangkat, browser, dan geolokasi.
 * Versi 11: Simplified Identity + Passive Geolocation.
 */
import { UAParser } from 'ua-parser-js';

let cachedAudioFingerprint = 'pending';
let cachedLocation = null;

/**
 * Mendapatkan renderer WebGL dan Audit Ekstensi.
 * Preserving manual Firefox fix from Step 1255.
 */
function getWebGLAudit() {
    if (typeof document === 'undefined') return { renderer: 'unknown', extensions: 0 };
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { renderer: 'no-webgl', extensions: 0 };
        
        let renderer = gl.getParameter(gl.RENDERER) || 'unknown';
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
 * Audio Fingerprinting (Hardware signature)
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
 * Passive Geolocation (IP-based)
 * No permission popup required.
 */
export async function fetchIpLocation() {
    if (cachedLocation) return cachedLocation;
    try {
        // Using ipapi.co (Free tier) with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        
        const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (data && data.city) {
            cachedLocation = {
                city: data.city,
                region: data.region,
                country: data.country_name,
                ip: data.ip
            };
            return cachedLocation;
        }
    } catch (_err) {
        // Fallback or ignore
    }
    return null;
}

/**
 * Simplified iOS Model Detection (Phase 11 requested)
 */
function getIOSModel() {
    if (typeof window === 'undefined') return 'iPhone/iPad';
    const w = screen.width;
    const h = screen.height;
    const ratio = window.devicePixelRatio || 1;
    const res = `${Math.min(w, h)}x${Math.max(w, h)}@${ratio}x`;
    
    // Simplification: Focus on Brand/Type rather than specific generation
    if (res.includes('@3x')) return 'iPhone';
    if (res.includes('@2x')) {
        if (Math.min(w, h) >= 768) return 'iPad';
        return 'iPhone';
    }
    return 'Apple Device';
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
 * Fingerprint Calculation (V6 stable logic)
 */
export function getDeviceFingerprint(options = {}) {
    try {
        const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : {});
        const scr = options.screen || (typeof screen !== 'undefined' ? screen : {});
        const audit = getWebGLAudit();
        const normUa = normalizeUAForFingerprint(nav.userAgent);

        const signals = [
            nav.platform || 'unknown',
            nav.hardwareConcurrency || 'unknown',
            nav.maxTouchPoints || 0,
            scr.width,
            scr.height,
            scr.colorDepth,
            audit.renderer,
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
                    ctx.font = "bold 14px sans-serif";
                    ctx.fillText("MT-SECURE-V11", 5, 20);
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
