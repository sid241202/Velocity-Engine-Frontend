import React from 'react';
import { Zap, ArrowRight } from 'lucide-react';

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

// Base sizing for the two panel-card treatments; `scale` multiplies every
// number below so left/right rail panels (1.5x) and the center Create Rule
// CTA (1.25x) can share one component instead of duplicating markup.
const PANEL_BASE = { gap: 0.75, padY: 0.85, padX: 1, iconBox: 32, iconRadius: 9, iconGlyph: 15, label: 0.82, desc: 0.71, arrow: 13 };
const CTA_BASE = { gap: 1, padY: 1.1, padX: 1.25, iconBox: 40, iconRadius: 11, iconGlyph: 19, label: 0.92, desc: 0.76, arrow: 17 };

/**
 * HomeView — the landing screen after login, and the *only* screen with no
 * nav bar (see Dashboard.jsx) — navigating away from here happens only by
 * picking one of these buttons; the nav bar takes over for movement
 * between panels once you're inside one.
 *
 * Three-column layout, all sitting in front of the ambient animated
 * background: the four "go look at something" panels vertically centered
 * on the left, the welcome moment plus the primary Create Rule call-to-
 * action centered as the page's visual stage, and Admin Panel on the right.
 */
export default function HomeView({ navItems, isNavAllowed, rbacLoading, onNavigate, rules }) {
  const byKey = (key) => navItems.find(n => n.key === key);
  const build = byKey('build');
  const admin = byKey('admin');
  const exploreKeys = ['live', 'agg', 'historical', 'summary'];
  const exploreItems = exploreKeys.map(byKey).filter(Boolean);

  const allowed = (item) => rbacLoading || isNavAllowed(item);

  const isFirstRun = rules.length === 0;

  const PanelCard = ({ item, variant = 'panel', scale = 1 }) => {
    if (!item) return null;
    const ok = allowed(item);
    const Icon = item.icon;
    const isCta = variant === 'cta';
    const b = isCta ? CTA_BASE : PANEL_BASE;
    const px = (n) => `${(n * scale).toFixed(3).replace(/\.?0+$/, '')}rem`;
    return (
      <button
        type="button"
        onClick={() => ok && onNavigate(item.key)}
        disabled={!ok}
        title={ok ? item.tip : `Your role doesn't have access to ${item.label}`}
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: px(b.gap), textAlign: 'left', width: '100%',
          padding: `${px(b.padY)} ${px(b.padX)}`,
          cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.4,
        }}
      >
        <div style={{
          width: b.iconBox * scale, height: b.iconBox * scale, borderRadius: b.iconRadius * scale, flexShrink: 0,
          background: isCta ? 'linear-gradient(135deg, var(--violet), var(--teal))' : 'color-mix(in srgb, var(--violet-light) 12%, transparent)',
          border: isCta ? 'none' : '1px solid color-mix(in srgb, var(--violet-light) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isCta ? '0 4px 16px rgba(var(--violet-rgb),0.35)' : 'none',
        }}>
          <Icon size={b.iconGlyph * scale} color={isCta ? '#fff' : 'var(--violet-light)'} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: px(b.label), color: 'var(--text-1)' }}>{item.label}</span>
            {isCta && isFirstRun && ok && (
              <span className="badge badge-violet" style={{ fontSize: '0.58rem', animation: 'pulse-dot 1.8s ease-in-out infinite' }}>Start here</span>
            )}
          </div>
          <div style={{ fontSize: px(b.desc), color: 'var(--text-3)', marginTop: '0.15rem', lineHeight: 1.4 }}>{item.tip}</div>
        </div>
        <ArrowRight size={b.arrow * scale} color="var(--text-3)" style={{ flexShrink: 0, opacity: ok ? 1 : 0 }} />
      </button>
    );
  };

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
        {/* Left — the four "go look at something" panels, centered as a
            group within the column's full height */}
        <div className="home-col home-col-left">
          {exploreItems.map(item => <PanelCard key={item.key} item={item} variant="panel" scale={1.5} />)}
        </div>

        {/* Center — the welcome stage the background lives behind, with
            the primary Create Rule action right beneath it */}
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
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-3)', margin: '0.6rem 0 0', maxWidth: 340 }}>
            {isFirstRun
              ? 'Real-time fraud detection for Aadhaar authentication traffic — create your first rule to get started.'
              : 'Real-time fraud detection for Aadhaar authentication traffic.'}
          </p>
          <div style={{ marginTop: '2rem', width: '100%', maxWidth: 380 }}>
            <PanelCard item={build} variant="cta" scale={1.25} />
          </div>
        </div>

        {/* Right — Admin Panel, restricted-audience and secondary to the
            left rail's actions */}
        <div className="home-col">
          <PanelCard item={admin} variant="panel" scale={1.5} />
        </div>
      </div>
    </div>
  );
}
