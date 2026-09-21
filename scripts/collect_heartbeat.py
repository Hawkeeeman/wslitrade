"""Allowlisted public status exporter, run locally on the existing gateway host.

Read-only toward OpenClaw and the observation journal. No model calls, broker
orders, credential reads, or network publication. A separate, authorized
publisher is required. Never export cron payloads or raw error messages.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


def iso_ms(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()


def public_job(job):
    state = job.get("state", {})
    outcome = state.get("lastRunStatus")
    return {
        "enabled": job.get("enabled") is True,
        "lastRunAt": iso_ms(state.get("lastRunAtMs")),
        "nextRunAt": iso_ms(state.get("nextRunAtMs")),
        "lastOutcome": outcome if outcome in {"ok", "error", "skipped"} else None,
    }


def build_snapshot(jobs, heartbeat_id, review_ids, collector, checked_at, verified=False):
    by_id = {j["id"]: j for j in jobs}
    job = by_id[heartbeat_id]  # Missing jobs fail, not a fabricated disabled state.
    heartbeat = public_job(job)
    interval = job.get("schedule", {}).get("everyMs")
    heartbeat["intervalSeconds"] = interval / 1000 if isinstance(interval, (int, float)) else None
    heartbeat["skipReason"] = "empty_task_file" if (
        heartbeat["lastOutcome"] == "skipped" and
        "empty-heartbeat-file" in job.get("state", {}).get("lastError", "")) else None
    reviews = []
    for slot, job_id in review_ids.items():
        review_job = by_id[job_id]
        status = public_job(review_job)
        # Review outcome is scheduler metadata, not the private generated text.
        reviews.append({"slot": slot,
            "scheduledAt": review_job.get("schedule", {}).get("at"),
            "lastOutcome": status["lastOutcome"],
            "citationsVerified": bool(slot == "morning" and verified and status["lastOutcome"] == "ok")})
    return {"schemaVersion": 1, "checkedAt": checked_at,
            "publication": {"automatic": False}, "heartbeat": heartbeat,
            "collector": {k: collector[k] for k in (
                "state", "session", "feed", "mode", "ordersEnabled", "lastObservationAt", "batchCount")},
            "reviews": reviews}


def read_collector(runtime, session):
    with sqlite3.connect((runtime / "journal.sqlite").as_uri() + "?mode=ro", uri=True) as db:
        # Only public counters/timestamps, never quote payloads or account data.
        count, last = db.execute("SELECT count(*),max(at) FROM events WHERE kind=? AND substr(at,1,10)=?",
                                 ("quote_observations", session)).fetchone()
        row = db.execute("SELECT payload FROM events WHERE id=?", ("scan:" + session,)).fetchone()
        sid = json.loads(row[0])["snapshot_id"]
        if not isinstance(sid, str) or len(sid) != 64 or any(c not in "0123456789abcdef" for c in sid):
            raise ValueError("invalid_snapshot_id")
        scan = json.loads((runtime / "snapshots" / (sid + ".json")).read_text())
        if scan["session"] != session or scan["mode"] != "shadow" or scan["orders_enabled"] is not False:
            raise ValueError("unexpected_observer_mode")
        if scan["feed"] not in {"iex", "sip"}:
            raise ValueError("unknown_feed")
    return {"state": "observations_received" if count else "unverified", "session": session,
            "feed": scan["feed"], "mode": "observation", "ordersEnabled": False,
            "lastObservationAt": last, "batchCount": count}


def verify_review(runtime, code, session, review_path):
    # Use the installed private validator without distributing review contents.
    sys.path.insert(0, str(code))
    spec = importlib.util.spec_from_file_location("wsli_private_validator", code / "validate_review.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        review = json.loads(review_path.read_text())
        sid = review["snapshot_id"]
        if not isinstance(sid, str) or len(sid) != 64 or any(c not in "0123456789abcdef" for c in sid):
            return False
        snapshot = json.loads((runtime / "snapshots" / (sid + ".json")).read_text())
        if snapshot["session"] == session and module.validate(review, snapshot)["valid_structure_and_citations"]:
            return True
    except (ValueError, KeyError, TypeError, OSError):
        pass
    return False


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runtime", required=True, type=Path)
    p.add_argument("--code", required=True, type=Path)
    p.add_argument("--session", required=True)
    p.add_argument("--heartbeat-id", required=True)
    p.add_argument("--morning-id", required=True)
    p.add_argument("--morning-review", required=True, type=Path,
                   help="Exact output file of the morning job; never infer it from another review")
    p.add_argument("--end-of-day-id", required=True)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    datetime.strptime(args.session, "%Y-%m-%d")
    runtime, code = args.runtime.resolve(), args.code.resolve()
    result = subprocess.run(["openclaw", "cron", "list", "--all", "--json"],
                            capture_output=True, text=True, check=True, timeout=30)
    collector = read_collector(runtime, args.session)
    snapshot = build_snapshot(json.loads(result.stdout)["jobs"], args.heartbeat_id,
        {"morning": args.morning_id, "end_of_day": args.end_of_day_id}, collector,
        datetime.now(timezone.utc).isoformat(), verify_review(runtime, code, args.session, args.morning_review))
    # A failed read leaves the last successful output and timestamp intact.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=args.output.parent, delete=False) as stream:
        json.dump(snapshot, stream, indent=2, allow_nan=False)
        stream.write("\n")
        tmp = stream.name
    os.replace(tmp, args.output)
    print("Public health snapshot written; no model call or order performed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # The exception text or command stderr might contain private information.
        print("Heartbeat export failed: " + type(exc).__name__, file=sys.stderr)
        raise SystemExit(1)
