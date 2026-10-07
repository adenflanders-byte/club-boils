// ─────────────────────────────────────────────────────────────────────────
// The Club Boils — single source of truth for the menu.
//
// Every product, size, extra and price lives here. The main ordering page,
// the school-event pages and the server-side checkout all import this file,
// so a price changed here changes everywhere at once. Admin on/off switches
// (the `menu_*` rows in the settings table) decide what is currently active.
//
// Prices are TT$. Each orderable item has a stable `id` that never changes;
// orders store those ids plus a snapshot of names and prices at order time.
// ─────────────────────────────────────────────────────────────────────────

/** Bump when prices or items change, so old orders show which menu they used. */
export const MENU_VERSION = "2026-10-07";

export const DELIVERY_FEE = 30;

/** Shown wherever customers enter notes or allergies. */
export const ALLERGY_WARNING =
  "Our boils contain shellfish, and dishes may contain eggs, dairy, wheat (gluten) and sausage. We cannot guarantee any item is allergen-free. Please tell us about any allergy.";

export type Heat = "mild" | "medium" | "hot";
export const HEATS: { id: Heat; label: string; emoji: string }[] = [
  { id: "mild",   label: "Mild",   emoji: "😊" },
  { id: "medium", label: "Medium", emoji: "🌶️" },
  { id: "hot",    label: "Hot",    emoji: "🔥" },
];

// ── Build Your Own Boil ingredients ──────────────────────────────────────
export const BUILD_BASE = { solo: 60, duo: 100 } as const;

export const SEAFOOD = [
  { id: "shrimp",  emoji: "🦐", label: "Shrimp",          desc: "6 shrimp",  price: 30 },
  { id: "crab",    emoji: "🦀", label: "Snow Crab",       desc: "1 portion", price: 50 },
  { id: "mussels", emoji: "🐚", label: "Mussels",         desc: "1 portion", price: 10 },
  { id: "squid",   emoji: "🐙", label: "Squid & Octopus", desc: "1 portion", price: 20 },
  { id: "clams",   emoji: "🐌", label: "Clams",           desc: "1 portion", price: 10 },
];
export const DUO_SEAFOOD = [
  { id: "shrimp",  emoji: "🦐", label: "Shrimp",          desc: "12 shrimp",  price: 60  },
  { id: "crab",    emoji: "🦀", label: "Snow Crab",       desc: "2 portions", price: 100 },
  { id: "mussels", emoji: "🐚", label: "Mussels",         desc: "2 portions", price: 20  },
  { id: "squid",   emoji: "🐙", label: "Squid & Octopus", desc: "2 portions", price: 40  },
  { id: "clams",   emoji: "🐌", label: "Clams",           desc: "2 portions", price: 20  },
];
export const EXTRAS = [
  { id: "eggs",     emoji: "🥚", label: "Eggs",           desc: "2 pieces",  price: 5  },
  { id: "sausage",  emoji: "🌭", label: "Sausage",        desc: "1 portion", price: 10 },
  { id: "corn",     emoji: "🌽", label: "Extra Corn",     desc: "1 portion", price: 5  },
  { id: "potatoes", emoji: "🥔", label: "Extra Potatoes", desc: "1 portion", price: 5  },
];
export const DUO_EXTRAS = [
  { id: "eggs",     emoji: "🥚", label: "Eggs",           desc: "4 pieces",   price: 10 },
  { id: "sausage",  emoji: "🌭", label: "Sausage",        desc: "2 portions", price: 20 },
  { id: "corn",     emoji: "🌽", label: "Extra Corn",     desc: "2 portions", price: 10 },
  { id: "potatoes", emoji: "🥔", label: "Extra Potatoes", desc: "2 portions", price: 10 },
];

