// Eixo de datas responsivo e legível para a Curva S.
chart = function(n, mini=false){
  const w=mini?420:960, h=mini?132:220;
  const padL=mini?42:52, padR=mini?18:26, padT=18, padB=mini?40:52;
  const start=parseDate(SCHEDULE?.chart_start||'2026-09-16');
  const end=parseDate(SCHEDULE?.chart_end||'2026-11-10');
  const span=Math.max(1,end-start);
  const x=d=>padL+((d-start)/span)*(w-padL-padR);
  const y=p=>padT+(100-p)/100*(h-padT-padB);
  const plan=buildSeries(n,'plan'), real=buildSeries(n,'real');
  const pv=plan.length?plan[plan.length-1].pct:0;
  const rv=units(n==='Geral'?operational():acts(n)).pct;
  let today=new Date(); if(today<start)today=start; if(today>end)today=end;
  const close=n==='Geral'?SCHEDULE?.overall?.cycle_close:scheduleGroup(n)?.cycle_close;
  const pend=n==='Geral'?(SCHEDULE?.overall?.pending||[]):(scheduleGroup(n)?.pending||[]);

  // Curva principal: 5 datas. Mini-curvas: 3 datas.
  const tickCount=mini?3:5;
  const ticks=Array.from({length:tickCount},(_,i)=>new Date(start.getTime()+span*(i/(tickCount-1))));
  const gridTicks=ticks.map(d=>`<line x1="${x(d)}" y1="${padT}" x2="${x(d)}" y2="${h-padB}" stroke="#ececef" stroke-width="1"/>`).join('');
  const dateLabels=ticks.map((d,i)=>{
    const label=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    const anchor=i===0?'start':i===ticks.length-1?'end':'middle';
    return `<text x="${x(d)}" y="${h-12}" text-anchor="${anchor}" fill="#5f6368" font-size="${mini?10:12}" font-weight="700">${label}</text>`;
  }).join('');

  return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:10px;color:#707177;margin:2px 0 5px"><span><i style="display:inline-block;width:18px;border-top:2px dashed #a6a8ac;margin-right:4px;vertical-align:middle"></i>Programação ${pv}%</span><span><i style="display:inline-block;width:18px;border-top:3px solid var(--g);margin-right:4px;vertical-align:middle"></i>Execução ${rv}%</span><span>${close?'Fechamento '+fmtDate(close):(pend.length?'Fechamento pendente: '+pend.join(', '):'')}</span></div><svg class="${mini?'miniChart':'chart'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Curva S de programação e execução"><line class="grid" x1="${padL}" y1="${y(0)}" x2="${w-padR}" y2="${y(0)}"/><line class="grid" x1="${padL}" y1="${y(50)}" x2="${w-padR}" y2="${y(50)}"/><line class="grid" x1="${padL}" y1="${y(100)}" x2="${w-padR}" y2="${y(100)}"/>${gridTicks}<path class="plan" d="${pathStep(plan,x,y)}"/><path class="real" d="${pathStep(real,x,y)}"/><line class="today" x1="${x(today)}" y1="${padT-4}" x2="${x(today)}" y2="${h-padB+3}"/><text x="${padL-8}" y="${y(0)+4}" text-anchor="end" fill="#666" font-size="${mini?9:11}" font-weight="700">0%</text><text x="${padL-8}" y="${y(50)+4}" text-anchor="end" fill="#666" font-size="${mini?9:11}" font-weight="700">50%</text><text x="${padL-8}" y="${y(100)+4}" text-anchor="end" fill="#666" font-size="${mini?9:11}" font-weight="700">100%</text>${dateLabels}</svg>`;
};
