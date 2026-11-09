const WEIGHTS = [3, 7, 1];

/** Valida una CLABE interbancaria de 18 dígitos con su dígito verificador. */
export function isValidClabe(input: string): boolean {
  const clabe = input.replace(/\s/g, "");
  if (!/^\d{18}$/.test(clabe)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += (Number(clabe[i]) * WEIGHTS[i % 3]) % 10;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(clabe[17]);
}