// ── Add-ons for Solo, Duo and Lobster boils ──────────────────────────────
export const ADDON_EXTRAS = [
  { id: "extra_shrimp",  emoji: "🦐", label: "Extra Shrimp",          unitPrice: 25 },
  { id: "extra_crab",    emoji: "🦀", label: "Extra Snow Crab",       unitPrice: 50 },
  { id: "extra_butter",  emoji: "🧈", label: "Specialty Butter Sauce", unitPrice: 10 },
  { id: "extra_egg",     emoji: "🥚", label: "Extra Egg",             unitPrice: 5  },
  { id: "extra_clams",   emoji: "🐚", label: "Extra Clams",           unitPrice: 10 },
  { id: "extra_mussels", emoji: "🦪", label: "Extra Mussels",         unitPrice: 10 },
  { id: "extra_sausage", emoji: "🌭", label: "Extra Sausage",         unitPrice: 10 },
  { id: "extra_corn",    emoji: "🌽", label: "Extra Corn",            unitPrice: 5  },
  { id: "extra_potato",  emoji: "🥔", label: "Extra Potatoes",        unitPrice: 5  },
  { id: "pepper_sauce",  emoji: "🌶️", label: "Pepper Sauce",          unitPrice: 10 },
];
export const MAX_ADDON_QTY = 10;

// ── Fixed products ───────────────────────────────────────────────────────
export const SOLO_OPTIONS = [
  { id: "solo-shrimp", label: "Shrimp",             price: 130 },
  { id: "solo-crab",   label: "Snow Crab",          price: 130 },
  { id: "solo-mix",    label: "Mix (Shrimp + Crab)", price: 160 },
];
export const DUO_OPTIONS = [
  { id: "duo-shrimp", label: "Shrimp",             price: 280 },
  { id: "duo-crab",   label: "Snow Crab",          price: 280 },
  { id: "duo-mix",    label: "Mix (Shrimp + Crab)", price: 320 },
];
export const SIMPLE_ITEMS = [
  { id: "ramen", name: "Shrimp Alfredo Ramen Boil", desc: "Shrimp, ramen noodles, homemade Alfredo sauce, sausage, boiled egg & corn", price: 100, image: "/ramen2.jpeg" as string | null, tag: "Fan Favourite" as string | null },
  { id: "wings", name: "Wings Boil", desc: "6-8 wings tossed in our signature specialty butter sauce", price: 80, image: "/wings2.jpeg" as string | null, tag: null as string | null },
  { id: "sauce", name: "Pepper Sauce", desc: "Homemade Lime Pepper Sauce — optional add-on", price: 10, image: null as string | null, tag: null as string | null },
  { id: "combo", name: "Club Ramen Wings Combo", desc: "Shrimp Alfredo Ramen Boil + Wings Boil — the ultimate combo", price: 120, image: "/wings2.jpeg" as string | null, tag: "New" as string | null },
];
export const LOBSTER_PRODUCTS = [
  { id: "lobster_half",         name: "Half Lobster Boil",           desc: "½ lobster, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce",                    soloPrice: 260, duoPrice: 360, soloPortions: "½ lobster",                         duoPortions: "½ lobster (larger serving)" },
  { id: "lobster_whole",        name: "Whole Lobster Boil",          desc: "1 whole lobster, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce",              soloPrice: 360, duoPrice: 550, soloPortions: "1 whole lobster",                   duoPortions: "1 whole lobster (larger serving)" },
  { id: "lobster_shrimp_half",  name: "Shrimp & Half Lobster Boil",  desc: "½ lobster, shrimp, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce",            soloPrice: 290, duoPrice: 460, soloPortions: "½ lobster + 6 shrimp",              duoPortions: "½ lobster + 12 shrimp" },
  { id: "lobster_shrimp_whole", name: "Shrimp & Whole Lobster Boil", desc: "1 whole lobster, shrimp, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce",      soloPrice: 390, duoPrice: 610, soloPortions: "1 whole lobster + 6 shrimp",        duoPortions: "1 whole lobster + 12 shrimp" },
  { id: "lobster_loaded_half",  name: "Loaded Half Lobster Boil",    desc: "½ lobster, shrimp, snow crab, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce", soloPrice: 340, duoPrice: 560, soloPortions: "½ lobster + shrimp + snow crab",    duoPortions: "½ lobster + shrimp + snow crab (larger serving)" },
  { id: "lobster_loaded_whole", name: "Loaded Whole Lobster Boil",   desc: "1 whole lobster, shrimp, snow crab, sausage, boiled egg, clams, mussels, octopi, squid, corn, potatoes & House Butter Sauce", soloPrice: 440, duoPrice: 710, soloPortions: "1 whole lobster + shrimp + snow crab", duoPortions: "1 whole lobster + shrimp + snow crab (larger serving)" },
];

