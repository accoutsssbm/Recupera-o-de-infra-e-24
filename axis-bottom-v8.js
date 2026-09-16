(()=>{
'use strict';
const RE=/^(?:MA|TT)\d+\s+(\d{2}\/\d{2})$/;
function fix(){
  const svg=document.querySelector('#globalChart svg.chart');
  if(!svg)return;
  const vb=svg.viewBox&&svg.viewBox.baseVal;if(!vb||!vb.height)return;
  const found=[];
  [...svg.querySelectorAll('text')].forEach(t=>{
    const m=(t.textContent||'').trim().match(RE);
    if(m)found.push({t,date:m[1],x:parseFloat(t.getAttribute('x'))||0});
  });
  if(!found.length)return;
  const unique=new Map();
  found.forEach(e=>{if(unique.has(e.date)){e.t.remove();return}unique.set(e.date,e)});
  [...unique.values()].sort((a,b)=>a.x-b.x).forEach((e,i)=>{
    e.t.textContent=e.date;
    e.t.setAttribute('text-anchor','middle');
    e.t.setAttribute('x',String(e.x-2));
    e.t.setAttribute('y',String(vb.height-28+(i%2)*10));
    e.t.setAttribute('font-size','8');
    e.t.setAttribute('fill','#666');
  });
}
let scheduled=false;
function queue(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;fix()})}
const obs=new MutationObserver(queue);
function start(){fix();obs.observe(document.body,{childList:true,subtree:true});setInterval(fix,1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
