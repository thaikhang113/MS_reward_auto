@echo off
title Bing Rewards Automation - Cyber Edition
color 0B

echo ==============================================================
echo       BING REWARDS AUTOMATION - CYBER GLASSMORPHISM UI
echo                        Version 2026
echo ==============================================================
echo.
echo Khoi dong Server Backend...
echo Dang tu dong mo trinh duyet Dashboard (http://localhost:3000)
echo.

cd /d "%~dp0controller"
start http://localhost:3000
node index.js

echo.
echo Server da dung hoac xay ra loi! Thu kiem tra cac file controller.
pause
