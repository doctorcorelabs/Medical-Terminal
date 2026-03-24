import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';

const METRICS = [
    { key: 'heartRate', label: 'Detak Jantung', unit: 'bpm', color: '#ef4444' },
    { key: 'systolic', label: 'TD Sistolik', unit: 'mmHg', color: '#3b82f6' },
    { key: 'diastolic', label: 'TD Diastolik', unit: 'mmHg', color: '#7dd3fc' },
    { key: 'temperature', label: 'Suhu', unit: '°C', color: '#f97316' },
    { key: 'respRate', label: 'Frek. Napas', unit: '/min', color: '#22c55e' },
    { key: 'spO2', label: 'SpO2', unit: '%', color: '#a855f7' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

const DEFAULT_ACTIVE_METRICS = ['heartRate', 'systolic', 'diastolic', 'spO2'];
const STORAGE_PREFIX = 'medterminal_vitals_prefs';

function formatAxisDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs min-w-37.5">
            <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
            {payload.map(entry => {
                const m = METRICS.find(m => m.key === entry.dataKey);
                if (entry.value == null) return null;
                return (
                    <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-500 flex-1">{m?.label || entry.dataKey}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{entry.value} <span className="font-normal text-slate-400">{m?.unit}</span></span>
                    </div>
                );
            })}
        </div>
    );
}

