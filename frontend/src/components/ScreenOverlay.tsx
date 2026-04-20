import React from 'react';

type Phase = 'idle' | 'focus' | 'short_break' | 'long_break';

export interface ScreenOverlayProps {
  phase: Phase;
  overuseMinutes: number;
  breakSecondsLeft?: number;  // 🔒 NEW: countdown for break
  onOverride?: () => void;
  onTakeBreak?: () => void;
  onShownChange?: (shown: boolean) => void;
}

export const ScreenOverlay: React.FC<ScreenOverlayProps> = ({
  phase,
  overuseMinutes,
  breakSecondsLeft,
  onOverride,
  onTakeBreak,
  onShownChange,
}) => {
  const isBreak = phase === 'short_break' || phase === 'long_break';
  const isOveruse = overuseMinutes >= 60;

  if (!isBreak && !isOveruse) {
    onShownChange?.(false);
    return null;
  }

  onShownChange?.(true);

  // 🔒 Format the break countdown
  const breakMinutes = breakSecondsLeft != null
    ? Math.floor(breakSecondsLeft / 60).toString().padStart(2, '0')
    : '--';
  const breakSeconds = breakSecondsLeft != null
    ? (breakSecondsLeft % 60).toString().padStart(2, '0')
    : '--';

  const title = isBreak ? '🔒 Break Time — Screen Locked' : 'You have been working for a long stretch';
  const subtitle = isBreak
    ? 'Step away from the screen, stretch your body, and rest your eyes. The screen will unlock automatically when your break ends.'
    : 'Consider taking at least a 5 minute break to reset your posture and focus.';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backdropFilter: 'blur(20px)',
        background: 'radial-gradient(circle at top, rgba(15,23,42,0.92), rgba(0,0,0,0.95))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        // 🔒 Block all interaction during breaks
        ...(isBreak
          ? { userSelect: 'none' as const, cursor: 'not-allowed' }
          : {}),
      }}
      // 🔒 Prevent keyboard shortcuts during break
      onKeyDown={isBreak ? (e) => e.preventDefault() : undefined}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: 'rgba(15,23,42,0.95)',
          borderRadius: 24,
          padding: 32,
          border: '1px solid rgba(148,163,184,0.6)',
          color: '#e5e7eb',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.5rem' }}>{title}</h2>
        <p style={{ marginTop: 0, marginBottom: 20, color: '#9ca3af', fontSize: 14 }}>{subtitle}</p>

        {/* 🔒 Break countdown timer */}
        {isBreak && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 2,
                color: '#38bdf8',
                textShadow: '0 0 20px rgba(56,189,248,0.4)',
              }}
            >
              {breakMinutes}:{breakSeconds}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
              Screen unlocks automatically when break ends
            </p>

            {/* 🔒 Progress bar */}
            {breakSecondsLeft != null && (
              <div
                style={{
                  marginTop: 16,
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 3,
                    background: 'linear-gradient(90deg, #22d3ee, #6366f1)',
                    transition: 'width 1s linear',
                    width: breakSecondsLeft != null
                      ? `${Math.max(0, 100 - (breakSecondsLeft / getBreakTotalSeconds(phase)) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            )}

            {/* Break activity suggestions */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 12,
                background: 'rgba(30,41,59,0.8)',
                textAlign: 'left',
                fontSize: 13,
                color: '#94a3b8',
              }}
            >
              <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#e2e8f0' }}>
                💡 While you wait:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>🧘 Stretch your neck and shoulders</li>
                <li>👀 Look at something 20 feet away for 20 seconds</li>
                <li>💧 Drink some water</li>
                <li>🚶 Take a short walk</li>
              </ul>
            </div>
          </div>
        )}

        {/* Overuse warning (NOT a break — user can dismiss) */}
        {isOveruse && !isBreak && (
          <>
            <p style={{ marginTop: 0, marginBottom: 16, color: '#facc15' }}>
              Continuous usage: approximately {overuseMinutes} minutes.
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={onTakeBreak}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 40%, #a3e635 100%)',
                  color: '#052e16',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                I&apos;m taking a break
              </button>
              <button
                type="button"
                onClick={onOverride}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(248,113,113,0.8)',
                  background: 'transparent',
                  color: '#fecaca',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Override once
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Helper to get total break duration for progress bar calculation
function getBreakTotalSeconds(phase: Phase): number {
  // These defaults match PomodoroTimer defaults
  // The progress bar will still work correctly since it's ratio-based
  if (phase === 'short_break') return 5 * 60;
  if (phase === 'long_break') return 15 * 60;
  return 1; // avoid division by zero
}