import { describe, expect, it } from "vitest";
import { cuerpoSendEmail, firmarSigV4 } from "./ses";

// Vectores de la suite oficial de AWS (aws-sig-v4-test-suite): credenciales,
// fecha y región de ejemplo publicadas por AWS, no son secretos.
const CRED = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", region: "us-east-1" };
const FECHA = new Date("2015-08-30T12:36:00Z");

describe("firmarSigV4", () => {
  it("get-vanilla: misma firma que el vector oficial de AWS", () => {
    const h = firmarSigV4({ metodo: "GET", url: "https://example.amazonaws.com/", servicio: "service", credenciales: CRED, fecha: FECHA });
    expect(h["x-amz-date"]).toBe("20150830T123600Z");
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
    );
  });

  it("post-vanilla: misma firma que el vector oficial de AWS", () => {
    const h = firmarSigV4({ metodo: "POST", url: "https://example.amazonaws.com/", servicio: "service", credenciales: CRED, fecha: FECHA });
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b"
    );
  });

  it("get-vanilla-query-order-key-case: ordena la query", () => {
    const h = firmarSigV4({
      metodo: "GET",
      url: "https://example.amazonaws.com/?Param2=value2&Param1=value1",
      servicio: "service",
      credenciales: CRED,
      fecha: FECHA,
    });
    expect(h.authorization).toContain("Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500");
  });
});

describe("cuerpoSendEmail", () => {
  it("arma el Simple de SES v2 con UTF-8 y sin Attachments si no hay", () => {
    const body = JSON.parse(cuerpoSendEmail({ from: "ZPlash <no-reply@zplash.cl>", to: "a@b.cl", subject: "Hola ñandú", html: "<p>x</p>" }));
    expect(body).toEqual({
      FromEmailAddress: "ZPlash <no-reply@zplash.cl>",
      Destination: { ToAddresses: ["a@b.cl"] },
      Content: { Simple: { Subject: { Data: "Hola ñandú", Charset: "UTF-8" }, Body: { Html: { Data: "<p>x</p>", Charset: "UTF-8" } } } },
    });
  });

  it("adjuntos en base64 con tipo por extensión, y configuration set si viene", () => {
    const body = JSON.parse(
      cuerpoSendEmail({
        from: "x@zplash.cl",
        to: "a@b.cl",
        subject: "s",
        html: "h",
        adjuntos: [{ nombre: "Factura-12.pdf", contenido: Buffer.from("PDF") }],
        configurationSet: "zplash-transaccional",
      })
    );
    expect(body.ConfigurationSetName).toBe("zplash-transaccional");
    expect(body.Content.Simple.Attachments).toEqual([
      { FileName: "Factura-12.pdf", RawContent: Buffer.from("PDF").toString("base64"), ContentType: "application/pdf", ContentDisposition: "ATTACHMENT" },
    ]);
  });
});
