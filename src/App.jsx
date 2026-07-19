import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

// ─────────────────────────────────────────────────────────────────────────────
// This branch has no auth/identity/RBAC layer at all — every request is
// treated as a single implicit user, and the app loads straight into
// Dashboard with no login gate. See this repo's CLAUDE.md.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <Router>
      <div className="App flex flex-col min-h-screen">
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Catch-all: send everything to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
