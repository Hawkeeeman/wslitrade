#!/usr/bin/env python3
"""Write data/live.json from Alpaca and OpenClaw health."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

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
    raise SystemExit("Missing Alpaca credentials")


def alpaca_get(path: str) -> object:
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
            "detail": "OpenClaw health live" if live else f"Health said {payload}",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return {
            "state": "asleep",
            "checkedAt": now_iso(),
            "host": "hawkspc",
            "detail": f"Unreachable: {exc.__class__.__name__}",
        }


def collect_account() -> tuple[dict, list, list]:
    account = alpaca_get("/v2/account")
    positions = alpaca_get("/v2/positions")
    orders = alpaca_get("/v2/orders?status=all&limit=50&direction=desc")
    if not isinstance(account, dict) or not isinstance(positions, list) or not isinstance(orders, list):
        raise SystemExit("Unexpected Alpaca payload")
    safe_account = {
        "equity": account.get("equity"),
        "cash": account.get("cash"),
        "buyingPower": account.get("buying_power"),
        "status": account.get("status"),
        "paper": True,
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


def build_feed(bot: dict, account: dict, trades: list, error: str | None) -> list:
    items = []
    if error:
        items.append({"at": now_iso(), "text": error})
    items.append({"at": bot.get("checkedAt") or now_iso(), "text": f"Bot {bot.get('state')}: {bot.get('detail')}"})
    items.append({
        "at": now_iso(),
        "text": f"Alpaca paper equity {account.get('equity')} · {len(trades)} recent orders",
    })
    if not trades:
        items.append({"at": now_iso(), "text": "No Alpaca orders on the current paper account yet."})
    return items[:12]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-bot", action="store_true", help="Keep previous bot status (GitHub cannot see Tailscale)")
    args = parser.parse_args()

    previous = load_json(OUT)
    error = None
    account, positions, trades = {}, [], []
    try:
        account, positions, trades = collect_account()
    except Exception as exc:  # keep a snapshot even if Alpaca fails
        error = f"Alpaca error: {exc}"
        account = previous.get("account") or {}
        positions = previous.get("positions") or []
        trades = previous.get("trades") or []

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
        "bot": bot,
        "account": account,
        "positions": positions,
        "trades": trades,
        "feed": build_feed(bot, account, trades, error),
    }
    stable = {key: payload[key] for key in ("bot", "account", "positions", "trades")}
    prev_stable = {key: previous.get(key) for key in stable}
    if args.skip_bot and stable == prev_stable and OUT.exists():
        print(f"No live change ({OUT})")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUT} ({payload['source']})")


if __name__ == "__main__":
    main()
