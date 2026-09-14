(()=>{
const SUPA_URL="https://iiumknzkjhiwtevpyavm.supabase.co";
const SUPA_KEY="sb_publishable_QnC0_AuecV4bhv4pzterwQ_W-Fl-ptc";
const PROJECT="salobo-infra-v6";
const API=SUPA_URL+'/rest/v1/project_execution_items';
const MIG='salobo-sync-v1-migrated',PEND='salobo-sync-v1-pending';
let remote=new Map(),busy=false;
const hdr={apikey:SUPA_KEY,'Content-Type':'application/json'};
const pending=()=>{try{return JSON.parse(localStorage.getItem(PEND)||'{}')}catch(e){return {}}};
const savePending=p=>localStorage.setItem(PEND,JSON.stringify(p));
const localSub=s=>!!subDone(s);
const localAction=a=>!!actionDone(a);
const localState=(type,id)=>{if(type==='SUBACTION'){const s=DATA.subactions.find(x=>x.id===id);return s?localSub(s):false}const a=DATA.actions.find(x=>x.id===id);return a?localAction(a):false};
const setLocal=(type,id,done)=>{if(type==='SUBACTION')S.sub[id]=!!done;else{const a=DATA.actions.find(x=>x.id===id);if(a&&!subsFor(a.id).length)S.action[id]=!!done}};
async function getRemote(){const r=await fetch(API+'?project_key=eq.'+encodeURIComponent(PROJECT)+'&select=item_id,item_type,status,updated_at',{headers:hdr,cache:'no-store'});if(!r.ok)throw Error('sync GET '+r.status);return await r.json()}
async function patch(id,status){const r=await fetch(API+'?project_key=eq.'+encodeURIComponent(PROJECT)+'&item_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{...hdr,Prefer:'return=minimal'},body:JSON.stringify({status})});if(!r.ok)throw Error('sync PATCH '+r.status)}
async function flush(){if(busy)return;busy=true;try{let p=pending();for(const [id,status] of Object.entries(p)){try{await patch(id,status);remote.set(id,status);delete p[id];savePending(p)}catch(e){break}}}finally{busy=false}}
async function pull(initial=false){try{const rows=await getRemote();remote=new Map(rows.map(x=>[x.item_id,x.status]));let p=pending(),migrated=localStorage.getItem(MIG)==='1';if(initial&&!migrated){rows.forEach(row=>{const local=localState(row.item_type,row.item_id),rd=row.status==='DONE';if(rd&&!local)setLocal(row.item_type,row.item_id,true);else if(local&&!rd)p[row.item_id]='DONE'});localStorage.setItem(MIG,'1');savePending(p);save();render();await flush();return}rows.forEach(row=>{if(p[row.item_id]!==undefined)return;setLocal(row.item_type,row.item_id,row.status==='DONE')});save();render()}catch(e){console.warn('Sincronização indisponível',e)}}
function capture(){let p=pending();for(const s of DATA.subactions){const st=localSub(s)?'DONE':'OPEN';if(remote.get(s.id)!==st)p[s.id]=st}for(const a of DATA.actions){const st=localAction(a)?'DONE':'OPEN';if(remote.get(a.id)!==st)p[a.id]=st}savePending(p);flush()}
document.addEventListener('change',e=>{if(e.target&&e.target.matches('input[type=checkbox]'))setTimeout(capture,120)},true);
window.addEventListener('online',()=>{flush();pull(false)});
setInterval(()=>{flush();pull(false)},15000);
setTimeout(()=>pull(true),250);
})();