// ── The orderable catalogue (derived from the lists above) ───────────────
export type CatalogGroup = "solo" | "duo" | "lobster" | "build" | "more";
export interface CatalogItem {
  /** Stable id stored on orders and in event hide-lists. Never rename. */
  id: string;
  group: CatalogGroup;
  /** Name as it appears on receipts and in the kitchen list. */
  name: string;
  /** Short line under the name (portion / option). */
  description: string;
  basePrice: number;
  /** settings key that switches this item on/off on the website. */
  settingKey: string;
  /** settings key for the Fan Favourite badge. */
  favKey: string;
  allowsAddons: boolean;
  /** "build" items choose seafood, extras and heat; "fixed" items do not. */
  kind: "fixed" | "build";
  size?: "solo" | "duo";
}

export const CATALOG: CatalogItem[] = [
  ...SOLO_OPTIONS.map(o => {
    const key = o.id.split("-")[1];
    return { id: `solo_${key}`, group: "solo" as const, name: "Club Solo", description: o.label, basePrice: o.price,
             settingKey: `menu_solo_${key}`, favKey: `fav_solo_${key}`, allowsAddons: true, kind: "fixed" as const, size: "solo" as const };
  }),
  ...DUO_OPTIONS.map(o => {
    const key = o.id.split("-")[1];
    return { id: `duo_${key}`, group: "duo" as const, name: "Club Duo", description: o.label, basePrice: o.price,
             settingKey: `menu_duo_${key}`, favKey: `fav_duo_${key}`, allowsAddons: true, kind: "fixed" as const, size: "duo" as const };
  }),
  ...LOBSTER_PRODUCTS.flatMap(p => ([
    { id: `${p.id}_solo`, group: "lobster" as const, name: `${p.name} (Solo)`, description: p.soloPortions, basePrice: p.soloPrice,
      settingKey: `menu_${p.id}`, favKey: `fav_${p.id}`, allowsAddons: true, kind: "fixed" as const, size: "solo" as const },
    { id: `${p.id}_duo`, group: "lobster" as const, name: `${p.name} (Duo)`, description: p.duoPortions, basePrice: p.duoPrice,
      settingKey: `menu_${p.id}`, favKey: `fav_${p.id}`, allowsAddons: true, kind: "fixed" as const, size: "duo" as const },
  ])),
  { id: "build_solo", group: "build", name: "Build Your Own Boil",       description: "Solo — choose seafood, extras & heat", basePrice: BUILD_BASE.solo,
    settingKey: "menu_build", favKey: "fav_build", allowsAddons: false, kind: "build", size: "solo" },
  { id: "build_duo",  group: "build", name: "Build Your Own Boil (Duo)", description: "Duo — choose seafood, extras & heat",  basePrice: BUILD_BASE.duo,
    settingKey: "menu_build", favKey: "fav_build", allowsAddons: false, kind: "build", size: "duo" },
  ...SIMPLE_ITEMS.map(i => ({
    id: i.id, group: "more" as const, name: i.name, description: i.desc, basePrice: i.price,
    settingKey: `menu_${i.id}`, favKey: `fav_${i.id}`, allowsAddons: false, kind: "fixed" as const,
  })),
];

const CATALOG_BY_ID = new Map(CATALOG.map(i => [i.id, i]));
export function getCatalogItem(id: string): CatalogItem | undefined { return CATALOG_BY_ID.get(id); }

/** Catalogue id for a Solo/Duo option id used by the page ("solo-shrimp" → "solo_shrimp"). */
export const optionItemId = (optionId: string) => optionId.replace("-", "_");
/** Catalogue id for a lobster product + size ("lobster_half", "duo" → "lobster_half_duo"). */
export const lobsterItemId = (productId: string, size: "solo" | "duo") => `${productId}_${size}`;

