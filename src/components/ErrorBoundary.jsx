import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary catches render-time JavaScript errors in any child component tree.
 * Instead of crashing the entire app to a blank screen, it renders a clean fallback UI.
 *
 * Usage:
 *   <ErrorBoundary label="Live Analysis">
 *     <LiveAnalysis ... />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for developer visibility — no third-party tracking
    console.error(`[ErrorBoundary:${this.props.label || 'Component'}] Uncaught error:`, error, errorInfo);
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { label = 'Component', showDetails = false } = this.props;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '320px',
          gap: '1.25rem',
          padding: '2rem',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '12px',
          background: 'rgba(239, 68, 68, 0.04)',
        }}
      >
        <AlertTriangle size={40} color="#ef4444" style={{ opacity: 0.8 }} />
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: '#f1f5f9',
              fontSize: '1rem',
              fontWeight: 600,
              margin: '0 0 0.5rem',
            }}
          >
            {label} encountered an unexpected error
          </p>
          <p
            style={{
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.8rem',
              maxWidth: '400px',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            A rendering error occurred — this section has been isolated to prevent the rest of the
            application from being affected.
          </p>
        </div>

        {showDetails && this.state.error && (
          <pre
            style={{
              fontSize: '0.72rem',
              color: '#ef4444',
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              maxWidth: '100%',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.toString()}
          </pre>
        )}

        <button
          onClick={this.handleReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
        >
          <RefreshCw size={13} />
          Try again
        </button>
      </div>
    );
  }
}
