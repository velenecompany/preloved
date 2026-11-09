import { assertCents, type Cents } from "./money";
import type { CommissionBreakdown } from "./commissions";

/** Cuentas internas del ledger. Las de vendedor se generan como `por_pagar_vendedor:{sellerId}`. */
export const SYSTEM_ACCOUNTS = {
  efectivoProcesador: "efectivo_procesador",
  efectivoBanco: "efectivo_banco",
  ingresoComision: "ingreso_comision",
  ingresoEnvio: "ingreso_envio",
  gastoProcesador: "gasto_procesador",
  retencionesPorEnterar: "retenciones_por_enterar",
  reembolsos: "reembolsos",
} as const;

export const sellerAccount = (sellerId: string) => `por_pagar_vendedor:${sellerId}`;

export interface LedgerLine {
  account: string;
  debitCents: Cents;
  creditCents: Cents;
}

export class UnbalancedTransactionError extends Error {}

export function assertBalanced(lines: LedgerLine[]): void {
  if (lines.length < 2) throw new UnbalancedTransactionError("Un asiento necesita al menos dos líneas");
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    assertCents(l.debitCents, "débito");
    assertCents(l.creditCents, "crédito");
    if (l.debitCents < 0 || l.creditCents < 0) throw new UnbalancedTransactionError("Montos negativos no permitidos");
    if ((l.debitCents > 0) === (l.creditCents > 0)) {
      throw new UnbalancedTransactionError(`La línea de ${l.account} debe tener débito o crédito, no ambos ni ninguno`);
    }
    debit += l.debitCents;
    credit += l.creditCents;
  }
  if (debit !== credit) throw new UnbalancedTransactionError(`Asiento descuadrado: débitos ${debit} ≠ créditos ${credit}`);
}

const dr = (account: string, cents: Cents): LedgerLine => ({ account, debitCents: cents, creditCents: 0 });
const cr = (account: string, cents: Cents): LedgerLine => ({ account, debitCents: 0, creditCents: cents });

/** Asiento al aprobarse el pago de una pieza. */
export function saleLines(params: {
  sellerId: string;
  commission: CommissionBreakdown;
  shippingCents: Cents;
  processorFeeCents: Cents;
}): LedgerLine[] {
  const { sellerId, commission, shippingCents, processorFeeCents } = params;
  const total = commission.salePriceCents + shippingCents;
  const lines: LedgerLine[] = [
    dr(SYSTEM_ACCOUNTS.efectivoProcesador, total),
    cr(sellerAccount(sellerId), commission.sellerGrossCents),
    cr(SYSTEM_ACCOUNTS.ingresoComision, commission.commissionCents),
  ];
  if (shippingCents > 0) lines.push(cr(SYSTEM_ACCOUNTS.ingresoEnvio, shippingCents));
  if (processorFeeCents > 0) {
    lines.push(dr(SYSTEM_ACCOUNTS.gastoProcesador, processorFeeCents));
    lines.push(cr(SYSTEM_ACCOUNTS.efectivoProcesador, processorFeeCents));
  }
  const cleaned = lines.filter((l) => l.debitCents > 0 || l.creditCents > 0);
  assertBalanced(cleaned);
  return cleaned;
}

/** Asiento al liquidar a un vendedor por SPEI, con retenciones opcionales. */
export function payoutLines(params: {
  sellerId: string;
  grossCents: Cents;
  withholdingCents: Cents;
}): LedgerLine[] {
  const { sellerId, grossCents, withholdingCents } = params;
  if (withholdingCents > grossCents) throw new UnbalancedTransactionError("La retención excede el monto bruto");
  const lines: LedgerLine[] = [
    dr(sellerAccount(sellerId), grossCents),
    cr(SYSTEM_ACCOUNTS.efectivoBanco, grossCents - withholdingCents),
  ];
  if (withholdingCents > 0) lines.push(cr(SYSTEM_ACCOUNTS.retencionesPorEnterar, withholdingCents));
  const cleaned = lines.filter((l) => l.debitCents > 0 || l.creditCents > 0);
  assertBalanced(cleaned);
  return cleaned;
}

/** Asiento de reembolso total antes de liquidar: revierte la venta (la comisión del procesador no se recupera). */
export function fullRefundLines(params: {
  sellerId: string;
  commission: CommissionBreakdown;
  shippingCents: Cents;
}): LedgerLine[] {
  const { sellerId, commission, shippingCents } = params;
  const total = commission.salePriceCents + shippingCents;
  const lines: LedgerLine[] = [
    dr(sellerAccount(sellerId), commission.sellerGrossCents),
    dr(SYSTEM_ACCOUNTS.ingresoComision, commission.commissionCents),
    cr(SYSTEM_ACCOUNTS.efectivoProcesador, total),
  ];
  if (shippingCents > 0) lines.push(dr(SYSTEM_ACCOUNTS.ingresoEnvio, shippingCents));
  assertBalanced(lines);
  return lines;
}
