# ============================================================
# clasificar_precursoras.py
# Clasificación de escuelas precursoras de Córdoba
#
# Entrada:
#   data/escuelas_enriquecidas.json
#
# Salidas:
#   data/escuelas_enriquecidas_clasificadas.json
#   data/informe_clasificacion_precursoras.json
#   data/resumen_clasificacion_precursoras.csv
#
# El archivo original no se modifica.
# La clasificación se realiza plan por plan, usando por separado
# los campos oficiales "Nivel" y "Orientación".
# ============================================================

import csv
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

ARCHIVO_ENTRADA = DATA_DIR / "escuelas_enriquecidas.json"
ARCHIVO_SALIDA = DATA_DIR / "escuelas_enriquecidas_clasificadas.json"
ARCHIVO_INFORME = DATA_DIR / "informe_clasificacion_precursoras.json"
ARCHIVO_CSV = DATA_DIR / "resumen_clasificacion_precursoras.csv"

CAT_TECNICA = (
    "Orientaciones Técnicas y de Producción "
    "(Alimentos y Bioagroindustria)"
)
CAT_SOCIALES = "Ciencias Sociales y Humanidades"
CAT_PEDAGOGICA = (
    "Instituciones Pedagógicas "
    "(Nivel Superior de Formación Docente)"
)
CATEGORIAS_VALIDAS = {CAT_TECNICA, CAT_SOCIALES, CAT_PEDAGOGICA}


