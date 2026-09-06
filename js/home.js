const LIVE_URL = "data/live.json";
const STALE_MS = 15 * 60 * 1000;

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

function renderHome(data) {
  const botKind = resolveBot(data);
  const labels = { awake: "Live", asleep: "Idle", stale: "Stale", unknown: "Unknown" };
  window.stageState.bot = botKind;
  setPill("status-dot", "status-label", botKind, labels[botKind]);

  const market = data.market || {};
  const marketKind = market.open ? "open" : market.open === false ? "closed" : "unknown";
  window.stageState.market = marketKind;
  setPill("market-dot", "market-label", marketKind, market.open ? "Session open" : market.open === false ? "Session closed" : "Market");
}

async function loop() {
  try {
    const res = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`live.json ${res.status}`);
    renderHome(await res.json());
  } catch {
    setPill("status-dot", "status-label", "unknown", "Offline");
  }
}

loop();
setInterval(loop, 20000);
startField();
