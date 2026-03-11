import { useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PatientProvider } from './context/PatientContext';
import { StaseProvider } from './context/StaseContext';
import { useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
// Eager — rendered immediately on first load or before auth check
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
// Lazy — split into separate chunks to reduce initial bundle size
const Stase           = lazy(() => import('./pages/Stase'));
const PatientList     = lazy(() => import('./pages/PatientList'));
const AddPatient      = lazy(() => import('./pages/AddPatient'));
const PatientDetail   = lazy(() => import('./pages/PatientDetail'));
const News            = lazy(() => import('./pages/News'));
const Reports         = lazy(() => import('./pages/Reports'));
const Settings        = lazy(() => import('./pages/Settings'));
const Schedule        = lazy(() => import('./pages/Schedule'));
const Tools           = lazy(() => import('./pages/Tools'));
const ICD10Tool       = lazy(() => import('./pages/tools/ICD10Tool'));
const MedCalculator   = lazy(() => import('./pages/tools/MedCalculator'));
const DrugInteraction = lazy(() => import('./pages/tools/DrugInteraction'));
const FornasDrug      = lazy(() => import('./pages/tools/FornasDrug'));
const ConflictCenter  = lazy(() => import('./pages/ConflictCenter'));
import { ScheduleProvider } from './context/ScheduleContext';

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-primary text-3xl">
        progress_activity
      </span>
    </div>
  );
}

function AppContent() {
  const { user, isRecoveryMode } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();

  // Always allow the reset-password route regardless of auth state
  if (location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (!user || isRecoveryMode) {
    return <Login />;
  }

  return (
    <StaseProvider>
      <PatientProvider>
      <ScheduleProvider>
        <div className="flex h-dvh overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
          {/* Sidebar - desktop always visible, mobile toggle */}
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <Header
              onMenuToggle={() => setSidebarOpen(prev => !prev)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/stase" element={<Stase />} />
                  <Route path="/patients" element={<PatientList />} />
                  <Route path="/add-patient" element={<AddPatient />} />
                  <Route path="/patient/:id" element={<PatientDetail />} />
                  <Route path="/news" element={<News />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/tools" element={<Tools />} />
                  <Route path="/tools/icd10" element={<ICD10Tool />} />
                  <Route path="/tools/calculator" element={<MedCalculator />} />
                  <Route path="/tools/drug-interaction" element={<DrugInteraction />} />
                  <Route path="/tools/fornas" element={<FornasDrug />} />
                  <Route path="/conflicts" element={<ConflictCenter />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      </ScheduleProvider>
      </PatientProvider>
    </StaseProvider>
  );
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <ToastProvider>
          <OfflineProvider>
            <AppContent />
          </OfflineProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>
  );
}
