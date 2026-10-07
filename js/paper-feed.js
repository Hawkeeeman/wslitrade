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
    for (const path of paths) {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6000);
      try {
        const res=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store',credentials:'omit',signal:controller.signal});
        if (!res.ok) throw new Error('unavailable');
        const data=await res.json();
        if (!valid(data)) throw new Error('Wrong or incomplete feed');
        return data;
      } catch { /* Try packaged snapshot, preserving its original timestamps. */ }
      finally { clearTimeout(timer); }
    }
    throw new Error('Paper progress feed unavailable');
  }
  root.WSLIPaperFeed={load,valid};
})(typeof window!=='undefined' ? window : globalThis);
