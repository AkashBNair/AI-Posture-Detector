import React, { useEffect, useRef, useState } from "react";
import { alert as wellnessAlert } from '../utils/notifications';

type Props = {
  onHydrationComplete?: () => void;
};

const HydrationTimer: React.FC<Props> = ({ onHydrationComplete }) => {
  const [minutesInput, setMinutesInput] = useState(30);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isAlertPlaying, setIsAlertPlaying] = useState(false);

  const alertFiredRef = useRef(false);

  // 🔓 Unlock speech on first click
  useEffect(() => {
    const unlock = () => {
      speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      document.removeEventListener("click", unlock);
    };

    document.addEventListener("click", unlock);
    return () => document.removeEventListener("click", unlock);
  }, []);

  function fireHydrationAlert() {
    if (alertFiredRef.current) return;
    alertFiredRef.current = true;

    setIsAlertPlaying(true);

    // 🔔 Voice + Browser Notification
    wellnessAlert('💧 Hydration Reminder', {
      body: 'Time to drink water! Stay hydrated for better focus.',
      voiceMessage: 'Time to drink water',
      tag: 'hydration-alert',
    });

    onHydrationComplete?.();

    setTimeout(() => setIsAlertPlaying(false), 5000);
  }

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fireHydrationAlert();

          setTimeout(() => {
            alertFiredRef.current = false;
          }, 2000);

          return Math.max(1, minutesInput) * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, minutesInput]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  const handleSetTime = () => {
    const safeTime = Math.max(1, minutesInput);
    setTimeLeft(safeTime * 60);
    setIsRunning(false);
    setIsAlertPlaying(false);
    alertFiredRef.current = false;
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
        <button onClick={() => setIsRunning(true)}>Start</button>
        <button onClick={() => setIsRunning(false)}>Pause</button>
        <button onClick={handleSetTime}>Reset</button>
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