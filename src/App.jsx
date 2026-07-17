import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Callback from './pages/Callback';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './pages/ProtectedRoute';
import { RBACProvider } from './context/RBACContext';

// RBACProvider is independent of WSO2/authentication — it resolves the
// current user's roles/permissions (via GET /me) and wraps the router below
// regardless of auth state (authorization vs. authentication, kept separate).

function App() {
  return (
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
  );
}

export default App;
