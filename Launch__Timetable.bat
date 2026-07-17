@echo off
echo Starting Backend Server...
start cmd /k "cd backend && ..\.venv\Scripts\python.exe -m uvicorn main:app --reload"

echo Starting Frontend Server...
start cmd /k "cd frontend && npm run dev"

echo App is launching! Open http://localhost:5173 in your browser.
pause