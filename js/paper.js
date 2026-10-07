(function() {
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{ el(id).textContent=value; };
  const number=value=>value===null || value===undefined || value==='' ? NaN : Number(value);
  const money=value=>Number.isFinite(number(value)) ? number(value).toLocaleString('en-US',{style:'currency',currency:'USD'}) : '—';
  const qty=value=>Number.isFinite(number(value)) ? number(value).toLocaleString('en-US',{maximumFractionDigits:4}) : '—';
  const stamp=value=>Number.isFinite(Date.parse(value||'')) ? new Date(value).toLocaleString('en-US',{
    timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}) : 'unverified';
  const count=value=>Number.isInteger(value) && value>=0 ? value.toLocaleString('en-US') : '—';
  const pill=(id,label,kind,value)=>{ el(id).className=`pulse-dot ${kind}`; text(label,value); };
  const cell=(tr,value,cls='')=>{ const td=document.createElement('td'); td.textContent=value; td.className=cls; tr.append(td); };
  function empty(table,message) {
    table.replaceChildren(); const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=6; td.className='empty'; td.textContent=message; tr.append(td); table.append(tr);
  }
  function render(data) {
    const state=WSLIStatus.paper(data), p=data.progress, t=data.trial;
    text('updated',`Host snapshot: ${stamp(data.updatedAt)}. The browser checks for updates every 20 seconds.`);
    text('trial-summary',`October 7–20 paper experiment · ${money(t.seed)} starting equity · IEX feed only. This is not the legacy NVDA account or live money.`);
    text('progress-label',state.label); text('progress-detail',state.detail);
    el('progress-banner').dataset.state=state.kind;
    pill('status-dot','status-label',state.kind,state.label);
    window.stageState.bot=state.kind;
    text('bot-state',state.label); el('card-bot').dataset.state=state.kind;
    text('bot-meta',`Checkpoint ${stamp(p.supervisorAt)} · ${p.executorState ? p.executorState.toLowerCase().replaceAll('_',' ') : 'state unverified'}.`);
    const market=WSLIStatus.market(data);
    const marketLabel=market.kind==='unknown' ? 'Unverified' : market.kind==='open' ? 'Open' : 'Closed';
    pill('market-dot','market-label',market.kind,`Market ${marketLabel.toLowerCase()}${market.scheduled ? ' · schedule' : ''}`);
    window.stageState.market=market.kind; el('card-market').dataset.state=market.kind;
    text('market-state',marketLabel);
    text('market-meta',market.kind==='unknown' ? 'Current exchange-clock evidence is unavailable.' :
      `${market.kind==='open' ? 'Closes' : 'Next open'} ${stamp(market.kind==='open' ? market.nextClose : market.nextOpen)}.${market.scheduled ? ' Exchange schedule, not a fresh broker clock.' : ''}`);
    text('account-value',money(data.account.equity));
    text('account-meta',`${money(data.account.cash)} cash · ${data.positions.length} open position${data.positions.length===1 ? '' : 's'} · snapshot values.`);
    text('power-value',money(data.account.trialPl));
    el('power-value').className=number(data.account.trialPl)>0 ? 'up' : number(data.account.trialPl)<0 ? 'down' : '';
    text('power-meta',`From ${money(t.seed)} seed · day P/L ${money(data.account.dayPl)}. Paper, including broker fills.`);
    text('heartbeat-publication',data.publication.automatic ? 'Automatic host publisher · every 10 minutes' : 'Manual snapshot · repo connection pending');
    text('heartbeat-checked',`Published host check ${stamp(p.checkedAt)} · session ${p.session}. Process: ${p.process || 'unverified'}. Browser refresh does not redate host evidence.`);
    text('prepare-state',p.universeCount===null ? 'Awaiting preparation' : `${count(p.universeCount)} stocks audited`);
    text('prepare-detail',`Prepared ${stamp(p.preparedAt)}. Missing history is excluded, not invented.`);
    text('scan-state',p.candidateCount===null ? 'Awaiting scan' : `${count(p.candidateCount)} candidates`);
    text('scan-detail',p.candidateCount===null ? 'No verified scan published for this session.' :
      `Frozen ${stamp(p.scanAt)}. ${p.candidates.length ? p.candidates.join(', ')+'.' : 'No qualifying candidates.'} Candidates are not orders.`);
    text('entry-state',p.entriesToday===null ? 'Entry count unverified' : `${count(p.entriesToday)} / ${count(p.maxEntries)} entry used`);
    text('entry-detail',p.entriesToday===null ? 'The execution ledger is unavailable. No zero-entry or completed-day claim is made.' : p.entriesToday>=p.maxEntries ? 'The daily attempt is consumed. No second buy today, even if the position has closed.' :
      'Entries only 9:36–11:00 a.m. Eastern, with fresh quotes and fixed risk checks. No forced trade.');
    text('safety-state',p.halted ? 'Halt requested' : data.positions.length ? 'Position monitored' : p.openOrderCount ? 'Working orders' : 'Account flat');
    text('safety-detail',`${count(p.openOrderCount)} open orders at check. ${p.halted ? 'Verify actual liquidation; a halt marker alone is not a fill.' : 'Liquidation starts five minutes before the exchange close. hawkspc must remain awake.'}`);
    text('collector-detail',`${count(p.quoteBatches)} quote batches recorded today · last ${stamp(p.lastQuoteAt)}. Quote collection may stop at 11 a.m.; safety monitoring continues.`);
    text('collector-schedule',`Trial ${t.firstSession}–${t.lastSession} · prepare 7:45 a.m. · monitor 9:30 a.m. · Gem 10:05 a.m. / 4:05 p.m. Eastern.`);
    text('risk-detail',`One entry/day · max ${money(t.maxPosition)} position · nominal ${money(t.nominalRisk)} stop risk · ${money(t.dailyLoss)} daily-loss entry cutoff. Gaps/outages can exceed nominal risk.`);
    const reviews=el('review-list'); reviews.replaceChildren();
    for (const r of data.reviews) {
      const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p');
      title.textContent=r.slot==='morning' ? 'Morning review' : 'After-close review';
      detail.className='card-meta'; detail.textContent=`${WSLIStatus.paperReview(r)} · scheduled ${stamp(r.scheduledAt)}${r.lastRunAt ? ' · ran '+stamp(r.lastRunAt) : ''}. 3-minute run limit.${r.operatorActionNeeded===true ? ' Operator attention requested.' : ''}`;
      li.append(title,detail); reviews.append(li);
    }
    if (!data.reviews.length) reviews.textContent='No review evidence published.';
    text('position-count',`${data.positions.length} open at snapshot`);
    const positions=el('position-body'); positions.replaceChildren();
    if (!data.positions.length) empty(positions,'No open positions at the last verified broker check.');
    for (const position of data.positions) {
      const tr=document.createElement('tr'); cell(tr,position.symbol||'—'); cell(tr,qty(position.qty),'mono');
      for (const value of [position.avgEntry,position.price,position.marketValue]) cell(tr,money(value),'mono');
      cell(tr,money(position.unrealizedPl),number(position.unrealizedPl)<0 ? 'mono down' : 'mono up'); positions.append(tr);
    }
    const activity=el('feed-list'); activity.replaceChildren(); text('feed-count',`${data.activity.length} published events`);
    const kinds={intent_reserved:'Order intent recorded before sending',broker_response:'Broker response',
      order_reconciled:'Broker status reconciled',halt:'Halt recorded',session_finished:'Session finished'};
    for (const event of data.activity) {
      const li=document.createElement('li'),at=document.createElement('span'),detail=document.createElement('span');
      at.className='feed-time'; at.textContent=stamp(event.at);
      detail.textContent=[kinds[event.kind]||'Verified execution event',event.symbol,event.side,event.status,
        event.reason ? event.reason.replaceAll('_',' ') : null].filter(Boolean).join(' · ');
      li.append(at,detail); activity.append(li);
    }
    if (!data.activity.length) activity.textContent='No execution events published for this session. A healthy no-trade day is valid.';
    const orders=el('trade-body'); orders.replaceChildren(); text('trade-count',`${data.trades.length} orders · filled, pending and canceled distinguished`);
    if (!data.trades.length) empty(orders,'No strategy orders at this check. Canceled setup plumbing tests are excluded.');
    for (const order of data.trades) {
      const tr=document.createElement('tr'); cell(tr,stamp(order.at),'mono'); cell(tr,(order.side||'—').toUpperCase(),`side-${order.side||''}`);
      cell(tr,`${order.symbol||'—'} · ${order.role==='protective_stop' ? 'stop' : order.role}`);
      cell(tr,`${qty(order.filledQty)} / ${qty(order.qty)}`,'mono'); cell(tr,money(order.price),'mono');
      cell(tr,order.status||'unverified',`status-${order.status||''}`); orders.append(tr);
    }
  }
  let fetching=false;
  async function refresh() {
    if (fetching) return; fetching=true;
    try { render(await WSLIPaperFeed.load()); }
    catch {
      text('progress-label','Progress feed unavailable');
      text('progress-detail','All displayed figures are historical. No new activity, market state or flat account is implied.');
      el('progress-banner').dataset.state='stale';
      pill('status-dot','status-label','unknown','Updates unavailable');
      pill('market-dot','market-label','unknown','Market unverified');
      text('market-state','Unverified'); text('bot-state','Unverified');
      el('card-bot').dataset.state=el('card-market').dataset.state='unknown';
      window.stageState.bot=window.stageState.market='unknown';
    } finally { fetching=false; }
  }
  refresh(); setInterval(refresh,20000); startStage();
})();
