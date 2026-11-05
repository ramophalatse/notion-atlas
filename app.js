'use strict';
(() => {
  let D=window.ATLAS_DATA;
  const $=id=>document.getElementById(id), N=new Map(D.nodes.map(n=>[n.id,n])), G=new Map(D.groups.map(g=>[g.id,g]));
  const views={rings:['Structure in rings','Entry points inside. Databases, pages and views around them.'],circle:['One workspace. One circle.','Every object on the edge. Connections run through the centre.'],areas:['Systems, grouped by area','Area assignments help you navigate this snapshot.'],links:['Follow the connections','Select an object to highlight its direct references and relations.'],timeline:['Last edited, where available','Uses available edit dates. Undated objects stay separate.'],orbit:['A different perspective','Drag to rotate. Scroll to zoom. Select a dot to inspect.']};
  const canvas=$('map'),ctx=canvas.getContext('2d'), reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let view='rings',area='all',query='',selected=null,hover=null,labels=false,directory=false,showRelations=true,showOutside=false,zoom=1,pan={x:0,y:0},drag=null,rotation=.3,tilt=.25,raf=0,w=0,h=0,positions=new Map(),visible=[],visibleEdges=[],drawn=[],theme={};
  const adjacency=new Map(D.nodes.map(n=>[n.id,[]]));
  D.edges.forEach(e=>{adjacency.get(e.source)?.push(e);if(e.source!==e.target)adjacency.get(e.target)?.push(e)});
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
  const colour=id=>`oklch(${theme.L} ${theme.C} ${G.get(id)?.hue||158})`;
  function setHue(e,id){e.style.setProperty('--hue',`oklch(var(--L) var(--C) ${G.get(id)?.hue||158})`)}
  function palette(){const css=getComputedStyle(document.documentElement);theme=Object.fromEntries(['text','muted','line','strong','accent','bg','card'].map(k=>[k,css.getPropertyValue('--'+k).trim()]));theme.L=css.getPropertyValue('--L').trim();theme.C=css.getPropertyValue('--C').trim();$('theme').setAttribute('aria-label',`Switch to ${document.documentElement.dataset.theme==='dark'?'light':'dark'} theme`)}
  function btn(text,fn,cls){const b=el('button',cls,text);b.type='button';b.onclick=fn;return b}
  function date(s){return s?new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'short',year:'numeric'}).format(new Date(s)):'Not available'}
  function metadata(){
    $('capture-date').textContent=date(D.capturedAt);$('total-nodes').textContent=D.nodes.filter(n=>n.kind!=='external').length;$('total-links').textContent=D.edges.length;$('total-areas').textContent=String(D.groups.filter(g=>D.nodes.some(n=>n.group===g.id&&n.kind!=='external')).length).padStart(2,'0');$('coverage').textContent=D.coverage;$('outside-count').textContent=D.nodes.filter(n=>n.kind==='external').length;
    $('notes').replaceChildren();D.notes.forEach(t=>$('notes').append(el('li','',t)));$('reference').href=D.reference.url;
  }
  metadata();
  for(const [id] of Object.entries(views)){const b=btn(id==='orbit'?'3D orbit':id[0].toUpperCase()+id.slice(1),()=>setView(id));b.dataset.view=id;b.setAttribute('aria-pressed',String(id===view));$('views').append(b)}
  function renderAreas(){
    $('areas').replaceChildren();const all=btn('All areas',()=>filterArea('all'));all.setAttribute('aria-pressed',String(area==='all'));$('areas').append(all);
    D.groups.forEach(g=>{const count=D.nodes.filter(n=>n.group===g.id&&n.kind!=='external').length;const b=btn('',()=>filterArea(g.id));setHue(b,g.id);b.append(el('i','swatch'),el('span','',g.title),el('span','',count));b.setAttribute('aria-pressed',String(area===g.id));$('areas').append(b)})
  }
  function renderEntries(){
    $('entry-list').replaceChildren();D.roots.forEach(id=>{const n=N.get(id);if(area!=='all'&&n.group!==area)return;const b=btn('',()=>select(id),'entry'+(selected===id?' selected':''));setHue(b,n.group);b.append(el('i'),el('span','',n.title));$('entry-list').append(b)})
  }
  function filterArea(id){area=id;selected=null;hover=null;pan={x:0,y:0};zoom=1;renderAreas();renderEntries();details();update()}
  function matches(n){return (showOutside||n.kind!=='external')&&(area==='all'||n.group===area)&&(!query||n.title.toLocaleLowerCase().includes(query))}
  function update(){
    visible=D.nodes.filter(matches);const ids=new Set(visible.map(n=>n.id));visibleEdges=D.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&(showRelations||e.type!=='relation'));
    if(selected&&!ids.has(selected)){selected=null;details();renderEntries()}
    $('visible-count').textContent=`${visible.length} objects · ${visibleEdges.length} links`;$('empty').hidden=visible.length>0;$('zoom-value').textContent=Math.round(zoom*100)+'%';
    layout();renderDirectory();requestDraw()
  }
  function renderDirectory(){
    $('directory-list').replaceChildren();[...visible].sort((a,b)=>a.title.localeCompare(b.title)).forEach(n=>{const b=btn('',()=>select(n.id),'directory-item');setHue(b,n.group);b.append(el('i'),document.createTextNode(n.title),el('small','',`${G.get(n.group).title} / ${n.kind==='entry'?'entry point':n.kind}`));$('directory-list').append(b)})
  }
  function select(id){selected=id;hover=null;details();renderEntries();$('selection-status').textContent=N.get(id).title;requestDraw()}
  function details(){
    const box=$('details');box.replaceChildren();
    if(!selected){box.append(el('p','eyebrow','Your workspace, connected'),el('h2','',"Start with a connection."),el('div','intro-number',String(D.roots.length)),el('p','','entry points into my Notion workspace.'),el('p','instruction','Choose an area. Select a dot. Follow the links.'),el('p','tip','The Directory gives you the same map as a searchable list. Every source link opens in Notion.'));return}
    const n=N.get(selected);const kind=el('span','node-kind');setHue(kind,n.group);kind.append(el('i'),document.createTextNode(`${G.get(n.group).title} / ${n.kind==='entry'?'Entry point':n.kind}`));box.append(kind,el('h2','',n.title));
    if(n.url){const a=el('a','open-link','Open in Notion ↗');a.href=n.url;a.target='_blank';a.rel='noopener noreferrer';box.append(a)}
    const facts=el('div','facts');for(const [k,v] of [['Evidence',n.evidence],['Source',n.status],['Last edited',n.edited?date(n.edited):null]]){if(!v)continue;const row=el('div');row.append(el('span','',k),el('strong','',v));facts.append(row)}box.append(facts);
    const edges=adjacency.get(selected)||[],known=new Map();edges.forEach(e=>{const id=e.source===selected?e.target:e.source;if(!known.has(id))known.set(id,[]);known.get(id).push(e)});
    box.append(el('p','eyebrow',`${known.size} connected objects`));const list=el('div','connections');
    [...known].sort((a,b)=>N.get(a[0]).title.localeCompare(N.get(b[0]).title)).forEach(([id,ee])=>{const dest=N.get(id),b=btn('',()=>{if(dest.kind==='external'&&!showOutside){showOutside=true;$('outside').checked=true}if(area!=='all'&&dest.group!==area){area='all';renderAreas()}if(query){query='';$('search').value=''}update();select(id)},'connection');b.append(document.createTextNode(dest.title),el('small','',ee.map(e=>`${e.type==='relation'?'↔':'→'} ${e.label}`).join(' · ')));list.append(b)});box.append(list);
    if(n.kind==='external')box.append(el('p','tip','This target is named in a relation schema. It was not fetched for this snapshot. Its access and migration status are unknown.'));
    if(!n.edited)box.append(el('p','tip','No edit date was returned for this object.'));
  }
  function setView(id){view=id;pan={x:0,y:0};zoom=1;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));$('view-caption').textContent=views[id][0];$('view-help').textContent=id==='timeline'?views[id][1]:id==='orbit'?views[id][1]:'Select a dot to explore · Drag to pan · Scroll to zoom';update()}
  function layout(){
    positions=new Map();const groups=D.groups.filter(g=>visible.some(n=>n.group===g.id));const scale=Math.max(.2,Math.min(w/680,h/600));const entries=visible.filter(n=>n.kind==='entry');
    if(view==='circle'){const sorted=[...visible].sort((a,b)=>D.groups.findIndex(g=>g.id===a.group)-D.groups.findIndex(g=>g.id===b.group));sorted.forEach((n,i)=>{const a=i/sorted.length*Math.PI*2-Math.PI/2;positions.set(n.id,{x:Math.cos(a)*235,y:Math.sin(a)*235})})}
    else if(view==='rings'){
      groups.forEach((g,gi)=>{const sector=2*Math.PI/groups.length, start=gi*sector-Math.PI/2;const tiers=[visible.filter(n=>n.group===g.id&&n.kind==='entry'),visible.filter(n=>n.group===g.id&&n.kind==='database'),visible.filter(n=>n.group===g.id&&!['entry','database'].includes(n.kind))];tiers.forEach((ns,t)=>ns.forEach((n,i)=>{const rows=t===0?1:t===1?3:4;const col=Math.floor(i/rows),cols=Math.ceil(ns.length/rows),a=start+sector*(.10+.8*(col+.5)/Math.max(1,cols));const r=[83,140,208][t]+i%rows*13;positions.set(n.id,{x:Math.cos(a)*r,y:Math.sin(a)*r})}))})
    }else if(view==='areas'){
      const cols=groups.length>4?4:Math.min(3,groups.length),rows=Math.ceil(groups.length/cols);groups.forEach((g,gi)=>{const cx=(gi%cols-(cols-1)/2)*150,cy=(Math.floor(gi/cols)-(rows-1)/2)*220;const ns=visible.filter(n=>n.group===g.id);ns.forEach((n,i)=>{const a=i*2.399963,r=12*Math.sqrt(i);positions.set(n.id,{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r})})})
    }else if(view==='timeline'){
      const buckets=[...new Set(visible.filter(n=>n.edited).map(n=>n.edited.slice(0,7)))].sort();buckets.push('Undated');const gap=Math.min(135,560/Math.max(1,buckets.length-1));buckets.forEach((b,bi)=>{const ns=visible.filter(n=>(n.edited?.slice(0,7)||'Undated')===b);ns.forEach((n,i)=>positions.set(n.id,{x:(bi-(buckets.length-1)/2)*gap+(i%7-3)*12,y:-180+Math.floor(i/7)*17}))})
    }else if(view==='links'){
      visible.forEach((n,i)=>{const gi=groups.findIndex(g=>g.id===n.group),a=gi/groups.length*2*Math.PI;positions.set(n.id,{x:Math.cos(a)*175+Math.cos(i*2.39996)*Math.sqrt(i%30)*10,y:Math.sin(a)*175+Math.sin(i*2.39996)*Math.sqrt(i%30)*10})});
      for(let iter=0;iter<100;iter++){
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=positions.get(visible[i].id),b=positions.get(visible[j].id),dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,dx*dx+dy*dy);if(d<13000){const f=Math.min(1,45/d);a.x-=dx*f;a.y-=dy*f;b.x+=dx*f;b.y+=dy*f}}
        visibleEdges.forEach(e=>{const a=positions.get(e.source),b=positions.get(e.target),dx=b.x-a.x,dy=b.y-a.y;const f=e.type==='reference'?.003:.0005;a.x+=dx*f;a.y+=dy*f;b.x-=dx*f;b.y-=dy*f});
        for(const n of visible){const p=positions.get(n.id),gi=groups.findIndex(g=>g.id===n.group),a=gi/groups.length*Math.PI*2;p.x+=(Math.cos(a)*170-p.x)*.018;p.y+=(Math.sin(a)*170-p.y)*.018}
      }
    }else if(view==='orbit'){
      visible.forEach((n,i)=>{const y=1-2*(i+.5)/visible.length,r=Math.sqrt(1-y*y),a=i*2.399963;positions.set(n.id,{x:Math.cos(a)*r*220,y:y*220,z:Math.sin(a)*r*220})})
    }
    positions.forEach(p=>{p.x*=scale;p.y*=scale;if(p.z!==undefined)p.z*=scale});
  }
  function project(p){let x=p.x,y=p.y,z=p.z||0;if(view==='orbit'){const xx=x*Math.cos(rotation)+z*Math.sin(rotation);z=-x*Math.sin(rotation)+z*Math.cos(rotation);x=xx;const yy=y*Math.cos(tilt)-z*Math.sin(tilt);z=y*Math.sin(tilt)+z*Math.cos(tilt);y=yy;const perspective=650/(650+z);x*=perspective;y*=perspective}return{x:w/2+x*zoom+pan.x,y:h/2+y*zoom+pan.y+5,z}}
  function pathShape(x,y,r,kind){ctx.beginPath();if(kind==='entry'){for(let j=0;j<6;j++){const a=Math.PI/3*j-Math.PI/6;const xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r;j?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}ctx.closePath()}else if(kind==='database'){ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath()}else if(kind==='view'){ctx.rect(x-r*.8,y-r*.8,r*1.6,r*1.6)}else ctx.arc(x,y,r,0,Math.PI*2)}
  function draw(){
    ctx.clearRect(0,0,w,h);drawn=[];const focus=hover||selected,adj=focus?new Set((adjacency.get(focus)||[]).flatMap(e=>[e.source,e.target])):null;
    if(view==='rings'||view==='circle'||view==='orbit'){
      const s=Math.max(.2,Math.min(w/680,h/600));ctx.save();ctx.strokeStyle=theme.line;ctx.lineWidth=1;
      for(const r of (view==='rings'?[103,190,260]:[248])){ctx.beginPath();ctx.ellipse(w/2+pan.x,h/2+pan.y+5,r*s*zoom,r*s*zoom*(view==='orbit'?.38:1),0,0,Math.PI*2);ctx.stroke()}ctx.restore();
    }
    ctx.save();ctx.lineWidth=.6;
    for(const e of visibleEdges){if(e.source===e.target)continue;const a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)continue;const p=project(a),q=project(b),active=focus&&(e.source===focus||e.target===focus);ctx.globalAlpha=focus?(active?.8:.025):(view==='links'?.24:.11);ctx.strokeStyle=colour(N.get(e.source).group);ctx.lineWidth=active?1.25:.65;ctx.setLineDash(e.type==='relation'?[2,4]:[]);ctx.beginPath();ctx.moveTo(p.x,p.y);if(view==='circle')ctx.quadraticCurveTo(w/2+pan.x,h/2+pan.y,q.x,q.y);else ctx.lineTo(q.x,q.y);ctx.stroke()}
    ctx.restore();
    const ns=visible.map(n=>({n,p:project(positions.get(n.id))})).sort((a,b)=>b.p.z-a.p.z);
    for(const {n,p} of ns){const active=n.id===focus,related=!focus||adj?.has(n.id)||active;const r=(n.kind==='entry'?7:n.kind==='database'?4.5:3.3)*Math.min(1.5,Math.max(.8,zoom));ctx.save();ctx.globalAlpha=related?(view==='orbit'?Math.max(.3,1-(p.z+220)/800):1):.16;ctx.fillStyle=colour(n.group);ctx.strokeStyle=colour(n.group);ctx.lineWidth=1.3;
      if(active){ctx.beginPath();ctx.arc(p.x,p.y,r+6,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.12;ctx.beginPath();ctx.arc(p.x,p.y,r+13,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
      pathShape(p.x,p.y,r,n.kind);if(n.kind==='view'||n.kind==='external')ctx.stroke();else ctx.fill();
      if(labels||active||(area!=='all'&&n.kind==='entry')){ctx.font=`${active?'600':'400'} 10px "Hanken Grotesk", sans-serif`;const title=n.title.length>35?n.title.slice(0,33)+'…':n.title;const tw=ctx.measureText(title).width,tx=p.x>w-160?p.x-r-tw-7:p.x+r+7;ctx.globalAlpha=related?1:.25;ctx.fillStyle=theme.bg;ctx.fillRect(tx-2,p.y-9,tw+4,15);ctx.fillStyle=theme.text;ctx.textBaseline='middle';ctx.fillText(title,tx,p.y)}
      ctx.restore();drawn.push({...p,r,id:n.id})
    }
    if(['rings','circle','orbit'].includes(view)&&!focus){ctx.save();ctx.textAlign='center';ctx.fillStyle=theme.text;ctx.font='800 14px Sora, sans-serif';ctx.fillText('Ramo',w/2+pan.x,h/2+pan.y+1);ctx.fillStyle=theme.muted;ctx.font='8px "JetBrains Mono",monospace';ctx.fillText('NOTION',w/2+pan.x,h/2+pan.y+17);ctx.restore()}
    drawGroupLabels();
    $('zoom-value').textContent=Math.round(zoom*100)+'%';
  }
  function drawGroupLabels(){
    if(!['rings','circle','areas','timeline'].includes(view))return;const groups=D.groups.filter(g=>visible.some(n=>n.group===g.id));ctx.save();ctx.textAlign='center';ctx.font='9px "JetBrains Mono",monospace';ctx.fillStyle=theme.muted;const s=Math.max(.2,Math.min(w/680,h/600));
    if(view==='timeline'){const bs=[...new Set(visible.filter(n=>n.edited).map(n=>n.edited.slice(0,7)))].sort();bs.push('Undated');const gap=Math.min(135,560/Math.max(1,bs.length-1));bs.forEach((b,i)=>{const p=project({x:(i-(bs.length-1)/2)*gap*s,y:-210*s});ctx.fillText(b,p.x,p.y)})}
    else groups.forEach((g,i)=>{let x,y;if(view==='areas'){const cols=groups.length>4?4:Math.min(3,groups.length),rows=Math.ceil(groups.length/cols);x=(i%cols-(cols-1)/2)*150;y=(Math.floor(i/cols)-(rows-1)/2)*220-95}else{const a=(i+.5)/groups.length*Math.PI*2-Math.PI/2;x=Math.cos(a)*285;y=Math.sin(a)*285}const p=project({x:x*s,y:y*s});ctx.fillText(g.title.toUpperCase(),p.x,p.y)});ctx.restore()
  }
  function tick(){raf=0;if(view==='orbit'&&!reduce.matches&&!document.hidden&&!directory){if(!drag)rotation+=.0018;draw();raf=requestAnimationFrame(tick)}}
  function requestDraw(){if(raf)cancelAnimationFrame(raf);raf=0;draw();if(view==='orbit'&&!reduce.matches&&!document.hidden&&!directory)raf=requestAnimationFrame(tick)}
  function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);layout();requestDraw()}
  function hit(x,y){return [...drawn].reverse().filter(p=>Math.hypot(p.x-x,p.y-y)<Math.max(12,p.r+5)).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]?.id||null}
  function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{const p=point(e);drag={...p,startX:p.x,startY:p.y,moved:false};canvas.setPointerCapture(e.pointerId);$('tooltip').hidden=true});
  canvas.addEventListener('pointermove',e=>{const p=point(e);if(drag){const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(p.x-drag.startX,p.y-drag.startY)>4)drag.moved=true;if(view==='orbit'){rotation+=dx*.008;tilt=Math.max(-1.2,Math.min(1.2,tilt+dy*.008))}else{pan.x+=dx;pan.y+=dy}drag.x=p.x;drag.y=p.y;requestDraw();return}const id=hit(p.x,p.y);canvas.style.cursor=id?'pointer':'grab';if(id!==hover){hover=id;requestDraw()}const tip=$('tooltip');tip.hidden=!id;if(id){tip.textContent=N.get(id).title;tip.style.left=Math.max(8,Math.min(w-225,p.x+13))+'px';tip.style.top=Math.max(45,Math.min(h-60,p.y+15))+'px'}});
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const p=point(e),id=hit(p.x,p.y);if(id)select(id);else{selected=null;details();renderEntries();requestDraw()}}drag=null});canvas.addEventListener('pointercancel',()=>{drag=null});canvas.addEventListener('pointerleave',()=>{hover=null;$('tooltip').hidden=true;requestDraw()});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.35,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));requestDraw()},{passive:false});
  canvas.addEventListener('keydown',e=>{if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(e.key==='0'){zoom=1;pan={x:0,y:0}}else if(e.key==='-'||e.key==='+'||e.key==='=')zoom=Math.max(.35,Math.min(4,zoom*(e.key==='-'?.85:1.15)));else{pan.x+=e.key==='ArrowRight'?25:e.key==='ArrowLeft'?-25:0;pan.y+=e.key==='ArrowDown'?25:e.key==='ArrowUp'?-25:0}requestDraw()}});
  $('search').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase();update()});
  $('theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('ramo-theme',t)}catch{}palette();requestDraw()};
  $('labels').onclick=()=>{labels=!labels;$('labels').setAttribute('aria-pressed',String(labels));requestDraw()};
  $('directory-toggle').onclick=()=>{directory=!directory;$('directory').hidden=!directory;canvas.hidden=directory;$('directory-toggle').setAttribute('aria-pressed',String(directory));if(!directory)resize();else requestDraw()};
  $('relations').onchange=e=>{showRelations=e.target.checked;update()};$('outside').onchange=e=>{showOutside=e.target.checked;update()};
  $('fit').onclick=()=>{zoom=1;pan={x:0,y:0};rotation=.3;tilt=.25;requestDraw()};$('zoom-in').onclick=()=>{zoom=Math.min(4,zoom*1.2);requestDraw()};$('zoom-out').onclick=()=>{zoom=Math.max(.35,zoom/1.2);requestDraw()};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('explore').requestFullscreen()}catch{$('selection-status').textContent='Full screen is unavailable in this browser.'}};
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Enter full screen');resize()});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus()}if(e.key==='Escape'){selected=null;details();renderEntries();requestDraw()}});
  document.addEventListener('visibilitychange',requestDraw);reduce.addEventListener('change',requestDraw);new ResizeObserver(resize).observe(canvas);
  palette();renderAreas();renderEntries();details();resize();update();
  window.AtlasSync?.start({
    onData(next){
      D=next;window.ATLAS_DATA=next;N.clear();G.clear();adjacency.clear();
      D.nodes.forEach(n=>{N.set(n.id,n);adjacency.set(n.id,[])});D.groups.forEach(g=>G.set(g.id,g));
      D.edges.forEach(e=>{adjacency.get(e.source).push(e);if(e.source!==e.target)adjacency.get(e.target).push(e)});
      if(selected&&!N.has(selected))selected=null;if(area!=='all'&&!G.has(area))area='all';hover=null;$('tooltip').hidden=true;
      $('selection-status').textContent=selected?N.get(selected).title:'Map updated from Notion';
      metadata();renderAreas();renderEntries();details();update();
    },
    onStatus(text){$('sync-status').textContent=text;$('sync-header').textContent=text;}
  });
})();
