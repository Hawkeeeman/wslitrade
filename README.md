# WSLI

Site for the Alpaca paper bot.

- **Home:** https://wslitrade.com
- **Agents:** https://wslitrade.com/agents.html

The Agents page reads `data/live.json`.

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
