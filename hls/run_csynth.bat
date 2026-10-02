@echo off
REM C synthesis of the dual-head QCSNN IP with the local Vitis 2026.1 install.
REM Output goes to hls\work_csynth. The synthesis report is at
REM   hls\work_csynth\hls\syn\report\*_csynth.rpt   (exact folder may differ; search for csynth.rpt)
REM Usage: double-click or run from any shell. Takes a while; expect minutes to hours.
call E:\Xilinx\2026.1\Vitis\settings64.bat
cd /d "%~dp0"
v++ -c --mode hls --config hls_config.cfg --work_dir work_csynth
echo.
echo exit code: %ERRORLEVEL%
