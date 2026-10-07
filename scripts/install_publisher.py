"""Prepare/enable the finite non-AI paper-site publisher on hawkspc."""
import argparse
import base64
import hashlib
import json
import os
import subprocess
from datetime import datetime,timezone
from pathlib import Path
from publish_paper import HOME,CODE,STATE,REPO,AUTH

# Official GitHub Docs, verified October 7, 2026:
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
HOST_KEY='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n'
HOST_FINGERPRINT='SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'
UNITS=HOME/'.config/systemd/user'


def units():
    return {'wsli-site-publish.service':f'''[Unit]
Description=WSLI public paper progress publisher - no AI or orders
After=network-online.target
[Service]
Type=oneshot
WorkingDirectory={CODE}
EnvironmentFile={HOME}/.config/wsli-paper/credentials.env
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/bin/python3 {CODE}/publish_paper.py
TimeoutStartSec=180s
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={STATE} {REPO}
''','wsli-site-publish.timer':'''[Unit]
Description=WSLI paper progress every 10 minutes Oct 7-20
[Timer]
OnCalendar=Mon..Fri 2026-10-07..20 07..17:00/10:00 America/New_York
AccuracySec=1s
Persistent=false
Unit=wsli-site-publish.service
[Install]
WantedBy=timers.target
'''}


def execute(args):
    r=subprocess.run(args,text=True,capture_output=True,timeout=200)
    if r.returncode: raise RuntimeError('installation_command_failed:'+args[0]+':'+str(r.returncode))
    return r.stdout


def prepare():
    if Path.home()!=HOME or not (AUTH/'github_ed25519').is_file(): raise RuntimeError('wrong_host_or_missing_approved_key')
    actual='SHA256:'+base64.b64encode(hashlib.sha256(base64.b64decode(HOST_KEY.split()[2])).digest()).decode().rstrip('=')
    if actual!=HOST_FINGERPRINT: raise RuntimeError('host_fingerprint_mismatch')
    os.umask(0o077); STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    path=AUTH/'known_hosts'
    if path.exists() and path.read_text()!=HOST_KEY: raise RuntimeError('existing_host_pin_differs')
    if not path.exists():
        with path.open('x') as f:f.write(HOST_KEY)
        path.chmod(0o600)
    print(json.dumps({'repo_key_prepared':True,'github_host_pin_verified':True,'timer_changed':False}))


def install():
    # Publish once and verify a successful remote push BEFORE enabling recurrence.
    execute(['/usr/bin/python3',str(CODE/'publish_paper.py')])
    texts=units(); UNITS.mkdir(parents=True,exist_ok=True)
    for name,text in texts.items():
        path=UNITS/name
        if path.exists() and path.read_text()!=text: raise RuntimeError('existing_unit_differs:'+name)
        if not path.exists():
            with path.open('x') as f:f.write(text)
            path.chmod(0o600)
    execute(['systemd-analyze','--user','verify']+[str(UNITS/n) for n in texts])
    execute(['systemctl','--user','daemon-reload'])
    execute(['systemctl','--user','enable','--now','wsli-site-publish.timer'])
    (STATE/'automatic-enabled.json').write_text(json.dumps({'enabledAt':datetime.now(timezone.utc).isoformat()}))
    execute(['systemctl','--user','start','wsli-site-publish.service'])
    print(execute(['systemctl','--user','list-timers','wsli-site-*','--no-pager']))
    print((STATE/'last-success.json').read_text())


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--apply',action='store_true'); args=p.parse_args()
    try:
        prepare()
        if args.apply:install()
    except Exception as exc:
        print('Site publisher installation stopped: '+str(exc))
        raise SystemExit(1)
