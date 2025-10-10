@echo off
echo 启动本地 HTTP 服务...
start "" http://localhost:8004/
python -m http.server 8004
pause
