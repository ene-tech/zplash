import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dataAccess/correosSuprimidos", () => ({ suprimirCorreos: vi.fn() }));
vi.mock("@/lib/mailing/snsFirma", async (original) => ({
  ...(await original<typeof import("@/lib/mailing/snsFirma")>()),
  verificarFirmaSns: vi.fn(),
}));

import { suprimirCorreos } from "@/lib/dataAccess/correosSuprimidos";
import { verificarFirmaSns } from "@/lib/mailing/snsFirma";
import { POST } from "./route";

const ARN = "arn:aws:sns:us-east-1:123456789012:zplash-ses-eventos";

function mensaje(extra: Record<string, unknown> = {}) {
  return {
    Type: "Notification",
    MessageId: "m-1",
    TopicArn: ARN,
    Message: JSON.stringify({
      eventType: "Bounce",
      bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: " Juan@Gmail.com" }, { emailAddress: "malo@" }] },
    }),
    Timestamp: "2026-10-20T12:00:00.000Z",
    SignatureVersion: "2",
    Signature: "x",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/c.pem",
    ...extra,
  };
}

const post = (body: unknown) => POST(new Request("https://zplash.cl/api/correo/ses/notificaciones", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/correo/ses/notificaciones", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("AWS_SES_SNS_TOPIC_ARN", ARN);
    vi.mocked(verificarFirmaSns).mockReset().mockResolvedValue(true);
    vi.mocked(suprimirCorreos).mockReset().mockResolvedValue();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = fetchOriginal;
  });

  it("sin AWS_SES_SNS_TOPIC_ARN no procesa nada", async () => {
    vi.stubEnv("AWS_SES_SNS_TOPIC_ARN", "");
    expect((await post(mensaje())).status).toBe(500);
    expect(suprimirCorreos).not.toHaveBeenCalled();
  });

  it("otro TopicArn -> 403 sin siquiera verificar la firma", async () => {
    const r = await post(mensaje({ TopicArn: "arn:aws:sns:us-east-1:999999999999:otro" }));
    expect(r.status).toBe(403);
    expect(verificarFirmaSns).not.toHaveBeenCalled();
    expect(suprimirCorreos).not.toHaveBeenCalled();
  });

  it("firma inválida -> 403 y no suprime", async () => {
    vi.mocked(verificarFirmaSns).mockResolvedValue(false);
    expect((await post(mensaje())).status).toBe(403);
    expect(suprimirCorreos).not.toHaveBeenCalled();
  });

  it("JSON que no es SNS -> 400", async () => {
    expect((await post({ hola: 1 })).status).toBe(400);
  });

  it("rebote permanente firmado -> suprime la dirección normalizada y descarta la malformada", async () => {
    const r = await post(mensaje());
    expect(r.status).toBe(200);
    expect(suprimirCorreos).toHaveBeenCalledWith([{ email: "juan@gmail.com", motivo: "rebote", detalle: "General" }]);
  });

  it("si la tabla no existe (insert falla) -> 500 para que SNS reintente", async () => {
    vi.mocked(suprimirCorreos).mockRejectedValue(new Error('relation "correos_suprimidos" does not exist'));
    expect((await post(mensaje())).status).toBe(500);
  });

  it("SubscriptionConfirmation: visita SubscribeURL solo si es de sns.<región>.amazonaws.com", async () => {
    const fetchMock = vi.fn(async () => new Response("<ok/>", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const conf = { Type: "SubscriptionConfirmation", Token: "t", Message: "confirma" };
    const bien = await post(mensaje({ ...conf, SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=t" }));
    expect(bien.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const mal = await post(mensaje({ ...conf, SubscribeURL: "https://169.254.169.254/latest/meta-data" }));
    expect(mal.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
