import { reglaPatentesVigente } from "@/lib/serverActions";
import type { Cupon } from "@/types";

/** El ticket con la regla de patentes que tiene hoy en la base, para validar
 * el canje con ella y no con la copia que el mesón cargó al abrir (el dueño
 * de un Pack de Tickets la cambia desde Mi Cuenta). Además, como el canje
 * guarda la fila completa del cupón, así no se pisa la regla nueva con la
 * vieja. Si la consulta falla (sin conexión) queda la copia local: el canje
 * igual va a necesitar red para guardarse. */
export async function conReglaVigente(cupon: Cupon): Promise<Cupon> {
  try {
    const patentes = await reglaPatentesVigente(cupon.codigo);
    if (patentes === null) return cupon;
    return { ...cupon, patentesAutorizadas: patentes.length ? patentes : undefined };
  } catch {
    return cupon;
  }
}
