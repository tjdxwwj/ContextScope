# ContextScope 独立服务快速启动脚本

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔍 ContextScope Independent Server Launcher              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查是否已构建
if (-not (Test-Path "dist\src\server.js")) {
    Write-Host "⚠️  Project not built. Building..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build completed" -ForegroundColor Green
}

# 启动服务
Write-Host ""
Write-Host "🚀 Starting ContextScope Independent Server..." -ForegroundColor Green
Write-Host ""

npm run start:server
