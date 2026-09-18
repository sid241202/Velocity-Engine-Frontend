import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Callback from './pages/Callback';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './pages/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { RBACProvider } from './context/RBACContext';

// AuthProvider owns session status (authentication); RBACProvider reads it
// and resolves roles/permissions (authorization) once a session exists —
// kept as separate contexts/concerns, but RBACProvider now depends on
// AuthProvider's state rather than fetching independently, so the two never
// resolve out of order relative to each other. See AuthContext.jsx and
// RBACContext.jsx.

function App() {
  return (
    <AuthProvider>
      <RBACProvider>
        <Router>
          <div className="App flex flex-col min-h-screen">
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/callback" element={<Callback />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Catch-all: send everything to dashboard (ProtectedRoute redirects to "/" if not authenticated) */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </main>
          </div>
        </Router>
      </RBACProvider>
    </AuthProvider>
  );
}

export default App;
