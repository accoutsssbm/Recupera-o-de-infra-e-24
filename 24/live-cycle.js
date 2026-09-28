(()=>{
const SU='https://iiumknzkjhiwtevpyavm.supabase.co',KEY='sb_publishable_QnC0_AuecV4bhv4pzterwQ_W-Fl-ptc',PROJ='salobo-infra-v6',API=SU+'/rest/v1/project_execution_items';
let D=null,SC=null,ST=new Map(),UP=new Map();
const STATUS_API=SU+'/rest/v1/project_brake_position_status';
const STATUS_OPTIONS=[
 {value:'UNCONFIRMED',label:'A confirmar',tone:'gray'},
 {value:'NORMAL',label:'Normal / substituído',tone:'green'},
 {value:'INSPECTION',label:'Inspeção requerida',tone:'amber'},
 {value:'CRITICAL',label:'Crítico',tone:'red'}
];
const statusInfo=value=>STATUS_OPTIONS.find(x=>x.value===value)||STATUS_OPTIONS[0];
function tintMarker(marker,value){
 if(!marker)return;
 marker.classList.remove('green','amber','red','gray');
 marker.classList.add(statusInfo(value).tone);
 marker.title=marker.textContent.trim()+' — '+statusInfo(value).label;
}
function installBrakePositionEditors(){
 const card=[...document.querySelectorAll('section.card')].find(x=>(x.querySelector('h2')?.textContent||'').includes('Condição dos freios por máquina'));
 if(!card)return;
 const strip=card.querySelector('.machine-strip');
 if(!strip)return;
 if(!document.getElementById('brakeConditionsSync')){
  const sync=document.createElement('div');
  sync.id='brakeConditionsSync';
  sync.className='brake-conditions-sync';
  sync.textContent='Conectando status compartilhados…';
  strip.before(sync);
 }
 [...strip.querySelectorAll('.machine-card')].forEach(machine=>{
  if(machine.querySelector('.brake-position-editors'))return;
  const tag=machine.querySelector('.machine-head b')?.textContent.trim();
  if(!tag)return;
  const editor=document.createElement('div');
  editor.className='brake-position-editors';
  const heading=document.createElement('div');
  heading.className='brake-position-heading';
  heading.textContent='Status por posição';
  editor.appendChild(heading);
  [...machine.querySelectorAll('.machine-schematic .brake-marker')].forEach(marker=>{
   const code=['de','dd','te','td'].find(x=>marker.classList.contains(x))?.toUpperCase();
   if(!code)return;
   const initial=marker.classList.contains('red')?'CRITICAL':marker.classList.contains('amber')?'INSPECTION':marker.classList.contains('green')?'NORMAL':'UNCONFIRMED';
   const label=document.createElement('label');
   label.className='brake-position-control';
   const name=document.createElement('span');
   name.textContent=code;
   label.appendChild(name);
   const select=document.createElement('select');
   select.className='brake-position-select '+statusInfo(initial).tone;
   select.dataset.machineTag=tag;
   select.dataset.positionCode=code;
   select.dataset.savedStatus=initial;
   select._marker=marker;
   select.setAttribute('aria-label','Status '+tag+' '+code);
   select.title='Status do freio '+tag+' '+code;
   select.innerHTML=STATUS_OPTIONS.map(x=>'<option value="'+x.value+'">'+x.label+'</option>').join('');
   select.value=initial;
   select.addEventListener('change',()=>saveBrakePositionStatus(select));
   label.appendChild(select);
   editor.appendChild(label);
  });
  machine.insertBefore(editor,machine.querySelector('.leak'));
 });
}
function applyBrakePositionRows(rows){
 (rows||[]).forEach(row=>{
  const select=document.querySelector('select[data-machine-tag="'+row.machine_tag+'"][data-position-code="'+row.position_code+'"]');
  if(!select||select===document.activeElement||select.disabled||select.dataset.saving==='1')return;
  select.value=row.status;
  select.dataset.savedStatus=row.status;
  select.className='brake-position-select '+statusInfo(row.status).tone;
  tintMarker(select._marker,row.status);
 });
}
function timeText(){
 return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
async function saveBrakePositionStatus(select){
 const before=select.dataset.savedStatus||select.value;
 const next=select.value;
 const tag=select.dataset.machineTag;
 const position=select.dataset.positionCode;
 const sync=document.getElementById('brakeConditionsSync');
 select.disabled=true;
 select.dataset.saving='1';
 select.className='brake-position-select '+statusInfo(next).tone;
 tintMarker(select._marker,next);
 if(sync)sync.textContent='Salvando '+tag+' '+position+'…';
 try{
  const url=STATUS_API+'?project_key=eq.'+encodeURIComponent(PROJ)+'&machine_tag=eq.'+encodeURIComponent(tag)+'&position_code=eq.'+encodeURIComponent(position);
  const r=await fetch(url,{method:'PATCH',headers:{...hdr,Prefer:'return=representation'},body:JSON.stringify({status:next,updated_at:new Date().toISOString()})});
  if(!r.ok)throw Error('HTTP '+r.status);
  const saved=await r.json();
  if(!Array.isArray(saved)||!saved.length)throw Error('Nenhuma linha atualizada; verifique a permissão de gravação.');
  select.dataset.savedStatus=next;
  if(sync)sync.textContent='Status de '+tag+' '+position+' salvo e compartilhado · '+timeText();
 }catch(e){
  select.value=before;
  select.className='brake-position-select '+statusInfo(before).tone;
  tintMarker(select._marker,before);
  if(sync)sync.textContent='Falha ao salvar '+tag+' '+position+'; alteração desfeita.';
  console.warn('Falha ao salvar status do freio',tag,position,e);
 }finally{
  select.disabled=false;
  select.dataset.saving='0';
 }
}

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const groupOf=a=>{const r=norm((a.responsible||'')+' '+(a.front||''));if(a.id&&/^M\d+$/.test(a.id))return'Macro';if(r.includes('leonardo'))return'Leonardo';if(r.includes('kleber'))return'Kleber';return'Ligriarno'};
const pd=iso=>iso?new Date(iso+'T12:00:00'):null,fd=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'—';
function installUI(){if(document.getElementById('exec-program-card'))return;const st=document.createElement('style');st.textContent=`.live-curve{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 10px}.live-kpi{border:1px solid var(--line,#d6d9dc);padding:8px;background:#fafafa}.live-kpi span{display:block;font-size:9px;text-transform:uppercase;color:var(--muted,#5f666d);font-weight:800}.live-kpi b{display:block;font-size:17px;margin-top:4px}.exec-chart{width:100%;height:190px;display:block}.curve-grid{stroke:#e4e7e9;stroke-width:1}.curve-plan{fill:none;stroke:#8b9095;stroke-width:3;stroke-dasharray:7 5}.curve-real{fill:none;stroke:var(--green,#208449);stroke-width:4}.curve-today{stroke:var(--yellow,#ffcd11);stroke-width:3}.curve-axis{fill:#6b7176;font-size:10px}.curve-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:10px;color:var(--muted,#5f666d);margin:4px 0}.curve-leg i{display:inline-block;width:18px;margin-right:4px;vertical-align:middle}.curve-leg .p{border-top:2px dashed #8b9095}.curve-leg .r{border-top:3px solid var(--green,#208449)}@media(max-width:850px){.live-curve{grid-template-columns:repeat(2,1fr)}.exec-chart{height:165px}}`;document.head.appendChild(st);
 const posStyle=document.createElement('style');
 posStyle.textContent='.brake-conditions-sync{font-size:10px;font-weight:700;color:#555;padding:5px 2px}.brake-position-editors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:6px 0;border-top:1px solid #e2e4e5}.brake-position-heading{grid-column:1/-1;font-size:9px;color:#60656a;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.brake-position-control{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:4px;font-size:9px;font-weight:800}.brake-position-control select{width:100%;min-width:0;border:1px solid #c8cccf;border-left:4px solid #92979b;border-radius:4px;background:#fff;padding:4px 3px;font-size:8px;color:#222}.brake-position-control select.green{border-left-color:#18794e}.brake-position-control select.amber{border-left-color:#d99a00}.brake-position-control select.red{border-left-color:#c63d31}@media(max-width:700px){.brake-position-control select{font-size:8px}}';
 document.head.appendChild(posStyle);
 const sec=document.createElement('section');sec.className='card';sec.id='exec-program-card';sec.innerHTML=`<div class="section-head"><div><h2>Programação × execução — Motoniveladoras 24 / 24M</h2><div class="sub">A programação considera somente as máquinas do escopo do projeto e usa a primeira janela de parada prevista. A execução é calculada pelas ações/subações efetivamente baixadas nos apps e sincronizadas pela base compartilhada.</div></div><div id="brakeSync" class="sub" style="margin:0">Sincronizando execução…</div></div><div class="live-curve"><div class="live-kpi"><span>Execução atual</span><b id="brakeExecPct">—</b></div><div class="live-kpi"><span>Programação atingida</span><b id="brakePlanPct">—</b></div><div class="live-kpi"><span>Fechamento 1º ciclo</span><b id="brakeCycleClose">—</b></div><div class="live-kpi"><span>Última máquina do ciclo</span><b>MA85 · 06/11</b></div></div><div class="curve-leg"><span><i class="p"></i>Programação pelas janelas de parada</span><span><i class="r"></i>Execução real por ações/subações</span><span>Linha amarela = data atual</span></div><div id="brakeExecChart"></div>`;
 const target=[...document.querySelectorAll('section.card')].find(x=>(x.querySelector('h2')?.textContent||'').includes('Disponibilidade dos conjuntos de materiais'));
 if(target)target.before(sec);else(document.querySelector('main')||document.body).appendChild(sec);
 const link=document.createElement('link');link.rel='manifest';link.href='manifest.webmanifest?v=27';document.head.appendChild(link);if('serviceWorker'in navigator){let reloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload()});navigator.serviceWorker.register('sw.js?v=9',{updateViaCache:'none'}).catch(()=>{});}
}
function model(){const acts=D.actions.filter(a=>groupOf(a)==='Ligriarno'),by={};acts.forEach(a=>by[a.id]={a,subs:[]});D.subactions.forEach(x=>{if(by[x.action_id])by[x.action_id].subs.push(x)});return Object.values(by)}
function doneSub(s){return ST.get(s.id)==='DONE'}
function units(){let out=[];for(const x of model()){if(x.subs.length)x.subs.forEach(s=>out.push({id:s.id,a:x.a,s,done:doneSub(s)}));else out.push({id:x.a.id,a:x.a,s:null,done:ST.get(x.a.id)==='DONE'})}return out}
function tags(u){const known=SC.groups.Ligriarno.machines.map(m=>m.tag),txt=[u.s?.equipment,u.s?.number,u.s?.description,u.a.equipment,u.a.title].filter(Boolean).join(' ').toUpperCase();return known.filter(t=>txt.includes(t))}
function planDate(u){let ts=tags(u),g=SC.groups.Ligriarno;if(!ts.length)return g.cycle_close;let ds=ts.map(t=>g.machines.find(m=>m.tag===t)?.stop_date).filter(Boolean).sort();return ds.length===ts.length?ds[ds.length-1]:null}
function series(kind){const us=units(),tot=us.length,st=pd(SC.chart_start),en=pd(SC.chart_end);let ev=[];if(kind==='plan')us.forEach(u=>{let x=planDate(u);if(x)ev.push(pd(x))});else us.filter(u=>u.done).forEach(u=>{let x=UP.get(u.id)?new Date(UP.get(u.id)):new Date();if(x<st)x=st;ev.push(x)});ev=ev.filter(x=>x&&x<=en).sort((a,b)=>a-b);let pts=[{d:st,p:0}],n=0,i=0;while(i<ev.length){let d=ev[i],c=0;while(i<ev.length&&ev[i].toDateString()===d.toDateString()){c++;i++}n+=c;pts.push({d,p:tot?100*n/tot:0})}let endPoint=kind==='real'?new Date():en;if(endPoint>en)endPoint=en;if(endPoint<st)endPoint=st;if(pts[pts.length-1].d<endPoint)pts.push({d:endPoint,p:pts[pts.length-1].p});return {pts,tot,pct:tot?Math.round(100*n/tot):0}}
function render(){if(!D||!SC)return;const w=1180,h=190,L=42,R=14,T=14,B=26,st=pd(SC.chart_start),en=pd(SC.chart_end),span=en-st,x=d=>L+((d-st)/span)*(w-L-R),y=p=>T+(100-p)/100*(h-T-B),path=pts=>{let z=`M${x(pts[0].d)} ${y(pts[0].p)}`;for(let i=1;i<pts.length;i++)z+=` H${x(pts[i].d)} V${y(pts[i].p)}`;return z};const pl=series('plan'),re=series('real'),us=units(),realPct=us.length?Math.round(100*us.filter(u=>u.done).length/us.length):0;let today=new Date();if(today<st)today=st;if(today>en)today=en;const mid=new Date((st.getTime()+en.getTime())/2);document.getElementById('brakeExecPct').textContent=realPct+'%';document.getElementById('brakePlanPct').textContent=pl.pct+'%';document.getElementById('brakeCycleClose').textContent=fd(SC.groups.Ligriarno.cycle_close);document.getElementById('brakeExecChart').innerHTML=`<svg class="exec-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line class="curve-grid" x1="${L}" y1="${y(0)}" x2="${w-R}" y2="${y(0)}"/><line class="curve-grid" x1="${L}" y1="${y(100)}" x2="${w-R}" y2="${y(100)}"/><path class="curve-plan" d="${path(pl.pts)}"/><path class="curve-real" d="${path(re.pts)}"/><line class="curve-today" x1="${x(today)}" y1="${T-3}" x2="${x(today)}" y2="${h-B+3}"/><text class="curve-axis" x="4" y="${y(0)+4}">0%</text><text class="curve-axis" x="2" y="${y(100)+4}">100%</text><text class="curve-axis" x="${L}" y="${h-5}">${fd(SC.chart_start)}</text><text class="curve-axis" x="${x(mid)-20}" y="${h-5}">${mid.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text><text class="curve-axis" x="${w-55}" y="${h-5}">${fd(SC.chart_end)}</text></svg>`}
async function pull(){
 try{
  const r=await fetch(API+'?project_key=eq.'+encodeURIComponent(PROJ)+'&select=item_id,status,updated_at',{headers:{apikey:KEY},cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const rows=await r.json();
  ST=new Map(rows.map(x=>[x.item_id,x.status]));
  UP=new Map(rows.map(x=>[x.item_id,x.updated_at]));
  render();
  const executionSync=document.getElementById('brakeSync');
  if(executionSync)executionSync.textContent='Execução atualizada '+timeText();
 }catch(e){
  const executionSync=document.getElementById('brakeSync');
  if(executionSync)executionSync.textContent='Falha de sincronização da execução';
  console.warn('Falha na sincronização de execução',e);
 }
 try{
  const r=await fetch(STATUS_API+'?project_key=eq.'+encodeURIComponent(PROJ)+'&select=machine_tag,position_code,status,updated_at',{headers:{apikey:KEY},cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  applyBrakePositionRows(await r.json());
  const statusSync=document.getElementById('brakeConditionsSync');
  if(statusSync)statusSync.textContent='Status por posição sincronizados · '+timeText();
 }catch(e){
  const statusSync=document.getElementById('brakeConditionsSync');
  if(statusSync)statusSync.textContent='Falha ao sincronizar status dos freios';
  console.warn('Falha na sincronização dos status dos freios',e);
 }
}
async function start(){installUI();installBrakePositionEditors();try{const [a,b]=await Promise.all([fetch('../cliente/index.html',{cache:'no-store'}),fetch('../project_schedule.json',{cache:'no-store'})]);const t=await a.text();let m=t.match(/const DATA=(\{.*\});\s*const KEY=/s)||t.match(/const DATA=(\{.*\});\s*let S=/s);if(!m)throw Error('Base do projeto não localizada');D=JSON.parse(m[1]);SC=await b.json();await pull();setInterval(pull,15000)}catch(e){document.getElementById('brakeSync').textContent='Não foi possível carregar programação/execução'}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
