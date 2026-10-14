#!/usr/bin/env node
// Read-only heuristic scan. Output locations/rule names, never matching secrets.
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');

const rules=[
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['provider-key', /\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}|AIza[\w-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|[AP]K[A-Z0-9]{18})\b/],
  ['literal-secret', /(?:api[_-]?key|secret[_-]?key|api[_-]?secret|access[_-]?token|authorization)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i],
  ['gateway-token-url', /[#?]token=[a-f0-9]{32,}/i],
  ['azure-key', /\b[A-Za-z0-9]{45,}AAAAA[A-Za-z0-9]{5,100}\b/],
];
const privatePath=/^(?:pilot|tmp|output|\.cursor|\.codex|\.ssh|\.openclaw)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\.env|\.json)?|id_(?:rsa|ed25519)|github_ed25519)$|\.(?:pem|p12|pfx|sqlite|sqlite3|db|zip)$/i;
const publicBinary=/\.(?:woff2?|ttf|png|jpe?g|webp|gif|ico)$/i;
const forbiddenField=/^(?:api[_-]?key(?:[_-]?id)?|api[_-]?secret(?:[_-]?key)?|secret(?:[_-]?key)?|token|access[_-]?token|authorization|account[_-]?(?:id|number)|client[_-]?order[_-]?id|private[_-]?path|prompt|raw[_-]?(?:report|journal))$/i;

function inspect(name,content) {
  const findings=[];
  if(privatePath.test(name)) findings.push({path:name,rule:'private-artifact'});
  if(publicBinary.test(name)) return findings;
  for(const [rule,pattern] of rules) if(pattern.test(content)) findings.push({path:name,rule});
  if(/^data\/.*\.json$/.test(name)) {
    let data;
    try {data=JSON.parse(content);} catch {return [...findings,{path:name,rule:'invalid-public-json'}];}
    function walk(value,path='') {
      if(!value || typeof value!=='object')return;
      for(const [key,item] of Object.entries(value)) {
        if(forbiddenField.test(key) || (key==='id' && path.startsWith('account.')))
          findings.push({path:name,rule:'private-json-field',field:path+key});
        walk(item,path+key+'.');
      }
    }
    walk(data);
  }
  return findings;
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32000000});
function scan(history) {
  let findings=[],files=0,blobs=0;
  // Only tracked files: private, untracked operational workspace is out of scope.
  for(const name of git('ls-files','-z').split('\0').filter(Boolean)) {
    if(!fs.existsSync(name))continue;
    files++;findings.push(...inspect(name,fs.readFileSync(name,'utf8')));
  }
  if(history) {
    // Resolve explicitly; never audit unrelated local snapshots as public history.
    git('rev-parse','--verify',history+'^{commit}');
    const objects=git('rev-list','--objects',history).trim().split('\n');
    const types=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{
      input:objects.map(row=>row.split(' ')[0]).join('\n')+'\n',encoding:'utf8'}).trim().split('\n');
    for(let i=0;i<objects.length;i++) {
      if(!types[i].endsWith(' blob'))continue;
      blobs++;const hash=objects[i].split(' ')[0],name=objects[i].slice(hash.length+1);
      findings.push(...inspect(name,publicBinary.test(name) ? '' : git('cat-file','blob',hash))
        .map(f=>({...f,blob:hash.slice(0,12)})));
    }
    // Commit messages can also leak tokens, even if no file does.
    findings.push(...inspect('commit-messages',git('log',history,'--format=%B')));
  }
  return {files,history:history||null,historyBlobs:blobs,findings};
}
if(require.main===module) {
  const args=process.argv.slice(2);
  if(args.length && (args.length!==2 || args[0]!=='--history' || args[1].startsWith('-'))) {
    console.error('Usage: node scripts/audit_public.js [--history REF]');process.exit(2);
  }
  try {const result=scan(args[1]);console.log(JSON.stringify(result,null,2));if(result.findings.length)process.exitCode=1;}
  catch {console.error('Public scan could not complete; no clean result is claimed.');process.exitCode=2;}
}
module.exports={inspect,scan};
