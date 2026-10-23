const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const status=require('../js/status.js');
const trades=require('../js/trade-details.js');

function snapshot(complete=false) {
  return {schemaVersion:2,scope:'wsli_paper_pilot',updatedAt:'2026-10-20T21:50:04Z',
    publication:{automatic:true},trial:{firstSession:'2026-10-07',lastSession:'2026-10-20',seed:'10000',
      maxPosition:'1000',nominalRisk:'10',dailyLoss:'100'},account:{paper:true,equity:'10007.53',cash:'10007.53',trialPl:'7.53',dayPl:'0'},
    market:{open:false,checkedAt:'2026-10-20T21:50:03Z',nextOpen:'2026-10-21T09:30:00-04:00',calendar:{
      checkedAt:'2026-10-20T21:50:02Z',from:'2026-10-20T00:00:00-04:00',through:'2026-10-22T00:00:00-04:00',
      sessions:[{open:'2026-10-20T09:30:00-04:00',close:'2026-10-20T16:00:00-04:00'}]}},
    progress:{session:'2026-10-20',checkedAt:'2026-10-20T21:50:04Z',supervisorSession:'2026-10-20',
      supervisorAt:'2026-10-20T20:00:00Z',process:'inactive',executorState:'FLAT',armed:true,halted:false,
      entriesToday:0,maxEntries:3,openOrderCount:0,cooldownSeconds:900,quoteBatches:0,lastQuoteAt:null,
      universeCount:complete?79:null,preparedAt:complete?'2026-10-20T11:46:00Z':null,
      candidateCount:complete?0:null,scanAt:complete?'2026-10-20T13:36:00Z':null,candidates:[]},
    positions:[],trades:[],activity:[],decisions:[],reviews:[]};
}
class Element {
  constructor(){this.dataset={};this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this.textContent='';}
  get childElementCount(){return this.children.length;}
}
async function render(page,script,data,now='2026-10-21T02:00:00Z') {
  const html=fs.readFileSync(page,'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'No duplicate DOM IDs');
  const elements=new Map(ids.map(id=>[id,new Element()]));
  const document={getElementById(id){assert.ok(elements.has(id),`Missing ${id}`);return elements.get(id);},createElement:()=>new Element()};
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));} static now(){return Date.parse(now);}}
  const timedStatus={...status,paper:d=>status.paper(d,Clock.now()),continuation:d=>status.continuation(d,Clock.now()),recordedSession:d=>status.recordedSession(d,Clock.now()),market:d=>status.market(d,Clock.now())};
  const context={document,window:{stageState:{}},WSLIStatus:timedStatus,WSLITradeDetails:trades,
    WSLIPaperFeed:{load:async()=>data},setInterval:()=>{},startStage:()=>{},startField:()=>{},Date:Clock};
  vm.runInNewContext(fs.readFileSync(script,'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return elements;
}
test('Agents renders stale publication and historical incomplete-session evidence independently',async()=>{
  const nodes=await render('agents.html','js/paper.js',snapshot());
  assert.equal(nodes.get('progress-label').textContent,'Updates delayed');
  assert.equal(nodes.get('session-evidence-label').textContent,'Session incomplete');
  assert.equal(nodes.get('session-evidence-banner').dataset.state,'asleep');
  assert.equal(nodes.get('session-evidence-banner').hidden,false);
  assert.equal(nodes.get('prepare-state').textContent,'Preparation missing');
  assert.equal(nodes.get('scan-state').textContent,'Opening scan missing');
  assert.match(nodes.get('feed-list').textContent,/not a verified no-trade day/);
  assert.match(nodes.get('heartbeat-publication').textContent,/2026-10-20/);
  const html=fs.readFileSync('agents.html','utf8');
  assert.ok(html.indexOf('id="session-evidence-banner"')>html.indexOf('<main'));
});
test('fresh incomplete evidence has one warning rather than duplicate banners',async()=>{
  const nodes=await render('agents.html','js/paper.js',snapshot(),'2026-10-20T21:51:00Z');
  assert.equal(nodes.get('progress-label').textContent,'Session incomplete');
  assert.equal(nodes.get('session-evidence-banner').hidden,true);
});
test('a completed empty scan is displayed without a missing-session warning',async()=>{
  const nodes=await render('agents.html','js/paper.js',snapshot(true));
  assert.equal(nodes.get('session-evidence-label').textContent,'Scan recorded · no candidates');
  assert.notEqual(nodes.get('session-evidence-banner').dataset.state,'asleep');
  assert.doesNotMatch(nodes.get('feed-list').textContent,/not a verified no-trade day/);
});
test('Home also preserves the incomplete-session warning after the last scheduled publication',async()=>{
  const nodes=await render('index.html','js/home.js',snapshot());
  assert.equal(nodes.get('home-paper-state').textContent,'Updates delayed');
  assert.match(nodes.get('home-session-evidence').textContent,/Session incomplete/);
  assert.equal(nodes.get('home-session-evidence').dataset.state,'asleep');
});
test('renewed dates and cumulative accounting come from the host feed, not the old hard-coded window',async()=>{
  const d=snapshot(); d.trial.firstSession='2026-10-26';d.trial.lastSession='2026-10-30';
  d.updatedAt='2026-10-23T04:45:00Z';d.progress.session='2026-10-23';
  const nodes=await render('agents.html','js/paper.js',d,'2026-10-23T04:46:00Z');
  assert.match(nodes.get('trial-summary').textContent,/2026-10-26–2026-10-30/);
  assert.match(nodes.get('trial-summary').textContent,/original seed/);
  assert.match(nodes.get('power-meta').textContent,/including prior runs/);
  assert.equal(nodes.get('progress-label').textContent,'Paper run scheduled');
});
test('queued installation is visible but cannot masquerade as an activated run',async()=>{
  const d=snapshot();d.continuation={state:'scheduled',firstSession:'2026-10-26',lastSession:'2026-10-30',scheduledAt:'2026-10-23T20:15:00Z'};
  const nodes=await render('agents.html','js/paper.js',d,'2026-10-23T15:00:00Z');
  assert.equal(nodes.get('continuation-label').textContent,'Continuation activation queued');
  assert.equal(nodes.get('continuation-banner').hidden,false);
  assert.match(nodes.get('continuation-detail').textContent,/not proof of activation/);
  assert.equal(nodes.get('progress-label').textContent,'Updates delayed');
});
