import { promises as fs } from 'node:fs';

import type { OverlayRouteHandler } from '../../main/overlay-server.js';
import type { LiveOutputsService } from './live-outputs-service.js';

export function createLiveOutputsOverlayHandler(service: LiveOutputsService): OverlayRouteHandler {
  return async (_request, response, url) => {
    if (url.pathname === '/live-outputs/live-output.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(LIVE_OUTPUT_CSS);
      return true;
    }
    if (url.pathname === '/live-outputs/live-output.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(LIVE_OUTPUT_JS);
      return true;
    }
    const match = url.pathname.match(/^\/live-outputs\/([A-Za-z0-9_-]+)(?:\/(state|artwork))?\/?$/);
    if (!match) return false;
    const id = match[1];
    const action = match[2] ?? 'page';
    const snapshot = service.getOutputSnapshot(id);
    if (!snapshot) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Live output not found' }));
      return true;
    }
    if (action === 'state') {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      response.end(JSON.stringify(snapshot));
      return true;
    }
    if (action === 'artwork') {
      const artwork = snapshot.artifacts.find((artifact) => artifact.id === 'artwork')?.absolutePath;
      if (!artwork) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Artwork is unavailable');
        return true;
      }
      try {
        const image = await fs.readFile(artwork);
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        response.end(image);
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Artwork is unavailable');
      }
      return true;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(renderLiveOutputHtml(id));
    return true;
  };
}

function renderLiveOutputHtml(id: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live output</title><link rel="stylesheet" href="/live-outputs/live-output.css"></head>
<body data-output-id="${id}"><main id="card"><img id="artwork" alt=""><section><div id="text"></div><div id="source"></div><div id="progress"><span></span></div></section></main>
<script src="/live-outputs/live-output.js"></script></body></html>`;
}

const LIVE_OUTPUT_CSS = `
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}body{display:flex;align-items:center;justify-content:center;padding:12px}#card{display:flex;align-items:center;gap:18px;max-width:100%;padding:18px 22px;background:rgba(17,24,39,.8);border:1px solid #374151;border-radius:12px;color:#f9fafb;font-size:28px;white-space:pre-wrap;overflow-wrap:anywhere}#artwork{display:none;width:112px;height:112px;object-fit:cover;border-radius:10px}#card.artwork-left #artwork,#card.artwork-right #artwork{display:block}#card.artwork-right{flex-direction:row-reverse}#source{margin-top:6px;font-size:.55em;opacity:.65}#progress{display:none;height:5px;margin-top:10px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden}#progress.visible{display:block}#progress span{display:block;width:0;height:100%;background:var(--accent,#22d3ee)}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const LIVE_OUTPUT_JS = `
(() => {
  const id=document.body.dataset.outputId;
  const card=document.getElementById('card'); const text=document.getElementById('text');
  const source=document.getElementById('source'); const artwork=document.getElementById('artwork');
  const progress=document.getElementById('progress'); const progressBar=progress.querySelector('span');
  function apply(snapshot){
    if(!snapshot)return; const details=snapshot.details||{}; const style=details.browserStyle||{};
    text.textContent=snapshot.renderedText||''; card.className=details.browserLayout||'text';
    if(style.backgroundColor){const opacity=style.backgroundOpacity??.8; const hex=style.backgroundColor.replace('#',''); const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16); card.style.backgroundColor='rgba('+r+','+g+','+b+','+opacity+')'}
    if(style.borderColor)card.style.borderColor=style.borderColor;if(style.borderWidth!==undefined)card.style.borderWidth=style.borderWidth+'px';
    if(style.borderRadius!==undefined)card.style.borderRadius=style.borderRadius+'px';if(style.fontColor)card.style.color=style.fontColor;
    if(style.fontSize)card.style.fontSize=style.fontSize+'px';if(style.fontFamily)card.style.fontFamily=style.fontFamily;
    if(style.accentColor)card.style.setProperty('--accent',style.accentColor);
    source.textContent=details.sourceLabel||'';
    const hasArtwork=snapshot.artifacts&&snapshot.artifacts.some(a=>a.id==='artwork'); artwork.style.display=hasArtwork&&details.browserLayout!=='compact'?'block':'';
    if(hasArtwork)artwork.src='/live-outputs/'+encodeURIComponent(id)+'/artwork?t='+encodeURIComponent(snapshot.updatedAt);
    const duration=Number(details.durationSeconds),position=Number(details.positionSeconds); const show=details.showProgress&&duration>0;
    progress.classList.toggle('visible',!!show); progressBar.style.width=show?Math.max(0,Math.min(100,position/duration*100))+'%':'0';
  }
  fetch('/live-outputs/'+encodeURIComponent(id)+'/state',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(apply).catch(()=>{});
  function connect(){const protocol=location.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(protocol+'//'+location.host+'/ws');
    ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'subscribe',topic:'live-output:'+id})));
    ws.addEventListener('message',event=>{try{const msg=JSON.parse(event.data);if(msg.topic==='live-output:'+id)apply(msg.payload)}catch{}});
    ws.addEventListener('close',()=>setTimeout(connect,1500));}
  connect();
})();
`;
