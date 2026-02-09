#!/bin/bash
set -e
echo "Iniciando OpenClaw Gateway..."
exec openclaw gateway --port "$OPENCLAW_PORT" --bind lan --allow-unconfigured