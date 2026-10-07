// Payment methods and statuses, shared by the site, the server and Admin.
// Kept separate from order status: Collected/Completed never means Paid.

export type PaymentMethod = "cash_on_delivery" | "cash_on_collection" | "bank_transfer" | "online_provider";
export type PaymentStatus =
  | "pending_payment"
  | "awaiting_bank_transfer_verification"
  | "paid"
  | "partially_paid"
  | "refunded"
  | "failed_or_cancelled";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash_on_delivery: "Cash on delivery/pickup",
  cash_on_collection: "Cash on collection",
  bank_transfer: "Bank transfer",
  online_provider: "Online payment",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_payment: "Pending payment",
  awaiting_bank_transfer_verification: "Awaiting bank-transfer verification",
  paid: "Paid",
  partially_paid: "Partially paid",
  refunded: "Refunded",
  failed_or_cancelled: "Failed or cancelled",
};

/** Status a brand-new order starts in. Nothing is ever "paid" on creation. */
export function initialPaymentStatus(method: PaymentMethod): PaymentStatus {
  return method === "bank_transfer" ? "awaiting_bank_transfer_verification" : "pending_payment";
}

/** Ledger method used when staff record money received for an order. */
export function ledgerMethodFor(method: string | null | undefined): "cash" | "bank_transfer" | "online_provider" | "other" {
  if (method === "bank_transfer") return "bank_transfer";
  if (method === "cash_on_delivery" || method === "cash_on_collection") return "cash";
  if (method === "online_provider") return "online_provider";
  return "other";
}

/** Payment method of any order, including old orders that only have it in their notes. */
export function orderPaymentMethod(o: { payment_method?: string | null; notes?: string | null }): PaymentMethod | null {
  if (o.payment_method && o.payment_method in PAYMENT_METHOD_LABELS) return o.payment_method as PaymentMethod;
  const n = o.notes || "";
  if (n.includes("online_payment") || n.includes("Bank Transfer") || n.includes("Online")) return "bank_transfer";
  if (n.includes("cash_on_delivery") || n.includes("Cash on Delivery")) return "cash_on_delivery";
  return null;
}

/** Bank-transfer details shown to customers at checkout (same as the main site). */
export const BANK_DETAILS: { label: string; value: string }[] = [
  { label: "Bank",           value: "First Citizens Bank"    },
  { label: "Account Name",   value: "Aden Anderson Flanders" },
  { label: "Account Number", value: "3058440"                },
  { label: "Account Type",   value: "Savings"                },
];
export const PROOF_OF_PAYMENT_TEXT =
  "Use your order number as the payment reference. Send proof of payment to @theclub.boils on Instagram or WhatsApp 868-293-0570.";
