/* Camada de transporte para os PWAs Salobo: preserva a logica e as filas existentes. */
(()=>{
  'use strict';
  if(window.__SALOBOVPS_BRIDGE_V1__)return;
  window.__SALOBOVPS_BRIDGE_V1__=true;

  const ROOT='https://gestao.atlasfieldscreen.com/salobo-live/';
  const URL_RE=/^https:\/\/iiumknzkjhiwtevpyavm\.supabase\.co\/rest\/v1\/(project_execution_items|project_brake_position_status)(\?.*)?$/i;
  const CODE_KEY='salobo-vps-access-code-v1';
  const realFetch=window.fetch.bind(window);
  let enabled=false, nextProbe=0, probing=null, asking=null;

  async function ready(){
    if(enabled)return true;
    if(Date.now()<nextProbe)return false;
    if(probing)return probing;
    probing=(async()=>{
      try{
        const response=await realFetch(ROOT+'health',{cache:'no-store',mode:'cors'});
        const data=response.ok?await response.json():null;
        enabled=!!(data&&data.service==='salobo-live'&&data.historical_items===575);
        window.__SALOBOVPS_ACTIVE__=enabled;
      }catch(_){enabled=false}
      if(!enabled)nextProbe=Date.now()+10000;
      return enabled;
    })();
    try{return await probing}finally{probing=null}
  }

  function requestCode(){
    const existing=localStorage.getItem(CODE_KEY);
    if(existing)return Promise.resolve(existing);
    if(asking)return asking;
    asking=new Promise((resolve,reject)=>{
      if(!document.body){reject(new Error('Abra o aplicativo para habilitar a sincronizacao.'));return}
      const overlay=document.createElement('div');
      overlay.id='salobo-vps-access-dialog';
      overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px;font:14px Arial,sans-serif';
      const panel=document.createElement('form');
      panel.style.cssText='background:#fff;color:#222;max-width:390px;width:100%;padding:20px;border-radius:10px;box-shadow:0 8px 30px #0006';
      const h=document.createElement('h3');h.textContent='Ativar sincronização Salobo';h.style.margin='0 0 10px';
      const p=document.createElement('p');p.textContent='Informe uma vez o código individual fornecido pela coordenação. O aplicativo e as suas alterações locais serão mantidos.';
      p.style.cssText='line-height:1.4;margin:0 0 12px';
      const input=document.createElement('input');input.type='password';input.required=true;input.autocomplete='off';input.placeholder='Código individual';input.setAttribute('aria-label','Código de acesso Salobo');
      input.style.cssText='width:100%;box-sizing:border-box;padding:12px;border:1px solid #aaa;border-radius:5px;margin-bottom:12px;font-size:15px';
      const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:8px;justify-content:flex-end';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Agora não';cancel.style.cssText='padding:10px;border:1px solid #ccc;background:#fff;border-radius:5px';
      const save=document.createElement('button');save.type='submit';save.textContent='Ativar';save.style.cssText='padding:10px 18px;border:0;background:#ffcd11;font-weight:700;border-radius:5px';
      buttons.append(cancel,save);panel.append(h,p,input,buttons);overlay.append(panel);document.body.append(overlay);
      function finish(err,value){overlay.remove();if(err)reject(err);else resolve(value)}
      cancel.addEventListener('click',()=>finish(new Error('Sincronizacao pendente: codigo nao informado.')));
      panel.addEventListener('submit',e=>{
        e.preventDefault();
        const value=input.value.trim();
        if(!value)return;
        localStorage.setItem(CODE_KEY,value);
        finish(null,value);
      });
      input.focus();
    }).finally(()=>{asking=null});
    return asking;
  }

  window.fetch=async function(input,options){
    const originalURL=typeof input==='string'?input:(input&&input.url)||String(input);
    const match=originalURL.match(URL_RE);
    if(!match)return realFetch(input,options);
    if(!await ready())return realFetch(input,options);
    const requestURL=new URL(ROOT+'rest/v1/'+match[1]);
    requestURL.search=match[2]||'';
    const init={...(options||{})};
    const headers=new Headers((options&&options.headers)||(input instanceof Request?input.headers:undefined));
    headers.delete('apikey');
    headers.delete('Authorization');
    headers.delete('authorization');
    const method=(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    if(method==='PATCH'||method==='POST'||method==='PUT'||method==='DELETE'){
      headers.set('X-Project-Token',await requestCode());
    }
    init.headers=headers;
    init.cache='no-store';
    const response=await realFetch(requestURL.toString(),init);
    if((response.status===401||response.status===403)&&method!=='GET'){
      localStorage.removeItem(CODE_KEY);
      console.warn('Salobo VPS: codigo expirado ou permissao insuficiente; alteracao mantida pendente quando aplicavel.');
    }
    return response;
  };
})();
