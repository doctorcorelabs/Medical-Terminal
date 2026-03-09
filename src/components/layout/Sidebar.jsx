import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useStase } from '../../context/StaseContext';

const navItems = [
    { to: '/', icon: 'home', label: 'Beranda' },
    { to: '/stase', icon: 'assignment', label: 'Stase' },
    { to: '/patients', icon: 'group', label: 'Daftar Pasien' },
    { to: '/add-patient', icon: 'person_add', label: 'Pasien Baru' },
    { to: '/reports', icon: 'analytics', label: 'Laporan' },
    { to: '/news', icon: 'newspaper', label: 'News' },
    { to: '/settings', icon: 'settings', label: 'Pengaturan' },
];

export default function Sidebar({ isOpen, onClose }) {
    const { isDark, toggleTheme } = useTheme();
    const { user, signOut } = useAuth();
    const { pinnedStase } = useStase();
    const [isCollapsed, setIsCollapsed] = useState(false);

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
                                `flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-[22px] shrink-0">{item.icon}</span>
                            {!isCollapsed && <span className="text-sm whitespace-nowrap overflow-hidden">{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Theme toggle */}
                <div className="px-4 py-2 shrink-0">
                    <button
                        onClick={toggleTheme}
                        title={isCollapsed ? (isDark ? 'Mode Terang' : 'Mode Gelap') : ''}
                        className={`flex items-center px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full ${isCollapsed ? 'justify-center' : 'gap-3'}`}
                    >
                        <span className="material-symbols-outlined text-[22px] shrink-0">{isDark ? 'light_mode' : 'dark_mode'}</span>
                        {!isCollapsed && <span className="text-sm whitespace-nowrap overflow-hidden">{isDark ? 'Mode Terang' : 'Mode Gelap'}</span>}
                    </button>
                </div>

                {/* User info */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 group relative">
                    <div className={`flex items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isCollapsed ? 'justify-center' : 'gap-3'}`} onClick={() => signOut()}>
                        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        {!isCollapsed && (
                            <div className="overflow-hidden min-w-0 flex-1">
                                <p className="text-sm font-bold truncate" title={user?.email || 'User'}>{user?.email || 'Dokter Coass'}</p>
                                <p className="text-xs text-slate-500 truncate group-hover:hidden whitespace-nowrap">{pinnedStase ? <span className="font-semibold" style={{ color: pinnedStase.color }}>{pinnedStase.name}</span> : 'Belum ada stase aktif'}</p>
                                <p className="text-xs text-red-500 font-bold hidden group-hover:block transition-all whitespace-nowrap">Keluar Akun</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
