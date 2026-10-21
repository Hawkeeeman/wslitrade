const test = require('node:test');
const assert = require('node:assert/strict');
const {market, bot, fresh, heartbeat, review} = require('../js/status.js');
const at = s => Date.parse(s);
const now = at('2026-09-21T14:21:00Z');
const legacy = {updatedAt:'2026-09-21T10:51:09Z', market:{open:false,
  nextOpen:'2026-09-21T09:30:00-04:00',nextClose:'2026-09-21T16:00:00-04:00'}};
test('regression: stale premarket false becomes scheduled open, not closed', () => {
  assert.equal(market(legacy,now).kind,'open');
  assert.equal(market(legacy,now).scheduled,true);
});
test('legacy interval is not extrapolated to another day', () => {
  assert.equal(market(legacy,at('2026-09-22T14:21:00Z')).kind,'unknown');
});
test('fresh clock reports actual state', () => {
  const d={market:{open:true, checkedAt:'2026-09-21T14:20:00Z',nextClose:'2026-09-21T20:00:00Z'}};
  assert.equal(market(d,now).scheduled,false);
  assert.equal(market(d,now).kind,'open');
});
test('a boundary invalidates even a recently checked closed flag', () => {
  const d={...legacy,updatedAt:'2026-09-21T13:29:00Z'};
  assert.equal(market(d,at('2026-09-21T13:31:00Z')).scheduled,true);
});
test('expired open flag never stays open after close', () => {
  assert.equal(market({market:{open:true,checkedAt:'2026-09-21T19:59:00Z',
    nextClose:'2026-09-21T20:00:00Z'}},at('2026-09-21T20:01:00Z')).kind,'unknown');
});
const calendar = {checkedAt:'2026-11-25T12:00:00Z', from:'2026-11-25T00:00:00-05:00',
  through:'2026-11-29T00:00:00-05:00',sessions:[
    {open:'2026-11-25T09:30:00-05:00',close:'2026-11-25T16:00:00-05:00'},
    {open:'2026-11-27T09:30:00-05:00',close:'2026-11-27T13:00:00-05:00'}]};
test('calendar preserves Thanksgiving closure', () => {
  assert.equal(market({market:{calendar}},at('2026-11-26T15:00:00Z')).kind,'closed');
});
test('calendar preserves early close', () => {
  assert.equal(market({market:{calendar}},at('2026-11-27T17:59:00Z')).kind,'open');
  assert.equal(market({market:{calendar}},at('2026-11-27T18:00:00Z')).kind,'closed');
});
test('calendar covers weekend, not dates outside its range', () => {
  assert.equal(market({market:{calendar}},at('2026-11-28T15:00:00Z')).kind,'closed');
  assert.equal(market({market:{calendar}},at('2026-11-30T15:00:00Z')).kind,'unknown');
});
test('expired calendar is not trusted', () => {
  assert.equal(market({market:{calendar:{...calendar,checkedAt:'2026-11-01T12:00:00Z'}}},
    at('2026-11-27T15:00:00Z')).kind,'unknown');
});
test('fresh wrapper cannot redate stale market evidence', () => {
  assert.equal(market({updatedAt:'2026-09-21T14:20:00Z',errors:{market:'HTTPError'},
    market:{open:false,checkedAt:'2026-09-20T12:00:00Z'}},now).kind,'unknown');
});
test('old heartbeat means unverified, not offline', () => {
  assert.equal(bot({bot:{state:'awake',checkedAt:'2026-09-06T12:00:00Z'}},now),'stale');
  assert.equal(bot({bot:{state:'awake',checkedAt:'2026-09-21T14:20:00Z'}},now),'awake');
});
test('future and missing timestamps are not fresh', () => {
  assert.equal(fresh('2026-09-22T12:00:00Z',now),false);
  assert.equal(fresh(undefined,now),false);
});

const hb = {schemaVersion:1, checkedAt:'2026-09-21T14:20:00Z',
  heartbeat:{enabled:true, lastOutcome:'skipped', lastRunAt:'2026-09-21T14:16:00Z',
    nextRunAt:'2026-09-21T14:46:00Z'}};
