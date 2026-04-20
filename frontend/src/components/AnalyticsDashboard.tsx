import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { getApiBaseUrl } from "../api/baseUrl";
import { getOrCreateClientId } from "../api/client";

type Props = {
  posture: string;
  phase: string;
  overuseMinutes: number;
  hydrationMinutes: number;
  waterGlasses: number;  // 🥛 NEW prop
};

export const AnalyticsDashboard: React.FC<Props> = ({
  posture,
  phase,
  overuseMinutes,
  hydrationMinutes,
  waterGlasses,
}) => {
  const [postureData, setPostureData] = useState<any[]>([]);
  const [focusData, setFocusData] = useState<any[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const clientId = getOrCreateClientId();
        const res = await fetch(`${getApiBaseUrl()}/analytics/summary`, {
          headers: {
            'X-Client-Id': clientId,
          },
        });
        if (!res.ok) {
          throw new Error(`Analytics API returned ${res.status}`);
        }
        const data = await res.json();

        if (data) {
          const postureDataFormatted = [
            { name: 'Good', value: Math.round(data.good_posture_ratio * 100) },
            { name: 'Bad', value: Math.round((1 - data.good_posture_ratio) * 100) },
          ];
          const focusDataFormatted = [
            { name: 'Focus Sessions', value: data.focus_sessions },
            { name: 'Total Minutes', value: Math.round(data.total_focus_minutes) },
          ];
          setPostureData(postureDataFormatted);
          setFocusData(focusDataFormatted);
        }
      } catch (err) {
        console.error("Analytics fetch failed", err);
        setPostureData([
          { name: 'Good', value: 0 },
          { name: 'Bad', value: 0 },
        ]);
        setFocusData([
          { name: 'Focus Sessions', value: 0 },
          { name: 'Total Minutes', value: 0 },
        ]);
      }
    };

    fetchAnalytics();
  }, []);

  // 🧠 Posture score
  const postureScore =
    posture === "good"
      ? 90
      : posture === "slouching"
      ? 60
      : posture === "neck_bent"
      ? 50
      : 30;

  const eyeAlerts = overuseMinutes > 40 ? "High" : "Normal";

  // 🥛 Updated hydration insight based on actual glasses
  const hydrationInsight =
    waterGlasses >= 8
      ? "Amazing! You've hit the recommended 8 glasses! 🎉💧"
      : waterGlasses >= 5
      ? "Great hydration habit! Keep it up 💧"
      : waterGlasses >= 3
      ? "Good progress, try to drink a few more glasses 💧"
      : waterGlasses >= 1
      ? "You've started hydrating — keep going! 💧"
      : "No water logged yet. Start your hydration timer! 🚰";

  const avgPostureScore = postureData.length > 0
    ? postureData.find(d => d.name === 'Good')?.value || 0
    : 0;

  const bestDay = null;

  // 🤖 AI Insight
  let aiInsight = "Collecting data...";

  if (avgPostureScore < 60) {
    aiInsight =
      "Your posture is consistently weak. Try shorter focus sessions with strict posture correction.";
  } else if (avgPostureScore < 80) {
    aiInsight =
      "You have moderate posture stability. Improving screen height can boost performance.";
  } else if (overuseMinutes > 40) {
    aiInsight =
      "You maintain good posture but overuse your screen. Add structured breaks.";
  } else {
    aiInsight =
      "Excellent discipline. Your posture and focus habits are highly optimized.";
  }

  return (
    <div
      style={{
        marginTop: 40,
        width: "100%",
        maxWidth: 1120,
      }}
    >
      <h2 style={{ marginBottom: 16 }}>📊 Analytics Dashboard</h2>

      {/* 🔥 TOP CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card title="Posture Score" value={`${postureScore}%`} />
        <Card title="Posture Quality" value={`${avgPostureScore}%`} />
        <Card title="Focus Sessions" value={focusData.length > 0 ? (focusData.find(d => d.name === 'Focus Sessions')?.value || 0).toString() : "0"} />
        <Card title="Focus Phase" value={phase} />
        <Card title="Eye Safety" value={eyeAlerts} />
        {/* 🥛 NEW: Water Glasses Card */}
        <Card title="💧 Water Glasses" value={`${waterGlasses} 🥛`} />
      </div>

      {/* 📈 CHARTS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <div style={chartBox}>
          <h3>Posture Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={postureData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={chartBox}>
          <h3>Focus Activity</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={focusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 🥛 UPDATED: Hydration chart now shows actual glasses */}
        <div style={chartBox}>
          <h3>💧 Hydration Tracker</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                { name: "Glasses Today", value: waterGlasses },
                { name: "Goal (8)", value: 8 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
          {/* 🥛 Visual glass icons */}
          <div style={{ marginTop: 8, fontSize: 22, textAlign: "center" }}>
            {Array.from({ length: waterGlasses }).map((_, i) => (
              <span key={i} title={`Glass ${i + 1}`}>🥛</span>
            ))}
            {waterGlasses === 0 && (
              <span style={{ fontSize: 14, color: "#9ca3af" }}>
                No glasses yet — start the hydration timer!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 🤖 AI INSIGHT */}
      <div style={insightBox}>
        <h3>🤖 AI Insight</h3>
        <p>{aiInsight}</p>
      </div>

      <div style={insightBox}>
        <h3>💧 Hydration Insight</h3>
        <p>{hydrationInsight}</p>
      </div>
    </div>
  );
};

// 🔹 Card
const Card = ({ title, value }: { title: string; value: string }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 16,
      background: "rgba(15,23,42,0.85)",
      border: "1px solid rgba(148,163,184,0.3)",
    }}
  >
    <h4 style={{ marginBottom: 8 }}>{title}</h4>
    <p style={{ fontSize: 18, fontWeight: "bold" }}>{value}</p>
  </div>
);

const chartBox = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(15,23,42,0.85)",
};

const insightBox = {
  marginTop: 24,
  padding: 16,
  borderRadius: 16,
  background: "rgba(30,41,59,0.9)",
};