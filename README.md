# WSLI

Site for the Alpaca paper bot.

- **Home:** https://wslitrade.com
- **Agents:** https://wslitrade.com/agents.html

The Agents page reads `data/live.json`.

## Gem heartbeat and observer status

The Agents page also independently reads `data/heartbeat.json`. It distinguishes
general heartbeat attempts, recorded quote batches, and the two bounded AI reviews.
The current file is a **manually verified snapshot**, not a streaming connection.
After 15 minutes it becomes unverified; an elapsed next-run time never implies
that a job succeeded. A skipped empty heartbeat is not an outage or an AI review.

Automatic host-to-site publication is **not connected**. The user authorized a
repository-only connection, but the available GitHub account has push permission,
not repository admin permission. The repo owner must arrange that connection;
do not copy a personal GitHub credential from another machine or expose the gateway.
The verified observer/review schedule now covers September 21–25 only, not an
indefinite daily schedule. On hawkspc, four additional preparation timers run at
07:45 ET on September 22–25, with observation at 09:36 ET, morning review at
09:38 ET and end-of-day review at 16:05 ET. Each review has a 180-second limit.
The existing Monday observer is unchanged. Timers do not catch up missed runs
and cannot wake Windows; keep hawkspc/WSL awake. Future successful execution is
not established merely by installing a timer.

A separate, non-AI watchdog runs every minute from 09:00–16:59 ET on September
21–25. It reads the private journal, checks session completion and stale/missing
observations, and records local state transitions. It has no broker credentials,
does not call a model, does not restart anything, and does not send notifications.
Automatic publication of that health report remains blocked on the host-to-repo
connection. Public snapshots include only minimal health metadata, not journals.

Closing reviews now generate a deterministic audit directly from the append-only
journal before the AI summarizes it. The stored counters must satisfy valid plus
rejected equals total. The September 21 correction records 58,295 observations:
46,566 valid and 11,729 rejected, with zero orders. The original inaccurate AI
summary remains preserved privately rather than being silently rewritten.

`scripts/collect_heartbeat.py` is a tested read-only exporter, ready for a separately
authorized host publisher. It takes explicit runtime/code/session and job IDs
(see `--help`), writes only allowlisted health metadata to `--output`, and does not
publish, schedule, call a model, or place orders. It has not been installed on the
host. Keep `publication.automatic` false until a recurring publisher is actually
installed and its end-to-end update verified. The existing Alpaca workflow does
not update or redate this separate file.

Only check times, outcomes, intervals, batch counts, feed, session and citation
validation booleans belong in the public heartbeat. Never add raw prompts, model
responses, account identifiers, credentials, private host paths, or journal payloads.

## Refresh the snapshot

From a machine on the tailnet (so hawkspc health is reachable):

```bash
python3 scripts/collect_live.py
```

GitHub Actions requests a refresh every 10 minutes for Alpaca, but scheduled jobs
can be delayed and are not a real-time service. It cannot see Tailscale, so it
does not overwrite gateway health. Health becomes unverified after 15 minutes
unless a tailnet operator publishes a new check. This is not proof of an outage.

To refresh only gateway health without accessing or redating Alpaca balances:

```bash
python3 scripts/collect_live.py --bot-only
```

Commit/publish the resulting data file to make the check visible on the website.
No standing tailnet-to-GitHub health publisher is configured by this repository.
Do not expose OpenClaw publicly or put credentials in browser JavaScript.

Market hours use a fresh Alpaca clock when available. Otherwise the UI may show
an explicitly labelled exchange schedule from the collected calendar, which
includes holidays and early closes. Expired/out-of-range evidence is unverified,
never silently treated as closed. Each data source retains its own checkedAt
timestamp on failure; updatedAt is only the collector attempt time.

This dashboard does not start a bot or place orders. Gateway health is not
strategy health. The private ORB observation pilot does not publish its journal
here and its results must not be confused with existing paper-account positions.

Tests: `node --test tests/status.test.js` and
`python3 -m unittest discover -s tests -v`.

Required GitHub secrets:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`

## Local preview

```bash
python3 scripts/collect_live.py
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Disclaimer

Paper trading only. Not financial advice. Trading US stocks involves substantial risk of loss.
