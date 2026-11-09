/**
 * Bancos más comunes por los primeros 3 dígitos de la CLABE.
 * Solo sirve para sugerir el nombre; el vendedor puede corregirlo.
 */
const BANKS: Record<string, string> = {
  "002": "Banamex",
  "012": "BBVA México",
  "014": "Santander",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "044": "Scotiabank",
  "058": "Banregio",
  "062": "Afirme",
  "072": "Banorte",
  "127": "Banco Azteca",
  "137": "BanCoppel",
  "638": "Nu México",
  "646": "STP",
  "722": "Mercado Pago",
};

export function bankFromClabe(clabe: string): string | null {
  const digits = clabe.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return BANKS[digits.slice(0, 3)] ?? null;
}

export function maskClabe(clabe: string): string {
  return `•••• •••• ${clabe.slice(-4)}`;
}
