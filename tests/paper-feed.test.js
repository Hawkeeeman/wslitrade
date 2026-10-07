const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const snapshot=JSON.parse(fs.readFileSync('data/paper.json','utf8'));
const source=fs.readFileSync('js/paper-feed.js','utf8');
function runtime(hostname,fetch) {
  const window={location:{hostname}};
  vm.runInNewContext(source,{window,fetch,AbortController,setTimeout,clearTimeout,Date});
  return window.WSLIPaperFeed;
}
test('feed requires complete paper-dashboard structure, not merely the right version',()=>{
  const feed=runtime('localhost',()=>{});
  assert.equal(feed.valid(snapshot),true);
  for(const bad of [null,{schemaVersion:2,scope:snapshot.scope,account:{paper:true}},
    {...snapshot,progress:null},{...snapshot,reviews:[null]}, {...snapshot,account:{paper:false}}])
    assert.ok(!feed.valid(bad));
});
test('public feed falls back without redating evidence or sending credentials',async()=>{
  const calls=[];
  const feed=runtime('wslitrade.com',async(url,options)=>{
    calls.push({url,options});
    return calls.length===1 ? {ok:false} : {ok:true,json:async()=>snapshot};
  });
  const data=await feed.load();
  assert.equal(data.updatedAt,snapshot.updatedAt);
  assert.equal(calls.length,2);
  assert.ok(calls[0].url.startsWith('https://raw.githubusercontent.com/Hawkeeeman/wslitrade/main/data/paper.json?'));
  assert.equal(calls[1].options.credentials,'omit');
  assert.equal(calls[1].options.cache,'no-store');
});
test('local preview never requests the production source',async()=>{
  const calls=[];
  const feed=runtime('127.0.0.1',async(url)=>{calls.push(url);return {ok:true,json:async()=>snapshot};});
  await feed.load();
  assert.equal(calls.length,1);
  assert.ok(calls[0].startsWith('data/paper.json?'));
});
test('failed sources reject rather than manufacture an empty or healthy account',async()=>{
  const feed=runtime('wslitrade.com',async()=>({ok:true,json:async()=>({})}));
  await assert.rejects(feed.load(),/unavailable/);
});
