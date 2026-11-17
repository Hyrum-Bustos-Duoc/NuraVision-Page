#!/usr/bin/env bash
# Descarga el modelo de deteccion de manos de MediaPipe y comprueba su hash.
# Uso, desde services/api:  ./scripts/descargar_modelo.sh
set -euo pipefail

URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
# sha256 del archivo con el que se probo (2026-11-10). Si Google lo actualiza,
# el hash cambia y el script se detiene en vez de usar un modelo distinto sin avisar.
SHA256="fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"
DESTINO="$(cd "$(dirname "$0")/.." && pwd)/models/hand_landmarker.task"

mkdir -p "$(dirname "$DESTINO")"
curl -fL --progress-bar -o "$DESTINO" "$URL"
CALCULADO="$(shasum -a 256 "$DESTINO" | cut -d' ' -f1)"
if [ "$CALCULADO" != "$SHA256" ]; then
  rm -f "$DESTINO"
  echo "El hash no coincide (esperado $SHA256, obtenido $CALCULADO). Archivo borrado." >&2
  exit 1
fi
echo "Modelo listo en $DESTINO"
