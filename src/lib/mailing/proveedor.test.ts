import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La base no se toca: la copia en la bandeja de salida y la lista de supresión
// van mockeadas. Lo que se fija acá es la clasificación del error del
// proveedor (de la que cuelga el borrado del email del cliente en
// ejecutarAccionReglaCorreo) y qué se manda o se descarta antes del proveedor.
vi.mock("@/lib/dataAccess/mail", () => ({ registrarCorreoAutomatico: vi.fn() }));
vi.mock("@/lib/dataAccess/correosSuprimidos", () => ({ buscarSupresionCorreo: vi.fn() }));

import { buscarSupresionCorreo } from "@/lib/dataAccess/correosSuprimidos";
import { registrarCorreoAutomatico } from "@/lib/dataAccess/mail";
import { enviarCorreoTransaccional, esRechazoDeDireccion, esRechazoSesDeDireccion } from "./proveedor";

const DESTINATARIO = "cliente@gmail.com";

describe("esRechazoDeDireccion", () => {
  it("mensaje del campo `to` -> rechazo permanente de la dirección", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "Invalid `to` field. The email address needs to follow the `email@example.com` format." },
        DESTINATARIO
      )
    ).toBe(true);
  });

  it("mensaje que nombra la dirección misma -> rechazo permanente", () => {
    expect(esRechazoDeDireccion({ message: `The email address ${DESTINATARIO} does not exist` }, DESTINATARIO)).toBe(true);
  });

  // El caso que motivó el test: el error del `from` trae "invalid" y un "to"
  // suelto en la prosa ("needs to follow"). Tomarlo por un rechazo del
  // destinatario le borraría el email a TODOS los clientes de la campaña,
  // porque un MAIL_FROM_ADDRESS mal configurado hace fallar cada envío.
  it("mensaje del campo `from` -> NO es rechazo de la dirección del destinatario", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "Invalid `from` field. The email address needs to follow the `email@example.com` format." },
        DESTINATARIO
      )
    ).toBe(false);
  });

  it("dominio del remitente sin verificar -> no borra nada", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "The zplash.cl domain is not verified. Please, add and verify your domain on https://resend.com/domains" },
        DESTINATARIO
      )
    ).toBe(false);
  });

  it("fallas transitorias del proveedor -> no borran nada", () => {
    expect(esRechazoDeDireccion({ name: "rate_limit_exceeded", message: "Too many requests" }, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "application_error", message: "Internal server error" }, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "missing_api_key", message: "Missing API key in the authorization header" }, DESTINATARIO)).toBe(false);
  });

  it("error sin mensaje legible -> sin evidencia, no borra nada", () => {
    expect(esRechazoDeDireccion({}, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "validation_error", message: "" }, DESTINATARIO)).toBe(false);
  });
});

describe("esRechazoSesDeDireccion", () => {
  it("BadRequest que nombra al destinatario como inválido -> permanente", () => {
    expect(esRechazoSesDeDireccion({ name: "BadRequestException", status: 400, message: `Invalid recipient address ${DESTINATARIO}` }, DESTINATARIO)).toBe(true);
  });

  it("sandbox (destinatario no verificado), remitente o fallas transitorias -> no borran nada", () => {
    expect(
      esRechazoSesDeDireccion(
        { name: "MessageRejected", status: 400, message: `Email address is not verified. The following identities failed the check in region US-EAST-1: ${DESTINATARIO}` },
        DESTINATARIO
      )
    ).toBe(false);
    expect(esRechazoSesDeDireccion({ name: "BadRequestException", status: 400, message: `Recipient ${DESTINATARIO} invalid: identity not verified` }, DESTINATARIO)).toBe(false);
    expect(esRechazoSesDeDireccion({ name: "BadRequestException", status: 400, message: "Invalid from address" }, DESTINATARIO)).toBe(false);
    expect(esRechazoSesDeDireccion({ name: "TooManyRequestsException", status: 429, message: "Maximum sending rate exceeded." }, DESTINATARIO)).toBe(false);
    expect(esRechazoSesDeDireccion({ name: "AccountSuspendedException", status: 400, message: "Account suspended" }, DESTINATARIO)).toBe(false);
  });
});

describe("enviarCorreoTransaccional", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(registrarCorreoAutomatico).mockClear();
    vi.mocked(buscarSupresionCorreo).mockReset().mockResolvedValue(null);
    vi.stubEnv("MAIL_FROM_ADDRESS", "ZPlash <no-reply@zplash.cl>");
    vi.stubEnv("CORREO_PROVEEDOR", "ses");
    vi.stubEnv("AWS_SES_REGION", "us-east-1");
    vi.stubEnv("AWS_SES_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("AWS_SES_SECRET_ACCESS_KEY", "secreto");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = fetchOriginal;
  });

  it("con CORREO_PROVEEDOR=ses manda por SES a la dirección normalizada y registra el MessageId", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ MessageId: "ses-123" }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await enviarCorreoTransaccional({ to: " Cliente @Gmail.com ", subject: "Hola", html: "<p>x</p>" });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
    expect(JSON.parse(String(init.body)).Destination.ToAddresses).toEqual(["cliente@gmail.com"]);
    expect((init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/ses\/aws4_request/);
    expect(registrarCorreoAutomatico).toHaveBeenCalledWith(expect.objectContaining({ para: "cliente@gmail.com", estado: "enviado", proveedorId: "ses-123" }));
  });

  it("con SES pedido pero sin credenciales: no configurado, sin caer a Resend", async () => {
    vi.stubEnv("AWS_SES_SECRET_ACCESS_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await enviarCorreoTransaccional({ to: DESTINATARIO, subject: "s", html: "h" })).toEqual({ ok: false, error: "no configurado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dirección malformada: no llama al proveedor, registra el motivo y es permanente", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await enviarCorreoTransaccional({ to: "nuños@gmail.com", subject: "s", html: "h" });
    expect(r.ok).toBe(false);
    expect(r.permanente).toBe(true);
    expect(r.error).toContain("tildes");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(registrarCorreoAutomatico).toHaveBeenCalledWith(expect.objectContaining({ para: "nuños@gmail.com", estado: "error" }));
  });

  it("dirección suprimida: no se manda; solo el rebote es permanente", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.mocked(buscarSupresionCorreo).mockResolvedValue({ motivo: "rebote", detalle: "General" });
    const r1 = await enviarCorreoTransaccional({ to: DESTINATARIO, subject: "s", html: "h" });
    expect(r1).toEqual({ ok: false, error: "dirección suprimida (rebote: General)", permanente: true });
    vi.mocked(buscarSupresionCorreo).mockResolvedValue({ motivo: "queja", detalle: null });
    const r2 = await enviarCorreoTransaccional({ to: DESTINATARIO, subject: "s", html: "h" });
    expect(r2).toEqual({ ok: false, error: "dirección suprimida (queja)", permanente: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error de SES: queda registrado con el mensaje y no es permanente si es transitorio", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Maximum sending rate exceeded." }), {
          status: 429,
          headers: { "x-amzn-ErrorType": "TooManyRequestsException:http://internal.amazon.com/" },
        })
    ) as unknown as typeof fetch;
    const r = await enviarCorreoTransaccional({ to: DESTINATARIO, subject: "s", html: "h" });
    expect(r).toEqual({ ok: false, error: "Maximum sending rate exceeded.", permanente: false });
    expect(registrarCorreoAutomatico).toHaveBeenCalledWith(expect.objectContaining({ estado: "error", error: "Maximum sending rate exceeded." }));
  });
});
