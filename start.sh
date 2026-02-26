#!/bin/bash
npm run server:dev &
BACKEND_PID=$!
npm run expo:dev &
FRONTEND_PID=$!
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
