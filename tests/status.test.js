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
