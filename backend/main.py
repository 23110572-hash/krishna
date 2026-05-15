from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict
import sqlite3
import os
import json
import urllib.error
import urllib.request
from pathlib import Path


def _load_env_file() -> None:
    """Load KEY=value pairs from backend/.env without requiring python-dotenv."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    try:
        text = env_path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ[key] = val


_load_env_file()

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass

app = FastAPI(title="Competition Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), "competitions.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS competitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT DEFAULT 'upcoming',
            location TEXT,
            prize TEXT,
            team_size INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            competition_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT NOT NULL,
            is_completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            body TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            role TEXT DEFAULT 'user'
        )
    """)
    cursor.execute("PRAGMA table_info(chat_messages)")
    chat_cols = [row[1] for row in cursor.fetchall()]
    if "role" not in chat_cols:
        cursor.execute("ALTER TABLE chat_messages ADD COLUMN role TEXT DEFAULT 'user'")
        cursor.execute("UPDATE chat_messages SET role = 'user' WHERE role IS NULL")
    conn.commit()
    conn.close()

init_db()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def _coach_system_prompt() -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT name, category, status, end_date FROM competitions ORDER BY end_date DESC LIMIT 15"
    )
    rows = cursor.fetchall()
    conn.close()
    if not rows:
        comp_lines = "The user has not added any competitions yet."
    else:
        comp_lines = "\n".join(
            f"- {r['name']} ({r['category']}, {r['status']}, ends {r['end_date']})" for r in rows
        )
    return (
        "You are an AI competition coach inside a local app called Competition Tracker. "
        "Help with preparation, timelines, task breakdowns, and debriefs. Be concise, actionable, and encouraging. "
        "If asked something unrelated to competitions or productivity, answer briefly then steer back.\n\n"
        f"User's current tracker (may be empty):\n{comp_lines}"
    )


