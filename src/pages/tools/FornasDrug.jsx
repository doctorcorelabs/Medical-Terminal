import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const PAGE_SIZE = 50;
const TABLE = 'fornas_drugs';

// ── Flag config ───────────────────────────────────────────────────────────────
const FLAGS = [
  { key: 'flag_oen',     label: 'OEN',    title: 'Obat Esensial Nasional',           color: 'emerald' },
  { key: 'flag_fpktl',   label: 'FKRTL',  title: 'Formularium Tingkat Lanjutan',     color: 'blue'    },
  { key: 'flag_fpktp',   label: 'FKTP',   title: 'Formularium Tingkat Pertama',      color: 'cyan'    },
  { key: 'flag_prb',     label: 'PRB',    title: 'Program Rujuk Balik',              color: 'violet'  },
  { key: 'flag_pp',      label: 'PP',     title: 'Program Pemerintah',               color: 'amber'   },
  { key: 'flag_program', label: 'Program',title: 'Termasuk Dalam Program Kemenkes',  color: 'orange'  },
  { key: 'flag_kanker',  label: 'Onko',   title: 'Obat Kanker / Onkologi',           color: 'rose'    },
];

const FLAG_COLORS = {
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  blue:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  cyan:    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  violet:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  amber:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  orange:  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  rose:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function highlight(text, query) {
  if (!query || !text) return text ?? '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-yellow-900 dark:text-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}

function FlagBadge({ flagKey, small = false }) {
  const f = FLAGS.find(x => x.key === flagKey);
  if (!f) return null;
  return (
    <span
      title={f.title}
      className={`inline-flex items-center rounded-full font-medium ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} ${FLAG_COLORS[f.color]}`}
    >
      {f.label}
    </span>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ drug, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!drug) return null;

  const activeFlags = FLAGS.filter(f => drug[f.key] === true);
  const restrictions = [
    drug.restriction_drug,
    drug.restriction_form,
    drug.restriction_note_l1,
    drug.restriction_note_l2,
    drug.restriction_note_l3,
    drug.restriction_note_l4,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Formularium Nasional</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight capitalize">
              {drug.name?.toLowerCase()}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 italic mt-0.5">{drug.name_international}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Sediaan & Kekuatan */}
          <Section title="Sediaan" icon="medication">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bentuk Sediaan"  value={drug.form} />
              <Field label="Kode Sediaan"    value={drug.form_code} mono />
              <Field label="Kekuatan"        value={drug.strength ? `${drug.strength} ${drug.unit ?? ''}`.trim() : null} />
              <Field label="Kode Satuan"     value={drug.unit_code} mono />
            </div>
          </Section>

          {/* Kelas Terapi */}
          <Section title="Klasifikasi Terapi" icon="category">
            <div className="space-y-1.5">
              {drug.category_l1 && <TierRow tier={1} value={drug.category_l1} />}
              {drug.category_l2 && <TierRow tier={2} value={drug.category_l2} />}
              {drug.category_l3 && <TierRow tier={3} value={drug.category_l3} />}
              {drug.category_l4 && <TierRow tier={4} value={drug.category_l4} />}
              {!drug.category_l1 && <p className="text-sm text-slate-400">Tidak ada data klasifikasi</p>}
            </div>
          </Section>

          {/* Flags */}
          {activeFlags.length > 0 && (
            <Section title="Program & Formularium" icon="verified">
              <div className="flex flex-wrap gap-2">
                {activeFlags.map(f => (
                  <span key={f.key} title={f.title} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${FLAG_COLORS[f.color]}`}>
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    {f.title}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Restriksi */}
          {restrictions.length > 0 && (
            <Section title="Ketentuan & Restriksi" icon="gavel">
              <div className="space-y-1.5">
                {drug.restriction_drug && (
                  <div className="text-sm">
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-medium block mb-0.5">Restriksi Obat</span>
                    <span className="text-slate-700 dark:text-slate-300">{drug.restriction_drug}</span>
                  </div>
                )}
                {drug.restriction_form && (
                  <div className="text-sm">
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-medium block mb-0.5">Restriksi Sediaan</span>
                    <span className="text-slate-700 dark:text-slate-300">{drug.restriction_form}</span>
                  </div>
                )}
                {[drug.restriction_note_l1, drug.restriction_note_l2, drug.restriction_note_l3, drug.restriction_note_l4]
                  .filter(Boolean)
                  .map((note, i) => (
                    <div key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                      <span className="material-symbols-outlined text-amber-500 text-base shrink-0 mt-0.5">info</span>
                      {note}
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {/* Maks Resep */}
          {drug.max_prescription && (
            <Section title="Peresepan Maksimal" icon="event_repeat">
              <p className="text-sm text-slate-700 dark:text-slate-300">{drug.max_prescription}</p>
            </Section>
          )}

          {/* Komposisi */}
          {drug.komposisi && (
            <Section title="Komposisi" icon="science">
              <p className="text-sm text-slate-700 dark:text-slate-300">{drug.komposisi}</p>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Sumber: e-fornas.kemkes.go.id</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }) {
  if (value == null || value === '') return (
    <div>
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-300 dark:text-slate-600 italic">—</p>
    </div>
  );
  return (
    <div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm text-slate-700 dark:text-slate-300 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function TierRow({ tier, value }) {
  const indent = (tier - 1) * 14;
  const colors = ['text-slate-900 dark:text-slate-100 font-semibold', 'text-slate-700 dark:text-slate-300', 'text-slate-600 dark:text-slate-400', 'text-slate-500 dark:text-slate-500'];
  return (
    <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
      {tier > 1 && <span className="text-slate-300 dark:text-slate-600 text-sm">└</span>}
      <span className={`text-sm ${colors[tier - 1]}`}>{value}</span>
    </div>
  );
}

// ── Row Component ─────────────────────────────────────────────────────────────
function DrugRow({ drug, query, onClick }) {
  const activeFlags = FLAGS.filter(f => drug[f.key] === true);

  return (
    <div
      onClick={() => onClick(drug)}
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1 sm:gap-0 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition cursor-pointer group items-start"
    >
      {/* Left: name + meta */}
      <div className="min-w-0">
        {/* Name */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm capitalize leading-snug">
            {highlight(drug.name?.toLowerCase(), query?.toLowerCase())}
          </span>
          {drug.name_international && drug.name_international.toLowerCase() !== drug.name?.toLowerCase() && (
            <span className="text-xs text-slate-400 dark:text-slate-500 italic">
              {highlight(drug.name_international, query)}
            </span>
          )}
        </div>

        {/* Sediaan label */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {highlight(drug.label ?? `${drug.form ?? ''} ${drug.strength ?? ''} ${drug.unit ?? ''}`.trim(), query)}
        </p>

        {/* Category breadcrumb */}
        {drug.category_l1 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-none">
            {[drug.category_l1, drug.category_l2].filter(Boolean).join(' › ')}
          </p>
        )}

        {/* Flags (mobile: inline with meta) */}
        {activeFlags.length > 0 && (
          <div className="flex sm:hidden items-center gap-1 mt-1.5 flex-wrap">
            {activeFlags.map(f => <FlagBadge key={f.key} flagKey={f.key} small />)}
          </div>
        )}
      </div>

      {/* Right: flags + chevron (desktop) */}
      <div className="hidden sm:flex items-center gap-2 pl-3">
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {activeFlags.slice(0, 4).map(f => <FlagBadge key={f.key} flagKey={f.key} small />)}
          {activeFlags.length > 4 && (
            <span className="text-[10px] text-slate-400">+{activeFlags.length - 4}</span>
          )}
        </div>
        <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary transition text-lg ml-1">
          chevron_right
        </span>
      </div>
    </div>
  );
}

// ── Filter Chip ───────────────────────────────────────────────────────────────
function Chip({ active, onClick, children, color }) {
  const base = 'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap cursor-pointer select-none border';
  const activeStyle = color
    ? `${FLAG_COLORS[color]} border-transparent`
    : 'bg-primary text-white border-transparent';
  const inactiveStyle = 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-primary';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeStyle : inactiveStyle}`}>
      {children}
    </button>
  );
}

// ── Info Modal helpers ──────────────────────────────────────────────────────
const INFO_FLAGS = [
  {
    badge: 'OEN', color: 'emerald',
    full: 'Obat Esensial Nasional',
    desc: 'Obat yang memenuhi kebutuhan prioritas kesehatan penduduk. Dipilih berdasarkan prevalensi penyakit, bukti klinis, keamanan, dan efektivitas biaya.',
  },
  {
    badge: 'FKRTL', color: 'blue',
    full: 'Formularium Kefarmasian Faskes Rujukan Tingkat Lanjutan',
    desc: 'Daftar obat yang digunakan di fasilitas kesehatan tingkat lanjutan (RS kelas A/B/C/D) dalam program JKN.',
  },
  {
    badge: 'FKTP', color: 'cyan',
    full: 'Formularium Kefarmasian Faskes Tingkat Pertama',
    desc: 'Daftar obat yang digunakan di fasilitas kesehatan tingkat pertama (puskesmas, klinik pratama, dokter praktik mandiri) dalam program JKN.',
  },
  {
    badge: 'PRB', color: 'violet',
    full: 'Program Rujuk Balik',
    desc: 'Obat untuk pasien penyakit kronis (DM, hipertensi, jantung, asma, PPOK, dll.) yang kondisinya sudah stabil dan dapat dilayani di FKTP.',
  },
  {
    badge: 'PP', color: 'amber',
    full: 'Program Pemerintah',
    desc: 'Obat yang disediakan pemerintah untuk program kesehatan khusus seperti TB, HIV/AIDS, Malaria, dan imunisasi nasional.',
  },
  {
    badge: 'Program', color: 'orange',
    full: 'Termasuk Dalam Program Kemenkes',
    desc: 'Obat yang masuk dalam program-program khusus Kementerian Kesehatan RI di luar program utama JKN.',
  },
  {
    badge: 'Onko', color: 'rose',
    full: 'Obat Kanker / Onkologi',
    desc: 'Obat untuk terapi keganasan (kanker). Umumnya hanya tersedia di fasilitas onkologi dan memerlukan persetujuan komite medis.',
  },
];

function InfoSection({ icon, title, iconColor, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function GuideStep({ n, icon, title, desc }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="material-symbols-outlined text-[13px] text-slate-400">{icon}</span>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function RestrictItem({ title, desc }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/20 rounded-lg px-3 py-2.5">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">{title}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function InfoModal({ onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-lg lg:max-w-xl bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-teal-100 dark:bg-teal-900/40 rounded-lg p-1.5 shrink-0">
              <span className="material-symbols-outlined text-teal-600 dark:text-teal-400 text-lg">menu_book</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">Panduan Obat Fornas</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Petunjuk penggunaan &amp; keterangan istilah</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">

          {/* Tentang */}
          <InfoSection icon="info" title="Tentang Fitur Ini" iconColor="text-teal-500">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
              <strong className="text-slate-800 dark:text-slate-100">Obat Fornas</strong> menampilkan data lengkap{' '}
              <strong>Formularium Nasional (Fornas)</strong> Kementerian Kesehatan RI—daftar resmi obat yang dapat
              diresepkan dalam program <strong>JKN (Jaminan Kesehatan Nasional)</strong>.
            </p>
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800/30 rounded-xl px-4 py-3 flex gap-2.5 items-start">
              <span className="material-symbols-outlined text-teal-500 text-base shrink-0 mt-0.5">verified</span>
              <p className="text-xs text-teal-700 dark:text-teal-300 leading-relaxed">
                Data bersumber dari <strong>e-fornas.kemkes.go.id</strong>. Mencakup lebih dari 1.140 sediaan obat
                beserta klasifikasi terapi, program formularium, dan ketentuan peresepannya.
              </p>
            </div>
          </InfoSection>

          {/* Cara Penggunaan */}
          <InfoSection icon="touch_app" title="Cara Penggunaan" iconColor="text-blue-500">
            <div className="space-y-3">
              <GuideStep
                n="1" icon="search" title="Pencarian Bebas"
                desc='Ketik nama obat generik atau nama internasional, bentuk sediaan, atau kelas terapi. Contoh: “amlodipin”, “tablet”, “antihipertensi”.'
              />
              <GuideStep
                n="2" icon="filter_list" title="Filter Program & Formularium"
                desc="Klik chip OEN, FKRTL, FKTP, PRB, PP, Program, atau Onko untuk menyaring obat berdasarkan program tertentu. Klik sekali lagi untuk membatalkan filter."
              />
              <GuideStep
                n="3" icon="medication" title="Filter Bentuk Sediaan"
                desc="Gunakan baris Sediaan untuk memfilter berdasarkan bentuk fisik obat: Tablet, Kapsul, Injeksi, Sirup, Salep, dan lainnya."
              />
              <GuideStep
                n="4" icon="open_in_new" title="Lihat Detail Obat"
                desc="Klik baris obat untuk melihat detail lengkap: klasifikasi terapi 4-tingkat, program aktif, restriksi peresepan, komposisi, dan peresepan maksimal."
              />
            </div>
          </InfoSection>

          {/* Keterangan Singkatan */}
          <InfoSection icon="label" title="Keterangan Singkatan" iconColor="text-violet-500">
            <div className="space-y-3">
              {INFO_FLAGS.map(f => (
                <div key={f.badge} className="flex gap-3 items-start">
                  <span className={`mt-0.5 shrink-0 inline-flex items-center justify-center rounded-full font-semibold text-[11px] px-2 py-1 min-w-14 text-center ${FLAG_COLORS[f.color]}`}>
                    {f.badge}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">{f.full}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </InfoSection>

          {/* Klasifikasi Terapi */}
          <InfoSection icon="category" title="Klasifikasi Kelas Terapi" iconColor="text-orange-500">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Setiap obat diklasifikasikan dalam hierarki hingga <strong className="text-slate-600 dark:text-slate-300">4 tingkat</strong> berdasarkan
              sistem kelas terapi Kemenkes RI:
            </p>
            <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2">
              {[
                { tier: 1, label: 'Kelas Terapi Utama',       ex: 'ANTIINFEKSI' },
                { tier: 2, label: 'Sub Kelas Terapi',          ex: 'ANTIBAKTERI' },
                { tier: 3, label: 'Sub-Sub Kelas Terapi',      ex: 'PENISILIN' },
                { tier: 4, label: 'Sub-Sub-Sub Kelas Terapi',  ex: 'AMINOPENISILIN' },
              ].map(({ tier, label, ex }) => (
                <div key={tier} className="flex items-center gap-2" style={{ paddingLeft: (tier - 1) * 16 }}>
                  {tier > 1 && <span className="text-slate-300 dark:text-slate-600 text-sm shrink-0">└</span>}
                  <span className="text-[11px] font-mono font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600/50 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded shrink-0">
                    {ex}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </InfoSection>

          {/* Restriksi */}
          <InfoSection icon="gavel" title="Restriksi & Ketentuan Peresepan" iconColor="text-amber-500">
            <div className="space-y-2">
              <RestrictItem
                title="Restriksi Obat"
                desc="Pembatasan penggunaan berdasarkan kondisi klinis atau diagnosis tertentu yang berlaku untuk semua sediaan obat tersebut."
              />
              <RestrictItem
                title="Restriksi Sediaan"
                desc="Pembatasan khusus untuk bentuk sediaan tertentu. Contoh: sediaan injeksi hanya dapat digunakan pada pasien rawat inap."
              />
              <RestrictItem
                title="Catatan Ketentuan (1–4)"
                desc="Keterangan tambahan terkait durasi terapi, persyaratan klinis lanjutan, atau kondisi khusus yang harus dipenuhi sebelum peresepan."
              />
              <RestrictItem
                title="Peresepan Maksimal"
                desc="Batas maksimum jumlah obat yang dapat diresepkan dalam satu kali kunjungan atau per periode terapi yang ditetapkan."
              />
            </div>
          </InfoSection>

          {/* Sumber Data */}
          <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex gap-3">
            <span className="material-symbols-outlined text-slate-400 text-lg shrink-0 mt-0.5">database</span>
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Sumber Data</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Data diambil dari API resmi{' '}
                <strong className="text-slate-600 dark:text-slate-300">e-fornas.kemkes.go.id</strong>{' '}
                dan disimpan di basis data aplikasi untuk akses lebih cepat. Pembaruan data dilakukan secara
                berkala mengikuti revisi Fornas terbaru dari Kemenkes RI.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 shrink-0 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">e-fornas.kemkes.go.id · Kemenkes RI</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FornasDrug() {
  const navigate = useNavigate();

  // Data
  const [allData, setAllData]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [query, setQuery]           = useState('');
  const [debouncedQuery, setDbouncedQuery] = useState('');
  const [activeFlag, setActiveFlag] = useState(null);   // null = all
  const [activeForm, setActiveForm] = useState('');     // '' = all

  // Pagination
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Detail modal
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [showInfo, setShowInfo]         = useState(false);

  const debounceRef = useRef(null);

  // ── Load all data once (table is ~1140 rows, small enough) ──────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch in pages of 1000 to handle Supabase's default 1000-row limit
    async function fetchAll() {
      let all = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error: err } = await supabase
          .from(TABLE)
          .select('id,source_id,sks_id,name,name_international,label,form_code,form,strength,unit_code,unit,category_l1,category_l2,category_l3,category_l4,restriction_drug,restriction_form,restriction_note_l1,restriction_note_l2,restriction_note_l3,restriction_note_l4,max_prescription,komposisi,flag_fpktl,flag_fpktp,flag_pp,flag_prb,flag_oen,flag_program,flag_kanker')
          .order('name')
          .range(from, from + step - 1);
        if (err) throw new Error(err.message);
        all = all.concat(data ?? []);
        if (!data || data.length < step) break;
        from += step;
      }
      return all;
    }

    fetchAll()
      .then(data => {
        setAllData(data);
        setTotalCount(data.length);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDbouncedQuery(query);
      setDisplayCount(PAGE_SIZE);
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Reset pagination when filters change
  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [activeFlag, activeForm]);

  // ── Derived: unique forms for filter bar ────────────────────────────────────
  const allForms = [...new Set(allData.map(d => d.form).filter(Boolean))].sort();

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = allData.filter(drug => {
    if (activeFlag && !drug[activeFlag]) return false;
    if (activeForm && drug.form !== activeForm) return false;
    if (!debouncedQuery.trim()) return true;
    const q = debouncedQuery.toLowerCase();
    return (
      drug.name?.toLowerCase().includes(q) ||
      drug.name_international?.toLowerCase().includes(q) ||
      drug.label?.toLowerCase().includes(q) ||
      drug.category_l1?.toLowerCase().includes(q) ||
      drug.category_l2?.toLowerCase().includes(q) ||
      drug.category_l3?.toLowerCase().includes(q) ||
      drug.form?.toLowerCase().includes(q)
    );
  });

  const visible  = filtered.slice(0, displayCount);
  const hasMore  = displayCount < filtered.length;

  const handleCardClick = useCallback(drug => setSelectedDrug(drug), []);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* ── Breadcrumb + Header ── */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/tools')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-teal-100 dark:bg-teal-900/30 rounded-xl p-2.5 shrink-0">
              <span className="material-symbols-outlined text-teal-600 dark:text-teal-400 text-2xl">local_pharmacy</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Obat Fornas</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Formularium Nasional Kemenkes RI</p>
            </div>
          </div>
          <div className="self-start sm:self-center sm:ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInfo(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-500 dark:hover:text-teal-400 transition"
            >
              <span className="material-symbols-outlined text-[14px]">menu_book</span>
              <span>Panduan</span>
            </button>
            <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-3 py-1 rounded-full font-medium">
              e-Fornas Kemkes RI
            </span>
          </div>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="relative mb-3">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">search</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari nama obat, sediaan, atau kelas terapi..."
          className="w-full pl-11 pr-10 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        )}
      </div>

      {/* ── Filter bar: flags ── */}
      {!loading && !error && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-2 scrollbar-hide">
          <Chip active={activeFlag === null && !activeForm} onClick={() => { setActiveFlag(null); setActiveForm(''); }}>
            <span className="material-symbols-outlined text-[13px]">apps</span>
            Semua
          </Chip>
          {FLAGS.map(f => (
            <Chip
              key={f.key}
              active={activeFlag === f.key}
              color={f.color}
              onClick={() => setActiveFlag(prev => prev === f.key ? null : f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      )}

      {/* ── Filter bar: form (sediaan) ── */}
      {!loading && !error && allForms.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          <span className="text-[11px] text-slate-400 shrink-0">Sediaan:</span>
          {['', ...allForms.slice(0, 12)].map(form => (
            <Chip
              key={form}
              active={activeForm === form}
              onClick={() => setActiveForm(prev => prev === form ? '' : form)}
            >
              {form === '' ? 'Semua' : form}
            </Chip>
          ))}
        </div>
      )}

      {/* ── Stats bar ── */}
      {!loading && !error && (
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">database</span>
            {totalCount.toLocaleString()} sediaan
          </span>
          {(debouncedQuery || activeFlag || activeForm) && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <span className="material-symbols-outlined text-sm">filter_list</span>
              {filtered.length.toLocaleString()} hasil
            </span>
          )}
          {(activeFlag || activeForm) && (
            <button
              onClick={() => { setActiveFlag(null); setActiveForm(''); setQuery(''); }}
              className="flex items-center gap-1 text-slate-400 hover:text-red-500 transition ml-auto"
            >
              <span className="material-symbols-outlined text-sm">filter_list_off</span>
              Reset filter
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
          ))}
          <p className="text-center text-sm text-slate-400 mt-4">Memuat data Fornas...</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <span className="material-symbols-outlined text-4xl text-red-400">error_outline</span>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Gagal memuat data Fornas</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <span className="material-symbols-outlined text-5xl mb-3">medication_liquid</span>
              <p className="text-sm font-medium">
                {debouncedQuery ? `Tidak ditemukan untuk "${debouncedQuery}"` : 'Tidak ada hasil untuk filter ini'}
              </p>
              <p className="text-xs mt-1">Coba kata kunci atau filter yang berbeda</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
              {/* Table header — desktop */}
              <div className="hidden sm:grid grid-cols-[1fr_auto] gap-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-2.5">
                <span>Nama Obat &amp; Sediaan</span>
                <span className="text-right pr-6">Program / Formularium</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {visible.map(drug => (
                  <DrugRow
                    key={drug.sks_id ?? drug.id}
                    drug={drug}
                    query={debouncedQuery}
                    onClick={handleCardClick}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-400">
                    Menampilkan {visible.length} dari {filtered.length.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition"
                  >
                    <span className="material-symbols-outlined text-sm">expand_more</span>
                    Tampilkan lebih banyak
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
            <p>Sumber: e-fornas.kemkes.go.id · Kemenkes RI</p>
            <p>Data diunduh {new Date().getFullYear()}</p>
          </div>
        </>
      )}

      {/* ── Detail Modal ── */}
      {selectedDrug && (
        <DetailModal drug={selectedDrug} onClose={() => setSelectedDrug(null)} />
      )}

      {/* ── Info Modal ── */}
      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}
