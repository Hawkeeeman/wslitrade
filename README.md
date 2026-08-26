# WSLI — Agentic Trading Intelligence

Presentation website for WSLI, an autonomous agentic trading AI for US equities, secured on a private Tailscale mesh.

## Live site

- **https://wslitrade.com**
- **https://www.wslitrade.com**
- **https://hawkeeeman.github.io/wslitrade/**

Hosted on GitHub Pages. Push to `main` to deploy automatically.

## Local preview

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

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
