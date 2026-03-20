import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStase } from '../../context/StaseContext';
import { usePatients } from '../../context/PatientContext';
import { useOffline } from '../../context/OfflineContext';

const navItems = [
    { to: '/', icon: 'home', label: 'Beranda' },
    { to: '/stase', icon: 'assignment', label: 'Stase' },
    { to: '/patients', icon: 'group', label: 'Daftar Pasien' },
    { to: '/add-patient', icon: 'person_add', label: 'Pasien Baru' },
    { to: '/schedule', icon: 'calendar_month', label: 'Jadwal' },
    { to: '/tools', icon: 'medical_information', label: 'Tools' },
    { to: '/reports', icon: 'analytics', label: 'Laporan' },
    { to: '/news', icon: 'newspaper', label: 'News' },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user, signOut, isAdmin, isIntern, isSpecialist } = useAuth();
    const { pinnedStase } = useStase();
    const { patients } = usePatients();
    const { conflictCount } = useOffline();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const navigate = useNavigate();
    const displayName = user?.user_metadata?.username || user?.email || 'Dokter Coass';

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />
            )}

            <aside className={`
        fixed lg:relative z-50 h-dvh lg:h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}>
                {/* Collapse Button (Desktop Only) */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-8 hidden lg:flex items-center justify-center w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-500 hover:text-primary transition-colors z-50 shadow-sm"
                >
                    <span className="material-symbols-outlined text-[14px]">
                        {isCollapsed ? 'chevron_right' : 'chevron_left'}
                    </span>
                </button>

                {/* Logo */}
                <div className={`p-6 flex items-center shrink-0 ${isCollapsed ? 'justify-center px-4' : 'gap-3'}`}>
                    <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white">medical_services</span>
                    </div>
                    {!isCollapsed && (
                        <h1 className="text-xl font-bold tracking-tight text-primary transition-opacity duration-300 whitespace-nowrap overflow-hidden">MedxTerminal</h1>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 space-y-1 overflow-y-auto overflow-x-hidden">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={onClose}
                            title={isCollapsed ? item.label : ''}
                            className={({ isActive }) =>
                                `relative flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-[22px] shrink-0">{item.icon}</span>
                            {!isCollapsed && <span className="text-sm whitespace-nowrap overflow-hidden flex-1">{item.label}</span>}
                            {!isCollapsed && item.conflictBadge && conflictCount > 0 && (
                                <span className="ml-auto min-w-4.5 h-4.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">{conflictCount}</span>
                            )}
                            {isCollapsed && item.conflictBadge && conflictCount > 0 && (
                                <span className="absolute top-1 right-1 min-w-3.5 h-3.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold px-0.5">{conflictCount}</span>
                            )}
                        </NavLink>
                    ))}

                    {/* Admin Panel link — only shown to admins */}
                    {isAdmin && (
                        <>
                            <div className={`my-2 border-t border-slate-200 dark:border-slate-700 ${isCollapsed ? 'mx-2' : 'mx-0'}`} />
                            <NavLink
                                to="/admin"
                                onClick={onClose}
                                title={isCollapsed ? 'Panel Admin' : ''}
                                className={({ isActive }) =>
                                    `relative flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isActive
                                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-semibold'
                                        : 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                                    }`
                                }
                            >
                                <span className="material-symbols-outlined text-[22px] shrink-0">admin_panel_settings</span>
                                {!isCollapsed && <span className="text-sm whitespace-nowrap overflow-hidden flex-1">Panel Admin</span>}
                            </NavLink>
                        </>
                    )}
                </nav>

                {/* Quota Progress Bar for Interns */}
                {isIntern && (
                    <div className={`px-4 py-3 shrink-0 ${isCollapsed ? 'hidden' : 'block'}`}>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Kuota Pasien</span>
                                <span className="text-[10px] font-bold text-slate-500">{patients.length} / 2</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-2 overflow-hidden">
                                <div className={`h-full rounded-full ${patients.length >= 2 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (patients.length / 2) * 100)}%` }}></div>
                            </div>
                            <button onClick={() => navigate('/subscription')} className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors w-full text-left">
                                Upgrade Specialist &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* User info */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 relative">
                    {/* User dropdown menu */}
                    {isUserMenuOpen && (
                        <div className={`absolute bottom-full mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50 ${isCollapsed ? 'left-1/2 -translate-x-1/2 w-44' : 'left-4 right-4'}`}>
                            <NavLink
                                to="/settings"
                                onClick={() => { setIsUserMenuOpen(false); onClose(); }}
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">settings</span>
                                <span>Pengaturan</span>
                            </NavLink>
                            <button
                                onClick={() => { setIsUserMenuOpen(false); signOut(); }}
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full"
                            >
                                <span className="material-symbols-outlined text-[20px]">logout</span>
                                <span>Keluar Akun</span>
                            </button>
                        </div>
                    )}
                    <div className={`flex items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isCollapsed ? 'justify-center' : 'gap-3'}`} onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}>
                        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {(displayName?.charAt(0) || 'U').toUpperCase()}
                        </div>
                        {!isCollapsed && (
                            <div className="overflow-hidden min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold truncate" title={displayName}>{displayName}</p>
                                {isAdmin && (
                                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">Admin</span>
                                    )}
                                    {isSpecialist && !isAdmin && (
                                        <span className="shrink-0 flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary border border-primary/20" title="Specialist">
                                            <span className="material-symbols-outlined text-[12px]">star</span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 truncate whitespace-nowrap">{pinnedStase ? <span className="font-semibold" style={{ color: pinnedStase.color }}>{pinnedStase.name}</span> : 'Belum ada stase aktif'}</p>
                            </div>
                        )}
                        {!isCollapsed && (
                            <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">
                                {isUserMenuOpen ? 'expand_more' : 'expand_less'}
                            </span>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
