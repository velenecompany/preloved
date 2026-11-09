import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { emailSchema, hashPassword, passwordSchema, verifyPassword, DUMMY_HASH } from "../password";
import { safeRedirect, signSession, verifySession } from "../jwt";
import { hashToken, newToken } from "../tokens";
import { bankFromClabe, maskClabe } from "../../domain/banks";

describe("contraseñas", () => {
  it("exige al menos 10 caracteres con letras y números", () => {
    expect(passwordSchema.safeParse("corta1").success).toBe(false);
    expect(passwordSchema.safeParse("solamenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(false);
    expect(passwordSchema.safeParse("ventas2026gdl").success).toBe(true);
  });
  it("guarda un hash y lo verifica", async () => {
    const hash = await hashPassword("ventas2026gdl");
    expect(hash).not.toContain("ventas2026gdl");
    expect(await verifyPassword("ventas2026gdl", hash)).toBe(true);
    expect(await verifyPassword("otra2026gdl", hash)).toBe(false);
  });
  it("el hash de relleno es válido y nunca coincide", async () => {
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
  });
  it("normaliza el correo", () => {
    expect(emailSchema.parse("  Fernando@Ejemplo.MX ")).toBe("fernando@ejemplo.mx");
    expect(emailSchema.safeParse("no-es-correo").success).toBe(false);
  });
});

describe("sesión JWT", () => {
  it("firma y verifica", async () => {
    const token = await signSession({ sub: "u1", sv: 3 });
    expect(await verifySession(token)).toEqual({ sub: "u1", sv: 3 });
  });
  it("rechaza tokens alterados, vacíos o firmados con otra llave", async () => {
    const token = await signSession({ sub: "u1", sv: 1 });
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    const forged = await new SignJWT({ sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode("otra-llave-distinta-de-mas-de-32-caracteres"));
    expect(await verifySession(forged)).toBeNull();
  });
  it("rechaza tokens vencidos", async () => {
    const expired = await new SignJWT({ sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    expect(await verifySession(expired)).toBeNull();
  });
});

describe("redirecciones seguras", () => {
  it("solo acepta rutas internas", () => {
    expect(safeRedirect("/cuenta/datos-bancarios")).toBe("/cuenta/datos-bancarios");
    expect(safeRedirect("https://otro-sitio.com")).toBe("/cuenta");
    expect(safeRedirect("//otro-sitio.com")).toBe("/cuenta");
    expect(safeRedirect("/\\otro-sitio.com")).toBe("/cuenta");
    expect(safeRedirect(undefined, "/")).toBe("/");
  });
});

describe("tokens de correo", () => {
  it("genera tokens únicos y guarda solo su hash", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

describe("bancos", () => {
  it("sugiere el banco por la CLABE", () => {
    expect(bankFromClabe("012180001234567897")).toBe("BBVA México");
    expect(bankFromClabe("722969010000000000")).toBe("Mercado Pago");
    expect(bankFromClabe("999")).toBeNull();
  });
  it("oculta la CLABE salvo los últimos 4 dígitos", () => {
    expect(maskClabe("002010077777777771")).toBe("•••• •••• 7771");
  });
});
