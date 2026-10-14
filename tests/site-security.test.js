const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {inspect}=require('../scripts/audit_public.js');
const pages=['index.html','agents.html','privacy.html','cookies.html','terms.html','risk.html'];
test('every page exposes accessible policy links and limits script/network sources',()=>{
  for(const page of pages) {
    const html=fs.readFileSync(page,'utf8');
    assert.match(html,/<html lang="en">/);
    assert.match(html,/aria-label="Policies"/);
    for(const policy of pages.slice(2))assert.ok(html.includes(`href="${policy}"`),`${page}: ${policy}`);
    assert.match(html,/name="referrer" content="no-referrer"/);
    assert.match(html,/http-equiv="Content-Security-Policy"/);
    assert.ok(html.includes("script-src 'self'"));
    assert.ok(html.includes("connect-src 'self' https://raw.githubusercontent.com"));
    assert.ok(html.includes("form-action 'none'"));
    assert.doesNotMatch(html,/unsafe-inline|unsafe-eval|fonts\.googleapis|fonts\.gstatic|<iframe|<form\b|\son(?:click|error|load)=/i);
    for(const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
      assert.doesNotMatch(m[1],/^https?:|^\/\//,`${page} third-party executable/stylesheet`);
      assert.ok(fs.existsSync(m[1].split('?')[0]),`${page} missing asset ${m[1]}`);
    }
  }
});
test('browser scripts do not store visitor IDs or connect to private/broker services',()=>{
  for(const name of fs.readdirSync('js').filter(x=>x.endsWith('.js'))) {
    const source=fs.readFileSync(`js/${name}`,'utf8');
    assert.doesNotMatch(source,/document\.cookie|localStorage|sessionStorage|indexedDB|sendBeacon|api\.alpaca|paper-api\.alpaca|hawkspc\.tail|#token=/i);
    assert.equal(inspect(`js/${name}`,source).length,0);
  }
});
test('self-hosted fonts retain their real licenses and valid WOFF2 assets',()=>{
  for(const name of ['bricolage-grotesque-latin','fragment-mono-latin'])
    assert.equal(fs.readFileSync(`assets/fonts/${name}.woff2`).subarray(0,4).toString(),'wOF2');
  for(const name of ['Bricolage-Grotesque','Fragment-Mono'])
    assert.match(fs.readFileSync(`assets/fonts/${name}-OFL.txt`,'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
  assert.doesNotMatch(fs.readFileSync('css/styles.css','utf8'),/url\(["']?https?:/i);
});
test('scan flags secrets without including their values in its output',()=>{
  const key=['sk','proj','a'.repeat(40)].join('-');
  const findings=inspect('js/bad.js',`const value="${key}"`);
  assert.ok(findings.some(f=>f.rule==='provider-key'));
  assert.ok(!JSON.stringify(findings).includes(key));
  const token='1'.repeat(64);
  assert.ok(inspect('index.html',`https://example.test/#${'token'}=${token}`).length);
  assert.ok(inspect('bad.txt',['-----BEGIN','OPENSSH PRIVATE KEY-----'].join(' ')).length);
  assert.ok(inspect('bad.txt',`${'apiKey'} = "${'x'.repeat(40)}"`).length);
});
test('scan rejects private artifacts and deeply nested private JSON fields',()=>{
  for(const name of ['pilot/paper_engine.py','tmp/release.html','output/report.pdf','.env','config/credentials.env','host/github_ed25519','release.zip'])
    assert.ok(inspect(name,'{}').some(f=>f.rule==='private-artifact'),name);
  for(const field of ['account_id','client_order_id','apiKey','prompt','raw_journal','private_path']) {
    const findings=inspect('data/example.json',JSON.stringify({safe:[{[field]:'secret'}]}));
    assert.ok(findings.some(f=>f.rule==='private-json-field'),field);
    assert.ok(!JSON.stringify(findings).includes('"secret"'));
  }
});
test('existing public snapshots pass private-field and recognizable-secret checks',()=>{
  for(const name of fs.readdirSync('data').filter(x=>x.endsWith('.json')))
    assert.deepEqual(inspect(`data/${name}`,fs.readFileSync(`data/${name}`,'utf8')),[]);
});
test('risk disclosure makes no profitability date or pretend computed statistics',()=>{
  const html=fs.readFileSync('risk.html','utf8');
  assert.match(html,/Profitability is not established/);
  assert.match(html,/operational checkpoint, not a profitability deadline/);
  assert.match(html,/not a claim that confidence intervals/);
  assert.match(html,/All of those losses remain/);
  assert.match(html,/not a fully cost-adjusted live return/);
});
