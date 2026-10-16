// Public allowlisted JSON only; no browser credential or gateway connection.
(function(root) {
  const local = ['localhost','127.0.0.1'].includes(root.location?.hostname);
  const paths = local ? ['data/paper.json'] : [
    'https://raw.githubusercontent.com/Hawkeeeman/wslitrade/main/data/paper.json', 'data/paper.json'];
  function valid(data) {
    const object=value=>value && typeof value==='object' && !Array.isArray(value);
    return object(data) && data.schemaVersion===2 && data.scope==='wsli_paper_pilot' &&
      object(data.account) && data.account.paper===true &&
      ['trial','market','progress','publication'].every(key=>object(data[key])) &&
      ['positions','trades','activity','reviews'].every(key=>Array.isArray(data[key]) && data[key].every(object)) &&
      Array.isArray(data.progress.candidates);
  }
  async function load() {
    const candidates=await Promise.all(paths.map(async path=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6000);
      try {
        const res=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
        if (!res.ok) throw new Error('unavailable');
        const data=await res.json();
        const at=Date.parse(data?.updatedAt);
        if (!valid(data) || !Number.isFinite(at) || at>Date.now()+300000)
          throw new Error('Wrong, incomplete or future-dated feed');
        return data;
      } catch { return null; /* Preserve timestamps; never fabricate evidence. */ }
      finally { clearTimeout(timer); }
    }));
    // Either CDN can lag. A valid-but-older first response is not authoritative.
    const available=candidates.filter(Boolean);
    if (available.length) return available.reduce((newest,data)=>
      Date.parse(data.updatedAt)>Date.parse(newest.updatedAt) ? data : newest);
    throw new Error('Paper progress feed unavailable');
  }
  root.WSLIPaperFeed={load,valid};
})(typeof window!=='undefined' ? window : globalThis);
