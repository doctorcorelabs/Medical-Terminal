import { NavLink } from 'react-router-dom';

const items = [
    { to: '/', icon: 'home', label: 'Beranda' },
    { to: '/stase', icon: 'assignment', label: 'Stase' },
    { to: '/patients', icon: 'group', label: 'Pasien' },
    { to: '/add-patient', icon: 'add_circle', label: 'Baru' },
    { to: '/schedule', icon: 'calendar_month', label: 'Jadwal' },
    { to: '/reports', icon: 'analytics', label: 'Laporan' },
    { to: '/news', icon: 'newspaper', label: 'News' },
    { to: '/settings', icon: 'settings', label: 'Setelan' },
];

export default function BottomNav() {
    return (
        <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="flex justify-around items-center h-14 px-0.5">
                {items.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-0.5 py-1 px-1 transition-colors min-w-0 flex-1 ${isActive ? 'text-primary' : 'text-slate-400'
                            }`
                        }
                    >
                        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                        <span className="text-[9px] font-medium truncate w-full text-center">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
