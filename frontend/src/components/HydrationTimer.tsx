import React, { useEffect, useRef, useState } from 'react';
import { Pose, Results as PoseResults } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';

type PostureState = 'good' | 'slouching' | 'neck_bent' | 'no_person';
type DistanceState = 'ok' | 'too_close' | 'uncalibrated';

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

const LOCAL_STORAGE_BASELINE_KEY = 'wellness_baseline_face_width';
const HYDRATION_INTERVAL = 30 * 60; // 30 minutes

function mapMediapipePath(file: string, packageName: 'pose'): string {
  if (file.startsWith('third_party/mediapipe/')) {
    const relative = file.replace('third_party/mediapipe/', '');
    return `/mediapipe/${relative}`;
  }
  return `/mediapipe/${packageName}/${file}`;
}

export const WebcamPostureMonitor: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  const lastVoicePostureRef = useRef<PostureState>('good');
  const lastVoiceDistanceRef = useRef<DistanceState>('ok');

  const [posture, setPosture] = useState<PostureState>('no_person');
  const [distance, setDistance] = useState<DistanceState>('uncalibrated');
  const [baselineFaceWidth, setBaselineFaceWidth] = useState<number | null>(null);

  // 💧 Hydration timer (IMPROVED LIKE POMODORO)
  const [timeLeft, setTimeLeft] = useState(HYDRATION_INTERVAL);
  const [isHydrationRunning, setIsHydrationRunning] = useState(true);

  function speak(message: string) {
    if (!('speechSynthesis' in window)) return;
    const speech = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  // unlock speech
  useEffect(() => {
    const unlock = () => {
      speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      document.removeEventListener('click', unlock);
    };
    document.addEventListener('click', unlock);
  }, []);

  // 💧 Hydration timer logic (FIXED)
  useEffect(() => {
    if (!isHydrationRunning) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          speak("Time to drink water");
          return HYDRATION_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isHydrationRunning]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pose = new Pose({
      locateFile: (file) => mapMediapipePath(file, 'pose'),
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
    });

    pose.onResults((results: PoseResults) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = results.poseLandmarks as Landmark[];

      if (!landmarks) return;

      const newPosture = classifyPosture(landmarks);

      if (
        (newPosture === 'slouching' || newPosture === 'neck_bent') &&
        lastVoicePostureRef.current === 'good'
      ) {
        speak("Sit straight");
      }
      lastVoicePostureRef.current = newPosture;

      const faceWidth = estimateFaceWidthFromPose(landmarks);

      if (!baselineFaceWidth && faceWidth > 0) {
        setBaselineFaceWidth(faceWidth);
      }

      const newDistance = classifyDistance(faceWidth, baselineFaceWidth);

      if (
        newDistance === 'too_close' &&
        lastVoiceDistanceRef.current !== 'too_close'
      ) {
        speak("You are too close to the screen");
      }
      lastVoiceDistanceRef.current = newDistance;

      setPosture(newPosture);
      setDistance(newDistance);
    });

    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    camera.start();

    return () => {
      camera.stop();
      pose.close();
    };
  }, [baselineFaceWidth]);

  // ⏱️ format timer
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} />

      <div>
        <h3>Posture: {posture}</h3>
        <h3>Distance: {distance}</h3>
      </div>

      {/* 💧 Hydration Timer UI */}
      <div style={{ marginTop: 20, fontSize: 20 }}>
        💧 Hydration Timer: {formattedTime}
      </div>

      {/* ✅ NEW CONTROLS (like Pomodoro) */}
      <button onClick={() => setIsHydrationRunning(!isHydrationRunning)}>
        {isHydrationRunning ? "Pause" : "Start"}
      </button>

      <button onClick={() => setTimeLeft(HYDRATION_INTERVAL)}>
        Reset
      </button>
    </div>
  );
};

// ===== SAME LOGIC =====

function classifyPosture(landmarks: Landmark[]): PostureState {
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];

  if (!nose || !leftShoulder || !rightShoulder) {
    return 'no_person';
  }

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

  if (nose.y - shoulderMidY > -0.04) {
    return 'neck_bent';
  }

  if (leftEar && rightEar) {
    const shoulderMidZ = (leftShoulder.z + rightShoulder.z) / 2;
    const earMidZ = (leftEar.z + rightEar.z) / 2;
    if (earMidZ - shoulderMidZ < -0.12) {
      return 'slouching';
    }
  }

  return 'good';
}

function estimateFaceWidthFromPose(landmarks: Landmark[]): number {
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  if (!leftEar || !rightEar) return 0;

  const dx = rightEar.x - leftEar.x;
  const dy = rightEar.y - leftEar.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function classifyDistance(faceWidth: number, baseline: number | null): DistanceState {
  if (!baseline) return 'uncalibrated';
  if (!faceWidth) return 'ok';

  const ratio = faceWidth / baseline;
  return ratio > 1.18 ? 'too_close' : 'ok';
}
