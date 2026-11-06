#!/usr/bin/env python3
"""Generate a non-inferential H4 contract evidence matrix.

Evidence categories are independent. Textual matches are pointers, never proof of
runtime composition or successful execution. Unverified states remain explicit.
"""
from __future__ import annotations
import argparse, csv, subprocess
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=ROOT.parent
METHODS={"get","post","put","patch","delete","head","options","trace"}
APP={"bulk":"bulk-svc","combos":"combos-svc","catalog":"catalog-svc","taxonomy":"taxonomy-svc","pricing":"pricing-svc","price-audit":"price-audit-svc","promotions":"promotions-svc","inventory":"inventory-svc"}
def service_for(path,tags):
 t=(path+" "+" ".join(tags)).lower()
 for needles,name in [(("carga-masiva","bulk"),"bulk"),(("combo",),"combos"),(("auditoria-precios",),"price-audit"),(("inventario",),"inventory"),(("promocion","cupon","recomendacion"),"promotions"),(("precio","precios"),"pricing"),(("categoria","caracteristica","marca","seo","tipo-producto","taxonomia"),"taxonomy")]:
  if any(x in t for x in needles): return name
 return "catalog"
def git(root,*args):
 return subprocess.run(["git","-C",str(root),*args],check=True,capture_output=True,text=True,encoding="utf-8").stdout.strip()
def evidence(root,ref,paths,needle):
 for path in paths:
  try: content=git(root,"show",f"{ref}:{path}")
  except subprocess.CalledProcessError: continue
  if needle and needle in content: return path
 return "NOT_VERIFIED"
def security(op):
 return ";".join(",".join(sorted(x)) for x in op.get("security",[])) or "none"
def main():
 ap=argparse.ArgumentParser(); ap.add_argument("--docs",type=Path,default=WORKSPACE/"docs"); ap.add_argument("--backend",type=Path,default=WORKSPACE/"backend"); ap.add_argument("--docs-ref",default="origin/master"); ap.add_argument("--backend-ref",default="origin/master"); args=ap.parse_args()
 ds=git(args.docs,"rev-parse",args.docs_ref); bs=git(args.backend,"rev-parse",args.backend_ref)
 spec=yaml.safe_load(git(args.docs,"show",f"{args.docs_ref}:contratos/http/openapi.yaml"))
 out=ROOT/"docs/MATRIZ_OPENAPI_H4.csv"; out.parent.mkdir(parents=True,exist_ok=True)
 fields=["docs_sha","backend_sha","frontend_head_before_matrix_generation","operationId","method","route","service","contract_status","security","required_role","required_scope","contract_route","gateway_route","controller_provider","web_security","frontend_adapter","runtime_composition","unit_test","http_test","e2e","external_blocker"]
 head=git(ROOT,"rev-parse","HEAD"); rows=[]
 for route,methods in spec["paths"].items():
  for method,op in methods.items():
   if method.lower() not in METHODS or not isinstance(op,dict): continue
   oid=str(op.get("operationId","")); svc=service_for(route,op.get("tags",[])); app=APP[svc]
   gw="apps/api-gateway/src/routing/contract-routes.ts"; controller=f"apps/{app}/src"
   rows.append(dict(docs_sha=ds,backend_sha=bs,frontend_head_before_matrix_generation=head,operationId=oid,method=method.upper(),route=route,service=svc,contract_status=str(op.get("x-status","stable")),security=security(op),required_role=str(op.get("x-required-role","")),required_scope=str(op.get("x-required-scope","")),contract_route="PUBLISHED",gateway_route=evidence(args.backend,args.backend_ref,[gw],oid),controller_provider=evidence(args.backend,args.backend_ref,[f"{controller}/",],oid),web_security="REQUIRES_RUNTIME_REVIEW",frontend_adapter="REQUIRES_CALL_PATH_REVIEW",runtime_composition="REQUIRES_COMPOSITION_REVIEW",unit_test="NOT_EXECUTED",http_test="NOT_EXECUTED",e2e="NOT_EXECUTED",external_blocker="NOT_INFERRED"))
 with out.open("w",encoding="utf-8-sig",newline="") as f: w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
 print(f"{len(rows)} filas; Docs {ds}; Backend {bs}; Frontend HEAD {head}; clasificaciones no inferidas")
if __name__=="__main__": main()
