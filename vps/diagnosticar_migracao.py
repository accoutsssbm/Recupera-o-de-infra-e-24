#!/usr/bin/env python3
# Diagnostico SOMENTE LEITURA da migracao Recuperacao Infra/24M para VPS.
# Nao cria, apaga, reinstala, reinicia nem altera servicos/dados.
from __future__ import annotations
import json, os, re, shutil, subprocess, sys, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from pathlib import Path

SUPABASE='https://iiumknzkjhiwtevpyavm.supabase.co'
KEY='sb_publishable_QnC0_AuecV4bhv4pzterwQ_W-Fl-ptc'
PROJECT='salobo-infra-v6'
print('=== DIAGNOSTICO READ-ONLY: RECUPERACAO INFRA SALOBO / FREIOS 24-24M ===')
print('UTC:',datetime.now(timezone.utc).isoformat(timespec='seconds'))
print('VPS:',os.uname().nodename)
print('Execucao:', 'root' if os.geteuid()==0 else 'sem privilegio root')
print('Banco alvo sugerido: PostgreSQL ou SQLite isolado, nunca sobrescrever atlas-gestao')
print('Escopo no GitHub: 34 acoes, 541 subacoes; grupos Macro, Ligriarno/Ralde, Leonardo, Kleber')
print('Criterio de seguranca: nao migrar estados para OPEN sem conciliar o historico atual')
def run(argv,timeout=12):
 try:
  p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
  return p.returncode,(p.stdout or '').strip(),(p.stderr or '').strip()
 except Exception as e:return 999,'',str(e)
print('\n--- Docker ---')
if shutil.which('docker'):
 c,out,err=run(['docker','ps','--format','{{.Names}} | {{.Status}} | {{.Ports}}'])
 print('docker ps:',out[:6000] if c==0 else 'ERRO '+err[:300])
else:print('Docker nao encontrado no PATH.')
print('\n--- Nginx: host / rotas ---')
if shutil.which('nginx'):
 c,out,err=run(['nginx','-T'],timeout=20)
 if c!=0:print('nginx -T erro:',err[-250:])
 else:
  paths=sorted(set(re.findall(r'(?:server_name\s+[^;]*gestao\.atlasfieldscreen\.com[^;]*;|listen\s+[^;]*;|location\s+[^\{]*\{)',out)))
  for x in paths[:45]:print(re.sub(r'\s+',' ',x).strip()[:220])
  print('Rota /recuperacao/ configurada:',bool(re.search(r'location\s+[^\{]*recuperacao',out,re.I)))
else:print('Nginx nao encontrado no PATH.')
print('\n--- Diretórios associados ---')
for p in ['/opt/8x/build/atlas-docker','/var/www/gestao-equipe','/etc/nginx/sites-enabled','/root/gestao-importacao-2026']:
 q=Path(p);print(p,'ENCONTRADO' if q.exists() else 'NAO ENCONTRADO')
print('\n--- Supabase legado: TESTE DE LEITURA (sem alteracao) ---')
for table in ['project_execution_items','project_brake_position_status']:
 query='project_key=eq.'+urllib.parse.quote(PROJECT)+'&select='+('item_id,item_type,status,updated_at' if table=='project_execution_items' else 'machine_tag,position_code,status,updated_at')
 url=SUPABASE+'/rest/v1/'+table+'?'+query
 req=urllib.request.Request(url,headers={'apikey':KEY,'accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=12) as res:body=res.read(3_000_000);status=res.status
  rows=json.loads(body)
  if not isinstance(rows,list):print(table,'HTTP',status,'JSON nao-lista');continue
  if table=='project_execution_items':
   ids=[str(r.get('item_id') or '') for r in rows]
   done=sum(str(r.get('status') or '').upper()=='DONE' for r in rows)
   print(table,'HTTP',status,'linhas',len(rows),'IDs unicos',len(set(ids)),'DONE',done,'OPEN',sum(str(r.get('status') or '').upper()=='OPEN' for r in rows))
   print('PROBLEMA' if len(ids)!=len(set(ids)) else 'IDs sem duplicacao')
  else:
   print(table,'HTTP',status,'posicoes',len(rows),'criticos',sum(str(r.get('status') or '').upper()=='CRITICAL' for r in rows))
 except urllib.error.HTTPError as e:print(table,'HTTP',e.code,'NAO ACESSIVEL. Nao inferir status OPEN.')
 except Exception as e:print(table,'NAO ACESSIVEL:',type(e).__name__,str(e)[:160])
print('\n--- Resultado ---')
print('Nenhum arquivo, banco de dados, Nginx, Docker ou aplicativo foi modificado.')
print('Antes do cutover: exportar status e historico; validar fila local de cada responsavel; depois configurar API e publicacao no HTTPS da VPS.')
print('=== FIM DO DIAGNOSTICO ===')
