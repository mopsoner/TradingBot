import { useState, useRef } from 'react';

interface Props {
  text: string;
  children?: React.ReactNode;
}

export function Tooltip({ text, children }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <span
        style={{
          width: 15, height: 15, borderRadius: '50%',
          background: 'rgba(88,166,255,0.18)', color: 'var(--accent)',
          fontSize: 10, fontWeight: 700, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'help', flexShrink: 0, border: '1px solid rgba(88,166,255,0.35)',
        }}
      >?</span>
      {visible && (
        <span
          style={{
            position: 'absolute', bottom: '100%', left: 0,
            marginBottom: 6, padding: '8px 12px',
            background: 'var(--surface3, #1c2128)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 12, lineHeight: 1.5,
            color: 'var(--text)', whiteSpace: 'pre-wrap',
            width: 260, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