test('skipped heartbeat is not successful review or outage', () => {
  assert.equal(heartbeat(hb,now),'skipped');
});
test('stale, future, missing or unsupported heartbeat is unverified', () => {
  assert.equal(heartbeat(hb,at('2026-09-21T15:00:00Z')),'unverified');
  assert.equal(heartbeat({...hb,checkedAt:'2026-09-22T14:20:00Z'},now),'unverified');
  assert.equal(heartbeat(null,now),'unverified');
  assert.equal(heartbeat({...hb,schemaVersion:2},now),'unverified');
});
test('elapsed next run is not assumed to have run', () => {
  assert.equal(heartbeat({...hb,heartbeat:{...hb.heartbeat,nextRunAt:'2026-09-21T14:20:00Z'}},now),'unverified');
});
test('enabled, disabled, failed and successful heartbeat are distinct', () => {
  assert.equal(heartbeat({...hb,heartbeat:{...hb.heartbeat,enabled:false}},now),'disabled');
  assert.equal(heartbeat({...hb,heartbeat:{...hb.heartbeat,lastOutcome:'error'}},now),'error');
  assert.equal(heartbeat({...hb,heartbeat:{...hb.heartbeat,lastOutcome:'ok'}},now),'checked');
  assert.equal(heartbeat({...hb,heartbeat:{...hb.heartbeat,lastRunAt:'2026-09-22T14:20:00Z'}},now),'unverified');
});
test('scheduled review past its due time awaits evidence, not a fabricated result', () => {
  assert.equal(review({scheduledAt:'2026-09-21T13:38:00Z'},now),'Result not yet published');
  assert.equal(review({scheduledAt:'2026-09-21T20:05:00Z'},now),'Scheduled');
});
test('scheduler success alone does not claim review citation validation', () => {
  assert.equal(review({lastOutcome:'ok'},now),'Run completed · review unverified');
  assert.equal(review({lastOutcome:'ok',citationsVerified:true},now),'Completed · citations checked');
});
test('deterministic close audit is distinct from citation validation', () => {
  assert.equal(review({lastOutcome:'ok',citationsVerified:false,deterministicAuditVerified:true},now),
    'Completed · deterministic audit');
});

const {paper,paperReview}=require('../js/status.js');
const paperNow=at('2026-10-07T14:50:00Z');
const pilot={schemaVersion:2,scope:'wsli_paper_pilot',updatedAt:'2026-10-07T14:49:00Z',
  account:{paper:true},market:{open:true,checkedAt:'2026-10-07T14:49:00Z',nextClose:'2026-10-07T20:00:00Z'},
  progress:{session:'2026-10-07',supervisorSession:'2026-10-07',checkedAt:'2026-10-07T14:49:00Z',supervisorAt:'2026-10-07T14:48:58Z',
    process:'active',armed:true,entriesToday:1,maxEntries:1,openOrderCount:0,executorState:'ENTRY_CONSUMED_OR_PENDING'},positions:[]};
test('daily attempt consumed and flat means monitoring, not offline',()=>{
  assert.equal(paper(pilot,paperNow).label,'Daily entry used');
  assert.equal(paper(pilot,paperNow).kind,'awake');
});
test('publication latency does not falsely call a fresh host checkpoint stalled',()=>{
  assert.equal(paper(pilot,at('2026-10-07T14:55:00Z')).kind,'awake');
});
test('no new snapshot after fifteen minutes is delayed, not live or offline',()=>{
  assert.equal(paper(pilot,at('2026-10-07T15:05:00Z')).kind,'stale');
});
test('future, unsupported and legacy feeds cannot masquerade as paper progress',()=>{
  assert.equal(paper({...pilot,updatedAt:'2026-10-08T14:50:00Z'},paperNow).kind,'stale');
  assert.equal(paper(legacy,paperNow).kind,'unknown');
  assert.equal(paper({...pilot,account:{paper:false}},paperNow).kind,'unknown');
});
test('real stopped or stalled process while market open is attention-worthy',()=>{
  assert.equal(paper({...pilot,progress:{...pilot.progress,process:'inactive'}},paperNow).label,'Monitor not running');
  assert.equal(paper({...pilot,progress:{...pilot.progress,supervisorAt:'2026-10-07T14:40:00Z'}},paperNow).label,'Monitor delayed');
});
test('halt and uncertain submission never look healthy',()=>{
  assert.equal(paper({...pilot,progress:{...pilot.progress,halted:true}},paperNow).kind,'asleep');
  assert.equal(paper({...pilot,progress:{...pilot.progress,executorState:'ORDER_OUTCOME_UNKNOWN'}},paperNow).label,'Needs attention');
});
test('review success distinguishes saved report from missing report',()=>{
  assert.equal(paperReview({lastOutcome:'ok',reportAvailable:true},paperNow),'Completed · report saved');
  assert.equal(paperReview({lastOutcome:'ok'},paperNow),'Run completed · report missing');
  assert.equal(paperReview({scheduledAt:'2026-10-07T14:05:00Z'},paperNow),'Awaiting published result');
});
test('a running process cannot verify missing or another session’s execution state',()=>{
  assert.equal(paper({...pilot,progress:{...pilot.progress,executorState:null}},paperNow).kind,'unknown');
  assert.equal(paper({...pilot,progress:{...pilot.progress,supervisorSession:'2026-10-06'}},paperNow).kind,'unknown');
});
test('missing ledger counts cannot imply a completed daily attempt',()=>{
  assert.notEqual(paper({...pilot,progress:{...pilot.progress,entriesToday:null}},paperNow).label,'Daily entry used');
});

