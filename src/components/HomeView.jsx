import React from 'react';
import { Zap, ArrowRight, Shield, CircleDot, FileEdit } from 'lucide-react';

/**
 * HomeView — the landing screen after login, and the *only* screen with no
 * nav bar (see Dashboard.jsx) — navigation away from here happens only by
 * picking one of these buttons; the nav bar takes over for movement
 * between panels once you're inside one. That split is deliberate: a
 * first-time user picks a destination once, deliberately, rather than
 * skimming six equally-weighted tabs before they know what any of them do.
 *
 * Layout follows a top-to-bottom decreasing-commitment order: the one
 * action every session eventually leads to (Create Rule) and the one
 * gated to a few people (Admin Panel) get the corners — first place the
 * eye lands. Welcome + at-a-glance counts orient a returning user. The
 * four "go look at something" panels sit last, as a wide, evenly-filled
 * row rather than a cluster of small fixed-width buttons floating in
 * empty space.
 */
export default function HomeView({ navItems, isNavAllowed, rbacLoading, onNavigate, rules }) {
  const byKey = (key) => navItems.find(n => n.key === key);
  const build = byKey('build');
  const admin = byKey('admin');
  const centerKeys = ['live', 'agg', 'historical', 'summary'];
  const centerItems = centerKeys.map(byKey).filter(Boolean);

  const allowed = (item) => rbacLoading || isNavAllowed(item);

  const total = rules.length;
  const active = rules.filter(r => r.rule_metadata?.status === 'ACTIVE').length;
  const draft = rules.filter(r => r.rule_metadata?.status === 'DRAFT').length;
  const paused = rules.filter(r => r.rule_metadata?.status === 'PAUSED').length;

  const ActionCard = ({ item, description, accent }) => {
    if (!item) return null;
    const ok = allowed(item);
    const Icon = item.icon;
    return (
      <button
        type="button"
        onClick={() => ok && onNavigate(item.key)}
        disabled={!ok}
        title={ok ? item.tip : `Your role doesn't have access to ${item.label}`}
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left',
          padding: '1.25rem 1.5rem', cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.4,
          border: `1px solid color-mix(in srgb, ${accent} 20%, var(--border))`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 7%, var(--surface-2)), var(--surface-2))`,
        }}
        onMouseEnter={e => { if (ok) e.currentTarget.style.borderColor = accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${accent} 20%, var(--border))`; }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${accent}, var(--teal))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 16px color-mix(in srgb, ${accent} 35%, transparent)`,
        }}>
          <Icon size={22} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>{item.label}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>{description}</div>
        </div>
        <ArrowRight size={18} color="var(--text-3)" style={{ flexShrink: 0, opacity: ok ? 1 : 0 }} />
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Corner actions — the two entry points that aren't "go look at data" */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <ActionCard item={build} description="Describe what unusual activity looks like, step by step" accent="var(--violet)" />
        <ActionCard item={admin} description="Manage users, teams, and roles" accent="var(--teal)" />
      </div>

      {/* Welcome hero */}
      <div style={{
        textAlign: 'center', padding: '2.5rem 1rem',
        borderRadius: 'var(--radius-lg)',
        background: 'radial-gradient(ellipse at center, rgba(var(--violet-rgb),0.08), transparent 70%)',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, margin: '0 auto 1.25rem',
          background: 'linear-gradient(135deg, var(--violet), var(--teal))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 1px rgba(var(--violet-rgb),0.3), 0 8px 28px rgba(0,0,0,0.4)',
        }}>
          <Zap size={30} color="#fff" strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          Welcome to Velocity Engine
        </h1>
        <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
          Real-time fraud detection for Aadhaar authentication traffic.
        </p>
      </div>

      {/* At-a-glance counts — real data already in hand, no extra fetch */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem' }}>
        <div className="metric-card">
          <h3>Total Rules</h3>
          <div className="value">{total}</div>
        </div>
        <div className="metric-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CircleDot size={11} color="var(--success)" /> Active</h3>
          <div className="value value-success">{active}</div>
        </div>
        <div className="metric-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FileEdit size={11} color="var(--text-3)" /> Draft</h3>
          <div className="value">{draft}</div>
        </div>
        <div className="metric-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Shield size={11} color="var(--warning)" /> Paused</h3>
          <div className="value value-warning">{paused}</div>
        </div>
      </div>

      {/* The four "go look at something" panels */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
          Explore
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem' }}>
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
                  textAlign: 'left', cursor: ok ? 'pointer' : 'not-allowed',
                  opacity: ok ? 1 : 0.4, display: 'flex', flexDirection: 'column', gap: '0.6rem',
                  padding: '1.1rem 1.25rem',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'color-mix(in srgb, var(--violet-light) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--violet-light) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} color="var(--violet-light)" strokeWidth={2.2} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-1)' }}>{item.label}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.45 }}>{item.tip}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
