const LIVE_URL = "data/live.json";

function setPill(dotId, labelId, kind, label) {
  document.getElementById(dotId).className = `pulse-dot ${kind}`;
  document.getElementById(labelId).textContent = label;
}

function renderHome(data) {
  const botKind = WSLIStatus.bot(data);
  const labels = { awake: "Gateway online", asleep: "Gateway unreachable", stale: "Health check stale", unknown: "Health unverified" };
  window.stageState.bot = botKind;
  setPill("status-dot", "status-label", botKind, labels[botKind]);

  const market = WSLIStatus.market(data);
  const marketKind = market.kind;
  window.stageState.market = marketKind;
  setPill("market-dot", "market-label", marketKind, marketKind === "unknown" ? "Market unverified" :
    `Session ${marketKind}${market.scheduled ? " · scheduled" : ""}`);
  document.getElementById("market-pill").title = market.scheduled
    ? "Exchange schedule, not a current broker check. Does not confirm trading activity."
    : "Regular US equities session; separate from bot health and order execution.";
}

async function loop() {
  try {
    const res = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`live.json ${res.status}`);
    renderHome(await res.json());
  } catch {
    setPill("status-dot", "status-label", "unknown", "Feed unavailable");
    setPill("market-dot", "market-label", "unknown", "Market unverified");
    window.stageState.bot = window.stageState.market = "unknown";
  }
}

loop();
setInterval(loop, 20000);
startField();
