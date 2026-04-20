import React, { useEffect, useState } from 'react';
import { HEALTH_TIPS, HealthTip } from '../data/healthTips';

export interface HealthTipsPanelProps {
  posture: string;
  distance: string;
  phase: 'idle' | 'focus' | 'short_break' | 'long_break';
}

const FOCUS_REMINDER_MINUTES = 20;

export const HealthTipsPanel: React.FC<HealthTipsPanelProps> = ({
  posture,
  distance,
  phase,
}) => {
  const [tip, setTip] = useState<HealthTip>(() => HEALTH_TIPS[0]);
  const [minutesInFocus, setMinutesInFocus] = useState(0);

  // 💧 Hydration states
  const [hydrationMinutes, setHydrationMinutes] = useState(30);
  const [hydrationTimer, setHydrationTimer] = useState(0);

  useEffect(() => {
    if (phase !== 'focus') {
      setMinutesInFocus(0);
      return;
    }

    const interval = window.setInterval(() => {
      setMinutesInFocus((prev) => prev + 1);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (minutesInFocus > 0 && minutesInFocus % FOCUS_REMINDER_MINUTES === 0) {
      rotateTip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutesInFocus]);

  useEffect(() => {
    if (posture === 'slouching' || posture === 'neck_bent') {
      const postureTips = HEALTH_TIPS.filter((t) => t.category === 'posture');
      if (postureTips.length > 0) {
        setTip(postureTips[Math.floor(Math.random() * postureTips.length)]);
      }
    } else if (distance === 'too_close') {
      const eyeTips = HEALTH_TIPS.filter((t) => t.category === 'eyes');
      if (eyeTips.length > 0) {
        setTip(eyeTips[Math.floor(Math.random() * eyeTips.length)]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture, distance]);

  const rotateTip = () => {
    const currentIndex = HEALTH_TIPS.findIndex((t) => t.id === tip.id);
    const nextIndex = (currentIndex + 1) % HEALTH_TIPS.length;
    setTip(HEALTH_TIPS[nextIndex]);
  };

  // 💧 Hydration timer logic
  useEffect(() => {
    const interval = window.setInterval(() => {
      setHydrationTimer((prev) => prev + 1);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hydrationTimer > 0 && hydrationTimer % hydrationMinutes === 0) {
      alert('💧 Time to drink water!');
    }
  }, [hydrationTimer, hydrationMinutes]);

  return (
    <aside
      style={{
        padding: 16,
        borderRadius: 16,
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(52,211,153,0.4)',
        color: '#e5e7eb',
        maxWidth: 360,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Health reminder</h2>
        <button
          type="button"
          onClick={rotateTip}
          style={{
            borderRadius: 999,
            border: 'none',
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            background: 'rgba(34,197,94,0.15)',
            color: '#bbf7d0',
          }}
        >
          Next tip
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: '#d1fae5' }}>{tip.text}</p>

      {phase === 'focus' && (
        <p style={{ margin: 0, marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
          Focus time in this block: ~{minutesInFocus} minutes.
        </p>
      )}

      {/* 💧 Hydration UI */}
      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 12, color: '#93c5fd', marginBottom: 4 }}>
          Hydration Reminder (minutes)
        </p>
        <input
          type="number"
          value={hydrationMinutes}
          onChange={(e) => setHydrationMinutes(Number(e.target.value))}
          style={{
            width: '100%',
            padding: 6,
            borderRadius: 8,
            border: 'none',
            outline: 'none',
            fontSize: 12,
          }}
        />
      </div>
    </aside>
  );
};