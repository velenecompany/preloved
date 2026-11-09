/**
 * BORRADORES de políticas. No son textos legales definitivos.
 * Cada punto marcado en `review` debe revisarlo un abogado en México antes de operar.
 * En la Fase 6 estos textos pasan a la tabla `legal_documents` con versiones editables desde el panel.
 */
export interface LegalSection {
  heading: string;
  body: string[];
  review?: string;
}
export interface LegalPage {
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "terminos",
    title: "Términos y condiciones",
    summary: "Reglas de uso del sitio para compradores y vendedores.",
    sections: [
      {
        heading: "Quiénes somos",
        body: [
          "Operamos una tienda en línea de artículos de diseñador de segunda mano bajo un modelo de consignación: recibimos piezas de sus propietarios, las autenticamos, las publicamos y las vendemos por cuenta de ellos a cambio de una comisión.",
        ],
        review: "Razón social, RFC, domicilio fiscal y datos de contacto obligatorios conforme a la Ley Federal de Protección al Consumidor y la NOM-247-SE.",
      },
      {
        heading: "Precios y pagos",
        body: [
          "Todos los precios están en pesos mexicanos e incluyen los impuestos aplicables. El costo de entrega se muestra antes de pagar.",
          "El pago se procesa a través de un proveedor de pagos certificado. No almacenamos datos de tarjetas.",
        ],
        review: "Confirmar con el contador si los precios deben mostrarse con IVA desglosado según la figura fiscal elegida.",
      },
      {
        heading: "Disponibilidad",
        body: [
          "Cada pieza es única. Al iniciar el pago, la pieza queda reservada por un tiempo limitado; si el pago no se completa, vuelve a estar disponible.",
        ],
      },
    ],
  },
  {
    slug: "privacidad",
    title: "Aviso de privacidad",
    summary: "Qué datos recabamos y para qué los usamos.",
    sections: [
      {
        heading: "Datos que recabamos",
        body: [
          "Nombre, correo, teléfono y dirección de entrega para procesar compras. Para vendedores, además, la CLABE y el titular de la cuenta para pagarles sus ventas, y de forma opcional el RFC.",
        ],
        review: "Redactar conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares: responsable, finalidades primarias y secundarias, transferencias y medios para ejercer derechos ARCO.",
      },
    ],
  },
  {
    slug: "contrato-consignacion",
    title: "Contrato de consignación",
    summary: "Condiciones bajo las que recibimos y vendemos tus piezas.",
    sections: [
      {
        heading: "Precio y comisión",
        body: [
          "El precio de publicación y la comisión se acuerdan antes de recibir la pieza y quedan fijos en tu contrato. Si nuestras tarifas cambian después, no afectan a tu pieza.",
        ],
      },
      {
        heading: "Permanencia mínima",
        body: [
          "Tu pieza se queda con nosotros al menos 30 días a partir de que la recibimos. Durante ese mes no se puede retirar.",
          "Al cumplir el mes, tú decides: la retiras o la dejas publicada. Si la dejas, sigue a la venta sin fecha de vencimiento, y puedes pedir el retiro cuando quieras mientras no esté reservada o vendida.",
        ],
        review: "Definir plazo para recoger una pieza después de pedir su retiro, costo de resguardo si no se recoge y qué ocurre con piezas no reclamadas.",
      },
      {
        heading: "Custodia",
        body: ["Mientras la pieza está con nosotros, respondemos por su resguardo."],
        review: "Definir el límite de responsabilidad y si se contrata un seguro de inventario.",
      },
      {
        heading: "Pago al vendedor",
        body: [
          "Después de entregar la pieza al comprador, este tiene 72 horas para reportar un problema. En cuanto termina ese plazo sin reportes, te transferimos por SPEI ese mismo día.",
        ],
        review: "Validar con contador la figura fiscal (comisionista o intermediario de plataforma) y las retenciones aplicables.",
      },
    ],
  },
  {
    slug: "autenticidad",
    title: "Política de autenticidad",
    summary: "Cómo verificamos cada pieza y qué pasa si algo falla.",
    sections: [
      {
        heading: "Autenticación física",
        body: [
          "Toda pieza publicada fue revisada físicamente por nuestro equipo antes de publicarse. Las fotografías de quien vende y la evaluación automática de condición solo sirven como revisión preliminar: nunca determinan la autenticidad.",
          "Una caja, un ticket o un certificado incluidos no garantizan por sí solos que una pieza sea auténtica.",
        ],
      },
      {
        heading: "Si una pieza resulta no auténtica",
        body: [
          "Reembolsamos el total pagado al comprador. La pieza no se libera al vendedor y el caso se revisa.",
        ],
        review: "Definir plazo de la garantía de autenticidad y el procedimiento para reclamaciones fuera de la ventana de 72 horas.",
      },
    ],
  },
  {
    slug: "envios",
    title: "Envíos y entregas",
    summary: "Cobertura y tiempos de entrega.",
    sections: [
      {
        heading: "Cobertura",
        body: [
          "Por ahora entregamos en Guadalajara y su zona metropolitana, o puedes recoger en sucursal. Los códigos postales con cobertura se validan al pagar.",
          "Los envíos al resto del país se habilitarán más adelante.",
        ],
      },
    ],
  },
  {
    slug: "devoluciones",
    title: "Devoluciones y ventana de aceptación",
    summary: "Qué hacer si tu compra no es lo que esperabas.",
    sections: [
      {
        heading: "Ventana de aceptación",
        body: [
          "Tienes 72 horas desde la entrega para reportar que la pieza no corresponde a la publicación. Revisamos cada caso y, si procede, reembolsamos total o parcialmente.",
        ],
        review: "Verificar compatibilidad con el derecho de revocación de la LFPC para ventas a distancia y ajustar el plazo si es necesario.",
      },
    ],
  },
  {
    slug: "vendedores",
    title: "Política de vendedores",
    summary: "Qué piezas aceptamos y cómo funciona la consignación.",
    sections: [
      {
        heading: "Piezas que aceptamos",
        body: [
          "Calzado, ropa, bolsos y accesorios de diseñador en condición aceptable o mejor. Debes ser propietario de la pieza: te pediremos una foto con un código de verificación antes de aceptarla.",
          "Cada pieza aceptada se queda con nosotros al menos 30 días. Después del mes puedes retirarla o dejarla a la venta el tiempo que quieras.",
          "No aceptamos réplicas. Si la autenticación física falla, la pieza se te devuelve y no se publica.",
        ],
      },
      {
        heading: "Comisiones",
        body: [
          "Bolsos, ropa de lujo y accesorios: 30 % hasta $10,999, 20 % de $11,000 a $59,999 y 15 % desde $60,000. Sneakers y streetwear: 18 %, 15 % y 12 % en los mismos rangos.",
        ],
      },
    ],
  },
];

export const getLegalPage = (slug: string) => LEGAL_PAGES.find((p) => p.slug === slug);
