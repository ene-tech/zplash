// Una foto de la fila solo sirve si es de recién: mostrar la de hace media
// hora es peor que no mostrar nada -- manda al cliente a un local lleno
// creyendo que está vacío. Si el script del local se cayó o el PC se apagó,
// la última foto sigue en el bucket y hay que descartarla por edad.
//
// 2 minutos = 12 ciclos del script (sube cada 10s), holgado para un par de
// fallos de red seguidos sin llegar a mostrar una fila que ya cambió.
export const MAX_EDAD_FOTO_FILA_MS = 2 * 60 * 1000;

export function fotoFilaFresca(capturadoEn: string | null | undefined, ahora: number = Date.now()): boolean {
  if (!capturadoEn) return false;
  const t = new Date(capturadoEn).getTime();
  if (Number.isNaN(t)) return false;
  return ahora - t <= MAX_EDAD_FOTO_FILA_MS;
}
