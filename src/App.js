import React, { useMemo, useReducer, useEffect, useRef, useState } from "react";
import {
  db,
  ensureAnonAuth,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "./firebase";

/* =============================
   NailVault — Single-file React app
   Mobile-first, colorful, localStorage + optional Firebase sync
   ============================= */

/* ---------- Helpers ---------- */
const labelForIndex = (i) => (i < 26 ? String.fromCharCode(65 + i) : `W${i + 1}`);
const defaultWallNames = (count) => Array.from({ length: count }, (_, i) => labelForIndex(i));

function normalizeSettings(s) {
  const wallCount = Math.max(1, Number(s?.wallCount ?? 2));
  const shelvesPerWall = Math.max(1, Number(s?.shelvesPerWall ?? 8));
  const slotsPerShelf = Math.max(1, Number(s?.slotsPerShelf ?? 21));
  const existing = Array.isArray(s?.wallNames) ? s.wallNames : defaultWallNames(wallCount);
  const wallNames = Array.from({ length: wallCount }, (_, i) => (existing[i] && String(existing[i]).trim()) || labelForIndex(i));
  return {
    colorTheme: s?.colorTheme ?? "vivid",
    wallCount,
    shelvesPerWall,
    slotsPerShelf,
    wallNames,
    syncKey: typeof s?.syncKey === "string" ? s.syncKey : "", // Household key for sync
  };
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const FINISHES = [
  "cream","jelly","holographic","glitter","metallic","neon","thermal","magnetic","matte","shimmer","flake","other",
];

const TOOL_TYPES = [
  "brush","stamper","scraper","dotting tool","cleanup brush","nail file","buffer","clipper","cuticle pusher","tape/guides","gel lamp","acrylic tools","other",
];

const BRAND_SUGGESTIONS = [
  "OPI","Essie","Holo Taco","ILNP","China Glaze","Sally Hansen","Zoya","KBShimmer","Cirque Colors","Orly","Deborah Lippmann","Olive & June",
];

const defaultSettings = {
  wallCount: 2,
  shelvesPerWall: 8,
  slotsPerShelf: 21,
  wallNames: ["A", "B"],
  colorTheme: "vivid",
  syncKey: "",
};

const initialState = {
  polishes: [],
  tools: [],
  manis: [],
  settings: defaultSettings,
  createdAt: Date.now(),
};

function reducer(state, action) {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "hydrate/partial":
      return { ...state, ...action.payload };
    case "settings/update":
      return { ...state, settings: normalizeSettings({ ...state.settings, ...action.payload }) };
    case "polish/add":
      return { ...state, polishes: [action.payload, ...state.polishes] };
    case "polish/update":
      return { ...state, polishes: state.polishes.map((p) => (p.id === action.payload.id ? { ...p, ...action.payload } : p)) };
    case "polish/delete":
      return { ...state, polishes: state.polishes.filter((p) => p.id !== action.id) };
    case "tool/add":
      return { ...state, tools: [action.payload, ...state.tools] };
    case "tool/update":
      return { ...state, tools: state.tools.map((t) => (t.id === action.payload.id ? { ...t, ...action.payload } : t)) };
    case "tool/delete":
      return { ...state, tools: state.tools.filter((t) => t.id !== action.id) };
    case "mani/add":
      return { ...state, manis: [action.payload, ...state.manis] };
    case "mani/update":
      return { ...state, manis: state.manis.map((m) => (m.id === action.payload.id ? { ...m, ...action.payload } : m)) };
    case "mani/delete":
      return { ...state, manis: state.manis.filter((m) => m.id !== action.id) };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

/* ---------- Finish Visual Helpers ---------- */
function hexToRgb(hex) {
  if (!hex) return [229, 231, 235];
  const h = String(hex).replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v || "e5e7eb", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function lighten(hex, amt = 0.2) {
  const [r, g, b] = hexToRgb(hex);
  const f = (x) => Math.max(0, Math.min(255, Math.round(x + (255 - x) * amt)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
function darken(hex, amt = 0.2) {
  const [r, g, b] = hexToRgb(hex);
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * (1 - amt)))) ;
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
function finishStyle(baseHex = "#ddd", finish = "cream") {
  const base = baseHex;
  const light = lighten(base, 0.35);
  const dark = darken(base, 0.35);
  switch (String(finish || "").toLowerCase()) {
    case "metallic":
      return { background: base, backgroundImage:
        `linear-gradient(115deg, ${rgba("#ffffff", .5)}, transparent 30%),
         linear-gradient(295deg, ${rgba("#000000", .18)}, transparent 40%),
         linear-gradient(45deg, ${rgba("#ffffff", .25)}, transparent 60%)`,
        backgroundBlendMode: "screen, multiply, screen" };
    case "shimmer":
      return { background: base, backgroundImage:
        `radial-gradient(circle at 20% 30%, ${rgba("#ffffff", .25)} 0 25%, transparent 26%),
         radial-gradient(circle at 70% 60%, ${rgba("#ffffff", .18)} 0 18%, transparent 19%)`,
        backgroundSize: "24px 24px, 28px 28px", backgroundRepeat: "repeat" };
    case "glitter":
      return { background: base, backgroundImage:
        `radial-gradient(${rgba("#ffffff", .85)} 1px, transparent 1.5px),
         radial-gradient(${rgba("#ffffff", .5)} 1px, transparent 1.5px),
         radial-gradient(${rgba("#ffd700", .45)} 1.2px, transparent 1.5px)`,
        backgroundSize: "10px 10px, 14px 14px, 18px 18px",
        backgroundPosition: "0 0, 3px 5px, 6px 8px", backgroundBlendMode: "screen" };
    case "holographic":
      return { background: base, backgroundImage:
        `conic-gradient(from 0deg, #ff0080, #ffbf00, #00ff6a, #00c8ff, #8a2be2, #ff0080),
         linear-gradient(${rgba("#ffffff", .12)}, ${rgba("#ffffff", .12)})`,
        backgroundBlendMode: "screen, normal" };
    case "matte":
      return { background: base, filter: "saturate(0.85) brightness(0.95) contrast(0.95)" };
    case "jelly":
      return { background: base, backgroundImage:
        `linear-gradient(${rgba("#ffffff", .12)}, ${rgba("#ffffff", .12)})`,
        backgroundBlendMode: "overlay" };
    case "neon":
      return { background: base, boxShadow: `0 0 8px ${light}, 0 0 16px ${light}` };
    case "thermal":
      return { backgroundImage: `linear-gradient(90deg, ${light} 0 50%, ${dark} 50% 100%)` };
    case "magnetic":
      return { background: base, backgroundImage:
        `repeating-linear-gradient(60deg, ${rgba("#000000", .25)} 0 6px, transparent 6px 18px)`,
        backgroundBlendMode: "multiply" };
    case "flake":
      return { background: base, backgroundImage:
        `radial-gradient(${rgba("#ffffff", .6)} 1px, transparent 1.5px),
         radial-gradient(${rgba("#ffd7a6", .5)} 1.2px, transparent 1.6px)`,
        backgroundSize: "16px 12px, 22px 16px", backgroundBlendMode: "screen" };
    default:
      return { background: base };
  }
}

/* ---------- Responsive Grid Columns Helper ---------- */
// Max grid columns by viewport; cap at 12 and at slotsPerShelf
function useResponsiveCols(slotsPerShelf) {
  const getCols = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1024;
    const base =
      w < 480  ? 4  :
      w < 640  ? 6  :
      w < 768  ? 8  :
      w < 1024 ? 10 :
                 12; // desktop max 12
    return Math.min(slotsPerShelf, base);
  };
  const [cols, setCols] = React.useState(getCols());
  React.useEffect(() => {
    const onR = () => setCols(getCols());
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [slotsPerShelf]);
  return cols;
}

/* ---------- Persist (localStorage) ---------- */
const STORAGE_KEY = "nailvault_state_v1";

function usePersistentState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = { ...initialState, ...parsed };
        merged.settings = normalizeSettings(merged.settings || {});
        dispatch({ type: "hydrate", payload: merged });
      }
    } catch (e) {
      console.warn("Failed to load saved state", e);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save state", e);
    }
  }, [state]);
  return [state, dispatch];
}

