import type { PricedLine } from "../menu";

export interface NewOrderNotification {
  orderNumber: string;
  name: string;
  phone: string;
  customerEmail: string | null;
  fulfilment: string;
  address: string | null;
  deliveryArea: string | null;
  scheduledDate: string | null;
  total: number;
  paymentMethod: string;
  notes: string | null;
  lines: { name: string; description: string; quantity: number; lineTotal: number }[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function notificationFromOrderRow(row: Record<string, unknown>): NewOrderNotification {
  const items = Array.isArray(row.items) ? row.items as PricedLine[] : [];
  return {
    orderNumber: text(row.order_number),
    name: text(row.name),
    phone: text(row.phone),
    customerEmail: text(row.email) || null,
    fulfilment: text(row.fulfilment_type || row.fulfillment),
    address: text(row.address) || null,
    deliveryArea: text(row.delivery_area) || null,
    scheduledDate: text(row.scheduled_fulfilment_date) || null,
    total: money(row.total),
    paymentMethod: text(row.payment_method),
    notes: text(row.notes) || null,
    lines: items.map(item => ({
      name: text(item.name),
      description: text(item.description),
      quantity: money(item.quantity),
      lineTotal: money(item.lineTotal),
    })),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function fulfilmentDate(value: string | null): string {
  if (!value) return "Not assigned";
  const date = new Date(`${value}T12:00:00-04:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-TT", {
    timeZone: "America/Port_of_Spain",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function buildOrderNotificationEmail(order: NewOrderNotification) {
  const subject = `New order ${order.orderNumber} - ${order.name} - TT$${order.total}`;
  const itemText = order.lines.map(line =>
    `${line.quantity}x ${line.name}${line.description ? ` (${line.description})` : ""} - TT$${line.lineTotal}`
  ).join("\n");
  const location = [order.deliveryArea, order.address].filter(Boolean).join(" - ") || "Arima pickup";
  const plainText = [
    "A new order has been placed on The Club Boils website.",
    "",
    `Order: ${order.orderNumber}`,
    `Customer: ${order.name}`,
    `Phone: ${order.phone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : "",
    `Date: ${fulfilmentDate(order.scheduledDate)}`,
    `Method: ${label(order.fulfilment)}`,
    `Location: ${location}`,
    `Payment: ${label(order.paymentMethod)}`,
    "",
    "Items:",
    itemText || "Order details unavailable",
    "",
    `Total: TT$${order.total}`,
    "",
    "Open Admin: https://www.theclubboils.com/admin",
  ].filter(line => line !== "").join("\n");

  const itemRows = order.lines.map(line => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e8e1d4;vertical-align:top">${escapeHtml(line.quantity)}x</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e8e1d4">
        <strong>${escapeHtml(line.name)}</strong><br>
        <span style="color:#6d675f;font-size:13px">${escapeHtml(line.description)}</span>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #e8e1d4;text-align:right;white-space:nowrap">TT$${escapeHtml(line.lineTotal)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
  <html><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#171613">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#171613;color:#fff;padding:24px;border-top:4px solid #c9972b">
        <div style="color:#d8aa3d;font-size:12px;letter-spacing:2px;text-transform:uppercase">The Club Boils</div>
        <h1 style="font-size:24px;margin:8px 0 0">New Order ${escapeHtml(order.orderNumber)}</h1>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e8e1d4">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:5px 0;color:#6d675f">Customer</td><td style="padding:5px 0;text-align:right"><strong>${escapeHtml(order.name)}</strong></td></tr>
          <tr><td style="padding:5px 0;color:#6d675f">Phone</td><td style="padding:5px 0;text-align:right">${escapeHtml(order.phone)}</td></tr>
          ${order.customerEmail ? `<tr><td style="padding:5px 0;color:#6d675f">Email</td><td style="padding:5px 0;text-align:right">${escapeHtml(order.customerEmail)}</td></tr>` : ""}
          <tr><td style="padding:5px 0;color:#6d675f">Order date</td><td style="padding:5px 0;text-align:right">${escapeHtml(fulfilmentDate(order.scheduledDate))}</td></tr>
          <tr><td style="padding:5px 0;color:#6d675f">Method</td><td style="padding:5px 0;text-align:right">${escapeHtml(label(order.fulfilment))}</td></tr>
          <tr><td style="padding:5px 0;color:#6d675f">Location</td><td style="padding:5px 0;text-align:right">${escapeHtml(location)}</td></tr>
          <tr><td style="padding:5px 0;color:#6d675f">Payment</td><td style="padding:5px 0;text-align:right">${escapeHtml(label(order.paymentMethod))}</td></tr>
        </table>
        <h2 style="font-size:16px;margin:24px 0 8px">Order items</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows || `<tr><td style="padding:10px 8px">Order details unavailable</td></tr>`}</table>
        <div style="font-size:22px;font-weight:bold;text-align:right;margin:20px 0">Total: <span style="color:#a9770d">TT$${escapeHtml(order.total)}</span></div>
        <a href="https://www.theclubboils.com/admin" style="display:block;background:#d9a62f;color:#111;text-align:center;text-decoration:none;font-weight:bold;padding:14px 18px;border-radius:4px">Open Admin Dashboard</a>
      </div>
    </div>
  </body></html>`;

  return { subject, text: plainText, html };
}

export async function sendNewOrderNotification(order: NewOrderNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL;
  if (!apiKey || !recipient) {
    console.warn("[order-email] RESEND_API_KEY or ORDER_NOTIFICATION_EMAIL is not configured");
    return;
  }

  const email = buildOrderNotificationEmail(order);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ORDER_NOTIFICATION_FROM || "The Club Boils <onboarding@resend.dev>",
      to: [recipient],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    console.error("[order-email] provider rejected notification", response.status);
  }
}
