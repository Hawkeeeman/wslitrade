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
  function paper(data, now = Date.now()) {
    if (data?.schemaVersion !== 2 || data.scope !== 'wsli_paper_pilot' || data.account?.paper !== true)
      return {kind:'unknown',label:'Progress unavailable',detail:'No verified paper-pilot feed loaded.'};
    const p=data.progress || {};
    const publishedAge=now-parse(data.updatedAt);
    if (!Number.isFinite(publishedAge) || publishedAge<0 || publishedAge>=15*60000) return {kind:'stale',label:'Updates delayed',
      detail:'Last published snapshot is stale. Current host and account state are unknown—not necessarily offline.'};
    if (p.halted || ['ORDER_OUTCOME_UNKNOWN','EXPOSURE_REQUIRES_OPERATOR','ERROR_RECOVERY_PENDING','CLOCK_SKEW_REFUSED',
      'UNEXPECTED_POSITION_REQUIRES_OPERATOR','EXIT_RETRY_LIMIT_REQUIRES_OPERATOR'].includes(p.executorState))
      return {kind:'asleep',label:'Needs attention',detail:'New entries are halted or execution needs operator review. A halt does not prove liquidation.'};
    const session=market(data,now);
    if (p.process === 'failed') return {kind:'asleep',label:'Monitor failed',detail:'The supervisor service failed. Check broker exposure before restarting.'};
    // GitHub Pages deployment has latency. Judge process freshness when the
    // host actually exported it, not against a newer browser fetch timestamp.
    const age=parse(p.checkedAt)-parse(p.supervisorAt);
    if (p.process==='active' && (!Number.isFinite(age) || age<0 || age>60000))
      return {kind:'stale',label:'Monitor delayed',detail:'The process was active at publication, but its last checkpoint is over 60 seconds old.'};
    if (p.process==='active' && (!p.executorState || !p.session || p.supervisorSession!==p.session))
      return {kind:'unknown',label:'Monitor unverified',detail:'A running process alone does not verify today’s execution checkpoint.'};
    if (p.process!=='active') {
      if (session.kind==='open' && p.armed) return {kind:'asleep',label:'Monitor not running',detail:'The market is open but the paper supervisor was not active at the last check.'};
      return {kind:'unknown',label:p.armed ? 'Scheduled / idle' : 'Not armed',detail:'No running supervisor was observed. Outside the session this is expected; the next timer must still run.'};
    }
    if (Number.isInteger(p.entriesToday) && Number.isInteger(p.maxEntries) &&
        p.entriesToday>=p.maxEntries && !(data.positions||[]).length && p.openOrderCount===0)
      return {kind:'awake',label:'Daily entry used',detail:'Today’s entry attempt is complete and the account is flat. No second entry; safety monitoring continues.'};
    if ((data.positions||[]).length) return {kind:'awake',label:p.executorState==='POSITION_PROTECTED' ? 'Position protected' : 'Managing position',
      detail:'A paper position is open. The deterministic supervisor handles protection and exits.'};
    return {kind:'awake',label:p.executorState==='WAITING_FOR_PREPARE_OR_SCAN' ? 'Waiting for scan' : 'Watching signals',
      detail:'Paper supervisor is checking the fixed rules. No qualifying signal means no trade.'};
  }
  function paperReview(r,now=Date.now()) {
    if (r?.lastOutcome==='error') return 'Run failed';
    if (r?.lastOutcome==='ok') return r.reportAvailable ? 'Completed · report saved' : 'Run completed · report missing';
    if (parse(r?.scheduledAt)<=now) return 'Awaiting published result';
    return Number.isFinite(parse(r?.scheduledAt)) ? 'Scheduled' : 'Unverified';
  }
  const api = {fresh, bot, market, heartbeat, review, paper, paperReview};
  root.WSLIStatus = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
