"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type Heat = "mild" | "medium" | "hot" | "";

interface CartItem {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
}

const SEAFOOD = [
  { id: "shrimp",  emoji: "🦐", label: "Shrimp",         desc: "6 shrimp",            price: 30 },
  { id: "crab",    emoji: "🦀", label: "Snow Crab",       desc: "1 portion",           price: 50 },
  { id: "mussels", emoji: "🐚", label: "Mussels",         desc: "1 portion",           price: 10 },
  { id: "squid",   emoji: "🐙", label: "Squid & Octopus", desc: "1 portion",           price: 20 },
  { id: "clams",   emoji: "🐌", label: "Clams",           desc: "1 portion",           price: 10 },
];
const DUO_SEAFOOD = [
  { id: "shrimp",  emoji: "🦐", label: "Shrimp",         desc: "12 shrimp",           price: 60  },
  { id: "crab",    emoji: "🦀", label: "Snow Crab",       desc: "2 portions",          price: 100 },
  { id: "mussels", emoji: "🐚", label: "Mussels",         desc: "2 portions",          price: 20  },
  { id: "squid",   emoji: "🐙", label: "Squid & Octopus", desc: "2 portions",          price: 40  },
  { id: "clams",   emoji: "🐌", label: "Clams",           desc: "2 portions",          price: 20  },
];
const EXTRAS = [
  { id: "eggs",     emoji: "🥚", label: "Eggs",           desc: "2 pieces",  price: 5  },
  { id: "sausage",  emoji: "🌭", label: "Sausage",        desc: "1 portion", price: 10 },
  { id: "corn",     emoji: "🌽", label: "Extra Corn",     desc: "1 portion", price: 5  },
  { id: "potatoes", emoji: "🥔", label: "Extra Potatoes", desc: "1 portion", price: 5  },
];
const DUO_EXTRAS = [
  { id: "eggs",     emoji: "🥚", label: "Eggs",           desc: "4 pieces",  price: 10 },
  { id: "sausage",  emoji: "🌭", label: "Sausage",        desc: "2 portions",price: 20 },
  { id: "corn",     emoji: "🌽", label: "Extra Corn",     desc: "2 portions",price: 10 },
  { id: "potatoes", emoji: "🥔", label: "Extra Potatoes", desc: "2 portions",price: 10 },
];
const HEATS = [
  { id: "mild",   label: "Mild",   emoji: "😊" },
  { id: "medium", label: "Medium", emoji: "🌶️" },
  { id: "hot",    label: "Hot",    emoji: "🔥" },
];
const SOLO_OPTIONS = [
  { id: "solo-shrimp", label: "Shrimp",             price: 130 },
  { id: "solo-crab",   label: "Snow Crab",           price: 130 },
  { id: "solo-mix",    label: "Mix (Shrimp + Crab)", price: 160 },
];
const DUO_OPTIONS = [
  { id: "duo-shrimp", label: "Shrimp",             price: 280 },
  { id: "duo-crab",   label: "Snow Crab",           price: 280 },
  { id: "duo-mix",    label: "Mix (Shrimp + Crab)", price: 320 },
];
const SIMPLE_ITEMS = [
  { id: "ramen", name: "Shrimp Alfredo Ramen Boil", desc: "Shrimp, ramen noodles, homemade Alfredo sauce, sausage, boiled egg & corn", price: 100, image: "/ramen2.jpeg", tag: "Fan Favourite" },
  { id: "wings", name: "Wings Boil", desc: "6-8 wings tossed in our signature specialty butter sauce", price: 80, image: "/wings2.jpeg", tag: null },
  { id: "sauce", name: "Pepper Sauce", desc: "Homemade Lime Pepper Sauce — optional add-on", price: 10, image: null, tag: null },
  { id: "combo", name: "Club Ramen Wings Combo", desc: "Shrimp Alfredo Ramen Boil + Wings Boil — the ultimate combo", price: 120, image: "/wings2.jpeg", tag: "New" },
];

const BASE = 60;
const DELIVERY_FEE = 30;

