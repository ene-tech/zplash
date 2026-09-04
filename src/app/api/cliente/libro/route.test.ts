import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es el borde de confianza del libro: solo escribe una
// sesión de cliente válida, el tipo tiene que ser uno de los tres reales y
// el mensaje no puede ir vacío ni desbordado.

const mockSesion = vi.fn();
vi.mock("@/lib/auth/clienteSession", () => ({
  leerSesionCliente: () => mockSesion(),
}));

const mockCrear = vi.fn();
const mockListar = vi.fn();
vi.mock("@/lib/dataAccess/libro", () => ({
  crearComentarioLibro: (row: unknown) => mockCrear(row),
  listarComentariosLibro: (email?: string) => mockListar(email),
}));

import { GET, POST } from "./route";

function pedir(body: unknown) {
  return POST(
    new Request("https://zplash.cl/api/cliente/libro", {
      method: "POST",
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
}

describe("POST /api/cliente/libro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSesion.mockResolvedValue({ clienteIds: ["c1"], email: "ana@ejemplo.com", exp: Date.now() + 60_000 });
    mockCrear.mockResolvedValue(true);
  });

  it("guarda el comentario con el email de la sesión, no uno del body", async () => {
    const res = await pedir({ tipo: "reclamo", mensaje: "  El túnel rayó mi auto  ", email: "otro@ejemplo.com" });
    expect(res.status).toBe(200);
    expect(mockCrear).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@ejemplo.com", tipo: "reclamo", mensaje: "El túnel rayó mi auto" })
    );
  });

  it("sin sesión no escribe nada", async () => {
    mockSesion.mockResolvedValue(null);
    const res = await pedir({ tipo: "reclamo", mensaje: "hola" });
    expect(res.status).toBe(401);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("rechaza un tipo que no es de los tres del libro", async () => {
    const res = await pedir({ tipo: "insulto", mensaje: "hola" });
    expect(res.status).toBe(400);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("rechaza mensaje vacío o solo espacios", async () => {
    const res = await pedir({ tipo: "sugerencia", mensaje: "   " });
    expect(res.status).toBe(400);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("rechaza un mensaje más largo que el tope", async () => {
    const res = await pedir({ tipo: "sugerencia", mensaje: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("responde 400 (no 500) con body null o mensaje que no es string", async () => {
    expect((await pedir(null)).status).toBe(400);
    expect((await pedir({ tipo: "reclamo", mensaje: 123 })).status).toBe(400);
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("una sesión vieja sin email no escribe: 401", async () => {
    // Hay cookies vigentes emitidas cuando el payload no traía email (duran
    // 30 días); no pueden colarse al NOT NULL de la tabla.
    mockSesion.mockResolvedValue({ clienteIds: ["c1"], exp: Date.now() + 60_000 });
    const res = await pedir({ tipo: "reclamo", mensaje: "hola" });
    expect(res.status).toBe(401);
    expect(mockCrear).not.toHaveBeenCalled();
  });
});

describe("GET /api/cliente/libro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSesion.mockResolvedValue({ clienteIds: ["c1"], email: "ana@ejemplo.com", exp: Date.now() + 60_000 });
    mockListar.mockResolvedValue([]);
  });

  it("lista SOLO lo del email de la sesión, nunca el libro completo", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockListar).toHaveBeenCalledWith("ana@ejemplo.com");
  });

  it("una sesión vieja sin email no lee nada: 401", async () => {
    // Sin este guard, email undefined caía a la rama sin filtro de
    // listarComentariosLibro y devolvía los reclamos de TODOS los clientes.
    mockSesion.mockResolvedValue({ clienteIds: ["c1"], exp: Date.now() + 60_000 });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockListar).not.toHaveBeenCalled();
  });
});
