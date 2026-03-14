import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const statusOptions = ['open', 'ack', 'resolved', 'snoozed'];

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

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('alert_events')
        .update({ status, handled_by: user?.id, handled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setRows(prev => prev.map(r => r.id === id ? { ...r, status, handled_by: user?.id, handled_at: new Date().toISOString() } : r));
      addToast('Status alert diperbarui.', 'success');
    } catch (err) {
      addToast('Gagal mengubah status alert.', 'error');
    }
  };

  const levelStyle = (level) => {
    if (level === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (level === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  };

  const runEvaluator = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/.netlify/functions/evaluate-alerts');
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Monitor alert realtime dan kelola tindak lanjut insiden.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
            <option value="all">Semua</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchRows} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold">Refresh</button>
        </div>
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
    </div>
  );
}