def _groq_chat_completion(messages: List[Dict[str, str]]) -> str:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="⚠️ AI Coach not configured. Add a valid GROQ_API_KEY to backend/.env. Get a free key from https://console.groq.com",
        )
    payload = json.dumps(
        {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": 0.65,
            "max_tokens": 1024,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        GROQ_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "CompetitionTracker/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        error_msg = f"Groq API error"
        try:
            err_json = json.loads(err_body)
            if isinstance(err_json, dict) and "error" in err_json:
                if isinstance(err_json["error"], dict) and "message" in err_json["error"]:
                    error_msg = err_json["error"]["message"]
        except:
            pass
        raise HTTPException(
            status_code=502, 
            detail=f"⚠️ AI Coach unavailable: {error_msg}. Check your GROQ_API_KEY in backend/.env or get a new one from https://console.groq.com"
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Groq: {e}") from e
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(status_code=502, detail="Unexpected response from Groq") from e

# --- Pydantic Models ---
class CompetitionCreate(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    start_date: str
    end_date: str
    status: Optional[str] = "upcoming"
    location: Optional[str] = None
    prize: Optional[str] = None
    team_size: Optional[int] = 1

class CompetitionUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    prize: Optional[str] = None
    team_size: Optional[int] = None

class MilestoneCreate(BaseModel):
    competition_id: int
    title: str
    description: Optional[str] = None
    due_date: str
    is_completed: Optional[bool] = False

class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    is_completed: Optional[bool] = None

class ChatMessageCreate(BaseModel):
    body: str

# --- Competition Endpoints ---
@app.get("/api/competitions")
def get_competitions(status: Optional[str] = None, category: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM competitions WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY start_date ASC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/competitions/{comp_id}")
def get_competition(comp_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM competitions WHERE id = ?", (comp_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Competition not found")
    comp = dict(row)
    cursor.execute("SELECT * FROM milestones WHERE competition_id = ? ORDER BY due_date ASC", (comp_id,))
    comp["milestones"] = [dict(m) for m in cursor.fetchall()]
    conn.close()
    return comp

@app.post("/api/competitions", status_code=201)
def create_competition(comp: CompetitionCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO competitions (name, category, description, start_date, end_date, status, location, prize, team_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (comp.name, comp.category, comp.description, comp.start_date, comp.end_date,
          comp.status, comp.location, comp.prize, comp.team_size))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "message": "Competition created successfully"}

@app.put("/api/competitions/{comp_id}")
def update_competition(comp_id: int, comp: CompetitionUpdate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM competitions WHERE id = ?", (comp_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Competition not found")
    fields = {k: v for k, v in comp.dict().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [comp_id]
        cursor.execute(f"UPDATE competitions SET {set_clause} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return {"message": "Competition updated successfully"}

@app.delete("/api/competitions/{comp_id}")
def delete_competition(comp_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM competitions WHERE id = ?", (comp_id,))
    conn.commit()
    conn.close()
    return {"message": "Competition deleted successfully"}

# --- Milestone Endpoints ---
@app.get("/api/milestones")
def get_milestones(competition_id: Optional[int] = None):
    conn = get_db()
    cursor = conn.cursor()
    if competition_id:
        cursor.execute("SELECT * FROM milestones WHERE competition_id = ? ORDER BY due_date ASC", (competition_id,))
    else:
        cursor.execute("SELECT * FROM milestones ORDER BY due_date ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/milestones", status_code=201)
def create_milestone(ms: MilestoneCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM competitions WHERE id = ?", (ms.competition_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Competition not found")
    cursor.execute("""
        INSERT INTO milestones (competition_id, title, description, due_date, is_completed)
        VALUES (?, ?, ?, ?, ?)
    """, (ms.competition_id, ms.title, ms.description, ms.due_date, int(ms.is_completed)))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "message": "Milestone created successfully"}

@app.put("/api/milestones/{ms_id}")
def update_milestone(ms_id: int, ms: MilestoneUpdate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM milestones WHERE id = ?", (ms_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Milestone not found")
    fields = {k: v for k, v in ms.dict().items() if v is not None}
    if "is_completed" in fields:
        fields["is_completed"] = int(fields["is_completed"])
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [ms_id]
        cursor.execute(f"UPDATE milestones SET {set_clause} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return {"message": "Milestone updated"}

@app.delete("/api/milestones/{ms_id}")
def delete_milestone(ms_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM milestones WHERE id = ?", (ms_id,))
    conn.commit()
    conn.close()
    return {"message": "Milestone deleted"}

@app.get("/api/stats")
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM competitions")
    total = cursor.fetchone()["total"]
    cursor.execute("SELECT status, COUNT(*) as count FROM competitions GROUP BY status")
    status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}
    cursor.execute("SELECT COUNT(*) as total FROM milestones")
    total_ms = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) as done FROM milestones WHERE is_completed = 1")
    done_ms = cursor.fetchone()["done"]
    cursor.execute("SELECT category, COUNT(*) as count FROM competitions GROUP BY category")
    categories = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {
        "total_competitions": total,
        "status_counts": status_counts,
        "total_milestones": total_ms,
        "completed_milestones": done_ms,
        "categories": categories
    }

# --- AI coach chat (SQLite + Groq) ---
@app.get("/api/chat/messages")
def get_chat_messages(limit: int = 200):
    limit = max(1, min(limit, 500))
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS c FROM chat_messages")
    total = cursor.fetchone()["c"]
    offset = max(0, total - limit)
    cursor.execute(
        """
        SELECT id, body, created_at, COALESCE(role, 'user') AS role
        FROM chat_messages
        ORDER BY id ASC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/chat/messages", status_code=201)
def create_chat_message(msg: ChatMessageCreate):
    body = (msg.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO chat_messages (body, role) VALUES (?, 'user')", (body,))
    conn.commit()
    new_id = cursor.lastrowid
    cursor.execute(
        "SELECT id, body, created_at, COALESCE(role, 'user') AS role FROM chat_messages WHERE id = ?",
        (new_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row)


@app.post("/api/chat/send", status_code=201)
def chat_send_with_groq(msg: ChatMessageCreate):
    body = (msg.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO chat_messages (body, role) VALUES (?, 'user')", (body,))
        conn.commit()

        cursor.execute(
            """
            SELECT COALESCE(role, 'user') AS role, body
            FROM chat_messages
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 24
            """
        )
        history_rows = list(cursor.fetchall())[::-1]

        groq_messages: List[Dict[str, str]] = [{"role": "system", "content": _coach_system_prompt()}]
        for r in history_rows:
            role = r["role"] if r["role"] in ("user", "assistant") else "user"
            groq_messages.append({"role": role, "content": r["body"]})

        try:
            reply = _groq_chat_completion(groq_messages)
        except HTTPException as e:
            # Re-raise the HTTPException to be handled by FastAPI
            raise e
        if not reply:
            reply = "(No response from AI coach)"

        cursor.execute("INSERT INTO chat_messages (body, role) VALUES (?, 'assistant')", (reply,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


# Serve frontend LAST so /api routes stay reachable
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")
