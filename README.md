# WSLI — Agentic Trading Intelligence

Presentation website for WSLI, an autonomous agentic trading AI for US equities, secured on a private Tailscale mesh.

## Local preview

```bash
# Python
python3 -m http.server 8080

# Or Node
npx serve .
```

Open [http://localhost:8080](http://localhost:8080).

## Host on Tailscale

Serve the site privately to your tailnet — no public internet exposure.

### Option 1: `tailscale serve` (recommended)

```bash
# From this directory, start a local static server
python3 -m http.server 8080 &

# Expose it on your tailnet
tailscale serve --bg http://127.0.0.1:8080
```

Other devices on your tailnet can reach it at `https://<your-machine>.<tailnet>.ts.net`.

### Option 2: Serve files directly

```bash
tailscale serve --bg --set-path=/ /Users/omar/wslitrade
```

### Option 3: Funnel (public HTTPS, optional)

Only if you want the site publicly accessible:

```bash
tailscale funnel 8080
```

## Structure

```
wslitrade/
├── index.html      # Landing page
├── css/styles.css  # Styles
├── js/main.js      # Terminal animation, chart, ticker
└── README.md
```

## Disclaimer

This site presents WSLI as a product concept. It is not financial advice. Trading US stocks involves substantial risk of loss.
