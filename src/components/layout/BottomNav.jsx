import { NavLink } from 'react-router-dom';

const items = [
    { to: '/', icon: 'home', label: 'Beranda' },
    { to: '/patients', icon: 'group', label: 'Pasien' },
    { to: '/add-patient', icon: 'add_circle', label: 'Baru' },
    { to: '/news', icon: 'newspaper', label: 'News' },
    { to: '/reports', icon: 'analytics', label: 'Laporan' },
];

export default function BottomNav() {
    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-around items-center h-14 px-1">
            {items.map(item => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                        `flex flex-col items-center gap-0.5 py-1 px-2 transition-colors min-w-0 ${isActive ? 'text-primary' : 'text-slate-400'
                        }`
                    }
                >
                    <span className="material-symbols-outlined text-xl">{item.icon}</span>
                    <span className="text-[10px] font-medium truncate">{item.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
