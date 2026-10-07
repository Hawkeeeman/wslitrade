"""Export allowlisted WSLI paper evidence; never submit/cancel an order.

Run on hawkspc with the separately scoped paper environment. Private account
identity is verified by its installed PaperBroker, never exported. Errors leave
the previous successful file and all source timestamps untouched.
"""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
STATES = {'FLAT','ARMED_SCHEDULED','TRIAL_FINISHED','EXCHANGE_CLOSED',
    'WAITING_FOR_PREPARE_OR_SCAN','WAITING_FOR_SIGNAL','CLOCK_SKEW_REFUSED',
    'ENTRY_SUBMITTED','ENTRY_CONSUMED_OR_PENDING','EXIT_COOLDOWN','POSITION_PROTECTED',
    'ORDER_OUTCOME_UNKNOWN','CANCELING_FOR_EXIT','EXIT_PENDING','EXIT_SUBMITTED',
    'EXIT_WAITING_FOR_MARKET','UNEXPECTED_POSITION_REQUIRES_OPERATOR',
    'EXIT_RETRY_LIMIT_REQUIRES_OPERATOR','EXPOSURE_REQUIRES_OPERATOR','ERROR_RECOVERY_PENDING'}
ORDER_STATES = {'new','accepted','pending_new','held','accepted_for_bidding',
    'partially_filled','filled','pending_cancel','canceled','expired','rejected','replaced','done_for_day'}
REASONS = {'daily_loss_cutoff','pilot_drawdown_cutoff','broker_account_entry_block',
    'previous_session_order','unexpected_or_carried_position','partial_or_unfilled_entry',
    'protective_stop_missing','order_outcome_unknown_on_recovery','outside_entry_window',
    'stale_or_future_quote','spread_too_wide','no_breakout','zero_size','invalid_market_data',
    'one_entry_per_session','daily_entry_limit','exit_cooldown','symbol_already_attempted',
    'position_or_order_pending','halted','wrong_session','invalid_stop','clock_skew'}


def amount(value):
    if value is None or isinstance(value,bool): return None
    try:
        n=Decimal(str(value))
        return str(n) if n.is_finite() else None
    except Exception: return None


def stamp(value):
    if isinstance(value,datetime): value=value.isoformat()
    try:
        d=datetime.fromisoformat(value.replace('Z','+00:00'))
        return d.isoformat() if d.utcoffset() is not None else None
    except (ValueError,TypeError,AttributeError): return None


def symbol(value):
    return value if isinstance(value,str) and re.fullmatch(r'[A-Z]{1,5}(?:\.[AB])?',value) else None


def enum(value,allowed):
    v=getattr(value,'value',value)
    return v if v in allowed else None


def snapshot_packet(root,day,kind):
    research=root/'research'/day
    path=research/'journal.sqlite'
    if not path.exists(): return None
    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
        row=db.execute('SELECT payload FROM events WHERE id=?',(kind+':'+day,)).fetchone()
    if not row: return None
    sid=json.loads(row[0])['snapshot_id']
    if not re.fullmatch('[a-f0-9]{64}',sid): raise ValueError('invalid_snapshot_id')
    packet=json.loads((research/'snapshots'/(sid+'.json')).read_text())
    actual=hashlib.sha256(json.dumps(packet,sort_keys=True,allow_nan=False,separators=(',',':')).encode()).hexdigest()
    if sid!=actual or packet['session']!=day: raise ValueError('snapshot_integrity_failure')
    return packet


