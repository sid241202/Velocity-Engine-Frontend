import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/AuthService';
import { SIMULATION_MODE } from '../simulation/mockAdminData';

const ProtectedRoute = ({ children }) => {
  // SIMULATION MODE (admin-panel-simulation branch only — see
  // src/simulation/mockAdminData.js): skip real WSO2 auth entirely so the
  // Admin Panel simulation is reachable with nothing but `npm run dev`.
  // Hooks are still called unconditionally below (SIMULATION_MODE is a
  // module constant, never changes between renders) — it just makes
  // checkAuth() a no-op and starts already "authenticated".
  const [isAuthenticated, setIsAuthenticated] = useState(SIMULATION_MODE ? true : null);
  const [isLoading, setIsLoading] = useState(!SIMULATION_MODE);

  useEffect(() => {
    if (SIMULATION_MODE) return;
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Error checking authentication:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="landing-root">
        <div className="dot-grid"></div>
        <div className="glow glow-left"></div>
        <div className="glow glow-right"></div>
        <div className="login-card" style={{ margin: '0 auto', padding: '2.5rem', maxWidth: '380px' }}>
          <div className="card-top-bar"></div>
          <div className="fp-wrapper">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <svg className="spin-svg" style={{ width: '36px', height: '36px', color: 'var(--accent-cyan)' }}
              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
            </svg>
          </div>
          <h2 className="card-heading" style={{ fontSize: '1.4rem' }}>Authenticating</h2>
          <div className="secure-note">Verifying secure access</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
