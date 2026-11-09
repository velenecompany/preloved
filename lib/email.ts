import "server-only";
import { site } from "@/config/site";

/**
 * Envío de correos con Resend (API HTTP, sin dependencias).
 * Sin RESEND_API_KEY, el correo se imprime en la terminal para poder probar en local.
 * Un error al enviar nunca rompe el registro ni el login: se registra y se sigue.
 */

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    console.info(`\n[email sin enviar: falta RESEND_API_KEY o EMAIL_FROM]\nPara: ${message.to}\nAsunto: ${message.subject}\n${message.text}\n`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) console.error(`Resend respondió ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error("No se pudo enviar el correo", e);
  }
}

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

// ---------------------------------------------------------------------
// Plantillas. Paleta de RELOOP: blanco hueso, negro, gris; un solo botón negro.
// ---------------------------------------------------------------------

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(params: { preheader: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; footnote?: string }): string {
  const { preheader, heading, paragraphs, action, footnote } = params;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(heading)}</title></head>
<body style="margin:0;background:#f7f7f5;color:#000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<span style="display:none;opacity:0;height:0;overflow:hidden;">${escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d8d6d1;">
<tr><td style="padding:32px 36px 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.04em;">${escape(site.name)}</td></tr>
<tr><td style="padding:16px 36px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;">${escape(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:14px 36px 0;font-size:15px;line-height:1.6;color:#4b4a47;">${escape(p)}</td></tr>`).join("")}
${action ? `<tr><td style="padding:28px 36px 4px;"><a href="${escape(action.url)}" style="display:inline-block;background:#000;color:#f7f7f5;text-decoration:none;padding:13px 24px;font-size:14px;">${escape(action.label)}</a></td></tr>
<tr><td style="padding:12px 36px 0;font-size:12px;line-height:1.5;color:#8a8782;">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;">${escape(action.url)}</span></td></tr>` : ""}
<tr><td style="padding:28px 36px 32px;font-size:12px;line-height:1.5;color:#8a8782;border-top:0;">${escape(footnote ?? `${site.name} · Consignación de moda de diseñador en ${site.city}.`)}</td></tr>
</table></td></tr></table></body></html>`;
}

function text(params: { heading: string; paragraphs: string[]; action?: { label: string; url: string } }): string {
  return [params.heading, "", ...params.paragraphs, ...(params.action ? ["", `${params.action.label}: ${params.action.url}`] : [])].join("\n");
}

export function welcomeEmail(name: string | null, verifyUrl: string) {
  const content = {
    heading: name ? `Bienvenido, ${name.split(" ")[0]}` : "Bienvenido",
    paragraphs: [
      `Tu cuenta en ${site.name} está lista. Confirma tu correo para poder consignar piezas y recibir avisos de tus compras.`,
      "El enlace vence en 24 horas.",
    ],
    action: { label: "Confirmar mi correo", url: verifyUrl },
  };
  return { subject: `Confirma tu correo en ${site.name}`, html: layout({ preheader: "Confirma tu correo para empezar.", ...content }), text: text(content) };
}

export function verifyEmail(verifyUrl: string) {
  const content = {
    heading: "Confirma tu correo",
    paragraphs: ["Usa este enlace para confirmar tu correo. Vence en 24 horas."],
    action: { label: "Confirmar mi correo", url: verifyUrl },
  };
  return { subject: `Confirma tu correo en ${site.name}`, html: layout({ preheader: "Enlace para confirmar tu correo.", ...content }), text: text(content) };
}

export function resetEmail(resetUrl: string) {
  const content = {
    heading: "Restablece tu contraseña",
    paragraphs: [
      "Recibimos una solicitud para cambiar tu contraseña. El enlace vence en 1 hora y solo funciona una vez.",
      "Si no la pediste tú, ignora este correo; tu contraseña sigue igual.",
    ],
    action: { label: "Elegir contraseña nueva", url: resetUrl },
  };
  return { subject: `Restablece tu contraseña de ${site.name}`, html: layout({ preheader: "Enlace para cambiar tu contraseña.", ...content }), text: text(content) };
}

export function passwordChangedEmail() {
  const content = {
    heading: "Tu contraseña cambió",
    paragraphs: [
      "La contraseña de tu cuenta se acaba de cambiar y cerramos tus otras sesiones.",
      "Si no fuiste tú, restablécela de inmediato y escríbenos.",
    ],
    action: { label: "Restablecer contraseña", url: appUrl("/recuperar") },
  };
  return { subject: `Tu contraseña de ${site.name} cambió`, html: layout({ preheader: "Aviso de seguridad.", ...content }), text: text(content) };
}

export function payoutAccountChangedEmail(lastFour: string) {
  const content = {
    heading: "Tus datos bancarios cambiaron",
    paragraphs: [
      `Registramos una CLABE nueva terminada en ${lastFour} para recibir el pago de tus ventas.`,
      "Si no fuiste tú, cambia tu contraseña y escríbenos antes de tu próxima venta.",
    ],
    action: { label: "Revisar mis datos", url: appUrl("/cuenta/datos-bancarios") },
  };
  return { subject: `Cambiaron tus datos bancarios en ${site.name}`, html: layout({ preheader: "Aviso de seguridad.", ...content }), text: text(content) };
}
