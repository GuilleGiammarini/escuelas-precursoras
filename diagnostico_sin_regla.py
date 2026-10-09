
import json
from pathlib import Path
from collections import Counter

archivo = Path("data/escuelas_enriquecidas_clasificadas.json")

with archivo.open("r", encoding="utf-8-sig") as f:
    datos = json.load(f)

if isinstance(datos, list):
    escuelas = datos
elif isinstance(datos, dict):
    escuelas = next(
        (
            datos[k] for k in (
                "escuelas", "establecimientos", "datos", "results"
            )
            if isinstance(datos.get(k), list)
        ),
        []
    )
else:
    escuelas = []

print("Establecimientos:", len(escuelas))

conteo = Counter()
muestras = []

for escuela in escuelas:
    if not isinstance(escuela, dict):
        continue

    pendientes = escuela.get("planesSinRegla", [])

    if not pendientes:
        continue

    if not isinstance(pendientes, list):
        pendientes = [pendientes]

    fuente = escuela.get("fuenteOficial", {})
    planes = fuente.get("planesEstudio", []) if isinstance(fuente, dict) else []

    for pendiente in pendientes:
        if isinstance(pendiente, dict):
            nivel = pendiente.get("Nivel", pendiente.get("nivel", ""))
            orientacion = pendiente.get(
                "Orientación",
                pendiente.get("orientacionOficial",
                pendiente.get("orientacion", ""))
            )
            detalle = pendiente
        else:
            nivel = ""
            orientacion = str(pendiente)
            detalle = pendiente

        clave = (str(nivel), str(orientacion))
        conteo[clave] += 1

        if len(muestras) < 30:
            muestras.append({
                "escuela": escuela.get("nombre", ""),
                "nivelEstablecimiento": escuela.get("nivel", ""),
                "pendiente": detalle,
                "planesOficiales": planes
            })

print("\nORIENTACIONES PENDIENTES MÁS FRECUENTES:")
for (nivel, orientacion), cantidad in conteo.most_common(40):
    print(f"{cantidad:4} | {nivel} | {orientacion}")

print("\nMUESTRA DE PENDIENTES:")
print(json.dumps(muestras, ensure_ascii=False, indent=2)[:18000])

if not conteo and not muestras:
    print(
        "\nNo se encontraron pendientes en el campo 'planesSinRegla'. "
        "Hay que revisar la estructura del informe generado."
    )