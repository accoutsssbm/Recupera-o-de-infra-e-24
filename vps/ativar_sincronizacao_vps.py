#!/usr/bin/env python3
"""Ativa sincronização Salobo na VPS, preservando dados históricos e apps existentes.
Uso: python3 vps/ativar_sincronizacao_vps.py (como root na VPS)
"""
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/opt/salobo-api")
APP = ROOT / "app.py"
DB = ROOT / "data/salobo.sqlite3"
SOURCE = Path("/srv/atlas-gestao/data/gestao_local_20261022.sqlite3")
NGINX = Path("/etc/nginx/sites-enabled/gestao.atlasfieldscreen.com")
CONFIG = ROOT / "data/salobo_access.json"
CODES = Path("/root/salobo-vps-codigos-acesso.txt")
MARK = "# SALOBO_LIVE_V1_BEGIN"
ORIGIN = "https://accoutsssbm.github.io"
PROJECT = "salobo-infra-v6"

EXTENSION = r'''
# SALOBO_LIVE_V1_BEGIN
import hashlib as _slhash
import json as _sljson
import unicodedata as _slud

def _sl_project(request):
    if request.query_params.get("project_key") != "eq." + PROJECT:
        raise HTTPException(400, "Projeto invalido.")

def _sl_actor(request):
    candidate = request.headers.get("x-project-token", "").strip()
    if not candidate or len(candidate) > 200:
        raise HTTPException(401, "Codigo de acesso necessario.")
    digest = _slhash.sha256(candidate.encode()).hexdigest()
    try:
        with open("/data/salobo_access.json", encoding="utf-8") as handle:
            allowed = _sljson.load(handle)["codes"]
    except (OSError, ValueError, KeyError):
        raise HTTPException(503, "Credenciais indisponiveis.")
    for known, actor in allowed.items():
        if secrets.compare_digest(known, digest):
            return actor
    raise HTTPException(403, "Codigo de acesso invalido.")

def _sl_norm(text):
    return "".join(c for c in _slud.normalize("NFD", str(text or "").lower()) if _slud.category(c) != "Mn")

def _sl_allowed(actor, row):
    if actor == "Coordenacao":
        return True
    tag = str(row["item_id"])
    involved = _sl_norm(str(row["front"] or "") + " " + str(row["responsible"] or ""))
    if actor == "Macro":
        return tag.startswith("M") and tag[1:].isdigit()
    if actor == "Leonardo":
        return "leonardo" in involved
    if actor == "Kleber":
        return "kleber" in involved
    if actor in ("Ligriarno", "Ralde"):
        return "ligriarno" in involved or "ralde" in involved or "motoniveladoras" in involved
    return False

def _sl_select(rows, request, allowed_columns):
    requested = request.query_params.get("select", "")
    cols = [c.strip() for c in requested.split(",")] if requested else list(allowed_columns)
    if not cols or any(c not in allowed_columns for c in cols):
        raise HTTPException(400, "Selecao invalida.")
    return [{c: r[c] for c in cols} for r in rows]

@app.get("/live/health")
def salobo_live_health():
    with database() as db:
        total = db.execute("SELECT count(*) FROM historical_execution_items WHERE project_key=?", (PROJECT,)).fetchone()[0]
    return {"status":"ok","service":"salobo-live","historical_items":total}

@app.get("/live/rest/v1/project_execution_items")
def salobo_live_items(request: Request):
    _sl_project(request)
    columns = ("project_key","item_id","item_type","parent_id","equipment","front","responsible","project_type","status","updated_at")
    with database() as db:
        rows = db.execute("""
          SELECT h.project_key,h.item_id,h.item_type,h.parent_id,h.equipment,
                 h.front,h.responsible,h.project_type,
                 coalesce(o.status,h.status) AS status,
                 coalesce(o.updated_at,h.updated_at) AS updated_at
          FROM historical_execution_items h
          LEFT JOIN execution_items o ON h.project_key=o.project_key AND h.item_id=o.item_id
          WHERE h.project_key=? ORDER BY h.item_type,h.item_id
        """, (PROJECT,)).fetchall()
        data = [dict(r) for r in rows]
    item = request.query_params.get("item_id")
    if item:
        if not item.startswith("eq."): raise HTTPException(400,"Filtro invalido.")
        data = [r for r in data if r["item_id"]==item[3:]]
    return _sl_select(data, request, columns)

@app.patch("/live/rest/v1/project_execution_items")
async def salobo_live_patch_item(request: Request):
    _sl_project(request)
    actor = _sl_actor(request)
    item = request.query_params.get("item_id","")
    if not item.startswith("eq.") or not item[3:]:
        raise HTTPException(400,"item_id obrigatorio.")
    payload = await request.json()
    if not isinstance(payload,dict) or payload.get("status") not in ("DONE","OPEN"):
        raise HTTPException(422,"Status invalido.")
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("""SELECT h.*, coalesce(o.status,h.status) AS current_status
            FROM historical_execution_items h
            LEFT JOIN execution_items o ON o.project_key=h.project_key AND o.item_id=h.item_id
            WHERE h.project_key=? AND h.item_id=?""",(PROJECT,item[3:])).fetchone()
        if not row: raise HTTPException(404,"Item nao encontrado.")
        if not _sl_allowed(actor,row): raise HTTPException(403,"Item fora da frente autorizada.")
        before = row["current_status"]
        if before != payload["status"]:
            when = now()
            db.execute("""INSERT INTO execution_items (project_key,item_id,item_type,status,updated_at,source)
                VALUES (?,?,?,?,?,?) ON CONFLICT(project_key,item_id) DO UPDATE SET
                item_type=excluded.item_type,status=excluded.status,
                updated_at=excluded.updated_at,source=excluded.source""",
                (PROJECT,row["item_id"],row["item_type"],payload["status"],when,actor))
            db.execute("""INSERT INTO audit_log
                (project_key,item_id,old_status,new_status,source,recorded_at)
                VALUES (?,?,?,?,?,?)""",(PROJECT,row["item_id"],before,payload["status"],actor,when))
        else:
            when = db.execute("""SELECT updated_at FROM execution_items
                WHERE project_key=? AND item_id=?""",(PROJECT,item[3:])).fetchone()
            when = when[0] if when else row["updated_at"]
    if "return=representation" in request.headers.get("prefer","").lower():
        return [{"item_id":item[3:],"status":payload["status"],"updated_at":when}]
    return []

@app.get("/live/rest/v1/project_brake_position_status")
def salobo_live_brakes(request: Request):
    _sl_project(request)
    columns=("project_key","machine_tag","position_code","status","updated_at")
    with database() as db:
        data=[dict(r) for r in db.execute(
            "SELECT * FROM salobo_brake_positions WHERE project_key=? ORDER BY machine_tag,position_code",(PROJECT,)
        ).fetchall()]
    for col in ("machine_tag","position_code"):
        value=request.query_params.get(col)
        if value:
            if not value.startswith("eq."): raise HTTPException(400,"Filtro invalido.")
            data=[r for r in data if r[col]==value[3:]]
    return _sl_select(data,request,columns)

@app.patch("/live/rest/v1/project_brake_position_status")
async def salobo_live_patch_brake(request: Request):
    _sl_project(request)
    actor=_sl_actor(request)
    if actor not in ("Ligriarno","Ralde","Coordenacao"):
        raise HTTPException(403,"Codigo nao autorizado para freios.")
    tag=request.query_params.get("machine_tag","")
    position=request.query_params.get("position_code","")
    if not tag.startswith("eq.") or not position.startswith("eq."):
        raise HTTPException(400,"Posicao obrigatoria.")
    payload=await request.json()
    if not isinstance(payload,dict) or payload.get("status") not in (
        "UNCONFIRMED","NORMAL","INSPECTION","CRITICAL"
    ): raise HTTPException(422,"Status invalido.")
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        old=db.execute("""SELECT status,updated_at FROM salobo_brake_positions
            WHERE project_key=? AND machine_tag=? AND position_code=?""",
            (PROJECT,tag[3:],position[3:])).fetchone()
        if not old: raise HTTPException(404,"Posicao nao encontrada.")
        when=old["updated_at"]
        if old["status"]!=payload["status"]:
            when=now()
            db.execute("""UPDATE salobo_brake_positions SET status=?,updated_at=?
                WHERE project_key=? AND machine_tag=? AND position_code=?""",
                (payload["status"],when,PROJECT,tag[3:],position[3:]))
            db.execute("""INSERT INTO salobo_brake_audit
                (project_key,machine_tag,position_code,old_status,new_status,actor,recorded_at)
                VALUES (?,?,?,?,?,?,?)""",
                (PROJECT,tag[3:],position[3:],old["status"],payload["status"],actor,when))
    return [{"machine_tag":tag[3:],"position_code":position[3:],
             "status":payload["status"],"updated_at":when}]
# SALOBO_LIVE_V1_END
'''

