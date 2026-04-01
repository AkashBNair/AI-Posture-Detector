import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session as DbSession, create_engine, select, SQLModel

from .models import (
    Event,
    EventCreate,
    Session as WorkSession,
    SessionCreate,
    SessionRead,
    SummaryStats,
)


app = FastAPI(title="Digital Wellness Assistant API")

# Allow local frontend during development
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "sqlite:///./wellness.db"
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_db() -> DbSession:
    with DbSession(engine) as session:
        yield session


def get_client_id(x_client_id: Optional[str] = Header(default=None)) -> str:
    if not x_client_id:
        raise HTTPException(status_code=400, detail="X-Client-Id header is required")
    return x_client_id


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


@app.get("/")
async def root():
    return {"message": "Digital Wellness Assistant API"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/sessions", response_model=SessionRead)
async def create_session(
    session_in: SessionCreate,
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    db_session = WorkSession(client_id=client_id, type=session_in.type)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@app.patch("/sessions/{session_id}/end", response_model=SessionRead)
async def end_session(
    session_id: int,
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    statement = select(WorkSession).where(
        WorkSession.id == session_id, WorkSession.client_id == client_id
    )
    result = db.exec(statement).first()
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")

    result.ended_at = datetime.utcnow()
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@app.post("/events")
async def create_event(
    event_in: EventCreate,
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    ev = Event(
        client_id=client_id,
        session_id=event_in.session_id,
        event_type=event_in.event_type,
        payload_json=json.dumps(event_in.payload),
    )
    db.add(ev)
    db.commit()
    return {"status": "ok"}


# ── NEW: Save posture calibration baseline to the backend ──────────

@app.post("/posture/calibration")
async def save_posture_calibration(
    calibration: dict,
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    """
    Stores the user's personal posture baseline (neck, slouch, neckStd, slouchStd)
    as an event so it can be restored on any device or after clearing localStorage.
    """
    ev = Event(
        client_id=client_id,
        session_id=None,
        event_type="posture_calibration",
        payload_json=json.dumps(calibration),
    )
    db.add(ev)
    db.commit()
    return {"status": "ok"}


@app.get("/posture/calibration")
async def get_posture_calibration(
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    """
    Returns the most recent posture calibration baseline for this user.
    The frontend can use this to skip recalibration if a profile already exists.
    """
    stmt = (
        select(Event)
        .where(
            Event.client_id == client_id,
            Event.event_type == "posture_calibration",
        )
        .order_by(Event.created_at.desc())  # type: ignore
        .limit(1)
    )
    result = db.exec(stmt).first()
    if not result:
        return {"calibration": None}

    try:
        payload = json.loads(result.payload_json)
    except Exception:
        return {"calibration": None}

    return {"calibration": payload, "calibrated_at": result.created_at.isoformat()}


@app.get("/analytics/summary", response_model=SummaryStats)
async def analytics_summary(
    days: int = 1,
    client_id: str = Depends(get_client_id),
    db: DbSession = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)

    stmt = select(Event).where(
        Event.client_id == client_id,
        Event.created_at >= since,
    )
    events: List[Event] = list(db.exec(stmt))

    total_focus_minutes = 0.0
    focus_sessions = 0
    posture_events = 0
    good_posture_count = 0
    distance_events = 0
    safe_distance_count = 0
    posture_alerts = 0  # NEW: track how many times adaptive alerts fired

    for ev in events:
        if ev.event_type == "focus_cycle_completed":
            try:
                payload = json.loads(ev.payload_json)
            except Exception:
                continue
            total_focus_minutes += float(payload.get("actualSeconds", 0) / 60.0)
            focus_sessions += 1

        elif ev.event_type == "posture_state":
            posture_events += 1
            try:
                payload = json.loads(ev.payload_json)
            except Exception:
                continue
            if payload.get("state") == "good":
                good_posture_count += 1

        elif ev.event_type == "distance_state":
            distance_events += 1
            try:
                payload = json.loads(ev.payload_json)
            except Exception:
                continue
            if payload.get("state") == "ok":
                safe_distance_count += 1

        # NEW: count posture alert events from the adaptive system
        elif ev.event_type == "posture_alert":
            posture_alerts += 1

    good_posture_ratio = (
        good_posture_count / posture_events if posture_events > 0 else 0.0
    )
    safe_distance_ratio = (
        safe_distance_count / distance_events if distance_events > 0 else 0.0
    )

    return SummaryStats(
        total_focus_minutes=round(total_focus_minutes, 2),
        focus_sessions=focus_sessions,
        posture_events=posture_events,
        good_posture_ratio=round(good_posture_ratio, 2),
        distance_events=distance_events,
        safe_distance_ratio=round(safe_distance_ratio, 2),
    )