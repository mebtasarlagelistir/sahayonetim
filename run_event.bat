@echo off
REM MEMSKOR Etkinlik Sunucusu - cokerse/yanit vermezse otomatik yeniden baslatir.
REM Cift tiklayarak veya komut satirindan calistirabilirsiniz. Durdurmak: bu pencerede Ctrl+C.
cd /d "%~dp0"
where python >nul 2>nul && (
    python run_event.py
) || (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" run_event.py
)
echo.
echo Supervizor durdu. Pencereyi kapatabilirsiniz.
pause
