import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pose, Results as PoseResults } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { alert as wellnessAlert } from '../utils/notifications';

type PostureState = 'good' | 'slouching' | 'neck_bent' | 'no_person';
type DistanceState = 'ok' | 'too_close' | 'uncalibrated';

export interface WebcamPostureMonitorProps {
  onStateChange?: (state: {
    posture: PostureState;
    distance: DistanceState;
    isCalibrating: boolean;
    calibrationProgress: number;
  }) => void;
}

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PostureBaseline {
  neck: number;
  slouch: number;
  neckStd: number;
  slouchStd: number;
}

interface PostureSample {
  neck: number;
  slouch: number;
}

const LOCAL_STORAGE_BASELINE_KEY = 'wellness_baseline_face_width';
const LOCAL_STORAGE_POSTURE_BASELINE_KEY = 'wellness_posture_baseline';

const CALIBRATION_SAMPLE_COUNT = 60;
const SENSITIVITY_MULTIPLIER = 1.8;
const ADAPTATION_RATE = 0.005;
const MIN_NECK_THRESHOLD = 0.03;
const MIN_SLOUCH_THRESHOLD = 0.05;

const BAD_POSTURE_DURATION_MS = 10_000;
const TOO_CLOSE_DURATION_MS = 5_000;

function computeMeanAndStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

let postureBaseline: PostureBaseline | null = null;
let postureSamples: PostureSample[] = [];

