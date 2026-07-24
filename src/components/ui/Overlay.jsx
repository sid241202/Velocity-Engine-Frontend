import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared Modal + Drawer primitives — the one interaction-layer building
 * block every click-to-detail affordance in the app is built on, so
 * entity/window/breach detail views all open, close, and look the same
 * regardless of which panel triggered them.
 */

function useEscapeAndLockScroll(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);
}

function OverlayHeader({ icon: Icon, iconColor, title, subtitle, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
      padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      {Icon && (
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(var(--violet-rgb),0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}>
          <Icon size={16} color={iconColor || 'var(--violet-light)'} strokeWidth={2.2} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)',
          letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      <button
        onClick={onClose}
        className="btn btn-ghost"
        style={{ padding: 6, borderRadius: 6, flexShrink: 0 }}
        title="Close (Esc)"
        type="button"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/** Centered dialog — for content tied to a single point in time (a window, a metric breakdown). */
export function Modal({ open, onClose, icon, iconColor, title, subtitle, width = 620, children }) {
  useEscapeAndLockScroll(open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5,8,16,0.66)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%', maxWidth: width, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: '1px solid var(--border-2)',
        }}
      >
        <OverlayHeader icon={icon} iconColor={iconColor} title={title} subtitle={subtitle} onClose={onClose} />
        <div style={{ padding: '1.25rem', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Right slide-over — for content that benefits from more vertical room (an entity's full history). */
export function Drawer({ open, onClose, icon, iconColor, title, subtitle, width = 460, children, footer }) {
  useEscapeAndLockScroll(open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,16,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: width,
          borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderRight: 'none',
          borderLeft: '1px solid var(--border-2)', display: 'flex', flexDirection: 'column',
          padding: 0, boxShadow: '-16px 0 48px rgba(0,0,0,0.45)', animation: 'slideInRight 0.2s ease-out',
        }}
      >
        <OverlayHeader icon={icon} iconColor={iconColor} title={title} subtitle={subtitle} onClose={onClose} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>{children}</div>
        {footer && <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** A rule name rendered as an inline link — the one consistent way every
 * panel jumps to Rule Summary, instead of each table inventing its own. */
export function RuleLink({ ruleName, ruleId, onRuleClick, style }) {
  if (!onRuleClick) return <span style={style}>{ruleName}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRuleClick(ruleId); }}
      title="View rule details"
      style={{
        background: 'none', border: 'none', padding: 0, margin: 0,
        font: 'inherit', color: 'var(--violet-light)', cursor: 'pointer',
        textDecoration: 'underline', textDecorationColor: 'rgba(121,131,245,0.35)',
        textUnderlineOffset: '2px', textAlign: 'left',
        ...style,
      }}
    >
      {ruleName}
    </button>
  );
}
