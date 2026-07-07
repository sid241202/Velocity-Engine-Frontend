import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import Landing from './pages/Landing';         // WSO2_DISABLED: Landing page hidden
// import Callback from './pages/Callback';       // WSO2_DISABLED: OAuth callback hidden
import Dashboard from './pages/Dashboard';
// import ProtectedRoute from './pages/ProtectedRoute'; // WSO2_DISABLED: Auth guard bypassed
import { RBACProvider } from './context/RBACContext';

// ─────────────────────────────────────────────────────────────────────────────
// WSO2 OAuth is TEMPORARILY DISABLED for local testing and staging deployment.
// To re-enable: uncomment the imports above and restore the original Routes below.
//
// RBACProvider is independent of WSO2/authentication — it resolves the
// current user's roles/permissions (via the AuthDevMode identity shim for
// now, real tokens later) and is needed regardless of which auth phase is
// active, so it wraps the router below.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <RBACProvider>
      <Router>
        <div className="App flex flex-col min-h-screen">
          <main className="flex-grow">
            <Routes>
              {/* WSO2_DISABLED: Route directly to dashboard, skip login */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* WSO2_DISABLED: Callback route removed — no OAuth redirect needed */}
              {/* <Route path="/callback" element={<Callback />} /> */}

              {/* Catch-all: send everything to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </RBACProvider>
  );
}

export default App;
