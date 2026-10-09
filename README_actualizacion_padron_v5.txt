V5 INTEGRADA - ACTUALIZACIÓN Y CLASIFICACIÓN AUTOMÁTICA
============================================================

OBJETIVO
--------
Con un único doble clic sobre ejecutar_actualizacion_padron_v5.bat se
actualizan los datos oficiales y luego se reconstruye automáticamente la
clasificación final que utiliza la página.

FLUJO
-----
data/escuelas.json
       |
       v
actualizar_escuelas_oficial_v5.py
       |
       +--> data/escuelas_enriquecidas.json
       +--> data/informe_cruce_padron.json
       +--> data/cache_fichas_oficiales.json
       |
       v
clasificar_precursoras.py
       |
       +--> data/escuelas_enriquecidas_clasificadas.json
       +--> data/informe_clasificacion_precursoras.json
       +--> data/resumen_clasificacion_precursoras.csv

CAMBIO IMPORTANTE DE ESTA VERSIÓN
----------------------------------
La V5 anterior consultaba y analizaba los planes oficiales, pero al generar
escuelas_enriquecidas.json descartaba planesEstudio y reemplazaba
orientaciones por la subcategoría. Eso impedía reconstruir automáticamente
la clasificación final.

La V5 integrada conserva ahora:
  fuenteOficial.orientaciones
  fuenteOficial.planesEstudio

Por eso la segunda etapa puede clasificar cada plan oficial y generar el
JSON final que utiliza la aplicación.

CLASIFICACIÓN
-------------
El clasificador utiliza las reglas de clasificación que se encontraban
representadas en resumen_clasificacion_precursoras.csv del proyecto.

Las reglas se aplican por:
  nivel del plan + orientación oficial.

Cuando una orientación no tiene una regla explícita:
  categoria = SIN CLASIFICAR
  subcategoria = Revisar: ...
  metodo = FUENTE_OFICIAL_SIN_REGLA

No se fuerza una categoría inventada.

ARCHIVOS QUE DEBEN QUEDAR EN LA CARPETA PRINCIPAL
-------------------------------------------------
actualizar_escuelas_oficial_v5.py
clasificar_precursoras.py
ejecutar_actualizacion_padron_v5.bat
index.html
app.js
style.css
README_actualizacion_padron_v5.txt

Y dentro de data/:
  escuelas.json
  departamentos.json
  data_provincia.js
  etc.

USO
---
1. Reemplazar actualizar_escuelas_oficial_v5.py por la versión integrada.
2. Copiar clasificar_precursoras.py a la carpeta principal.
3. Reemplazar ejecutar_actualizacion_padron_v5.bat por el BAT integrado.
4. Hacer doble clic en ejecutar_actualizacion_padron_v5.bat.
5. Esperar a que termine.

No hace falta ejecutar manualmente el clasificador.

RESPALDO
--------
Antes de reemplazar archivos se recomienda guardar una copia de:
  data/escuelas_enriquecidas_clasificadas.json

El clasificador crea además:
  data/escuelas_enriquecidas_clasificadas.json.bak

si ya existía una clasificación anterior.

NOTA SOBRE EL EXCEL
-------------------
Esta integración no inventa ni incorpora un Excel que actualmente no esté
en la carpeta del proyecto. La clasificación automática se reconstruye a
partir de los planes de estudio oficiales que conserva la V5. El informe de
cruce de padrón y la caché siguen siendo generados por la primera etapa.
