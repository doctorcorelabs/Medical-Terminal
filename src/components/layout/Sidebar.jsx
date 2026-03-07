import { NavLink } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

const navItems = [
    { to: '/', icon: 'home', label: 'Beranda' },
    { to: '/patients', icon: 'group', label: 'Daftar Pasien' },
    { to: '/add-patient', icon: 'person_add', label: 'Pasien Baru' },
    { to: '/reports', icon: 'analytics', label: 'Laporan' },
    { to: '/settings', icon: 'settings', label: 'Pengaturan' },
];

export default function Sidebar({ isOpen, onClose }) {
    const { isDark, toggleTheme } = useTheme();

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />
            )}

            <aside className={`
        fixed lg:relative z-50 w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                {/* Logo */}
                <div className="p-6 flex items-center gap-3 flex-shrink-0">
                    <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center">
                        <span className="material-symbols-outlined text-white">medical_services</span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-primary">MedTerminal</h1>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                            <span className="text-sm">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Theme toggle */}
                <div className="px-4 py-2 flex-shrink-0">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full"
                    >
                        <span className="material-symbols-outlined text-[22px]">{isDark ? 'light_mode' : 'dark_mode'}</span>
                        <span className="text-sm">{isDark ? 'Mode Terang' : 'Mode Gelap'}</span>
                    </button>
                </div>

                {/* User info */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            DC
                        </div>
                        <div className="overflow-hidden min-w-0">
                            <p className="text-sm font-bold truncate">Dokter Coass</p>
                            <p className="text-xs text-slate-500 truncate">Stase Aktif</p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
