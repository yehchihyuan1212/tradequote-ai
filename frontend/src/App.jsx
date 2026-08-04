import React, { useState, useMemo } from "react";
import {
  Home, Inbox, Bot, DollarSign, Send, Users, Package,
  Wallet, BarChart3, Settings as Cog, Bell, ChevronDown,
  Menu, Search, ArrowLeft, Check, Pencil, ExternalLink,
  RefreshCw, Mail, FileText, TrendingUp,Trash2
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

import { getInbox, getEmail, getStats, getProducts, getQuotations, getCustomers, getCustomer,
         markViewed, getSettings, getFreight, saveSettings,
         getDrafts, generateDraft, saveDraft, sendDraftToGmail, recalcQuote,syncInbox, getReports, getSystemInfo, quoteFromEmail, draftFromEmail, regenerateDraft, getInboxArchived, replyFromEmail, archiveEmail, unarchiveEmail, getIrrelevant, purgeIrrelevant, keepEmail, deleteEmail, createProduct, updateProduct, deleteProduct, createFreight, deleteFreight } from "./api";

/* ---------------- mock data ---------------- */

const INTENTS = {
  Quotation:          { bg: "bg-blue-50",   text: "text-blue-700",   dot: "#3b82f6" },
  "Sample Request":   { bg: "bg-orange-50", text: "text-orange-700", dot: "#f97316" },
  "Delivery Follow-up": { bg: "bg-purple-50", text: "text-purple-700", dot: "#a855f7" },
  "After-sales":      { bg: "bg-red-50",    text: "text-red-700",    dot: "#ef4444" },
  Payment:            { bg: "bg-amber-50",  text: "text-amber-700",  dot: "#fbbf24" },
};

const STATUS = {
  "Draft Ready": "bg-green-50 text-green-700",
  Processed:    "bg-green-50 text-green-700",
  Pending:      "bg-slate-100 text-slate-600",
  Analyzing:    "bg-blue-50 text-blue-700",
  Sent:         "bg-emerald-50 text-emerald-700",
};

const INCOTERM_KEYS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP"];
const UNSUPPORTED_INCOTERMS = new Set(["DAP", "DPU", "DDP", "FAS"]);

/** incoterms: 客戶信裡問到的貿易條件清單（可能不只一個，例如同時問 FOB 跟 CIF）。
 * 回傳要高亮哪幾格、以及有哪些是系統算不出來的（另外顯示提示用）。 */
function incotermHighlight(incoterms) {
  const reqs = (incoterms || []).filter(Boolean).map((t) => t.toUpperCase());
  const supported = reqs.filter((t) => INCOTERM_KEYS.includes(t));
  const unsupported = reqs.filter((t) => UNSUPPORTED_INCOTERMS.has(t));
  const highlightKeys = new Set(reqs.length === 0 ? ["CIF"] : supported);
  return { highlightKeys, unsupported, anyRequested: reqs.length > 0 };
}

const COUNTRY_OPTIONS = [
  "Australia", "Belgium", "Brazil", "Canada", "China", "Egypt", "France",
  "Germany", "Hong Kong", "India", "Indonesia", "Italy", "Japan", "Korea",
  "Malaysia", "Mexico", "Netherlands", "Poland", "Russia", "Saudi Arabia",
  "Singapore", "Spain", "Taiwan", "Thailand", "Turkey", "UAE", "UK", "USA",
  "Vietnam",
];

const emails = [
  { id: 1, date: "2026-07-20 09:15", from: "ABC Trading Co.", contact: "Mr. Smith",
    email: "smith@abctrading.jp", subject: "Need quotation for USB Cable 1000pcs",
    intent: "Quotation", confidence: 98, product: "USB Cable", qty: 1000,
    country: "Japan", status: "Draft Ready",
    body: `Dear Sales Team,

We are ABC Trading Co., an electronics distributor based in Osaka, Japan.

We are interested in your USB Type-C cables. Could you please send us your best quotation for 1,000 pcs? We would need CIF Osaka pricing.

Also please advise your MOQ and lead time.

Best regards,
Mr. Smith
Purchasing Manager
ABC Trading Co.`,
    summary: "Customer requests CIF quotation for 1,000 pcs USB Cable to Osaka, Japan. Also asks for MOQ and lead time." },

  { id: 2, date: "2026-07-20 08:47", from: "Sunrise Ltd.", contact: "Emily Wong",
    email: "emily@sunrise.com.hk", subject: "Sample request - Plastic Case",
    intent: "Sample Request", confidence: 93, product: "Plastic Case", qty: 5,
    country: "Hong Kong", status: "Processed",
    body: `Hello,

Could you send us 5 samples of the plastic case (black) for evaluation? We will cover the courier cost — our DHL account is 123456789.

Thanks,
Emily`,
    summary: "Customer requests 5 free samples of Plastic Case, will pay courier on own DHL account." },

  { id: 3, date: "2026-07-19 16:22", from: "Global Tech", contact: "Daniel Kim",
    email: "d.kim@globaltech.kr", subject: "Shipment update for PO-2291",
    intent: "Delivery Follow-up", confidence: 96, product: "Bluetooth Speaker", qty: 300,
    country: "Korea", status: "Processed",
    body: `Hi,

Any update on PO-2291? The 300 pcs Bluetooth speakers were supposed to ship last Friday. Our customer is waiting.

Please send tracking number.

Daniel`,
    summary: "Customer chasing shipment status and tracking number for PO-2291 (300 pcs Bluetooth Speaker)." },

  { id: 4, date: "2026-07-19 14:03", from: "Next Step Inc.", contact: "Laura Diaz",
    email: "laura@nextstep.mx", subject: "Defective power banks in last batch",
    intent: "After-sales", confidence: 91, product: "Power Bank", qty: 12,
    country: "Mexico", status: "Pending",
    body: `Dear supplier,

Out of the 500 power banks received, 12 units do not charge at all. We have photos and videos.

How do you want to proceed? Replacement or credit note?

Laura Diaz`,
    summary: "12 of 500 Power Banks defective (not charging). Customer asks for replacement or credit note." },

  { id: 5, date: "2026-07-19 11:30", from: "Top Union Corp.", contact: "Ahmed Hassan",
    email: "ahmed@topunion.ae", subject: "T/T payment remitted",
    intent: "Payment", confidence: 99, product: "Charger", qty: 800,
    country: "UAE", status: "Processed",
    body: `Dear Sir,

We have remitted USD 5,440 today against invoice INV-2026-118. Please find the T/T copy attached.

Kindly confirm receipt and arrange shipment.

Ahmed Hassan`,
    summary: "Customer confirms T/T remittance of USD 5,440 for invoice INV-2026-118, requests shipment arrangement." },
];

const products = [
  { sku: "A1001", name: "USB Cable",        price: 3.2,  moq: 500,  lead: 20, weight: 0.05, hs: "8544.42" },
  { sku: "A1002", name: "Power Bank",       price: 8.5,  moq: 300,  lead: 25, weight: 0.22, hs: "8507.60" },
  { sku: "A1003", name: "Bluetooth Speaker",price: 12.8, moq: 200,  lead: 30, weight: 0.35, hs: "8518.22" },
  { sku: "A1004", name: "Charger",          price: 5.6,  moq: 500,  lead: 20, weight: 0.11, hs: "8504.40" },
  { sku: "A1005", name: "Plastic Case",     price: 1.4,  moq: 1000, lead: 15, weight: 0.03, hs: "3926.90" },
];

const quotations = [
  { id: "Q-2026-041", customer: "ABC Trading Co.", product: "USB Cable",        qty: 1000, status: "Draft Ready" },
  { id: "Q-2026-040", customer: "Global Tech",     product: "Bluetooth Speaker",qty: 300,  status: "Sent" },
  { id: "Q-2026-039", customer: "Top Union Corp.", product: "Charger",          qty: 800,  status: "Sent" },
  { id: "Q-2026-038", customer: "Sunrise Ltd.",    product: "Plastic Case",     qty: 2000, status: "Pending" },
];

const trend = [
  { d: "Jul 1", v: 3 }, { d: "Jul 4", v: 5 }, { d: "Jul 7", v: 4 },
  { d: "Jul 10", v: 7 }, { d: "Jul 13", v: 6 }, { d: "Jul 16", v: 9 },
  { d: "Jul 19", v: 8 }, { d: "Jul 20", v: 12 },
];

const intentDist = [
  { name: "Quotation", value: 40 }, { name: "Sample Request", value: 20 },
  { name: "Delivery Follow-up", value: 20 }, { name: "After-sales", value: 10 },
  { name: "Payment", value: 10 },
];

const NAV = [
  { key: "dashboard", label: "Dashboard",      icon: Home },
  { key: "inbox",     label: "Inbox",          icon: Inbox },
  { key: "ai",        label: "AI Review",      icon: Bot },
  { key: "quotations",label: "Quotations",     icon: DollarSign },
  { key: "drafts",    label: "Drafts",         icon: Send },
  { key: "customers", label: "Customers",      icon: Users },
  { key: "products",  label: "Products",       icon: Package },
  { key: "pricing",   label: "Price Settings", icon: Wallet },
  { key: "reports",   label: "Reports",        icon: BarChart3 },
  { key: "settings",  label: "Settings",       icon: Cog },
];

/* ---------------- shared bits ---------------- */

const Badge = ({ children, cls }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${cls}`}>{children}</span>
);

const IntentBadge = ({ intent }) => {
  const s = INTENTS[intent] || INTENTS.Quotation;
  return <Badge cls={`${s.bg} ${s.text}`}>{intent}</Badge>;
};

const Card = ({ title, action, children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>
    {title && (
      <div className="flex items-center justify-between px-6 pt-5 pb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
    )}
    {children}
  </div>
);

const Stat = ({ icon: Icon, value, label, sub, tint }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
    <div className={`w-12 h-12 rounded-xl grid place-items-center shrink-0 ${tint}`}>
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-sm font-medium text-slate-700 truncate">{label}</div>
      <div className="text-xs text-slate-400 truncate">{sub}</div>
    </div>
  </div>
);

const Th = ({ children, className = "" }) => (
  <th className={`text-left text-xs font-semibold text-slate-500 px-6 py-3 ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-6 py-4 text-sm text-slate-700 ${className}`}>{children}</td>
);

const Field = ({ label, value, onChange, suffix, type = "text" }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
    <div className="relative">
      <input
        type={type} value={value} onChange={(e) => onChange?.(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900
                   focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  </div>
);

/* ---------------- pages ---------------- */

function Dashboard({ go }) {
  const [stats, setStats] = React.useState(null);
  const [rows, setRows] = React.useState([]);

  React.useEffect(() => {
    getStats().then(setStats).catch(() => {});
    getInbox().then(setRows).catch(() => {});
  }, []);

  const dist = React.useMemo(() => {
    const d = stats?.intent_distribution || {};
    const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
    const meta = {
      quotation: ["Quotation", "#3b82f6"],
      sample_request: ["Sample Request", "#f97316"],
      delivery_followup: ["Delivery Follow-up", "#a855f7"],
      after_sales: ["After-sales", "#ef4444"],
      payment: ["Payment", "#fbbf24"],
      other: ["Other", "#94a3b8"],
    };
    return Object.entries(d).map(([k, v]) => ({
      name: meta[k]?.[0] || k,
      color: meta[k]?.[1] || "#94a3b8",
      value: v,
      pct: Math.round((v / total) * 100),
    }));
  }, [stats]);

  const total = dist.reduce((a, b) => a + b.value, 0);
  const label = (i) => i ? i.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "—";
  const tint = (i) => ({
    quotation: "bg-blue-50 text-blue-700",
    sample_request: "bg-orange-50 text-orange-700",
    delivery_followup: "bg-purple-50 text-purple-700",
    after_sales: "bg-red-50 text-red-700",
    payment: "bg-amber-50 text-amber-700",
  }[i] || "bg-slate-100 text-slate-600");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat icon={Mail}     value={stats?.emails ?? "—"}      label="Emails"      sub="Fetched from Gmail"  tint="bg-blue-50 text-blue-600" />
        <Stat icon={Bot}      value={stats?.analysed ?? "—"}    label="AI Analysed" sub="Locally, via Ollama" tint="bg-violet-50 text-violet-600" />
        <Stat icon={FileText} value={stats?.quotations ?? "—"}  label="Quotations"  sub="Priced in Python"    tint="bg-amber-50 text-amber-600" />
        <Stat icon={Users}    value={stats?.customers ?? "—"}   label="Customers"   sub="Total"               tint="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2" title="Recent inquiries"
          action={<button onClick={() => go("inbox")} className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</button>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-y border-slate-100">
                <tr><Th>Received</Th><Th>From</Th><Th>Intent</Th><Th>Subject</Th><Th>Status</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 5).map((r) => (
                  <tr key={r.message_id} className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => go("ai", r.message_id)}>
                    <Td className="text-slate-500 whitespace-nowrap text-xs">
                      {(r.received || "").replace(/ \+\d{4}$/, "").slice(0, 22)}
                    </Td>
                    <Td className="font-medium text-slate-900">{r.company}</Td>
                    <Td><Badge cls={tint(r.intent)}>{label(r.intent)}</Badge></Td>
                    <Td className="max-w-xs truncate">{r.subject}</Td>
                    <Td><Badge cls={r.status === "Pending" ? "bg-slate-100 text-slate-600" : "bg-green-50 text-green-700"}>{r.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">No emails yet.</div>
            )}
          </div>
        </Card>

        <Card title="Intent distribution">
          <div className="px-6 pb-6">
            <div className="relative">
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={dist} dataKey="value" innerRadius={62} outerRadius={95}
                       paddingAngle={2} startAngle={90} endAngle={-270}>
                    {dist.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-xs text-slate-400">Total</div>
                  <div className="text-2xl font-bold text-slate-900">{total}</div>
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-2">
              {dist.map((d) => (
                <div key={d.name} className="flex items-center gap-2.5 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-600">{d.name} ({d.pct}%)</span>
                </div>
              ))}
            </div>
            {dist.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">No analysis yet.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InboxPage({ go }) {
  const [rows, setRows] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("active");
  const [irrelevant, setIrrelevant] = React.useState([]);

  const load = React.useCallback(() => {
    setLoading(true);
    getInbox()
      .then((d) => { setRows(d); setError(null); })
      .catch(() => setError("Can't reach the API. Is the backend running on port 8000?"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(load, [load]);
  const loadIrrelevant = React.useCallback(() => {
    getIrrelevant().then(setIrrelevant).catch(() => {});
  }, []);

  React.useEffect(loadIrrelevant, [loadIrrelevant]);

  async function purgeAll() {
    if (!window.confirm(`Delete ${irrelevant.length} irrelevant emails? They will not be re-imported.`)) return;
    await purgeIrrelevant();
    loadIrrelevant();
    load();
  }

  async function keep(mid) {
    await keepEmail(mid);
    loadIrrelevant();
    load();
  }

  async function remove(mid) {
    if (!window.confirm("Delete this email? This can't be undone and it won't be re-imported.")) return;
    await deleteEmail(mid);
    load();
  }
  const [syncing, setSyncing] = React.useState(false);
  async function sync() {
    setSyncing(true);
    await syncInbox();
    load();
    setSyncing(false);
  }

  const shown = rows.filter((r) =>
    `${r.company} ${r.subject} ${r.intent}`.toLowerCase().includes(q.toLowerCase()));

  const label = (i) => i ? i.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "—";
  const tint = (i) => ({
    quotation: "bg-blue-50 text-blue-700",
    sample_request: "bg-orange-50 text-orange-700",
    delivery_followup: "bg-purple-50 text-purple-700",
    after_sales: "bg-red-50 text-red-700",
    payment: "bg-amber-50 text-amber-700",
  }[i] || "bg-slate-100 text-slate-600");
  const stint = (s) => ({
    Pending:  "bg-slate-100 text-slate-600",
    Analysed: "bg-slate-100 text-slate-600",
    Quoted:   "bg-blue-50 text-blue-700",
    Drafted:  "bg-amber-50 text-amber-700",
    Sent:     "bg-green-50 text-green-700",
  }[s] || "bg-slate-100 text-slate-600");

  return (
    <Card title="Inbox"
      action={
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-1">
            <button onClick={() => setTab("active")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === "active" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              Active
            </button>
            <button onClick={() => setTab("irrelevant")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === "irrelevant" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              Irrelevant {irrelevant.length > 0 && <span className="opacity-60">({irrelevant.length})</span>}
            </button>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail"
              className="pl-9 pr-3 py-2 w-56 rounded-lg border border-slate-200 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-400">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync Gmail"}
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      }>
      {error && <div className="px-6 py-10 text-center text-sm text-red-600">{error}</div>}
      {loading && !error && tab === "active" && <div className="px-6 py-16 text-center text-sm text-slate-400">Loading…</div>}

      {tab === "irrelevant" && (
        <>
          <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Emails the model judged unrelated to trade business. Review before deleting.
            </p>
            {irrelevant.length > 0 && (
              <button onClick={purgeAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 shrink-0">
                <Trash2 size={13} /> Delete all ({irrelevant.length})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr><Th>Received</Th><Th>From</Th><Th>Subject</Th><Th>Why</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {irrelevant.map((r) => (
                  <tr key={r.message_id} className="hover:bg-slate-50">
                    <Td className="text-slate-500 whitespace-nowrap text-xs">
                      {(r.received || "").replace(/ \+\d{4}$/, "")}
                    </Td>
                    <Td className="text-slate-600">{r.email}</Td>
                    <Td className="max-w-xs truncate font-medium text-slate-900">{r.subject}</Td>
                    <Td className="max-w-md text-xs text-slate-500">{r.summary}</Td>
                    <Td>
                      <button onClick={() => keep(r.message_id)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">
                        Keep
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {irrelevant.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-400">Nothing marked irrelevant.</div>
            )}
          </div>
        </>
      )}

      {tab === "active" && !loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Received</Th><Th>From</Th><Th>Subject</Th><Th>AI Intent</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.message_id}
                    onClick={() => { if (!r.viewed) markViewed(r.message_id); }}
                    className={`hover:bg-slate-50 ${r.viewed ? "" : "bg-blue-50/30"}`}>
                  <Td className={`whitespace-nowrap text-xs ${r.viewed ? "text-slate-500" : "text-slate-700 font-medium"}`}>
                    <span className={`inline-block w-1 h-4 rounded-full mr-2 align-middle ${r.viewed ? "bg-transparent" : "bg-blue-500"}`} />
                    {(r.received || "").replace(/ \+\d{4}$/, "")}
                  </Td>
                  <Td>
                    <div className={`text-slate-900 ${r.viewed ? "font-medium" : "font-semibold"}`}>{r.company}</div>
                    <div className="text-xs text-slate-400">{r.email}</div>
                  </Td>
                  <Td className={`max-w-xs truncate ${r.viewed ? "" : "font-medium text-slate-900"}`}>{r.subject}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge cls={tint(r.intent)}>{label(r.intent)}</Badge>
                      {r.confidence != null && (
                        <span className="text-xs text-slate-400">{r.confidence}%</span>
                      )}
                    </div>
                  </Td>
                  <Td><Badge cls={stint(r.status)}>{r.status}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => { markViewed(r.message_id); go("ai", r.message_id); }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">
                        View →
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); remove(r.message_id); }}
                        className="text-sm font-medium text-red-600 hover:text-red-700 whitespace-nowrap">
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">
              {rows.length === 0 ? "No emails yet. Run ingest.py to fetch some." : `No match for "${q}".`}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
const Step = ({ n, title, children, first }) => (
    <div className={first ? "" : "border-t border-slate-100 pt-5 mt-5"}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold grid place-items-center">{n}</span>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
);
function AIReview({ selected }) {
  const [list, setList] = React.useState([]);
  const [id, setId] = React.useState(selected);
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [showArchived, setShowArchived] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [eSubject, setESubject] = React.useState("");
  const [eBody, setEBody] = React.useState("");

  function startEdit() {
    setESubject(data.draft.subject);
    setEBody(data.draft.body);
    setEditing(true);
  }
  async function saveEdit() {
    setWorking(true);
    await saveDraft(data.draft.id, eSubject, eBody);
    setEditing(false);
    loadDetail(id);
    setWorking(false);
  }

async function regenerate() {
    if (!window.confirm("This replaces the draft with a fresh version from the current quotation. Any edits you made will be lost.")) return;
    setWorking(true);
    const r = await regenerateDraft(data.draft.id);
    if (r.error) setMsg(r.error);
    else { setMsg("Draft rewritten from the current quotation."); loadDetail(id); }
    setWorking(false);
  }
async function makeReply(mode) {
    setWorking(true);
    const r = await replyFromEmail(id, mode);
    if (r.error) setMsg(r.error);
    else { loadDetail(id); loadList(); }
    setWorking(false);
  }

  async function archive() {
    setWorking(true);
    await archiveEmail(id);
    loadList();
    setWorking(false);
  }

  async function unarchive() {
    setWorking(true);
    await unarchiveEmail(id);
    loadList();
    setWorking(false);
  }
  const loadList = React.useCallback(() => {
    const fetcher = getInbox;
    fetcher().then((d) => {
      setList(d);
      setId((cur) => {
        if (cur && d.some((x) => x.message_id === cur)) return cur;
        return d.length ? d[0].message_id : null;
      });
    }).catch(() => {});
  }, [filter]);

  React.useEffect(loadList, [loadList]);

  const loadDetail = React.useCallback((mid) => {
    if (!mid) return;
    setBusy(true);
    setMsg(null);
    getEmail(mid).then(setData).catch(() => setData(null)).finally(() => setBusy(false));
  }, []);

React.useEffect(() => { setEditing(false); loadDetail(id); }, [id, loadDetail]);

  async function makeQuote() {
    setWorking(true);
    const r = await quoteFromEmail(id);
    if (r.error) setMsg(r.error);
    else { loadDetail(id); loadList(); }
    setWorking(false);
  }

  async function makeDraft() {
    setWorking(true);
    const r = await draftFromEmail(id);
    if (r.error) setMsg(r.error);
    else { loadDetail(id); loadList(); }
    setWorking(false);
  }

async function toGmail() {
    setWorking(true);
    const r = await sendDraftToGmail(data.draft.id);
    if (r.error) {
      setMsg(r.error);
    } else {
      loadDetail(id);
      if (r.gmail_draft_id) {
        window.open(`https://mail.google.com/mail/u/0/#drafts?compose=${r.gmail_draft_id}`, "_blank");
      }
    }
    setWorking(false);
  }

  const label = (i) => i ? i.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "—";
  const tint = (i) => ({
    quotation: "bg-blue-50 text-blue-700",
    sample_request: "bg-orange-50 text-orange-700",
    delivery_followup: "bg-purple-50 text-purple-700",
    after_sales: "bg-red-50 text-red-700",
    payment: "bg-amber-50 text-amber-700",
  }[i] || "bg-slate-100 text-slate-600");

  const FILTERS = [
    ["all", "All"],
    ["quotation", "Quotation"],
    ["sample_request", "Sample"],
    ["delivery_followup", "Delivery"],
    ["after_sales", "After-sales"],
    ["payment", "Payment"],
  ];

  const shown = list.filter((r) => {
    const s = search.toLowerCase();
    if (s && !`${r.company} ${r.subject} ${r.intent} ${r.email}`.toLowerCase().includes(s)) return false;
    if (filter === "all") return r.intent !== "other";
    return r.intent === filter;
  });

  const ex = data?.extracted;
  const q = data?.quote;
  const dr = data?.draft;



  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
      <Card title="Emails"
        action={
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
              className="pl-8 pr-2 py-1.5 w-32 rounded-lg border border-slate-200 text-xs
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
        }>
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {FILTERS.map(([k, lb]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors
                ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {lb}
            </button>
          ))}
        </div>
        <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-[70vh] overflow-y-auto">
          {shown.map((r) => (
            <button key={r.message_id} onClick={() => setId(r.message_id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors
                ${r.message_id === id ? "bg-blue-50/70" : ""}`}>
              <div className="text-sm font-medium text-slate-900 truncate">{r.company || r.email}</div>
              <div className="text-xs text-slate-500 truncate mt-0.5">{r.subject}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge cls={tint(r.intent)}>{label(r.intent)}</Badge>
                {r.status === "Drafted" && <span className="text-[10px] text-amber-600 font-medium">drafted</span>}
                {r.status === "Quoted" && <span className="text-[10px] text-blue-600 font-medium">quoted</span>}
              </div>
            </button>
          ))}
          {shown.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400 px-4">Nothing matches this filter.</div>
          )}
        </div>
      </Card>

      <Card title={data?.email?.subject || "Select an email"}>
        <div className="px-6 pb-6">
          {busy && <div className="py-16 text-center text-sm text-slate-400">Loading…</div>}

          {!busy && data?.email && (
            <>
              <Step n="1" title="Original email" first>
                <div className="text-xs text-slate-500 mb-3">
                  {data.email.sender_name} &lt;{data.email.sender_email}&gt; · {data.email.received}
                </div>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {data.email.body}
                </pre>
              </Step>

              {ex && (
                <Step n="2" title="AI extraction">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 mb-4">
                    <Badge cls={tint(ex.intent)}>{label(ex.intent)}</Badge>
                    <div className="text-sm">
                      <span className="text-slate-400 text-xs mr-2">confidence</span>
                      <span className="font-bold text-slate-900">{ex.confidence}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    {[["Company", ex.company], ["Contact", ex.contact],
                      ...(ex.items && ex.items.length > 1 ? [] : [
                        ["Product", ex.product], ["Quantity", ex.quantity?.toLocaleString()],
                      ]),
                      ["Destination", ex.destination],
                      ["Incoterm", ex.incoterms?.length ? ex.incoterms.join(" + ") : null]].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-xs text-slate-400">{k}</div>
                        <div className="text-sm font-medium text-slate-900">{v ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                  {ex.items && ex.items.length > 1 && (
                    <div className="mt-4">
                      <div className="text-xs text-slate-400 mb-1.5">Products requested</div>
                      <ul className="text-sm text-slate-900 space-y-1">
                        {ex.items.map((it, idx) => (
                          <li key={idx} className="flex items-center justify-between border-b border-slate-100 pb-1">
                            <span>{it.product}</span>
                            <span className="text-slate-500">
                              {it.quantity != null ? `${it.quantity.toLocaleString()} pcs` : "qty not stated"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ex.summary && (
                    <p className="text-sm text-slate-600 mt-4 leading-relaxed">{ex.summary}</p>
                  )}
                </Step>
              )}
              {ex && ex.intent !== "quotation" && !dr && (
                <Step n="3" title="Reply">
                  <p className="text-sm text-slate-600 mb-3">
                    No pricing needed for a {label(ex.intent).toLowerCase()} email. Start from a template, or write your own.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => makeReply("template")} disabled={working}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300">
                      <FileText size={15} /> {working ? "Writing…" : "Use template"}
                    </button>
                    <button onClick={() => makeReply("blank")} disabled={working}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <Pencil size={15} /> Blank draft
                    </button>
                    <button onClick={archive} disabled={working}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                      <Check size={15} /> No reply needed
                    </button>
                  </div>
                </Step>
              )}

              {ex && ex.intent === "quotation" && (
                <Step n="3" title="Quotation">
                  {!q && (
                    <button onClick={makeQuote} disabled={working}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300">
                      <DollarSign size={15} /> {working ? "Calculating…" : "Generate quotation for this email"}
                    </button>
                  )}
                  {q && (() => {
                    const { highlightKeys, unsupported, anyRequested } = incotermHighlight(ex.incoterms);
                    return (
                    <>
                      {unsupported.length > 0 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-3">
                          客戶要求 {unsupported.join("、")}，此條件涉及目的地稅費，系統暫不支援自動計算，請人工報價。
                        </div>
                      )}
                      {q.items && q.items.length > 1 && (
                        <div className="mb-4 overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="text-xs text-slate-400 border-b border-slate-100">
                                <th className="text-left font-medium py-1.5">SKU</th>
                                <th className="text-left font-medium py-1.5">Product</th>
                                <th className="text-right font-medium py-1.5">Qty</th>
                                <th className="text-right font-medium py-1.5">Unit cost</th>
                                <th className="text-right font-medium py-1.5">Line cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {q.items.map((it) => (
                                <tr key={it.sku} className="text-sm border-b border-slate-50">
                                  <td className="py-1.5 font-mono text-xs text-slate-500">{it.sku}</td>
                                  <td className="py-1.5 text-slate-900">{it.product}</td>
                                  <td className="py-1.5 text-right tabular-nums">{it.quantity.toLocaleString()}</td>
                                  <td className="py-1.5 text-right tabular-nums">USD {it.unit_price.toFixed(2)}</td>
                                  <td className="py-1.5 text-right tabular-nums font-medium">USD {it.cost.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {INCOTERM_KEYS.map((k) => {
                          const v = q[k.toLowerCase()];
                          if (v == null) return null;
                          const on = highlightKeys.has(k);
                          return (
                            <div key={k} className={`rounded-lg p-4 border ${on ? "border-blue-300 border-2 bg-blue-50" : "border-slate-200"}`}>
                              <div className="text-xs font-semibold text-slate-500">{k}</div>
                              <div className={`text-lg font-bold mt-1 ${on ? "text-blue-700" : "text-slate-900"}`}>
                                {v.toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        {q.quote_no} · {q.items?.length > 1 ? `${q.items.length} products` : `matched SKU ${q.sku}`} · MOQ {q.moq?.toLocaleString()} pcs · {q.lead_days} days
                        {anyRequested && ` · highlighted term(s) are what the customer asked for`}
                      </div>
                    </>
                    );
                  })()}
                </Step>
              )}

              {(q || dr) && (
                <Step n={q ? "4" : "3"} title="Draft reply">
                  {!dr && (
                    <button onClick={makeDraft} disabled={working}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300">
                      <FileText size={15} /> {working ? "Writing…" : "Generate draft from this quotation"}
                    </button>
                  )}
{dr && (
                    <>
                      {editing ? (
                        <>
                          <div className="mb-2">
                            <div className="text-xs text-slate-400 mb-1">Subject</div>
                            <input value={eSubject} onChange={(e) => setESubject(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          </div>
                          <textarea value={eBody} onChange={(e) => setEBody(e.target.value)} rows={14}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed
                                       focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={saveEdit} disabled={working}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300">
                              <Check size={15} /> {working ? "Saving…" : "Save changes"}
                            </button>
                            <button onClick={() => setEditing(false)}
                              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                              Cancel
                            </button>
                          </div>
                                                    <p className="text-xs text-slate-400 mt-2">
                            Reset to quotation rewrites the draft from the latest prices — use it after recalculating.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-slate-500 mb-2">
                            To {dr.to} · {dr.subject}
                          </div>
                          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed
                                          border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                            {dr.body}
                          </pre>
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={startEdit}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                              <Pencil size={15} /> Edit
                            </button>
                            {q && <button onClick={regenerate} disabled={working}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                              <RefreshCw size={15} /> Reset to quotation
                            </button>}
                            <button onClick={toGmail} disabled={working}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300">
                              <ExternalLink size={15} /> {working ? "Sending…" : dr.status === "sent" ? "Send to Gmail again" : "Send to Gmail"}
                            </button>
                            {dr.status === "sent" && dr.gmail_draft_id && (
                              <a href={`https://mail.google.com/mail/u/0/#drafts?compose=${dr.gmail_draft_id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                                <ExternalLink size={15} /> Open in Gmail
                              </a>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </Step>
              )}

              {msg && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  {msg}
                </div>
              )}
            </>
          )}

        </div>
      </Card>
    </div>
  );
}

