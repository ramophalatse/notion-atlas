'use strict';
window.AtlasSync=(()=>{
  const endpoint='https://ramo-notion-atlas-sync.netlify.app/.netlify/functions/atlas-data';
  function valid(d){
    if(!Array.isArray(d?.nodes)||!Array.isArray(d.edges)||!Array.isArray(d.groups)||!Array.isArray(d.roots)||!Array.isArray(d.notes)||!d.reference||!Number.isFinite(Date.parse(d.capturedAt)))return false;
    const ids=new Set(d.nodes.map(n=>n.id)),groups=new Set(d.groups.map(g=>g.id));
    return ids.size===d.nodes.length&&d.nodes.every(n=>typeof n.title==='string'&&groups.has(n.group)&&(!n.url||/^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/.test(n.url)))&&d.roots.every(id=>ids.has(id))&&d.edges.every(e=>ids.has(e.source)&&ids.has(e.target)&&['reference','relation'].includes(e.type));
  }
  function start({onData,onStatus}){
    let timer,busy=false,signature='';
    async function check(){
      if(busy||document.hidden)return;
      busy=true;clearTimeout(timer);
      try{
        const r=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(20000)});
        if(!r.ok)throw new Error('Sync unavailable');
        const d=await r.json();if(!valid(d))throw new Error('Invalid map');
        const nextSignature=JSON.stringify([d.nodes,d.edges,d.roots,d.groups,d.notes,d.coverage]);
        if(nextSignature!==signature){onData(d);signature=nextSignature;}
        const checked=Date.parse(d.sync?.checkedAt),stale=!Number.isFinite(checked)||Date.now()-checked>8*60000||d.sync?.status!=='connected';
        const time=Number.isFinite(checked)?new Intl.DateTimeFormat('en-ZA',{hour:'2-digit',minute:'2-digit'}).format(checked):'unknown';
        onStatus(`${stale?'Sync delayed':'Updates connected'} · Checked ${time}`);
      }catch{onStatus('Sync unavailable · Showing saved map');}
      finally{busy=false;timer=setTimeout(check,15000);}
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else check()});
    window.addEventListener('online',check);onStatus('Connecting to Notion updates…');check();
  }
  return {start,valid};
})();
