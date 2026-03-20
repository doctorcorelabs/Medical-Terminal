import { useState, Suspense } from 'react';
import { lazyRetry } from './utils/lazyRetry';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PatientProvider } from './context/PatientContext';
import { StaseProvider } from './context/StaseContext';
import { useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import { AdminAlertProvider } from './context/AdminAlertContext';
import { CopilotProvider } from './context/CopilotContext';
import AdminRoute from './components/AdminRoute';
import FeatureGate from './components/FeatureGate';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import CopilotChat from './components/common/CopilotChat';
// Eager — rendered immediately on first load or before auth check
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
// Lazy — split into separate chunks to reduce initial bundle size
const Stase           = lazyRetry(() => import('./pages/Stase'));
const PatientList     = lazyRetry(() => import('./pages/PatientList'));
const AddPatient      = lazyRetry(() => import('./pages/AddPatient'));
const PatientDetail   = lazyRetry(() => import('./pages/PatientDetail'));
const News            = lazyRetry(() => import('./pages/News'));
const Reports         = lazyRetry(() => import('./pages/Reports'));
const Settings        = lazyRetry(() => import('./pages/Settings'));
const Schedule        = lazyRetry(() => import('./pages/Schedule'));
const Tools           = lazyRetry(() => import('./pages/Tools'));
const ICD10Tool       = lazyRetry(() => import('./pages/tools/ICD10Tool'));
const MedCalculator   = lazyRetry(() => import('./pages/tools/MedCalculator'));
const DrugInteraction = lazyRetry(() => import('./pages/tools/DrugInteraction'));
const FornasDrug      = lazyRetry(() => import('./pages/tools/FornasDrug'));
const EmergencyDose   = lazyRetry(() => import('./pages/tools/EmergencyDose'));
const InfusionCalc    = lazyRetry(() => import('./pages/tools/InfusionCalc'));
const PharmacokineticCalc = lazyRetry(() => import('./pages/tools/PharmacokineticCalc'));
const NutritionCalc   = lazyRetry(() => import('./pages/tools/NutritionCalc'));
const PediatricCalc   = lazyRetry(() => import('./pages/tools/PediatricCalc'));
const AdminDashboard  = lazyRetry(() => import('./pages/admin/AdminDashboard'));
const AdminUsers      = lazyRetry(() => import('./pages/admin/AdminUsers'));
const AdminFeatures   = lazyRetry(() => import('./pages/admin/AdminFeatures'));
const AdminAnalytics  = lazyRetry(() => import('./pages/admin/AdminAnalytics'));
const AdminAnnouncements = lazyRetry(() => import('./pages/admin/AdminAnnouncements'));
const AdminAlerts = lazyRetry(() => import('./pages/admin/AdminAlerts'));
const AdminUserTimeline = lazyRetry(() => import('./pages/admin/AdminUserTimeline'));
const Subscription = lazyRetry(() => import('./pages/Subscription'));
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
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/subscription" element={<Subscription />} />
                  <Route path="/tools" element={<Tools />} />
                  <Route path="/tools/icd10" element={<FeatureGate featureKey="icd10"><ICD10Tool /></FeatureGate>} />
                  <Route path="/tools/calculator" element={<FeatureGate featureKey="calculator"><MedCalculator /></FeatureGate>} />
                  <Route path="/tools/drug-interaction" element={<FeatureGate featureKey="drug-interaction"><DrugInteraction /></FeatureGate>} />
                  <Route path="/tools/fornas" element={<FeatureGate featureKey="fornas"><FornasDrug /></FeatureGate>} />
                  <Route path="/tools/emergency-dose" element={<FeatureGate featureKey="emergency-dose"><EmergencyDose /></FeatureGate>} />
                  <Route path="/tools/infusion" element={<FeatureGate featureKey="infusion-calc"><InfusionCalc /></FeatureGate>} />
                  <Route path="/tools/pharmacokinetics" element={<FeatureGate featureKey="pharmacokinetics"><PharmacokineticCalc /></FeatureGate>} />
                  <Route path="/tools/nutrition-bsa" element={<FeatureGate featureKey="nutrition-bsa"><NutritionCalc /></FeatureGate>} />
                  <Route path="/tools/pediatric" element={<FeatureGate featureKey="pediatric-calc"><PediatricCalc /></FeatureGate>} />
                  <Route path="/news" element={<FeatureGate featureKey="news"><News /></FeatureGate>} />
                  <Route path="/reports" element={<FeatureGate featureKey="reports"><Reports /></FeatureGate>} />
                  <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                  <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                  <Route path="/admin/features" element={<AdminRoute><AdminFeatures /></AdminRoute>} />
                  <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                  <Route path="/admin/announcements" element={<AdminRoute><AdminAnnouncements /></AdminRoute>} />
                  <Route path="/admin/alerts" element={<AdminRoute><AdminAlerts /></AdminRoute>} />
                  <Route path="/admin/timeline" element={<AdminRoute><AdminUserTimeline /></AdminRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </div>
          </main>
          <CopilotChat />
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
            <FeatureFlagProvider>
              <AdminAlertProvider>
                <CopilotProvider>
                  <AppContent />
                </CopilotProvider>
              </AdminAlertProvider>
            </FeatureFlagProvider>
          </OfflineProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>
  );
}

