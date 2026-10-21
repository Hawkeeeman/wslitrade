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
  function recordedSession(data, now = Date.now()) {
    const unknown={state:'unverified',kind:'unknown',label:'Session evidence unverified',
      detail:'Published preparation and scan evidence cannot be verified. No successful no-trade session is implied.'};
    if (data?.schemaVersion!==2 || data.scope!=='wsli_paper_pilot' || data.account?.paper!==true) return unknown;
    const p=data.progress||{}, t=data.trial||{}, cal=data.market?.calendar, asof=parse(data.updatedAt);
    if (!Number.isFinite(asof) || asof>now || !/^\d{4}-\d{2}-\d{2}$/.test(p.session||'') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.firstSession||'') || !/^\d{4}-\d{2}-\d{2}$/.test(t.lastSession||'')) return unknown;
    if (p.session<t.firstSession || p.session>t.lastSession)
      return {state:'outside',kind:'unknown',label:'Outside approved trial',detail:'No new paper entries are authorized outside the published trial dates.'};
    // Evaluate the recorded session at its ORIGINAL publication time. A stale
    // pre-open snapshot must not turn into a fabricated missed session later.
    const calAge=asof-parse(cal?.checkedAt);
    if (!(calAge>=0 && calAge<7*86400000 && asof>=parse(cal?.from) && asof<parse(cal?.through)) || !Array.isArray(cal?.sessions)) return unknown;
    const hours=cal.sessions.find(s=>typeof s?.open==='string' && s.open.slice(0,10)===p.session &&
      Number.isFinite(parse(s.open)) && parse(s.close)>parse(s.open));
    if (!hours) return unknown;
    const opened=parse(hours.open), deadline=opened+15*60000;
    const integer=n=>Number.isInteger(n) && n>=0;
    const prepared=integer(p.universeCount) && Number.isFinite(parse(p.preparedAt)) && parse(p.preparedAt)<=asof;
    const scanned=integer(p.candidateCount) && parse(p.scanAt)>=opened+5*60000 && parse(p.scanAt)<=Math.min(asof,deadline);
    const missing=[];
    if (!prepared) missing.push('preparation');
    if (!scanned) missing.push('opening scan');
    if (scanned && p.candidateCount>0 && !(integer(p.quoteBatches) && p.quoteBatches>0 &&
        parse(p.lastQuoteAt)>=parse(p.scanAt) && parse(p.lastQuoteAt)<=asof)) missing.push('candidate quotes');
    if (missing.length && asof<deadline)
      return {state:'pending',kind:'unknown',label:'Preparation / scan pending',detail:'The published check precedes the scan deadline. It does not establish a completed session.'};
    if (missing.length) return {state:'incomplete',kind:'asleep',label:'Session incomplete',
      detail:`Session ${p.session}: missing verified ${missing.join(', ')} evidence at publication. This is not a successful no-trade day. Review preparation and collection before another trial.`};
    return {state:'recorded',kind:'unknown',label:p.candidateCount===0 ? 'Scan recorded · no candidates' : 'Preparation and scan recorded',
      detail:`Session ${p.session}: preparation and opening scan are recorded${p.candidateCount===0 ? '; zero candidates is a valid scan result' : ', with candidate quotes'}. This alone does not prove full-session safety, complete fills or profitability.`};
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
      const cal=data.market?.calendar, calAge=now-parse(cal?.checkedAt);
      const completed=calAge>=0 && calAge<7*86400000 && now>=parse(cal?.from) && now<parse(cal?.through) &&
        Array.isArray(cal?.sessions) && cal.sessions.some(s=>typeof s?.open==='string' &&
          s.open.slice(0,10)===p.session && parse(s.close)>parse(s.open) && parse(s.close)<=now);
      if (completed && p.session>=data.trial?.firstSession && p.session<=data.trial?.lastSession && p.supervisorSession!==p.session)
        return {kind:'asleep',label:'Session not recorded',detail:'No execution checkpoint was published for today’s completed exchange session. This is missing evidence—not a successful no-trade day. Check host uptime and the scheduled jobs.'};
      const evidence=recordedSession(data,now);
      if (evidence.state==='incomplete') return evidence;
      return {kind:'unknown',label:p.armed ? 'Scheduled / idle' : 'Not armed',detail:'No running supervisor was observed. Outside the session this can be expected; verify the bounded trial dates before expecting another timer.'};
    }
    const evidence=recordedSession(data,now);
    if (evidence.state==='incomplete') return evidence;
    if (Number.isInteger(p.entriesToday) && Number.isInteger(p.maxEntries) &&
        p.entriesToday>=p.maxEntries && !(data.positions||[]).length && p.openOrderCount===0)
      return {kind:'awake',label:p.maxEntries===1 ? 'Daily entry used' : 'Daily entry limit used',detail:'Today’s entry attempt limit is consumed and the account is flat. No further buys; safety monitoring continues.'};
    if(p.executorState==='EXIT_COOLDOWN') return {kind:'awake',label:'Exit cooldown',detail:'The account is flat. A 15-minute cooldown must finish before another valid entry.'};
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
  const api = {fresh, bot, market, heartbeat, review, paper, paperReview, recordedSession};
  root.WSLIStatus = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