export default function VitalSignsChart({ vitalSigns }) {
    const { user, updateProfile } = useAuth();
    
    // 1. Determine User ID synchronously from cache if possible
    const cachedUserId = useMemo(() => {
        try {
            const cache = localStorage.getItem('medterminal_user_cache');
            return cache ? JSON.parse(cache)?.id : null;
        } catch {
            // Ignore JSON parsing errors, return null
            return null;
        }
    }, []);

    const storageKey = useMemo(() => 
        (user?.id || cachedUserId) ? `${STORAGE_PREFIX}:${user?.id || cachedUserId}` : null
    , [user?.id, cachedUserId]);

    // 2. Synchronous initialization (avoids "flash" and race conditions)
    const [activeMetrics, setActiveMetrics] = useState(() => {
        if (storageKey) {
            try {
                const local = localStorage.getItem(storageKey);
                if (local) {
                    const parsed = JSON.parse(local);
                    if (Array.isArray(parsed)) return parsed;
                }
            } catch {
                // Ignore JSON parsing errors
            }
        }
        // Fallback to metadata from user object (if user prop is already available)
        const metadataPrefs = user?.user_metadata?.vital_signs_prefs;
        if (Array.isArray(metadataPrefs)) return metadataPrefs;
        
        return DEFAULT_ACTIVE_METRICS;
    });

    const [isInitialized, setIsInitialized] = useState(false);
    const hasToggledRef = useRef(false); // Track if user manually clicked buttons in this session
    const syncTimeoutRef = useRef(null);
    const lastSyncedRef = useRef(JSON.stringify(activeMetrics));
    const lastLocalChangeRef = useRef(null); // Track timestamp of recent local changes
    const syncRetryCountRef = useRef(0);
    const [prefsSyncState, setPrefsSyncState] = useState('idle');

    // 3. Handle Metadata Arrival / Sync from Other Devices
    useEffect(() => {
        if (!user?.id) return;
        
        const metadataPrefs = user.user_metadata?.vital_signs_prefs;
        if (Array.isArray(metadataPrefs)) {
            const metadataStr = JSON.stringify(metadataPrefs);
            const currentStr = JSON.stringify(activeMetrics);
            
            // Only take server version if no local change in-flight within past 2 seconds
            const now = Date.now();
            const hasRecentLocalChange = lastLocalChangeRef.current && (now - lastLocalChangeRef.current) < 2000;
            
            // If we haven't manually toggled ANYTHING, we should adopt the server's truth
            // or if we just initialized and our local cache was empty/stale
            if (!hasRecentLocalChange && !hasToggledRef.current && metadataStr !== currentStr) {
                setActiveMetrics(metadataPrefs);
                lastSyncedRef.current = metadataStr;
            }
        }
        setIsInitialized(true);
    }, [user?.id, user?.user_metadata?.vital_signs_prefs, activeMetrics]);

    // 4. Handle sync to Supabase (debounced)
    useEffect(() => {
        if (!user?.id || !isInitialized) return;

        const activeStr = JSON.stringify(activeMetrics);
        
        // Always save to localStorage immediately for the current device
        if (storageKey) {
            localStorage.setItem(storageKey, activeStr);
        }

        // Mark that a local change happened (for race condition protection)
        lastLocalChangeRef.current = Date.now();

        // Only sync to Supabase if the "human intent" (hasToggled) says so, 
        // OR if it's different from our last known sync state
        if (activeStr === lastSyncedRef.current) {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            return;
        }
        
        // Double check against current metadata to avoid redundant writes
        const serverPrefs = user.user_metadata?.vital_signs_prefs;
        if (Array.isArray(serverPrefs) && JSON.stringify(serverPrefs) === activeStr) {
            lastSyncedRef.current = activeStr;
            syncRetryCountRef.current = 0;
            setPrefsSyncState('synced');
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            return;
        }

        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        setPrefsSyncState('syncing');

        const maxSyncRetries = 4;
        const syncAttempt = async () => {
            try {
                await updateProfile({ vital_signs_prefs: activeMetrics });
                lastSyncedRef.current = activeStr;
                lastLocalChangeRef.current = null; // Clear the marker after successful sync
                syncRetryCountRef.current = 0;
                setPrefsSyncState('synced');
            } catch (err) {
                console.error('[VitalSignsChart] Sync failed:', err);
                const nextRetry = syncRetryCountRef.current + 1;
                syncRetryCountRef.current = nextRetry;

                if (nextRetry > maxSyncRetries) {
                    setPrefsSyncState('failed');
                    return;
                }

                setPrefsSyncState('retrying');
                const backoffMs = Math.min(2000 * (2 ** (nextRetry - 1)), 30000);
                syncTimeoutRef.current = setTimeout(syncAttempt, backoffMs);
            }
        };

        syncTimeoutRef.current = setTimeout(syncAttempt, 2000); // 2-second debounce

        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [activeMetrics, user?.id, user?.user_metadata?.vital_signs_prefs, isInitialized, updateProfile, storageKey]);

    const data = useMemo(() => {
        return [...(vitalSigns || [])]
            .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
            .map(vs => {
                const parts = (vs.bloodPressure || '').split('/');
                const systolic = parts[0] && !isNaN(Number(parts[0])) ? Number(parts[0]) : null;
                const diastolic = parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : null;
                return {
                    label: formatAxisDate(vs.recordedAt),
                    heartRate: vs.heartRate != null && vs.heartRate !== '' ? Number(vs.heartRate) : null,
                    systolic,
                    diastolic,
                    temperature: vs.temperature != null && vs.temperature !== '' ? Number(vs.temperature) : null,
                    respRate: vs.respRate != null && vs.respRate !== '' ? Number(vs.respRate) : null,
                    spO2: vs.spO2 != null && vs.spO2 !== '' ? Number(vs.spO2) : null,
                };
            });
    }, [vitalSigns]);

    const toggleMetric = (key) => {
        hasToggledRef.current = true; // User officially interacted, don't let server overwrite now
        setActiveMetrics(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    if (!vitalSigns || vitalSigns.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">show_chart</span>
                <p className="text-sm font-semibold text-slate-400">Butuh minimal 2 data untuk menampilkan tren</p>
                <p className="text-xs text-slate-400 mt-1">Tambahkan data vital signs di tab <strong className="text-primary">Vital</strong></p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Toggle buttons */}
            <div className="flex flex-wrap gap-1.5">
                {METRICS.map(m => (
                    <button
                        key={m.key}
                        type="button"
                        onClick={() => toggleMetric(m.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            activeMetrics.includes(m.key)
                                ? 'text-white border-transparent shadow-sm'
                                : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-600 opacity-60'
                        }`}
                        style={activeMetrics.includes(m.key) ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                        <span className="size-2 rounded-full inline-block shrink-0" style={{ backgroundColor: m.color }} />
                        {m.label}
                    </button>
                ))}
            </div>

            {prefsSyncState === 'retrying' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Sinkron preferensi vital sedang dicoba ulang.
                </p>
            )}
            {prefsSyncState === 'failed' && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                    Preferensi belum tersimpan ke server. Periksa koneksi, perubahan tetap aman di perangkat ini.
                </p>
            )}

            {/* Chart */}
            <ResponsiveContainer width="100%" height={260} minWidth={0}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {METRICS.filter(m => activeMetrics.includes(m.key)).map(m => (
                        <Line
                            key={m.key}
                            type="monotone"
                            dataKey={m.key}
                            stroke={m.color}
                            strokeWidth={2}
                            dot={{ r: 3, fill: m.color, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
