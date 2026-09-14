import React from 'react';
import { BookOpen, Zap } from 'lucide-react';
import { Modal } from './ui/Overlay';

/**
 * RuleReferenceModal — a fully worked example rule, shown in raw
 * grouping/filter/window/threshold form. Opt-in (behind a button, not
 * shown by default) because the guided template picker + plain-language
 * Simple mode already cover what most people need; this is for someone
 * who specifically wants to see the underlying technical shape — an
 * analyst going deeper, or a developer.
 */
export default function RuleReferenceModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={BookOpen} iconColor="var(--accent)" title="Sample Rule Reference" subtitle="A fully worked example, in technical form" width={560}>
      <div style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1rem', fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
        <h4 style={{ color: 'var(--violet-light)', marginBottom: '0.75rem' }}>OTP Bypass Ring Detector</h4>
        <div style={{ color: 'var(--text-main)' }}>
          <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Grouping:</strong> <code style={{ color: 'var(--violet-light)' }}>_data.sa</code> (Sub-AUA)</p>
          <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Filter:</strong> <code style={{ color: 'var(--violet-light)' }}>_data.otpUsesFlag</code> EQUALS <code style={{ color: '#fcd34d' }}>1.0</code></p>
          <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Window:</strong> SLIDING, 10 min size, 2 min slide, Event Time</p>
          <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Aggregations:</strong></p>
          <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
            <li><code style={{ color: 'var(--violet-light)' }}>total_otp</code> = COUNT(<code>_data.authCode</code>)</li>
            <li><code style={{ color: 'var(--violet-light)' }}>unique_auas</code> = COUNT_DISTINCT(<code>_data.aua</code>, LOW)</li>
          </ul>
          <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Threshold:</strong> <code style={{ color: 'var(--violet-light)' }}>(total_otp &gt; 15) &amp;&amp; (unique_auas &gt;= 3)</code></p>
          <p><strong style={{ color: 'var(--text-muted)' }}>Severity:</strong> <span style={{ color: '#fca5a5' }}>CRITICAL</span></p>
        </div>
      </div>
      <div style={{ background: 'var(--success-subtle)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontSize: 'var(--fs-base)', color: 'var(--text-main)', lineHeight: 1.6 }}>
        <Zap size={14} color="var(--success)" style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'middle' }} />
        <strong>What this rule does:</strong> Monitors each Sub-AUA (SA) for suspicious OTP authentication patterns. Within every 10-minute sliding window, it counts total OTP attempts and the number of distinct AUAs being targeted. If a single SA has more than 15 OTP attempts AND targets 3+ different AUAs in the same window, an alert fires — indicating a potential OTP bypass ring.
      </div>
    </Modal>
  );
}
