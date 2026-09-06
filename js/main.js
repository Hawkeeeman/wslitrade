const LIVE_URL = "data/live.json";
const STALE_MS = 15 * 60 * 1000;
const stageState = { bot: "unknown", market: "unknown" };

const money = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
};

const fmtQty = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

const ago = (iso) => {
  if (!iso) return "unknown time";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
};

const clock = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const until = (iso) => {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.round((then - Date.now()) / 1000));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (hours > 36) return clock(iso);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

function resolveBot(data) {
  const bot = data.bot || {};
  const checked = Date.parse(bot.checkedAt || "");
  const fresh = Number.isFinite(checked) && Date.now() - checked < STALE_MS;
  if (bot.state === "awake" && fresh) return "awake";
  if (bot.state === "asleep" && fresh) return "asleep";
  if (bot.checkedAt) return "stale";
  return "unknown";
}

function setPill(dotId, labelId, kind, label) {
  document.getElementById(dotId).className = `pulse-dot ${kind}`;
  document.getElementById(labelId).textContent = label;
}

function signedMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { text: "—", cls: "" };
  const prefix = n > 0 ? "+" : "";
  return { text: `${prefix}${money(n)}`, cls: n > 0 ? "up" : n < 0 ? "down" : "" };
}

function render(data) {
  const botKind = resolveBot(data);
  const labels = { awake: "Awake", asleep: "Asleep", stale: "Stale", unknown: "Unknown" };
  stageState.bot = botKind;
  setPill("status-dot", "status-label", botKind, labels[botKind]);

  document.getElementById("updated").textContent = data.updatedAt
    ? `Snapshot ${ago(data.updatedAt)}`
    : "No snapshot yet";

  document.getElementById("bot-state").textContent = labels[botKind];
  document.getElementById("card-bot").dataset.state = botKind;
  document.getElementById("bot-meta").textContent = data.bot?.detail
    || (data.bot?.checkedAt ? `Last check ${ago(data.bot.checkedAt)}` : "No health check yet");

  const market = data.market || {};
  const marketKind = market.open ? "open" : market.open === false ? "closed" : "unknown";
  stageState.market = marketKind;
  setPill("market-dot", "market-label", marketKind, market.open ? "Market open" : market.open === false ? "Market closed" : "Market");
  document.getElementById("card-market").dataset.state = marketKind;
  document.getElementById("market-state").textContent = market.open ? "Open" : market.open === false ? "Closed" : "—";
  const nextOpenMs = Date.parse(market.nextOpen || "");
  const longWait = Number.isFinite(nextOpenMs) && nextOpenMs - Date.now() > 36 * 3600 * 1000;
  document.getElementById("market-meta").textContent = market.open
    ? `Closes in ${until(market.nextClose)}`
    : market.nextOpen
      ? (longWait ? `Opens ${clock(market.nextOpen)}` : `Opens in ${until(market.nextOpen)}`)
      : "US equities session";

  const acct = data.account || {};
  document.getElementById("account-value").textContent = money(acct.equity, 0);
  const posCount = (data.positions || []).length;
  document.getElementById("account-meta").textContent = [
    acct.cash != null ? `${money(acct.cash, 0)} cash` : null,
    `${posCount} open position${posCount === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

  document.getElementById("power-value").textContent = money(acct.buyingPower, 0);
  const day = signedMoney(acct.dayPl);
  document.getElementById("power-meta").innerHTML = day.text === "—"
    ? "Day P/L unavailable"
    : `Day P/L <span class="${day.cls}">${day.text}</span>`;

  const positions = data.positions || [];
  document.getElementById("position-count").textContent = `${positions.length} open`;
  const posBody = document.getElementById("position-body");
  if (!positions.length) {
    posBody.innerHTML = '<tr><td colspan="6" class="empty">No open positions.</td></tr>';
  } else {
    posBody.innerHTML = positions.map((p) => {
      const pl = signedMoney(p.unrealizedPl);
      return `
        <tr>
          <td>${p.symbol || "—"}</td>
          <td class="mono">${fmtQty(p.qty)}</td>
          <td class="mono">${money(p.avgEntry)}</td>
          <td class="mono">${money(p.price)}</td>
          <td class="mono">${money(p.marketValue)}</td>
          <td class="mono ${pl.cls}">${pl.text}</td>
        </tr>
      `;
    }).join("");
  }

  const feed = data.feed || [];
  const feedList = document.getElementById("feed-list");
  document.getElementById("feed-count").textContent = `${feed.length} event${feed.length === 1 ? "" : "s"}`;
  if (!feed.length) {
    feedList.innerHTML = '<li class="feed-empty">Nothing in the feed yet.</li>';
  } else {
    feedList.innerHTML = feed.map((item) => `
      <li>
        <span class="feed-time">${clock(item.at)}</span>
        <span>${item.text}</span>
      </li>
    `).join("");
  }

  const trades = data.trades || [];
  document.getElementById("trade-count").textContent = `${trades.length} order${trades.length === 1 ? "" : "s"}`;
  const body = document.getElementById("trade-body");
  if (!trades.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No trades yet.</td></tr>';
    return;
  }
  body.innerHTML = trades.map((t) => `
    <tr>
      <td class="mono">${clock(t.at)}</td>
      <td class="side-${t.side || ""}">${(t.side || "—").toUpperCase()}</td>
      <td>${t.symbol || "—"}</td>
      <td class="mono">${fmtQty(t.qty)}</td>
      <td class="mono">${t.price ? money(t.price) : "—"}</td>
      <td class="status-${t.status || ""}">${t.status || "—"}</td>
    </tr>
  `).join("");
}

async function refresh() {
  const res = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`live.json ${res.status}`);
  render(await res.json());
}

async function loop() {
  try {
    await refresh();
  } catch (err) {
    setPill("status-dot", "status-label", "unknown", "Offline");
    document.getElementById("updated").textContent = `Feed error: ${err.message}`;
  }
}

function startStage() {
  const canvas = document.getElementById("stage");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glyphs = ["NVDA", "TSLA", "AAPL", "MSFT", "SPY", "QQQ", "AMD", "COIN", "WSLI", "BUY", "SELL"];
  let ticks = [];
  let nodes = [];
  let w = 0;
  let h = 0;
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ticks = Array.from({ length: 46 }, () => ({
      x: Math.random() * w,
      z: Math.random(),
      lane: (Math.random() - 0.5) * 1.8,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      buy: Math.random() > 0.45,
    }));
    nodes = Array.from({ length: 18 }, (_, i) => ({
      a: (i / 18) * Math.PI * 2,
      r: 90 + (i % 5) * 28,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const drawGrid = (t, heat) => {
    const vanishX = w * 0.5;
    const vanishY = h * 0.22;
    ctx.strokeStyle = `rgba(61, 255, 154, ${0.05 + heat * 0.08})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i += 1) {
      const p = (i / 16 + (reduce ? 0 : t * 0.015)) % 1;
      const y = vanishY + (h - vanishY) * (p * p);
      const spread = 40 + p * w * 0.95;
      ctx.beginPath();
      ctx.moveTo(vanishX - spread, y);
      ctx.lineTo(vanishX + spread, y);
      ctx.stroke();
    }
    for (let i = -10; i <= 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(vanishX, vanishY);
      ctx.lineTo(vanishX + i * w * 0.09, h + 20);
      ctx.stroke();
    }
  };

  const drawRibbons = (t, heat) => {
    for (let r = 0; r < 3; r += 1) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.18 + r * 0.08) + Math.sin(x * 0.006 + t * (0.6 + r * 0.2) + r) * (18 + r * 10);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(61, 255, 154, ${0.08 + heat * 0.1 - r * 0.02})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };

  const drawTicks = (t, heat) => {
    ticks.forEach((tick) => {
      if (!reduce) tick.z -= 0.003 + heat * 0.004;
      if (tick.z <= 0) {
        tick.z = 1;
        tick.x = w / 2 + (Math.random() - 0.5) * 80;
        tick.glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        tick.buy = Math.random() > 0.45;
      }
      const scale = 0.15 + (1 - tick.z) * 1.4;
      const x = w / 2 + tick.lane * (1 - tick.z) * w * 0.42;
      const y = h * 0.22 + (1 - tick.z) * h * 0.82;
      ctx.save();
      ctx.globalAlpha = 0.08 + (1 - tick.z) * (0.22 + heat * 0.2);
      ctx.fillStyle = tick.buy ? "#3dff9a" : "#ff6b7a";
      ctx.font = `${11 * scale}px "Fragment Mono", monospace`;
      ctx.fillText(tick.glyph, x, y);
      ctx.restore();
    });
  };

  const drawNodes = (t, heat) => {
    const cx = w * 0.82;
    const cy = h * 0.18;
    const pts = nodes.map((node) => {
      const spin = reduce ? node.a : node.a + t * 0.12;
      return {
        x: cx + Math.cos(spin) * node.r,
        y: cy + Math.sin(spin) * node.r * 0.42,
        pulse: 0.5 + Math.sin(t * 1.4 + node.phase) * 0.5,
      };
    });
    ctx.strokeStyle = `rgba(61, 255, 154, ${0.08 + heat * 0.12})`;
    pts.forEach((a, i) => {
      const b = pts[(i + 3) % pts.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = `rgba(61, 255, 154, ${0.18 + p.pulse * 0.35 + heat * 0.2})`;
      ctx.arc(p.x, p.y, 1.6 + p.pulse * 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const frame = (stamp) => {
    const t = stamp / 1000;
    const heat = stageState.bot === "awake" ? 1 : stageState.market === "open" ? 0.55 : 0.2;
    ctx.fillStyle = "rgba(4, 8, 10, 0.42)";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, w * 0.55);
    g.addColorStop(0, `rgba(61, 255, 154, ${0.08 + heat * 0.1})`);
    g.addColorStop(1, "rgba(4, 8, 10, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    drawGrid(t, heat);
    drawRibbons(t, heat);
    drawTicks(t, heat);
    drawNodes(t, heat);
    if (!reduce) requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener("resize", resize);
  if (reduce) {
    frame(0);
    return;
  }
  requestAnimationFrame(frame);
}

loop();
setInterval(loop, 20000);
startStage();
