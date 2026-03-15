import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { usePatients } from '../context/PatientContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { parseImportedScheduleJson, getScheduleTemplateJson } from '../utils/scheduleImport';
import { sendTelegramTestNotification, triggerNotificationCycle } from '../services/notificationService';
import {
    buildTelegramConnectUrl,
    ensureTelegramChannel,
    getTelegramBotUsername,
    getTelegramChannel,
    updateTelegramChannel,
} from '../services/telegramChannelService';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const CATEGORIES = [
    { id: 'pasien',  label: 'Pasien',  icon: 'person',       color: '#3b82f6', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',     event: 'bg-blue-500'   },
    { id: 'operasi', label: 'Operasi', icon: 'surgical',      color: '#ef4444', pill: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',           event: 'bg-red-500'    },
    { id: 'rapat',   label: 'Rapat',   icon: 'groups',        color: '#8b5cf6', pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', event: 'bg-violet-500' },
    { id: 'jaga',    label: 'Jaga',    icon: 'schedule',      color: '#f97316', pill: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300', event: 'bg-orange-500' },
    { id: 'pribadi', label: 'Pribadi', icon: 'star',          color: '#22c55e', pill: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',   event: 'bg-green-500'  },
    { id: 'lainnya', label: 'Lainnya', icon: 'more_horiz',    color: '#64748b', pill: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',   event: 'bg-slate-500'  },
];

const PRIORITIES = [
    { id: 'rendah', label: 'Rendah', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'   },
    { id: 'sedang', label: 'Sedang', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'   },
    { id: 'tinggi', label: 'Tinggi', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'           },
];

const DAYS_SHORT  = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTHS_ID   = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HOUR_PX     = 64; // px per hour in day-view
const REMINDER_MINUTES_LABEL = Math.max(1, Number(import.meta.env.VITE_SCHEDULE_REMINDER_MINUTES || 10));

const VIEWS = [
    { id: 'harian',    label: 'Harian',    icon: 'today'          },
    { id: 'mingguan',  label: 'Mingguan',  icon: 'view_week'      },
    { id: 'bulanan',   label: 'Bulanan',   icon: 'calendar_month' },
    { id: 'mendatang', label: 'Mendatang', icon: 'upcoming'       },
];

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────
function toDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function todayStr() { return toDateStr(new Date()); }

function timeToMinutes(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function getMonthCalendarDays(year, month) {
    const firstDay    = new Date(year, month, 1);
    const lastDay     = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon = 0
    const days        = [];

    for (let i = startOffset - 1; i >= 0; i--) {
        days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
        days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
}

function getWeekDays(date) {
    const curr = new Date(date);
    const day  = curr.getDay();
    const mon  = new Date(curr);
    mon.setDate(curr.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
    });
}

function getCat(id)  { return CATEGORIES.find(c => c.id === id) || CATEGORIES[5]; }
function getPri(id)  { return PRIORITIES.find(p => p.id === id) || PRIORITIES[0]; }

function formatDisplayDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

// ─────────────────────────────────────────────
// EventModal
// ─────────────────────────────────────────────
function EventModal({ event, prefill, onClose, onSave, onDelete, patients }) {
    const isEditing = !!event;
    const blankForm = {
        title: '', description: '', date: prefill?.date || todayStr(),
        startTime: prefill?.time || '', endTime: '',
        isAllDay: !prefill?.time, category: 'pasien', patientId: '', priority: 'sedang',
    };
    const [form, setForm]     = useState(isEditing ? { ...event } : blankForm);
    const [errors, setErrors] = useState({});

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    function handleSubmit(e) {
        e.preventDefault();
        const errs = {};
        if (!form.title.trim()) errs.title = 'Judul wajib diisi';
        if (!form.date)         errs.date  = 'Tanggal wajib diisi';
        if (!form.isAllDay && !form.startTime) errs.startTime = 'Jam mulai wajib diisi untuk reminder jadwal';
        if (Object.keys(errs).length) { setErrors(errs); return; }
        onSave(form);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden border border-slate-200 dark:border-slate-700" style={{ animation: 'slideUp .15s ease-out' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-[18px]">{isEditing ? 'edit_calendar' : 'calendar_add_on'}</span>
                        </div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {isEditing ? 'Edit Jadwal' : 'Tambah Jadwal'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="px-5 py-4 space-y-4">

                        {/* Title */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
                                Judul <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={e => set('title', e.target.value)}
                                placeholder="Contoh: Visit pasien ICU, Rapat DPJP..."
                                className={`w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${errors.title ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                            />
                            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
                        </div>

                        {/* Date + All-day */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
                                    Tanggal <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={e => set('date', e.target.value)}
                                    className={`w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${errors.date ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Tipe</label>
                                <button
                                    type="button"
                                    onClick={() => set('isAllDay', !form.isAllDay)}
                                    className={`w-full h-11 px-3 rounded-xl text-sm font-medium border-2 transition-all flex items-center justify-center gap-2 ${form.isAllDay ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{form.isAllDay ? 'check_circle' : 'radio_button_unchecked'}</span>
                                    Seharian
                                </button>
                            </div>
                        </div>

                        {/* Time range */}
                        {!form.isAllDay && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
                                        Mulai <span className="text-red-500">*</span>
                                    </label>
                                    <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                                        className={`w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${errors.startTime ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`} />
                                    {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Selesai</label>
                                    <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                                        className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all" />
                                </div>
                            </div>
                        )}

                        {/* Category */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Kategori</label>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map(cat => (
                                    <button
                                        type="button"
                                        key={cat.id}
                                        onClick={() => set('category', cat.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${form.category === cat.id ? 'border-current scale-105 shadow-sm' : 'border-transparent opacity-60 hover:opacity-90'} ${cat.pill}`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Priority */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">Prioritas</label>
                            <div className="flex gap-2">
                                {PRIORITIES.map(p => (
                                    <button
                                        type="button"
                                        key={p.id}
                                        onClick={() => set('priority', p.id)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${form.priority === p.id ? `${p.badge} border-current` : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Patient link */}
                        {patients && patients.length > 0 && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
                                    Pasien Terkait <span className="text-slate-400 font-normal normal-case">(opsional)</span>
                                </label>
                                <select
                                    value={form.patientId || ''}
                                    onChange={e => set('patientId', e.target.value || '')}
                                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                                >
                                    <option value="">-- Tidak ada --</option>
                                    {patients.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}{p.room ? ` · ${p.room}` : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Description */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
                                Deskripsi <span className="text-slate-400 font-normal normal-case">(opsional)</span>
                            </label>
                            <textarea
                                value={form.description}
                                onChange={e => set('description', e.target.value)}
                                placeholder="Catatan tambahan tentang jadwal ini..."
                                rows={3}
                                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className={`flex items-center px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 gap-3 shrink-0 ${isEditing ? 'justify-between' : 'justify-end'}`}>
                        {isEditing && (
                            <button
                                type="button"
                                onClick={() => onDelete(event.id)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                Hapus
                            </button>
                        )}
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                Batal
                            </button>
                            <button type="submit"
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px]">save</span>
                                Simpan
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// EventPill – tiny colored event chip in month grid
// ─────────────────────────────────────────────
function EventPill({ event, onClick }) {
    const cat = getCat(event.category);
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick(event); }}
            title={event.title}
            className={`w-full text-left text-[10px] font-semibold rounded px-1.5 py-0.5 truncate text-white transition-opacity hover:opacity-80 ${cat.event}`}
        >
            {!event.isAllDay && event.startTime && <span className="opacity-75 mr-1">{event.startTime}</span>}
            {event.title}
        </button>
    );
}

// ─────────────────────────────────────────────
// MonthView
// ─────────────────────────────────────────────
function MonthView({ schedules, currentDate, onDayClick, onEventClick }) {
    const year   = currentDate.getFullYear();
    const month  = currentDate.getMonth();
    const today  = todayStr();
    const calDays = useMemo(() => getMonthCalendarDays(year, month), [year, month]);

    const byDate = useMemo(() => {
        const map = {};
        schedules.forEach(ev => {
            if (!map[ev.date]) map[ev.date] = [];
            map[ev.date].push(ev);
        });
        return map;
    }, [schedules]);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
                {DAYS_SHORT.map(d => (
                    <div key={d} className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid cells */}
            <div className="grid grid-cols-7">
                {calDays.map((cell, idx) => {
                    const ds     = toDateStr(cell.date);
                    const events = byDate[ds] || [];
                    const isToday = ds === today;

                    return (
                        <div
                            key={idx}
                            onClick={() => onDayClick(cell.date)}
                            className={`min-h-22 md:min-h-27.5 p-1.5 border-b border-r border-slate-100 dark:border-slate-800/70 cursor-pointer transition-colors
                                ${!cell.isCurrentMonth ? 'opacity-35' : ''}
                                ${isToday ? 'bg-primary/4' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                            `}
                        >
                            <div className="flex justify-center mb-1">
                                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors
                                    ${isToday ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-300'}
                                `}>
                                    {cell.date.getDate()}
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                {events.slice(0, 3).map(ev => (
                                    <EventPill key={ev.id} event={ev} onClick={onEventClick} />
                                ))}
                                {events.length > 3 && (
                                    <p className="text-[10px] text-center text-slate-400 hover:text-primary transition-colors cursor-pointer leading-tight">
                                        +{events.length - 3} lagi
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// WeekView
// ─────────────────────────────────────────────
function WeekView({ schedules, currentDate, onEventClick, onOpenModal }) {
    const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
    const today    = todayStr();

    const byDate = useMemo(() => {
        const map = {};
        schedules.forEach(ev => {
            if (!map[ev.date]) map[ev.date] = [];
            map[ev.date].push(ev);
        });
        Object.keys(map).forEach(d => {
            map[d].sort((a, b) => {
                if (a.isAllDay && !b.isAllDay) return -1;
                if (!a.isAllDay && b.isAllDay) return 1;
                return (a.startTime || '').localeCompare(b.startTime || '');
            });
        });
        return map;
    }, [schedules]);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm overflow-x-auto">
            <div className="grid grid-cols-7 min-w-140">
                {weekDays.map((date, idx) => {
                    const ds      = toDateStr(date);
                    const events  = byDate[ds] || [];
                    const isToday = ds === today;

                    return (
                        <div key={idx} className={`border-r last:border-r-0 border-slate-100 dark:border-slate-800 ${isToday ? 'bg-primary/3 dark:bg-primary/6' : ''}` }>
                            {/* Column header */}
                            <div className={`py-3 text-center border-b border-slate-100 dark:border-slate-800 ${isToday ? 'bg-primary/7 dark:bg-primary/10' : ''}`}>
                                <p className={`text-[10px] font-bold uppercase tracking-widest ${isToday ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {DAYS_SHORT[idx]}
                                </p>
                                <span className={`text-lg font-bold inline-flex items-center justify-center w-8 h-8 rounded-full mt-0.5
                                    ${isToday ? 'bg-primary text-white' : 'text-slate-800 dark:text-slate-200'}
                                `}>
                                    {date.getDate()}
                                </span>
                            </div>

                            {/* Events */}
                            <div
                                className="p-1.5 space-y-1 min-h-45 cursor-pointer"
                                onClick={() => onOpenModal({ date: ds })}
                            >
                                {events.map(ev => {
                                    const cat = getCat(ev.category);
                                    return (
                                        <button
                                            key={ev.id}
                                            onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                                            className={`w-full text-left rounded-lg px-2 py-1.5 text-white text-[11px] font-medium leading-tight transition-opacity hover:opacity-85 ${cat.event}`}
                                        >
                                            {!ev.isAllDay && ev.startTime && (
                                                <span className="block text-[10px] opacity-75">{ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}</span>
                                            )}
                                            <span className="truncate block">{ev.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// DayView – 24-hour timeline
// ─────────────────────────────────────────────
function DayView({ schedules, currentDate, onEventClick, onOpenModal }) {
    const ds       = toDateStr(currentDate);
    const today    = todayStr();
    const isToday  = ds === today;
    const scrollRef = useRef(null);

    const { allDay, timed } = useMemo(() => {
        const dayEvents = schedules.filter(ev => ev.date === ds);
        return {
            allDay: dayEvents.filter(ev => ev.isAllDay),
            timed:  dayEvents.filter(ev => !ev.isAllDay).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
        };
    }, [schedules, ds]);

    const now = new Date();
    const currentTopPx = isToday ? ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX : null;

    // Scroll to first event or 7am
    useEffect(() => {
        if (!scrollRef.current) return;
        const targetH = timed.length > 0
            ? Math.max(0, (timeToMinutes(timed[0].startTime) ?? 420) / 60 - 1)
            : 7;
        scrollRef.current.scrollTop = targetH * HOUR_PX;
    }, [ds]); // eslint-disable-line react-hooks/exhaustive-deps

    function eventStyle(ev) {
        const start    = timeToMinutes(ev.startTime) ?? 0;
        const end      = timeToMinutes(ev.endTime)   ?? (start + 60);
        const duration = Math.max(end - start, 30);
        return { top: `${(start / 60) * HOUR_PX}px`, height: `${(duration / 60) * HOUR_PX}px` };
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* All-day strip */}
            {allDay.length > 0 && (
                <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Seharian</p>
                    <div className="flex flex-wrap gap-1.5">
                        {allDay.map(ev => {
                            const cat = getCat(ev.category);
                            return (
                                <button key={ev.id} onClick={() => onEventClick(ev)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold text-white ${cat.event} hover:opacity-85 transition-opacity`}>
                                    {ev.title}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Timeline */}
            <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '62vh' }}>
                <div className="relative" style={{ height: `${24 * HOUR_PX}px` }}>
                    {/* Hour rows */}
                    {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="absolute left-0 right-0 flex" style={{ top: `${h * HOUR_PX}px`, height: `${HOUR_PX}px` }}>
                            <div className="w-14 shrink-0 pr-3 flex items-start justify-end pt-1.5">
                                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none">
                                    {String(h).padStart(2, '0')}:00
                                </span>
                            </div>
                            <div
                                className="flex-1 border-t border-slate-100 dark:border-slate-800 hover:bg-primary/3 transition-colors cursor-pointer"
                                onClick={() => onOpenModal({ date: ds, time: `${String(h).padStart(2, '0')}:00` })}
                            />
                        </div>
                    ))}

                    {/* Current time indicator */}
                    {currentTopPx !== null && (
                        <div className="absolute left-0 right-0 z-10 pointer-events-none flex items-center" style={{ top: `${currentTopPx}px` }}>
                            <div className="w-14 shrink-0 flex items-center justify-end pr-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                            </div>
                            <div className="flex-1 h-0.5 bg-red-500 shadow-sm shadow-red-300/50" />
                        </div>
                    )}

                    {/* Timed events */}
                    {timed.map(ev => {
                        const cat = getCat(ev.category);
                        return (
                            <button
                                key={ev.id}
                                onClick={() => onEventClick(ev)}
                                style={{ ...eventStyle(ev), left: '56px', right: '8px', position: 'absolute', zIndex: 5 }}
                                className={`${cat.event} text-white rounded-xl px-2.5 py-1.5 text-left overflow-hidden hover:opacity-85 transition-opacity shadow-md border-l-2 border-white/30`}
                            >
                                <p className="text-xs font-bold leading-tight truncate">{ev.title}</p>
                                {ev.startTime && (
                                    <p className="text-[10px] opacity-80 mt-0.5">{ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''}</p>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// EventCard – detailed card for Upcoming view
// ─────────────────────────────────────────────
function EventCard({ event, onEdit, patients }) {
    const cat     = getCat(event.category);
    const pri     = getPri(event.priority);
    const patient = patients?.find(p => p.id === event.patientId);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-shadow border-l-4"
            style={{ borderLeftColor: cat.color }}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat.pill}`}>{cat.label}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pri.badge}`}>{pri.label}</span>
                        {event.isAllDay && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Seharian</span>
                        )}
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">{event.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {formatDisplayDate(event.date)}
                        </span>
                        {!event.isAllDay && event.startTime && (
                            <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
                            </span>
                        )}
                    </div>
                    {patient && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-blue-500">
                            <span className="material-symbols-outlined text-[13px]">person</span>
                            {patient.name}
                        </div>
                    )}
                    {event.description && (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{event.description}</p>
                    )}
                </div>
                <button onClick={() => onEdit(event)}
                    className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// UpcomingView
// ─────────────────────────────────────────────
function UpcomingView({ schedules, onEventClick, patients }) {
    const today = todayStr();

    const grouped = useMemo(() => {
        const now  = new Date();
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        function startOfWeek(d) {
            const r = new Date(d);
            const day = r.getDay();
            r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
            r.setHours(0, 0, 0, 0);
            return r;
        }

        const thisWeekStart  = startOfWeek(base);
        const thisWeekEnd    = new Date(thisWeekStart); thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
        const nextWeekStart  = new Date(thisWeekEnd);   nextWeekStart.setDate(thisWeekEnd.getDate() + 1);
        const nextWeekEnd    = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
        const tomorrowStr    = toDateStr(new Date(base.getTime() + 86400000));

        const upcoming = schedules
            .filter(ev => ev.date >= today)
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                if (a.isAllDay && !b.isAllDay) return -1;
                if (!a.isAllDay && b.isAllDay) return 1;
                return (a.startTime || '').localeCompare(b.startTime || '');
            });

        const groups = {
            today:    { label: 'Hari Ini',      events: [] },
            tomorrow: { label: 'Besok',          events: [] },
            thisWeek: { label: 'Minggu Ini',     events: [] },
            nextWeek: { label: 'Minggu Depan',   events: [] },
            later:    { label: 'Lebih Jauh',     events: [] },
        };

        upcoming.forEach(ev => {
            const d = new Date(ev.date + 'T00:00:00');
            if (ev.date === today)        groups.today.events.push(ev);
            else if (ev.date === tomorrowStr)  groups.tomorrow.events.push(ev);
            else if (d >= thisWeekStart && d <= thisWeekEnd)  groups.thisWeek.events.push(ev);
            else if (d >= nextWeekStart && d <= nextWeekEnd)  groups.nextWeek.events.push(ev);
            else                                               groups.later.events.push(ev);
        });

        return groups;
    }, [schedules, today]);

    const hasAny = Object.values(grouped).some(g => g.events.length > 0);

    if (!hasAny) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">event_busy</span>
                </div>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Tidak ada jadwal mendatang</h3>
                <p className="text-sm text-slate-400 max-w-xs">Tambahkan jadwal baru untuk mulai melacak aktivitas Anda.</p>
            </div>
        );
    }

    return (
        <div className="space-y-7">
            {Object.entries(grouped).map(([key, group]) => {
                if (group.events.length === 0) return null;
                return (
                    <div key={key}>
                        <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap">{group.label}</h3>
                            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full shrink-0">{group.events.length}</span>
                        </div>
                        <div className="space-y-2">
                            {group.events.map(ev => (
                                <EventCard key={ev.id} event={ev} onEdit={onEventClick} patients={patients} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────
// ImportScheduleModal
// ─────────────────────────────────────────────
function ImportScheduleModal({
    open,
    onClose,
    onFileChange,
    onImport,
    onDownloadTemplate,
    preview,
    fileName,
    importing,
}) {
    if (!open) return null;

    const canImport = !!preview && preview.validItems.length > 0 && !importing;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-3xl bg-white dark:bg-slate-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden border border-slate-200 dark:border-slate-700" style={{ animation: 'slideUp .15s ease-out' }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-[18px]">upload_file</span>
                        </div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Import Jadwal JSON</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/50">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Langkah 1</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">Unduh template resmi agar format pasti kompatibel dengan aplikasi.</p>
                            <button
                                type="button"
                                onClick={onDownloadTemplate}
                                className="w-full h-10 px-3 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
                            >
                                Download Template JSON
                            </button>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/50">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Langkah 2</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">Pilih file JSON. Sistem akan cek validasi sebelum data diimpor.</p>
                            <label className="w-full h-10 px-3 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer">
                                <span className="material-symbols-outlined text-[18px]">file_upload</span>
                                Pilih File JSON
                                <input type="file" accept=".json,application/json" onChange={onFileChange} className="hidden" />
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 truncate">
                                {fileName ? `File: ${fileName}` : 'Belum ada file dipilih'}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Format JSON</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Gunakan root object dengan field <span className="font-semibold">schedules</span> (array), atau langsung array item jadwal.</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Field wajib: <span className="font-semibold">title</span>, <span className="font-semibold">date (YYYY-MM-DD)</span>. Jika <span className="font-semibold">id</span> sama, data existing akan di-update.</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Langkah 3 - Preview Validasi</p>
                        {!preview && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Pilih file terlebih dahulu untuk melihat ringkasan validasi.</p>
                        )}

                        {preview && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 border border-slate-200 dark:border-slate-700">
                                        <p className="text-[10px] text-slate-500">Total</p>
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{preview.totalItems}</p>
                                    </div>
                                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 border border-green-200 dark:border-green-800/70">
                                        <p className="text-[10px] text-green-600 dark:text-green-400">Valid</p>
                                        <p className="text-sm font-bold text-green-700 dark:text-green-300">{preview.validItems.length}</p>
                                    </div>
                                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 border border-red-200 dark:border-red-800/70">
                                        <p className="text-[10px] text-red-600 dark:text-red-400">Invalid</p>
                                        <p className="text-sm font-bold text-red-700 dark:text-red-300">{preview.invalidItems.length}</p>
                                    </div>
                                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 border border-amber-200 dark:border-amber-800/70">
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Warnings</p>
                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{preview.warnings.length}</p>
                                    </div>
                                </div>

                                {!preview.ok && (
                                    <p className="text-sm text-red-500">{preview.error}</p>
                                )}

                                {preview.duplicateIdsUpdated > 0 && (
                                    <p className="text-xs text-slate-600 dark:text-slate-300">
                                        {preview.duplicateIdsUpdated} id duplikat dalam file terdeteksi, versi terakhir otomatis dipakai.
                                    </p>
                                )}

                                {preview.invalidItems.length > 0 && (
                                    <div className="rounded-lg border border-red-200 dark:border-red-800/60 p-2 bg-red-50/70 dark:bg-red-900/10">
                                        <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Contoh error:</p>
                                        <div className="space-y-1">
                                            {preview.invalidItems.slice(0, 4).map((item, idx) => (
                                                <p key={idx} className="text-xs text-red-600 dark:text-red-400">Baris {item.row}: {item.reason}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 gap-2 shrink-0">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={onImport}
                        disabled={!canImport}
                        className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-1.5 ${canImport ? 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">upload</span>
                        {importing ? 'Mengimpor...' : 'Import ke Jadwal'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Main Schedule Page
// ─────────────────────────────────────────────
export default function Schedule() {
    const { schedules, addSchedule, updateSchedule, deleteSchedule, importSchedulesBulk, resetAllSchedules } = useSchedule();
    const { patients } = usePatients();
    const { user } = useAuth();
    const { addToast } = useToast();

    const [view,         setView]         = useState(() => localStorage.getItem('medterminal_schedule_view') || 'bulanan');
    const [currentDate,  setCurrentDate]  = useState(new Date());
    const [showModal,    setShowModal]    = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [prefill,      setPrefill]      = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [importFileName, setImportFileName] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showResetFinalConfirm, setShowResetFinalConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [telegramChannel, setTelegramChannel] = useState(null);
    const [isTelegramLoading, setIsTelegramLoading] = useState(false);
    const [isTelegramBusy, setIsTelegramBusy] = useState(false);
    const [isSendingTelegramTest, setIsSendingTelegramTest] = useState(false);
    const [isPollingTelegram, setIsPollingTelegram] = useState(false);
    const [showTelegramGuide, setShowTelegramGuide] = useState(false);
    const [manualTelegramConnectUrl, setManualTelegramConnectUrl] = useState('');
    const telegramPollRef = useRef(null);
    const TELEGRAM_PENDING_KEY = 'medterminal_telegram_connect_pending';

    const stopTelegramPolling = useCallback(() => {
        if (telegramPollRef.current) {
            clearInterval(telegramPollRef.current);
            telegramPollRef.current = null;
        }
        setIsPollingTelegram(false);
    }, []);

    const loadTelegramChannel = useCallback(async () => {
        if (!user?.id) {
            setTelegramChannel(null);
            return;
        }
        setIsTelegramLoading(true);
        try {
            const channel = await getTelegramChannel(user.id);
            setTelegramChannel(channel || null);
        } catch {
            addToast('Status Telegram belum bisa dimuat. Coba lagi sebentar.', 'error');
        } finally {
            setIsTelegramLoading(false);
        }
    }, [addToast, user?.id]);

    useEffect(() => {
        loadTelegramChannel();
    }, [loadTelegramChannel]);

    useEffect(() => {
        if (!user?.id) return;
        if (sessionStorage.getItem(TELEGRAM_PENDING_KEY) === '1') {
            startTelegramStatusPolling();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        return () => stopTelegramPolling();
    }, [stopTelegramPolling]);

    const isTelegramConnected = !!(telegramChannel?.is_verified && telegramChannel?.telegram_chat_id && telegramChannel?.is_enabled);
    const telegramStatusText = isTelegramConnected
        ? 'Terhubung'
        : (isPollingTelegram ? 'Sedang menghubungkan...' : 'Belum terhubung');

    const telegramStatusBadge = isTelegramConnected
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
        : (isPollingTelegram
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300');

    function startTelegramStatusPolling() {
        if (!user?.id) return;
        stopTelegramPolling();
        setIsPollingTelegram(true);

        const startedAt = Date.now();
        telegramPollRef.current = setInterval(async () => {
            try {
                const latest = await getTelegramChannel(user.id);
                setTelegramChannel(latest || null);

                const verified = !!(latest?.is_verified && latest?.telegram_chat_id && latest?.is_enabled);
                const expired = Date.now() - startedAt > 60 * 1000;

                if (verified) {
                    stopTelegramPolling();
                    sessionStorage.removeItem(TELEGRAM_PENDING_KEY);
                    addToast('Berhasil. Telegram sudah terhubung dan siap kirim reminder.', 'success');
                    return;
                }

                if (expired) {
                    stopTelegramPolling();
                    sessionStorage.removeItem(TELEGRAM_PENDING_KEY);
                    addToast('Belum terhubung. Buka Telegram lalu tekan Start, lalu kembali ke sini.', 'info');
                }
            } catch {
                stopTelegramPolling();
            }
        }, 5000);
    }

    async function handleTelegramConnect() {
        if (!user?.id) {
            addToast('Silakan login untuk menghubungkan Telegram.', 'info');
            return;
        }

        const botUsername = getTelegramBotUsername();
        const connectUrl = buildTelegramConnectUrl(user.id);

        if (!botUsername || !connectUrl) {
            addToast('Bot Telegram belum dikonfigurasi oleh admin aplikasi.', 'error');
            return;
        }

        setManualTelegramConnectUrl('');
        sessionStorage.setItem(TELEGRAM_PENDING_KEY, '1');

        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const popupWindow = !isMobile ? window.open(connectUrl, '_blank', 'noopener,noreferrer') : null;

        if (isMobile) {
            // On mobile, open Telegram in current tab to avoid Safari about:blank tab issue.
            window.location.assign(connectUrl);
        }

        setIsTelegramBusy(true);
        try {
            const ensured = await ensureTelegramChannel(user.id);
            setTelegramChannel(ensured);

            if (isMobile) {
                addToast('Telegram sedang dibuka. Setelah tekan Start, kembali ke halaman Jadwal.', 'info');
            } else if (popupWindow && !popupWindow.closed) {
                addToast('Telegram sudah dibuka. Tekan Start di bot, lalu kembali ke halaman ini.', 'info');
            } else {
                setManualTelegramConnectUrl(connectUrl);
                addToast('Browser menahan popup. Gunakan tombol Buka Manual di bawah.', 'info');
            }

            startTelegramStatusPolling();
        } catch {
            sessionStorage.removeItem(TELEGRAM_PENDING_KEY);
            if (!isMobile && popupWindow && !popupWindow.closed) popupWindow.close();
            addToast('Gagal memulai koneksi Telegram. Silakan coba lagi.', 'error');
        } finally {
            setIsTelegramBusy(false);
        }
    }

    async function handleToggleScheduleReminder() {
        if (!user?.id || !telegramChannel) return;
        setIsTelegramBusy(true);
        const nextValue = !telegramChannel.schedule_enabled;
        try {
            const updated = await updateTelegramChannel(user.id, {
                schedule_enabled: nextValue,
                is_enabled: true,
            });
            setTelegramChannel(updated);
            if (nextValue) {
                triggerNotificationCycle({ reason: 'telegram_schedule_reminder_enabled' });
            }
            addToast(nextValue ? 'Reminder jadwal diaktifkan.' : 'Reminder jadwal dimatikan.', 'success');
        } catch {
            addToast('Pengaturan reminder belum tersimpan. Coba lagi.', 'error');
        } finally {
            setIsTelegramBusy(false);
        }
    }

    async function handleDisconnectTelegram() {
        if (!user?.id || !telegramChannel) return;
        setIsTelegramBusy(true);
        try {
            const updated = await updateTelegramChannel(user.id, {
                is_enabled: false,
                schedule_enabled: false,
                alert_enabled: false,
            });
            setTelegramChannel(updated);
            stopTelegramPolling();
            addToast('Telegram diputuskan. Notifikasi tidak akan dikirim.', 'success');
        } catch {
            addToast('Gagal memutuskan Telegram. Coba lagi.', 'error');
        } finally {
            setIsTelegramBusy(false);
        }
    }

    async function handleSendTelegramTest() {
        if (!isTelegramConnected) {
            addToast('Hubungkan Telegram dulu sebelum kirim notifikasi tes.', 'info');
            return;
        }

        setIsSendingTelegramTest(true);
        try {
            await sendTelegramTestNotification();
            addToast('Notifikasi tes dikirim. Cek Telegram Anda sekarang.', 'success');
        } catch (err) {
            addToast(err?.message || 'Gagal mengirim notifikasi tes.', 'error');
        } finally {
            setIsSendingTelegramTest(false);
        }
    }

    // ── Navigation label ──────────────────────
    const navLabel = useMemo(() => {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        if (view === 'bulanan')  return `${MONTHS_ID[m]} ${y}`;
        if (view === 'mingguan') {
            const days  = getWeekDays(currentDate);
            const first = days[0];
            const last  = days[6];
            if (first.getMonth() === last.getMonth())
                return `${first.getDate()} – ${last.getDate()} ${MONTHS_ID[first.getMonth()]} ${y}`;
            return `${first.getDate()} ${MONTHS_ID[first.getMonth()]} – ${last.getDate()} ${MONTHS_ID[last.getMonth()]} ${y}`;
        }
        if (view === 'harian')
            return currentDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return 'Mendatang';
    }, [view, currentDate]);

    // ── Navigate prev/next ────────────────────
    function navigate(dir) {
        setCurrentDate(prev => {
            const d = new Date(prev);
            if (view === 'bulanan')  d.setMonth(d.getMonth() + dir);
            else if (view === 'mingguan') d.setDate(d.getDate() + dir * 7);
            else if (view === 'harian')   d.setDate(d.getDate() + dir);
            return d;
        });
    }

    function goToday() { setCurrentDate(new Date()); }

    // ── Modal helpers ─────────────────────────
    function openAdd(prefillData = null) {
        setEditingEvent(null);
        setPrefill(prefillData);
        setShowModal(true);
    }
    function openEdit(event) {
        setEditingEvent(event);
        setPrefill(null);
        setShowModal(true);
    }
    function closeModal() {
        setShowModal(false);
        setEditingEvent(null);
        setPrefill(null);
    }

    function handleDayClick(date) {
        setCurrentDate(new Date(date));
        setView('harian');
    }

    function handleSave(form) {
        if (editingEvent) updateSchedule(editingEvent.id, form);
        else              addSchedule(form);
        closeModal();
    }

    function handleDelete(id) {
        deleteSchedule(id);
        closeModal();
    }

    function downloadTemplate() {
        const blob = new Blob([getScheduleTemplateJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `medterminal_schedule_template_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportSchedulesJson() {
        const payload = {
            version: 'medterminal-schedule-v1',
            generatedAt: new Date().toISOString(),
            schedules,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `medterminal_schedule_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addToast(`${schedules.length} jadwal berhasil diekspor.`, 'success');
    }

    function openImport() {
        setShowImportModal(true);
        setImportPreview(null);
        setImportFileName('');
    }

    function closeImport() {
        if (isImporting) return;
        setShowImportModal(false);
        setImportPreview(null);
        setImportFileName('');
    }

    function handleImportFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFileName(file.name);
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = (ev) => {
            const parsed = parseImportedScheduleJson(String(ev.target?.result || ''));
            setImportPreview(parsed);
            if (!parsed.ok) {
                addToast(parsed.error || 'Gagal membaca file import.', 'error');
                return;
            }
            if (parsed.validItems.length === 0) {
                addToast('Tidak ada item valid untuk diimpor.', 'error');
                return;
            }
            addToast(`Validasi selesai: ${parsed.validItems.length} item siap diimpor.`, 'success');
        };
        reader.readAsText(file);
    }

    async function handleImportApply() {
        if (!importPreview || importPreview.validItems.length === 0 || isImporting) return;
        setIsImporting(true);
        try {
            await importSchedulesBulk(importPreview.validItems);
            addToast(`Import berhasil: ${importPreview.validItems.length} jadwal tersimpan.`, 'success');
            if (importPreview.invalidItems.length > 0) {
                addToast(`${importPreview.invalidItems.length} item invalid dilewati.`, 'info');
            }
            closeImport();
        } catch {
            addToast('Import tersimpan lokal, namun sinkronisasi server belum berhasil.', 'error');
            closeImport();
        } finally {
            setIsImporting(false);
        }
    }

    function handleResetConfirmTyped() {
        setShowResetConfirm(false);
        setShowResetFinalConfirm(true);
    }

    async function handleResetAllSchedules() {
        setIsResetting(true);
        try {
            await resetAllSchedules();
            addToast('Semua jadwal berhasil dihapus.', 'success');
            setShowResetFinalConfirm(false);
        } catch {
            addToast('Jadwal lokal sudah dihapus, tetapi sinkronisasi server gagal.', 'error');
            setShowResetFinalConfirm(false);
        } finally {
            setIsResetting(false);
        }
    }

    function handleCancelReset() {
        if (isResetting) return;
        setShowResetConfirm(false);
        setShowResetFinalConfirm(false);
    }

    // ── Stats ─────────────────────────────────
    const stats = useMemo(() => {
        const today    = todayStr();
        const weekDays = getWeekDays(new Date());
        const wStart   = toDateStr(weekDays[0]);
        const wEnd     = toDateStr(weekDays[6]);
        return {
            today:    schedules.filter(ev => ev.date === today).length,
            week:     schedules.filter(ev => ev.date >= wStart && ev.date <= wEnd).length,
            upcoming: schedules.filter(ev => ev.date >= today).length,
        };
    }, [schedules]);

    return (
        <div className="p-4 md:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto">

            {/* ── Page header ── */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[26px]">calendar_month</span>
                        Jadwal
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Kelola dan pantau jadwal kegiatan klinis Anda</p>
                </div>
                <button
                    onClick={() => openAdd()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 shrink-0"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span className="hidden sm:inline">Tambah Jadwal</span>
                    <span className="sm:hidden">Tambah</span>
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                <button
                    onClick={openImport}
                    className="h-10 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    Import JSON
                </button>
                <button
                    onClick={downloadTemplate}
                    className="h-10 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    Download Template
                </button>
                <button
                    onClick={exportSchedulesJson}
                    className="h-10 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined text-[18px]">archive</span>
                    Export Jadwal JSON
                </button>
                <button
                    onClick={() => setShowResetConfirm(true)}
                    className="h-10 rounded-xl text-sm font-semibold border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                    Reset Semua Jadwal
                </button>
            </div>

            <div className="mb-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">send</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Integrasi Telegram</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Hubungkan sekali, reminder jadwal jalan otomatis</p>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold w-fit ${telegramStatusBadge}`}>
                        <span className="material-symbols-outlined text-[13px]">fiber_manual_record</span>
                        {telegramStatusText}
                    </span>
                </div>

                <div className="px-4 py-4 space-y-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Panduan Singkat</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {[
                                '1. Tekan tombol Buka Telegram',
                                '2. Di Telegram, tekan Start',
                                '3. Kembali ke sini, status otomatis Terhubung',
                            ].map((item) => (
                                <div key={item} className="text-xs text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2">
                                    {item}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowTelegramGuide(v => !v)}
                            className="mt-2 text-xs font-semibold text-primary hover:underline"
                        >
                            {showTelegramGuide ? 'Sembunyikan bantuan' : 'Butuh bantuan?'}
                        </button>
                        {showTelegramGuide && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                <p>Kalau belum berubah, biasanya tombol Start di Telegram belum ditekan.</p>
                                <p>Setelah menekan Start, kembali ke halaman ini lalu klik Coba Lagi.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={handleTelegramConnect}
                            disabled={isTelegramBusy}
                            className={`h-10 px-4 rounded-xl text-sm font-semibold text-white transition-colors ${isTelegramBusy ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary/90'}`}
                        >
                            {isTelegramBusy ? 'Memproses...' : (isTelegramConnected ? 'Hubungkan Ulang' : 'Buka Telegram')}
                        </button>

                        {manualTelegramConnectUrl && (
                            <a
                                href={manualTelegramConnectUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="h-10 px-3 rounded-xl text-sm font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition-colors inline-flex items-center"
                            >
                                Buka Manual
                            </a>
                        )}

                        <button
                            onClick={loadTelegramChannel}
                            disabled={isTelegramBusy || isTelegramLoading}
                            className="h-10 px-3 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                        >
                            {isTelegramLoading ? 'Memuat...' : 'Coba Lagi'}
                        </button>

                        {telegramChannel && (
                            <button
                                onClick={handleDisconnectTelegram}
                                disabled={isTelegramBusy}
                                className="h-10 px-3 rounded-xl text-sm font-semibold border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60"
                            >
                                Putuskan Telegram
                            </button>
                        )}

                        {telegramChannel && (
                            <button
                                onClick={handleSendTelegramTest}
                                disabled={isSendingTelegramTest || !isTelegramConnected}
                                className="h-10 px-3 rounded-xl text-sm font-semibold border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-900/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60"
                            >
                                {isSendingTelegramTest ? 'Mengirim Tes...' : 'Kirim Notifikasi Tes'}
                            </button>
                        )}
                    </div>

                    {telegramChannel && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-white dark:bg-slate-900">
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">Reminder Jadwal</p>
                                <button
                                    type="button"
                                    onClick={handleToggleScheduleReminder}
                                    disabled={isTelegramBusy || !isTelegramConnected}
                                    className={`mt-1 h-9 px-3 rounded-lg text-xs font-semibold border-2 transition-colors ${telegramChannel.schedule_enabled ? 'border-primary/40 bg-primary/10 text-primary' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'} disabled:opacity-60`}
                                >
                                    {telegramChannel.schedule_enabled ? `Aktif (${REMINDER_MINUTES_LABEL} menit sebelum jadwal)` : 'Nonaktif'}
                                </button>
                            </div>

                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-white dark:bg-slate-900">
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">Status Verifikasi</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    {telegramChannel.is_verified ? 'Terverifikasi' : 'Belum terverifikasi'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {telegramChannel.telegram_chat_id
                                        ? `Chat ID terdeteksi (${String(telegramChannel.telegram_chat_id).slice(-4)})`
                                        : 'Chat ID belum terdeteksi'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                    { label: 'Hari Ini',   value: stats.today,    icon: 'today',          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20'   },
                    { label: 'Minggu Ini', value: stats.week,     icon: 'view_week',      color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
                    { label: 'Mendatang',  value: stats.upcoming, icon: 'upcoming',       color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20'  },
                ].map(s => (
                    <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 shadow-sm">
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                                <span className={`material-symbols-outlined text-[18px] md:text-[22px] ${s.color}`}>{s.icon}</span>
                            </div>
                            <div>
                                <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none">{s.value}</p>
                                <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── View switcher + nav ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                {/* View tabs */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0">
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            onClick={() => { setView(v.id); localStorage.setItem('medterminal_schedule_view', v.id); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                view === v.id
                                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">{v.icon}</span>
                            <span className="hidden sm:inline">{v.label}</span>
                        </button>
                    ))}
                </div>

                {/* Date navigation (hidden for Mendatang) */}
                {view !== 'mendatang' && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToday}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Hari Ini
                        </button>
                        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                            </button>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-3 min-w-42.5 text-center select-none">{navLabel}</span>
                            <button onClick={() => navigate(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Calendar content ── */}
            {view === 'bulanan' && (
                <MonthView
                    schedules={schedules}
                    currentDate={currentDate}
                    onDayClick={handleDayClick}
                    onEventClick={openEdit}
                />
            )}
            {view === 'mingguan' && (
                <WeekView
                    schedules={schedules}
                    currentDate={currentDate}
                    onEventClick={openEdit}
                    onOpenModal={openAdd}
                />
            )}
            {view === 'harian' && (
                <DayView
                    schedules={schedules}
                    currentDate={currentDate}
                    onEventClick={openEdit}
                    onOpenModal={openAdd}
                />
            )}
            {view === 'mendatang' && (
                <UpcomingView
                    schedules={schedules}
                    onEventClick={openEdit}
                    patients={patients}
                />
            )}

            {/* ── Mobile FAB ── */}
            <button
                onClick={() => openAdd()}
                className="lg:hidden fixed bottom-20 right-4 w-14 h-14 bg-primary rounded-full shadow-xl shadow-primary/30 flex items-center justify-center text-white z-30 hover:bg-primary/90 transition-all active:scale-95"
                aria-label="Tambah jadwal"
            >
                <span className="material-symbols-outlined text-[24px]">add</span>
            </button>

            {/* ── Modal ── */}
            {showModal && (
                <EventModal
                    event={editingEvent}
                    prefill={prefill}
                    onClose={closeModal}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    patients={patients}
                />
            )}

            <ImportScheduleModal
                open={showImportModal}
                onClose={closeImport}
                onFileChange={handleImportFileChange}
                onImport={handleImportApply}
                onDownloadTemplate={downloadTemplate}
                preview={importPreview}
                fileName={importFileName}
                importing={isImporting}
            />

            <ConfirmDialog
                open={showResetConfirm}
                title="Reset Semua Jadwal"
                message="Tindakan ini akan menghapus seluruh jadwal Anda dari aplikasi. Ketik frasa di bawah untuk melanjutkan."
                requireTypedConfirmation="Reset Semua Jadwal"
                confirmLabel="Lanjutkan"
                cancelLabel="Batal"
                onConfirm={handleResetConfirmTyped}
                onCancel={handleCancelReset}
            />

            <ConfirmDialog
                open={showResetFinalConfirm}
                danger
                title="Peringatan Terakhir"
                message={`Semua ${schedules.length} jadwal akan dihapus permanen${schedules.length > 0 ? '' : ' dari keadaan kosong'}. Tindakan ini tidak dapat dibatalkan.`}
                confirmLabel={isResetting ? 'Menghapus…' : 'Ya, Hapus Semua'}
                cancelLabel="Tidak, Batalkan"
                onConfirm={handleResetAllSchedules}
                onCancel={handleCancelReset}
            />
        </div>
    );
}