test('three-entry policy distinguishes remaining slots, cooldown, and consumed cap',()=>{
  const base={...pilot,progress:{...pilot.progress,maxEntries:3,entriesToday:1}};
  assert.equal(paper(base,paperNow).label,'Watching signals');
  assert.equal(paper({...base,progress:{...base.progress,executorState:'EXIT_COOLDOWN'}},paperNow).label,'Exit cooldown');
  assert.equal(paper({...base,progress:{...base.progress,entriesToday:3}},paperNow).label,'Daily entry limit used');
});

const missedDay={...pilot,updatedAt:'2026-10-15T22:00:00Z',trial:{firstSession:'2026-10-07',lastSession:'2026-10-20'},
  market:{open:false,checkedAt:'2026-10-15T22:00:00Z',nextOpen:'2026-10-16T13:30:00Z',calendar:{
    checkedAt:'2026-10-15T22:00:00Z',from:'2026-10-15T00:00:00-04:00',through:'2026-10-17T00:00:00-04:00',
    sessions:[{open:'2026-10-15T09:30:00-04:00',close:'2026-10-15T16:00:00-04:00'},
      {open:'2026-10-16T09:30:00-04:00',close:'2026-10-16T16:00:00-04:00'}]}},
  progress:{...pilot.progress,session:'2026-10-15',supervisorSession:'2026-10-14',process:'inactive',entriesToday:0}};
test('fresh publication cannot disguise a missed completed session as normal idle',()=>{
  assert.equal(paper(missedDay,at('2026-10-15T22:01:00Z')).label,'Session not recorded');
});
test('a completed checkpoint and a pre-open idle state are not missed sessions',()=>{
  const complete={...missedDay,progress:{...missedDay.progress,supervisorSession:'2026-10-15',
    universeCount:79,preparedAt:'2026-10-15T11:46:00Z',candidateCount:0,scanAt:'2026-10-15T13:36:00Z'}};
  assert.equal(paper(complete,at('2026-10-15T22:01:00Z')).label,'Scheduled / idle');
  const morning={...missedDay,updatedAt:'2026-10-16T11:00:00Z',market:{...missedDay.market,checkedAt:'2026-10-16T11:00:00Z'},
    progress:{...missedDay.progress,session:'2026-10-16'}};
  assert.equal(paper(morning,at('2026-10-16T11:01:00Z')).label,'Scheduled / idle');
});
test('expired, malformed calendars and sessions outside trial cannot prove a missed run',()=>{
  for(const calendar of [{...missedDay.market.calendar,checkedAt:'2026-10-01T12:00:00Z'},
    {...missedDay.market.calendar,sessions:{}},{...missedDay.market.calendar,sessions:[null,{open:42}]}])
    assert.notEqual(paper({...missedDay,market:{...missedDay.market,calendar}},at('2026-10-15T22:01:00Z')).label,'Session not recorded');
  assert.notEqual(paper({...missedDay,trial:{firstSession:'2026-10-07',lastSession:'2026-10-14'}},at('2026-10-15T22:01:00Z')).label,'Session not recorded');
});

const {recordedSession}=require('../js/status.js');
const incomplete={...missedDay,progress:{...missedDay.progress,supervisorSession:'2026-10-15',
  executorState:'FLAT',universeCount:null,preparedAt:null,candidateCount:null,scanAt:null,
  quoteBatches:0,lastQuoteAt:null}};
const preparedScan={...incomplete,progress:{...incomplete.progress,universeCount:79,
  preparedAt:'2026-10-15T11:46:00Z',candidateCount:0,scanAt:'2026-10-15T13:36:00Z'}};
