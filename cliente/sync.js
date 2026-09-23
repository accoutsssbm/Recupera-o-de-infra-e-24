(()=>{
const SUPA_URL="https://iiumknzkjhiwtevpyavm.supabase.co";
const SUPA_KEY="sb_publishable_QnC0_AuecV4bhv4pzterwQ_W-Fl-ptc";
const PROJECT="salobo-infra-v6";
const API=SUPA_URL+'/rest/v1/project_execution_items';
const PEND='salobo-sync-v2-pending',OLD_PEND='salobo-sync-v1-pending',RESCUE='salobo-sync-v2-rescued';
const LEGACY_KEYS=['salobo-cliente-progresso-v2','salobo-projeto-v3','salobo-projeto-v2'];
let remote=new Map(),busy=false;
const hdr={apikey:SUPA_KEY,'Content-Type':'application/json'};
const readObj=k=>{try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(e){return {}}};
const pending=()=>Object.assign({},readObj(OLD_PEND),readObj(PEND));
const savePending=p=>{localStorage.setItem(PEND,JSON.stringify(p));localStorage.removeItem(OLD_PEND)};
const localSub=s=>!!subDone(s);
const localAction=a=>!!actionDone(a);
const setLocal=(type,id,done)=>{if(type==='SUBACTION')S.sub[id]=!!done;else{const a=DATA.actions.find(x=>x.id===id);if(a&&!subsFor(a.id).length)S.action[id]=!!done}};
async function getRemote(){const r=await fetch(API+'?project_key=eq.'+encodeURIComponent(PROJECT)+'&select=item_id,item_type,status,updated_at',{headers:hdr,cache:'no-store'});if(!r.ok)throw Error('sync GET '+r.status);return await r.json()}
async function patch(id,status){const r=await fetch(API+'?project_key=eq.'+encodeURIComponent(PROJECT)+'&item_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{...hdr,Prefer:'return=minimal'},body:JSON.stringify({status,updated_at:new Date().toISOString()})});if(!r.ok)throw Error('sync PATCH '+r.status)}
async function flush(){if(busy)return;busy=true;try{let p=pending();for(const [id,status] of Object.entries(p)){try{await patch(id,status);remote.set(id,status);delete p[id];savePending(p)}catch(e){console.warn('Envio pendente preservado',id,e);break}}}finally{busy=false}}
function rescueLocalDone(rows){
  if(localStorage.getItem(RESCUE)==='1')return false;
  const known=new Set(rows.map(r=>r.item_id)),done=new Set();
  for(const s of DATA.subactions)if(localSub(s))done.add(s.id);
  for(const a of DATA.actions)if(localAction(a))done.add(a.id);
  for(const key of LEGACY_KEYS){
    const x=readObj(key);
    for(const [id,v] of Object.entries(x.sub||{}))if(v===true&&known.has(id))done.add(id);
    for(const [id,v] of Object.entries(x.action||{}))if(v===true&&known.has(id))done.add(id);
  }
  let p=pending();
  for(const id of done)if(remote.get(id)!=='DONE')p[id]='DONE';
  savePending(p);
  localStorage.setItem(RESCUE,'1');
  return true;
}
async function pull(initial=false){
  try{
    const rows=await getRemote();
    remote=new Map(rows.map(x=>[x.item_id,x.status]));
    if(initial)rescueLocalDone(rows);
    await flush();
    const p=pending();
    rows.forEach(row=>{if(p[row.item_id]!==undefined)return;setLocal(row.item_type,row.item_id,(remote.get(row.item_id)||row.status)==='DONE')});
    save();render();
  }catch(e){console.warn('Sincronização indisponível',e)}
}
function capture(){
  let p=pending();
  for(const s of DATA.subactions){const st=localSub(s)?'DONE':'OPEN';if(remote.get(s.id)!==st)p[s.id]=st;else delete p[s.id]}
  for(const a of DATA.actions){const st=localAction(a)?'DONE':'OPEN';if(remote.get(a.id)!==st)p[a.id]=st;else delete p[a.id]}
  savePending(p);flush();
}
document.addEventListener('change',e=>{if(e.target&&e.target.matches('input[type=checkbox]'))setTimeout(capture,120)},true);
window.addEventListener('online',()=>pull(false));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull(false)});
setInterval(()=>pull(false),15000);
setTimeout(()=>pull(true),250);
})();