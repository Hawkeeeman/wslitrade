"""Publish only the allowlisted paper JSON using the approved repo-only key.

No model call, trading method, key copying, force-push or public gateway.
The private publisher checkout is separate from the agent/workspace/research.
"""
import fcntl
import json
import os
import shlex
import subprocess
import sys
from datetime import datetime,timezone
from pathlib import Path
from collect_paper import collect

HOME=Path('/home/openclaw')
CODE=HOME/'.local/share/wsli-site'
STATE=HOME/'.local/state/wsli-site'
REPO=CODE/'repository'
AUTH=HOME/'.config/wsli-publisher'
PILOT=HOME/'.local/share/wsli-paper/release-20261006'
PAPER=HOME/'.local/state/wsli-paper'
ORIGIN='git@github.com:Hawkeeeman/wslitrade.git'


def git_environment():
    env={k:v for k,v in os.environ.items() if not k.startswith('APCA_')}
    env['GIT_TERMINAL_PROMPT']='0'
    env['GIT_SSH_COMMAND']=' '.join(shlex.quote(x) for x in [
        '/usr/bin/ssh','-i',str(AUTH/'github_ed25519'),'-o','IdentitiesOnly=yes',
        '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(AUTH/'known_hosts'),
        '-o','BatchMode=yes','-o','ConnectTimeout=10'])
    return env


def run(args,cwd=REPO):
    r=subprocess.run(args,cwd=cwd,env=git_environment(),text=True,capture_output=True,timeout=55)
    if r.returncode: raise RuntimeError('publisher_command_failed:'+args[0]+':'+str(r.returncode))
    return r.stdout.rstrip('\n')


def commit_snapshot():
    run(['git','add','--','data/paper.json'])
    changed=run(['git','diff','--cached','--name-only'])
    if changed and changed!='data/paper.json': raise RuntimeError('unexpected_staged_path')
    if changed:
        run(['git','-c','user.name=WSLI paper publisher','-c','user.email=wsli-paper-status@users.noreply.github.com',
             'commit','-m','Publish verified WSLI paper progress [skip ci]'])


def main():
    if Path.home()!=HOME: raise RuntimeError('wrong_host')
    os.umask(0o077); STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    lock=(STATE/'publisher.lock').open('a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if not (AUTH/'github_ed25519').is_file() or not (AUTH/'known_hosts').is_file():
        raise RuntimeError('repo_only_auth_not_prepared')
    if not REPO.exists():
        run(['git','clone','--quiet','--single-branch','--branch','main',ORIGIN,str(REPO)],cwd=CODE)
    if run(['git','remote','get-url','origin'])!=ORIGIN: raise RuntimeError('unexpected_repository')
    status=run(['git','status','--porcelain'])
    if status and any(line[:3] not in {' M ','?? ','A  ','M  '} or line[3:]!='data/paper.json' for line in status.splitlines()):
        raise RuntimeError('unexpected_checkout_changes')
    # Preserve a prior unpushed snapshot, then rebase only our owned checkout.
    commit_snapshot()
    run(['git','pull','--rebase','origin','main'])
    automatic=(STATE/'automatic-enabled.json').is_file()
    payload=collect(PILOT,PAPER,automatic)
    target=REPO/'data/paper.json'; target.parent.mkdir(exist_ok=True)
    temp=target.with_suffix('.tmp')
    with temp.open('w') as f:
        json.dump(payload,f,indent=2,allow_nan=False); f.write('\n'); f.flush(); os.fsync(f.fileno())
    os.replace(temp,target)
    commit_snapshot()
    head=run(['git','rev-parse','HEAD'])
    run(['git','push','origin','HEAD:main'])
    run(['git','fetch','origin','main'])
    run(['git','merge-base','--is-ancestor',head,'origin/main'])
    receipt=dict(checkedAt=datetime.now(timezone.utc).isoformat(),snapshotAt=payload['updatedAt'],
                 revision=head,automatic=automatic)
    (STATE/'last-success.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'published':True,'snapshotAt':payload['updatedAt'],'automatic':automatic,'revision':head}))


if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('Paper publication failed: '+type(exc).__name__+':'+str(exc),file=sys.stderr)
        raise SystemExit(1)
