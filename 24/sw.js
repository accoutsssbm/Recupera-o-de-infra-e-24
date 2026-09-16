const CACHE_NAME='gestao-24-v6';
const ASSETS=[
  './Visao_Gerencial_Freios_24_24M_V6.html',
  './manifest.webmanifest?v=26',
  './icon.svg?v=25',
  './live-cycle.js?v=7',
  './freios-parts/freios-gz-001.b64',
  './freios-parts/freios-gz-002.b64',
  './freios-parts/freios-gz-003.b64',
  './freios-parts/freios-gz-004.b64',
  './freios-parts/freios-gz-005.b64',
  './freios-parts/freios-gz-006.b64',
  './freios-parts/freios-gz-007.b64'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim();const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});await Promise.all(cs.filter(c=>c.url.includes('/24/')).map(c=>c.navigate(c.url).catch(()=>null)))} )()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    const copy=response.clone();
    if(new URL(event.request.url).origin===self.location.origin)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./Visao_Gerencial_Freios_24_24M_V6.html'))));
});