function Quotations({ go, setPendingDraftNote }) {
  const [rows, setRows] = React.useState([]);
  const [open, setOpen] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const breakdownRef = React.useRef(null);

  function openQuote(q) {
    setOpen(q);
    breakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const shown = rows.filter((q) => {
    const s = search.toLowerCase();
    return !s || `${q.quote_no} ${q.company} ${q.product} ${q.destination} ${q.status}`.toLowerCase().includes(s);
  });

  const load = React.useCallback(() => {
    getQuotations().then((d) => { setRows(d); if (d.length) setOpen(d[0]); }).catch(() => {});
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function recalc(quoteNo) {
    await recalcQuote(quoteNo);
    load();
  }
  const [draftMsg, setDraftMsg] = React.useState(null);
  async function makeDraft(quoteNo) {
    const r = await generateDraft(quoteNo);
    if (r.draft_id) {
      setPendingDraftNote?.(
        r.error ? "This quote already had a draft — showing it below." : "Draft created."
      );
      go?.("drafts", r.draft_id);
    } else {
      setDraftMsg(r.error || "Failed.");
    }
  }

  const stint = (s) => ({
    draft: "bg-slate-100 text-slate-600",
    sent: "bg-blue-50 text-blue-700",
    won: "bg-green-50 text-green-700",
    lost: "bg-red-50 text-red-700",
  }[s] || "bg-slate-100 text-slate-600");

  return (
    <div className="space-y-5">
      <Card title="Quotations"
        action={
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotations"
              className="pl-9 pr-3 py-2 w-56 rounded-lg border border-slate-200 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Quote no.</Th><Th>Customer</Th><Th>Product</Th><Th>Qty</Th><Th>Destination</Th><Th>CIF</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((q) => (
                <tr key={q.quote_no}
                    className={`hover:bg-slate-50 ${open?.quote_no === q.quote_no ? "bg-blue-50/50" : ""}`}>
                  <Td className="font-mono text-xs text-slate-500">{q.quote_no}</Td>
                  <Td className="font-medium text-slate-900">{q.company}</Td>
                  <Td>{q.product}{q.items.length > 1 && ` +${q.items.length - 1} more`}</Td>
                  <Td className="tabular-nums">{q.quantity.toLocaleString()}</Td>
                  <Td>{q.destination}</Td>
                  <Td className="tabular-nums font-medium">USD {q.cif.toLocaleString()}</Td>
                  <Td><Badge cls={stint(q.status)}>{q.status}</Badge></Td>
                  <Td>
                    <button onClick={() => openQuote(q)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700">Open</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            No quotations yet. Emails with a quotation intent generate one automatically.
          </div>
        )}
      </Card>

      {open && (
        <div ref={breakdownRef}>
        <Card title={`Price breakdown — ${open.quote_no}`}
          action={
            <div className="flex gap-2">
              <button onClick={() => recalc(open.quote_no)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <RefreshCw size={14} /> Recalculate
              </button>
              <button onClick={() => makeDraft(open.quote_no)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                <FileText size={14} /> Generate draft
              </button>
            </div>
          }>
          <div className="px-6 pb-6">
            {draftMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                {draftMsg}
              </div>
            )}
            {open.items.length > 1 && (
              <div className="mb-6 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left font-medium py-1.5">SKU</th>
                      <th className="text-left font-medium py-1.5">Product</th>
                      <th className="text-right font-medium py-1.5">Qty</th>
                      <th className="text-right font-medium py-1.5">Unit cost</th>
                      <th className="text-right font-medium py-1.5">Line cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.items.map((it) => (
                      <tr key={it.sku} className="text-sm border-b border-slate-50">
                        <td className="py-1.5 font-mono text-xs text-slate-500">{it.sku}</td>
                        <td className="py-1.5 text-slate-900">{it.product}</td>
                        <td className="py-1.5 text-right tabular-nums">{it.quantity.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums">USD {it.unit_price.toFixed(2)}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">USD {it.cost.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(() => {
              const { highlightKeys, unsupported, anyRequested } = incotermHighlight(open.incoterms);
              return (
                <>
                  {unsupported.length > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4">
                      客戶要求 {unsupported.join("、")}，此條件涉及目的地稅費，系統暫不支援自動計算，請人工報價。
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[["EXW", open.exw, "Ex Works"],
                      ["FCA", open.fca, "Free Carrier"],
                      ["FOB", open.fob, "Free On Board"],
                      ["CFR", open.cfr, "Cost and Freight"],
                      ["CIF", open.cif, `Cost, Insurance & Freight — ${open.destination}`],
                      ["CPT", open.cpt, "Carriage Paid To"],
                      ["CIP", open.cip, "Carriage and Insurance Paid To"]].map(([k, v, sub]) => {
                      const on = highlightKeys.has(k);
                      return (
                        <div key={k} className={`rounded-xl p-5 border ${on ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                          <div className="text-xs font-semibold text-slate-500">{k}</div>
                          <div className={`text-2xl font-bold mt-1 ${on ? "text-blue-700" : "text-slate-900"}`}>
                            USD {v.toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    Calculated in Python from Price Settings. The language model never touches the arithmetic.
                    {anyRequested && " · highlighted term(s) are what the customer asked for"}
                  </p>
                </>
              );
            })()}
          </div>
        </Card>

        <Card title={`AI Extraction — ${open.quote_no}`} className="mt-5">
          <div className="px-6 pb-6">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 mb-4">
              <div className="text-sm text-slate-600 truncate">
                From <span className="font-medium text-slate-900">{open.extraction.sender_email}</span>
                {open.extraction.subject && ` · ${open.extraction.subject}`}
              </div>
              <div className="text-sm shrink-0 ml-3">
                <span className="text-slate-400 text-xs mr-2">confidence</span>
                <span className="font-bold text-slate-900">{open.extraction.confidence}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {[["Company", open.extraction.company], ["Contact", open.extraction.contact],
                ["Destination", open.extraction.destination],
                ["Incoterm", open.extraction.incoterms?.length ? open.extraction.incoterms.join(" + ") : null]].map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs text-slate-400">{k}</div>
                  <div className="text-sm font-medium text-slate-900">{v ?? "—"}</div>
                </div>
              ))}
            </div>
            {open.extraction.items?.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-slate-400 mb-1.5">Products requested</div>
                <ul className="text-sm text-slate-900 space-y-1">
                  {open.extraction.items.map((it, idx) => (
                    <li key={idx} className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <span>{it.product}</span>
                      <span className="text-slate-500">
                        {it.quantity != null ? `${it.quantity.toLocaleString()} pcs` : "qty not stated"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {open.extraction.summary && (
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">{open.extraction.summary}</p>
            )}
          </div>
        </Card>
        </div>
      )}
    </div>
  );
}

function Drafts({ selectedId, pendingNote, clearPendingNote }) {
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [tab, setTab] = React.useState("draft");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [msg, setMsg] = React.useState(null);
  const appliedSelectedId = React.useRef(false);

  const load = React.useCallback(() => {
    getDrafts().then((d) => {
      setRows(d);
      // 從 Quotations 頁「Generate draft」跳過來時，優先選中那筆草稿並帶出提示訊息。
      // 只套用一次（用 ref 擋）。StrictMode 開發模式下 mount effect 會呼叫兩次 load()，
      // 第二次進來時 ref 已經是 true，直接跳過整段（包括下面的 fallback），不然用的是
      // 第一次呼叫時捕捉到的舊 sel 閉包（還是 null），會誤判「還沒選過」而蓋掉正確的選取。
      if (appliedSelectedId.current) return;
      if (selectedId) {
        appliedSelectedId.current = true;
        const target = d.find((x) => x.id === selectedId);
        if (target) {
          pick(target);
          setTab(target.status === "sent" ? "sent" : "draft");
          if (pendingNote) setMsg(pendingNote);
          clearPendingNote?.();
          return;
        }
        clearPendingNote?.();
      }
      if (d.length && !sel) pick(d[0]);
    }).catch(() => {});
  }, [sel, selectedId, pendingNote]);

  React.useEffect(() => { load(); }, []);

  React.useEffect(() => {
    if (shown.length && !shown.some((d) => d.id === sel?.id)) pick(shown[0]);
    if (!shown.length) setSel(null);
  }, [tab, rows]);

  const shown = rows.filter((d) => {
    const s = search.toLowerCase();
    if (s && !`${d.to} ${d.subject} ${d.body} ${d.company || ""}`.toLowerCase().includes(s)) return false;
    return tab === "draft" ? d.status !== "sent" : d.status === "sent";
  });
  const counts = {
    draft: rows.filter((d) => d.status !== "sent").length,
    sent: rows.filter((d) => d.status === "sent").length,
  };

  function pick(d) {
    setSel(d);
    setSubject(d.subject);
    setBody(d.body);
    setEditing(false);
    setMsg(null);
  }

  async function save() {
    await saveDraft(sel.id, subject, body);
    setEditing(false);
    setMsg("Saved.");
    load();
  }

  async function toGmail() {
    setMsg("Sending to Gmail…");
    const r = await sendDraftToGmail(sel.id);
    if (r.ok) {
      setMsg("Saved to Gmail drafts. Review and send it there.");
      load();
    } else {
      setMsg(r.error || "Failed.");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card title="Drafts" className="lg:col-span-1"
        action={
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
              className="pl-8 pr-2 py-1.5 w-32 rounded-lg border border-slate-200 text-xs
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
        }>
        <div className="px-4 pb-3 flex gap-1.5">
          {[["draft", "Pending", counts.draft], ["sent", "In Gmail", counts.sent]].map(([k, lb, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                ${tab === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {lb} {n > 0 && <span className="opacity-60">({n})</span>}
            </button>
          ))}
        </div>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {shown.map((d) => (
            <button key={d.id} onClick={() => pick(d)}
              className={`w-full text-left px-6 py-4 hover:bg-slate-50 ${sel?.id === d.id ? "bg-blue-50/60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 truncate">{d.to}</span>
                <Badge cls={d.status === "sent" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}>
                  {d.status === "sent" ? "In Gmail" : "Draft"}
                </Badge>
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate">{d.subject}</div>
            </button>
          ))}
        </div>
        {shown.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400 px-6">
            {tab === "draft"
              ? "No pending drafts. Generate one from AI Review."
              : "Nothing sent to Gmail yet."}
          </div>
        )}
      </Card>

      <Card title="Preview" className="lg:col-span-2"
        action={sel && (
          <div className="flex gap-2">
            {editing ? (
              <button onClick={save}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                <Check size={14} /> Save
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Pencil size={14} /> Edit
              </button>
            )}
            <button onClick={toGmail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
              <ExternalLink size={14} /> Send to Gmail
            </button>
          </div>
        )}>
        <div className="px-6 pb-6">
          {!sel && <div className="py-16 text-center text-sm text-slate-400">Select a draft.</div>}
          {sel && (
            <>
              <div className="pb-4 mb-4 border-b border-slate-100 space-y-2 text-sm">
                <div><span className="text-slate-400 w-16 inline-block">To</span> <span className="text-slate-900">{sel.to}</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-16 inline-block">Subject</span>
                  {editing ? (
                    <input value={subject} onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 px-2 py-1 rounded border border-slate-200 text-sm" />
                  ) : (
                    <span className="text-slate-900">{sel.subject}</span>
                  )}
                </div>
              </div>
              {editing ? (
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
              ) : (
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{sel.body}</pre>
              )}
              {msg && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  {msg}
                </div>
              )}
              <div className="mt-4 text-xs text-slate-400">
                "Send to Gmail" saves this as a Gmail draft — it does not send the email. You confirm and send from Gmail.
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Customers() {
  const [rows, setRows] = React.useState([]);
  const [openId, setOpenId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);

  React.useEffect(() => {
    getCustomers().then(setRows).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (openId == null) { setDetail(null); return; }
    getCustomer(openId).then(setDetail).catch(() => {});
  }, [openId]);

  const label = (i) => i ? i.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "—";
  const tint = (i) => ({
    quotation: "bg-blue-50 text-blue-700",
    sample_request: "bg-orange-50 text-orange-700",
    delivery_followup: "bg-purple-50 text-purple-700",
    after_sales: "bg-red-50 text-red-700",
    payment: "bg-amber-50 text-amber-700",
  }[i] || "bg-slate-100 text-slate-600");
  const stint = (s) => ({
    Pending:  "bg-slate-100 text-slate-600",
    Analysed: "bg-slate-100 text-slate-600",
    Quoted:   "bg-blue-50 text-blue-700",
    Drafted:  "bg-amber-50 text-amber-700",
    Sent:     "bg-green-50 text-green-700",
  }[s] || "bg-slate-100 text-slate-600");

  return (
    <div className="space-y-5">
      <Card title="Customers">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Company</Th><Th>Country</Th><Th>Industry</Th><Th>Language</Th><Th>Quotations</Th><Th>Total value</Th><Th>Last contact</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)}
                    className={`hover:bg-slate-50 cursor-pointer ${openId === c.id ? "bg-blue-50/50" : ""}`}>
                  <Td className="font-medium text-slate-900">{c.company}</Td>
                  <Td>{c.country || "—"}</Td>
                  <Td>{c.industry || "—"}</Td>
                  <Td>{c.language}</Td>
                  <Td>{c.quotations}</Td>
                  <Td className="font-medium tabular-nums">USD {c.total_value.toLocaleString()}</Td>
                  <Td className="text-slate-500">{c.last_contact || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            No customers yet. Sync the inbox to build the customer list.
          </div>
        )}
      </Card>

      {openId != null && (
        <Card title={detail ? `History — ${detail.company}` : "History"}>
          {!detail ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-y border-slate-100">
                  <tr><Th>Received</Th><Th>Subject</Th><Th>Intent</Th><Th>Product</Th><Th>Qty</Th><Th>Quote no.</Th><Th>CIF</Th><Th>Status</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.history.map((h) => (
                    <tr key={h.message_id} className="hover:bg-slate-50">
                      <Td className="text-slate-500">{h.received}</Td>
                      <Td className="max-w-xs truncate">{h.subject}</Td>
                      <Td><Badge cls={tint(h.intent)}>{label(h.intent)}</Badge></Td>
                      <Td>{h.product || "—"}</Td>
                      <Td className="tabular-nums">{h.quantity ?? "—"}</Td>
                      <Td className="font-mono text-xs text-slate-500">{h.quote_no || "—"}</Td>
                      <Td className="tabular-nums">{h.cif ? `USD ${h.cif.toLocaleString()}` : "—"}</Td>
                      <Td><Badge cls={stint(h.status)}>{h.status}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.history.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-400">No inquiries from this customer yet.</div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

﻿function Products() {
  const [rows, setRows] = React.useState([]);
  const [err, setErr] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    sku: "", name: "", price: "", moq: "", lead: "", weight: "", hs_code: "", aliases: "",
  });

  const load = React.useCallback(() => {
    getProducts().then(setRows).catch(() => setErr("Can't load products."));
  }, []);

  React.useEffect(load, [load]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function reset() {
    setForm({ sku: "", name: "", price: "", moq: "", lead: "", weight: "", hs_code: "", aliases: "" });
    setAdding(false);
    setErr(null);
  }

  async function save() {
    if (!form.sku.trim() || !form.name.trim() || !form.price || !form.moq || !form.lead) {
      setErr("SKU, name, price, MOQ and lead time are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await createProduct({
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit_price: parseFloat(form.price),
      moq: parseInt(form.moq, 10),
      lead_days: parseInt(form.lead, 10),
      weight_kg: form.weight ? parseFloat(form.weight) : null,
      hs_code: form.hs_code.trim() || null,
      aliases: form.aliases.trim() || null,
    });
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    reset();
    load();
  }

  async function remove(sku) {
    if (!window.confirm(`Delete ${sku}?`)) return;
    const r = await deleteProduct(sku);
    if (r.error) { setErr(r.error); return; }
    load();
  }

  return (
    <Card title="Products"
      action={
        <button onClick={() => adding ? reset() : setAdding(true)}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          {adding ? "Cancel" : "Add product"}
        </button>
      }>
      {err && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
          {err}
        </div>
      )}

      {adding && (
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="SKU *" value={form.sku} onChange={set("sku")} />
            <Field label="Product name *" value={form.name} onChange={set("name")} />
            <Field label="Unit price (USD) *" value={form.price} onChange={set("price")} />
            <Field label="MOQ (pcs) *" value={form.moq} onChange={set("moq")} />
            <Field label="Lead time (days) *" value={form.lead} onChange={set("lead")} />
            <Field label="Weight (kg)" value={form.weight} onChange={set("weight")} />
            <Field label="HS code" value={form.hs_code} onChange={set("hs_code")} />
            <Field label="Aliases" value={form.aliases} onChange={set("aliases")} />
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Aliases help match customer wording to this product.
          </p>
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300">
              {saving ? "Saving..." : "Save product"}
            </button>
            <button onClick={reset}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-y border-slate-100">
            <tr><Th>SKU</Th><Th>Product</Th><Th>Unit price</Th><Th>MOQ</Th><Th>Lead time</Th><Th>HS code</Th><Th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.sku} className="hover:bg-slate-50">
                <Td className="font-mono text-xs text-slate-500">{p.sku}</Td>
                <Td className="font-medium text-slate-900">{p.name}</Td>
                <Td className="tabular-nums">USD {p.price.toFixed(2)}</Td>
                <Td>{p.moq.toLocaleString()} pcs</Td>
                <Td>{p.lead} days</Td>
                <Td className="font-mono text-xs text-slate-500">{p.hs_code || "-"}</Td>
                <Td>
                  <button onClick={() => remove(p.sku)}
                    className="text-sm font-medium text-red-600 hover:text-red-700">
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">No products yet.</div>
        )}
      </div>

      <div className="px-6 py-4 text-xs text-slate-400 border-t border-slate-100">
        The pricing engine reads unit price, MOQ and lead time from this table.
      </div>
    </Card>
  );
}

function PriceSettings() {
  const [v, setV] = React.useState(null);
  const [freight, setFreight] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const [freightAdding, setFreightAdding] = React.useState(false);
  const [freightSaving, setFreightSaving] = React.useState(false);
  const [freightErr, setFreightErr] = React.useState(null);
  const [freightForm, setFreightForm] = React.useState({
    destination: "", port: "", cost: "", transit: "",
  });

  const loadFreight = React.useCallback(() => {
    getFreight().then(setFreight).catch(() => {});
  }, []);

  React.useEffect(() => {
    getSettings().then(setV).catch(() => {});
    loadFreight();
  }, [loadFreight]);

  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));

  const setFreightField = (k) => (x) => setFreightForm((f) => ({ ...f, [k]: x }));

  function resetFreightForm() {
    setFreightForm({ destination: "", port: "", cost: "", transit: "" });
    setFreightAdding(false);
    setFreightErr(null);
  }

  async function addFreight() {
    if (!freightForm.destination.trim() || !freightForm.cost) {
      setFreightErr("Destination and freight cost are required.");
      return;
    }
    setFreightSaving(true);
    setFreightErr(null);
    const r = await createFreight({
      destination: freightForm.destination.trim(),
      port: freightForm.port.trim() || null,
      cost_usd: parseFloat(freightForm.cost),
      transit_days: freightForm.transit ? parseInt(freightForm.transit, 10) : null,
    });
    setFreightSaving(false);
    if (r.error) { setFreightErr(r.error); return; }
    resetFreightForm();
    loadFreight();
  }

  async function removeFreight(destination) {
    if (!window.confirm(`Delete freight for ${destination}?`)) return;
    const r = await deleteFreight(destination);
    if (r.error) { setFreightErr(r.error); return; }
    loadFreight();
  }

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await saveSettings({
        profit_margin: parseFloat(v.profit_margin),
        local_charges: parseFloat(v.local_charges),
        insurance: parseFloat(v.insurance),
        bank_charges: parseFloat(v.bank_charges),
        usd_twd: parseFloat(v.usd_twd),
      });
      setV((s) => ({ ...s, updated_at: r.updated_at }));
      setMsg("Saved. New quotations will use these values.");
    } catch {
      setMsg("Couldn't save. Check the backend is running.");
    } finally {
      setSaving(false);
    }
  };

  if (!v) return <Card><div className="py-16 text-center text-sm text-slate-400">Loading…</div></Card>;

  const marginPct = (parseFloat(v.profit_margin) * 100).toFixed(0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Margin and exchange">
        <div className="px-6 pb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Profit margin</label>
            <div className="relative">
              <input type="number" step="0.01" min="0" max="0.9"
                value={v.profit_margin}
                onChange={(e) => set("profit_margin")(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                = {marginPct}%
              </span>
            </div>
          </div>
          <Field label="USD / TWD" value={v.usd_twd} onChange={set("usd_twd")} />
        </div>
      </Card>

      <Card title="Charges">
        <div className="px-6 pb-6 grid grid-cols-2 gap-4">
          <Field label="Local charges" value={v.local_charges} onChange={set("local_charges")} suffix="USD" />
          <Field label="Insurance" value={v.insurance} onChange={set("insurance")} suffix="USD" />
          <Field label="Bank charges" value={v.bank_charges} onChange={set("bank_charges")} suffix="USD" />
        </div>
      </Card>

      <Card title="Freight by destination" className="lg:col-span-2"
        action={
          <button onClick={() => freightAdding ? resetFreightForm() : setFreightAdding(true)}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            {freightAdding ? "Cancel" : "Add destination"}
          </button>
        }>
        {freightErr && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
            {freightErr}
          </div>
        )}

        {freightAdding && (
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Destination *</label>
                <input list="country-options" value={freightForm.destination}
                  onChange={(e) => setFreightField("destination")(e.target.value)}
                  placeholder="Select or type a country"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                <datalist id="country-options">
                  {COUNTRY_OPTIONS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <Field label="Port" value={freightForm.port} onChange={setFreightField("port")} />
              <Field label="Freight cost (USD) *" value={freightForm.cost} onChange={setFreightField("cost")} />
              <Field label="Transit (days)" value={freightForm.transit} onChange={setFreightField("transit")} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addFreight} disabled={freightSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300">
                {freightSaving ? "Saving..." : "Save destination"}
              </button>
              <button onClick={resetFreightForm}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Destination</Th><Th>Port</Th><Th>Cost</Th><Th>Transit</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {freight.map((f) => (
                <tr key={f.destination} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{f.destination}</Td>
                  <Td>{f.port || "—"}</Td>
                  <Td className="tabular-nums">USD {f.cost_usd.toLocaleString()}</Td>
                  <Td className="text-slate-500">{f.transit_days ? `${f.transit_days} days` : "—"}</Td>
                  <Td>
                    <button onClick={() => removeFreight(f.destination)}
                      className="text-sm font-medium text-red-600 hover:text-red-700">
                      Delete
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {freight.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">No destinations yet.</div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            {msg || `Last updated ${v.updated_at}. Existing quotations keep the values they were priced with.`}
          </div>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 disabled:bg-slate-300 shrink-0">
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </Card>

      <Card title="Incoterms 說明" className="lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Incoterm</Th><Th>中文名稱</Th><Th>計算方式</Th><Th>說明</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["EXW", "工廠交貨", "成本 ÷ (1 − 毛利率)", "賣方於工廠交貨，其後所有費用與風險由買方負擔。"],
                ["FCA", "貨交運人", "EXW ＋ 出口地手續費的一半", "賣方在指定地點將貨物交給買方指定的運送人，並完成出口清關。"],
                ["FOB", "船上交貨", "EXW ＋ 出口地手續費", "賣方負責將貨物裝上買方指定的船隻，之後風險轉移給買方。"],
                ["CFR", "運費在內", "FOB ＋ 運費", "賣方負擔到目的港的運費，但不含保險，風險於裝船後轉移。"],
                ["CIF", "運保費在內", "FOB ＋ 運費 ＋ 保險", "賣方負擔到目的港的運費與保險，風險於裝船後轉移。"],
                ["CPT", "運費付訖", "EXW ＋ 運費", "適用任何運輸方式，賣方負擔到指定地點的運費，不含保險。"],
                ["CIP", "運保費付訖", "EXW ＋ 運費 ＋ 保險", "適用任何運輸方式，賣方負擔到指定地點的運費與保險。"],
              ].map(([term, name, formula, desc]) => (
                <tr key={term} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs font-semibold text-slate-900">{term}</Td>
                  <Td className="font-medium text-slate-900">{name}</Td>
                  <Td className="text-slate-500">{formula}</Td>
                  <Td className="text-slate-500">{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 text-xs text-slate-400">
          DAP、DPU、DDP、FAS 涉及目的地當地運輸、關稅或卸貨費用，系統沒有這些資料，無法自動試算，請人工報價。
        </div>
      </Card>
    </div>
  );
}
function Reports() {
  const [d, setD] = React.useState(null);

  React.useEffect(() => {
    getReports().then(setD).catch(() => {});
  }, []);

  if (!d) return <Card><div className="py-16 text-center text-sm text-slate-400">Loading…</div></Card>;

  const intentMeta = {
    quotation: ["Quotation", "#3b82f6"],
    sample_request: ["Sample Request", "#f97316"],
    delivery_followup: ["Delivery Follow-up", "#a855f7"],
    after_sales: ["After-sales", "#ef4444"],
    payment: ["Payment", "#fbbf24"],
    other: ["Other", "#94a3b8"],
  };
  const intentData = Object.entries(d.intent_distribution).map(([k, v]) => ({
    name: intentMeta[k]?.[0] || k,
    color: intentMeta[k]?.[1] || "#94a3b8",
    value: v,
  }));

  const fmt = (n) => "USD " + Math.round(n).toLocaleString();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Analytics overview</h2>
        <a href="http://localhost:8000/api/export"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
          <FileText size={15} /> Export Excel
        </a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat icon={Mail}       value={d.total_emails}            label="Emails analysed" sub="From Gmail"          tint="bg-blue-50 text-blue-600" />
        <Stat icon={FileText}   value={d.total_quotes}            label="Quotations"      sub="Auto-priced"         tint="bg-amber-50 text-amber-600" />
        <Stat icon={DollarSign} value={fmt(d.total_value)}        label="Total quoted"    sub="Sum of CIF"          tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={Bot}        value={`${d.avg_confidence}%`}    label="Avg confidence"  sub="AI extraction"       tint="bg-violet-50 text-violet-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Intent distribution">
          <div className="px-6 pb-6">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={intentData} dataKey="value" nameKey="name"
                     innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {intentData.map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {intentData.map((x) => (
                <div key={x.name} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.color }} />
                  <span className="text-slate-600">{x.name}</span>
                  <span className="text-slate-400 ml-auto">{x.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Quoted value by product">
          <div className="px-6 pb-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.top_products} margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Top products by inquiries">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-y border-slate-100">
                <tr><Th>Product</Th><Th>Quotations</Th><Th>Total value</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.top_products.map((p) => (
                  <tr key={p.name} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    <Td>{p.count}</Td>
                    <Td className="tabular-nums font-medium">{fmt(p.value)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Quotations by destination">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-y border-slate-100">
                <tr><Th>Destination</Th><Th>Quotations</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.destinations.map((x) => (
                  <tr key={x.name} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{x.name}</Td>
                    <Td>{x.count}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [info, setInfo] = React.useState(null);
  const [company, setCompany] = React.useState("Taiwan Electronics Co., Ltd.");
  const [signature, setSignature] = React.useState("Sales Department");

  const [syncLimit, setSyncLimit] = React.useState("");
  const [syncSaving, setSyncSaving] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState(null);

  React.useEffect(() => {
    getSystemInfo().then(setInfo).catch(() => {});
    getSettings().then((s) => setSyncLimit(String(s.sync_limit))).catch(() => {});
  }, []);

  async function saveSyncLimit() {
    const n = parseInt(syncLimit, 10);
    if (!n || n < 1) {
      setSyncMsg("Enter a number of 1 or more.");
      return;
    }
    setSyncSaving(true);
    setSyncMsg(null);
    try {
      await saveSettings({ sync_limit: n });
      setSyncMsg("Saved. The next inbox sync will use this limit.");
    } catch {
      setSyncMsg("Couldn't save. Check the backend is running.");
    } finally {
      setSyncSaving(false);
    }
  }

  const StatusRow = ({ label, sub, ok, okText, badText }) => (
    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-400 font-mono mt-0.5">{sub}</div>
      </div>
      <Badge cls={ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}>
        {ok ? okText : badText}
      </Badge>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Company profile">
        <div className="px-6 pb-6 space-y-4">
          <Field label="Company name" value={company} onChange={setCompany} />
          <Field label="Email signature" value={signature} onChange={setSignature} />
          <p className="text-xs text-slate-400">
            The signature appears at the end of generated draft replies.
          </p>
        </div>
      </Card>

      <Card title="System & integrations">
        <div className="px-6 pb-6 space-y-4">
          {!info && <div className="py-8 text-center text-sm text-slate-400">Loading…</div>}
          {info && (
            <>
              <StatusRow
                label="Local language model"
                sub={`${info.model} · ${info.model_runtime}`}
                ok={info.ollama_online}
                okText="Online" badText="Offline"
              />
              <StatusRow
                label="Gmail API"
                sub={info.gmail_authorised ? "Authorised via OAuth" : "Not authorised"}
                ok={info.gmail_authorised}
                okText="Connected" badText="Not set"
              />
              <StatusRow
                label="Database"
                sub={info.data_location}
                ok={true}
                okText="Local" badText="—"
              />
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-xs font-medium text-emerald-800 mb-1">Privacy</div>
                <p className="text-xs text-emerald-700 leading-relaxed">{info.privacy_note}</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="Inbox sync">
        <div className="px-6 pb-6 space-y-4">
          <Field label="Emails per sync" value={syncLimit} onChange={setSyncLimit} type="number" />
          <p className="text-xs text-slate-400">
            How many emails "Sync inbox" fetches from Gmail each time it runs.
          </p>
          {syncMsg && <p className="text-xs text-slate-500">{syncMsg}</p>}
          <button onClick={saveSyncLimit} disabled={syncSaving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 disabled:bg-slate-300">
            {syncSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- shell ---------------- */

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selected, setSelected] = useState(1);
  const [navOpen, setNavOpen] = useState(false);
  const [settings, setSettings] = useState({
    rate: "29.6", margin: "20", currency: "USD", validity: "30",
    freight: "350", insurance: "80", localCharges: "120", bank: "35",
  });
  const [stats, setStats] = useState(null);
  const [pendingDraftNote, setPendingDraftNote] = useState(null);
  React.useEffect(() => { getStats().then(setStats).catch(() => {}); }, [page]);
  const badges = {
    inbox: stats?.unread || 0,
    drafts: stats?.pending_drafts || 0,
  };
  const go = (p, id) => { setPage(p); if (id) setSelected(id); setNavOpen(false); };
  const title = NAV.find((n) => n.key === page)?.label ?? "";

  const body = {
    dashboard:  <Dashboard go={go} />,
    inbox:      <InboxPage go={go} />,
    ai:         <AIReview selected={selected} setSelected={setSelected} />,
    quotations: <Quotations settings={settings} go={go} setPendingDraftNote={setPendingDraftNote} />,
    drafts:     <Drafts selectedId={selected} pendingNote={pendingDraftNote}
                  clearPendingNote={() => setPendingDraftNote(null)} />,
    customers:  <Customers />,
    products:   <Products />,
    pricing:    <PriceSettings settings={settings} setSettings={setSettings} />,
    reports:    <Reports />,
    settings:   <SettingsPage />,
  }[page];

  return (
    <div className="min-h-screen bg-slate-50 flex" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {navOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col
        transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center gap-3 px-5 h-20 border-b border-white/5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 grid place-items-center shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold leading-tight">TradeQuote AI</div>
            <div className="text-slate-400 text-xs">Trade Assistant Agent</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ key, label, icon: Icon, badge }) => {
            const on = page === key;
            return (
              <button key={key} onClick={() => go(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${on ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={18} className="shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {badges[key] > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                    ${on ? "bg-white/20 text-white" : "bg-blue-600 text-white"}`}>{badges[key]}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/5 text-xs text-slate-500">
          Inbox → AI Review → Quotations → Drafts
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center px-5 lg:px-8 gap-4 shrink-0">
          <button onClick={() => setNavOpen(true)} className="lg:hidden text-slate-600"><Menu size={22} /></button>
          <h1 className="text-lg font-semibold text-slate-900 flex-1">{title}</h1>
        </header>
        <main className="flex-1 p-5 lg:p-8 overflow-x-hidden">{body}</main>
      </div>
    </div>
  );
}

