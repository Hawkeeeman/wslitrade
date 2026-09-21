// Display-only status. Never used to authorize a broker order.
(function (root) {
  const STALE_MS = 15 * 60 * 1000;
  const parse = (value) => Date.parse(value || "");
  function fresh(value, now = Date.now()) {
    const age = now - parse(value);
    return Number.isFinite(age) && age >= 0 && age < STALE_MS;
  }
  function bot(data, now = Date.now()) {
    const b = data.bot || {};
    if (fresh(b.checkedAt, now) && ["awake", "asleep"].includes(b.state)) return b.state;
    return b.checkedAt ? "stale" : "unknown";
  }
  function market(data, now = Date.now()) {
    const m = data.market || {};
    const checkedAt = m.checkedAt || (!data.errors ? data.updatedAt : null);
    const edge = parse(m.open ? m.nextClose : m.nextOpen);
    // Even a recent snapshot becomes obsolete when its next boundary passes.
    if (typeof m.open === "boolean" && fresh(checkedAt, now) && edge > now) {
      return {kind: m.open ? "open" : "closed", scheduled: false,
        nextOpen: m.nextOpen, nextClose: m.nextClose, checkedAt};
    }
    const cal = m.calendar;
    const calAge = now - parse(cal?.checkedAt);
    if (cal && calAge >= 0 && calAge < 7 * 86400000 &&
        now >= parse(cal.from) && now < parse(cal.through) && Array.isArray(cal.sessions)) {
      const active = cal.sessions.find(s => parse(s.open) <= now && now < parse(s.close));
      const next = cal.sessions.find(s => parse(s.open) > now);
      return {kind: active ? "open" : "closed", scheduled: true,
        nextOpen: next?.open, nextClose: active?.close, checkedAt};
    }
    // Legacy snapshots contain the broker's next session. Use only that exact
    // interval (including early closes), never a guessed weekday/holiday clock.
    const open = parse(m.nextOpen), close = parse(m.nextClose);
    if (Number.isFinite(open) && close > open && close - open <= 12 * 3600000 &&
        open <= now && now < close) {
      return {kind: "open", scheduled: true, nextClose: m.nextClose, checkedAt};
    }
    return {kind: "unknown", scheduled: false, checkedAt};
  }
  function heartbeat(data, now = Date.now()) {
    if (!data || data.schemaVersion !== 1 || !fresh(data.checkedAt, now)) return "unverified";
    const h = data.heartbeat || {};
    if (h.enabled === false) return "disabled";
    if (h.enabled !== true) return "unverified";
    if (!Number.isFinite(parse(h.lastRunAt)) || parse(h.lastRunAt) > now) return "unverified";
    // A passed due time without a newer observation is missing evidence, not
    // proof of a failed run. Never advance nextRunAt in the browser.
    if (parse(h.nextRunAt) <= now) return "unverified";
    if (h.lastOutcome === "skipped") return "skipped";
    if (h.lastOutcome === "error") return "error";
    if (h.lastOutcome === "ok") return "checked";
    return "unverified";
  }
  function review(review, now = Date.now()) {
    if (review?.lastOutcome === "ok" && review.deterministicAuditVerified === true) {
      return "Completed · deterministic audit";
    }
    if (review?.lastOutcome === "ok") return review.citationsVerified === true
      ? "Completed · citations checked" : "Run completed · review unverified";
    if (review?.lastOutcome === "error") return "Run failed";
    if (parse(review?.scheduledAt) <= now) return "Result not yet published";
    if (Number.isFinite(parse(review?.scheduledAt))) return "Scheduled";
    return "Unverified";
  }
  const api = {fresh, bot, market, heartbeat, review};
  root.WSLIStatus = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