ROUTE = """
    # API publica Salobo: leitura limitada e escrita com codigo individual
    location ^~ /salobo-live/ {
        proxy_pass http://127.0.0.1:18086/live/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store" always;
    }

"""

def run(*args):
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True)

def get(path):
    with urllib.request.urlopen(path, timeout=10) as resp:
        return resp.status, json.load(resp)

def snapshot(path):
    dest=ROOT/"backups"/(path.name+".before-live-"+STAMP)
    shutil.copy2(path,dest)
    return dest

def backup_sqlite():
    dest=ROOT/"backups"/("salobo-before-live-"+STAMP+".sqlite3")
    with sqlite3.connect(DB) as src, sqlite3.connect(dest) as out:
        src.backup(out)
    with sqlite3.connect(dest) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":
            raise RuntimeError("Backup SQLite invalido")
    print("Backup SQLite validado:", dest)

def migrate_brakes():
    with sqlite3.connect(f"file:{SOURCE}?mode=ro",uri=True) as db:
        rows=[json.loads(x[0]) for x in db.execute(
            "SELECT payload FROM source_records WHERE table_name='project_brake_position_status'"
        )]
    keys={(r["project_key"],r["machine_tag"],r["position_code"]) for r in rows}
    if len(rows)!=20 or len(keys)!=20 or any(r["project_key"]!=PROJECT for r in rows):
        raise RuntimeError("Os 20 estados de freio nao conferem")
    with sqlite3.connect(DB,timeout=20) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS salobo_brake_positions(
            project_key TEXT NOT NULL,machine_tag TEXT NOT NULL,position_code TEXT NOT NULL,
            status TEXT NOT NULL,updated_at TEXT,
            PRIMARY KEY(project_key,machine_tag,position_code))""")
        db.execute("""CREATE TABLE IF NOT EXISTS salobo_brake_audit(
            id INTEGER PRIMARY KEY AUTOINCREMENT,project_key TEXT,
            machine_tag TEXT,position_code TEXT,old_status TEXT,new_status TEXT,
            actor TEXT,recorded_at TEXT)""")
        count=db.execute("SELECT count(*) FROM salobo_brake_positions").fetchone()[0]
        if count == 0:
            db.executemany("INSERT INTO salobo_brake_positions VALUES (?,?,?,?,?)",[
                (r["project_key"],r["machine_tag"],r["position_code"],r["status"],r["updated_at"])
                for r in rows
            ])
        elif count!=20:
            raise RuntimeError("Estados de freio existentes divergentes; nada sobrescrito")
        if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":
            raise RuntimeError("Falha de integridade SQLite")
        count=db.execute("SELECT count(*) FROM salobo_brake_positions").fetchone()[0]
    print("Posicoes de freios preservadas:", count)

def access_codes():
    actors=("Coordenacao","Leonardo","Kleber","Ligriarno","Ralde","Macro")
    if CONFIG.exists():
        with CONFIG.open() as f: existing=json.load(f)
        if set(existing["codes"].values()) != set(actors):
            raise RuntimeError("Configuracao de acesso existente inesperada")
        print("Credenciais existentes preservadas:", CODES if CODES.exists() else "arquivo local de codigos indisponivel")
        return
    if CODES.exists():
        raise RuntimeError("Arquivo de codigos existente sem configuracao na API; inspecione antes de continuar")
    codes={actor:secrets.token_urlsafe(18) for actor in actors}
    CONFIG.write_text(json.dumps({"codes":{hashlib.sha256(v.encode()).hexdigest():k for k,v in codes.items()}}))
    os.chown(CONFIG,10001,10001)
    os.chmod(CONFIG,0o600)
    CODES.write_text("\n".join(a+": "+v for a,v in codes.items())+"\n")
    os.chmod(CODES,0o600)
    print("Codigos individuais criados. Arquivo privado:",CODES)
    print("NAO ENVIE OS CODIGOS NO CHAT OU AO GITHUB.")

def main():
    global STAMP
    STAMP=datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if os.geteuid()!=0:
        raise RuntimeError("Execute como root")
    if not all(p.is_file() for p in (APP,DB,SOURCE,NGINX)):
        raise RuntimeError("VPS nao corresponde a estrutura previamente verificada")
    run("docker","inspect","salobo-api")
    with sqlite3.connect(DB) as db:
        historical=db.execute("SELECT count(*) FROM historical_execution_items WHERE project_key=?",(PROJECT,)).fetchone()[0]
        if historical!=575: raise RuntimeError("Historico nao tem 575 itens")
    (ROOT/"backups").mkdir(exist_ok=True)
    backup_sqlite()
    b_app=snapshot(APP)
    b_ng=snapshot(NGINX.resolve())
    print("Backups de codigo/Nginx:",b_app,b_ng)
    migrate_brakes()
    access_codes()
    old=APP.read_text()
    if MARK not in old:
        target='allow_methods=["GET", "POST"]'
        if old.count(target)!=1:
            raise RuntimeError("CORS existente diferente; nenhuma alteracao no codigo")
        APP.write_text(old.replace(target,'allow_methods=["GET", "POST", "PATCH", "OPTIONS"]',1)+EXTENSION)
    elif old.count(MARK)!=1:
        raise RuntimeError("Marcador de extensao duplicado")
    import py_compile
    py_compile.compile(str(APP),doraise=True)
    conf=NGINX.read_text()
    if "location ^~ /salobo-live/" not in conf:
        needle="    location / {"
        if conf.count(needle)!=1:
            raise RuntimeError("Configuracao Nginx inesperada; pare antes da publicacao")
        NGINX.write_text(conf.replace(needle,ROUTE+needle,1))
    run("nginx","-t")
    run("docker","compose","-f",str(ROOT/"compose.yaml"),"up","-d","--build","--no-deps","salobo-api")
    for _ in range(20):
        try:
            st,health=get("http://127.0.0.1:18086/live/health")
            if st==200 and health["historical_items"]==575:break
        except Exception: time.sleep(1)
    else:
        raise RuntimeError("API nao iniciou; backups preservados")
    run("systemctl","reload","nginx")
    origin_req=urllib.request.Request("http://127.0.0.1:18086/live/rest/v1/project_execution_items?project_key=eq.salobo-infra-v6&select=item_id,status",
        headers={"Origin":ORIGIN})
    with urllib.request.urlopen(origin_req,timeout=8) as response:
        items=json.load(response)
        assert response.headers.get("access-control-allow-origin")==ORIGIN, "CORS incorreto"
    if len(items)!=575:raise RuntimeError("Consulta retornou contagem inesperada")
    _,brakes=get("http://127.0.0.1:18086/live/rest/v1/project_brake_position_status?project_key=eq.salobo-infra-v6&select=machine_tag,position_code,status")
    if len(brakes)!=20:raise RuntimeError("Freios: contagem divergente")
    try:
        req=urllib.request.Request("http://127.0.0.1:18086/live/rest/v1/project_execution_items?project_key=eq.salobo-infra-v6&item_id=eq.M1",
          data=b'{"status":"DONE"}',method="PATCH",headers={"Content-Type":"application/json"})
        urllib.request.urlopen(req,timeout=8)
        raise RuntimeError("FALHA CRITICA: escrita anonima aceita")
    except urllib.error.HTTPError as ex:
        if ex.code!=401:raise RuntimeError("Autenticacao de escrita retornou HTTP "+str(ex.code))
    status,body=get("http://127.0.0.1:18086/live/health")
    print("=== ATIVACAO CONCLUIDA ===")
    print("API:",body)
    print("Itens:",len(items),"Freios:",len(brakes))
    print("Escrita anonima bloqueada: HTTP 401")
    print("Codigos privados em:",CODES)
    print("Publicacao Nginx:",NGINX)
    print("Checar acesso externo GET: https://gestao.atlasfieldscreen.com/salobo-live/health")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("FALHA:",repr(exc),file=sys.stderr)
        print("Nenhum aplicativo cliente foi modificado por este instalador.",file=sys.stderr)
        raise