def normalizar(texto):
    """Minúsculas, sin tildes y con espacios normalizados."""
    if texto is None:
        return ""
    texto = str(texto).strip().lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(
        c for c in texto if unicodedata.category(c) != "Mn"
    )
    texto = re.sub(r"[^a-z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def contiene(texto, expresiones):
    texto = normalizar(texto)
    for expresion in expresiones:
        expresion = normalizar(expresion)
        if expresion and re.search(
            r"(?<![a-z0-9])" + re.escape(expresion) + r"(?![a-z0-9])",
            texto,
        ):
            return True
    return False


def primer_valor(diccionario, claves, predeterminado=""):
    if not isinstance(diccionario, dict):
        return predeterminado
    for clave in claves:
        valor = diccionario.get(clave)
        if valor is not None and str(valor).strip():
            return valor
    return predeterminado


def obtener_planes(escuela):
    fuente = escuela.get("fuenteOficial", {})
    if not isinstance(fuente, dict):
        return []
    planes = fuente.get("planesEstudio", [])
    if isinstance(planes, list):
        return planes
    if isinstance(planes, dict):
        for clave in ("planes", "items", "resultados"):
            if isinstance(planes.get(clave), list):
                return planes[clave]
        return [planes] if planes else []
    if isinstance(planes, str) and planes.strip():
        return [{"Orientación": planes.strip()}]
    return []


def campo_plan(plan, claves):
    return str(primer_valor(plan, claves, "") or "").strip()


def obtener_nivel_plan(plan, escuela=None):
    """
    Prioriza siempre el campo oficial Nivel del plan.
    Solo recurre al nivel de la escuela si el plan no informa nivel.
    """
    nivel = campo_plan(plan, [
        "Nivel", "nivel", "Nivel educativo", "nivelEducativo",
        "nivel_educativo", "nivelModalidad", "nivel_modalidad",
    ])
    if not nivel and isinstance(escuela, dict):
        nivel = campo_plan(escuela, [
            "nivel", "Nivel", "nivelEducativo", "nivel_educativo",
            "nivelModalidad", "nivel_modalidad",
        ])

    n = normalizar(nivel)
    if n == "snu" or "superior no universitario" in n or "superior no universitaria" in n:
        return "SNU"
    if "superior" in n:
        return "SNU"
    if "secundaria" in n or "secundario" in n:
        return "Secundaria"
    if "jovenes y adultos" in n or "jovenes adultos" in n:
        return "Jóvenes y Adultos"
    if "primario" in n or "primaria" in n:
        return "Nivel Primario"
    if "inicial" in n:
        return "Nivel Inicial"
    return nivel or "Sin nivel identificado"


def obtener_orientacion_plan(plan):
    """Extrae únicamente la orientación oficial, sin mezclar Nivel/Dictado."""
    if isinstance(plan, str):
        return plan.strip()
    if not isinstance(plan, dict):
        return ""
    return campo_plan(plan, [
        "Orientación", "Orientacion", "orientación", "orientacion",
        "orientación del plan", "Orientación del plan",
        "Carrera", "carrera", "Título", "Titulo", "titulo",
    ])


def obtener_texto_completo_plan(plan):
    """Texto de apoyo para reglas específicas que también aparecen en otros campos."""
    if isinstance(plan, str):
        return plan.strip()
    if not isinstance(plan, dict):
        return ""
    claves = [
        "Nivel", "nivel", "Nivel educativo", "nivelEducativo",
        "Orientación", "Orientacion", "orientación", "orientacion",
        "Examen / Tipo", "Examen/Tipo", "Tipo", "tipo",
        "Dictado", "dictado", "Carrera", "carrera", "Título", "Titulo",
    ]
    valores = []
    for clave in claves:
        valor = plan.get(clave)
        if valor is not None and not isinstance(valor, (dict, list)):
            valor = str(valor).strip()
            if valor and valor not in valores:
                valores.append(valor)
    return " ".join(valores)


def clasificar_plan(orientacion, nivel):
    """
    Devuelve (categoría, subcategoría, regla) o None si la evidencia
    de la orientación no alcanza para clasificarla con seguridad.
    """
    orientacion_original = str(orientacion or "").strip()
    texto = normalizar(orientacion_original)
    nivel_n = normalizar(nivel)

    if not texto:
        return None

    # 1. Formación docente: se requiere una señal explícita.
    # Las carreras de Educación Inicial, Primaria y Especial del SNU
    # se consideran formación docente según el catálogo oficial recibido.
    if nivel == "SNU" and contiene(texto, [
        "educacion primaria", "educacion primaria egb", "educacion nivel inicial",
        "educacion inicial", "educacion especial", "profesorado",
        "formacion docente", "formacion de docentes",
        "docente de nivel inicial", "docente de nivel primario",
        "docente de nivel secundario", "profesor de educacion",
        "profesora de educacion",
    ]):
        return CAT_PEDAGOGICA, "Formación Docente Inicial", "FORMACION_DOCENTE"

    if nivel == "SNU" and contiene(texto, [
        "profesorado", "formacion docente", "formacion de docentes",
        "docente de nivel inicial", "docente de nivel primario",
        "docente de nivel secundario", "profesor de educacion",
        "profesora de educacion",
    ]):
        return CAT_PEDAGOGICA, "Formación Docente Inicial", "FORMACION_DOCENTE"

    # 2. Salud: tecnología/laboratorio y áreas asistenciales se distribuyen
    # dentro de las tres categorías existentes, sin crear una cuarta.
    if contiene(texto, [
        "optica", "ortesis", "protesis", "laboratorio", "radiologia",
        "radioterapia", "diagnostico por imagenes", "instrumentacion quirurgica",
        "bioimagenes", "tecnologia medica", "analisis clinicos", "hemoterapia",
        "esterilizacion", "equipamiento medico",
    ]):
        return CAT_TECNICA, "Salud y Tecnología", "SALUD_TECNOLOGICA"

    if contiene(texto, [
        "enfermeria", "auxiliar de enfermeria", "asistente gerontologico",
        "cuidados de la salud", "salud comunitaria", "promocion de la salud",
        "emergencias medicas", "acompanamiento terapeutico",
        "terapia ocupacional", "fisioterapia", "kinesiologia", "nutricion",
        "obstetricia", "medicina", "odontologia", "farmacia",
        "psicopedagogia", "psicologia",
    ]):
        return CAT_SOCIALES, "Salud", "SALUD_ASISTENCIAL"

    # 3. Orientaciones técnicas, productivas, agroambientales y tecnológicas.
    if contiene(texto, [
        "secundaria tecnica", "tecnica", "tecnico", "tecnica profesional",
        "produccion de bienes y servicios", "produccion de bienes",
        "produccion y servicios", "tecnologia", "tecnologica",
        "tecnologico", "formacion profesional tecnica",
    ]):
        return CAT_TECNICA, "Industria y Producción", "TECNICA_PRODUCCION"

    if contiene(texto, [
        "turismo", "hoteleria", "gastronomia",
    ]):
        return CAT_SOCIALES, "Turismo y Servicios", "TURISMO_SERVICIOS"

    if contiene(texto, [
        "programacion", "robotica", "informatica", "computacion",
        "computadoras", "sistemas", "software", "desarrollo de aplicaciones",
        "desarrollo web", "analisis de sistemas", "programador",
    ]):
        return CAT_TECNICA, "Nuevas Especialidades / Informática", "INFORMATICA"

    if contiene(texto, [
        "energia", "energias", "energias renovables", "sustentabilidad",
        "eficiencia energetica",
    ]):
        return CAT_TECNICA, "Energía y Sustentabilidad", "ENERGIA_SUSTENTABILIDAD"

    if contiene(texto, [
        "industria de los alimentos", "industrias de la alimentacion",
        "industria alimentaria", "tecnologia de los alimentos",
        "tecnologia alimentaria", "alimentos", "bromatologia",
    ]):
        return CAT_TECNICA, "Industria de los Alimentos / Química", "INDUSTRIA_ALIMENTOS"

    if contiene(texto, [
        "agropecuaria", "agronomia", "agricultura", "produccion agropecuaria",
        "produccion vegetal", "produccion animal", "bioagroindustria",
        "agro y ambiente", "ambiente y energias renovables", "medio ambiente",
        "ecologia", "recursos naturales", "agroambiente",
    ]):
        return CAT_TECNICA, "Bioagroindustria, Agro y Ambiente", "AGRO_AMBIENTE"

    if contiene(texto, [
        "quimica", "quimico", "seguridad industrial", "produccion industrial",
        "instalaciones industriales", "mecanica", "electromecanica",
        "electronica", "electricidad", "industrial", "automatizacion",
        "mantenimiento industrial", "metalurgia", "construcciones",
    ]):
        return CAT_TECNICA, "Industria y Producción", "INDUSTRIA_PRODUCCION"

    # 4. Ciencias Sociales y Humanidades. Reglas por orientación, no por
    # el nivel general de la escuela.
    if contiene(texto, [
        "economia y administracion", "economia y gestion",
        "administracion y gestion", "organizacion y gestion",
        "organizacion y gestion empresarial", "gestion de las organizaciones",
        "gestion administrativa", "administracion", "economia",
        "comercializacion", "comercial", "comercio", "contabilidad",
    ]):
        return CAT_SOCIALES, "Economía y Administración", "ECONOMIA_ADMINISTRACION"

    if contiene(texto, [
        "ciencias sociales", "ciencias humanas", "humanidades",
        "comunicacion", "comunicaciones", "seguridad publica",
        "historia", "geografia", "ciencia politica",
        "sociologia", "trabajo social", "desarrollo local",
        "filosofia", "derecho", "relaciones publicas", "periodismo",
        "publicidad", "teologia",
    ]):
        return CAT_SOCIALES, "Ciencias Sociales y Humanidades", "SOCIALES_HUMANIDADES"

    if contiene(texto, [
        "artistica", "artes", "artes visuales", "artes plasticas",
        "musica", "danza", "audiovisual", "multimedia", "diseno",
        "fotografia", "teatro", "canto", "escultura", "indumentaria",
        "decoracion", "dibujo", "instrumento",
    ]):
        return CAT_SOCIALES, "Artes y Multimedia", "ARTES_MULTIMEDIA"

    if contiene(texto, ["educacion fisica", "educacion corporal"]):
        return CAT_SOCIALES, "Educación Física", "EDUCACION_FISICA"

    if contiene(texto, [
        "ciencias naturales", "ciencias biologicas", "ciencias del ambiente",
        "biologia", "matematica", "fisica",
    ]):
        return CAT_SOCIALES, "Ciencias y Ambiente", "CIENCIAS_AMBIENTE"

    if contiene(texto, ["lenguas", "idiomas", "ingles", "frances", "lengua"]):
        return CAT_SOCIALES, "Idiomas y Lenguas", "IDIOMAS"

    # No se fuerza la clasificación de un "Bachiller" genérico, ni de
    # una carrera/posgrado cuya orientación no permita inferir la categoría.
    return None


def clasificar_escuela(escuela):
    planes = obtener_planes(escuela)
    planes_clasificados = []
    planes_sin_regla = []

    for plan in planes:
        nivel_plan = obtener_nivel_plan(plan, escuela)
        orientacion = obtener_orientacion_plan(plan)
        texto_completo = obtener_texto_completo_plan(plan)

        # Si no existe orientación separada, usar el texto completo como
        # último recurso, sin confundirlo con el campo Nivel cuando sí existe.
        orientacion_para_clasificar = orientacion or texto_completo
        resultado = clasificar_plan(orientacion_para_clasificar, nivel_plan)

        registro_base = {
            "nivel": nivel_plan,
            "orientacion": orientacion or "",
            "textoPlanOficial": texto_completo,
        }

        if resultado:
            categoria, subcategoria, regla = resultado
            if categoria not in CATEGORIAS_VALIDAS:
                raise ValueError(f"Categoría no válida: {categoria}")
            planes_clasificados.append({
                **registro_base,
                "categoria": categoria,
                "subcategoria": subcategoria,
                "metodoClasificacion": regla,
            })
        elif texto_completo or orientacion:
            planes_sin_regla.append(registro_base)

    categorias = sorted({p["categoria"] for p in planes_clasificados})
    subcategorias = sorted({p["subcategoria"] for p in planes_clasificados})

    if len(categorias) == 1:
        categoria_principal = categorias[0]
    elif len(categorias) > 1:
        categoria_principal = "Múltiples categorías"
    else:
        categoria_principal = ""

    if len(subcategorias) == 1:
        subcategoria_principal = subcategorias[0]
    elif len(subcategorias) > 1:
        subcategoria_principal = " / ".join(subcategorias)
    else:
        subcategoria_principal = ""

    escuela["categoriaPrecursoraOficial"] = categoria_principal
    escuela["subcategoriaPrecursoraOficial"] = subcategoria_principal
    escuela["categoriasPrecursorasOficiales"] = categorias
    escuela["subcategoriasPrecursorasOficiales"] = subcategorias
    escuela["planesClasificados"] = planes_clasificados
    escuela["planesSinRegla"] = planes_sin_regla

    if planes_clasificados:
        escuela["metodoClasificacionOficial"] = "CLASIFICACION_REGLAS_PLANES_OFICIALES"
    elif planes:
        escuela["metodoClasificacionOficial"] = "PENDIENTE_REVISION"
    else:
        escuela["metodoClasificacionOficial"] = "SIN_PLANES_OFICIALES"
    return escuela


def main():
    print()
    print("=" * 55)
    print(" CLASIFICACIÓN DE ESCUELAS PRECURSORAS")
    print("=" * 55)

    if not ARCHIVO_ENTRADA.exists():
        raise FileNotFoundError(
            f"No se encontró el archivo de entrada:\n{ARCHIVO_ENTRADA}"
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with ARCHIVO_ENTRADA.open("r", encoding="utf-8-sig") as archivo:
        datos = json.load(archivo)

    clave_lista = None
    if isinstance(datos, list):
        escuelas = datos
    elif isinstance(datos, dict):
        for clave in ("escuelas", "establecimientos", "datos", "results"):
            if isinstance(datos.get(clave), list):
                clave_lista = clave
                escuelas = datos[clave]
                break
        else:
            raise ValueError(
                "El JSON no contiene una lista reconocible de escuelas o establecimientos."
            )
    else:
        raise ValueError("El formato del JSON de entrada no es válido.")

    total_planes = 0
    total_planes_clasificados = 0
    total_planes_sin_regla = 0
    escuelas_con_planes = 0
    escuelas_sin_planes = 0
    escuelas_clasificadas = 0

    conteo_categorias = Counter()
    conteo_subcategorias = Counter()
    conteo_reglas = Counter()
    conteo_sin_regla = Counter()
    conteo_niveles = Counter()
    filas_csv = []

    for escuela in escuelas:
        if not isinstance(escuela, dict):
            continue

        planes_originales = obtener_planes(escuela)
        total_planes += len(planes_originales)
        if planes_originales:
            escuelas_con_planes += 1
        else:
            escuelas_sin_planes += 1

        clasificar_escuela(escuela)
        planes_clasificados = escuela["planesClasificados"]
        planes_sin_regla = escuela["planesSinRegla"]
        total_planes_clasificados += len(planes_clasificados)
        total_planes_sin_regla += len(planes_sin_regla)

        if planes_clasificados:
            escuelas_clasificadas += 1

        for plan in planes_clasificados:
            conteo_categorias[plan["categoria"]] += 1
            conteo_subcategorias[plan["subcategoria"]] += 1
            conteo_reglas[plan["metodoClasificacion"]] += 1
            conteo_niveles[plan["nivel"]] += 1

        for plan in planes_sin_regla:
            nivel = plan.get("nivel") or "Sin nivel identificado"
            orientacion = plan.get("orientacion") or "Sin orientación identificada"
            conteo_sin_regla[(nivel, orientacion)] += 1

        filas_csv.append({
            "id": escuela.get("id", ""),
            "cue": escuela.get("cue", escuela.get("CUE", "")),
            "cueanexo": escuela.get("cueanexo", escuela.get("CUEANEXO", "")),
            "nombre": escuela.get("nombre", escuela.get("establecimiento", "")),
            "localidad": escuela.get("localidad", ""),
            "departamento": escuela.get("departamento", ""),
            "nivelEstablecimiento": escuela.get("nivel", ""),
            "categoriaPrecursoraOficial": escuela["categoriaPrecursoraOficial"],
            "subcategoriaPrecursoraOficial": escuela["subcategoriaPrecursoraOficial"],
            "categoriasPrecursorasOficiales": " | ".join(escuela["categoriasPrecursorasOficiales"]),
            "subcategoriasPrecursorasOficiales": " | ".join(escuela["subcategoriasPrecursorasOficiales"]),
            "cantidadPlanesOficiales": len(planes_originales),
            "cantidadPlanesClasificados": len(planes_clasificados),
            "cantidadPlanesSinRegla": len(planes_sin_regla),
            "metodoClasificacionOficial": escuela["metodoClasificacionOficial"],
        })

    datos_salida = escuelas if isinstance(datos, list) else {**datos, clave_lista: escuelas}
    with ARCHIVO_SALIDA.open("w", encoding="utf-8") as archivo:
        json.dump(datos_salida, archivo, ensure_ascii=False, indent=2)

    if filas_csv:
        with ARCHIVO_CSV.open("w", newline="", encoding="utf-8-sig") as archivo:
            escritor = csv.DictWriter(
                archivo, fieldnames=list(filas_csv[0].keys()), delimiter=";"
            )
            escritor.writeheader()
            escritor.writerows(filas_csv)

    pendientes_ordenados = [
        {"nivelPlan": nivel, "orientacionPlan": orientacion, "cantidad": cantidad}
        for (nivel, orientacion), cantidad in conteo_sin_regla.most_common()
    ]

    informe = {
        "fechaEjecucion": datetime.now().astimezone().isoformat(),
        "fuente": "Mapa Educativo Nacional - Ministerio de Educación",
        "archivoEntrada": str(ARCHIVO_ENTRADA),
        "archivoSalida": str(ARCHIVO_SALIDA),
        "criterio": (
            "Clasificación realizada por plan oficial, usando por separado "
            "Nivel y Orientación. Las orientaciones sin evidencia suficiente "
            "se conservan para revisión manual."
        ),
        "categoriasValidas": [CAT_TECNICA, CAT_SOCIALES, CAT_PEDAGOGICA],
        "totalEscuelas": len(escuelas),
        "escuelasConPlanes": escuelas_con_planes,
        "escuelasSinPlanes": escuelas_sin_planes,
        "escuelasConAlMenosUnPlanClasificado": escuelas_clasificadas,
        "totalPlanesOficiales": total_planes,
        "totalPlanesClasificados": total_planes_clasificados,
        "totalPlanesSinRegla": total_planes_sin_regla,
        "porcentajePlanesClasificados": round(
            total_planes_clasificados / total_planes * 100, 2
        ) if total_planes else 0,
        "porCategoria": dict(conteo_categorias.most_common()),
        "porSubcategoria": dict(conteo_subcategorias.most_common()),
        "porRegla": dict(conteo_reglas.most_common()),
        "porNivelPlan": dict(conteo_niveles.most_common()),
        "planes_sin_regla": pendientes_ordenados,
    }

    with ARCHIVO_INFORME.open("w", encoding="utf-8") as archivo:
        json.dump(informe, archivo, ensure_ascii=False, indent=2)

    print(f"Establecimientos procesados: {len(escuelas)}")
    print(f"Establecimientos con planes: {escuelas_con_planes}")
    print(f"Establecimientos sin planes: {escuelas_sin_planes}")
    print(f"Planes oficiales: {total_planes}")
    print(f"Planes clasificados: {total_planes_clasificados}")
    print(f"Planes sin regla: {total_planes_sin_regla}")
    print()
    print("Planes clasificados por categoría:")
    for categoria, cantidad in conteo_categorias.most_common():
        print(f"  {categoria}: {cantidad}")
    print()
    print("Archivos generados:")
    print(f"  {ARCHIVO_SALIDA}")
    print(f"  {ARCHIVO_INFORME}")
    print(f"  {ARCHIVO_CSV}")
    print("=" * 55)


if __name__ == "__main__":
    main()
