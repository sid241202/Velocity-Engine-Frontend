import React from 'react';
import { Zap, ArrowRight, Sparkles, CircleDot, FileEdit, PauseCircle } from 'lucide-react';

/**
 * HomeView — the landing screen after login, and the *only* screen with no
 * nav bar (see Dashboard.jsx) — navigating away from here happens only by
 * picking one of these buttons; the nav bar takes over for movement
 * between panels once you're inside one.
 *
 * Layout: left column holds every panel you can actually click into
 * (Create Rule first — it's the one every session eventually leads to —
 * then the four "go look at something" panels), right column holds Admin
 * Panel and the status counts — restricted audience and passive
 * information, so they sit secondary, top-to-bottom and left-to-right
 * matching how the eye actually scans.
 */
export default function HomeView({ navItems, isNavAllowed, rbacLoading, onNavigate, rules }) {
  const byKey = (key) => navItems.find(n => n.key === key);
  const build = byKey('build');
  const admin = byKey('admin');
  const exploreKeys = ['live', 'agg', 'historical', 'summary'];
  const exploreItems = exploreKeys.map(byKey).filter(Boolean);

  const allowed = (item) => rbacLoading || isNavAllowed(item);

  const total = rules.length;
  const active = rules.filter(r => r.rule_metadata?.status === 'ACTIVE').length;
  const draft = rules.filter(r => r.rule_metadata?.status === 'DRAFT').length;
  const paused = rules.filter(r => r.rule_metadata?.status === 'PAUSED').length;
  const isFirstRun = total === 0;

  const PanelCard = ({ item, size = 'md' }) => {
    if (!item) return null;
    const ok = allowed(item);
    const Icon = item.icon;
    const big = size === 'lg';
    return (
      <button
        type="button"
        onClick={() => ok && onNavigate(item.key)}
        disabled={!ok}
        title={ok ? item.tip : `Your role doesn't have access to ${item.label}`}
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: big ? '1rem' : '0.75rem', textAlign: 'left', width: '100%',
          padding: big ? '1.15rem 1.4rem' : '0.9rem 1.1rem',
          cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.4,
          position: 'relative',
        }}
      >
        <div style={{
          width: big ? 42 : 34, height: big ? 42 : 34, borderRadius: big ? 12 : 9, flexShrink: 0,
          background: big ? 'linear-gradient(135deg, var(--violet), var(--teal))' : 'color-mix(in srgb, var(--violet-light) 12%, transparent)',
          border: big ? 'none' : '1px solid color-mix(in srgb, var(--violet-light) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: big ? '0 4px 16px rgba(var(--violet-rgb),0.35)' : 'none',
        }}>
          <Icon size={big ? 20 : 16} color={big ? '#fff' : 'var(--violet-light)'} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: big ? '0.95rem' : '0.84rem', color: 'var(--text-1)' }}>{item.label}</span>
            {big && isFirstRun && ok && (
              <span className="badge badge-violet" style={{ fontSize: '0.6rem', animation: 'pulse-dot 1.8s ease-in-out infinite' }}>Start here</span>
            )}
          </div>
          <div style={{ fontSize: big ? '0.78rem' : '0.72rem', color: 'var(--text-3)', marginTop: '0.15rem', lineHeight: 1.4 }}>{item.tip}</div>
        </div>
        <ArrowRight size={big ? 18 : 14} color="var(--text-3)" style={{ flexShrink: 0, opacity: ok ? 1 : 0 }} />
      </button>
    );
  };

  return (
    <div className="home-shell">
      {/* Ambient live background — see index.css "HOME PAGE" section */}
      <div className="home-bg" aria-hidden="true">
        <div className="home-bg-grid" />
        <div className="home-bg-orb home-bg-orb--violet" />
        <div className="home-bg-orb home-bg-orb--teal" />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Welcome header */}
        <div style={{ textAlign: 'center', padding: '1.75rem 1rem 2rem' }}>
          <div className="home-pulse-wrap">
            <span className="home-pulse-ring" />
            <span className="home-pulse-ring" />
            <span className="home-pulse-ring" />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 16,
              background: 'linear-gradient(135deg, var(--violet), var(--teal))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 1px rgba(var(--violet-rgb),0.3), 0 8px 28px rgba(0,0,0,0.4)',
            }}>
              <Zap size={28} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
            Welcome to Velocity Engine
          </h1>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
            {isFirstRun
              ? 'Real-time fraud detection for Aadhaar authentication traffic — create your first rule to get started.'
              : 'Real-time fraud detection for Aadhaar authentication traffic.'}
          </p>
        </div>

        <div className="home-grid">
          {/* Left — everything you can actually click into */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <PanelCard item={build} size="lg" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
              {exploreItems.map(item => <PanelCard key={item.key} item={item} />)}
            </div>
          </div>

          {/* Right — Admin Panel + status, secondary and restricted-audience */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <PanelCard item={admin} />

            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0.5rem 0 0.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={11} /> System Status
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div className="metric-card" style={{ padding: '0.7rem 0.8rem' }}>
                <h3>Total</h3>
                <div className="value" style={{ fontSize: 'var(--fs-xl)' }}>{total}</div>
              </div>
              <div className="metric-card" style={{ padding: '0.7rem 0.8rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 3 }}><CircleDot size={10} color="var(--success)" /> Active</h3>
                <div className="value value-success" style={{ fontSize: 'var(--fs-xl)' }}>{active}</div>
              </div>
              <div className="metric-card" style={{ padding: '0.7rem 0.8rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 3 }}><FileEdit size={10} color="var(--text-3)" /> Draft</h3>
                <div className="value" style={{ fontSize: 'var(--fs-xl)' }}>{draft}</div>
              </div>
              <div className="metric-card" style={{ padding: '0.7rem 0.8rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 3 }}><PauseCircle size={10} color="var(--warning)" /> Paused</h3>
                <div className="value value-warning" style={{ fontSize: 'var(--fs-xl)' }}>{paused}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
