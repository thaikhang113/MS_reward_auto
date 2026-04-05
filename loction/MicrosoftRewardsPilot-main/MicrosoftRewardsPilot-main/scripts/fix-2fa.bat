@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Microsoft Rewards 2FA 修复工具
REM 2FA Fix Tool for Microsoft Rewards

echo ==========================================
echo Microsoft Rewards 2FA 修复工具
echo 2FA Fix Tool for Microsoft Rewards
echo ==========================================
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    echo ❌ Node.js not found, please install Node.js first
    pause
    exit /b 1
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm 未安装，请先安装 npm
    echo ❌ npm not found, please install npm first
    pause
    exit /b 1
)

echo ✅ Node.js 和 npm 已安装
echo ✅ Node.js and npm are installed
echo.

REM 检查依赖
echo 📦 检查项目依赖...
echo 📦 Checking project dependencies...

if not exist "node_modules" (
    echo ⚠️ 项目依赖未安装，正在安装...
    echo ⚠️ Dependencies not installed, installing...
    npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

echo ✅ 依赖检查完成
echo ✅ Dependencies check completed
echo.

REM 提供选项菜单
echo 请选择操作 / Please select an option:
echo 1. 运行手动2FA验证工具 / Run manual 2FA verification tool
echo 2. 查看2FA解决方案指南 / View 2FA solution guide
echo 3. 检查当前登录状态 / Check current login status
echo 4. 清除会话数据 / Clear session data
echo 5. 退出 / Exit
echo.

set /p choice="请输入选项 (1-5) / Enter option (1-5): "

if "%choice%"=="1" goto option1
if "%choice%"=="2" goto option2
if "%choice%"=="3" goto option3
if "%choice%"=="4" goto option4
if "%choice%"=="5" goto option5
goto invalid

:option1
echo.
echo 🚀 启动手动2FA验证工具...
echo 🚀 Starting manual 2FA verification tool...
echo.
echo 注意事项 / Important notes:
echo - 工具会打开浏览器窗口
echo - Tool will open a browser window
echo - 请按照屏幕提示完成验证
echo - Please follow the on-screen instructions
echo - 完成后会自动保存会话数据
echo - Session data will be saved automatically upon completion
echo.
pause

npx tsx src/manual-2fa-helper.ts
goto end

:option2
echo.
echo 📖 显示2FA解决方案指南...
echo 📖 Displaying 2FA solution guide...
echo.

if exist "MOBILE_2FA_SOLUTION_GUIDE.md" (
    type "MOBILE_2FA_SOLUTION_GUIDE.md"
) else (
    echo ❌ 指南文件未找到
    echo ❌ Guide file not found
)
echo.
pause
goto end

:option3
echo.
echo 🔍 检查登录状态...
echo 🔍 Checking login status...
echo.

if exist "sessions" (
    set session_count=0
    for %%f in (sessions\*.json) do (
        set /a session_count+=1
    )
    echo 📁 发现 !session_count! 个会话文件
    echo 📁 Found !session_count! session files
    
    if !session_count! gtr 0 (
        echo 📄 会话文件列表 / Session files:
        dir /b sessions\*.json
    )
) else (
    echo 📁 sessions 目录不存在
    echo 📁 sessions directory does not exist
)
echo.
pause
goto end

:option4
echo.
echo 🗑️  清除会话数据...
echo 🗑️  Clearing session data...

set /p confirm="确认清除所有会话数据？(y/N) / Confirm clear all session data? (y/N): "

if /i "%confirm%"=="y" (
    if exist "sessions" (
        del /q sessions\* >nul 2>&1
        echo ✅ 会话数据已清除
        echo ✅ Session data cleared
    ) else (
        echo 📁 sessions 目录不存在，无需清除
        echo 📁 sessions directory does not exist, nothing to clear
    )
) else (
    echo ❌ 操作已取消
    echo ❌ Operation cancelled
)
echo.
pause
goto end

:option5
echo.
echo 👋 退出工具
echo 👋 Exiting tool
exit /b 0

:invalid
echo.
echo ❌ 无效选项，请选择 1-5
echo ❌ Invalid option, please choose 1-5
pause
exit /b 1

:end
echo.
echo ==========================================
echo 操作完成 / Operation completed
echo 如需帮助，请查看 MOBILE_2FA_SOLUTION_GUIDE.md
echo For help, please check MOBILE_2FA_SOLUTION_GUIDE.md
echo ==========================================
pause 