test('flat after close with a matching checkpoint cannot hide missing preparation',()=>{
  assert.equal(recordedSession(incomplete,at('2026-10-15T22:01:00Z')).state,'incomplete');
  assert.equal(paper(incomplete,at('2026-10-15T22:01:00Z')).label,'Session incomplete');
});
test('historical session failure remains visible when publication is stale',()=>{
  assert.equal(paper(incomplete,at('2026-10-16T02:00:00Z')).label,'Updates delayed');
  assert.equal(recordedSession(incomplete,at('2026-10-16T02:00:00Z')).label,'Session incomplete');
  assert.match(recordedSession(incomplete,at('2026-10-16T02:00:00Z')).detail,/at publication/);
});
test('zero candidates and zero quotes is valid when preparation and scan are recorded',()=>{
  const result=recordedSession(preparedScan,at('2026-10-15T22:01:00Z'));
  assert.equal(result.state,'recorded');
  assert.equal(result.label,'Scan recorded · no candidates');
});
test('candidate scans require recorded quotes, unlike a zero-candidate scan',()=>{
  const d={...preparedScan,progress:{...preparedScan.progress,candidateCount:1}};
  assert.equal(recordedSession(d,at('2026-10-15T22:01:00Z')).state,'incomplete');
  const quotes={...d,progress:{...d.progress,quoteBatches:1,lastQuoteAt:'2026-10-15T13:37:00Z'}};
  assert.equal(recordedSession(quotes,at('2026-10-15T22:01:00Z')).state,'recorded');
});
test('newly scanned candidates have until the real deadline to publish their first quotes',()=>{
  const d={...preparedScan,updatedAt:'2026-10-15T13:36:02Z',market:{...preparedScan.market,
    calendar:{...preparedScan.market.calendar,checkedAt:'2026-10-15T13:36:01Z'}},
    progress:{...preparedScan.progress,candidateCount:1}};
  assert.equal(recordedSession(d,at('2026-10-15T13:36:03Z')).state,'pending');
});
test('stale pre-open data never fabricates a missing scan when viewed after close',()=>{
  const early={...incomplete,updatedAt:'2026-10-15T11:00:00Z',market:{...incomplete.market,
    calendar:{...incomplete.market.calendar,checkedAt:'2026-10-15T11:00:00Z'}}};
  assert.equal(recordedSession(early,at('2026-10-15T22:01:00Z')).state,'pending');
});
test('an active supervisor waiting past the scan deadline requires attention',()=>{
  const d={...incomplete,updatedAt:'2026-10-15T14:00:00Z',market:{...incomplete.market,
    open:true,checkedAt:'2026-10-15T14:00:00Z',nextClose:'2026-10-15T20:00:00Z',
    calendar:{...incomplete.market.calendar,checkedAt:'2026-10-15T14:00:00Z'}},progress:{...incomplete.progress,
    checkedAt:'2026-10-15T14:00:00Z',supervisorAt:'2026-10-15T13:59:59Z',process:'active',executorState:'WAITING_FOR_PREPARE_OR_SCAN'}};
  assert.equal(paper(d,at('2026-10-15T14:00:01Z')).label,'Session incomplete');
});
test('malformed and out-of-scope evidence is unverified, not a successful session',()=>{
  for(const d of [null,{...incomplete,account:{paper:false}},
    {...incomplete,updatedAt:'2026-10-16T22:00:00Z'},
    {...incomplete,market:{calendar:{}}}])
    assert.equal(recordedSession(d,at('2026-10-15T22:01:00Z')).state,'unverified');
  const d={...incomplete,trial:{firstSession:'2026-10-07',lastSession:'2026-10-14'}};
  assert.equal(recordedSession(d,at('2026-10-15T22:01:00Z')).state,'outside');
});
test('future or prior-session scan timestamps and invalid counts fail closed',()=>{
  for(const scanAt of ['2026-10-14T13:36:00Z','2026-10-15T13:46:00Z','2026-10-16T13:36:00Z',null])
    assert.equal(recordedSession({...preparedScan,progress:{...preparedScan.progress,scanAt}},at('2026-10-15T22:01:00Z')).state,'incomplete');
  for(const candidateCount of [null,-1,'0',true])
    assert.equal(recordedSession({...preparedScan,progress:{...preparedScan.progress,candidateCount}},at('2026-10-15T22:01:00Z')).state,'incomplete');
});
