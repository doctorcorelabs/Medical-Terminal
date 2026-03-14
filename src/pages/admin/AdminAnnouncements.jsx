import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  title: '',
  message: '',
  level: 'info',
  target: 'all',
  active: true,
  start_at: '',
  end_at: '',
};

export default function AdminAnnouncements() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const returnTo = location.state?.returnTo;
  const returnState = location.state?.returnState ?? null;
  const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_announcements')
        .select('id, title, message, level, target, active, start_at, end_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      addToast('Gagal memuat pengumuman: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      addToast('Judul dan isi pengumuman wajib diisi.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        created_by: user?.id,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      };

      const { error } = await supabase.from('admin_announcements').insert(payload);
      if (error) throw error;

      addToast('Pengumuman berhasil dipublikasikan.', 'success');
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      addToast('Gagal menyimpan pengumuman: ' + (err.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (id, active) => {
    try {
      const { error } = await supabase
        .from('admin_announcements')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === id ? { ...i, active } : i));
      addToast(active ? 'Pengumuman diaktifkan.' : 'Pengumuman dinonaktifkan.', 'success');
    } catch (_err) {
      addToast('Gagal mengubah status pengumuman.', 'error');
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
    <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8 max-w-5xl animate-[fadeIn_0.3s_ease-out]">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        {hasReturnTarget ? 'Kembali ke Dashboard Admin' : 'Dashboard Admin'}
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Pengumuman Global</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Banner informasi yang ditampilkan ke seluruh pengguna.</p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Judul</label>
            <input
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              placeholder="Contoh: Maintenance Terjadwal"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold mb-1.5">Level</label>
              <select value={form.level} onChange={(e) => setForm(prev => ({ ...prev, level: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Target</label>
              <select value={form.target} onChange={(e) => setForm(prev => ({ ...prev, target: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                <option value="all">Semua</option>
                <option value="non_admin">Non-admin</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">Isi Pesan</label>
          <textarea
            rows={3}
            value={form.message}
            onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            placeholder="Contoh: Fitur Fornas akan maintenance pukul 23:00 - 23:30 WIB."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Mulai (opsional)</label>
            <input type="datetime-local" value={form.start_at} onChange={(e) => setForm(prev => ({ ...prev, start_at: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Berakhir (opsional)</label>
            <input type="datetime-local" value={form.end_at} onChange={(e) => setForm(prev => ({ ...prev, end_at: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))} />
              Aktifkan langsung
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Publikasikan'}
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold">Riwayat Pengumuman</h2>
          <button onClick={fetchData} className="text-xs font-semibold text-primary">Refresh</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Belum ada pengumuman.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.level === 'critical' ? 'bg-red-100 text-red-700' : item.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{item.level}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.target}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{new Date(item.created_at).toLocaleString('id-ID')}</p>
                  </div>
                  <button onClick={() => setActive(item.id, !item.active)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${item.active ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {item.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