export default function Home() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMenu,    setShowMenu]    = useState(false);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [showCart,    setShowCart]    = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showBuild,    setShowBuild]    = useState(false);
  const [buildType,    setBuildType]    = useState<"solo" | "duo" | "">("");
  const [showDuoBuild, setShowDuoBuild] = useState(false);
  const [duoBuildSeafood, setDuoBuildSeafood] = useState<string[]>([]);
  const [duoBuildExtras,  setDuoBuildExtras]  = useState<string[]>([]);
  const [duoBuildHeat,    setDuoBuildHeat]    = useState<Heat>("");
  const [buildSeafood, setBuildSeafood] = useState<string[]>([]);
  const [buildExtras,  setBuildExtras]  = useState<string[]>([]);
  const [buildHeat,    setBuildHeat]    = useState<Heat>("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup" | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cash" | "">("");
  const [orderDay, setOrderDay] = useState<"thursday" | "friday" | "saturday" | "">("");
  const [openDays, setOpenDays] = useState({ thursday: true, friday: true, saturday: false });
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [email,   setEmail]   = useState("");
  const [address, setAddress] = useState("");
  const [notes,   setNotes]   = useState("");
  const [timeLeft, setTimeLeft] = useState<any>({ days: 0, hours: 0, minutes: 0, seconds: 0, closed: false, orderDay: "", cutoffDay: "" });
  const [reviews, setReviews] = useState<{id: string, name: string, rating: number, comment: string, created_at: string}[]>([]);
  const [reviewName,    setReviewName]    = useState("");
  const [reviewRating,  setReviewRating]  = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted,  setReviewSubmitted]  = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [favItems, setFavItems] = useState<Record<string, boolean>>({
    fav_solo_shrimp: false, fav_solo_crab: false, fav_solo_mix: false,
    fav_duo_shrimp: false,  fav_duo_crab: false,  fav_duo_mix: false,
    fav_ramen: false, fav_wings: false, fav_sauce: false, fav_build: false, fav_combo: false,
  });
  const [menuItems,  setMenuItems]  = useState<Record<string, boolean>>({
    menu_solo_shrimp: true, menu_solo_crab: true, menu_solo_mix: true,
    menu_duo_shrimp: true,  menu_duo_crab: true,  menu_duo_mix: true,
    menu_ramen: true, menu_wings: true, menu_sauce: true, menu_build: true, menu_combo: true,
  });
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [tiltStyle, setTiltStyle] = useState<Record<string, React.CSSProperties>>({});

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase.from("settings").select("*");
      if (data) {
        const ordersOpenRow = data.find(r => r.key === "orders_open");
        if (ordersOpenRow) setOrdersOpen(ordersOpenRow.value === "true");
        const menuState: Record<string, boolean> = {};
        data.filter(r => r.key.startsWith("menu_")).forEach(r => { menuState[r.key] = r.value === "true"; });
        if (Object.keys(menuState).length > 0) setMenuItems(prev => ({ ...prev, ...menuState }));
        const favState: Record<string, boolean> = {};
        data.filter(r => r.key.startsWith("fav_")).forEach(r => { favState[r.key] = r.value === "true"; });
        if (Object.keys(favState).length > 0) setFavItems(prev => ({ ...prev, ...favState }));
        const thuDay = data.find(r => r.key === "day_thursday");
        const friDay = data.find(r => r.key === "day_friday");
        const satDay = data.find(r => r.key === "day_saturday");
        setOpenDays({
          thursday: thuDay ? thuDay.value === "true" : true,
          friday:   friDay ? friDay.value === "true" : true,
          saturday: satDay ? satDay.value === "true" : false,
        });
      }
    }
    fetchSettings();
    fetchReviews();
  }, []);

  async function fetchReviews() {
    const { data } = await supabase.from("reviews").select("*").eq("approved", true).order("created_at", { ascending: false });
    if (data) setReviews(data);
  }

  async function submitReview() {
    if (!reviewName.trim())    { alert("Please enter your name."); return; }
    if (!reviewRating)         { alert("Please select a rating."); return; }
    if (!reviewComment.trim()) { alert("Please write a comment."); return; }
    setReviewSubmitting(true);
    await supabase.from("reviews").insert({
      name: reviewName.trim(),
      rating: reviewRating,
      comment: reviewComment.trim(),
      approved: false,
    });
    setReviewSubmitting(false);
    setReviewSubmitted(true);
    setReviewName(""); setReviewRating(0); setReviewComment("");
  }

  useEffect(() => {
    function getNextOrderInfo() {
      const now = new Date();
      // Day schedule: cutoff night before at 8PM
      // Thursday orders close Wednesday 8PM (day 3)
      // Friday orders close Thursday 8PM (day 4)
      // Saturday orders close Friday 8PM (day 5)
      const schedule = [
        { orderDay: "Thursday", cutoffDay: 3, label: "Thursday" },
        { orderDay: "Friday",   cutoffDay: 4, label: "Friday"   },
        { orderDay: "Saturday", cutoffDay: 5, label: "Saturday" },
      ];

      // Filter to only open days
      const activeDays = schedule.filter(s => {
        const key = s.orderDay.toLowerCase() as keyof typeof openDays;
        return openDays[key];
      });

      if (activeDays.length === 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: true, orderDay: "", cutoffDay: "" };
      }

      // Find next available cutoff
      for (let week = 0; week < 2; week++) {
        for (const slot of activeDays) {
          const target = new Date();
          const currentDay = target.getDay();
          let diff = slot.cutoffDay - currentDay + (week * 7);
          if (diff < 0) diff += 7;
          target.setDate(target.getDate() + diff);
          target.setHours(20, 0, 0, 0);
          if (target > now) {
            const ms = target.getTime() - now.getTime();
            return {
              days:    Math.floor(ms / (1000 * 60 * 60 * 24)),
              hours:   Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
              minutes: Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)),
              seconds: Math.floor((ms % (1000 * 60)) / 1000),
              closed: false,
              orderDay: slot.orderDay,
              cutoffDay: slot.label,
            };
          }
        }
      }
      return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: true, orderDay: "", cutoffDay: "" };
    }
    setTimeLeft(getNextOrderInfo() as any);
    const interval = setInterval(() => setTimeLeft(getNextOrderInfo() as any), 1000);
    return () => clearInterval(interval);
  }, [openDays]);

  // Scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll("[data-animate]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [showMenu]);

  // 3D tilt on menu cards
  function handleTilt(e: React.MouseEvent<HTMLDivElement>, id: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y / rect.height) - 0.5) * -12;
    const rotateY = ((x / rect.width) - 0.5) * 12;
    setTiltStyle(prev => ({
      ...prev,
      [id]: { transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`, transition: "transform 0.1s ease" }
    }));
  }
  function resetTilt(id: string) {
    setTiltStyle(prev => ({
      ...prev,
      [id]: { transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)", transition: "transform 0.4s ease" }
    }));
  }

  function addToCart(item: Omit<CartItem, "quantity">) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id && c.description === item.description);
      if (existing) return prev.map(c => c.id === item.id && c.description === item.description ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
    setShowCart(true);
  }
  function removeFromCart(idx: number) {
    setCart(prev => {
      const updated = [...prev];
      if (updated[idx].quantity > 1) updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 };
      else updated.splice(idx, 1);
      return updated;
    });
  }
  function calcBuildPrice(s: string[], e: string[]) {
    return BASE
      + s.reduce((sum, id) => sum + (SEAFOOD.find(x => x.id === id)?.price ?? 0), 0)
      + e.reduce((sum, id) => sum + (EXTRAS.find(x => x.id === id)?.price ?? 0), 0);
  }
  function toggleBuildSeafood(id: string) { setBuildSeafood(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleDuoBuildSeafood(id: string) { setDuoBuildSeafood(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleDuoBuildExtra(id: string)   { setDuoBuildExtras(prev  => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleBuildExtra(id: string)   { setBuildExtras(prev  => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  const DUO_BASE = 100;

  function calcDuoBuildPrice(s: string[], e: string[]) {
    return DUO_BASE
      + s.reduce((sum, id) => sum + (DUO_SEAFOOD.find(x => x.id === id)?.price ?? 0), 0)
      + e.reduce((sum, id) => sum + (DUO_EXTRAS.find(x  => x.id === id)?.price ?? 0), 0);
  }

  function addDuoBuildToCart() {
    if (duoBuildSeafood.length === 0) { alert("Please pick at least one seafood item."); return; }
    if (!duoBuildHeat) { alert("Please choose a heat level."); return; }
    const seafoodLabels = duoBuildSeafood.map(id => DUO_SEAFOOD.find(x => x.id === id)?.label).join(", ");
    const extraLabels   = duoBuildExtras.map(id  => DUO_EXTRAS.find(x  => x.id === id)?.label).join(", ");
    const heatLabel     = HEATS.find(h => h.id === duoBuildHeat)?.label ?? "";
    const desc = `${seafoodLabels}${extraLabels ? ` + ${extraLabels}` : ""} - ${heatLabel} (Duo)`;
    addToCart({ id: `duo-build-${Date.now()}`, name: "Build Your Own Boil (Duo)", description: desc, price: calcDuoBuildPrice(duoBuildSeafood, duoBuildExtras) });
    setDuoBuildSeafood([]); setDuoBuildExtras([]); setDuoBuildHeat(""); setShowDuoBuild(false);
  }

  function addBuildToCart() {
    if (buildSeafood.length === 0) { alert("Please pick at least one seafood item."); return; }
    if (!buildHeat) { alert("Please choose a heat level."); return; }
    const seafoodLabels = buildSeafood.map(id => SEAFOOD.find(x => x.id === id)?.label).join(", ");
    const extraLabels   = buildExtras.map(id  => EXTRAS.find(x  => x.id === id)?.label).join(", ");
    const heatLabel     = HEATS.find(h => h.id === buildHeat)?.label ?? "";
    addToCart({ id: `build-${Date.now()}`, name: "Build Your Own Boil", description: `${seafoodLabels}${extraLabels ? ` + ${extraLabels}` : ""} - ${heatLabel}`, price: calcBuildPrice(buildSeafood, buildExtras) });
    setBuildSeafood([]); setBuildExtras([]); setBuildHeat(""); setShowBuild(false);
  }
  function revealMenu() {
    setShowMenu(true);
    setTimeout(() => { menuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }
  async function handleSubmit() {
    if (!name.trim() || !phone.trim())                 { alert("Please fill in your name and phone number."); return; }
    if (!fulfillment)                                  { alert("Please choose delivery or pickup."); return; }
    if (fulfillment === "delivery" && !address.trim()) { alert("Please enter your delivery address."); return; }
    if (cart.length === 0)                             { alert("Your cart is empty!"); return; }
    if (!paymentMethod)                                { alert("Please choose a payment method."); return; }
    if (!orderDay)                                     { alert("Please choose which day you are ordering for."); return; }
    setSubmitting(true); setSubmitError("");
    const details = cart.map(item => `${item.quantity}x ${item.name} (${item.description}) - TT$${item.price * item.quantity}`);
    const { error } = await supabase.from("orders").insert({
      name: name.trim(), phone: phone.trim(), email: email.trim() || null,
      package: cart.map(i => `${i.quantity}x ${i.name}`).join(", "),
      details, fulfillment,
      address: fulfillment === "delivery" ? address.trim() : null,
      notes: (notes.trim() ? notes.trim() + "\n" : "") + "Payment: " + (paymentMethod === "bank" ? "Bank Transfer" : "Cash on Delivery") + "\nDay: " + orderDay.charAt(0).toUpperCase() + orderDay.slice(1), total: totalPrice, status: "new",
    });
    setSubmitting(false);
    if (error) { setSubmitError("Something went wrong. Please call us at 868-293-0570."); }
    else { setSubmitted(true); setShowCart(false); }
  }

  const cartTotal  = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount  = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = fulfillment === "delivery" ? cartTotal + DELIVERY_FEE : cartTotal;
  const activeSoloOptions = SOLO_OPTIONS.filter(o => menuItems[`menu_solo_${o.id.split("-")[1]}`]);
  const activeDuoOptions  = DUO_OPTIONS.filter(o  => menuItems[`menu_duo_${o.id.split("-")[1]}`]);
  const activeSimpleItems = SIMPLE_ITEMS.filter(i => menuItems[`menu_${i.id}`]);
  const buildEnabled      = menuItems["menu_build"];

  const fadeIn = (id: string, delay = 0): React.CSSProperties => ({
    opacity: visibleSections.has(id) ? 1 : 0,
    transform: visibleSections.has(id) ? "translateY(0)" : "translateY(32px)",
    transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
  });

  // Token system
  const gold    = "#C4952A";
  const goldDim = "rgba(196,149,42,0.15)";
  const cream   = "#FAF8F3";
  const black   = "#0A0A0A";
  const white   = "#FFFFFF";
  const charcoal= "#1C1C1C";
  const muted   = "#6B6560";
  const border  = "rgba(196,149,42,0.2)";

  const goldBtn: React.CSSProperties = {
    background: `linear-gradient(135deg, ${gold}, #E8B84B)`,
    color: black, padding: "16px 36px", borderRadius: "2px",
    border: "none", fontFamily: "'Inter', sans-serif", fontWeight: "700",
    fontSize: "12px", letterSpacing: "0.14em", cursor: "pointer",
    textTransform: "uppercase" as const, boxShadow: `0 4px 24px rgba(196,149,42,0.3)`,
    transition: "all 0.3s ease",
  };
  const addBtn: React.CSSProperties = {
    background: `linear-gradient(135deg, ${gold}, #E8B84B)`,
    color: black, padding: "10px 20px", borderRadius: "2px",
    border: "none", fontFamily: "'Inter', sans-serif", fontWeight: "700",
    fontSize: "11px", letterSpacing: "0.1em", cursor: "pointer",
    textTransform: "uppercase" as const, whiteSpace: "nowrap" as const,
    transition: "all 0.2s ease",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: "2px",
    border: `1px solid ${border}`, fontSize: "14px",
    fontFamily: "'Inter', sans-serif", boxSizing: "border-box" as const,
    backgroundColor: "rgba(255,255,255,0.04)", color: charcoal,
    outline: "none", transition: "border 0.2s",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700",
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: muted, display: "block", marginBottom: "8px",
  };
  const fulfillBtn = (id: string): React.CSSProperties => ({
    flex: 1, padding: "14px", borderRadius: "2px",
    border: fulfillment === id ? `1px solid ${gold}` : `1px solid ${border}`,
    backgroundColor: fulfillment === id ? goldDim : "transparent",
    cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "13px",
    fontWeight: fulfillment === id ? "700" : "400", color: fulfillment === id ? gold : muted,
    transition: "all 0.2s",
  });
  const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: "14px", borderRadius: "2px", textAlign: "left" as const,
    border: active ? `1px solid ${gold}` : `1px solid ${border}`,
    backgroundColor: active ? goldDim : "transparent",
    cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "12px",
    fontWeight: active ? "700" : "400", color: active ? gold : muted,
    transition: "all 0.2s",
  });
  const heatBtn = (id: string): React.CSSProperties => ({
    flex: 1, padding: "12px", borderRadius: "2px",
    border: buildHeat === id ? `1px solid ${gold}` : `1px solid ${border}`,
    backgroundColor: buildHeat === id ? goldDim : "transparent",
    cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "12px",
    fontWeight: buildHeat === id ? "700" : "400", color: buildHeat === id ? gold : muted,
    transition: "all 0.2s",
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: ${cream}; }
        @keyframes kenBurns {
          0%   { transform: scale(1.08); }
          100% { transform: scale(1.18); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
        .gold-shimmer {
          background: linear-gradient(90deg, ${gold}, #E8B84B, ${gold});
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        .menu-card:hover { box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
        .add-btn:hover { transform: scale(1.05); box-shadow: 0 8px 24px rgba(196,149,42,0.4); }
        .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(196,149,42,0.5); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${cream}; }
        ::-webkit-scrollbar-thumb { background: ${gold}; border-radius: 2px; }
      `}</style>

      <main style={{ fontFamily: "'Inter', sans-serif", backgroundColor: cream, color: charcoal, overflowX: "hidden" }}>

        {/* CLOSED SCREEN */}
        {!ordersOpen && (
          <div style={{ position: "fixed", inset: 0, backgroundColor: black, zIndex: 999, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", textAlign: "center" as const, padding: "24px" }}>
            <div style={{ marginBottom: "48px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
                <span style={{ color: gold, fontSize: "36px" }}>♣</span>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(32px, 6vw, 52px)", fontWeight: "600", color: white, letterSpacing: "0.1em" }}>THE CLUB</span>
              </div>
              <p style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(20px, 4vw, 32px)", color: white, letterSpacing: "0.4em", paddingLeft: "8px" }}>BOILS</p>
            </div>
            <div style={{ width: "48px", height: "1px", backgroundColor: gold, marginBottom: "40px" }} />
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, marginBottom: "20px" }}>Premium Seafood · Arima, Trinidad</p>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: "400", color: white, marginBottom: "20px", lineHeight: 1.3 }}>Coming Soon</h1>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.45)", maxWidth: "400px", lineHeight: 1.9, marginBottom: "48px", fontWeight: "300" }}>
              The Club Boils will be launching soon. Stay connected with us on social media and be the first to know when we open.
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "20px" }}>
              <div style={{ display: "flex", gap: "32px", alignItems: "center", flexWrap: "wrap" as const, justifyContent: "center" }}>
                <a href="https://instagram.com/theclub.boils" target="_blank" rel="noopener noreferrer" style={{ color: gold, textDecoration: "none", fontSize: "13px", fontWeight: "600", letterSpacing: "0.06em" }}>📸 @theclub.boils</a>
                <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                <a href="https://wa.me/18682930570?text=Hi%2C%20I%27d%20like%20some%20information%20about%20ordering%20from%20The%20Club%20Boils." target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "#25D366", color: white, padding: "10px 20px", borderRadius: "4px", textDecoration: "none", fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: "600", letterSpacing: "0.04em", marginBottom: "10px" }}>
                WhatsApp Us
              </a>
              <a href="tel:8682930570" style={{ color: gold, textDecoration: "none", fontSize: "13px", fontWeight: "600", letterSpacing: "0.06em" }}>📞 868-293-0570</a>
              </div>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase" as const }}>Stay Connected · Arima, Trinidad</p>
            </div>
          </div>
        )}

        {/* HEADER */}
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 clamp(20px, 4vw, 48px)", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(250,248,243,0.85)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: gold, fontSize: "20px" }}>♣</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "16px", fontWeight: "600", color: black, letterSpacing: "0.08em" }}>THE CLUB BOILS</span>
          </div>
          <nav style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <a onClick={revealMenu} href="#menu" style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", color: charcoal, textDecoration: "none", cursor: "pointer", textTransform: "uppercase" as const }}>Menu</a>
            <a href="#find-us" style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", color: charcoal, textDecoration: "none", textTransform: "uppercase" as const }}>Find Us</a>
            <button onClick={() => setShowCart(!showCart)} style={{ position: "relative", background: black, color: white, padding: "9px 18px", borderRadius: "2px", border: "none", fontFamily: "'Inter', sans-serif", fontWeight: "700", fontSize: "11px", letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase" as const }}>
              🛒 Cart
              {cartCount > 0 && <span style={{ background: gold, color: black, borderRadius: "50%", width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "800" }}>{cartCount}</span>}
            </button>
          </nav>
        </header>

        {/* CART DRAWER */}
        {showCart && (
          <div style={{ position: "fixed", top: "72px", right: 0, bottom: 0, width: "100%", maxWidth: "420px", backgroundColor: white, borderLeft: `1px solid ${border}`, zIndex: 200, overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" as const }}>
            <div style={{ padding: "24px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", fontWeight: "600", color: black }}>Your Order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: muted }}>✕</button>
            </div>
            {cart.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "40px", textAlign: "center" as const }}>
                <p style={{ fontSize: "48px", marginBottom: "16px" }}>🛒</p>
                <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black, marginBottom: "8px" }}>Your cart is empty</p>
                <p style={{ color: muted, fontSize: "13px", marginBottom: "24px" }}>Add items from the menu to get started</p>
                <button onClick={() => { setShowCart(false); revealMenu(); }} style={goldBtn} className="gold-btn">Browse Menu</button>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, padding: "16px 24px", overflowY: "auto" }}>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ padding: "16px 0", borderBottom: `1px solid ${border}`, display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: "600", fontSize: "13px", color: black, marginBottom: "4px" }}>{item.name}</p>
                        <p style={{ fontSize: "11px", color: muted, marginBottom: "8px", lineHeight: 1.5 }}>{item.description}</p>
                        <p style={{ fontSize: "14px", fontWeight: "700", color: gold }}>TT${item.price * item.quantity}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", border: `1px solid ${border}`, borderRadius: "2px", padding: "4px 10px" }}>
                          <button onClick={() => removeFromCart(idx)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: charcoal }}>−</button>
                          <span style={{ fontSize: "13px", fontWeight: "700", minWidth: "16px", textAlign: "center" as const }}>{item.quantity}</span>
                          <button onClick={() => setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: charcoal }}>+</button>
                        </div>
                        <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10px", color: "#C0392B", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "20px 24px", borderTop: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: muted, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Subtotal</span>
                    <span style={{ fontSize: "14px", fontWeight: "700" }}>TT${cartTotal}</span>
                  </div>
                  <p style={{ fontSize: "11px", color: muted, marginBottom: "16px" }}>Delivery fee (TT$30) added at checkout if applicable</p>
                  <button onClick={() => { setShowCart(false); setShowForm(true); setTimeout(() => document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth" }), 100); }} style={{ ...goldBtn, width: "100%", padding: "16px" }} className="gold-btn">
                    Checkout — TT${cartTotal}
                  </button>
                  <button onClick={() => { setShowCart(false); revealMenu(); }} style={{ width: "100%", marginTop: "10px", padding: "12px", borderRadius: "2px", border: `1px solid ${border}`, backgroundColor: "transparent", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.1em", cursor: "pointer", color: muted, textTransform: "uppercase" as const }}>
                    Add More Items
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {showCart && <div onClick={() => setShowCart(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 199 }} />}

        {/* HERO */}
        <section style={{ position: "relative", height: "100vh", minHeight: "600px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Ken Burns image */}
          <img
            src="/spread.jpeg"
            alt="The Club Boils"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", animation: "kenBurns 12s ease-in-out infinite alternate", pointerEvents: "none" }}
          />
          {/* Multi-layer overlay for depth */}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.75) 100%)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 50%, rgba(196,149,42,0.08) 0%, transparent 60%)`, pointerEvents: "none" }} />

          {/* Hero content */}
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 24px", maxWidth: "900px", animation: "fadeUp 1s ease 0.3s both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "24px" }}>
              <div style={{ width: "40px", height: "1px", backgroundColor: gold, opacity: 0.6 }} />
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.24em", textTransform: "uppercase" as const, color: gold }}>Trinidad&apos;s Premier Seafood Experience</p>
              <div style={{ width: "40px", height: "1px", backgroundColor: gold, opacity: 0.6 }} />
            </div>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(48px, 9vw, 100px)", fontWeight: "700", color: white, lineHeight: 0.95, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
              FRESH
            </h1>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(48px, 9vw, 100px)", fontWeight: "400", color: "#FFFFFF", WebkitTextStroke: `1px ${gold}`, lineHeight: 0.95, margin: "0 0 32px", letterSpacing: "-0.01em" }}>
              SEAFOOD
            </h1>
            <p style={{ fontSize: "clamp(13px, 2vw, 16px)", color: "rgba(255,255,255,0.65)", maxWidth: "440px", margin: "0 auto 48px", lineHeight: 1.9, fontWeight: "300", letterSpacing: "0.02em" }}>
              Open Thursday, Friday &amp; Saturday. Order online for pickup or delivery.
            </p>
            <button onClick={revealMenu} style={goldBtn} className="gold-btn">
              Browse the Menu
            </button>
          </div>

          {/* Scroll indicator */}
          <div style={{ position: "absolute", bottom: "32px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "8px", animation: "pulse 2s ease infinite" }}>
            <p style={{ fontSize: "9px", letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const }}>Scroll</p>
            <div style={{ width: "1px", height: "32px", background: `linear-gradient(to bottom, ${gold}, transparent)` }} />
          </div>
        </section>

        {/* PHOTO STRIP — parallax feel */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px", backgroundColor: black }}>
          {[
            { src: "/solo.jpeg",     label: "Club Solo"     },
            { src: "/solo2.jpeg",    label: "Fresh Daily"   },
            { src: "/crab.jpeg",     label: "Club Duo"      },
            { src: "/packaged.jpeg", label: "Ready to Go"   },
          ].map((img, i) => (
            <div key={img.src} style={{ position: "relative", aspectRatio: "1", overflow: "hidden", cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget.querySelector("img") as HTMLImageElement).style.transform = "scale(1.08)"; (e.currentTarget.querySelector(".strip-label") as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={e => { (e.currentTarget.querySelector("img") as HTMLImageElement).style.transform = "scale(1)"; (e.currentTarget.querySelector(".strip-label") as HTMLElement).style.opacity = "0"; }}
            >
              <img src={img.src} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.5s ease", pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)", pointerEvents: "none" }} />
              <p className="strip-label" style={{ position: "absolute", bottom: "12px", left: "0", right: "0", textAlign: "center" as const, fontFamily: "'Cinzel', serif", fontSize: "11px", color: gold, letterSpacing: "0.1em", opacity: 0, transition: "opacity 0.3s ease", pointerEvents: "none" }}>{img.label}</p>
            </div>
          ))}
        </section>

        {/* ORDER COUNTDOWN SECTION */}
        <section style={{ backgroundColor: black, padding: "80px clamp(20px, 4vw, 48px)", textAlign: "center" as const, borderBottom: `1px solid ${border}` }}>
          <div data-animate id="countdown-section" style={fadeIn("countdown-section")}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, marginBottom: "20px" }}>Weekly Pre-Order</p>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(32px, 5vw, 56px)", fontWeight: "600", color: white, marginBottom: "16px", lineHeight: 1.1 }}>
              {timeLeft.closed ? "Orders Are Currently Closed" : `Order for ${timeLeft.orderDay}`}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", maxWidth: "440px", margin: "0 auto 48px", lineHeight: 1.8, fontWeight: "300" }}>
              Fresh seafood made just for you. Limited slots — first come, first served.
            </p>

            {/* Open days pills */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "40px", flexWrap: "wrap" as const }}>
              {[
                { key: "thursday", label: "Thursday" },
                { key: "friday",   label: "Friday"   },
                { key: "saturday", label: "Saturday"  },
              ].map(d => (
                <span key={d.key} style={{
                  padding: "6px 16px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em",
                  backgroundColor: openDays[d.key as keyof typeof openDays] ? "rgba(196,149,42,0.2)" : "rgba(255,255,255,0.05)",
                  color: openDays[d.key as keyof typeof openDays] ? gold : "rgba(255,255,255,0.2)",
                  border: openDays[d.key as keyof typeof openDays] ? `1px solid ${gold}` : "1px solid rgba(255,255,255,0.1)",
                }}>
                  {d.label} {openDays[d.key as keyof typeof openDays] ? "✓" : "Closed"}
                </span>
              ))}
            </div>

            {/* Countdown */}
            {!timeLeft.closed ? (
              <div style={{ marginBottom: "48px" }}>
                <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.18em", textTransform: "uppercase" as const, color: gold, marginBottom: "24px" }}>
                  Orders for {timeLeft.orderDay} close {timeLeft.cutoffDay === timeLeft.orderDay ? "the night before" : `${timeLeft.cutoffDay} night`} at 8PM
                </p>
                <div style={{ display: "flex", gap: "clamp(8px, 2vw, 20px)", justifyContent: "center", flexWrap: "wrap" as const }}>
                  {[
                    { value: timeLeft.days,    label: "Days"    },
                    { value: timeLeft.hours,   label: "Hours"   },
                    { value: timeLeft.minutes, label: "Minutes" },
                    { value: timeLeft.seconds, label: "Seconds" },
                  ].map(unit => (
                    <div key={unit.label} style={{ textAlign: "center" as const, minWidth: "80px" }}>
                      <div style={{ border: `1px solid ${border}`, borderRadius: "4px", padding: "20px 16px", marginBottom: "8px", background: "rgba(196,149,42,0.05)" }}>
                        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(28px, 5vw, 44px)", color: white, lineHeight: 1, fontWeight: "600" }}>
                          {String(unit.value).padStart(2, "0")}
                        </p>
                      </div>
                      <p style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted }}>{unit.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: "48px", padding: "24px", border: `1px solid ${border}`, borderRadius: "4px", display: "inline-block" }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>Check back soon — we open Thursday, Friday & Saturday!</p>
              </div>
            )}
            <button onClick={revealMenu} style={goldBtn} className="gold-btn">
              {timeLeft.closed ? "Browse the Menu" : `Order for ${timeLeft.orderDay}`}
            </button>
          </div>
        </section>

        {/* MENU */}
        {showMenu && (
          <section id="menu" ref={menuRef} style={{ backgroundColor: cream, padding: "100px clamp(20px, 4vw, 48px)" }}>
            <div data-animate id="menu-header" style={{ ...fadeIn("menu-header"), textAlign: "center", marginBottom: "72px" }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, marginBottom: "16px" }}>This Week</p>
              <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(36px, 6vw, 64px)", fontWeight: "600", color: black, lineHeight: 1.05 }}>The Menu</h2>
            </div>

            {/* Club Solo */}
            {activeSoloOptions.length > 0 && (
              <div data-animate id="solo-section" style={{ ...fadeIn("solo-section"), maxWidth: "1000px", margin: "0 auto 80px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "32px", borderBottom: `1px solid ${border}`, paddingBottom: "16px" }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: "600", color: black }}>Club Solo</h3>
                  <p style={{ fontSize: "12px", color: muted, letterSpacing: "0.06em" }}>Perfect for 1 · Specialty butter sauce</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                  {activeSoloOptions.map(opt => (
                    <div key={opt.id} className="menu-card" onMouseMove={e => handleTilt(e, opt.id)} onMouseLeave={() => resetTilt(opt.id)}
                      style={{ borderRadius: "4px", overflow: "hidden", backgroundColor: white, border: `1px solid ${border}`, cursor: "default", transition: "box-shadow 0.3s ease", ...tiltStyle[opt.id] }}>
                      <div style={{ position: "relative", height: "200px", overflow: "hidden" }}>
                        <img src="/solo.jpeg" alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", transition: "transform 0.5s ease" }} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", top: "12px", left: "12px", backgroundColor: gold, padding: "4px 10px", borderRadius: "1px" }}>
                          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: "800", letterSpacing: "0.12em", color: black, textTransform: "uppercase" as const }}>{opt.label}</p>
                        </div>
                        {favItems[`fav_solo_${opt.id.split("-")[1]}`] && (
                          <div style={{ position: "absolute", top: "12px", right: "12px", backgroundColor: "#FFD700", padding: "4px 10px", borderRadius: "1px" }}>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: "800", letterSpacing: "0.1em", color: black, textTransform: "uppercase" as const }}>⭐ Fan Fav</p>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "20px" }}>
                        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black, marginBottom: "4px" }}>Club Solo</p>
                        <p style={{ fontSize: "12px", color: muted, marginBottom: "16px" }}>{opt.label} · Specialty butter sauce</p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", color: gold, fontWeight: "600" }}>TT${opt.price}</p>
                          <button className="add-btn" onClick={() => ordersOpen && addToCart({ id: opt.id, name: "Club Solo", description: opt.label, price: opt.price })} style={{ ...addBtn, opacity: ordersOpen ? 1 : 0.4 }} disabled={!ordersOpen}>+ Add</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Club Duo */}
            {activeDuoOptions.length > 0 && (
              <div data-animate id="duo-section" style={{ ...fadeIn("duo-section"), maxWidth: "1000px", margin: "0 auto 80px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "32px", borderBottom: `1px solid ${border}`, paddingBottom: "16px" }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: "600", color: black }}>Club Duo</h3>
                  <p style={{ fontSize: "12px", color: muted, letterSpacing: "0.06em" }}>Ideal for 2 · Larger portions</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                  {activeDuoOptions.map(opt => (
                    <div key={opt.id} className="menu-card" onMouseMove={e => handleTilt(e, opt.id)} onMouseLeave={() => resetTilt(opt.id)}
                      style={{ borderRadius: "4px", overflow: "hidden", backgroundColor: white, border: `1px solid ${border}`, cursor: "default", transition: "box-shadow 0.3s ease", ...tiltStyle[opt.id] }}>
                      <div style={{ position: "relative", height: "200px", overflow: "hidden" }}>
                        <img src="/crab2.jpeg" alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", top: "12px", left: "12px", backgroundColor: gold, padding: "4px 10px", borderRadius: "1px" }}>
                          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: "800", letterSpacing: "0.12em", color: black, textTransform: "uppercase" as const }}>{opt.label}</p>
                        </div>
                        {favItems[`fav_duo_${opt.id.split("-")[1]}`] && (
                          <div style={{ position: "absolute", top: "12px", right: "12px", backgroundColor: "#FFD700", padding: "4px 10px", borderRadius: "1px" }}>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: "800", letterSpacing: "0.1em", color: black, textTransform: "uppercase" as const }}>⭐ Fan Fav</p>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "20px" }}>
                        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black, marginBottom: "4px" }}>Club Duo</p>
                        <p style={{ fontSize: "12px", color: muted, marginBottom: "16px" }}>{opt.label} · Specialty butter sauce</p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", color: gold, fontWeight: "600" }}>TT${opt.price}</p>
                          <button className="add-btn" onClick={() => ordersOpen && addToCart({ id: opt.id, name: "Club Duo", description: opt.label, price: opt.price })} style={{ ...addBtn, opacity: ordersOpen ? 1 : 0.4 }} disabled={!ordersOpen}>+ Add</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* More Items */}
            {activeSimpleItems.length > 0 && (
              <div data-animate id="more-section" style={{ ...fadeIn("more-section"), maxWidth: "1000px", margin: "0 auto 80px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "32px", borderBottom: `1px solid ${border}`, paddingBottom: "16px" }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: "600", color: black }}>More from the Menu</h3>
                </div>
                <div style={{ display: "grid", gap: "16px" }}>
                  {activeSimpleItems.map(item => (
                    <div key={item.id} className="menu-card" style={{ backgroundColor: white, border: `1px solid ${border}`, borderRadius: "4px", display: "flex", alignItems: "center", gap: "0", overflow: "hidden", transition: "box-shadow 0.3s ease" }}>
                      {item.image && <img src={item.image} alt={item.name} style={{ width: "120px", height: "120px", objectFit: "cover", flexShrink: 0, pointerEvents: "none" }} />}
                      <div style={{ flex: 1, padding: "20px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black }}>{item.name}</p>
                          {item.tag && <span style={{ backgroundColor: goldDim, color: gold, fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "1px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{item.tag}</span>}
                        </div>
                        <p style={{ fontSize: "12px", color: muted, marginBottom: "12px", lineHeight: 1.6 }}>{item.desc}</p>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", color: gold, fontWeight: "600" }}>TT${item.price}</p>
                          <button className="add-btn" onClick={() => ordersOpen && addToCart({ id: item.id, name: item.name, description: item.desc, price: item.price })} style={{ ...addBtn, opacity: ordersOpen ? 1 : 0.4 }} disabled={!ordersOpen}>+ Add</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build Your Own */}
            {buildEnabled && (
              <div data-animate id="build-section" style={{ ...fadeIn("build-section"), maxWidth: "1000px", margin: "0 auto 40px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "32px", borderBottom: `1px solid ${border}`, paddingBottom: "16px" }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(22px, 3vw, 32px)", fontWeight: "600", color: black }}>Build Your Own Boil</h3>
                  <p style={{ fontSize: "12px", color: muted, letterSpacing: "0.06em" }}>From TT$60</p>
                </div>
                <div style={{ backgroundColor: white, border: `1px solid ${border}`, borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ position: "relative", height: "240px", overflow: "hidden" }}>
                    <img src="/spread2.jpeg" alt="Build Your Own" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 100%)", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "40px" }}>
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.2em", color: gold, textTransform: "uppercase" as const, marginBottom: "12px" }}>Your Seafood. Your Sauce. Your Way.</p>
                        <h4 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(24px, 3vw, 36px)", color: white, marginBottom: "16px", lineHeight: 1.1 }}>Build Your Own Boil</h4>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button onClick={() => { setBuildType("solo"); setShowBuild(true); setShowDuoBuild(false); }} style={{ ...goldBtn, padding: "12px 20px", fontSize: "12px", backgroundColor: buildType === "solo" && showBuild ? "#8a6a1a" : gold }} className="gold-btn">
                            Solo Build
                          </button>
                          <button onClick={() => { setBuildType("duo"); setShowDuoBuild(true); setShowBuild(false); }} style={{ ...goldBtn, padding: "12px 20px", fontSize: "12px", backgroundColor: buildType === "duo" && showDuoBuild ? "#8a6a1a" : gold }} className="gold-btn">
                            Duo Build
                          </button>
                          {(showBuild || showDuoBuild) && (
                            <button onClick={() => { setShowBuild(false); setShowDuoBuild(false); setBuildType(""); }} style={{ padding: "12px 20px", fontSize: "12px", borderRadius: "2px", border: `1px solid ${border}`, backgroundColor: "transparent", color: muted, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {showBuild && (
                    <div style={{ padding: "32px", display: "grid", gap: "28px", borderTop: `1px solid ${border}` }}>
                      <div>
                        <p style={{ ...labelStyle, marginBottom: "12px", color: gold }}>Step 1 — Base (included)</p>
                        <div style={{ padding: "16px", border: `1px solid ${border}`, borderRadius: "2px", backgroundColor: goldDim }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "16px", color: black }}>Base Tray — TT$60</p>
                          <p style={{ fontSize: "12px", color: muted, marginTop: "4px" }}>Potatoes, corn & specialty butter sauce</p>
                        </div>
                      </div>
                      <div>
                        <p style={{ ...labelStyle, marginBottom: "12px", color: gold }}>Step 2 — Pick Seafood</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
                          {SEAFOOD.map(item => (
                            <button key={item.id} onClick={() => toggleBuildSeafood(item.id)} style={toggleBtn(buildSeafood.includes(item.id))}>
                              <span style={{ fontSize: "24px", display: "block", marginBottom: "6px" }}>{item.emoji}</span>
                              <span style={{ display: "block", fontWeight: "700", fontSize: "12px", letterSpacing: "0.04em" }}>{item.label}</span>
                              <span style={{ display: "block", color: muted, fontSize: "10px", marginTop: "2px" }}>{item.desc}</span>
                              <span style={{ display: "block", color: gold, fontWeight: "700", fontSize: "13px", marginTop: "6px" }}>TT${item.price}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ ...labelStyle, marginBottom: "12px", color: gold }}>Step 3 — Extras <span style={{ color: muted, fontWeight: "400", textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span></p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
                          {EXTRAS.map(item => (
                            <button key={item.id} onClick={() => toggleBuildExtra(item.id)} style={toggleBtn(buildExtras.includes(item.id))}>
                              <span style={{ fontSize: "24px", display: "block", marginBottom: "6px" }}>{item.emoji}</span>
                              <span style={{ display: "block", fontWeight: "700", fontSize: "12px" }}>{item.label}</span>
                              <span style={{ display: "block", color: muted, fontSize: "10px", marginTop: "2px" }}>{item.desc}</span>
                              <span style={{ display: "block", color: gold, fontWeight: "700", fontSize: "13px", marginTop: "6px" }}>TT${item.price}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ ...labelStyle, marginBottom: "12px", color: gold }}>Step 4 — Heat Level</p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {HEATS.map(h => <button key={h.id} onClick={() => setBuildHeat(h.id as Heat)} style={heatBtn(h.id)}>{h.emoji} {h.label}</button>)}
                        </div>
                      </div>
                      <div style={{ backgroundColor: black, borderRadius: "4px", padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted, marginBottom: "6px" }}>Running Total</p>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "32px", color: white }}>TT${calcBuildPrice(buildSeafood, buildExtras)}</p>
                        </div>
                        <button onClick={addBuildToCart} style={goldBtn} className="gold-btn">Add to Cart</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Duo Build configurator - now inside main Build section */}
            {buildEnabled && showDuoBuild && (
              <div style={{ maxWidth: "1000px", margin: "-20px auto 40px" }}>
                <div style={{ backgroundColor: white, border: `1px solid ${border}`, borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ padding: "20px 24px", borderBottom: `1px solid ${border}`, backgroundColor: goldDim }}>
                    <p style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", color: black }}>Build Your Own Boil — Duo Edition</p>
                    <p style={{ fontSize: "12px", color: muted, marginTop: "4px" }}>Perfect for sharing · Prices reflect double portions</p>
                  </div>
                  <div style={{ padding: "32px", display: "grid", gap: "28px" }}>
                      <div>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "12px" }}>Step 1 — Base (x2, included)</p>
                        <div style={{ padding: "16px", border: `1px solid ${border}`, borderRadius: "2px", backgroundColor: goldDim }}>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "16px", color: black }}>Duo Base Tray — TT$100</p>
                          <p style={{ fontSize: "12px", color: muted, marginTop: "4px" }}>Includes double potatoes, double corn & Specialty Butter Sauce</p>
                        </div>
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "12px" }}>Step 2 — Pick Seafood (prices doubled for duo)</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
                          {DUO_SEAFOOD.map(item => (
                            <button key={item.id} onClick={() => toggleDuoBuildSeafood(item.id)} style={toggleBtn(duoBuildSeafood.includes(item.id))}>
                              <span style={{ fontSize: "24px", display: "block", marginBottom: "6px" }}>{item.emoji}</span>
                              <span style={{ display: "block", fontWeight: "700", fontSize: "12px", letterSpacing: "0.04em" }}>{item.label}</span>
                              <span style={{ display: "block", color: muted, fontSize: "10px", marginTop: "2px" }}>{item.desc}</span>
                              <span style={{ display: "block", color: gold, fontWeight: "700", fontSize: "13px", marginTop: "6px" }}>TT${item.price}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "12px" }}>Step 3 — Extras <span style={{ color: muted, fontWeight: "400", textTransform: "none" as const, letterSpacing: 0 }}>(optional, prices doubled)</span></p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
                          {DUO_EXTRAS.map(item => (
                            <button key={item.id} onClick={() => toggleDuoBuildExtra(item.id)} style={toggleBtn(duoBuildExtras.includes(item.id))}>
                              <span style={{ fontSize: "24px", display: "block", marginBottom: "6px" }}>{item.emoji}</span>
                              <span style={{ display: "block", fontWeight: "700", fontSize: "12px" }}>{item.label}</span>
                              <span style={{ display: "block", color: muted, fontSize: "10px", marginTop: "2px" }}>{item.desc}</span>
                              <span style={{ display: "block", color: gold, fontWeight: "700", fontSize: "13px", marginTop: "6px" }}>TT${item.price}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "12px" }}>Step 4 — Heat Level</p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {HEATS.map(h => (
                            <button key={h.id} onClick={() => setDuoBuildHeat(h.id as Heat)} style={{
                              flex: 1, padding: "12px", borderRadius: "2px",
                              border: duoBuildHeat === h.id ? `1px solid ${gold}` : `1px solid ${border}`,
                              backgroundColor: duoBuildHeat === h.id ? goldDim : "transparent",
                              cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "12px",
                              fontWeight: duoBuildHeat === h.id ? "700" : "400", color: duoBuildHeat === h.id ? gold : muted,
                            }}>{h.emoji} {h.label}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ backgroundColor: black, borderRadius: "4px", padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted, marginBottom: "6px" }}>Total (Duo)</p>
                          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "32px", color: white }}>TT${calcDuoBuildPrice(duoBuildSeafood, duoBuildExtras)}</p>
                        </div>
                        <button onClick={addDuoBuildToCart} style={goldBtn} className="gold-btn">Add to Cart</button>
                      </div>
                    </div>
                  </div>
                </div>
            )}

            {/* Sticky cart bar */}
            {cartCount > 0 && (
              <div style={{ position: "sticky", bottom: "24px", backgroundColor: black, borderRadius: "4px", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 16px 48px rgba(0,0,0,0.4)`, maxWidth: "1000px", margin: "0 auto", border: `1px solid ${border}` }}>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: "4px" }}>{cartCount} item{cartCount !== 1 ? "s" : ""} in your order</p>
                  <p style={{ fontFamily: "'Cinzel', serif", fontSize: "24px", color: white }}>TT${cartTotal}</p>
                </div>
                <button onClick={() => setShowCart(true)} style={goldBtn} className="gold-btn">View Cart & Checkout</button>
              </div>
            )}
          </section>
        )}

        {/* CHECKOUT FORM */}
        {showForm && !submitted && (
          <section id="checkout" style={{ backgroundColor: white, borderTop: `1px solid ${border}`, padding: "80px clamp(20px, 4vw, 48px)" }}>
            <div style={{ maxWidth: "560px", margin: "0 auto" }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, textAlign: "center", marginBottom: "12px" }}>Almost There</p>
              <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: "600", color: black, textAlign: "center", marginBottom: "48px" }}>Your Details</h2>
              <div style={{ display: "grid", gap: "20px" }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="868-000-0000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email <span style={{ fontWeight: "400", textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Heat Level *</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {HEATS.map(h => (
                      <button key={h.id} onClick={() => setNotes(prev => { const base = prev.replace(/Heat:.*?(\n|$)/, "").trim(); return base ? `${base}\nHeat: ${h.label}` : `Heat: ${h.label}`; })}
                        style={{ flex: 1, padding: "12px", borderRadius: "2px", border: notes.includes(`Heat: ${h.label}`) ? `1px solid ${gold}` : `1px solid ${border}`, backgroundColor: notes.includes(`Heat: ${h.label}`) ? goldDim : "transparent", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "12px", transition: "all 0.2s", color: notes.includes(`Heat: ${h.label}`) ? gold : muted }}>
                        {h.emoji} {h.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Delivery or Pickup? *</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setFulfillment("pickup")}   style={fulfillBtn("pickup")}>🏠 Pickup</button>
                    <button onClick={() => setFulfillment("delivery")} style={fulfillBtn("delivery")}>🚗 Delivery (+TT$30)</button>
                  </div>
                </div>
                {fulfillment === "delivery" && (
                  <div style={{ backgroundColor: "rgba(196,149,42,0.08)", border: `1px solid ${border}`, borderRadius: "2px", padding: "14px 16px", fontSize: "13px", color: muted, lineHeight: 1.6 }}>
                    ⚠️ Delivery is available to select areas in East Trinidad for TT$30. We'll confirm availability for your address after your order is placed.
                  </div>
                )}
                {fulfillment === "delivery" && (
                  <div>
                    <label style={labelStyle}>Delivery Address *</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City, Region" style={inputStyle} />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Special Notes / Allergies</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any requests or allergies we should know about..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ backgroundColor: cream, borderRadius: "2px", border: `1px solid ${border}`, padding: "20px" }}>
                  <p style={{ ...labelStyle, marginBottom: "16px" }}>Order Summary</p>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                      <span style={{ color: charcoal }}>{item.quantity}x {item.name} — {item.description}</span>
                      <span style={{ fontWeight: "700", color: black, marginLeft: "12px", whiteSpace: "nowrap" as const }}>TT${item.price * item.quantity}</span>
                    </div>
                  ))}
                  {fulfillment && <p style={{ marginTop: "10px", fontSize: "12px", color: muted }}>{fulfillment === "delivery" ? `🚗 Delivery — +TT$${DELIVERY_FEE}` : "🏠 Pickup"}</p>}
                  <div style={{ borderTop: `1px solid ${border}`, marginTop: "12px", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontFamily: "'Cinzel', serif", fontSize: "20px", color: black }}>Total</p>
                    <p style={{ fontFamily: "'Cinzel', serif", fontSize: "24px", color: gold }}>TT${totalPrice}</p>
                  </div>
                </div>
                {/* Order Day */}
                <div>
                  <label style={labelStyle}>Which Day Are You Ordering For? *</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    {[
                      { id: "thursday", label: "Thursday" },
                      { id: "friday",   label: "Friday"   },
                      { id: "saturday", label: "Saturday" },
                    ].map(day => {
                      const isOpen = openDays[day.id as keyof typeof openDays];
                      return (
                        <button
                          key={day.id}
                          onClick={() => isOpen && setOrderDay(day.id as any)}
                          disabled={!isOpen}
                          style={{
                            padding: "14px 8px", borderRadius: "2px", cursor: isOpen ? "pointer" : "not-allowed",
                            border: orderDay === day.id ? `1px solid ${gold}` : `1px solid ${border}`,
                            backgroundColor: !isOpen ? "rgba(0,0,0,0.04)" : orderDay === day.id ? goldDim : "transparent",
                            fontFamily: "'Inter', sans-serif", fontSize: "13px",
                            fontWeight: orderDay === day.id ? "700" : "400",
                            color: !isOpen ? muted : orderDay === day.id ? gold : muted,
                            opacity: isOpen ? 1 : 0.5, transition: "all 0.2s",
                          }}
                        >
                          {day.label}
                          {!isOpen && <span style={{ display: "block", fontSize: "10px", marginTop: "2px" }}>Closed</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

              {/* Payment Method */}
                <div>
                  <label style={labelStyle}>Payment Method *</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setPaymentMethod("cash")} style={{ flex: 1, padding: "14px", borderRadius: "2px", border: paymentMethod === "cash" ? `1px solid ${gold}` : `1px solid ${border}`, backgroundColor: paymentMethod === "cash" ? goldDim : "transparent", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: paymentMethod === "cash" ? "700" : "400", color: paymentMethod === "cash" ? gold : muted, transition: "all 0.2s" }}>
                      💵 Cash on Delivery
                    </button>
                    <button onClick={() => setPaymentMethod("bank")} style={{ flex: 1, padding: "14px", borderRadius: "2px", border: paymentMethod === "bank" ? `1px solid ${gold}` : `1px solid ${border}`, backgroundColor: paymentMethod === "bank" ? goldDim : "transparent", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: paymentMethod === "bank" ? "700" : "400", color: paymentMethod === "bank" ? gold : muted, transition: "all 0.2s" }}>
                      🏦 Bank Transfer
                    </button>
                  </div>
                </div>

                {paymentMethod === "bank" && (
                  <div style={{ backgroundColor: "#FFFBE6", border: "1px solid #FFD700", borderRadius: "4px", padding: "20px 24px" }}>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "14px" }}>Bank Transfer Details</p>
                    <div style={{ display: "grid", gap: "0" }}>
                      {[
                        { label: "Bank",           value: "First Citizens Bank"    },
                        { label: "Account Name",   value: "Aden Anderson Flanders" },
                        { label: "Account Number", value: "3058440"                },
                        { label: "Account Type",   value: "Savings"                },
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: "13px" }}>
                          <span style={{ color: muted }}>{row.label}</span>
                          <span style={{ fontWeight: "700", color: charcoal }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: "11px", color: "#7a5c00", lineHeight: 1.8, marginTop: "14px", fontStyle: "italic" }}>
                      Use your full name as the payment reference. Send proof of payment to @theclub.boils on Instagram or WhatsApp 868-293-0570.
                    </p>
                  </div>
                )}

                {paymentMethod === "cash" && (
                  <div style={{ backgroundColor: "rgba(196,149,42,0.08)", border: `1px solid ${border}`, borderRadius: "4px", padding: "14px 16px", fontSize: "12px", color: muted, lineHeight: 1.7 }}>
                    Payment will be collected upon delivery or pickup. Please have the exact amount ready. A TT$30 delivery fee applies to all deliveries.
                  </div>
                )}

                {submitError && <div style={{ backgroundColor: "#FFECEC", border: "1px solid #F5C6C6", borderRadius: "2px", padding: "14px", fontSize: "12px", color: "#A03030" }}>⚠️ {submitError}</div>}
                <button onClick={handleSubmit} disabled={submitting} style={{ ...goldBtn, width: "100%", padding: "18px", fontSize: "13px", opacity: submitting ? 0.7 : 1 }} className="gold-btn">
                  {submitting ? "Placing Order..." : `Confirm Order — TT$${totalPrice}`}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SUCCESS */}
        {submitted && (
          <section style={{ backgroundColor: cream, borderTop: `1px solid ${border}`, padding: "80px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</p>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "32px", fontWeight: "600", color: black, marginBottom: "16px" }}>Order Received</h2>
            <p style={{ color: muted, fontSize: "14px", marginBottom: "8px" }}>Thank you, <strong style={{ color: black }}>{name}</strong>. Your order has been placed successfully.</p>
            {paymentMethod === "bank" && (
              <div style={{ backgroundColor: "#FFFBE6", border: "1px solid #FFD700", borderRadius: "4px", padding: "16px 20px", margin: "16px auto", maxWidth: "440px", fontSize: "13px", color: "#7a5c00", lineHeight: 1.8 }}>
                <strong>Proof of payment will be requested upon order confirmation.</strong> Please send your bank transfer receipt to @theclub.boils on Instagram or WhatsApp 868-293-0570 to confirm your order.
              </div>
            )}
            <div style={{ margin: "20px auto", maxWidth: "440px", textAlign: "left" as const }}>
              {cart.map((item, idx) => <p key={idx} style={{ fontSize: "13px", color: muted, marginBottom: "6px", padding: "8px 0", borderBottom: `1px solid ${border}` }}>· {item.quantity}x {item.name} — {item.description}</p>)}
            </div>
            <p style={{ color: muted, fontSize: "13px", marginTop: "16px" }}>{fulfillment === "delivery" ? `🚗 Delivering to: ${address}` : "🏠 Pickup — Arima (Thu, Fri & Sat)"}</p>
            {orderDay && <p style={{ color: gold, fontSize: "15px", fontWeight: "700", marginTop: "8px" }}>📅 Your order is for {orderDay.charAt(0).toUpperCase() + orderDay.slice(1)}</p>}
            <p style={{ fontFamily: "'Cinzel', serif", fontSize: "28px", color: gold, margin: "20px 0 8px" }}>TT${totalPrice}</p>
            <p style={{ color: muted, fontSize: "12px", letterSpacing: "0.04em" }}>We will confirm via text to <strong>{phone}</strong> before Friday 8PM.</p>
          </section>
        )}

        {/* REVIEWS SECTION */}
        <section style={{ backgroundColor: cream, padding: "100px clamp(20px, 4vw, 48px)", borderTop: "1px solid rgba(196,149,42,0.2)" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, marginBottom: "16px", textAlign: "center" as const }}>What People Say</p>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: "600", color: black, textAlign: "center", marginBottom: "64px", lineHeight: 1.1 }}>Reviews</h2>

            {/* Existing reviews */}
            {reviews.length > 0 && (
              <div style={{ display: "grid", gap: "16px", marginBottom: "64px" }}>
                {reviews.map(review => (
                  <div key={review.id} style={{ backgroundColor: white, border: "1px solid rgba(196,149,42,0.2)", borderRadius: "4px", padding: "24px 28px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div>
                        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "16px", color: black, marginBottom: "4px" }}>{review.name}</p>
                        <div style={{ display: "flex", gap: "3px" }}>
                          {[1,2,3,4,5].map(star => (
                            <span key={star} style={{ color: star <= review.rating ? gold : "#E0D9CC", fontSize: "16px" }}>★</span>
                          ))}
                        </div>
                      </div>
                      <p style={{ fontSize: "11px", color: muted, letterSpacing: "0.04em" }}>
                        {new Date(review.created_at).toLocaleDateString("en-TT", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <p style={{ fontSize: "14px", color: charcoal, lineHeight: 1.8, fontStyle: "italic" }}>&ldquo;{review.comment}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}

            {reviews.length === 0 && (
              <div style={{ textAlign: "center" as const, marginBottom: "64px", padding: "40px", border: "1px solid rgba(196,149,42,0.2)", borderRadius: "4px" }}>
                <p style={{ fontSize: "32px", marginBottom: "12px" }}>⭐</p>
                <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black, marginBottom: "8px" }}>No reviews yet</p>
                <p style={{ fontSize: "13px", color: muted }}>Be the first to leave a review!</p>
              </div>
            )}

            {/* Review form */}
            <div style={{ backgroundColor: white, border: "1px solid rgba(196,149,42,0.2)", borderRadius: "4px", padding: "32px" }}>
              <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "22px", color: black, marginBottom: "24px" }}>Leave a Review</h3>
              {reviewSubmitted ? (
                <div style={{ textAlign: "center" as const, padding: "32px" }}>
                  <p style={{ fontSize: "32px", marginBottom: "12px" }}>🙏</p>
                  <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: black, marginBottom: "8px" }}>Thank you!</p>
                  <p style={{ fontSize: "13px", color: muted }}>Your review has been submitted and is awaiting approval.</p>
                  <button onClick={() => setReviewSubmitted(false)} style={{ ...goldBtn, marginTop: "20px", padding: "12px 24px", fontSize: "12px" }}>Write Another</button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div>
                    <label style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted, display: "block", marginBottom: "8px" }}>Your Name *</label>
                    <input type="text" value={reviewName} onChange={e => setReviewName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted, display: "block", marginBottom: "8px" }}>Rating *</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {[1,2,3,4,5].map(star => (
                        <button key={star} onClick={() => setReviewRating(star)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "32px", color: star <= reviewRating ? gold : "#E0D9CC", transition: "color 0.2s" }}>★</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: muted, display: "block", marginBottom: "8px" }}>Your Review *</label>
                    <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Tell us about your experience..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <button onClick={submitReview} disabled={reviewSubmitting} style={{ ...goldBtn, padding: "14px", fontSize: "12px", opacity: reviewSubmitting ? 0.7 : 1 }}>
                    {reviewSubmitting ? "Submitting..." : "Submit Review"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FIND US */}
        <section id="find-us" style={{ backgroundColor: black, padding: "100px clamp(20px, 4vw, 48px)" }}>
          <div data-animate id="find-us-content" style={{ ...fadeIn("find-us-content"), maxWidth: "800px", margin: "0 auto" }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: "700", letterSpacing: "0.22em", textTransform: "uppercase" as const, color: gold, marginBottom: "16px", textAlign: "center" as const }}>Visit Us</p>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: "600", color: white, textAlign: "center", marginBottom: "64px", lineHeight: 1.1 }}>Find Us</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1px", backgroundColor: border }}>
              {[
                { icon: "📍", label: "Location", value: "Arima, Trinidad", sub: "Exact address shared upon confirmation" },
                { icon: "🕛", label: "Hours",    value: "Thu, Fri &amp; Sat", sub: "12:00 PM – 6:00 PM" },
                { icon: "📞", label: "Phone",    value: "868-293-0570", sub: "Call or WhatsApp", href: "tel:8682930570" },
                { icon: "📸", label: "Instagram", value: "@theclub.boils", sub: "Follow for updates", href: "https://instagram.com/theclub.boils" },
              ].map(item => (
                <div key={item.label} style={{ backgroundColor: black, padding: "32px", transition: "background 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = charcoal)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = black)}
                >
                  <p style={{ fontSize: "24px", marginBottom: "12px" }}>{item.icon}</p>
                  <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: "8px" }}>{item.label}</p>
                  {item.href ? (
                    <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: white, textDecoration: "none", display: "block", marginBottom: "4px" }}>{item.value}</a>
                  ) : (
                    <p style={{ fontFamily: "'Cinzel', serif", fontSize: "18px", color: white, marginBottom: "4px" }}>{item.value}</p>
                  )}
                  <p style={{ fontSize: "12px", color: muted }}>{item.sub}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1px", backgroundColor: charcoal, padding: "24px 32px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>🚗</span>
              <p style={{ fontSize: "13px", color: muted, lineHeight: 1.7 }}>
                <strong style={{ color: gold }}>Delivery available</strong> to select areas in the East. A TT$30 fee applies. Contact us to confirm your area before placing your order.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ backgroundColor: black, borderTop: `1px solid ${border}`, padding: "40px clamp(20px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: gold, fontSize: "18px" }}>♣</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "14px", color: white, letterSpacing: "0.08em" }}>THE CLUB BOILS</span>
          </div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" as const }}>
            <a href="https://instagram.com/theclub.boils" target="_blank" rel="noopener noreferrer" style={{ color: muted, textDecoration: "none", fontSize: "11px", letterSpacing: "0.08em", transition: "color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.color = gold)} onMouseLeave={e => (e.currentTarget.style.color = muted)}>@theclub.boils</a>
              <a href="tel:8682930570" style={{ color: muted, textDecoration: "none", fontSize: "11px", letterSpacing: "0.08em", transition: "color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.color = gold)} onMouseLeave={e => (e.currentTarget.style.color = muted)}>868-293-0570</a>
            <span style={{ color: muted, fontSize: "11px", letterSpacing: "0.08em" }}>Arima, Trinidad</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.15)", fontSize: "10px", letterSpacing: "0.06em" }}>© {new Date().getFullYear()} The Club Boils</p>

        </footer>

      </main>
    </>
  );
}
