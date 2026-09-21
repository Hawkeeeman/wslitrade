const test = require('node:test');
const assert = require('node:assert/strict');
const {market, bot, fresh} = require('../js/status.js');
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
