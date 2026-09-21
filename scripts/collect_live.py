#!/usr/bin/env python3
"""Write data/live.json from Alpaca and OpenClaw health."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "live.json"
HEALTH_URL = os.environ.get("OPENCLAW_HEALTH_URL", "https://hawkspc.tail2bfb3b.ts.net/health")
ALPACA_BASE = os.environ.get("APCA_API_BASE_URL", "https://paper-api.alpaca.markets").rstrip("/")
CREDS_PATH = Path.home() / ".openclaw" / "credentials" / "alpaca.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def alpaca_creds() -> tuple[str, str]:
    key = os.environ.get("APCA_API_KEY_ID")
    secret = os.environ.get("APCA_API_SECRET_KEY")
    if key and secret:
        return key, secret
    if CREDS_PATH.exists():
        creds = json.loads(CREDS_PATH.read_text())
        return creds["apiKey"], creds["secretKey"]
    raise RuntimeError("Missing Alpaca credentials")


def alpaca_get(path: str) -> object:
    if ALPACA_BASE != "https://paper-api.alpaca.markets":
        raise RuntimeError("This public dashboard is paper-only")
    key, secret = alpaca_creds()
    req = urllib.request.Request(
        ALPACA_BASE + path,
        headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret},
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def check_bot() -> dict:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=8) as res:
            payload = json.load(res)
        live = bool(payload.get("ok")) and payload.get("status") == "live"
        return {
            "state": "awake" if live else "asleep",
            "checkedAt": now_iso(),
            "host": "hawkspc",
            "detail": "OpenClaw gateway reachable" if live else "Gateway health not live",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return {
            "state": "asleep",
            "checkedAt": now_iso(),
            "host": "hawkspc",
            "detail": f"Unreachable: {exc.__class__.__name__}",
        }


def collect_market() -> dict:
    clock_data = alpaca_get("/v2/clock")
    if not isinstance(clock_data, dict) or type(clock_data.get("is_open")) is not bool:
        raise ValueError("Unexpected market clock payload")
    return {
        "open": clock_data["is_open"],
        "checkedAt": now_iso(),
        "nextOpen": clock_data.get("next_open"),
        "nextClose": clock_data.get("next_close"),
    }


def collect_calendar() -> dict:
    et = ZoneInfo("America/New_York")
    start = datetime.now(et).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=7)
    rows = alpaca_get(f"/v2/calendar?start={start.date()}&end={end.date()}")
    if not isinstance(rows, list):
        raise ValueError("Unexpected calendar payload")
    sessions = []
    for row in rows:
        opened = datetime.fromisoformat(f'{row["date"]}T{row["open"]}').replace(tzinfo=et)
        closed = datetime.fromisoformat(f'{row["date"]}T{row["close"]}').replace(tzinfo=et)
        if not start <= opened < closed < end + timedelta(days=1):
            raise ValueError("Invalid exchange session")
        sessions.append({"open": opened.isoformat(), "close": closed.isoformat()})
    return {"checkedAt": now_iso(), "from": start.isoformat(),
            "through": (end + timedelta(days=1)).isoformat(),
            "sessions": sorted(sessions, key=lambda s: s["open"])}


def collect_account() -> tuple[dict, list, list]:
    account = alpaca_get("/v2/account")
    positions = alpaca_get("/v2/positions")
    orders = alpaca_get("/v2/orders?status=all&limit=50&direction=desc")
    if not isinstance(account, dict) or not isinstance(positions, list) or not isinstance(orders, list):
        raise ValueError("Unexpected Alpaca payload")
    equity = float(account.get("equity") or 0)
    last_equity = float(account.get("last_equity") or equity)
    safe_account = {
        "equity": account.get("equity"),
        "cash": account.get("cash"),
        "buyingPower": account.get("buying_power"),
        "status": account.get("status"),
        "dayPl": round(equity - last_equity, 2),
        "paper": True,
        "checkedAt": now_iso(),
    }
    safe_positions = [
        {
            "symbol": p.get("symbol"),
            "qty": p.get("qty"),
            "side": p.get("side"),
            "avgEntry": p.get("avg_entry_price"),
            "price": p.get("current_price"),
            "marketValue": p.get("market_value"),
            "unrealizedPl": p.get("unrealized_pl"),
        }
        for p in positions
    ]
    trades = [
        {
            "at": o.get("filled_at") or o.get("submitted_at"),
            "side": o.get("side"),
            "symbol": o.get("symbol"),
            "qty": o.get("filled_qty") or o.get("qty") or o.get("notional"),
            "price": o.get("filled_avg_price"),
            "status": o.get("status"),
        }
        for o in orders
    ]
    return safe_account, safe_positions, trades


def build_feed(bot: dict, account: dict, trades: list, market: dict, error: str | None) -> list:
    items = []
    if error:
        items.append({"at": now_iso(), "text": error})
    items.append({"at": bot.get("checkedAt") or now_iso(), "text": f"Bot {bot.get('state')}: {bot.get('detail')}"})
    session = "open" if market.get("open") is True else "closed" if market.get("open") is False else "unverified"
    items.append({
        "at": market.get("checkedAt"),
        "text": f"Last broker check: market {session}. Historical check, not current session status.",
    })
    if not trades:
        items.append({"at": account.get("checkedAt"), "text": "No orders in the last successful account snapshot."})
    return items[:12]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-bot", action="store_true", help="Keep previous bot status (GitHub cannot see Tailscale)")
    parser.add_argument("--bot-only", action="store_true", help="Refresh health only; do not access Alpaca or redate its data")
    args = parser.parse_args()

    previous = load_json(OUT)
    if args.skip_bot and args.bot_only:
        parser.error("--skip-bot and --bot-only are mutually exclusive")
    account = dict(previous.get("account") or {})
    positions = previous.get("positions") or []
    trades = previous.get("trades") or []
    market = dict(previous.get("market") or {})
    # Migration preserves the OLD timestamp, never the current attempt time.
    for section in (account, market):
        if section and "checkedAt" not in section:
            section["checkedAt"] = previous.get("updatedAt")
    errors = dict(previous.get("errors") or {}) if args.bot_only else {}
    if not args.bot_only:
        try:
            account, positions, trades = collect_account()
        except Exception as exc:
            errors["account"] = type(exc).__name__
        try:
            current = collect_market()
            market.update(current)
        except Exception as exc:
            errors["market"] = type(exc).__name__
        try:
            market["calendar"] = collect_calendar()
        except Exception as exc:
            errors["calendar"] = type(exc).__name__

    if args.skip_bot:
        bot = previous.get("bot") or {
            "state": "unknown",
            "checkedAt": None,
            "host": "hawkspc",
            "detail": "Not checked from this collector",
        }
    else:
        bot = check_bot()

    payload = {
        "updatedAt": now_iso(),
        "source": "github-actions" if args.skip_bot else "tailnet-collector",
        "errors": errors,
        "bot": bot,
        "account": account,
        "market": market,
        "positions": positions,
        "trades": trades,
        "feed": build_feed(bot, account, trades, market,
                           "Refresh incomplete: " + ", ".join(errors) if errors else None),
    }
    # A successful check matters even when balances are unchanged.
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUT} ({payload['source']})")
    if errors and not args.bot_only:
        raise SystemExit("Partial refresh; prior observations retained with their original timestamps")


if __name__ == "__main__":
    main()
