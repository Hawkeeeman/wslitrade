# WSLI

Site for the Alpaca paper bot.

- **Home:** https://wslitrade.com
- **Agents:** https://wslitrade.com/agents.html

## Approved paper continuation: October 26–30, 2026

Abed approved a five-session paper-only continuation for October 26–30, with
the same three-attempt policy and dollar-risk limits. The October 7–20 run is
historical. Existing account equity, losses, journals and broker history are
preserved; no balance is reset and no entry is authorized October 21–25 or
after October 30. Installation must be confirmed on hawkspc before calling
these future timers or Gem's reviews active. Publication dates come from the
verified host configuration, not hard-coded website copy.

The checked continuation installer is queued on hawkspc for October 23 at
16:15 Eastern because its safety guard requires a closed market and flat account.
The earlier daytime attempt stopped before activation. Staging and a timer are
not proof of installation: check `trial-renewal-20261026.json`, the matching
installed config/arm and actual next timers. The post-install step invokes only
the existing read-only publisher and records a separate publication receipt.
The public continuation banner distinguishes queued, verification-pending and
matching installed configuration. Keep hawkspc and WSL awake for this one-time
job; it has no missed-run catch-up and cannot wake Windows.

The Home and Agents pages read **`data/paper.json`**, not the legacy account's
`data/live.json`. The new experiment starts with $10,000 paper equity. The page
shows preparation, opening-range candidates, recorded quote batches, the actual
supervisor checkpoint, entry usage, broker positions and fills, and Gem's two
bounded review outcomes. An order intent is not a fill; a saved AI report is not
proof of correct reasoning. There is no website button that places an order.

`scripts/collect_paper.py` runs read-only on hawkspc against the installed,
account-pinned paper executor. Its public allowlist excludes credentials,
account identifiers, client-order IDs, private paths, prompts and raw reports.
Unrelated orders and the canceled setup test are excluded. Publication failures
preserve previous timestamps. A missing source is never treated as completion.

The browser checks both the public repository and packaged snapshots every
20 seconds and selects the newest valid timestamp; either CDN can lag. This
avoids waiting for a complete site rebuild for each data update. **This is delayed monitoring, not a real-time
trading console.** After 15 minutes the page says updates are delayed, not that
the host is necessarily offline. Market status uses verified broker time or an
explicitly labelled exchange calendar, not a guessed weekday clock.

The separate non-AI publisher is prepared on hawkspc. The repo owner must add its
public deploy key with write access to **Hawkeeeman/wslitrade only**. The private
key stays on hawkspc. Repo write access is not path-level isolation; the publisher
itself stages only `data/paper.json`. No personal GitHub credential is copied.
The original `scripts/install_publisher.py --apply` verified a real push, then installed
the finite ten-minute weekday timer, 07:00–17:50 Eastern, October 7–20 only.
The approved continuation renews that same publisher for October 26–30 without
changing its repository-only access. Do not rerun the old date-pinned installer.
Until that succeeds, the snapshot is explicitly labelled manual. The timer is
not an AI heartbeat and cannot wake Windows. Keep hawkspc and WSL awake.

The paper executor prepares at 07:45, starts monitoring at 09:30, and permits
entries only 09:36–11:00 Eastern. October 7 retains one entry attempt. The approved
October 8 policy permits up to three attempts, one position at a time, no repeat
symbols, and a durable 15-minute cooldown after a verified flat exit. Attempts
are reserved before network transmission; timeouts and rejections consume slots.
Dollar limits remain at most
$1,000 exposure and $10 nominal stop risk, with a $100 daily-loss entry cutoff.
Gaps, slippage and outages can exceed nominal risk. It starts liquidation five
minutes before the actual exchange close. Gem reviews at 10:05 and 16:05; it
does not submit broker orders. A no-trade day or consumed attempt limit is a valid
monitored state, not a sleeping bot.

The private host upgrade is staged and scheduled for October 7 at 16:10 Eastern,
after the close review. It refuses an open market, running supervisor, nonflat
account, halt, unexpected config or arm hash. Existing source/arm backups and
the execution ledger are preserved; no balance reset, direct order or restart.
Its installation receipt must be checked before claiming the new policy is live.
The host must remain awake; the one-time timer has no missed-run catch-up.

The Agents page separates actual fills (shares, average price, notional, realized
round trip P/L and duration) from planned limits/stops and recorded admission
evidence. The old entry lacks an embedded decision quote; it is not reconstructed.
Gem's later review is not presented as a pre-buy decision or hidden thoughts.
Weekday research is scheduled at 16:30 Eastern in this Codex chat, not as another
trading loop. It proposes evidence-backed tests; it cannot change the strategy.

Research baseline: the [ORB paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284)
also uses a 10%-of-ATR stop. A quick stop-out does not establish a code bug.
Its broader long/short book is not replicated by this small, long-only,
one-position experiment; the paper's reported returns cannot be inherited.
Alpaca documents IEX-only paper data access but NBBO simulated fills, another
signal/execution mismatch to investigate before claiming a market edge.

