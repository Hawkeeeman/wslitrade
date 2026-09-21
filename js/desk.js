const LIVE_URL = "data/live.json";

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
  const botKind = WSLIStatus.bot(data);
  const labels = { awake: "Online", asleep: "Unreachable", stale: "Unverified", unknown: "Unknown" };
  window.stageState.bot = botKind;
  setPill("status-dot", "status-label", botKind, labels[botKind]);

  const accountAt = data.account?.checkedAt || (!data.errors ? data.updatedAt : null);
  document.getElementById("updated").textContent =
    `Account snapshot ${ago(accountAt)}${WSLIStatus.fresh(accountAt) ? "" : " · STALE — not current balances"}`;

  document.getElementById("bot-state").textContent = labels[botKind];
  document.getElementById("card-bot").dataset.state = botKind;
  document.getElementById("bot-meta").textContent = botKind === "stale"
    ? `Last health check ${ago(data.bot.checkedAt)}. Stale does not mean offline; no current check published.`
    : `${data.bot?.detail || "No health check yet"} · checked ${ago(data.bot?.checkedAt)}. Gateway health is not proof of trading.`;

  const market = WSLIStatus.market(data);
  const marketKind = market.kind;
  window.stageState.market = marketKind;
  setPill("market-dot", "market-label", marketKind, marketKind === "unknown" ? "Market unverified" : `Market ${marketKind}${market.scheduled ? " · scheduled" : ""}`);
  document.getElementById("card-market").dataset.state = marketKind;
  document.getElementById("market-state").textContent = marketKind === "unknown" ? "Unverified" : `${marketKind === "open" ? "Open" : "Closed"}${market.scheduled ? " (schedule)" : ""}`;
  const nextOpenMs = Date.parse(market.nextOpen || "");
  const longWait = Number.isFinite(nextOpenMs) && nextOpenMs - Date.now() > 36 * 3600 * 1000;
  const timing = marketKind === "open"
    ? `Closes in ${until(market.nextClose)}`
    : market.nextOpen
      ? (longWait ? `Opens ${clock(market.nextOpen)}` : `Opens in ${until(market.nextOpen)}`)
      : "Current market clock unavailable";
  document.getElementById("market-meta").textContent = `${timing}. ${market.scheduled ? "Exchange schedule; live broker status is stale." : marketKind === "unknown" ? "Refresh required; an old closed flag is not current evidence." : `Broker checked ${ago(market.checkedAt)}.`}`;

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
    setPill("status-dot", "status-label", "unknown", "Feed unavailable");
    setPill("market-dot", "market-label", "unknown", "Market unverified");
    window.stageState.bot = window.stageState.market = "unknown";
    document.getElementById("market-state").textContent = "Unverified";
    document.getElementById("market-meta").textContent = "Feed could not be refreshed. Last displayed numbers may be outdated.";
    document.getElementById("updated").textContent = `Feed error: ${err.message}`;
  }
}

loop();
setInterval(loop, 20000);
startStage();