// ── Availability ─────────────────────────────────────────────────────────
export type SettingsMap = Record<string, string | undefined>;

/** Items are on unless Admin has switched their `menu_*` key to "false". */
export function isItemActive(item: CatalogItem, settings: SettingsMap): boolean {
  return settings[item.settingKey] !== "false";
}

export function settingsFromRows(rows: { key: string; value: string | null }[] | null | undefined): SettingsMap {
  const map: SettingsMap = {};
  for (const r of rows ?? []) map[r.key] = r.value ?? undefined;
  return map;
}

// ── Pricing (used by the browser for display and by the server as the truth)
export interface LineInput {
  itemId: string;
  quantity: number;
  /** Add-on id → quantity (Solo, Duo, Lobster only). */
  addons?: Record<string, number>;
  /** Build Your Own only. */
  seafood?: string[];
  extras?: string[];
  heat?: string;
}

export interface PricedLine {
  itemId: string;
  name: string;
  description: string;
  size: "solo" | "duo" | null;
  quantity: number;
  basePrice: number;
  addons: { id: string; label: string; qty: number; unitPrice: number }[];
  seafood: { id: string; label: string; price: number }[];
  extras: { id: string; label: string; price: number }[];
  heat: Heat | null;
  unitPrice: number;
  lineTotal: number;
}

export type PriceResult =
  | { ok: true; lines: PricedLine[]; subtotal: number }
  | { ok: false; error: string; itemId?: string };

export const MAX_LINES = 30;
export const MAX_QTY_PER_LINE = 20;

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/**
 * Validate and price a cart. Never trusts anything but item ids, option ids
 * and quantities; every price comes from this file.
 * `isAvailable` decides whether an item may be ordered right now.
 */
