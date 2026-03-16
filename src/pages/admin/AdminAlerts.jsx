import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';

const statusOptions = ['open', 'ack', 'resolved', 'snoozed'];
const tabs = ['monitoring', 'broadcast'];

const BROADCAST_INITIAL_FORM = {
  title: '',
  message: '',
  level: 'info',
  channels: {
    in_app: true,
    telegram: true,
  },
  critical_override: false,
};

export default function AdminAlerts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [simulating, setSimulating] = useState(false);
  const [simulationKey, setSimulationKey] = useState(() => localStorage.getItem('medterminal_alert_sim_key') || '');
  const [keyTestResult, setKeyTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('monitoring');
  const [broadcastForm, setBroadcastForm] = useState(BROADCAST_INITIAL_FORM);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [resettingBroadcastHistory, setResettingBroadcastHistory] = useState(false);
  const [broadcastRows, setBroadcastRows] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [deliveryByCorrelation, setDeliveryByCorrelation] = useState({});
  const returnTo = location.state?.returnTo;
  const returnState = location.state?.returnState ?? null;
  const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

  const fetchRows = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('alert_events')
        .select('id, level, title, message, status, source, rule_key, created_at, updated_at, handled_by, handled_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      addToast('Gagal memuat alert: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (simulationKey) {
      localStorage.setItem('medterminal_alert_sim_key', simulationKey);
    } else {
      localStorage.removeItem('medterminal_alert_sim_key');
    }
  }, [simulationKey]);

  const fetchBroadcastRows = async () => {
    setBroadcastLoading(true);
    try {
      const { data, error } = await supabase
        .from('alert_events')
        .select('id, level, title, message, source, status, payload, created_at, updated_at')
        .eq('source', 'admin-broadcast')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = data || [];
      setBroadcastRows(rows);

      if (rows.length === 0) {
        setDeliveryByCorrelation({});
        return;
      }

      const sourceIds = rows.map((row) => String(row.id));
      const sourceCorrelationMap = new Map(
        rows.map((row) => [String(row.id), row.payload?.correlation_id || row.correlation_id || String(row.id)]),
      );

      const [queueRes, logsRes] = await Promise.all([
        supabase
          .from('notification_dispatch_queue')
          .select('source_id, status, payload')
          .eq('source_type', 'alert')
          .in('source_id', sourceIds)
          .limit(10000),
        supabase
          .from('notification_dispatch_logs')
          .select('source_id, status, payload')
          .eq('source_type', 'alert')
          .in('source_id', sourceIds)
          .limit(20000),
      ]);

      if (queueRes.error) throw queueRes.error;
      if (logsRes.error) throw logsRes.error;

      const makeCounts = () => ({
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        skipped_quiet_hours: 0,
        skipped_opt_out: 0,
        dead: 0,
      });

      const aggregates = {};
      const ensureCorr = (correlationId) => {
        if (!aggregates[correlationId]) {
          aggregates[correlationId] = {
            queue: makeCounts(),
            logs: makeCounts(),
          };
        }
        return aggregates[correlationId];
      };

      for (const item of queueRes.data || []) {
        const correlationId = item.payload?.correlation_id || sourceCorrelationMap.get(String(item.source_id)) || String(item.source_id);
        const corr = ensureCorr(correlationId);
        if (corr.queue[item.status] != null) corr.queue[item.status] += 1;
      }

      for (const item of logsRes.data || []) {
        const correlationId = item.payload?.correlation_id || sourceCorrelationMap.get(String(item.source_id)) || String(item.source_id);
        const corr = ensureCorr(correlationId);
        if (corr.logs[item.status] != null) corr.logs[item.status] += 1;
      }

      setDeliveryByCorrelation(aggregates);
    } catch (err) {
      addToast('Gagal memuat riwayat broadcast: ' + (err.message || ''), 'error');
    } finally {
      setBroadcastLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'broadcast') {
      fetchBroadcastRows();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('alert_events')
        .update({ status, handled_by: user?.id, handled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setRows(prev => prev.map(r => r.id === id ? { ...r, status, handled_by: user?.id, handled_at: new Date().toISOString() } : r));
      addToast('Status alert diperbarui.', 'success');
    } catch (_err) {
      addToast('Gagal mengubah status alert.', 'error');
    }
  };

  const runEvaluator = async () => {
    setSimulating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');

      const workerUrl = import.meta.env.VITE_NOTIFICATION_WORKER_URL;
      const url = workerUrl ? `${workerUrl}/run-alerts` : '/.netlify/functions/evaluate-alerts';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menjalankan evaluator');
      addToast(`Evaluator selesai. Opened: ${data.summary?.opened || 0}, Resolved: ${data.summary?.resolved || 0}`, 'success');
      fetchRows();
    } catch (err) {
      addToast(err.message || 'Evaluator gagal dijalankan', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const injectScenario = async (scenario) => {
    setSimulating(true);
    try {
      const res = await fetch('/.netlify/functions/inject-test-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(simulationKey ? { 'x-simulation-key': simulationKey } : {}),
        },
        body: JSON.stringify({ scenario, user_id: user?.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal inject data simulasi');
      addToast(`Simulasi ${scenario} berhasil.`, 'success');
    } catch (err) {
      addToast(err.message || 'Simulasi gagal', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const testSimulationKey = async () => {
    setSimulating(true);
    setKeyTestResult(null);
    try {
      const res = await fetch('/.netlify/functions/inject-test-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(simulationKey ? { 'x-simulation-key': simulationKey } : {}),
        },
        body: JSON.stringify({ scenario: 'ping' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data.error || 'Simulation key tidak valid.';
        setKeyTestResult({ ok: false, message: msg });
        addToast(msg, 'error');
        return;
      }
      setKeyTestResult({ ok: true, message: `Koneksi simulator OK${data.keyProtected ? ' (mode key-protected)' : ''}.` });
      addToast('Simulation key valid dan endpoint aktif.', 'success');
    } catch (err) {
      const msg = err.message || 'Gagal menguji simulation key.';
      setKeyTestResult({ ok: false, message: msg });
      addToast(msg, 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleBack = () => {
    if (hasReturnTarget) {
      navigate(returnTo, { state: returnState });
      return;
    }
    navigate('/admin');
  };

  const setBroadcastField = (key, value) => {
    setBroadcastForm(prev => ({ ...prev, [key]: value }));
  };

  const setBroadcastChannel = (channel, checked) => {
    setBroadcastForm(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: checked,
      },
      critical_override: channel === 'telegram' && !checked ? false : prev.critical_override,
    }));
  };

  const validateBroadcastForm = () => {
    if (!broadcastForm.title.trim()) {
      addToast('Judul broadcast wajib diisi.', 'error');
      return false;
    }
    if (!broadcastForm.message.trim()) {
      addToast('Isi pesan broadcast wajib diisi.', 'error');
      return false;
    }
    if (!broadcastForm.channels.in_app && !broadcastForm.channels.telegram) {
      addToast('Pilih minimal satu channel pengiriman.', 'error');
      return false;
    }
    return true;
  };

  const openConfirmSend = () => {
    if (!validateBroadcastForm()) return;
    setConfirmSendOpen(true);
  };

  const sendBroadcast = async () => {
    setSendingBroadcast(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');

      const workerUrl = import.meta.env.VITE_NOTIFICATION_WORKER_URL;
      const url = workerUrl ? `${workerUrl}/create-broadcast` : '/.netlify/functions/create-admin-broadcast';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: broadcastForm.title.trim(),
          message: broadcastForm.message.trim(),
          level: broadcastForm.level,
          channels: broadcastForm.channels,
          critical_override: broadcastForm.level === 'critical' ? broadcastForm.critical_override : false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengirim broadcast');

      const channelsLabel = [
        broadcastForm.channels.in_app ? 'in-app' : null,
        broadcastForm.channels.telegram ? 'Telegram' : null,
      ].filter(Boolean).join(' + ');

      addToast(`Broadcast berhasil dikirim (${channelsLabel}).`, 'success');
      setBroadcastForm(BROADCAST_INITIAL_FORM);
      setConfirmSendOpen(false);
      fetchBroadcastRows();
      fetchRows();
    } catch (err) {
      addToast(err.message || 'Gagal mengirim broadcast', 'error');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const resetBroadcastHistory = async () => {
    setResettingBroadcastHistory(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');

      const workerUrl = import.meta.env.VITE_NOTIFICATION_WORKER_URL;
      const url = workerUrl ? `${workerUrl}/reset-broadcast-history` : '/.netlify/functions/reset-broadcast-history';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal reset riwayat broadcast');

      setBroadcastRows([]);
      setDeliveryByCorrelation({});
      setConfirmResetOpen(false);
      addToast(`Riwayat broadcast berhasil direset. Total alert terhapus: ${data.deletedCount || data.deleted_alerts || 0}.`, 'success');
      fetchRows();
      fetchBroadcastRows();
    } catch (err) {
      addToast(err.message || 'Gagal reset riwayat broadcast', 'error');
    } finally {
      setResettingBroadcastHistory(false);
    }
  };

  const levelStyle = (level) => {
    if (level === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (level === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  };

  const telegramPreview = [
    `${broadcastForm.level === 'critical' ? '🚨' : broadcastForm.level === 'warning' ? '⚠️' : 'ℹ️'} Pengumuman Admin`,
    broadcastForm.title || 'Judul broadcast',
    broadcastForm.message || 'Isi broadcast akan tampil di sini.',
  ].join('\n\n');

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8 max-w-6xl animate-[fadeIn_0.3s_ease-out]">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        {hasReturnTarget ? 'Kembali ke Dashboard Admin' : 'Dashboard Admin'}
      </button>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Alert Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Monitor alert realtime dan kirim broadcast pemberitahuan ke seluruh pengguna.</p>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === tab
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab === 'monitoring' ? 'Monitoring' : 'Broadcast'}
          </button>
        ))}
      </div>

      {activeTab === 'monitoring' && (
        <>
          <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="all">Semua</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={fetchRows} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold">Refresh</button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <h2 className="text-sm font-bold mb-3">Simulator Alert (Testing)</h2>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Simulation Key (opsional, sesuai env ALERT_SIMULATION_KEY)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={simulationKey}
                  onChange={(e) => setSimulationKey(e.target.value)}
                  placeholder="Kosongkan jika simulator tidak diproteksi"
                  className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
                <button
                  disabled={simulating}
                  onClick={testSimulationKey}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-50"
                >
                  Uji Key
                </button>
              </div>
              {keyTestResult && (
                <p className={`mt-1 text-xs ${keyTestResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {keyTestResult.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={simulating} onClick={() => injectScenario('high_error_rate')} className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-semibold disabled:opacity-50">Simulasi Error Rate Tinggi</button>
              <button disabled={simulating} onClick={() => injectScenario('high_latency')} className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold disabled:opacity-50">Simulasi Latency Tinggi</button>
              <button disabled={simulating} onClick={() => injectScenario('normal')} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold disabled:opacity-50">Simulasi Kondisi Normal</button>
              <button disabled={simulating} onClick={runEvaluator} className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">Jalankan Evaluator</button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span></div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">Tidak ada alert pada filter ini.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <div key={row.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${levelStyle(row.level)}`}>{row.level}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{row.status}</span>
                          {row.rule_key && <span className="text-[10px] font-mono text-slate-400">{row.rule_key}</span>}
                        </div>
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{row.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.message}</p>
                        <p className="text-[11px] text-slate-400 mt-2">{new Date(row.created_at).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateStatus(row.id, 'ack')} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-blue-50 text-blue-700">Ack</button>
                        <button onClick={() => updateStatus(row.id, 'snoozed')} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-amber-50 text-amber-700">Snooze</button>
                        <button onClick={() => updateStatus(row.id, 'resolved')} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-emerald-50 text-emerald-700">Resolve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'broadcast' && (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Kirim Broadcast ke Semua User</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gunakan untuk maintenance, gangguan sistem, atau update penting. V1: kirim langsung tanpa scheduling.</p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Audience: Semua User</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Judul Broadcast</label>
                <input
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastField('title', e.target.value)}
                  maxLength={120}
                  placeholder="Contoh: Maintenance Sistem Pukul 23:00 WIB"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Level</label>
                <select
                  value={broadcastForm.level}
                  onChange={(e) => setBroadcastField('level', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Isi Pesan</label>
              <textarea
                rows={4}
                value={broadcastForm.message}
                onChange={(e) => setBroadcastField('message', e.target.value)}
                maxLength={2000}
                placeholder="Tuliskan konteks masalah, dampak ke user, dan estimasi selesai jika ada."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-2">Channel Pengiriman</p>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={broadcastForm.channels.in_app}
                      onChange={(e) => setBroadcastChannel('in_app', e.target.checked)}
                    />
                    In-app banner realtime
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={broadcastForm.channels.telegram}
                      onChange={(e) => setBroadcastChannel('telegram', e.target.checked)}
                    />
                    Telegram notification
                  </label>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Emergency Override</p>
                {broadcastForm.level === 'critical' && broadcastForm.channels.telegram ? (
                  <label className="inline-flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={broadcastForm.critical_override}
                      onChange={(e) => setBroadcastField('critical_override', e.target.checked)}
                    />
                    <span>
                      Kirim Telegram meski user menonaktifkan alert (hanya untuk kondisi darurat).
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Override hanya tersedia saat level Critical dan channel Telegram aktif.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-800/30">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">Preview In-App Banner</p>
                <div className={`rounded-lg px-3 py-2 text-xs ${broadcastForm.level === 'critical' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : broadcastForm.level === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'}`}>
                  <span className="font-bold mr-2">{broadcastForm.title || 'Judul broadcast'}</span>
                  <span>{broadcastForm.message || 'Isi broadcast akan tampil di banner user.'}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-800/30">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">Preview Telegram</p>
                <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{telegramPreview}</pre>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                disabled={sendingBroadcast}
                onClick={openConfirmSend}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60"
              >
                {sendingBroadcast ? 'Mengirim...' : 'Kirim Broadcast'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold">Riwayat Broadcast</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={resettingBroadcastHistory || broadcastRows.length === 0}
                  className="text-xs font-semibold text-red-600 disabled:text-slate-400"
                >
                  Reset Riwayat
                </button>
                <button onClick={fetchBroadcastRows} className="text-xs font-semibold text-primary">Refresh</button>
              </div>
            </div>

            {broadcastLoading ? (
              <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span></div>
            ) : broadcastRows.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">Belum ada broadcast admin.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {broadcastRows.map((row) => {
                  const channels = row.payload?.channels || {};
                  const correlation = row.payload?.correlation_id || row.correlation_id || '-';
                  const delivery = deliveryByCorrelation[correlation];
                  const queue = delivery?.queue || null;
                  const logs = delivery?.logs || null;
                  const queueQueued = queue ? queue.pending + queue.processing : 0;
                  const queueFailed = queue ? queue.failed + queue.dead : 0;
                  const queueSkipped = queue ? queue.skipped_opt_out + queue.skipped_quiet_hours : 0;
                  return (
                    <div key={row.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${levelStyle(row.level)}`}>{row.level}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{row.status}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{channels.in_app ? 'in-app' : 'no in-app'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{channels.telegram ? 'telegram' : 'no telegram'}</span>
                          </div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{row.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.message}</p>
                          <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                            <p>{new Date(row.created_at).toLocaleString('id-ID')}</p>
                            <p>Correlation ID: {correlation}</p>
                          </div>

                          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Delivery Summary</p>
                            {queue ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Queued {queueQueued}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Sent {queue.sent}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Failed {queueFailed}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Skipped {queueSkipped}</span>
                              </div>
                            ) : (
                              <p className="mt-1 text-[11px] text-slate-400">Belum ada data queue untuk correlation ini.</p>
                            )}

                            {logs && (
                              <p className="mt-2 text-[11px] text-slate-400">
                                Log events: sent {logs.sent}, failed {logs.failed + logs.dead}, skipped {logs.skipped_opt_out + logs.skipped_quiet_hours}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmSendOpen}
        danger={broadcastForm.level === 'critical'}
        title="Konfirmasi Kirim Broadcast"
        message={`Broadcast akan dikirim ke semua user melalui ${[broadcastForm.channels.in_app ? 'In-app' : null, broadcastForm.channels.telegram ? 'Telegram' : null].filter(Boolean).join(' + ')}.${broadcastForm.level === 'critical' && broadcastForm.critical_override ? ' Mode emergency override Telegram aktif.' : ''}`}
        confirmLabel={sendingBroadcast ? 'Mengirim...' : 'Ya, Kirim Sekarang'}
        cancelLabel="Batal"
        requireTypedConfirmation="KIRIM"
        onCancel={() => {
          if (!sendingBroadcast) setConfirmSendOpen(false);
        }}
        onConfirm={sendBroadcast}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        danger
        title="Reset Riwayat Broadcast"
        message="Semua log pada Riwayat Broadcast akan dihapus permanen, termasuk data delivery queue/log terkait. Aksi ini tidak bisa dibatalkan."
        confirmLabel={resettingBroadcastHistory ? 'Mereset...' : 'Ya, Reset Riwayat'}
        cancelLabel="Batal"
        requireTypedConfirmation="RESET"
        onCancel={() => {
          if (!resettingBroadcastHistory) setConfirmResetOpen(false);
        }}
        onConfirm={resetBroadcastHistory}
      />
    </div>
  );
}
