import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  onTimerComplete,
  onTimerTick,
  removeTimerCallbacks,
  startBackgroundTimer,
  stopBackgroundTimer,
} from '../utils/notifications';

type Props = {
  onHydrationLogged?: () => void;
};

const HYDRATION_TIMER_ID = 'hydration-reminder';

const HydrationTimer: React.FC<Props> = ({ onHydrationLogged }) => {
  const [minutesInput, setMinutesInput] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isAlertPlaying, setIsAlertPlaying] = useState(false);
  const [lastHydrationTime, setLastHydrationTime] = useState<string | null>(null);

  const alertFiredRef = useRef(false);
  const minutesInputRef = useRef(minutesInput);

  useEffect(() => {
    const unlock = () => {
      speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      document.removeEventListener('click', unlock);
    };

    document.addEventListener('click', unlock);
    return () => document.removeEventListener('click', unlock);
  }, []);

  useEffect(() => {
    minutesInputRef.current = minutesInput;
  }, [minutesInput]);

  const fireHydrationAlert = useCallback(() => {
    if (alertFiredRef.current) return;
    alertFiredRef.current = true;

    setIsAlertPlaying(true);

    setTimeout(() => {
      setIsAlertPlaying(false);
      alertFiredRef.current = false;
    }, 5000);
  }, []);

  useEffect(() => {
    onTimerComplete(HYDRATION_TIMER_ID, () => {
      fireHydrationAlert();
      setTimeLeft(Math.max(1, minutesInputRef.current) * 60);
    });

    onTimerTick(HYDRATION_TIMER_ID, (_timerId, secondsLeft) => {
      setTimeLeft(secondsLeft);
    });

    return () => {
      removeTimerCallbacks(HYDRATION_TIMER_ID);
      stopBackgroundTimer(HYDRATION_TIMER_ID);
    };
  }, [fireHydrationAlert]);

  const startHydrationReminder = useCallback(() => {
    const safeTime = Math.max(1, minutesInput);
    alertFiredRef.current = false;
    setIsAlertPlaying(false);
    setTimeLeft(safeTime * 60);
    setIsRunning(true);

    startBackgroundTimer(
      HYDRATION_TIMER_ID,
      safeTime * 60_000,
      {
        title: '💧 Hydration Reminder',
        body: 'Time to drink water! Stay hydrated for better focus.',
        voiceMessage: 'Time to drink water',
        tag: 'hydration-alert',
        soundName: 'water-alert',
      },
      true
    );
  }, [minutesInput]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  const handleSetTime = () => {
    const safeTime = Math.max(1, minutesInput);
    setTimeLeft(safeTime * 60);
    setIsAlertPlaying(false);
    alertFiredRef.current = false;

    if (isRunning) {
      startHydrationReminder();
    } else {
      stopBackgroundTimer(HYDRATION_TIMER_ID);
    }
  };

  const handleHydrationLogged = () => {
    const now = new Date();
    setLastHydrationTime(now.toLocaleTimeString());
    onHydrationLogged?.();
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h2>💧 Hydration Timer</h2>

      <h1
        style={{
          fontSize: '40px',
          color: isAlertPlaying ? '#38bdf8' : undefined,
          animation: isAlertPlaying ? 'pulse 0.6s ease-in-out 3' : undefined,
        }}
      >
        {isAlertPlaying ? '💧 Drink Water! 💧' : formattedTime}
      </h1>

      <div style={{ marginBottom: 10 }}>
        <input
          type="number"
          value={minutesInput}
          onChange={(e) => setMinutesInput(Number(e.target.value))}
          min={1}
          style={{ width: 60, marginRight: 10 }}
        />
        <span> minutes</span>
        <button onClick={handleSetTime} style={{ marginLeft: 10 }}>
          Set
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={startHydrationReminder}>Start</button>
        <button
          onClick={() => {
            setIsRunning(false);
            stopBackgroundTimer(HYDRATION_TIMER_ID);
          }}
        >
          Pause
        </button>
        <button
          onClick={() => {
            setIsRunning(false);
            stopBackgroundTimer(HYDRATION_TIMER_ID);
            handleSetTime();
          }}
        >
          Reset
        </button>
        <button
          onClick={handleHydrationLogged}
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
            border: 'none',
            color: '#082f49',
            fontWeight: 700,
            padding: '8px 14px',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          I drank water
        </button>
      </div>

      {lastHydrationTime && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
          Last hydration logged at {lastHydrationTime}
        </p>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
};

export default HydrationTimer;
