/**
 * src/utils/deviceDetection.js
 * Utilitas untuk deteksi perangkat, browser, dan pembuatan fingerprint hardware.
 */

export function getDeviceName(customUa) {
    const ua = customUa || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    
    // Check for specific mobile devices
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) {
        if (/Tablet|Tab/i.test(ua)) return 'Android Tablet';
        return 'Android Phone';
    }
    
    // Check for OS
    if (/Windows NT 10.0/.test(ua)) return 'Windows 10/11 Desktop';
    if (/Windows NT 6.1/.test(ua)) return 'Windows 7 Desktop';
    if (/Macintosh/.test(ua)) return 'Mac Desktop';
    if (/Linux/.test(ua)) return 'Linux Desktop';
    
    return 'Unknown Device';
}

export function getBrowserName(customUa) {
    const ua = customUa || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\/|Opera/.test(ua)) return 'Opera';
    if (/Chrome/.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    if (/Firefox/.test(ua)) return 'Firefox';
    if (/MSIE|Trident/.test(ua)) return 'Internet Explorer';
    
    return 'Other Browser';
}

/**
 * Membuat fingerprint hardware sederhana yang stabil lintas browser pada alat yang sama.
 */
export function getDeviceFingerprint(options = {}) {
    try {
        const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : {});
        const scr = options.screen || (typeof screen !== 'undefined' ? screen : {});
        const timezone = options.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');

        // Create a canvas fingerprint buffer (more stable than devicePixelRatio)
        let canvasHash = '';
        if (typeof document !== 'undefined') {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = 200;
                    canvas.height = 30;
                    ctx.textBaseline = "top";
                    ctx.font = "14px 'Arial'";
                    ctx.fillStyle = "#f60";
                    ctx.fillRect(125, 1, 62, 20);
                    ctx.fillStyle = "#069";
                    ctx.fillText("MT-Fingerprint", 2, 15);
                    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                    ctx.fillText("MT-Fingerprint", 4, 17);
                    canvasHash = canvas.toDataURL().slice(-50); // Take last 50 chars for uniqueness
                }
            } catch (ce) {
                canvasHash = 'no-canvas';
            }
        }

        const parts = [
            nav.platform || 'unknown',
            nav.hardwareConcurrency || 'unknown',
            nav.maxTouchPoints || 0,
            scr.width || 0,
            scr.height || 0,
            scr.colorDepth || 0,
            // Removed: window.devicePixelRatio (too volatile)
            timezone,
            nav.language || 'unknown',
            canvasHash
        ];
        
        const raw = parts.join('|');
        
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return 'hw-' + Math.abs(hash).toString(36);
    } catch (e) {
        return 'hw-fallback-' + Math.random().toString(36).slice(2, 10);
    }
}

/**
 * Returns a material icon name for the device type.
 */
export function getDeviceTypeIcon(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
    const mobile = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
    const tablet = /Tablet|iPad|PlayBook|Silk/i.test(ua);
    
    if (tablet) return 'tablet_mac';
    if (mobile) return 'smartphone';
    return 'desktop_windows';
}
