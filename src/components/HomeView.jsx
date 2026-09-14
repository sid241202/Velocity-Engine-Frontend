import React from 'react';
import { Zap, ArrowRight, Sparkles, CircleDot, FileEdit, PauseCircle } from 'lucide-react';

// Streak rays radiating from the page's visual center — deterministic
// (no Math.random), so the pattern is stable across re-renders instead of
// reshuffling every time React re-renders the page.
const STREAK_COUNT = 16;
const STREAKS = Array.from({ length: STREAK_COUNT }, (_, i) => {
  const angle = (360 / STREAK_COUNT) * i + (i % 2 === 0 ? 5 : -5);
  const rad = (angle * Math.PI) / 180;
  const length = 24 + ((i * 37) % 20); // 24–44, deterministic spread
  return {
    x2: 50 + Math.cos(rad) * length,
    y2: 50 + Math.sin(rad) * length,
    duration: 2.4 + (i % 5) * 0.45,
    delay: -(i * 0.6), // negative delay staggers start points so rays don't pulse in unison
  };
});

/**
 * HomeView — the landing screen after login, and the *only* screen with no
 * nav bar (see Dashboard.jsx) — navigating away from here happens only by
 * picking one of these buttons; the nav bar takes over for movement
 * between panels once you're inside one.
 *
 * Three-column layout: every clickable panel rail on the left (Create
 * Rule first, then the four "go look at something" panels stacked below
 * it), the welcome moment centered as the page's visual stage, Admin
 * Panel + status counts stacked on the right — restricted-audience and
 * passive information, secondary to the left rail's actions.
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
          padding: big ? '1.1rem 1.25rem' : '0.85rem 1rem',
          cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.4,
        }}
      >
        <div style={{
          width: big ? 40 : 32, height: big ? 40 : 32, borderRadius: big ? 11 : 9, flexShrink: 0,
          background: big ? 'linear-gradient(135deg, var(--violet), var(--teal))' : 'color-mix(in srgb, var(--violet-light) 12%, transparent)',
          border: big ? 'none' : '1px solid color-mix(in srgb, var(--violet-light) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: big ? '0 4px 16px rgba(var(--violet-rgb),0.35)' : 'none',
        }}>
          <Icon size={big ? 19 : 15} color={big ? '#fff' : 'var(--violet-light)'} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: big ? '0.92rem' : '0.82rem', color: 'var(--text-1)' }}>{item.label}</span>
            {big && isFirstRun && ok && (
              <span className="badge badge-violet" style={{ fontSize: '0.58rem', animation: 'pulse-dot 1.8s ease-in-out infinite' }}>Start here</span>
            )}
          </div>
          <div style={{ fontSize: big ? '0.76rem' : '0.71rem', color: 'var(--text-3)', marginTop: '0.15rem', lineHeight: 1.4 }}>{item.tip}</div>
        </div>
        <ArrowRight size={big ? 17 : 13} color="var(--text-3)" style={{ flexShrink: 0, opacity: ok ? 1 : 0 }} />
      </button>
    );
  };

  const StatRow = ({ icon: Icon, iconColor, label, value, valueClass }) => (
    <div className="metric-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon size={11} color={iconColor} /> {label}</h3>
      <div className={`value ${valueClass || ''}`} style={{ fontSize: 'var(--fs-lg)' }}>{value}</div>
    </div>
  );

  return (
    <div className="home-shell">
      {/* Ambient live background — see index.css "HOME PAGE" section.
          Purely decorative (aria-hidden), sits behind .home-grid. */}
      <div className="home-bg" aria-hidden="true">
        <div className="home-bg-grid" />
        <div className="home-bg-ribbon home-bg-ribbon--a" />
        <div className="home-bg-ribbon home-bg-ribbon--b" />
        <svg className="home-streaks" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="homeStreakGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93b4ff" stopOpacity="0" />
              <stop offset="50%" stopColor="#93b4ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1fd8a4" stopOpacity="0" />
            </linearGradient>
          </defs>
          {STREAKS.map((s, i) => (
            <line
              key={i}
              className="home-streak"
              x1="50" y1="50" x2={s.x2} y2={s.y2}
              strokeWidth="0.35"
              style={{ animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` }}
            />
          ))}
        </svg>
      </div>

      <div className="home-grid">
        {/* Left — every panel you can actually click into */}
        <div className="home-col">
          <PanelCard item={build} size="lg" />
          {exploreItems.map(item => <PanelCard key={item.key} item={item} />)}
        </div>

        {/* Center — the welcome stage the background lives behind */}
        <div className="home-col-center">
          <div className="home-pulse-wrap">
            <span className="home-pulse-ring" />
            <span className="home-pulse-ring" />
            <span className="home-pulse-ring" />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 18,
              background: 'linear-gradient(135deg, var(--violet), var(--teal))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 1px rgba(var(--violet-rgb),0.3), 0 8px 28px rgba(0,0,0,0.45)',
            }}>
              <Zap size={30} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
            Welcome to Velocity Engine
          </h1>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-3)', margin: '0.6rem 0 0', maxWidth: 320 }}>
            {isFirstRun
              ? 'Real-time fraud detection for Aadhaar authentication traffic — create your first rule to get started.'
              : 'Real-time fraud detection for Aadhaar authentication traffic.'}
          </p>
        </div>

        {/* Right — Admin Panel + status, secondary and restricted-audience */}
        <div className="home-col">
          <PanelCard item={admin} />

          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0.5rem 0 0.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sparkles size={11} /> System Status
          </div>
          <StatRow icon={CircleDot} iconColor="var(--text-3)" label="Total Rules" value={total} />
          <StatRow icon={CircleDot} iconColor="var(--success)" label="Active" value={active} valueClass="value-success" />
          <StatRow icon={FileEdit} iconColor="var(--text-3)" label="Draft" value={draft} />
          <StatRow icon={PauseCircle} iconColor="var(--warning)" label="Paused" value={paused} valueClass="value-warning" />
        </div>
      </div>
    </div>
  );
}