export const WebcamPostureMonitor: React.FC<WebcamPostureMonitorProps> = ({
  onStateChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const hasSpokenPostureRef = useRef(false);
  const hasSpokenDistanceRef = useRef(false);

  const badPostureSinceRef = useRef<number | null>(null);
  const tooCloseSinceRef = useRef<number | null>(null);

  const calibrationSamplesRef = useRef<number[]>([]);

  const [posture, setPosture] = useState<PostureState>('no_person');
  const [distance, setDistance] = useState<DistanceState>('uncalibrated');
  const [baselineFaceWidth, setBaselineFaceWidth] = useState<number | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const baselineFaceWidthRef = useRef<number | null>(null);

  useEffect(() => {
    onStateChange?.({ posture, distance, isCalibrating, calibrationProgress });
  }, [posture, distance, isCalibrating, calibrationProgress, onStateChange]);

  useEffect(() => {
    baselineFaceWidthRef.current = baselineFaceWidth;
  }, [baselineFaceWidth]);

  useEffect(() => {
    const storedFace = window.localStorage.getItem(LOCAL_STORAGE_BASELINE_KEY);
    if (storedFace) {
      const parsed = Number(storedFace);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setBaselineFaceWidth(parsed);
      }
    }

    const storedPosture = window.localStorage.getItem(LOCAL_STORAGE_POSTURE_BASELINE_KEY);
    if (storedPosture) {
      try {
        const parsed: PostureBaseline = JSON.parse(storedPosture);
        if (
          typeof parsed.neck === 'number' &&
          typeof parsed.slouch === 'number' &&
          typeof parsed.neckStd === 'number' &&
          typeof parsed.slouchStd === 'number'
        ) {
          postureBaseline = parsed;
          setIsCalibrating(false);
          setCalibrationProgress(100);
        }
      } catch {}
    }
  }, []);

  const recalibrate = useCallback(() => {
    postureBaseline = null;
    postureSamples = [];
    calibrationSamplesRef.current = [];
    setBaselineFaceWidth(null);
    baselineFaceWidthRef.current = null;
    setIsCalibrating(true);
    setCalibrationProgress(0);
    badPostureSinceRef.current = null;
    tooCloseSinceRef.current = null;
    hasSpokenPostureRef.current = false;
    hasSpokenDistanceRef.current = false;
    window.localStorage.removeItem(LOCAL_STORAGE_BASELINE_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_POSTURE_BASELINE_KEY);
  }, []);

  function classifyPostureAdaptive(landmarks: Landmark[]): PostureState {
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const neck = nose.y - shoulderMidY;

    let slouch = 0;
    if (leftEar && rightEar) {
      const shoulderMidZ = (leftShoulder.z + rightShoulder.z) / 2;
      const earMidZ = (leftEar.z + rightEar.z) / 2;
      slouch = earMidZ - shoulderMidZ;
    }

    if (!postureBaseline) {
      postureSamples.push({ neck, slouch });
      const progress = Math.min(
        100,
        Math.round((postureSamples.length / CALIBRATION_SAMPLE_COUNT) * 100)
      );
      setCalibrationProgress(progress);

      if (postureSamples.length >= CALIBRATION_SAMPLE_COUNT) {
        const neckValues = postureSamples.map((s) => s.neck);
        const slouchValues = postureSamples.map((s) => s.slouch);

        const neckStats = computeMeanAndStd(neckValues);
        const slouchStats = computeMeanAndStd(slouchValues);

        postureBaseline = {
          neck: neckStats.mean,
          slouch: slouchStats.mean,
          neckStd: neckStats.std,
          slouchStd: slouchStats.std,
        };

        postureSamples = [];
        setIsCalibrating(false);
        setCalibrationProgress(100);

        window.localStorage.setItem(
          LOCAL_STORAGE_POSTURE_BASELINE_KEY,
          JSON.stringify(postureBaseline)
        );
      }

      return 'good';
    }

    const base = postureBaseline;

    const neckThreshold = Math.max(MIN_NECK_THRESHOLD, SENSITIVITY_MULTIPLIER * base.neckStd);
    const slouchThreshold = Math.max(MIN_SLOUCH_THRESHOLD, SENSITIVITY_MULTIPLIER * base.slouchStd);

    const neckDelta = neck - base.neck;
    const slouchDelta = slouch - base.slouch;

    let currentPosture: PostureState = 'good';

    if (neckDelta > neckThreshold) {
      currentPosture = 'neck_bent';
    } else if (slouchDelta < -slouchThreshold) {
      currentPosture = 'slouching';
    }

    if (currentPosture === 'good') {
      postureBaseline = {
        neck: base.neck * (1 - ADAPTATION_RATE) + neck * ADAPTATION_RATE,
        slouch: base.slouch * (1 - ADAPTATION_RATE) + slouch * ADAPTATION_RATE,
        neckStd: base.neckStd,
        slouchStd: base.slouchStd,
      };

      if (Math.random() < 0.01) {
        window.localStorage.setItem(
          LOCAL_STORAGE_POSTURE_BASELINE_KEY,
          JSON.stringify(postureBaseline)
        );
      }
    }

    return currentPosture;
  }

  useEffect(() => {
    let camera: any = null;

    async function initialize() {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pose = new Pose({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        pose.onResults((results: PoseResults) => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const landmarks = results.poseLandmarks as Landmark[];
          if (!landmarks || !landmarks.length) {
            setPosture('no_person');
            setDistance('uncalibrated');
            badPostureSinceRef.current = null;
            tooCloseSinceRef.current = null;
            hasSpokenPostureRef.current = false;
            hasSpokenDistanceRef.current = false;
            return;
          }

          const now = Date.now();

          const newPosture = classifyPostureAdaptive(landmarks);

          if (newPosture === 'slouching' || newPosture === 'neck_bent') {
            if (badPostureSinceRef.current === null) {
              badPostureSinceRef.current = now;
            }

            const elapsed = now - badPostureSinceRef.current;

            if (elapsed >= BAD_POSTURE_DURATION_MS && !hasSpokenPostureRef.current) {
              // 🔔 Voice + Browser Notification
              wellnessAlert('⚠️ Posture Alert', {
                body: 'You have been slouching for a while. Please sit straight!',
                voiceMessage: 'You have been slouching for a while, please sit straight',
                tag: 'posture-alert',
              });
              hasSpokenPostureRef.current = true;
            }
          } else {
            badPostureSinceRef.current = null;
            hasSpokenPostureRef.current = false;
          }

          const faceWidth = estimateFaceWidthFromPose(landmarks);

          if (!baselineFaceWidthRef.current && faceWidth > 0) {
            calibrationSamplesRef.current.push(faceWidth);
            if (calibrationSamplesRef.current.length >= 12) {
              const avg =
                calibrationSamplesRef.current.reduce((a, b) => a + b, 0) /
                calibrationSamplesRef.current.length;
              setBaselineFaceWidth(avg);
              baselineFaceWidthRef.current = avg;
              window.localStorage.setItem(LOCAL_STORAGE_BASELINE_KEY, String(avg));
            }
          }

          const newDistance =
            faceWidth > 0
              ? classifyDistance(faceWidth, baselineFaceWidthRef.current)
              : 'uncalibrated';

          if (newDistance === 'too_close') {
            if (tooCloseSinceRef.current === null) {
              tooCloseSinceRef.current = now;
            }

            const elapsed = now - tooCloseSinceRef.current;

            if (elapsed >= TOO_CLOSE_DURATION_MS && !hasSpokenDistanceRef.current) {
              // 🔔 Voice + Browser Notification
              wellnessAlert('📏 Distance Alert', {
                body: 'You have been too close to the screen. Please move back!',
                voiceMessage: 'You have been too close to the screen, please move back',
                tag: 'distance-alert',
              });
              hasSpokenDistanceRef.current = true;
            }
          } else {
            tooCloseSinceRef.current = null;
            hasSpokenDistanceRef.current = false;
          }

          setPosture(newPosture);
          setDistance(newDistance);
        });

        camera = new Camera(video, {
          onFrame: async () => {
            try {
              await pose.send({ image: video });
            } catch (e) {
              console.warn('Pose crashed, skipping frame', e);
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
      } catch (err: any) {
        console.error('Failed to initialize webcam monitor:', err);
        setInitError(err.message || 'An unknown error occurred during initialization.');
      }
    }

    initialize();

    return () => {
      if (camera) {
        try {
          const stopResult = camera.stop?.();
          if (stopResult && typeof stopResult.then === 'function') {
            stopResult.catch((err: any) => console.warn('Error stopping camera:', err));
          }
        } catch (err) {
          console.warn('Error stopping camera:', err);
        }
      }
    };
  }, []);

  if (initError) {
    return <div>Error initializing webcam: {initError}</div>;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: 640,
        height: 480,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 20px 45px rgba(15,23,42,0.7)',
        border: '1px solid rgba(148,163,184,0.4)',
      }}
    >
      <video
        ref={videoRef}
        width={640}
        height={480}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)',
        }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transform: 'scaleX(-1)',
        }}
      />

      {isCalibrating && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            zIndex: 10,
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            🧘 Calibrating to your natural posture…
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 16, maxWidth: 400 }}>
            Sit comfortably in your <b>normal position</b>. The system is learning
            your personal posture range so it only alerts when you truly slouch.
          </div>
          <div
            style={{
              width: 220,
              height: 8,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${calibrationProgress}%`,
                height: '100%',
                borderRadius: 4,
                background: 'linear-gradient(90deg, #22d3ee, #6366f1)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 13, marginTop: 6, opacity: 0.7 }}>
            {calibrationProgress}% complete
          </div>
        </div>
      )}

      {!isCalibrating && (
        <button
          onClick={recalibrate}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            zIndex: 10,
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          title="Reset and recalibrate to your current posture"
        >
          🔄 Recalibrate
        </button>
      )}
    </div>
  );
};

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
  const ratio = faceWidth / baseline;
  if (ratio > 1.18) return 'too_close';
  return 'ok';
}

export default WebcamPostureMonitor;