import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import { ToastContainer } from './components/ui/Toast'
import LoginPage from './pages/auth/LoginPage'
import OnboardingPage from './pages/onboarding/OnboardingPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProvidersPage from './pages/providers/ProvidersPage'
import ProviderProfilePage from './pages/providers/ProviderProfilePage'
import DataTablePage from './pages/data-table/DataTablePage'
import LocationsPage from './pages/locations/LocationsPage'
import CaseTypesPage from './pages/case-types/CaseTypesPage'
import CategoriesPage from './pages/categories/CategoriesPage'
import ConstraintsPage from './pages/constraints/ConstraintsPage'
import QuestionsPage from './pages/questions/QuestionsPage'
import WidgetsPage from './pages/widgets/WidgetsPage'
import WidgetBuilderPage from './pages/widgets/WidgetBuilderPage'
import SettingsPage from './pages/settings/SettingsPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout title="Dashboard">
                  <DashboardPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AppLayout title="Analytics">
                  <AnalyticsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/providers"
            element={
              <ProtectedRoute>
                <AppLayout title="Providers">
                  <ProvidersPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/providers/:id"
            element={
              <ProtectedRoute>
                <AppLayout title="Provider Profile">
                  <ProviderProfilePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/data-table"
            element={
              <ProtectedRoute>
                <AppLayout title="Data Table">
                  <DataTablePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/locations"
            element={
              <ProtectedRoute>
                <AppLayout title="Locations">
                  <LocationsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/case-types"
            element={
              <ProtectedRoute>
                <AppLayout title="Case Types">
                  <CaseTypesPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <AppLayout title="Categories">
                  <CategoriesPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/constraints"
            element={
              <ProtectedRoute>
                <AppLayout title="Constraints">
                  <ConstraintsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/questions"
            element={
              <ProtectedRoute>
                <AppLayout title="Questions">
                  <QuestionsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/widgets"
            element={
              <ProtectedRoute>
                <AppLayout title="My Widgets">
                  <WidgetsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/widgets/:id"
            element={
              <ProtectedRoute>
                <AppLayout title="Widget Builder">
                  <WidgetBuilderPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AppLayout title="Settings">
                  <SettingsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
