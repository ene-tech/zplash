import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { esUrlDeSns, extraerSupresiones, parsearMensajeSns, regionDeTopicArn, stringAFirmarSns, verificarFirmaSns, type MensajeSns } from "./snsFirma";

const ARN = "arn:aws:sns:us-east-1:123456789012:zplash-ses-eventos";
const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc123.pem";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otro = generateKeyPairSync("rsa", { modulusLength: 2048 });

function firmado(m: Omit<MensajeSns, "Signature">, version: "1" | "2" = "2", clave = privateKey): MensajeSns {
  const base = { ...m, SignatureVersion: version, Signature: "" };
  const texto = stringAFirmarSns(base)!;
  return { ...base, Signature: sign(version === "1" ? "sha1" : "sha256", Buffer.from(texto), clave).toString("base64") };
}

const NOTIF: Omit<MensajeSns, "Signature"> = {
  Type: "Notification",
  MessageId: "m-1",
  TopicArn: ARN,
  Message: JSON.stringify({ eventType: "Bounce" }),
  Timestamp: "2026-10-20T12:00:00.000Z",
  SignatureVersion: "2",
  SigningCertURL: CERT_URL,
};

describe("stringAFirmarSns", () => {
  it("Notification sin Subject: campos en orden fijo", () => {
    expect(stringAFirmarSns({ ...NOTIF, Signature: "" })).toBe(
      `Message\n${NOTIF.Message}\nMessageId\nm-1\nTimestamp\n2026-10-20T12:00:00.000Z\nTopicArn\n${ARN}\nType\nNotification\n`
    );
  });

  it("SubscriptionConfirmation incluye SubscribeURL y Token; sin ellos no se puede firmar", () => {
    const m = { ...NOTIF, Type: "SubscriptionConfirmation", Signature: "", SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription", Token: "tok" };
    expect(stringAFirmarSns(m)).toContain("SubscribeURL\nhttps://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription\nTimestamp");
    expect(stringAFirmarSns({ ...m, Token: undefined })).toBeNull();
    expect(stringAFirmarSns({ ...m, Type: "Otro" })).toBeNull();
  });
});

describe("verificarFirmaSns", () => {
  const clave = vi.fn(async () => publicKey);

  it("acepta SignatureVersion 1 (SHA1) y 2 (SHA256) firmadas con la clave del certificado", async () => {
    expect(await verificarFirmaSns(firmado(NOTIF, "1"), clave)).toBe(true);
    expect(await verificarFirmaSns(firmado(NOTIF, "2"), clave)).toBe(true);
  });

  it("rechaza firma con otra clave, mensaje alterado o versión desconocida", async () => {
    expect(await verificarFirmaSns(firmado(NOTIF, "2", otro.privateKey), clave)).toBe(false);
    expect(await verificarFirmaSns({ ...firmado(NOTIF), Message: '{"eventType":"Complaint"}' }, clave)).toBe(false);
    expect(await verificarFirmaSns({ ...firmado(NOTIF), SignatureVersion: "3" }, clave)).toBe(false);
  });

  it("no baja certificados de hosts que no sean sns.<región del topic>.amazonaws.com", async () => {
    const espia = vi.fn(async () => publicKey);
    for (const url of [
      "https://evil.com/cert.pem",
      "http://sns.us-east-1.amazonaws.com/x.pem",
      "https://sns.us-west-2.amazonaws.com/x.pem",
      "https://sns.us-east-1.amazonaws.com.evil.com/x.pem",
      "https://sns.us-east-1.amazonaws.com/x.txt",
    ]) {
      expect(await verificarFirmaSns(firmado({ ...NOTIF, SigningCertURL: url }), espia)).toBe(false);
    }
    expect(espia).not.toHaveBeenCalled();
  });

  it("si bajar el certificado falla, rechaza sin lanzar", async () => {
    expect(await verificarFirmaSns(firmado(NOTIF), async () => Promise.reject(new Error("timeout")))).toBe(false);
  });
});

describe("helpers de SNS", () => {
  it("regionDeTopicArn", () => {
    expect(regionDeTopicArn(ARN)).toBe("us-east-1");
    expect(regionDeTopicArn("arn:aws:sqs:us-east-1:123456789012:x")).toBeNull();
  });

  it("esUrlDeSns no acepta usuario ni puerto", () => {
    expect(esUrlDeSns("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription", "us-east-1")).toBe(true);
    expect(esUrlDeSns("https://x@sns.us-east-1.amazonaws.com/", "us-east-1")).toBe(false);
    expect(esUrlDeSns("https://sns.us-east-1.amazonaws.com:8443/", "us-east-1")).toBe(false);
  });

  it("parsearMensajeSns exige los campos como strings", () => {
    expect(parsearMensajeSns({ ...NOTIF, Signature: "x" })).not.toBeNull();
    expect(parsearMensajeSns({ ...NOTIF })).toBeNull();
    expect(parsearMensajeSns({ ...NOTIF, Signature: 1 })).toBeNull();
    expect(parsearMensajeSns(null)).toBeNull();
  });
});

describe("extraerSupresiones", () => {
  it("rebote permanente (evento de configuration set) -> rebote por destinatario", () => {
    expect(
      extraerSupresiones({
        eventType: "Bounce",
        bounce: {
          bounceType: "Permanent",
          bounceSubType: "General",
          bouncedRecipients: [{ emailAddress: "Juan@Gmail.com", diagnosticCode: "smtp; 550 5.1.1 user unknown" }, { emailAddress: "Ana <ana@x.cl>" }],
        },
      })
    ).toEqual([
      { email: "Juan@Gmail.com", motivo: "rebote", detalle: "General: smtp; 550 5.1.1 user unknown" },
      { email: "ana@x.cl", motivo: "rebote", detalle: "General" },
    ]);
  });

  it("rebote transitorio no suprime", () => {
    expect(extraerSupresiones({ notificationType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@b.cl" }] } })).toEqual([]);
  });

  it("queja (notificación de identidad) -> queja; not-spam no suprime", () => {
    expect(
      extraerSupresiones({ notificationType: "Complaint", complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "a@b.cl" }] } })
    ).toEqual([{ email: "a@b.cl", motivo: "queja", detalle: "abuse" }]);
    expect(extraerSupresiones({ eventType: "Complaint", complaint: { complaintFeedbackType: "not-spam", complainedRecipients: [{ emailAddress: "a@b.cl" }] } })).toEqual(
      []
    );
  });

  it("Delivery u otros eventos, o basura, no suprimen", () => {
    expect(extraerSupresiones({ eventType: "Delivery" })).toEqual([]);
    expect(extraerSupresiones("x")).toEqual([]);
    expect(extraerSupresiones({ eventType: "Bounce" })).toEqual([]);
  });
});
