import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PatientProvider } from './context/PatientContext';
import { StaseProvider } from './context/StaseContext';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Stase from './pages/Stase';
import PatientList from './pages/PatientList';
import AddPatient from './pages/AddPatient';
import PatientDetail from './pages/PatientDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import News from './pages/News';
import ResetPassword from './pages/ResetPassword';
import Schedule from './pages/Schedule';
import Tools from './pages/Tools';
import ICD10Tool from './pages/tools/ICD10Tool';
import MedCalculator from './pages/tools/MedCalculator';
import { ScheduleProvider } from './context/ScheduleContext';

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
    <ThemeProvider>
      <ToastProvider>
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
              </Routes>
            </div>
          </main>
        </div>
      </ScheduleProvider>
      </PatientProvider>
      </StaseProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