def ledger_summary(root,day):
    path=root/'execution.sqlite'
    if not path.exists(): return dict(entryCount=None,quoteBatches=None,lastQuoteAt=None,activity=[],intentRoles={},entryPlans=[])
    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
        intents=db.execute('SELECT cid,role FROM intents WHERE day=?',(day,)).fetchall()
        plans=db.execute("SELECT created,payload FROM intents WHERE day=? AND role='entry' ORDER BY created",(day,)).fetchall()
        count,last=db.execute("SELECT count(*),max(at) FROM events WHERE kind='quotes' AND substr(at,1,10)=?",(day,)).fetchone()
        rows=db.execute("SELECT at,kind,payload FROM events WHERE kind IN ('intent_reserved','broker_response','order_reconciled','halt','session_finished') AND substr(at,1,10)=? ORDER BY id DESC LIMIT 24",(day,)).fetchall()
    activity=[]
    for at,kind,raw in rows:
        p=json.loads(raw)
        activity.append(dict(at=stamp(at),kind=kind,symbol=symbol(p.get('symbol')),
            side=enum(p.get('side'),{'buy','sell'}),status=enum(p.get('status'),ORDER_STATES),
            qty=amount(p.get('filled_qty',p.get('qty'))),price=amount(p.get('filled_avg_price')),
            reason=enum(p.get('reason'),REASONS)))
    return dict(entryCount=sum(role=='entry' for _,role in intents),quoteBatches=count,
                lastQuoteAt=stamp(last),activity=activity,intentRoles=dict(intents),
                entryPlans=[dict(at=at,plan=json.loads(raw)) for at,raw in plans])


def public_decisions(plans,scan):
    """Recorded admission evidence, not a model's private reasoning."""
    result=[]
    for entry in plans:
        p=entry['plan']; s=symbol(p.get('symbol'))
        if not s: continue
        evidence=p.get('decision_evidence',{})
        card=None; rank=None
        if scan and stamp(scan.get('asof')) and stamp(entry['at']) and datetime.fromisoformat(stamp(scan['asof']))<=datetime.fromisoformat(stamp(entry['at'])):
            for i,c in enumerate(scan.get('cards',[])):
                if c.get('symbol')==s: card=c; rank=i+1; break
        result.append(dict(symbol=s,at=stamp(entry['at']),authority='deterministic_rules',
            qty=amount(p.get('qty')),limitPrice=amount(p.get('limit_price')),
            stopPrice=amount(p.get('stop_price')),nominalRisk=amount(p.get('nominal_risk')),
            maxNotional=amount(p.get('max_notional')),candidateRank=rank,
            relativeVolume=amount(card.get('relative_volume')) if card else None,
            openingRangeHigh=amount(evidence.get('opening_range_high',card.get('range',{}).get('high') if card else None)),
            atr=amount(evidence.get('atr',card.get('atr') if card else None)),
            quoteAt=stamp(evidence.get('quote_at')),bid=amount(evidence.get('bid')),
            ask=amount(evidence.get('ask')),spreadFraction=amount(evidence.get('spread_fraction')),
            quoteRecorded=bool(stamp(evidence.get('quote_at'))),
            stopAtrMultiple='0.1'))
    return result


def public_policy_change(value):
    if not isinstance(value,dict) or value.get('effective_session')!='2026-10-08' or value.get('max_entries')!=3 or value.get('exit_cooldown_seconds')!=900 or value.get('no_repeat_symbols') is not True:
        return None
    installed=stamp(value.get('installed_at'))
    return dict(state='installed' if installed else 'scheduled',effectiveSession='2026-10-08',
        maxEntries=3,cooldownSeconds=900,noRepeatSymbols=True,installedAt=installed,
        scheduledAt=stamp(value.get('scheduled_at')))


def public_orders(orders,intent_roles):
    result=[]
    def add(order,role):
        result.append(dict(at=stamp(order.filled_at or order.submitted_at or order.created_at),
            side=enum(order.side,{'buy','sell'}),symbol=symbol(order.symbol),
            qty=amount(order.qty),filledQty=amount(order.filled_qty),
            price=amount(order.filled_avg_price),status=enum(order.status,ORDER_STATES),role=role))
        for leg in order.legs or []: add(leg,'protective_stop')
    for order in orders:
        # No legacy account history, unrelated orders or canceled plumbing test.
        if order.client_order_id in intent_roles: add(order,intent_roles[order.client_order_id])
    return sorted(result,key=lambda o:o['at'] or '',reverse=True)[:30]


