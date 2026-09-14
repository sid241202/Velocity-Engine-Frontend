import React from 'react';
import { Zap } from 'lucide-react';

/**
 * HomeView — the landing screen after login. A menu, not a panel: Create
 * Rule and Admin Panel get top-corner prominence (the two "do something"
 * actions vs. the four "look at something" panels), the other four sit
 * centered below a welcome message. Read left-to-right, top-to-bottom —
 * the two actions are where the eye naturally lands first.
 */
export default function HomeView({ navItems, isNavAllowed, rbacLoading, onNavigate }) {
  const byKey = (key) => navItems.find(n => n.key === key);
  const build = byKey('build');
  const admin = byKey('admin');
  const centerKeys = ['live', 'agg', 'historical', 'summary'];
  const centerItems = centerKeys.map(byKey).filter(Boolean);

  const allowed = (item) => rbacLoading || isNavAllowed(item);

  const CornerButton = ({ item, align }) => {
    if (!item) return null;
    const ok = allowed(item);
    const Icon = item.icon;
    return (
      <button
        type="button"
        onClick={() => ok && onNavigate(item.key)}
        disabled={!ok}
        title={ok ? item.tip : `Your role doesn't have access to ${item.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 1.4rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-2)',
          background: 'var(--surface-2)',
          color: 'var(--text-1)',
          cursor: ok ? 'pointer' : 'not-allowed',
          opacity: ok ? 1 : 0.4,
          fontSize: '0.9rem',
          fontWeight: 700,
          justifySelf: align === 'right' ? 'end' : 'start',
          transition: 'border-color 0.15s ease, transform 0.15s ease',
        }}
        onMouseEnter={e => { if (ok) e.currentTarget.style.borderColor = 'var(--violet)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--violet), var(--teal))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={15} color="#fff" strokeWidth={2.3} />
        </div>
        {item.label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 220px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '2.5rem' }}>
        <CornerButton item={build} align="left" />
        <CornerButton item={admin} align="right" />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 1.25rem',
            background: 'linear-gradient(135deg, var(--violet), var(--teal))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(var(--violet-rgb),0.3), 0 8px 24px rgba(0,0,0,0.35)',
          }}>
            <Zap size={28} color="#fff" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
            Welcome to Velocity Engine
          </h1>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
            Real-time fraud detection for Aadhaar authentication traffic — pick a panel to get started.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
          {centerItems.map(item => {
            const ok = allowed(item);
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => ok && onNavigate(item.key)}
                disabled={!ok}
                title={ok ? item.tip : `Your role doesn't have access to ${item.label}`}
                className="card"
                style={{
                  width: 190, textAlign: 'center', cursor: ok ? 'pointer' : 'not-allowed',
                  opacity: ok ? 1 : 0.4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
                  border: '1px solid var(--border)', transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => { if (ok) e.currentTarget.style.borderColor = 'var(--violet)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'color-mix(in srgb, var(--violet-light) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--violet-light) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color="var(--violet-light)" strokeWidth={2.2} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-1)' }}>{item.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{item.tip}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
