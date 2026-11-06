#!/usr/bin/env python3
"""Generate a conservative static H4 coverage inventory from the current contracts.

Requires PyYAML 6.x. Run from the Frontend repository:
  python scripts/generate-h4-openapi-matrix.py
Optional source roots can be passed with --docs and --backend.
The source scans are evidence pointers only; they do not prove runtime integration,
authorization grants, homologation, deployment, or E2E behavior.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
APP_FOR_SERVICE = {
    "bulk": "bulk-svc",
    "combos": "combos-svc",
    "catalog": "catalog-svc",
    "taxonomy": "taxonomy-svc",
    "pricing": "pricing-svc",
    "price-audit": "price-audit-svc",
    "promotions": "promotions-svc",
    "inventory": "inventory-svc",
}


def service_for(path: str, tags: list[str]) -> str:
    text = (path + " " + " ".join(tags)).lower()
    if any(word in text for word in ("carga-masiva", "bulk")):
        return "bulk"
    if "combo" in text:
        return "combos"
    if "auditoria-precios" in text:
        return "price-audit"
    if "inventario" in text:
        return "inventory"
    if "promocion" in text or "cupon" in text or "recomendacion" in text:
        return "promotions"
    if "precio" in text or "precios" in text:
        return "pricing"
    if any(word in text for word in ("categoria", "caracteristica", "marca", "seo", "tipo-producto")):
        return "taxonomy"
    return "catalog"


def security_for(operation: dict) -> str:
    schemes: set[str] = set()
    for requirement in operation.get("security", []):
        schemes.update(requirement.keys())
    return ",".join(sorted(schemes)) or "none"


def locate_evidence(root: Path, needles: tuple[str, ...], suffixes: tuple[str, ...]) -> str:
    if not root.exists():
        return "SOURCE_ROOT_UNAVAILABLE"
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for needle in needles:
            if needle and needle in content:
                return str(path.relative_to(root)).replace("\\", "/")
    return "NO_STATIC_MATCH"


def final_state(status: str, security: str, scope_state: str, route: str, adapter: str) -> str:
    if status == "excluded-h4":
        return "EXCLUDED_H4"
    if "serviceBearer" in security and "userBearer" not in security:
        return "NOT_APPLICABLE_UI"
    if scope_state and "pending" in scope_state.lower():
        return "BLOCKED_SECURITY"
    if status == "provisional-internal":
        return "BLOCKED_BACKEND"
    if adapter != "NO_STATIC_MATCH":
        return "FRONTEND_READY_PENDING_E2E"
    if route == "NO_STATIC_MATCH":
        return "BLOCKED_BACKEND"
    return "NOT_APPLICABLE_UI"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docs", type=Path, default=WORKSPACE / "docs")
    parser.add_argument("--backend", type=Path, default=WORKSPACE / "backend")
    parser.add_argument("--docs-ref", default="origin/master")
    parser.add_argument("--backend-ref", default="origin/master")
    args = parser.parse_args()
    contract_path = "contratos/http/openapi.yaml"
    raw_spec = subprocess.run(
        ["git", "-C", str(args.docs), "show", f"{args.docs_ref}:{contract_path}"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout
    docs_sha = subprocess.run(
        ["git", "-C", str(args.docs), "rev-parse", args.docs_ref],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout.strip()
    backend_sha = subprocess.run(
        ["git", "-C", str(args.backend), "rev-parse", args.backend_ref],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout.strip()
    spec = yaml.safe_load(raw_spec)
    backend_routes = args.backend / "apps/api-gateway/src/routing/contract-routes.ts"
    out = ROOT / "docs/MATRIZ_OPENAPI_H4.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "docs_sha", "backend_sha", "operationId", "method", "route", "service", "contract_status", "security",
        "required_role", "required_scope", "gateway_route_evidence", "controller_evidence",
        "frontend_adapter_evidence", "runtime_composition", "unit_test_evidence",
        "http_test_evidence", "e2e_evidence", "final_classification",
    ]
    rows: list[dict[str, str]] = []
    for route, methods in spec["paths"].items():
        for method, operation in methods.items():
            if method.lower() not in METHODS or not isinstance(operation, dict):
                continue
            operation_id = str(operation.get("operationId", ""))
            tags = operation.get("tags", [])
            service = service_for(route, tags)
            app_dir = args.backend / "apps" / APP_FOR_SERVICE[service] / "src"
            security = security_for(operation)
            scope_state = str(operation.get("x-scope-registration-status", ""))
            adapter_root = ROOT / "src/features" / service
            adapter = locate_evidence(adapter_root, (operation_id,), (".ts", ".tsx"))
            test = locate_evidence(adapter_root, (operation_id,), (".spec.ts", ".test.ts", ".test.tsx", ".spec.tsx"))
            route_evidence = locate_evidence(backend_routes.parent, (operation_id,), (".ts",))
            route_evidence = route_evidence if route_evidence == "NO_STATIC_MATCH" else "apps/api-gateway/src/routing/contract-routes.ts"
            controller_evidence = locate_evidence(app_dir, (operation_id,), (".ts",))
            source_text = " ".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "src/main.tsx",) if p.exists())
            runtime = "main.tsx" if service in source_text else "NO_STATIC_MATCH"
            final = final_state(str(operation.get("x-status", "stable")), security, scope_state, route_evidence, adapter)
            rows.append({
                "docs_sha": docs_sha,
                "backend_sha": backend_sha,
                "operationId": operation_id,
                "method": method.upper(),
                "route": route,
                "service": service,
                "contract_status": str(operation.get("x-status", "stable")),
                "security": security,
                "required_role": str(operation.get("x-required-role", "")),
                "required_scope": str(operation.get("x-required-scope", "")),
                "gateway_route_evidence": route_evidence,
                "controller_evidence": controller_evidence,
                "frontend_adapter_evidence": adapter,
                "runtime_composition": runtime,
                "unit_test_evidence": test,
                "http_test_evidence": test if test != "NO_STATIC_MATCH" else "NO_STATIC_MATCH",
                "e2e_evidence": "NO_STATIC_MATCH",
                "final_classification": final,
            })
    with out.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} operaciones; Docs {docs_sha}; Backend {backend_sha} -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
