@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "%~dp0"

echo ============================================================
echo   ACTUALIZACION COMPLETA - ESCUELAS PRECURSORAS
echo ============================================================
echo.
echo Este proceso ejecuta automaticamente:
echo   1) Enriquecimiento oficial V5
echo   2) Clasificacion por planes de estudio oficiales
echo   3) Generacion de JSON, informe y CSV finales
echo.

echo [1/3] Verificando Python...
py --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: No se encontro Python mediante el comando "py".
    echo Instala Python y volve a ejecutar este archivo.
    pause
    exit /b 1
)

echo.
echo [2/3] Instalando/actualizando dependencias...
py -m pip install requests beautifulsoup4
if errorlevel 1 (
    echo.
    echo ERROR instalando dependencias.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   PASO 1 - DATOS OFICIALES
echo ============================================================
py actualizar_escuelas_oficial_v5.py
if errorlevel 1 (
    echo.
    echo ERROR durante la actualizacion oficial.
    echo No se ejecutara la clasificacion para evitar generar datos
    echo finales incompletos.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   PASO 2 - CLASIFICACION DE PRECURSORAS
echo ============================================================
py clasificar_precursoras.py
if errorlevel 1 (
    echo.
    echo ERROR durante la clasificacion.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   PROCESO COMPLETADO
echo ============================================================
echo.
echo Archivos actualizados:
echo   data\escuelas_enriquecidas.json
echo   data\escuelas_enriquecidas_clasificadas.json
echo   data\informe_cruce_padron.json
echo   data\informe_clasificacion_precursoras.json
echo   data\resumen_clasificacion_precursoras.csv
echo.
echo La pagina utiliza:
echo   data\escuelas_enriquecidas_clasificadas.json
echo.
pause
exit /b 0