Website tests: `node --test tests/*.test.js` and
`python3 -m unittest discover -s tests -v`.

### Read-only publication after a cold start

`scripts/readonly_sqlite.py` supplies private, consistent database snapshots to
the public exporter. Warm/active databases use SQLite's online backup API with
a read-only source connection, so committed WAL frames are included and
uncommitted writes excluded. A closed WAL database without a WAL file uses a
guarded copy only when its inode, size, nanosecond mtime/ctime and absence of WAL
or rollback journal stay unchanged throughout capture. Races retry briefly,
then fail closed. A live WAL without its shared-memory index is never ignored.

Copies live in 0700 temporary directories (the host service already uses
PrivateTmp); only the detached copy is normalized/opened for query. They are
deleted on success or error and never enter the public repository. The live
database is never marked immutable, checkpointed, edited or granted broader
permissions. The publisher's existing read-only home protection stays intact.
An unavailable/corrupt snapshot preserves the last successful public bytes and
timestamps. Source modes, data hashes and missing sidecars must remain unchanged
in cold-start and actual-service-sandbox tests.

A fresh publication is not proof that the trading session ran. The dashboard
now says “Session not recorded” when a verified completed exchange session in
the approved trial has no matching supervisor checkpoint; pre-open idle and
completed sessions are not mislabelled. Windows/WSL must still be running for
the finite timers; the publisher cannot wake the host or replay a missed day.

Recorded session quality is now separate from publication freshness. A matching
flat checkpoint does not establish that preparation, a timely opening scan, or
candidate quote collection succeeded. After the verified scan deadline, missing
evidence is labelled **Session incomplete**, including in the historical banner
after publication becomes stale. A completed scan with zero candidates is valid
and does not require quote batches. Old pre-open snapshots never become invented
session failures merely because the browser clock advances. The finite publisher
window and trial end date are displayed explicitly; no automatic extension is implied.

## Privacy, public credentials and performance disclosures

Every site page links to `privacy.html`, `cookies.html`, `terms.html` and
`risk.html`. Operator legal identity, jurisdiction and a designated private
privacy contact still need confirmation; these factual notices are not a
lawyer's jurisdiction-specific review or protection from all claims.

No optional analytics, ads, embedded widgets, first-party cookies or persistent
visitor IDs are used. The two fonts are now self-hosted, with their SIL licenses
under `assets/fonts`; visiting no longer requests Google Fonts. GitHub Pages
and the public raw snapshot endpoint receive ordinary connection information.
The privacy notice links to GitHub's processing and security-log disclosures.
Do not claim that hosting receives no personal data. No consent banner is added
for nonexistent tracking. Any future optional tracking requires a fresh inventory
and appropriate consent controls before it loads.

The browser has no broker/model credentials and cannot call the gateway or
submit an order. CSP meta tags restrict scripts/assets to the site and status
requests to the site/GitHub raw host; referrers are suppressed. GitHub Pages does
not allow this repo to set arbitrary HTTP response headers. In particular,
anti-framing `frame-ancestors`, HSTS and server-side Permissions-Policy must not
be claimed as configured by a meta tag. A separate hosting/header review would
be required for those controls.

Before publishing, run `node scripts/audit_public.js --history origin/main` plus
the full tests. The scanner reports paths/rule names, never secret values. It
checks tracked files and the selected public commit history for private artifacts,
recognizable credentials and forbidden public JSON fields. It is heuristic and
does not prove that every possible secret format is absent. Scan the actual
public branch, not unrelated private local snapshot commits.

Never stage the private `pilot/`, `tmp/`, `output/` or editor directories. Do not
place credentials in source, public snapshots or build output. If a real secret
is exposed, stop publication, have its owner revoke/rotate it, and plan any
history cleanup separately; removing a current file alone is not remediation.
The site security checks must pass without access to any trading secrets.
The read-only `Public site safety` GitHub workflow repeats the audit and tests
after pushes and on pull requests. It is a regression check, not a pre-push
secret blocker or a promise that a parallel Pages deployment is gated by it;
the pre-publication local audit still matters.

The dashboard explicitly states profitability is unestablished. The October 20
endpoint was an operational review, not an alpha claim. The separately approved
October 26–30 continuation is also bounded, not authorization for further
sessions or live money. `risk.html` separates simulated P/L from cost-adjusted
estimates and describes the evaluation evidence still needed. No confidence
interval, performance guarantee, or live return is fabricated.

## Historical observer and legacy account (not the current dashboard)

The files and workflow below are preserved historical integrations. The current
pages do not consume their balances or heartbeat files. The legacy GitHub Action
can continue refreshing `data/live.json` without overwriting the new pilot.

### September Gem heartbeat and observer status

The previous Agents page independently read `data/heartbeat.json`. It distinguished
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

### Refresh the legacy snapshot

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

Required GitHub secrets for the legacy workflow only:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`

## Local preview

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [http://localhost:8080](http://localhost:8080).

## Disclaimer

Paper trading only. Not financial advice. Trading US stocks involves substantial risk of loss.
