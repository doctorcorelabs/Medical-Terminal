import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { PatientProvider } from './context/PatientContext';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import AddPatient from './pages/AddPatient';
import PatientDetail from './pages/PatientDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';

export default function App() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!user) {
    return <Login />;
  }

  return (
    <ThemeProvider>
      <PatientProvider>
        <Router>
          <div className="flex h-screen overflow-hidden bg-[#f6f7f8] dark:bg-[#101822] text-slate-900 dark:text-slate-100">
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
                  <Route path="/patients" element={<PatientList />} />
                  <Route path="/add-patient" element={<AddPatient />} />
                  <Route path="/patient/:id" element={<PatientDetail />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </div>
            </main>

            {/* Bottom Nav - Mobile only */}
            <BottomNav />
          </div>
        </Router>
      </PatientProvider>
    </ThemeProvider>
  );
}