def read_reviews(root,day,jobs,account_number):
    manifest=json.loads((root/'review-jobs.json').read_text())
    by_id={j['id']:j for j in jobs}
    result=[]
    for slot in ('morning','close'):
        name=f'WSLI paper {slot} review {day}'
        spec=next((j for j in manifest if j['name']==name),None)
        job=by_id.get(spec['id'],{}) if spec else {}
        state=job.get('state',{})
        at=state.get('lastRunAtMs')
        last=stamp(datetime.fromtimestamp(at/1000,timezone.utc)) if isinstance(at,(int,float)) and not isinstance(at,bool) else None
        path=root/'reviews'/f'{day}-{slot}.json'
        report={}
        if path.is_file():
            try: value=json.loads(path.read_text())
            except (ValueError,OSError): value={}
            checked=stamp(value.get('checked_at'))
            if value.get('account')==account_number and value.get('slot')==slot and checked and datetime.fromisoformat(checked).astimezone(ET).date().isoformat()==day:
                report=value
        result.append(dict(slot=slot,scheduledAt=stamp(spec['at']) if spec else None,
            enabled=job.get('enabled') is True,lastRunAt=last,
            lastOutcome=enum(state.get('lastRunStatus'),{'ok','error','skipped'}),
            reportAvailable=bool(report),checkedAt=stamp(report.get('checked_at')),
            operatorActionNeeded=report.get('operator_action_needed') if isinstance(report.get('operator_action_needed'),bool) else None))
    return result


def build_snapshot(*,now,account,positions,orders,clock,calendar,status,service,ledger,
                   prepared,scan,reviews,config,halted,automatic=False,policy_change=None):
    checked=stamp(now)
    if not checked: raise ValueError('timezone_required')
    day=now.astimezone(ET).date().isoformat()
    equity,cash=amount(account.equity),amount(account.cash)
    if equity is None or cash is None: raise ValueError('invalid_balance')
    last=amount(account.last_equity)
    pl=str(Decimal(equity)-Decimal(config['seed']))
    daily=str(Decimal(equity)-Decimal(last)) if last else None
    safe_positions=[dict(symbol=symbol(p.symbol),qty=amount(p.qty),side=enum(p.side,{'long','short'}),
        avgEntry=amount(p.avg_entry_price),price=amount(p.current_price),
        marketValue=amount(p.market_value),unrealizedPl=amount(p.unrealized_pl)) for p in positions]
    safe_orders=public_orders(orders,ledger['intentRoles'])
    quote_at=ledger['lastQuoteAt']
    progress=dict(session=day,checkedAt=checked,armed=status.get('armed') is True,
        halted=bool(halted),executorState=enum(status.get('executor_state'),STATES),
        supervisorAt=stamp(status.get('checked_at')),supervisorSession=status.get('session') if re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(status.get('session',''))) else None,
        process=enum(service,{'active','inactive','failed','activating','deactivating'}),
        entriesToday=ledger['entryCount'],
        maxEntries=3 if config.get('max_entries_per_session')==3 and config.get('entry_policy_effective_session')=='2026-10-08' and day>='2026-10-08' else 1,
        cooldownSeconds=900 if config.get('max_entries_per_session')==3 and day>='2026-10-08' else 0,
        nextEntryAfter=stamp(status.get('next_entry_after')),noRepeatSymbols=True,
        openOrderCount=status.get('open_order_count'),
        universeCount=len(prepared['universe']) if prepared else None,
        preparedAt=stamp(prepared.get('prepared_at')) if prepared else None,
        candidateCount=len(scan['cards']) if scan else None,
        candidates=[symbol(c['symbol']) for c in scan['cards']] if scan else [],
        scanAt=stamp(scan.get('asof')) if scan else None,
        quoteBatches=ledger['quoteBatches'],lastQuoteAt=quote_at,
        refusals=[dict(reason=r,count=sum(v==r for v in status.get('refusals',{}).values()))
            for r in sorted(REASONS) if r in status.get('refusals',{}).values()])
    return dict(schemaVersion=2,scope='wsli_paper_pilot',updatedAt=checked,
        publication=dict(automatic=bool(automatic),intervalSeconds=600),
        trial=dict(firstSession=config['first_session'],lastSession=config['last_session'],
            seed=config['seed'],maxPosition=config['max_position'],nominalRisk=config['risk_per_trade'],
            dailyLoss=config['daily_loss'],feed='iex',timezone='America/New_York'),
        account=dict(equity=equity,cash=cash,dayPl=daily,trialPl=pl,paper=True,checkedAt=checked),
        market=dict(open=clock.is_open,checkedAt=stamp(clock.timestamp),nextOpen=stamp(clock.next_open),
            nextClose=stamp(clock.next_close),calendar=calendar),
        progress=progress,positions=safe_positions,trades=safe_orders,
        activity=ledger['activity'],reviews=reviews,
        decisions=public_decisions(ledger.get('entryPlans',[]),scan),
        policyChange=public_policy_change(policy_change))


