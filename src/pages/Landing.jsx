import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  Fingerprint,
  Zap,
  Shield,
  Activity,
  AlertCircle,
  Sliders,
  BarChart3,
  FolderGit2
} from 'lucide-react';
import authService from '../services/AuthService';
import { useAuth } from '../context/AuthContext';
import SessionLoading from '../components/SessionLoading';
import './Landing.css';

const LandingPage = () => {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // AuthContext (not a separate probe here) owns session state — Landing
  // just reacts to it. Navigating client-side (not window.location.href)
  // avoids the hard reload that used to re-bootstrap the whole app and
  // restart the RBAC/permission race from scratch.
  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, navigate]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await authService.login();
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to initiate login. Please try again.');
      setLoading(false);
    }
  };

  // While the session is still being probed, or once it resolves
  // authenticated and we're about to navigate away, never show the "Sign In"
  // form — a user who is (or might already be) logged in landing here (e.g.
  // browser back button) should see the same loading transition as everyone
  // else mid-bootstrap, not a flash of the login screen.
  if (status === 'checking' || status === 'authenticated') {
    return <SessionLoading message="Verifying secure access..." />;
  }

  return (
    <div className="landing-root">
      {/* Neo-brutalist Background Elements */}
      <div className="dot-grid"></div>
      <div className="glow glow-left"></div>
      <div className="glow glow-right"></div>

      <div className="landing-layout">
        {/* ── Left Panel: Brand Architecture ── */}
        <div className="left-panel">
          <div className="brand-badge">
            <Shield size={14} className="badge-icon" />
            <span>UIDAI Fraud Detection System</span>
          </div>

          <h1 className="hero-title">
            Velocity Engine<br />
            <span className="hero-accent">Control Plane</span>
          </h1>

          <p className="hero-sub">
            High-velocity, secure internal platform designed for authorized personnel 
            to monitor, build, and analyze real-time fraud detection rules to catch 
            fraudulent biometric and data entries at scale.
          </p>

          {/* Key Metrics / Capabilities Display */}
          <div className="stats-row">
            <div className="stat-card">
              <Zap size={20} className="stat-icon metric-orange" />
              <div className="stat-value">100K+</div>
              <div className="stat-label">Events / Day</div>
            </div>
            <div className="stat-card">
              <Activity size={20} className="stat-icon metric-cyan" />
              <div className="stat-value">Real-Time</div>
              <div className="stat-label">Data Processing</div>
            </div>
            <div className="stat-card">
              <BarChart3 size={20} className="stat-icon metric-indigo" />
              <div className="stat-value">Multi-Layer</div>
              <div className="stat-label">Analytics Engine</div>
            </div>
          </div>

          {/* Feature Architecture Pills */}
          <div className="pill-row">
            <span className="pill">
              <Sliders size={13} /> Declarative Rule Building
            </span>
            <span className="pill">
              <FolderGit2 size={13} /> Rule Cataloging & Management
            </span>
            <span className="pill">
              <Shield size={13} /> Enterprise Security
            </span>
          </div>
        </div>

        {/* ── Right Panel: Gatekeeper Login Card ── */}
        <div className="right-panel">
          <div className="login-card">
            <div className="card-top-bar"></div>

            <div className="fp-wrapper">
              <Fingerprint className="fp-icon" />
              <span className="ring ring-1"></span>
              <span className="ring ring-2"></span>
            </div>

            <h2 className="card-heading">Secure Access</h2>
            <p className="card-sub">Restricted to authorised UIDAI personnel only</p>

            {error && (
              <div className="error-banner">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={loading}
              className={`access-btn ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <svg className="spin-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                <>
                  <Eye size={18} />
                  Sign In with SSO
                </>
              )}
            </button>

            <p className="secure-note">
              <Shield size={12} />
              Secured by WSO2 Identity Server
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;