const LIVE_URL = "data/live.json";
const STALE_MS = 15 * 60 * 1000;

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

function resolveBot(data) {
  const bot = data.bot || {};
  const checked = Date.parse(bot.checkedAt || "");
  const fresh = Number.isFinite(checked) && Date.now() - checked < STALE_MS;
  if (bot.state === "awake" && fresh) return "awake";
  if (bot.state === "asleep" && fresh) return "asleep";
  if (bot.checkedAt) return "stale";
  return "unknown";
}

function setStatus(kind, label) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-label");
  dot.className = `pulse-dot ${kind}`;
  text.textContent = label;
}

function render(data) {
  const botKind = resolveBot(data);
  const labels = { awake: "Awake", asleep: "Asleep", stale: "Stale", unknown: "Unknown" };
  setStatus(botKind, labels[botKind]);

  document.getElementById("updated").textContent = data.updatedAt
    ? `Snapshot ${ago(data.updatedAt)} · ${data.source || "collector"}`
    : "No snapshot yet";

  document.getElementById("bot-state").textContent = labels[botKind];
  document.getElementById("bot-meta").textContent = data.bot?.detail
    || (data.bot?.checkedAt ? `Last check ${ago(data.bot.checkedAt)}` : "No health check yet");

  const quota = data.quota || {};
  const remaining = Number(quota.remainingUsd);
  const total = Number(quota.totalUsd);
  document.getElementById("quota-value").textContent = Number.isFinite(remaining)
    ? `${money(remaining)} left`
    : "—";
  const used = Number.isFinite(remaining) && Number.isFinite(total) ? Math.max(0, total - remaining) : null;
  document.getElementById("quota-meta").textContent = [
    Number.isFinite(used) && Number.isFinite(total) ? `${money(used)} used of ${money(total)}` : null,
    quota.expiresAt ? `expires ${quota.expiresAt}` : null,
  ].filter(Boolean).join(" · ") || "OpenAI credit grant";
  const pct = Number.isFinite(remaining) && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  document.getElementById("quota-bar").style.width = `${pct}%`;

  const acct = data.account || {};
  document.getElementById("account-value").textContent = money(acct.equity, 0);
  const posCount = (data.positions || []).length;
  document.getElementById("account-meta").textContent = [
    acct.cash != null ? `${money(acct.cash, 0)} cash` : null,
    `${posCount} open position${posCount === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

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
    setStatus("unknown", "Offline");
    document.getElementById("updated").textContent = `Feed error: ${err.message}`;
  }
}

loop();
setInterval(loop, 20000);
