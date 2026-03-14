export default function MaintenanceBox({ message }) {
    return (
        <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
            <div className="max-w-md w-full text-center">
                <div className="mx-auto mb-6 size-20 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-5xl text-amber-500">construction</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    Fitur Sedang Perbaikan
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {message ?? 'Fitur ini sedang dalam perbaikan. Mohon coba beberapa saat lagi.'}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    Akan segera kembali
                </div>
            </div>
        </div>
    );
}