/* ---------- Cloud Sync (Firebase) ---------- */
function useCloudSync(state, dispatch) {
  const unsubRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // subscribe when syncKey present
  useEffect(() => {
    const syncKey = state.settings?.syncKey?.trim();
    if (!syncKey) {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
      return;
    }
    let unsubs = [];
    (async () => {
      await ensureAnonAuth();
      const makeListener = (name) => {
        const c = collection(db, "rooms", syncKey, name);
        return onSnapshot(c, (snap) => {
          const items = snap.docs.map((d) => d.data());
          if (mountedRef.current) {
            dispatch({ type: "hydrate/partial", payload: { [name]: items } });
          }
        });
      };
      unsubs = [
        makeListener("polishes"),
        makeListener("tools"),
        makeListener("manis"),
        makeListener("meta"),
      ];
      unsubRef.current = () => unsubs.forEach((u) => u && u());

      const metaDoc = doc(db, "rooms", syncKey, "meta", "settings");
      await setDoc(
        metaDoc,
        { settings: { ...state.settings, syncKey: undefined }, updatedAt: serverTimestamp() },
        { merge: true }
      );
    })();
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [state.settings?.syncKey, state.settings]);

  // mirror local changes up
  useEffect(() => {
    const syncKey = state.settings?.syncKey?.trim();
    if (!syncKey) return;
    (async () => {
      await ensureAnonAuth();
      const upsertAll = async (name, arr) => {
        for (const item of arr) {
          if (!item.id) continue;
          const ref = doc(db, "rooms", syncKey, name, item.id);
          await setDoc(ref, { ...item, updatedAt: serverTimestamp() }, { merge: true });
        }
      };
      await upsertAll("polishes", state.polishes);
      await upsertAll("tools", state.tools);
      await upsertAll("manis", state.manis);

      const metaDoc = doc(db, "rooms", syncKey, "meta", "settings");
      await setDoc(
        metaDoc,
        { settings: { ...state.settings, syncKey: undefined }, updatedAt: serverTimestamp() },
        { merge: true }
      );
    })();
  }, [state.polishes, state.tools, state.manis, state.settings, state.settings?.syncKey]);
}

/* ---------- UI Bits ---------- */
function ToolbarButton({ icon, label, onClick, className = "", type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold shadow-sm active:scale-[.98] ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Chip({ children, onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium shadow-sm ${className}`}>
      {children}
    </button>
  );
}

function Section({ title, subtitle, children, right }) {
  return (
    <section className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-md ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg sm:text-xl font-bold tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm opacity-70 -mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const Input = React.forwardRef(function Input({ label, ...props }, ref) {
  return (
    <label className="grid text-sm gap-1">
      <span className="opacity-80">{label}</span>
      <input
        ref={ref}
        {...props}
        className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
      />
    </label>
  );
});

function Textarea({ label, ...props }) {
  return (
    <label className="grid text-sm gap-1">
      <span className="opacity-80">{label}</span>
      <textarea {...props} className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70" />
    </label>
  );
}

function Select({ label, options, value, onChange, allowEmpty = true }) {
  return (
    <label className="grid text-sm gap-1">
      <span className="opacity-80">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70">
        {allowEmpty && <option value="">—</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function ColorSwatch({ hex, finish }) {
  return (
    <span
      title={`${hex || ""} ${finish || ""}`}
      className="inline-block w-5 h-5 rounded-md border border-black/10 align-middle"
      style={finishStyle(hex, finish)}
    />
  );
}

function Pill({ children }) {
  return <span className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-xs">{children}</span>;
}

function ImageInput({ label, value, onChange }) {
  const fileRef = useRef();
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <div className="grid gap-2 text-sm">
      <span className="opacity-80">{label}</span>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="preview" className="w-16 h-16 object-cover rounded-xl border border-black/10" />
          <div className="flex gap-2">
            <ToolbarButton label="Replace" onClick={() => fileRef.current?.click()} className="bg-indigo-100 text-indigo-900" />
            <ToolbarButton label="Remove" onClick={() => onChange(null)} className="bg-rose-100 text-rose-900" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl border border-dashed border-black/20" />
          <ToolbarButton label="Upload" onClick={() => fileRef.current?.click()} className="bg-fuchsia-100 text-fuchsia-900" />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
    </div>
  );
}

function AutoCompleteInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  onSelected,
}) {
  const filtered = useMemo(() => {
    const v = (value || "").toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(v)).slice(0, 6);
  }, [value, suggestions]);

  return (
    <div className="relative">
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {filtered.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 z-20 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl overflow-hidden shadow">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                onSelected?.(s);
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Forms ---------- */
function PolishForm({ onSubmit, initial, settings }) {
  const [form, setForm] = useState(
    initial || {
      id: uid(),
      brand: "",
      name: "",
      shadeCode: "",
      barcode: "",
      colorHex: "#f472b6",
      finish: "cream",
      collection: "",
      tags: [],
      notes: "",
      imageDataUrl: null,
      wall: null,
      shelf: null,
      position: null,
      addedAt: Date.now(),
    }
  );
  const [tagInput, setTagInput] = useState("");
  const nameInputRef = useRef(null);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  };
  const removeTag = (t) => setForm({ ...form, tags: form.tags.filter((x) => x !== t) });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const obj = { ...form, brand: form.brand.trim(), name: form.name.trim() };
        onSubmit(obj);
      }}
      className="grid gap-4"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-3">
          <AutoCompleteInput
            label="Brand"
            value={form.brand}
            onChange={(v) => setForm({ ...form, brand: v })}
            suggestions={BRAND_SUGGESTIONS}
            placeholder="e.g., OPI"
            onSelected={() => nameInputRef.current?.focus()}
          />
          <Input
            label="Name"
            placeholder="e.g., One Coat Black"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoComplete="off"
            ref={nameInputRef}
          />
          <Input label="Shade Code (optional)" placeholder="e.g., NL H47" value={form.shadeCode} onChange={(e) => setForm({ ...form, shadeCode: e.target.value })} />
          <Input label="Barcode (optional)" placeholder="UPC/EAN digits" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          <label className="grid text-sm gap-1">
            <span className="opacity-80">Color</span>
            <div className="flex gap-3 items-center">
              <input type="color" value={form.colorHex || "#cccccc"} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} className="w-12 h-10 p-0 rounded-lg border border-black/10" title="Pick color" />
              <input type="text" value={form.colorHex || ""} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900" placeholder="#RRGGBB" />
              <ColorSwatch hex={form.colorHex} finish={form.finish} />
            </div>
          </label>
          <Select label="Finish" options={FINISHES} value={form.finish} onChange={(v) => setForm({ ...form, finish: v })} />
          <Input label="Collection (optional)" placeholder="e.g., Unicorn Skin" value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })} />
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2 text-sm">
            <span className="opacity-80">Tags</span>
            <div className="flex gap-2">
              <input placeholder="e.g., favorite, spring" value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900" />
              <ToolbarButton label="Add" onClick={addTag} className="bg-emerald-100 text-emerald-800" />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.tags.map((t) => (
                <Chip key={t} className="bg-emerald-50 text-emerald-800" onClick={() => removeTag(t)}>{t} ×</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Wall" options={settings.wallNames || defaultWallNames(settings.wallCount)} value={form.wall} onChange={(v) => setForm({ ...form, wall: v })} />
            <Input label={`Shelf (1–${settings.shelvesPerWall})`} type="number" min={1} max={settings.shelvesPerWall} value={form.shelf ?? ""} onChange={(e) => setForm({ ...form, shelf: e.target.value ? Number(e.target.value) : null })} />
            <Input label={`Position (1–${settings.slotsPerShelf})`} type="number" min={1} max={settings.slotsPerShelf} value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <Textarea label="Notes" placeholder="Opacity, coats, staining, comparisons, etc." rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <ImageInput label="Bottle photo" value={form.imageDataUrl} onChange={(v) => setForm({ ...form, imageDataUrl: v })} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <ToolbarButton type="submit" label={initial ? "Save changes" : "Add polish"} className="bg-gradient-to-r from-fuchsia-200 via-pink-200 to-rose-200 text-fuchsia-900" />
      </div>
    </form>
  );
}

/* ---------- Inventory List ---------- */
function Inventory({ state, dispatch }) {
  const [query, setQuery] = useState("");
  const [finish, setFinish] = useState("");
  const [wall, setWall] = useState("");
  const [shelf, setShelf] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.polishes.filter((p) => {
      if (finish && p.finish !== finish) return false;
      if (wall && p.wall !== wall) return false;
      if (shelf && String(p.shelf || "") !== shelf) return false;
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (!q) return true;
      const pack = [p.brand, p.name, p.collection, p.shadeCode, p.barcode, (p.tags || []).join(" ")].join(" ").toLowerCase();
      return pack.includes(q);
    });
  }, [state.polishes, query, finish, wall, shelf, tag]);

  return (
    <div className="grid gap-4">
      <Section
        title="Add a polish"
        subtitle="Log attributes, photo, and shelf location"
        right={<ToolbarButton label={showForm ? "Hide" : "New"} onClick={() => setShowForm((v) => !v)} className="bg-fuchsia-100 text-fuchsia-800" />}
      >
        {showForm && (
          <PolishForm
            settings={state.settings}
            onSubmit={(obj) => {
              dispatch({ type: "polish/add", payload: obj });
              setShowForm(false);
            }}
          />
        )}
      </Section>

      <Section title="Search & filter">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input label="Search" placeholder="brand, name, tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select label="Finish" value={finish} onChange={setFinish} options={FINISHES} />
          <Select label="Wall" value={wall} onChange={setWall} options={state.settings.wallNames || defaultWallNames(state.settings.wallCount)} />
          <Input label="Shelf" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder={`1–${state.settings.shelvesPerWall}`} />
          <Input label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g., favorite" />
        </div>
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <div key={p.id} className="rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <img
                src={p.imageDataUrl || placeholderFromHex(p.colorHex)}
                alt={`${p.brand} ${p.name}`}
                className="w-20 h-20 object-cover rounded-xl border border-black/10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ColorSwatch hex={p.colorHex} finish={p.finish} />
                  <h4 className="font-semibold truncate">{p.brand || "—"} · {p.name}</h4>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {p.finish && <Pill>{p.finish}</Pill>}
                  {p.collection && <Pill>{p.collection}</Pill>}
                  {p.shadeCode && <Pill>#{p.shadeCode}</Pill>}
                  {p.barcode && <Pill>🔢 {p.barcode}</Pill>}
                  {p.tags?.slice(0, 4).map((t) => (<Pill key={t}>{t}</Pill>))}
                </div>
                <div className="mt-2 text-xs opacity-70">
                  Location: {p.wall ? `Wall ${p.wall}` : "—"} {p.shelf ? `· Shelf ${p.shelf}` : ""} {p.position ? `· Pos ${p.position}` : ""}
                </div>
              </div>
            </div>
            {p.notes && <p className="mt-3 text-sm opacity-80 line-clamp-3">{p.notes}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolbarButton label="Edit" onClick={() => setEditing(p)} className="bg-indigo-100 text-indigo-800" />
              <ToolbarButton label="Delete" onClick={() => dispatch({ type: "polish/delete", id: p.id })} className="bg-rose-100 text-rose-800" />
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Section title={`Edit: ${editing.brand || ""} ${editing.name}`} right={<Chip onClick={() => setEditing(null)} className="bg-black/10">Close</Chip>}>
          <PolishForm
            initial={editing}
            settings={state.settings}
            onSubmit={(obj) => {
              dispatch({ type: "polish/update", payload: obj });
              setEditing(null);
            }}
          />
        </Section>
      )}
    </div>
  );
}

/* ---------- Wall Planner ---------- */
function WallPlanner({ state, dispatch }) {
  const { slotsPerShelf, shelvesPerWall, wallCount, wallNames = defaultWallNames(state.settings.wallCount) } = state.settings;

  // responsive max columns (4/6/8/10/12 capped by slotsPerShelf)
  const cols = useResponsiveCols(slotsPerShelf);

  const occupancy = useMemo(() => {
    const map = new Map();
    for (const p of state.polishes) {
      if (p.wall && p.shelf && p.position) map.set(`${p.wall}-${p.shelf}-${p.position}`, p);
    }
    return map;
  }, [state.polishes]);

  const handleDrop = (e, wall, shelf, position) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/polish_id");
    if (!id) return;
    const moving = state.polishes.find((p) => p.id === id);
    if (!moving) return;
    dispatch({ type: "polish/update", payload: { ...moving, wall, shelf, position } });
  };

  return (
    <div className="grid gap-4">
      <Section title="Layout settings" subtitle="Customize walls, shelves, slot capacity, and names">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <Input
            label="Number of walls"
            type="number"
            min={1}
            max={50}
            value={wallCount}
            onChange={(e) => {
              const n = Math.max(1, Math.min(50, Number(e.target.value || 0)));
              const names = Array.from({ length: n }, (_, i) => state.settings.wallNames?.[i] || labelForIndex(i));
              dispatch({ type: "settings/update", payload: { wallCount: n, wallNames: names } });
            }}
          />
          <Input
            label="Shelves per wall"
            type="number"
            min={1}
            max={100}
            value={shelvesPerWall}
            onChange={(e) => dispatch({ type: "settings/update", payload: { shelvesPerWall: Math.max(1, Number(e.target.value || 0)) } })}
          />
          <Input
            label="Slots per shelf"
            type="number"
            min={1}
            max={200}
            value={slotsPerShelf}
            onChange={(e) => dispatch({ type: "settings/update", payload: { slotsPerShelf: Math.max(1, Number(e.target.value || 0)) } })}
          />
        </div>

        <div className="mt-3 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
          {(wallNames || []).map((name, idx) => (
            <Input
              key={idx}
              label={`Wall ${idx + 1} name`}
              value={name}
              onChange={(e) => {
                const names = [...(state.settings.wallNames || [])];
                names[idx] = e.target.value;
                dispatch({ type: "settings/update", payload: { wallNames: names } });
              }}
            />
          ))}
        </div>

        <div className="text-sm opacity-70 mt-2">
          Current layout: {wallCount} wall(s) × {shelvesPerWall} shelf(es)/wall × {slotsPerShelf} slots/shelf
        </div>
      </Section>

      {(wallNames || defaultWallNames(wallCount)).map((wall) => (
        <Section key={wall} title={`Wall ${wall}`} subtitle="Drag polishes into slots">
          <div className="grid gap-4">
            {Array.from({ length: shelvesPerWall }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10 p-2 sm:p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Shelf {i + 1}</div>
                  <div className="text-xs opacity-70">
                    {Array.from({ length: slotsPerShelf }).filter((__, idx) => occupancy.has(`${wall}-${i + 1}-${idx + 1}`)).length}/{slotsPerShelf} filled
                  </div>
                </div>

                {/* Responsive grid: up to 12 columns on desktop (capped), with readable min cell size */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))` }}
                >
                  {Array.from({ length: slotsPerShelf }).map((_, j) => {
                    const pos = j + 1;
                    const key = `${wall}-${i + 1}-${pos}`;
                    const pol = occupancy.get(key);
                    return (
                      <div
                        key={j}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, wall, i + 1, pos)}
                        className={`relative overflow-hidden rounded-xl border border-dashed ${
                          pol ? "border-transparent" : "border-black/20 dark:border-white/20"
                        } bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 aspect-square`}
                        title={pol ? `${pol.brand || ""} ${pol.name}` : `Position ${pos}`}
                      >
                        {pol ? (
                          <div className="absolute inset-0 p-2 h-full grid grid-rows-[1fr_2fr] gap-1">
                            {/* 1/3 tile height swatch */}
                            <div
                              className="w-full rounded-md"
                              style={finishStyle(pol.colorHex || "#ddd", pol.finish)}
                            />
                            {/* 2/3 text area */}
                            <div className="min-h-0 text-[12px] sm:text-[11px] leading-tight line-clamp-2">
                              {(pol.brand || "").slice(0, 14)}{pol.brand ? " · " : ""}{pol.name}
                            </div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-sm sm:text-xs opacity-40">{pos}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}

      {/* Draggable list stays as you already updated it */}
      <Section title="Draggable polishes" subtitle="Drag a card onto a slot to place it on a shelf">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12 gap-3">
          {state.polishes.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/polish_id", p.id)}
              className="p-2 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10 cursor-grab active:cursor-grabbing"
              title="Drag to place"
            >
              <div className="grid grid-rows-[1fr_2fr] h-28 sm:h-32 gap-1">
                <div className="w-full rounded-md" style={finishStyle(p.colorHex || "#ddd", p.finish)} />
                <div className="min-h-0 flex flex-col">
                  <div className="text-xs font-medium truncate">{p.brand || "—"}</div>
                  <div className="text-[11px] opacity-70 truncate">{p.name}</div>
                  <div className="text-[10px] opacity-50">
                    {p.wall ? `${p.wall}` : "—"} {p.shelf ? `S${p.shelf}` : ""} {p.position ? `#${p.position}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Tools ---------- */
function ToolsView({ state, dispatch }) {
  const [form, setForm] = useState({ id: uid(), name: "", type: "", brand: "", notes: "", image: null });
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return state.tools.filter((t) => [t.name, t.brand, t.type].join(" ").toLowerCase().includes(q));
  }, [state.tools, query]);

  return (
    <div className="grid gap-4">
      <Section title="Add a tool">
        <form
          className="grid sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: "tool/add", payload: form });
            setForm({ id: uid(), name: "", type: "", brand: "", notes: "", image: null });
          }}
        >
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Type" options={TOOL_TYPES} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
          <Input label="Brand (optional)" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="sm:col-span-2">
            <ImageInput label="Tool photo" value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-900 font-semibold">Add tool</button>
          </div>
        </form>
      </Section>

      <Section title="Your tools" right={<Input label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <div key={t.id} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
              <div className="flex items-start gap-3">
                <img src={t.image || placeholderFromHex("#d1d5db")} alt="tool" className="w-16 h-16 object-cover rounded-lg border" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{t.name}</div>
                  <div className="text-xs opacity-70">
                    {t.type}{t.brand ? ` · ${t.brand}` : ""}
                  </div>
                  {t.notes && <p className="text-sm mt-2 opacity-80 line-clamp-2">{t.notes}</p>}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <ToolbarButton label="Delete" onClick={() => dispatch({ type: "tool/delete", id: t.id })} className="bg-rose-100 text-rose-800" />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Manicures ---------- */
function SelectMulti({ label, options, values, onChange }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [q, options]);
  return (
    <div className="grid gap-2 text-sm">
      <span className="opacity-80">{label}</span>
      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900" />
      <div className="max-h-44 overflow-auto rounded-xl border border-black/10 dark:border-white/10">
        {filtered.map((o) => {
          const active = values.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onChange(active ? values.filter((v) => v !== o.value) : [...values, o.value])} className={`w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg:white/5 ${active ? "bg-fuchsia-50/60 dark:bg-fuchsia-500/10" : ""}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => {
          const o = options.find((x) => x.value === v);
          return o ? <Chip key={v} className="bg-fuchsia-100 text-fuchsia-900" onClick={() => onChange(values.filter((x) => x !== v))}>{o.label} ×</Chip> : null;
        })}
      </div>
    </div>
  );
}

function ManicuresView({ state, dispatch }) {
  const [form, setForm] = useState({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    title: "",
    polishes: [],
    tools: [],
    steps: [],
    notes: "",
    image: null,
    rating: 5,
    wearDays: 0,
    tags: [],
  });
  const [stepText, setStepText] = useState("");

  const addStep = () => {
    const s = stepText.trim();
    if (!s) return;
    setForm((f) => ({ ...f, steps: [...f.steps, { step: s }] }));
    setStepText("");
  };

  const save = () => {
    dispatch({ type: "mani/add", payload: form });
    setForm({ id: uid(), date: new Date().toISOString().slice(0, 10), title: "", polishes: [], tools: [], steps: [], notes: "", image: null, rating: 5, wearDays: 0, tags: [] });
  };

  return (
    <div className="grid gap-4">
      <Section title="Log a manicure" subtitle="Select polishes/tools, add steps, and upload a final photo">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <SelectMulti label="Polishes used" options={state.polishes.map((p) => ({ value: p.id, label: `${p.brand || "—"} · ${p.name}` }))} values={form.polishes} onChange={(vals) => setForm({ ...form, polishes: vals })} />
          <SelectMulti label="Tools used" options={state.tools.map((t) => ({ value: t.id, label: `${t.name}${t.brand ? ` · ${t.brand}` : ""}` }))} values={form.tools} onChange={(vals) => setForm({ ...form, tools: vals })} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Rating (1–5)" type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} />
            <Input label="Wear days" type="number" min={0} max={60} value={form.wearDays} onChange={(e) => setForm({ ...form, wearDays: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-2"><Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><ImageInput label="Final photo" value={form.image} onChange={(v) => setForm({ ...form, image: v })} /></div>
          <div className="sm:col-span-2">
            <label className="grid gap-2 text-sm">
              <span className="opacity-80">Steps</span>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900" placeholder="e.g., Base coat · 2 coats color · Glossy top coat" value={stepText} onChange={(e) => setStepText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStep()} />
                <ToolbarButton label="Add step" onClick={addStep} className="bg-indigo-100 text-indigo-800" />
              </div>
              <ol className="list-decimal ml-5 grid gap-1">
                {form.steps.map((s, idx) => (
                  <li key={idx} className="text-sm flex items-center justify-between gap-2">
                    <span>{s.step}</span>
                    <Chip className="bg-black/10" onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) })}>Remove</Chip>
                  </li>
                ))}
              </ol>
            </label>
          </div>
        </div>
        <div className="mt-3 flex justify-end"><ToolbarButton label="Save manicure" onClick={save} className="bg-emerald-100 text-emerald-900" /></div>
      </Section>

      <Section title="History">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {state.manis.map((m) => (
            <div key={m.id} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
              <div className="flex items-start gap-3">
                <img src={m.image || placeholderFromHex("#fbcfe8")} alt="mani" className="w-20 h-20 object-cover rounded-xl border" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{m.title || "Untitled manicure"}</div>
                  <div className="text-xs opacity-70">{m.date} · ⭐ {m.rating}/5 · {m.wearDays} days</div>
                  <div className="mt-1 text-xs opacity-80 line-clamp-2">{m.notes}</div>
                </div>
              </div>
              <div className="mt-2 text-xs">
                <div className="opacity-70">Polishes:</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.polishes.map((pid) => {
                    const p = state.polishes.find((x) => x.id === pid);
                    return p ? <Pill key={pid}>{(p.brand || "—").slice(0, 10)} · {p.name}</Pill> : null;
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Stats ---------- */
function countBy(arr, keyFn) {
  const map = {};
  for (const x of arr) map[keyFn(x)] = (map[keyFn(x)] || 0) + 1;
  return map;
}

function SimpleBar({ data }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <div className="grid gap-2">
      {data.sort((a, b) => b[1] - a[1]).map(([label, v]) => (
        <div key={label} className="flex items-center gap-2">
          <div className="w-36 truncate text-sm opacity-80">{label}</div>
          <div className="flex-1 h-3 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div className="h-3 rounded-full bg-gradient-to-r from-fuchsia-400 via-pink-400 to-rose-400" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <div className="w-10 text-right text-sm tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl p-4 bg-gradient-to-br from-fuchsia-100 via-pink-100 to-rose-100 text-fuchsia-900 shadow ring-1 ring-black/5">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  );
}

function StatsView({ state }) {
  const byBrand = useMemo(() => countBy(state.polishes, (p) => p.brand || "(unlabeled)"), [state.polishes]);
  const byFinish = useMemo(() => countBy(state.polishes, (p) => p.finish || "—"), [state.polishes]);

  const shelfFill = useMemo(() => {
    const walls = state.settings.wallNames || defaultWallNames(state.settings.wallCount);
    const map = Object.fromEntries(walls.map((w) => [w, Array(state.settings.shelvesPerWall).fill(0)]));
    for (const p of state.polishes) if (p.wall && p.shelf && map[p.wall]) map[p.wall][p.shelf - 1]++;
    return map;
  }, [state.polishes, state.settings.wallNames, state.settings.wallCount, state.settings.shelvesPerWall]);

  const totalSlots = state.settings.slotsPerShelf * state.settings.shelvesPerWall * state.settings.wallCount;
  const usedSlots = state.polishes.filter((p) => p.wall && p.shelf && p.position).length;

  return (
    <div className="grid gap-4">
      <Section title="Overview">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Polishes" value={state.polishes.length} />
          <StatCard label="Tools" value={state.tools.length} />
          <StatCard label="Manicures" value={state.manis.length} />
          <StatCard label="Shelf usage" value={`${usedSlots}/${totalSlots}`} sub={`${Math.round((usedSlots / totalSlots) * 100)}% filled`} />
        </div>
      </Section>
      <Section title="By brand"><SimpleBar data={Object.entries(byBrand)} /></Section>
      <Section title="By finish"><SimpleBar data={Object.entries(byFinish)} /></Section>
      <Section title="Shelf fill by wall">
        <div className="grid sm:grid-cols-2 gap-3">
          {(state.settings.wallNames || defaultWallNames(state.settings.wallCount)).map((w) => (
            <div key={w} className="p-3 rounded-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
              <div className="font-semibold mb-2">Wall {w}</div>
              <SimpleBar data={shelfFill[w].map((c, i) => [`Shelf ${i + 1}`, c])} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Backup ---------- */
function BackupView({ state, dispatch }) {
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nailvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      window.location.reload();
    } catch (e) {
      alert("Invalid backup file");
    }
  };

  return (
    <div className="grid gap-4">
      <Section title="Backup & restore">
        <div className="flex flex-wrap items-center gap-3">
          <ToolbarButton
            label="Export JSON"
            onClick={exportData}
            className="bg-indigo-100 text-indigo-800"
          />
          <label className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-900 font-semibold shadow-sm cursor-pointer">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={(e) => importData(e.target.files?.[0])}
              className="hidden"
            />
          </label>
          <ToolbarButton
            label="Reset all data"
            onClick={() =>
              window.confirm("This will erase everything. Proceed?") &&
              dispatch({ type: "reset" })
            }
            className="bg-rose-100 text-rose-800"
          />
        </div>

        {/* Household key for multi-device sync */}
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <Input
            label="Household key (share this on all devices)"
            value={state.settings.syncKey || ""}
            onChange={(e) =>
              dispatch({
                type: "settings/update",
                payload: { syncKey: e.target.value.trim() },
              })
            }
            placeholder="e.g., CASTRO-HOME-123"
          />
          <div className="sm:col-span-2 text-sm opacity-70">
            Enter the same key on every device to keep data in sync. Choose something
            unique and private.
          </div>
        </div>
      </Section>

      <Section title="Tips">
        <ul className="list-disc ml-6 text-sm opacity-80 grid gap-1">
          <li>
            Everything you add saves to your device via localStorage. Use Export JSON
            to back up or migrate.
          </li>
          <li>
            Drag a polish card (bottom of Wall view) onto any shelf slot to place it.
            Swap by dropping onto an occupied slot.
          </li>
          <li>
            Use tags like <em>favorite</em>, <em>spring</em>, <em>office-safe</em> to
            power fast filtering.
          </li>
        </ul>
      </Section>
    </div>
  );
}

/* ---------- App Shell ---------- */
const TABS = [
  { key: "inventory", label: "Inventory" },
  { key: "wall", label: "Wall Planner" },
  { key: "manis", label: "Manicures" },
  { key: "tools", label: "Tools" },
  { key: "stats", label: "Stats" },
  { key: "backup", label: "Backup" },
];

function Header({ tab, setTab }) {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 text-white shadow">
      <div className="max-w-6xl mx-auto px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center font-black">💅</div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">NailVault</h1>
              <div className="text-xs opacity-90">Polish · Wall · Manicure tracker</div>
            </div>
          </div>
          <div className="flex gap-2 overflow-auto">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap ${tab === t.key ? "bg-white text-fuchsia-700" : "bg-white/15 text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return <footer className="py-10 text-center text-sm opacity-60">Built for you — keep creating gorgeous sets ✨</footer>;
}

function placeholderFromHex(hex) {
  const c = hex || "#e5e7eb";
  const svg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='100%' height='100%' rx='12' ry='12' fill='${c}'/></svg>`);
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

export default function App() {
  const [state, dispatch] = usePersistentState();
  const [tab, setTab] = useState("inventory");

  // Enable cloud sync if a household key is set
  useCloudSync(state, dispatch);

  useEffect(() => {
    // force dark theme for better contrast
    document.documentElement.classList.add("dark");
  }, []);

  return (
  <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-pink-50 to-rose-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100">
    <Header tab={tab} setTab={setTab} />
    {/* Wider container for desktop so 12 cols fit comfortably */}
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 grid gap-4">
      {tab === "inventory" && <Inventory state={state} dispatch={dispatch} />}
      {tab === "wall" && <WallPlanner state={state} dispatch={dispatch} />}
      {tab === "manis" && <ManicuresView state={state} dispatch={dispatch} />}
      {tab === "tools" && <ToolsView state={state} dispatch={dispatch} />}
      {tab === "stats" && <StatsView state={state} />}
      {tab === "backup" && <BackupView state={state} dispatch={dispatch} />}
    </main>
    <Footer />
  </div>
);
