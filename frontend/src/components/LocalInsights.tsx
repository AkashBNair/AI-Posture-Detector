import React, { useState } from 'react';

interface AnalyticsData {
  total_focus_minutes: number;
  focus_sessions: number;
  posture_events: number;
  good_posture_ratio: number;
  distance_events: number;
  safe_distance_ratio: number;
  hydration_breaks: number;
}

const speakInsight = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Stop any currently playing audio
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly slower, conversational pacing
    window.speechSynthesis.speak(utterance);
  }
};

export const LocalInsights: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');

  const handleAnalyzeDay = () => {
    const avgSession = data.focus_sessions > 0 ? data.total_focus_minutes / data.focus_sessions : 0;
    let result = "";
    
    if (data.good_posture_ratio > 0.8) {
      result = "I'm so proud of you! Your posture was excellent today. Keeping your spine happy means you'll have so much more energy later! ";
    } else {
      result = `I noticed your posture slipped a little today (${Math.round(data.good_posture_ratio * 100)}% good). Please remember to sit back and relax your shoulders—I want you to feel your best! `;
    }

    if (avgSession > 45) {
      result += "You are working incredibly hard, but please remember to take a 5-minute break every half hour. You deserve a moment to stretch and breathe.";
    } else if (data.focus_sessions > 0) {
      result += "Your pacing is spot on! Short bursts of focus are the secret to staying sharp without burning out.";
    } else {
      result += "We haven't logged any focus sessions yet. Whenever you're ready, I'm right here to support you through a 25-minute Pomodoro!";
    }
    
    if (data.hydration_breaks === 0 && data.total_focus_minutes > 15) {
      result += " Also, I noticed you haven't had any water yet! Please grab a drink.";
    }

    setInsight(result);
    speakInsight(result);
  };

  const handleWhyFocusLow = () => {
    const avgSession = data.focus_sessions > 0 ? data.total_focus_minutes / data.focus_sessions : 0;
    let result = "";

    if (data.posture_events > 5 || data.good_posture_ratio < 0.7) {
      result = "When you slouch, your lungs can't fully expand, which means less oxygen and energy for your brain. Let's sit up tall so you can feel refreshed!";
    } else if (data.distance_events > 5 || data.safe_distance_ratio < 0.7) {
      result = "You're leaning a bit too close to the screen. I'm worried about your eyes! Pushing your monitor back will prevent eye strain and headaches.";
    } else if (avgSession > 50) {
      result = "Your focus blocks are stretching a bit too long. It's totally natural to lose focus after 45 minutes. Please take a restorative break—you've earned it.";
    } else {
      result = "Screen fatigue might be catching up with you. Try the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds to give your eyes a hug.";
    }
    
    setInsight(result);
    speakInsight(result);
  };

  const handleImproveTomorrow = () => {
    const avgSession = data.focus_sessions > 0 ? data.total_focus_minutes / data.focus_sessions : 0;
    let result = "";
    
    if (data.good_posture_ratio < data.safe_distance_ratio && data.good_posture_ratio < 0.8) {
      result = "Tomorrow, try setting your monitor so the top is right at eye level. It will save your neck from bending and keep you feeling great all day!";
    } else if (data.safe_distance_ratio < 0.8) {
      result = "Let's try to keep an arm's length away from the screen tomorrow. I want to make sure we protect your beautiful eyes from getting tired.";
    } else if (avgSession > 40) {
      result = "I think reducing your session length to 25 or 30 minutes tomorrow will make a huge difference in how energized you feel. You've got this!";
    } else if (data.focus_sessions < 2) {
      result = "Let's aim for just two focused Pomodoro sessions early tomorrow morning. Tackling the hard stuff first will make the rest of your day a breeze.";
    } else {
      result = "Honestly, your stats look fantastic. Keep up the amazing work with your workspace setup and breaks. I'm cheering you on!";
    }
    setInsight(result);
    speakInsight(result);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const query = chatInput.toLowerCase();
    let result = "";

    if (query.includes("hello") || query.includes("hi") || query.includes("hey")) {
      result = "Hello there! I'm your personal wellness companion. How can I help you feel your best today?";
    } else if (query.includes("pain") || query.includes("hurt") || query.includes("ache") || query.includes("sore")) {
      result = "I'm so sorry you're not feeling well. Pain is often a sign of muscle fatigue from holding one position. Please take a moment to stand up, gently stretch, and check that your lower back is supported.";
    } else if (query.includes("ergonomic") || query.includes("setup") || query.includes("chair") || query.includes("tips")) {
      result = "For a healthy setup, keep your feet flat on the floor, knees at a 90-degree angle, and your monitor at eye level. Let the chair do the work of supporting your spine!";
    } else if (query.includes("posture") || query.includes("slouch") || query.includes("back") || query.includes("neck")) {
      result = data.good_posture_ratio > 0.8
        ? "Your posture is looking wonderful today! Keep sitting back in your chair and relaxing those shoulders."
        : `I noticed you've been slouching a bit (${Math.round((1 - data.good_posture_ratio) * 100)}% of the time). Let's gently pull those shoulders back and sit up tall. You'll feel much better!`;
    } else if (query.includes("distance") || query.includes("eyes") || query.includes("screen") || query.includes("close")) {
      result = data.safe_distance_ratio > 0.8
        ? "You're keeping a very safe distance from the screen. Great job protecting your eyes, I'm proud of you!"
        : "You've been leaning dangerously close to the screen. Please sit about an arm's length away to protect your eyes from straining.";
    } else if (query.includes("focus") || query.includes("break") || query.includes("tired") || query.includes("energy")) {
       const avgSession = data.focus_sessions > 0 ? data.total_focus_minutes / data.focus_sessions : 0;
       result = avgSession > 45
        ? "You've been focusing for long stretches. Please remember your brain needs rest to stay sharp! Take a 5-minute break."
        : "Your pacing is fantastic. Those short bursts of focus followed by quick breaks are exactly what your body needs.";
    } else if (query.includes("water") || query.includes("hydrat") || query.includes("drink")) {
       if (data.hydration_breaks === 0) {
         result = "You haven't logged any water breaks today! Staying hydrated is absolutely vital for your brain and muscles. Please grab a glass of water.";
       } else if (data.hydration_breaks < 4) {
         result = `You've logged ${data.hydration_breaks} water break${data.hydration_breaks > 1 ? 's' : ''} today. You're getting there, but try to drink a bit more!`;
       } else {
         result = `Awesome job! You've logged ${data.hydration_breaks} water breaks today. Excellent hydration keeps your focus sharp!`;
       }
    } else {
      result = "I'm your private wellness companion. Ask me for tips on posture, eye strain, breaks, or how to set up your workspace so you can feel great!";
    }

    setInsight(result);
    speakInsight(result);
    setChatInput("");
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 25px rgba(56,189,248,0.4)',
          marginTop: '10px'
        }}
        title="Talk to AI Assistant"
        className="ai-fab-btn"
      >
        🤖
        <style>{`
          @keyframes attractBounce {
            0%, 94%, 100% { transform: translateY(0); }
            96% { transform: translateY(-15px); }
            98% { transform: translateY(0); }
            99% { transform: translateY(-7px); }
          }
          .ai-fab-btn {
            animation: attractBounce 45s infinite ease-in-out;
            transition: transform 0.2s ease, filter 0.2s ease;
          }
          .ai-fab-btn:hover {
            transform: scale(1.05) !important;
            filter: brightness(1.1);
            animation: none;
          }
        `}</style>
      </button>
    );
  }

  return (
    <div style={{
      width: '320px',
      padding: '18px',
      borderRadius: '16px',
      background: 'rgba(30,41,59,0.9)',
      border: '1px solid rgba(148,163,184,0.35)',
      boxSizing: 'border-box',
      boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
      animation: 'scaleIn 0.2s ease-out'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#e5e7eb' }}>
          🤖 AI Assistant
        </h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px' }}>✕</button>
      </div>
      <p style={{ margin: '0 0 16px', color: '#9ca3af', fontSize: '13px' }}>
        Private local analysis with voice narration. 🔊
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        <button onClick={handleAnalyzeDay} className="insight-btn" style={btnStyle}>Analyze My Day</button>
        <button onClick={handleWhyFocusLow} className="insight-btn" style={btnStyle}>Why Was My Focus Low?</button>
        <button onClick={handleImproveTomorrow} className="insight-btn" style={btnStyle}>How Can I Improve Tomorrow?</button>
      </div>

      {insight && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(15,23,42,0.6)',
          borderLeft: '4px solid #38bdf8',
          color: '#bae6fd',
          fontSize: '14px',
          lineHeight: '1.5',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          {insight}
        </div>
      )}

      <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask a custom question..."
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(148,163,184,0.3)',
            background: 'rgba(15,23,42,0.6)',
            color: '#e5e7eb',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={!chatInput.trim()}
          style={{
            padding: '0 16px',
            borderRadius: '10px',
            background: chatInput.trim() ? '#38bdf8' : 'rgba(56,189,248,0.3)',
            color: '#0f172a',
            border: 'none',
            fontWeight: 'bold',
            cursor: chatInput.trim() ? 'pointer' : 'default',
            transition: 'background 0.2s ease'
          }}
          title="Send question"
        >
          ➤
        </button>
      </form>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .insight-btn:hover {
          background: rgba(56,189,248,0.15) !important;
          border-color: #38bdf8 !important;
        }
      `}</style>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '10px',
  border: '1px solid rgba(56,189,248,0.3)',
  background: 'rgba(15,23,42,0.8)',
  color: '#38bdf8',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  textAlign: 'left'
};