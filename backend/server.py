import ast
import json
import os
import sqlite3
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_BUILD_DIR = PROJECT_DIR / "frontend" / "build"
DB_PATH = Path(
    os.environ.get(
        "DATABASE_PATH",
        str(Path(tempfile.gettempdir()) / "ai_posture_detector.db"),
    )
)

app = Flask(
    __name__,
    static_folder=str(FRONTEND_BUILD_DIR / "static"),
    static_url_path="/static",
)
CORS(app)

# In-memory posture alert debounce state.
bad_posture_start: dict[str, float] = {}
alert_given: dict[str, bool] = {}
THRESHOLD_SECONDS = 10


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            client_id TEXT,
            started_at TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            session_id INTEGER,
            payload TEXT,
            created_at TEXT
        )
        """
    )

    conn.commit()
    conn.close()


def parse_payload(payload_text: str) -> dict[str, Any]:
    if not payload_text:
        return {}
    try:
        parsed = json.loads(payload_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    try:
        parsed = ast.literal_eval(payload_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def payload_state(payload_text: str) -> str:
    parsed = parse_payload(payload_text)
    state = parsed.get("state")
    if isinstance(state, str):
        return state.lower()
    return payload_text.lower()


def fetch_events_for_client(client_id: str | None) -> list[sqlite3.Row]:
    conn = get_db()
    cur = conn.cursor()

    if client_id:
        cur.execute(
            """
            SELECT e.*
            FROM events e
            LEFT JOIN sessions s ON s.id = e.session_id
            WHERE s.client_id = ?
            ORDER BY e.created_at ASC
            """,
            (client_id,),
        )
    else:
        cur.execute("SELECT * FROM events ORDER BY created_at ASC")

    rows = cur.fetchall()
    conn.close()
    return rows


init_db()


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.post("/sessions")
def start_session():
    data = request.get_json(silent=True) or {}
    client_id = request.headers.get("X-Client-Id")

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO sessions (type, client_id, started_at) VALUES (?, ?, ?)",
        (data.get("type"), client_id, datetime.utcnow().isoformat()),
    )

    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": session_id})


@app.post("/events")
def post_event():
    data = request.get_json(silent=True) or {}
    event_type = data.get("event_type")
    payload = str(data.get("payload", {}))
    session_id = data.get("session_id")

    if not event_type:
        return jsonify({"error": "event_type is required"}), 400

    current_time = time.time()

    # Keep a short debounce for posture alerts.
    if event_type == "posture_state":
        client_key = str(session_id or "anonymous")
        state = payload_state(payload)
        is_bad = state in {"bad", "slouching", "neck_bent"}

        if is_bad:
            if client_key not in bad_posture_start:
                bad_posture_start[client_key] = current_time

            elapsed = current_time - bad_posture_start[client_key]
            if elapsed < THRESHOLD_SECONDS:
                return jsonify({"status": "ignored (waiting 10s)"})

            if alert_given.get(client_key, False):
                return jsonify({"status": "ignored (already alerted)"})

            alert_given[client_key] = True
        else:
            bad_posture_start.pop(client_key, None)
            alert_given[client_key] = False

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO events (event_type, session_id, payload, created_at) VALUES (?, ?, ?, ?)",
        (event_type, session_id, payload, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.get("/analytics")
def get_analytics():
    client_id = request.headers.get("X-Client-Id")
    rows = fetch_events_for_client(client_id)

    posture_data: dict[str, dict[str, int]] = {}
    focus_data: dict[str, int] = {}

    for row in rows:
        created_at = row["created_at"] or ""
        day = created_at[:10] if created_at else "unknown"
        posture_data.setdefault(day, {"good": 0, "bad": 0})

        if row["event_type"] == "posture_state":
            state = payload_state(row["payload"] or "")
            if state == "good":
                posture_data[day]["good"] += 1
            else:
                posture_data[day]["bad"] += 1

        if row["event_type"] == "focus_cycle_completed":
            focus_data[day] = focus_data.get(day, 0) + 1

    posture_result = []
    for day, val in posture_data.items():
        total = val["good"] + val["bad"]
        score = int((val["good"] / total) * 100) if total else 0
        posture_result.append({"day": day, "score": score})

    focus_result = [{"day": day, "minutes": count * 25} for day, count in focus_data.items()]

    return jsonify({"posture": posture_result, "focus": focus_result})


@app.get("/analytics/summary")
def get_analytics_summary():
    client_id = request.headers.get("X-Client-Id")
    rows = fetch_events_for_client(client_id)

    focus_sessions = 0
    total_focus_minutes = 0.0
    posture_events = 0
    good_posture_events = 0
    distance_events = 0
    safe_distance_events = 0

    for row in rows:
        event_type = row["event_type"]
        payload_text = row["payload"] or ""
        payload = parse_payload(payload_text)

        if event_type == "focus_cycle_completed":
            focus_sessions += 1
            seconds = payload.get("actualSeconds")
            planned = payload.get("plannedMinutes")
            if isinstance(seconds, (int, float)):
                total_focus_minutes += float(seconds) / 60.0
            elif isinstance(planned, (int, float)):
                total_focus_minutes += float(planned)
            else:
                total_focus_minutes += 25.0

        elif event_type == "posture_state":
            posture_events += 1
            if payload_state(payload_text) == "good":
                good_posture_events += 1

        elif event_type == "distance_state":
            distance_events += 1
            state = payload.get("state")
            if isinstance(state, str) and state.lower() == "ok":
                safe_distance_events += 1

    summary = {
        "total_focus_minutes": round(total_focus_minutes, 2),
        "focus_sessions": focus_sessions,
        "posture_events": posture_events,
        "good_posture_ratio": (
            good_posture_events / posture_events if posture_events else 0
        ),
        "distance_events": distance_events,
        "safe_distance_ratio": (
            safe_distance_events / distance_events if distance_events else 0
        ),
    }
    return jsonify(summary)


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def serve_frontend(path: str):
    # Keep API routes handled by dedicated endpoints.
    if path.startswith("sessions") or path.startswith("events") or path.startswith("analytics") or path.startswith("health"):
        return jsonify({"error": "Not found"}), 404

    if path:
        candidate = FRONTEND_BUILD_DIR / path
        if candidate.exists() and candidate.is_file():
            return send_from_directory(FRONTEND_BUILD_DIR, path)

    index_path = FRONTEND_BUILD_DIR / "index.html"
    if index_path.exists():
        return send_from_directory(FRONTEND_BUILD_DIR, "index.html")

    return (
        jsonify(
            {
                "message": "Frontend build not found. Run `npm --prefix frontend run build` before deploy."
            }
        ),
        503,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
