
import json
from pathlib import Path

archivo = Path("data/escuelas_enriquecidas.json")

with archivo.open("r", encoding="utf-8-sig") as f:
    datos = json.load(f)

if isinstance(datos, list):
    escuelas = datos
else:
    escuelas = next(
        datos[k]
        for k in ("escuelas", "establecimientos", "datos", "results")
        if isinstance(datos.get(k), list)
    )

for escuela in escuelas:
    if not isinstance(escuela, dict):
        continue

    fuente = escuela.get("fuenteOficial", {})
    if not isinstance(fuente, dict):
        continue

    planes = fuente.get("planesEstudio", [])

    if planes:
        print("\n--- EJEMPLO DE ESTABLECIMIENTO ---")
        print("ID:", escuela.get("id"))
        print("Nombre:", escuela.get("nombre"))
        print("Nivel:", escuela.get("nivel"))
        print("Estructura real de planesEstudio:")
        print(json.dumps(
            planes,
            ensure_ascii=False,
            indent=2
        )[:7000])
        break
else:
    print("No se encontraron planes en fuenteOficial.planesEstudio.")