def collect(code,root,automatic=False):
    sys.path.insert(0,str(code))
    from paper_broker import PaperBroker
    from paper_runner import config,armed
    from alpaca.trading.requests import GetOrdersRequest,GetCalendarRequest
    from alpaca.trading.enums import QueryOrderStatus
    broker=PaperBroker(); c=config(); now=datetime.now(timezone.utc)
    day=now.astimezone(ET).date().isoformat()
    account=broker.verify()
    positions=broker.client.get_all_positions()
    orders=broker.client.get_orders(GetOrdersRequest(status=QueryOrderStatus.ALL,limit=100,nested=True))
    open_orders=broker.client.get_orders(GetOrdersRequest(status=QueryOrderStatus.OPEN))
    clock=broker.client.get_clock()
    cal_start=now.astimezone(ET).replace(hour=0,minute=0,second=0,microsecond=0)
    cal_end=cal_start+timedelta(days=7)
    rows=broker.client.get_calendar(GetCalendarRequest(start=cal_start.date(),end=cal_end.date()))
    calendar=dict(checkedAt=stamp(now),from_=stamp(cal_start),through=stamp(cal_end+timedelta(days=1)),
        sessions=[dict(open=stamp(datetime.combine(r.date,r.open.time(),tzinfo=ET)),
                       close=stamp(datetime.combine(r.date,r.close.time(),tzinfo=ET))) for r in rows])
    calendar['from']=calendar.pop('from_')
    status=json.loads((root/'status.json').read_text()) if (root/'status.json').exists() else {}
    status['armed']=armed(root,c)
    status['open_order_count']=len(open_orders)
    service=subprocess.run(['systemctl','--user','show','wsli-paper-supervise.service','-p','ActiveState','--value'],text=True,capture_output=True,check=True,timeout=15).stdout.strip()
    jobs=json.loads(subprocess.run(['openclaw','cron','list','--all','--json'],text=True,capture_output=True,check=True,timeout=30).stdout)['jobs']
    policy_change=None
    for name in ('entry-policy-upgrade.json','entry-policy-pending.json'):
        if (root/name).is_file():
            policy_change=json.loads((root/name).read_text()); break
    return build_snapshot(now=datetime.now(timezone.utc),account=account,positions=positions,orders=orders,clock=clock,
        calendar=calendar,status=status,service=service,ledger=ledger_summary(root,day),
        prepared=snapshot_packet(root,day,'prepared'),scan=snapshot_packet(root,day,'scan'),
        reviews=read_reviews(root,day,jobs,account.account_number),config=c,
        halted=(root/'HALT').exists() or (root/('HALT-'+day)).exists(),automatic=automatic,
        policy_change=policy_change)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--code',required=True,type=Path); p.add_argument('--runtime',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path); p.add_argument('--automatic',action='store_true')
    args=p.parse_args(); payload=collect(args.code.resolve(),args.runtime.resolve(),args.automatic)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=args.output.parent,delete=False) as f:
        json.dump(payload,f,indent=2,allow_nan=False); f.write('\n'); temp=f.name
    os.replace(temp,args.output)
    print(json.dumps({'exported':True,'session':payload['progress']['session'],'equity':payload['account']['equity'],
        'positions':len(payload['positions']),'orders':len(payload['trades']),
        'executorState':payload['progress']['executorState']}))


if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('Paper status export failed: '+type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
