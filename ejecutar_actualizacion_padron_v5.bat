@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo =================================================
echo ACTUALIZAR ESCUELAS CON DATOS OFICIALES - V5
echo =================================================
echo.
echo Instalando dependencias...
python -m pip install requests beautifulsoup4
if errorlevel 1 (
    echo.
    echo ERROR instalando dependencias.
    pause
    exit /b 1
)

echo.
echo Ejecutando actualizacion oficial...
python actualizar_escuelas_oficial_v5.py
if errorlevel 1 (
    echo.
    echo ERROR durante la actualizacion.
    pause
    exit /b 1
)

echo.
echo =================================================
echo PROCESO TERMINADO CORRECTAMENTE
echo =================================================
echo.
echo Archivos generados:
echo   data\escuelas_enriquecidas.json
echo   data\informe_cruce_padron.json
echo   data\cache_fichas_oficiales.json
echo.
pause
