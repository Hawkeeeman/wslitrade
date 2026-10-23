function setPill(dotId, labelId, kind, label) {
  document.getElementById(dotId).className = `pulse-dot ${kind}`;
  document.getElementById(labelId).textContent = label;
}

function renderHome(data) {
  const paper = WSLIStatus.paper(data);
  const botKind = paper.kind;
  window.stageState.bot = botKind;
  setPill("status-dot", "status-label", botKind, paper.label);
  document.getElementById('home-paper-state').textContent=paper.label;
  const continuation=WSLIStatus.continuation(data);
  document.getElementById('home-continuation').hidden=!continuation;
  document.getElementById('home-continuation').textContent=continuation ? `${continuation.label}: ${continuation.detail}` : '';
  const stamp=new Date(data.updatedAt).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  document.getElementById('home-paper-detail').textContent=`${paper.detail} Host checked ${stamp}. Open the dashboard for account figures and actual order history.`;
  const evidence=WSLIStatus.recordedSession(data);
  document.getElementById('home-session-evidence').textContent=`${evidence.label}: ${evidence.detail} Evidence snapshot ${stamp}.`;
  document.getElementById('home-session-evidence').dataset.state=evidence.kind;

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
    renderHome(await WSLIPaperFeed.load());
  } catch {
    setPill("status-dot", "status-label", "unknown", "Feed unavailable");
    setPill("market-dot", "market-label", "unknown", "Market unverified");
    window.stageState.bot = window.stageState.market = "unknown";
    document.getElementById('home-paper-state').textContent='Agent progress unavailable';
    document.getElementById('home-paper-detail').textContent='No current host snapshot could be loaded. No trade, profit or offline state is implied.';
  }
}

loop();
setInterval(loop, 20000);
startField();
