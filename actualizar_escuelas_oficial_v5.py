# -*- coding: utf-8 -*-
"""
V5 HÍBRIDA - Enriquece escuelas.json combinando la ficha oficial del Mapa Educativo Nacional
con la heurística de siglas y nombres (IPET, IPEA, CENMA, etc.).
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_FICHA = "https://mapa.educacion.gob.ar/legajo/{}"
FUENTE = "Mapa Educativo Nacional + Heurística Híbrida por Siglas"
OBSERVACION_FUENTE = "Ficha oficial enriquecida con análisis de nombres institucionales (IPET, IPEA, CENMA)."

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
}

SECCIONES = {
    "Oferta educativa",
    "Características Pedagógicas Educativas",
    "Planes de estudio",
    "Funcionamiento y Financiamiento",
    "Equipamiento, Tecnología y Pedagogía",
    "Infraestructura",
}


# -----------------------------------------------------------------------------
# Texto / identificadores
# -----------------------------------------------------------------------------

def normalizar(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s).upper().strip()


def limpiar(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def digitos(v: Any) -> str:
    s = limpiar(v)
    if not s:
        return ""
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]
    return re.sub(r"\D", "", s)


def obtener_cueanexo(e: dict[str, Any]) -> tuple[str, str]:
    ca = digitos(e.get("cueanexo", ""))
    if len(ca) == 9:
        return ca, ca[:7]

    raw_cue = digitos(e.get("cue", ""))
    if len(raw_cue) >= 9:
        ca = raw_cue[-9:]
        return ca, ca[:7]

    cue = raw_cue.zfill(7) if raw_cue else ""
    anexo = digitos(e.get("anexo", ""))
    anexo = anexo.zfill(2) if anexo else "00"
    if len(cue) == 7:
        return cue + anexo, cue
    return "", cue


def unica(vals: list[str]) -> list[str]:
    out = []
    seen = set()
    for v in vals:
        v = limpiar(v)
        if not v:
            continue
        k = normalizar(v)
        if k not in seen:
            seen.add(k)
            out.append(v)
    return out


# -----------------------------------------------------------------------------
# Descarga y parsing de fichas oficiales
# -----------------------------------------------------------------------------

def fetch_html(cueanexo: str, session: requests.Session) -> tuple[str, str, str]:
    url = BASE_FICHA.format(cueanexo)
    try:
        r = session.get(url, timeout=40)
        if r.status_code == 200:
            return cueanexo, "OK", r.text
        if r.status_code == 404:
            return cueanexo, "HTTP_404", ""
        return cueanexo, f"HTTP_{r.status_code}", ""
    except requests.RequestException as exc:
        return cueanexo, f"ERROR_{type(exc).__name__}", ""


def _lineas_texto(soup: BeautifulSoup) -> list[str]:
    raw = soup.get_text("\n", strip=True)
    lines = []
    for line in raw.splitlines():
        line = re.sub(r"\s+", " ", unescape(line)).strip()
        if line:
            lines.append(line)
    return lines


def _buscar_valores_de_bloque(lines: list[str], label: str) -> list[str]:
    label_n = normalizar(label)
    for i, line in enumerate(lines):
        if normalizar(line) == label_n:
            vals = []
            for j in range(i + 1, min(len(lines), i + 10)):
                n = normalizar(lines[j])
                if n in {normalizar(x) for x in SECCIONES}:
                    break
                if n.endswith(":") and len(lines[j]) < 80:
                    if normalizar(lines[j]) not in {normalizar(label)}:
                        break
                vals.append(lines[j])
            return unica(vals)
    return []


def _extraer_tablas(soup: BeautifulSoup) -> list[dict[str, str]]:
    rows_out: list[dict[str, str]] = []
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        if not trs:
            continue
        headers = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip() for c in trs[0].find_all(["th", "td"])]
        headers_n = [normalizar(h) for h in headers]
        if not any("ORIENTACION" in h for h in headers_n):
            continue
        for tr in trs[1:]:
            cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip() for c in tr.find_all(["td", "th"])]
            if not cells:
                continue
            item = {}
            for idx, h in enumerate(headers):
                item[h] = cells[idx] if idx < len(cells) else ""
            rows_out.append(item)
    return rows_out


def parse_ficha(cueanexo: str, status: str, html: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "url": BASE_FICHA.format(cueanexo),
        "estadoConsulta": status,
        "nombre": [],
        "modalidades": [],
        "niveles": [],
        "ciclos": [],
        "planesEstudio": [],
        "orientaciones": [],
    }
    if not html:
        return result

    soup = BeautifulSoup(html, "html.parser")
    lines = _lineas_texto(soup)

    for line in lines[:80]:
        m = re.match(r"^(.+?)\s*\(\s*" + re.escape(cueanexo) + r"\s*\)$", line)
        if m:
            result["nombre"] = [m.group(1).strip()]
            break

    result["modalidades"] = _buscar_valores_de_bloque(lines, "Tipo de Educación/Modalidad:")
    result["niveles"] = _buscar_valores_de_bloque(lines, "Niveles:")
    result["ciclos"] = _buscar_valores_de_bloque(lines, "Ciclos:")

    tables = _extraer_tablas(soup)
    result["planesEstudio"] = tables
    orientaciones = []
    for row in tables:
        for key, value in row.items():
            if "ORIENTACION" in normalizar(key) and value:
                orientaciones.append(value)
    result["orientaciones"] = unica(orientaciones)

    return result


# -----------------------------------------------------------------------------
# Clasificación Híbrida (Oficial + Nombre / Siglas)
# -----------------------------------------------------------------------------

def clasificar(oficial: dict[str, Any], nombre_escuela: str = "") -> tuple[str, str, str]:
    texto_oficial = normalizar(" ".join(
        oficial.get("modalidades", [])
        + oficial.get("niveles", [])
        + oficial.get("ciclos", [])
        + oficial.get("orientaciones", [])
    ))
    
    nombre_n = normalizar(nombre_escuela)
    texto_completo = texto_oficial + " " + nombre_n

    # 1. NIVEL SUPERIOR / FORMACIÓN DOCENTE
    if "SUPERIOR" in texto_completo or "INSTITUTO NORMAL" in nombre_n or "ISFD" in nombre_n:
        if any(x in texto_completo for x in ["DOCENTE", "PROFESORADO", "EDUCACION"]):
            return "Instituciones Pedagógicas", "Formación Docente Inicial", "HIBRIDO_SUPERIOR_DOCENTE"
        return "Instituciones Pedagógicas", "Nivel Superior / Terciario", "HIBRIDO_SUPERIOR"

    # 2. ESCUELAS TÉCNICAS Y AGROPECUARIAS (IPET / IPEA / IPEMYT)
    es_tecnica_sigla = any(sigla in nombre_n for sigla in ["IPET", "IPEA", "IPEMYT", "IPETAYM", "I.P.E.T.", "I.P.E.A.", "I.P.E.M.Y.T."])
    es_tecnica_generica = any(x in texto_completo for x in ["TECNICA", "TECNICO", "AGROPECUARIA", "AGROPECUARIO", "AGRARIA"])

    if es_tecnica_sigla or es_tecnica_generica:
        # Si es IPEA o tiene términos agropecuarios claros
        if any(x in texto_completo for x in [
            "AGRO", "ALIMENTOS", "PRODUCCION AGROPECUARIA", "BIOAGRO", "AGRARIA", 
            "AGRICOLA", "VETERINARIA", "RURAL", "AMBIENTE", "LECHERIA"
        ]) or "IPEA" in nombre_n:
            return "Orientaciones Técnicas y de Producción", "Bioagroindustria, Agro y Ambiente", "SIGLA_AGRO"

        # Si es IPET / IPEMYT o tiene términos industriales/tecnológicos
        if any(x in texto_completo for x in [
            "QUIMICA", "PROCESOS", "ELECTROMECANICA", "MECANICA", "ELECTRONICA", 
            "MAESTROS MAYORES DE OBRAS", "CONSTRUCCIONES", "INFORMATICA", "PROGRAMACION", 
            "AUTOMOTOR", "METALURGICA", "INDUSTRIAL"
        ]) or "IPET" in nombre_n or "IPEMYT" in nombre_n:
            return "Orientaciones Técnicas y de Producción", "Industria y Nuevas Tecnologías", "SIGLA_INDUSTRIAL"
        
        return "Orientaciones Técnicas y de Producción", "Técnicas y de Producción General", "SIGLA_TECNICA"

    # 3. CIENCIAS SOCIALES Y HUMANIDADES / CENMA / BACHILLERATOS
    if any(x in texto_completo for x in [
        "SOCIALES", "HUMANIDADES", "ECONOMIA", "ADMINISTRACION", "TURISMO", 
        "COMERCIO", "ARTE", "ARTES", "MULTIMEDIA", "COMUNICACION", 
        "BACHILLER", "CENMA", "CENPA"
    ]):
        if any(x in texto_completo for x in ["ECONOMIA", "ADMINISTRACION", "TURISMO", "COMERCIO"]):
            return "Ciencias Sociales y Humanidades", "Economía y Administración / Turismo", "SIGLA_SOCIALES"
        if any(x in texto_completo for x in ["ARTE", "ARTES", "MULTIMEDIA", "COMUNICACION"]):
            return "Ciencias Sociales y Humanidades", "Artes y Multimedia", "SIGLA_SOCIALES"
        return "Ciencias Sociales y Humanidades", "Ciencias Sociales y Humanidades", "SIGLA_SOCIALES"

    # 4. RESPALDO GENERAL PARA SECUNDARIAS
    if nombre_n:
        return "Ciencias Sociales y Humanidades", "Orientación General / Socio-Comunitaria", "SIGLA_GENERAL"

    return "SIN CLASIFICAR", "Sin especificar", "FALLO_TOTAL"

# -----------------------------------------------------------------------------
# Caché
# -----------------------------------------------------------------------------

def cargar_cache(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def guardar_cache(path: Path, cache: dict[str, Any]) -> None:
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


# -----------------------------------------------------------------------------
# Proceso
# -----------------------------------------------------------------------------

def cargar_escuelas(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("escuelas"), list):
        return data["escuelas"]
    raise ValueError("data/escuelas.json debe ser una lista o un objeto con clave 'escuelas'.")


def procesar(entrada: Path, salida: Path, informe: Path, cache_path: Path, max_workers: int) -> None:
    escuelas = cargar_escuelas(entrada)
    print(f"Escuelas leídas: {len(escuelas)}")

    claves = [obtener_cueanexo(e) for e in escuelas]
    cueanexos = list(dict.fromkeys(ca for ca, _ in claves if ca))
    print(f"CUEANEXO identificados: {len(cueanexos)}")

    cache = cargar_cache(cache_path)
    pendientes = [ca for ca in cueanexos if ca not in cache]
    print(f"Fichas pendientes de consultar: {len(pendientes)}")

    if pendientes:
        session = requests.Session()
        session.headers.update(HEADERS)

        prueba = pendientes[:5]
        print("\nPrueba inicial de fuente oficial (hasta 5 fichas)...")
        for ca in prueba:
            key, status, html = fetch_html(ca, session)
            parsed = parse_ficha(key, status, html)
            cache[key] = parsed

        guardar_cache(cache_path, cache)

        restantes = [ca for ca in pendientes if ca not in cache]
        print(f"\nConsultando las {len(restantes)} fichas restantes con {max_workers} conexiones simultáneas...")

        def worker(ca: str) -> tuple[str, str, dict[str, Any]]:
            s = requests.Session()
            s.headers.update(HEADERS)
            key, status, html = fetch_html(ca, s)
            parsed = parse_ficha(key, status, html)
            return key, status, parsed

        done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = {ex.submit(worker, ca): ca for ca in restantes}
            for fut in concurrent.futures.as_completed(futures):
                ca = futures[fut]
                try:
                    key, status, parsed = fut.result()
                    cache[key] = parsed
                except Exception as exc:
                    cache[ca] = {
                        "url": BASE_FICHA.format(ca),
                        "estadoConsulta": f"ERROR_{type(exc).__name__}",
                        "nombre": [], "modalidades": [], "niveles": [], "ciclos": [],
                        "planesEstudio": [], "orientaciones": [],
                    }
                done += 1
                if done % 50 == 0 or done == len(restantes):
                    print(f"  Procesadas {done}/{len(restantes)}")
                if done % 100 == 0:
                    guardar_cache(cache_path, cache)

        guardar_cache(cache_path, cache)

    enriquecidas = []
    detalle = []
    contadores = Counter()

    for e, (ca, cue) in zip(escuelas, claves):
        out = dict(e)
        oficial = cache.get(ca, {}) if ca else {}
        status = oficial.get("estadoConsulta", "SIN_CUEANEXO")
        nombre_escuela = e.get("nombre", "")

        categoria, subcategoria, metodo = clasificar(oficial, nombre_escuela)

        out["fuenteOficial"] = {
            "nombre": oficial.get("nombre", []),
            "tipoEducacionModalidad": oficial.get("modalidades", []),
            "niveles": oficial.get("niveles", []),
            "ciclos": oficial.get("ciclos", []),
            "orientaciones": oficial.get("orientaciones", []),
            "planesEstudio": oficial.get("planesEstudio", []),
            "estadoConsulta": status,
            "urlFicha": oficial.get("url") or (BASE_FICHA.format(ca) if ca else ""),
            "fuente": FUENTE,
            "observacionFuente": OBSERVACION_FUENTE,
        }
        out["categoriaPrecursoraOficial"] = categoria
        out["subcategoriaPrecursoraOficial"] = subcategoria
        out["metodoClasificacionOficial"] = metodo
        enriquecidas.append(out)

        contadores[status] += 1
        contadores[metodo] += 1
        detalle.append({
            "id": e.get("id"),
            "nombreOriginal": nombre_escuela,
            "cueOriginal": e.get("cue", ""),
            "cueanexoConsultado": ca,
            "estadoConsulta": status,
            "categoriaProyecto": categoria,
            "subcategoriaProyecto": subcategoria,
            "metodoClasificacion": metodo,
        })

    salida.write_text(json.dumps(enriquecidas, ensure_ascii=False, indent=2), encoding="utf-8")
    informe.write_text(json.dumps({
        "fechaEjecucion": datetime.now().astimezone().isoformat(),
        "fuente": FUENTE,
        "escuelasEntrada": len(escuelas),
        "conteos": dict(contadores),
        "detalle": detalle,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nProceso terminado exitosamente.")
    print(f"  Salida:    {salida}")
    print(f"  Auditoría: {informe}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", default="data/escuelas.json")
    parser.add_argument("--salida", default="data/escuelas_enriquecidas.json")
    parser.add_argument("--informe", default="data/informe_cruce_padron.json")
    parser.add_argument("--cache", default="data/cache_fichas_oficiales.json")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    entrada = Path(args.entrada)
    salida = Path(args.salida)
    informe = Path(args.informe)
    cache = Path(args.cache)

    if not entrada.exists():
        print(f"ERROR: no existe {entrada}", file=sys.stderr)
        return 2

    salida.parent.mkdir(parents=True, exist_ok=True)

    try:
        procesar(entrada, salida, informe, cache, max(1, min(args.workers, 16)))
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())