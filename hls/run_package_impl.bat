@echo off
REM Step 1: export the synthesized IP (needs run_csynth.bat to have finished).
REM Step 2: Vivado out-of-context synthesis + place&route of the IP alone -> real LUT/DSP/timing numbers.
REM Uses the Vivado 2026.1 environment (it also sets up Vitis HLS).
call E:\Xilinx\2026.1\Vivado\settings64.bat
cd /d "%~dp0"
echo ===== PACKAGE =====
call vitis-run --mode hls --package --config hls_config.cfg --work_dir work_csynth
echo package exit code: %ERRORLEVEL%
echo ===== IMPL =====
call vitis-run --mode hls --impl --config hls_config.cfg --work_dir work_csynth
echo impl exit code: %ERRORLEVEL%
echo exit code: done
