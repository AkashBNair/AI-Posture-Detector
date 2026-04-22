import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  onTimerComplete,
  onTimerTick,
  removeTimerCallbacks,
  startBackgroundTimer,
  stopBackgroundTimer,
} from '../utils/notifications';

type Props = {
  onHydrationComplete?: () => void;
};

const HYDRATION_TIMER_ID = 'hydration-reminder';

const HydrationTimer: React.FC<Props> = ({ onHydrationComplete }) => {
  const [minutesInput, setMinutesInput] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isAlertPlaying, setIsAlertPlaying] = useState(false);

  const alertFiredRef = useRef(false);
  const minutesInputRef = useRef(minutesInput);

  // 🔓 Unlock speech on first click
  useEffect(() => {
    const unlock = () => {
      speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      document.removeEventListener("click", unlock);
    };

    document.addEventListener("click", unlock);
    return () => document.removeEventListener("click", unlock);
  }, []);

  useEffect(() => {
    minutesInputRef.current = minutesInput;
  }, [minutesInput]);

  const fireHydrationAlert = useCallback(() => {
    if (alertFiredRef.current) return;
    alertFiredRef.current = true;

    setIsAlertPlaying(true);

    onHydrationComplete?.();

    setTimeout(() => {
      setIsAlertPlaying(false);
      alertFiredRef.current = false;
    }, 5000);
  }, [onHydrationComplete]);

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

  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

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

  return (
    <div style={{ marginTop: 20 }}>
      <h2>💧 Hydration Timer</h2>

      <h1
        style={{
          fontSize: "40px",
          color: isAlertPlaying ? "#38bdf8" : undefined,
          animation: isAlertPlaying ? "pulse 0.6s ease-in-out 3" : undefined,
        }}
      >
        {isAlertPlaying ? "💧 Drink Water! 💧" : formattedTime}
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

      <div>
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
      </div>

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
