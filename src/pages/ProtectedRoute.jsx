import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/AuthService';

// Note: Make sure to import your CSS file here
// import './YourStyles.css'; 

/**
 * ProtectedRoute Component
 * Wraps routes that require authentication
 * Redirects to landing page if user is not authenticated
 */
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if dev mode is enabled
      const devMode = sessionStorage.getItem('dev_mode') === 'true';
      if (devMode) {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }
      
      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Error checking authentication:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Show modern, dark-themed loading overlay while checking authentication
  if (isLoading) {
    return (
      <div className="landing-root">
        {/* Background elements */}
        <div className="dot-grid"></div>
        <div className="glow glow-left"></div>
        <div className="glow glow-right"></div>

        {/* Centered Loading Card */}
        <div className="login-card" style={{ margin: '0 auto', padding: '2.5rem', maxWidth: '380px' }}>
          <div className="card-top-bar"></div>
          
          {/* Animated Pulse & Spinner */}
          <div className="fp-wrapper">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <svg 
              className="spin-svg" 
              style={{ width: '36px', height: '36px', color: 'var(--accent-cyan)' }} 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
            </svg>
          </div>
          
          {/* Loading Text */}
          <h2 className="card-heading" style={{ fontSize: '1.4rem' }}>Authenticating</h2>
          <div className="secure-note">
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            Verifying secure access
          </div>
        </div>
      </div>
    );
  }

  // Redirect to landing page if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Render protected content if authenticated
  return children;
};

export default ProtectedRoute;