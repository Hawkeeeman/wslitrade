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

GitHub Actions runs the same collector every 10 minutes for Alpaca. It cannot see Tailscale, so it does not overwrite bot status. Bot status goes stale after 15 minutes unless this command is run on the tailnet.

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