export function priceCart(input: unknown, isAvailable: (item: CatalogItem) => boolean): PriceResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Your cart is empty." };
  if (input.length > MAX_LINES) return { ok: false, error: "Too many items in one order." };

  const lines: PricedLine[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid cart item." };
    const l = raw as Record<string, unknown>;
    const itemId = typeof l.itemId === "string" ? l.itemId : "";
    const item = getCatalogItem(itemId);
    if (!item) return { ok: false, error: "An item in your cart is no longer on the menu.", itemId };
    if (!isAvailable(item)) return { ok: false, error: `${item.name} (${item.description}) is not available right now.`, itemId };
    if (!isInt(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY_PER_LINE) return { ok: false, error: "Invalid quantity.", itemId };

    // Add-ons
    const addons: PricedLine["addons"] = [];
    if (l.addons !== undefined && l.addons !== null) {
      if (typeof l.addons !== "object" || Array.isArray(l.addons)) return { ok: false, error: "Invalid extras.", itemId };
      for (const [id, qty] of Object.entries(l.addons as Record<string, unknown>)) {
        if (qty === 0) continue;
        const addon = ADDON_EXTRAS.find(a => a.id === id);
        if (!addon) return { ok: false, error: "An extra in your cart is no longer available.", itemId };
        if (!item.allowsAddons) return { ok: false, error: `${item.name} cannot be customised.`, itemId };
        if (!isInt(qty) || qty < 0 || qty > MAX_ADDON_QTY) return { ok: false, error: "Invalid extra quantity.", itemId };
        addons.push({ id, label: addon.label, qty, unitPrice: addon.unitPrice });
      }
      addons.sort((a, b) => ADDON_EXTRAS.findIndex(x => x.id === a.id) - ADDON_EXTRAS.findIndex(x => x.id === b.id));
    }

    // Build Your Own
    let seafood: PricedLine["seafood"] = [];
    let extras: PricedLine["extras"] = [];
    let heat: Heat | null = null;
    if (item.kind === "build") {
      const sfList = item.size === "duo" ? DUO_SEAFOOD : SEAFOOD;
      const exList = item.size === "duo" ? DUO_EXTRAS : EXTRAS;
      const sf = Array.isArray(l.seafood) ? l.seafood : [];
      const ex = Array.isArray(l.extras) ? l.extras : [];
      if (sf.length === 0) return { ok: false, error: "Pick at least one seafood for Build Your Own.", itemId };
      if (new Set(sf).size !== sf.length || new Set(ex).size !== ex.length) return { ok: false, error: "Duplicate choices in Build Your Own.", itemId };
      for (const id of sf) {
        const s = sfList.find(x => x.id === id);
        if (!s) return { ok: false, error: "Invalid seafood choice.", itemId };
        seafood.push({ id: s.id, label: s.label, price: s.price });
      }
      for (const id of ex) {
        const e = exList.find(x => x.id === id);
        if (!e) return { ok: false, error: "Invalid extra choice.", itemId };
        extras.push({ id: e.id, label: e.label, price: e.price });
      }
      const h = HEATS.find(x => x.id === l.heat);
      if (!h) return { ok: false, error: "Choose a heat level for Build Your Own.", itemId };
      heat = h.id;
      // keep menu order so identical builds look identical
      seafood = sfList.filter(s => seafood.some(x => x.id === s.id)).map(s => ({ id: s.id, label: s.label, price: s.price }));
      extras  = exList.filter(e => extras.some(x => x.id === e.id)).map(e => ({ id: e.id, label: e.label, price: e.price }));
    } else if ((Array.isArray(l.seafood) && l.seafood.length) || (Array.isArray(l.extras) && l.extras.length)) {
      return { ok: false, error: "Invalid options for this item.", itemId };
    }

    const unitPrice = item.basePrice
      + addons.reduce((s, a) => s + a.qty * a.unitPrice, 0)
      + seafood.reduce((s, x) => s + x.price, 0)
      + extras.reduce((s, x) => s + x.price, 0);

    lines.push({
      itemId: item.id, name: item.name, description: describeLine(item, addons, seafood, extras, heat),
      size: item.size ?? null, quantity: l.quantity, basePrice: item.basePrice,
      addons, seafood, extras, heat, unitPrice, lineTotal: unitPrice * l.quantity,
    });
  }
  return { ok: true, lines, subtotal: lines.reduce((s, l) => s + l.lineTotal, 0) };
}

/** Human description, matching what the kitchen has always seen. */
export function describeLine(
  item: CatalogItem,
  addons: PricedLine["addons"],
  seafood: PricedLine["seafood"],
  extras: PricedLine["extras"],
  heat: Heat | null,
): string {
  if (item.kind === "build") {
    const heatLabel = HEATS.find(h => h.id === heat)?.label ?? "";
    const base = `${seafood.map(s => s.label).join(", ")}${extras.length ? ` + ${extras.map(e => e.label).join(", ")}` : ""} - ${heatLabel}`;
    return item.size === "duo" ? `${base} (Duo)` : base;
  }
  return item.description + (addons.length ? " + " + addons.map(a => `${a.qty}x ${a.label}`).join(", ") : "");
}

/** Lines in the legacy text format still used by the Admin order list. */
export function legacyDetails(lines: PricedLine[]): string[] {
  return lines.map(l => `${l.quantity}x ${l.name} (${l.description}) - TT$${l.lineTotal}`);
}
export function legacyPackage(lines: PricedLine[]): string {
  return lines.map(l => `${l.quantity}x ${l.name}`).join(", ");
}

/** Public, display-ready menu for a set of settings (used by /api/menu and event pages). */
export function publicMenu(settings: SettingsMap, hiddenIds: string[] = []) {
  const hidden = new Set(hiddenIds);
  return CATALOG.map(item => ({
    id: item.id, group: item.group, name: item.name, description: item.description,
    basePrice: item.basePrice, size: item.size ?? null, kind: item.kind, allowsAddons: item.allowsAddons,
    active: isItemActive(item, settings) && !hidden.has(item.id),
    favourite: settings[item.favKey] === "true",
  }));
}
export type PublicMenuItem = ReturnType<typeof publicMenu>[number];
