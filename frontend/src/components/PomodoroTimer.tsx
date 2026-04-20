import React, { useEffect, useMemo, useState } from 'react';
import { alert as wellnessAlert } from '../utils/notifications';

type Phase = 'idle' | 'focus' | 'short_break' | 'long_break';

export interface PomodoroTimerProps {
  onPhaseChange?: (phase: Phase) => void;
  onCycleComplete?: (data: { phase: Phase; plannedMinutes: number; actualSeconds: number }) => void;
  onBreakTick?: (secondsLeft: number) => void;
}

const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_SHORT_BREAK_MIN = 5;
const DEFAULT_LONG_BREAK_MIN = 15;
const LONG_BREAK_INTERVAL = 4;

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({
  onPhaseChange,
  onCycleComplete,
  onBreakTick,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MIN);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(DEFAULT_SHORT_BREAK_MIN);
  const [longBreakMinutes, setLongBreakMinutes] = useState(DEFAULT_LONG_BREAK_MIN);
  const [completedFocusBlocks, setCompletedFocusBlocks] = useState(0);
  const [running, setRunning] = useState(false);
  const [phaseStartTimestamp, setPhaseStartTimestamp] = useState<number | null>(null);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    const isBreak = phase === 'short_break' || phase === 'long_break';
    if (isBreak && running) {
      onBreakTick?.(secondsLeft);
    }
  }, [secondsLeft, phase, running, onBreakTick]);

  useEffect(() => {
    let interval: number | undefined;

    if (running && secondsLeft > 0) {
      interval = window.setInterval(() => setSecondsLeft((prev) => prev - 1), 1000);
    } else if (running && secondsLeft === 0 && phase !== 'idle') {
      handlePhaseEnd();
    }

    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, secondsLeft, phase]);

  const handlePhaseEnd = () => {
    setRunning(false);

    if (phaseStartTimestamp && onCycleComplete) {
      const elapsed = Math.max(0, Math.round((Date.now() - phaseStartTimestamp) / 1000));
      const planned =
        phase === 'focus'
          ? focusMinutes
          : phase === 'short_break'
          ? shortBreakMinutes
          : phase === 'long_break'
          ? longBreakMinutes
          : 0;

      onCycleComplete({ phase, plannedMinutes: planned, actualSeconds: elapsed });
    }

    if (phase === 'focus') {
      const nextCount = completedFocusBlocks + 1;
      setCompletedFocusBlocks(nextCount);
      const useLongBreak = nextCount % LONG_BREAK_INTERVAL === 0;
      const breakType = useLongBreak ? 'long_break' : 'short_break';
      const breakMin = useLongBreak ? longBreakMinutes : shortBreakMinutes;

      // 🔔 Notify: Focus session ended, break starting
      wellnessAlert('⏸️ Break Time!', {
        body: `Great work! Take a ${breakMin}-minute ${useLongBreak ? 'long' : 'short'} break. Screen is locked.`,
        voiceMessage: `Focus session complete. Time for a ${breakMin} minute break.`,
        tag: 'break-start',
      });

      startPhase(breakType);
    } else if (phase === 'short_break' || phase === 'long_break') {
      // 🔔 Notify: Break ended, focus starting
      wellnessAlert('🚀 Focus Time!', {
        body: `Break is over! Time to get back to work. Stay focused for ${focusMinutes} minutes.`,
        voiceMessage: `Break is over. Time to focus for ${focusMinutes} minutes.`,
        tag: 'focus-start',
      });

      startPhase('focus');
    }
  };

  const startPhase = (nextPhase: Phase) => {
    let durationMinutes = 0;
    if (nextPhase === 'focus') durationMinutes = focusMinutes;
    if (nextPhase === 'short_break') durationMinutes = shortBreakMinutes;
    if (nextPhase === 'long_break') durationMinutes = longBreakMinutes;

    setPhase(nextPhase);
    setSecondsLeft(durationMinutes * 60);
    setRunning(true);
    setPhaseStartTimestamp(Date.now());
  };

  const handleStart = () => {
    if (phase === 'idle') startPhase('focus');
    else {
      setRunning(true);
      setPhaseStartTimestamp(Date.now());
    }
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    setRunning(false);
    setPhase('idle');
    setSecondsLeft(0);
    setPhaseStartTimestamp(null);
  };

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  const phaseLabel: string =
    phase === 'focus'
      ? 'Focus'
      : phase === 'short_break'
      ? 'Short break'
      : phase === 'long_break'
      ? 'Long break'
      : 'Ready';

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 20,
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(148,163,184,0.3)',
        color: '#e5e7eb',
        maxWidth: 360,
        width: '100%',
        boxShadow: '0 10px 30px rgba(15,23,42,0.7)',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.2rem' }}>Pomodoro</h2>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: '#9ca3af' }}>
        Alternate deep focus with restorative breaks to stay productive and healthy.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 14, color: '#9ca3af' }}>{phaseLabel}</span>
        <span style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>{formattedTime}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={handleStart}
          disabled={running && phase !== 'idle'}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 40%, #a3e635 100%)',
            color: '#052e16',
            fontWeight: 600,
          }}
        >
          {phase === 'idle' ? 'Start focus' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={handlePause}
          disabled={!running}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 999,
            border: '1px solid rgba(148,163,184,0.6)',
            background: 'transparent',
            color: '#e5e7eb',
            cursor: running ? 'pointer' : 'default',
            fontWeight: 500,
          }}
        >
          Pause
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            padding: '8px 10px',
            borderRadius: 999,
            border: 'none',
            background: 'rgba(148,163,184,0.15)',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Reset
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          fontSize: 11,
        }}
      >
        <LabeledInput label="Focus (min)" value={focusMinutes} onChange={(v) => setFocusMinutes(v)} />
        <LabeledInput
          label="Short break"
          value={shortBreakMinutes}
          onChange={(v) => setShortBreakMinutes(v)}
        />
        <LabeledInput
          label="Long break"
          value={longBreakMinutes}
          onChange={(v) => setLongBreakMinutes(v)}
        />
      </div>
    </div>
  );
};

interface LabeledInputProps {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}

const LabeledInput: React.FC<LabeledInputProps> = ({ label, value, onChange }) => {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
        color: '#9ca3af',
      }}
    >
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={120}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={{
          width: '100%',
          padding: '4px 8px',
          borderRadius: 999,
          border: '1px solid rgba(148,163,184,0.6)',
          background: 'rgba(15,23,42,0.9)',
          color: '#e5e7eb',
          fontSize: 12,
        }}
      />
    </label>
  );
};