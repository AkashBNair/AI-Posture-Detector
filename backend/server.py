from flask_cors import CORS
from flask import Flask, request, jsonify
import sqlite3
from datetime import datetime
import time

app = Flask(__name__)
from flask import render_template

@app.route("/")
def home():
    return render_template("index.html")
CORS(app)

DB = "wellness.db"

# 🔥 GLOBAL STATE (for posture timing)
bad_posture_start = {}
alert_given = {}

THRESHOLD = 10  # seconds


def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        client_id TEXT,
        started_at TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        session_id INTEGER,
        payload TEXT,
        created_at TEXT
    )
    """)

    conn.commit()
    conn.close()


init_db()


# ✅ START SESSION
@app.route('/sessions', methods=['POST'])
def start_session():
    data = request.json
    client_id = request.headers.get('X-Client-Id')

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO sessions (type, client_id, started_at) VALUES (?, ?, ?)",
        (data.get("type"), client_id, datetime.utcnow().isoformat())
    )

    session_id = cur.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"id": session_id})


# ✅ POST EVENT (🔥 MODIFIED LOGIC HERE)
@app.route('/events', methods=['POST'])
def post_event():
    data = request.json
    event_type = data.get("event_type")
    payload = str(data.get("payload"))
    session_id = data.get("session_id")

    current_time = time.time()

    # 🔥 APPLY 10-SECOND RULE ONLY FOR POSTURE
    if event_type == "posture_state":
        client_key = str(session_id)  # track per session

        is_bad = "bad" in payload

        if is_bad:
            if client_key not in bad_posture_start:
                bad_posture_start[client_key] = current_time

            elapsed = current_time - bad_posture_start[client_key]

            if elapsed < THRESHOLD:
                return jsonify({"status": "ignored (waiting 10s)"})

            if alert_given.get(client_key, False):
                return jsonify({"status": "ignored (already alerted)"})

            alert_given[client_key] = True

        else:
            # reset when posture becomes good
            bad_posture_start.pop(client_key, None)
            alert_given[client_key] = False

    # ✅ STORE EVENT (only valid ones reach here)
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO events (event_type, session_id, payload, created_at) VALUES (?, ?, ?, ?)",
        (
            event_type,
            session_id,
            payload,
            datetime.utcnow().isoformat()
        )
    )

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


# 🔥 ANALYTICS ROUTE
@app.route('/analytics', methods=['GET'])
def get_analytics():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM events")
    rows = cur.fetchall()

    posture_data = {}
    focus_data = {}

    for row in rows:
        date = row["created_at"][:10]

        if date not in posture_data:
            posture_data[date] = {"good": 0, "bad": 0}

        if row["event_type"] == "posture_state":
            if "good" in row["payload"]:
                posture_data[date]["good"] += 1
            else:
                posture_data[date]["bad"] += 1

        if row["event_type"] == "focus_cycle_completed":
            if date not in focus_data:
                focus_data[date] = 0
            focus_data[date] += 1

    posture_result = []
    for day, val in posture_data.items():
        total = val["good"] + val["bad"]
        score = int((val["good"] / total) * 100) if total else 0
        posture_result.append({"day": day, "score": score})

    focus_result = [{"day": k, "minutes": v * 25} for k, v in focus_data.items()]

    conn.close()

    return jsonify({
        "posture": posture_result,
        "focus": focus_result,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)