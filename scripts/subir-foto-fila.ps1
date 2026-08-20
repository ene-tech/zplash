# Sube al servidor una foto de la fila de entrada cada 10 segundos, para la
# seccion "Como esta la fila ahora?" del Portal Cliente (ver
# src/components/cliente/miCuenta/FilaEnVivo.tsx).
#
# Corre en el PC del local, que es el unico que ve la camara Hikvision por
# LAN. Empuja hacia afuera en vez de que el servidor entre a buscar la imagen:
# asi el NVR no necesita puerto abierto ni IP publica.
#
# PowerShell + curl.exe (ambos vienen con Windows 10/11) y no un script .ts
# como el resto de scripts/, para no tener que instalar Node en el PC del
# local: aca no hace falta nada mas que estas dos lineas de red.
#
# Lanzarlo -- dejarlo abierto, o agregarlo como tarea al inicio de sesion:
#   powershell -ExecutionPolicy Bypass -File scripts\subir-foto-fila.ps1 `
#     -CamaraIp 192.168.1.64 -Usuario admin -Clave "clave-de-la-camara" `
#     -AppUrl https://TU-DOMINIO -Secreto "el CAMARA_FILA_SECRET del server"
#
# El canal 101 es "camara 1, stream principal" en ISAPI. Si la camara que
# apunta a la fila es otra, pasar -Canal 201 (camara 2), 301, etc.
param(
  [Parameter(Mandatory=$true)][string]$CamaraIp,
  [Parameter(Mandatory=$true)][string]$Usuario,
  [Parameter(Mandatory=$true)][string]$Clave,
  [Parameter(Mandatory=$true)][string]$AppUrl,
  [Parameter(Mandatory=$true)][string]$Secreto,
  [string]$Canal = "101",
  [int]$CadaSegundos = 10
)

$foto = Join-Path $env:TEMP "zplash-fila.jpg"
$urlCamara = "http://$CamaraIp/ISAPI/Streaming/channels/$Canal/picture"

Write-Host "Subiendo la fila cada $CadaSegundos s desde $urlCamara -- Ctrl+C para cortar"

while ($true) {
  # curl.exe y no Invoke-WebRequest: el Hikvision pide autenticacion Digest,
  # que curl resuelve con una bandera y el cmdlet de PowerShell no soporta.
  curl.exe -s --digest -u "${Usuario}:${Clave}" $urlCamara -o $foto

  if ($LASTEXITCODE -eq 0 -and (Test-Path $foto) -and (Get-Item $foto).Length -gt 1000) {
    # El servidor revisa que sean bytes de JPEG y rechaza el resto, asi que
    # un error de la camara no pisa la ultima foto buena.
    curl.exe -s -X POST "$AppUrl/api/camara/fila" `
      -H "x-camara-secret: $Secreto" -H "Content-Type: image/jpeg" `
      --data-binary "@$foto" | Out-Null
  } else {
    Write-Host "$(Get-Date -Format HH:mm:ss) no se pudo leer la camara"
  }

  Start-Sleep -Seconds $CadaSegundos
}
