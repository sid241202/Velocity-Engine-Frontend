import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import authService from '../services/AuthService';
import './Callback.css';

const Callback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('=== CALLBACK COMPONENT MOUNTED ===');
        console.log('Current URL:', window.location.href);
        console.log('Search params:', window.location.search);
        console.log('Hash:', window.location.hash);

        setStatus('processing');
        setMessage('Validating authorization code...');

        console.log('Calling authService.handleCallback()...');

        const result = await authService.handleCallback();

        console.log('handleCallback completed successfully');
        console.log('Result:', result);

        if (result && result.user) {
          setStatus('success');
          setMessage('Authentication successful! Redirecting...');
          setUserInfo({
            name: result.user.profile.name || result.user.profile.username || result.user.profile.ad_id || 'User',
            email: result.user.profile.email,
            userId: result.user.profile.sub
          });

          setTimeout(() => {
            navigate(result.returnUrl, { replace: true });
          }, 1000);
        } else {
          throw new Error('No user data received');
        }
      } catch (error) {
        console.error('=== AUTHENTICATION CALLBACK ERROR ===', error);
        setStatus('error');
        setMessage(error.message || 'Authentication failed. Please try again.');
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="cb-root">
      <div className="cb-dot-grid"></div>
      <div className="cb-glow cb-glow-left"></div>
      <div className="cb-glow cb-glow-right"></div>

      <div className="cb-card">
        <div className="cb-top-bar"></div>

        {/* Icon area */}
        <div className="cb-icon-area">
          {status === 'processing' && (
            <div className="cb-fp-wrap">
              <Fingerprint className="cb-fp-icon" />
              <span className="cb-ring cb-ring-1"></span>
              <span className="cb-ring cb-ring-2"></span>
              <svg className="cb-spin-ring" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="46" stroke="#00d2a0" strokeWidth="2" strokeDasharray="60 230" strokeLinecap="round" />
              </svg>
            </div>
          )}
          {status === 'success' && <CheckCircle className="cb-icon-success" />}
          {status === 'error'   && <AlertCircle className="cb-icon-error" />}
        </div>

        {/* Title */}
        <h2 className={`cb-title ${status === 'error' ? 'cb-title-error' : ''} ${status === 'success' ? 'cb-title-success' : ''}`}>
          {status === 'processing' && 'Authenticating'}
          {status === 'success'    && 'Access Granted'}
          {status === 'error'      && 'Access Denied'}
        </h2>

        <p className="cb-message">{message}</p>

        {/* User info on success */}
        {status === 'success' && userInfo && (
          <div className="cb-user-card">
            <span className="cb-user-label">Signed in as</span>
            <span className="cb-user-name">{userInfo.name}</span>
            {userInfo.email && <span className="cb-user-email">{userInfo.email}</span>}
          </div>
        )}

        {/* Loading dots */}
        {status === 'processing' && (
          <div className="cb-dots">
            <span className="cb-dot cb-dot-1"></span>
            <span className="cb-dot cb-dot-2"></span>
            <span className="cb-dot cb-dot-3"></span>
          </div>
        )}

        {/* Redirect hint */}
        {status === 'success' && (
          <p className="cb-redirect-hint">Redirecting to dashboard...</p>
        )}

        {/* Error action */}
        {status === 'error' && (
          <button className="cb-back-btn" onClick={() => navigate('/', { replace: true })}>
            <ArrowLeft size={15} />
            Return to Sign In
          </button>
        )}

        <p className="cb-footer">Secured by WSO2 Identity Server • OIDC</p>
      </div>
    </div>
  );
};

export default Callback;
