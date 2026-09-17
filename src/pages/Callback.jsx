import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import authService from '../services/AuthService';
import { useAuth } from '../context/AuthContext';
import SessionLoading from '../components/SessionLoading';
import './Callback.css';

const Callback = () => {
  const navigate = useNavigate();
  const auth = useAuth();
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
          // Flip the shared session state right away — this kicks off the
          // RBAC /me fetch in parallel with the "Access Granted" pause below
          // instead of waiting for a route change (or, previously, a hard
          // reload) to notice the new session.
          auth.markAuthenticated();

          setStatus('success');
          setMessage('Authentication successful! Redirecting...');
          setUserInfo({
            name: result.user.profile.name || result.user.profile.username || result.user.profile.ad_id || 'User',
            email: result.user.profile.email,
            userId: result.user.profile.sub
          });

          setTimeout(() => {
            // returnUrl is whitelist-validated in AuthService and can never
            // resolve to '/' (Landing) — always a real post-login
            // destination, so this can't bounce back through the login
            // screen the way it used to.
            navigate(result.returnUrl, { replace: true });
          }, 1000);
        } else {
          throw new Error('No user data received');
        }
      } catch (error) {
        console.error('=== AUTHENTICATION CALLBACK ERROR ===', error);
        auth.markUnauthenticated();
        setStatus('error');
        setMessage(error.message || 'Authentication failed. Please try again.');
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 3000);
      }
    };

    handleAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount; auth's functions are stable (useCallback)
  }, [navigate]);

  if (status === 'processing') {
    return <SessionLoading message={message} />;
  }

  return (
    <div className="cb-root">
      <div className="cb-dot-grid"></div>
      <div className="cb-glow cb-glow-left"></div>
      <div className="cb-glow cb-glow-right"></div>

      <div className="cb-card">
        <div className="cb-top-bar"></div>

        {/* Icon area */}
        <div className="cb-icon-area">
          {status === 'success' && <CheckCircle className="cb-icon-success" />}
          {status === 'error'   && <AlertCircle className="cb-icon-error" />}
        </div>

        {/* Title */}
        <h2 className={`cb-title ${status === 'error' ? 'cb-title-error' : ''} ${status === 'success' ? 'cb-title-success' : ''}`}>
          {status === 'success' && 'Access Granted'}
          {status === 'error'   && 'Access Denied'}
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
