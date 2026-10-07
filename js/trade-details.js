(function(root) {
  const num=x=>x===null || x===undefined || x==='' ? NaN : Number(x);
  function books(trades) {
    const symbols=[...new Set(trades.filter(t=>t.role==='entry' && t.side==='buy').map(t=>t.symbol))];
    return symbols.map(symbol=>{
      const orders=trades.filter(t=>t.symbol===symbol && num(t.filledQty)>0 && num(t.price)>0);
      const buys=orders.filter(t=>t.side==='buy' && t.role==='entry');
      const sells=orders.filter(t=>t.side==='sell' && ['protective_stop','exit'].includes(t.role));
      const total=(rows,key)=>rows.reduce((sum,t)=>sum+(key==='qty' ? num(t.filledQty) : num(t.filledQty)*num(t.price)),0);
      const shares=total(buys,'qty'), sold=total(sells,'qty'), cost=total(buys,'value'), proceeds=total(sells,'value');
      const entryAt=buys.length ? Math.min(...buys.map(t=>Date.parse(t.at))) : NaN;
      const exitAt=sells.length ? Math.max(...sells.map(t=>Date.parse(t.at))) : NaN;
      const closed=shares>0 && sold===shares && buys.every(t=>t.status==='filled') && sells.every(t=>t.status==='filled');
      return {symbol,shares,sold,cost,entryPrice:shares ? cost/shares : null,
        exitPrice:sold ? proceeds/sold : null,proceeds,closed,
        realizedPl:closed ? proceeds-cost : null,
        heldSeconds:closed && Number.isFinite(exitAt-entryAt) && exitAt>=entryAt ? (exitAt-entryAt)/1000 : null,
        exitReason:closed && sells.every(t=>t.role==='protective_stop') ? 'Protective stop' : closed ? 'Recorded exit' : 'Not confirmed closed'};
    });
  }
  const api={books};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.WSLITradeDetails=api;
})(typeof window!=='undefined' ? window : globalThis);
