import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoadingSpinner from './components/ui/LoadingSpinner'
import { ToastContainer } from './components/ui/Toast'

// Every page is its own chunk, fetched on first navigation rather than
// bundled into the initial load. DataTablePage alone pulls in xlsx and
// @tanstack/react-table, which no one needs just to log in and see the
// dashboard.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ProvidersPage = lazy(() => import('./pages/providers/ProvidersPage'))
const ProviderProfilePage = lazy(() => import('./pages/providers/ProviderProfilePage'))
const DataTablePage = lazy(() => import('./pages/data-table/DataTablePage'))
const LocationsPage = lazy(() => import('./pages/locations/LocationsPage'))
const CaseTypesPage = lazy(() => import('./pages/case-types/CaseTypesPage'))
const CategoriesPage = lazy(() => import('./pages/categories/CategoriesPage'))
const ConstraintsPage = lazy(() => import('./pages/constraints/ConstraintsPage'))
const QuestionsPage = lazy(() => import('./pages/questions/QuestionsPage'))
const WidgetsPage = lazy(() => import('./pages/widgets/WidgetsPage'))
const WidgetBuilderPage = lazy(() => import('./pages/widgets/WidgetBuilderPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
