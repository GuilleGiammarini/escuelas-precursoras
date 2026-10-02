V5 - DATOS OFICIALES POR CUEANEXO

1) Colocar en la carpeta principal del proyecto:
   - actualizar_escuelas_oficial_v5.py
   - ejecutar_actualizacion_padron_v5.bat

2) Mantener data/escuelas.json como está.

3) Ejecutar el .bat.

4) La primera ejecución prueba hasta 5 fichas oficiales antes de procesar todo.
   Si ninguna responde, el proceso se detiene para evitar generar datos engañosos.

5) La ejecución genera:
   data/escuelas_enriquecidas.json
   data/informe_cruce_padron.json
   data/cache_fichas_oficiales.json

6) La caché permite volver a ejecutar sin repetir las consultas ya realizadas.

Fuente oficial:
https://mapa.educacion.gob.ar/legajo/{CUEANEXO}

La ficha oficial publica, cuando están disponibles, el tipo de educación/modalidad,
los niveles y los planes de estudio con orientación.
