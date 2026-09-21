// Public, allowlisted health metadata only. No gateway URL, token or private logs.
(function () {
  const el = id => document.getElementById(id);
  const stamp = value => {
    const d = new Date(value || "");
    return Number.isFinite(d.getTime()) ? d.toLocaleString("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short"
    }) : "unverified";
  };
  const labels = {skipped: "Last attempt skipped", disabled: "Disabled",
    error: "Last run failed", checked: "Last run completed", unverified: "Status unverified"};
  function render(data) {
    const kind = WSLIStatus.heartbeat(data);
    el("heartbeat-state").textContent = labels[kind];
    el("heartbeat-publication").textContent = data.publication?.automatic === true
      ? "Automatic publication configured" : "Manual snapshot · automatic updates not connected";
    el("heartbeat-checked").textContent = `Host checked ${stamp(data.checkedAt)}. ${
      WSLIStatus.fresh(data.checkedAt) ? "A timestamped observation, not a live connection." :
      "STALE — current host state is unknown. Stale does not mean offline."}`;
    const h = data.heartbeat || {};
    const interval = Number.isFinite(h.intervalSeconds) ? `${h.intervalSeconds / 60} minutes` : "unverified";
    el("heartbeat-detail").textContent = `Configured interval: ${interval}. Last attempt: ${stamp(h.lastRunAt)}. ` +
      (h.lastOutcome === "skipped" && h.skipReason === "empty_task_file"
        ? "Skipped: no heartbeat tasks were configured. This is not a completed AI review."
        : `Recorded outcome: ${["ok", "error", "skipped"].includes(h.lastOutcome) ? h.lastOutcome : "unverified"}.`);
    el("heartbeat-next").textContent = `Next attempt at the time of the check: ${stamp(h.nextRunAt)}. No assumption that it ran.`;
    const c = data.collector || {};
    const recent = WSLIStatus.fresh(data.checkedAt) && WSLIStatus.fresh(c.lastObservationAt);
    el("collector-state").textContent = c.state === "completed" ? "Session completed" :
      recent && ["running", "observations_received"].includes(c.state) ? "Last seen recording" : "Recording unverified";
    const quality = c.quoteQuality || {};
    const qualityDetail = Number.isInteger(quality.totalObservations) &&
      Number.isInteger(quality.validObservations) && Number.isInteger(quality.rejectedObservations) &&
      quality.validObservations + quality.rejectedObservations === quality.totalObservations &&
      Number.isFinite(quality.rejectionRate) && quality.rejectionRate >= 0 && quality.rejectionRate <= 1
      ? ` ${quality.validObservations.toLocaleString("en-US")} valid and ${quality.rejectedObservations.toLocaleString("en-US")} rejected of ${quality.totalObservations.toLocaleString("en-US")} stored observations (${(quality.rejectionRate * 100).toFixed(2)}% rejected).`
      : "";
    el("collector-detail").textContent = `Last recorded batch: ${stamp(c.lastObservationAt)}. ` +
      `${Number.isInteger(c.batchCount) ? c.batchCount.toLocaleString("en-US") : "Unknown"} batches at check time. ` +
      `${c.feed === "iex" ? "IEX only—not consolidated market data." : "Feed unverified."}${qualityDetail}`;
    const schedule = data.observationSchedule;
    const planned = schedule && /^\d{4}-\d{2}-\d{2}$/.test(schedule.through) &&
      /^\d{4}-\d{2}-\d{2}$/.test(schedule.from);
    el("collector-schedule").textContent = planned
      ? `Additional sessions ${schedule.from}–${schedule.through} (Eastern): prepare 7:45 a.m.; record 9:36 a.m.–close; AI reviews 9:38 a.m. / 4:05 p.m. No sessions configured after this period. A schedule is not proof of a completed run.`
      : `Verified session: ${/^\d{4}-\d{2}-\d{2}$/.test(c.session) ? c.session : "unknown"}. Subsequent sessions are not confirmed scheduled.`;
    const w = data.watchdog || {};
    const watchdogLabels = {recording: "recording", awaiting_preparation: "waiting for preparation",
      preparation_missing: "preparation missing", awaiting_observation: "waiting for session",
      starting: "starting", observations_missing: "no observations received",
      observations_stalled: "observations stalled", clock_mismatch: "clock mismatch",
      finishing: "finishing", completed: "session completed", completion_missing: "completion missing",
      halted: "operator halt", watchdog_read_failed: "watchdog could not read the journal"};
    const watchdogState = WSLIStatus.fresh(w.checkedAt) ? watchdogLabels[w.state] || "unverified" : "current state unverified";
    el("watchdog-detail").textContent = w.configured === true
      ? `Non-AI watchdog configured every minute during the bounded daytime schedule. Last published check: ${stamp(w.checkedAt)}; ${watchdogState}. Records local status changes; no automatic messages.`
      : "Watchdog configuration unverified.";
    const list = el("review-list");
    list.replaceChildren();
    for (const r of Array.isArray(data.reviews) ? data.reviews.slice(0, 2) : []) {
      const li = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = r.slot === "morning" ? "Morning" : r.slot === "end_of_day" ? "After close" : "Review";
      const detail = document.createElement("p");
      detail.className = "card-meta";
      detail.textContent = `${WSLIStatus.review(r)} · ${stamp(r.scheduledAt)}. 3-minute run limit.`;
      li.append(title, detail); list.append(li);
    }
    if (!list.children.length) list.textContent = "No review evidence published.";
  }
  async function refresh() {
    try {
      const res = await fetch(`data/heartbeat.json?t=${Date.now()}`, {cache: "no-store"});
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      if (data.schemaVersion !== 1) throw new Error("unsupported schema");
      render(data);
    } catch {
      el("heartbeat-state").textContent = "Status unverified";
      el("collector-state").textContent = "Recording unverified";
      el("heartbeat-publication").textContent = "Heartbeat feed unavailable";
      el("heartbeat-checked").textContent = "Could not load a current heartbeat snapshot. Any details below are historical, not live.";
    }
  }
  refresh();
  setInterval(refresh, 20000);
})();
