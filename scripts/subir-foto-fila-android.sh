#!/data/data/com.termux/files/usr/bin/bash
# Version para un celular Android viejo del script subir-foto-fila.ps1: el
# local no tiene PC (nov-2026), asi que un celular enchufado al wifi del local
# lee la camara Hikvision por la red interna y sube la foto de la fila cada 10
# segundos a /api/camara/fila. Mismo criterio que el .ps1: el local empuja
# hacia afuera y el NVR no se abre a internet.
#
# Corre en Termux (instalar desde F-Droid, no desde Play Store: la de Play
# esta abandonada). Una vez en Termux:
#   pkg install curl
#   (copiar este archivo al celular como ~/subir-foto-fila.sh)
#   chmod +x ~/subir-foto-fila.sh
#
# Los datos van en ~/.fila.conf (no en este archivo, para no dejar claves en
# el repo):
#   CAMARA_IP=192.168.1.64
#   USUARIO=usuario-solo-lectura
#   CLAVE=clave-de-ese-usuario
#   CANAL=101            # camara 1, stream principal; 201 = camara 2, etc.
#   SECRETO=el CAMARA_FILA_SECRET de Vercel
#
# Para que arranque solo al prender el celular: instalar Termux:Boot (F-Droid),
# abrirlo una vez y crear ~/.termux/boot/fila con:
#   termux-wake-lock
#   ~/subir-foto-fila.sh >> ~/fila.log 2>&1
#
# En Ajustes de Android, quitarle a Termux la optimizacion de bateria, o el
# sistema lo corta a los minutos.

set -u
source "$HOME/.fila.conf"
CANAL="${CANAL:-101}"
CADA="${CADA:-10}"
APP_URL="${APP_URL:-https://zplash.cl}"
FOTO="$HOME/fila.jpg"
URL_CAMARA="http://$CAMARA_IP/ISAPI/Streaming/channels/$CANAL/picture"

echo "Subiendo la fila cada $CADA s desde $URL_CAMARA"

while true; do
  # --digest: el Hikvision pide autenticacion Digest.
  if curl -s --max-time 8 --digest -u "$USUARIO:$CLAVE" "$URL_CAMARA" -o "$FOTO" \
     && [ "$(wc -c < "$FOTO")" -gt 1000 ]; then
    # El servidor rechaza lo que no sea JPEG, asi que un error de la camara
    # no pisa la ultima foto buena.
    codigo=$(curl -s --max-time 15 -o /dev/null -w "%{http_code}" -X POST "$APP_URL/api/camara/fila" \
      -H "x-camara-secret: $SECRETO" -H "Content-Type: image/jpeg" --data-binary "@$FOTO")
    [ "$codigo" = "200" ] || echo "$(date +%H:%M:%S) el servidor respondio $codigo"
  else
    echo "$(date +%H:%M:%S) no se pudo leer la camara"
  fi
  sleep "$CADA"
done
