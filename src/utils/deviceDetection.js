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

        const parts = [
            nav.platform || 'unknown',
            nav.hardwareConcurrency || 'unknown',
            nav.maxTouchPoints || 0,
            scr.width || 0,
            scr.height || 0,
            scr.colorDepth || 0,
            window.devicePixelRatio || 1,
            timezone,
            nav.language || 'unknown'
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
