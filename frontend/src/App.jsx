import React, { useState, useMemo } from "react";
import {
  Home, Inbox, Bot, DollarSign, Send, Users, Package,
  Wallet, BarChart3, Settings as Cog, Bell, ChevronDown,
  Menu, Search, ArrowLeft, Check, Pencil, ExternalLink,
  RefreshCw, Mail, FileText, TrendingUp
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

import { getInbox, getEmail, getStats, getProducts, getQuotations, getCustomers,
         markViewed, getSettings, getFreight, saveSettings,
         getDrafts, generateDraft, saveDraft, sendDraftToGmail, recalcQuote,syncInbox } from "./api";

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

const customers = [
  { name: "ABC Trading Co.", country: "Japan",     lang: "English", industry: "Electronics", quotes: 5, last: "2026-07-20", value: 18400 },
  { name: "Sunrise Ltd.",    country: "Hong Kong", lang: "Chinese", industry: "Retail",      quotes: 3, last: "2026-07-20", value: 7200 },
  { name: "Global Tech",     country: "Korea",     lang: "English", industry: "Distribution",quotes: 8, last: "2026-07-19", value: 33100 },
  { name: "Next Step Inc.",  country: "Mexico",    lang: "Spanish", industry: "Wholesale",   quotes: 2, last: "2026-07-19", value: 5400 },
  { name: "Top Union Corp.", country: "UAE",       lang: "English", industry: "Trading",     quotes: 6, last: "2026-07-19", value: 21900 },
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

  const load = React.useCallback(() => {
    setLoading(true);
    getInbox()
      .then((d) => { setRows(d); setError(null); })
      .catch(() => setError("Can't reach the API. Is the backend running on port 8000?"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(load, [load]);
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
      {loading && !error && <div className="px-6 py-16 text-center text-sm text-slate-400">Loading…</div>}

      {!loading && !error && (
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
                    <button onClick={() => { markViewed(r.message_id); go("ai", r.message_id); }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">
                      View →
                    </button>
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

function AIReview({ selected }) {
  const [list, setList] = React.useState([]);
  const [id, setId] = React.useState(selected);
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    getInbox().then((d) => {
      setList(d);
      if (!id && d.length) setId(d[0].message_id);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!id) return;
    setBusy(true);
    getEmail(id).then(setData).catch(() => setData(null)).finally(() => setBusy(false));
  }, [id]);

  const label = (i) => i ? i.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "—";
  const tint = (i) => ({
    quotation: "bg-blue-50 text-blue-700",
    sample_request: "bg-orange-50 text-orange-700",
    delivery_followup: "bg-purple-50 text-purple-700",
    after_sales: "bg-red-50 text-red-700",
    payment: "bg-amber-50 text-amber-700",
  }[i] || "bg-slate-100 text-slate-600");

  const ex = data?.extracted;
  const q = data?.quote;

  return (
    <div className="space-y-5">
      <Card title="Analysis queue">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>From</Th><Th>Subject</Th><Th>Intent</Th><Th>Confidence</Th><Th>Status</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.message_id} onClick={() => setId(r.message_id)}
                  className={`cursor-pointer hover:bg-slate-50 ${r.message_id === id ? "bg-blue-50/50" : ""}`}>
                  <Td className="font-medium text-slate-900">{r.company}</Td>
                  <Td className="max-w-xs truncate">{r.subject}</Td>
                  <Td><Badge cls={tint(r.intent)}>{label(r.intent)}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${r.confidence || 0}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{r.confidence ?? "—"}%</span>
                    </div>
                  </Td>
                  <Td><Badge cls={r.status === "Pending" ? "bg-slate-100 text-slate-600" : "bg-green-50 text-green-700"}>{r.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Original email">
          <div className="px-6 pb-6">
            {busy && <div className="py-16 text-center text-sm text-slate-400">Loading…</div>}
            {data?.email && (
              <>
                <div className="pb-4 mb-4 border-b border-slate-100 space-y-1">
                  <div className="text-sm font-semibold text-slate-900">{data.email.subject}</div>
                  <div className="text-xs text-slate-500">
                    {data.email.sender_name} &lt;{data.email.sender_email}&gt;
                  </div>
                  <div className="text-xs text-slate-400">{data.email.received}</div>
                </div>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {data.email.body}
                </pre>
              </>
            )}
          </div>
        </Card>

        <Card title="Extraction and pricing">
          <div className="px-6 pb-6">
            {busy && <div className="py-16 text-center text-sm text-slate-400">Loading…</div>}

            {ex && (
              <div className="space-y-5">
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Detected intent</div>
                    <Badge cls={tint(ex.intent)}>{label(ex.intent)}</Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 mb-1">Confidence</div>
                    <div className="text-lg font-bold text-slate-900">{ex.confidence}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[["Company", ex.company], ["Contact", ex.contact],
                    ["Product", ex.product], ["Quantity", ex.quantity?.toLocaleString()],
                    ["Destination", ex.destination], ["Incoterm", ex.incoterm]].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-xs text-slate-400">{k}</div>
                      <div className="text-sm font-medium text-slate-900">{v ?? "—"}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">Summary</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{ex.summary}</p>
                </div>

                {q ? (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-3">
                      {q.quote_no} — matched SKU {q.sku}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[["EXW", q.exw], ["FOB", q.fob], ["CIF", q.cif]].map(([k, v]) => {
                        const active = (ex.incoterm || "CIF") === k;
                        return (
                        <div key={k} className={`rounded-lg p-4 border ${active ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                          <div className="text-xs font-semibold text-slate-500">{k}</div>
                          <div className={`text-lg font-bold mt-1 ${active ? "text-blue-700" : "text-slate-900"}`}>
                            {v.toLocaleString()}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                      {[["Unit cost", q.cost], ["Freight", q.freight],
                        ["Margin applied", `${(q.margin * 100).toFixed(0)}%`],
                        ["Unit CIF", q.unit_cif]].map(([k, v]) => (
                        <div key={k} className="flex justify-between px-3 py-2">
                          <span className="text-slate-500">{k}</span>
                          <span className="font-medium text-slate-900 tabular-nums">
                            {typeof v === "number" ? v.toLocaleString() : v}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3">
                      Extracted by {ex.model} running locally. Prices computed in Python — the model never touches the arithmetic.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    Not a quotation request, so no pricing was calculated.
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Quotations() {
  const [rows, setRows] = React.useState([]);
  const [open, setOpen] = React.useState(null);

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
    if (r.ok) setDraftMsg("Draft created. Check the Drafts page.");
    else setDraftMsg(r.error || "Failed.");
  }

  const stint = (s) => ({
    draft: "bg-slate-100 text-slate-600",
    sent: "bg-blue-50 text-blue-700",
    won: "bg-green-50 text-green-700",
    lost: "bg-red-50 text-red-700",
  }[s] || "bg-slate-100 text-slate-600");

  return (
    <div className="space-y-5">
      <Card title="Quotations">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Quote no.</Th><Th>Customer</Th><Th>Product</Th><Th>Qty</Th><Th>Destination</Th><Th>CIF</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((q) => (
                <tr key={q.quote_no}
                    className={`hover:bg-slate-50 ${open?.quote_no === q.quote_no ? "bg-blue-50/50" : ""}`}>
                  <Td className="font-mono text-xs text-slate-500">{q.quote_no}</Td>
                  <Td className="font-medium text-slate-900">{q.company}</Td>
                  <Td>{q.product}</Td>
                  <Td className="tabular-nums">{q.quantity.toLocaleString()}</Td>
                  <Td>{q.destination}</Td>
                  <Td className="tabular-nums font-medium">USD {q.cif.toLocaleString()}</Td>
                  <Td><Badge cls={stint(q.status)}>{q.status}</Badge></Td>
                  <Td>
                    <button onClick={() => setOpen(q)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700">Open</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            No quotations yet. Emails with a quotation intent generate one automatically.
          </div>
        )}
      </Card>

      {open && (
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {[["EXW", open.exw, "Ex Works"],
                ["FOB", open.fob, "Free On Board"],
                ["CIF", open.cif, `Cost, Insurance & Freight — ${open.destination}`]].map(([k, v, sub], i) => (
                <div key={k} className={`rounded-xl p-5 border ${i === 2 ? "border-blue-200 bg-blue-50" : "border-slate-200"}`}>
                  <div className="text-xs font-semibold text-slate-500">{k}</div>
                  <div className={`text-2xl font-bold mt-1 ${i === 2 ? "text-blue-700" : "text-slate-900"}`}>
                    USD {v.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Calculated in Python from Price Settings. The language model never touches the arithmetic.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Drafts() {
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [msg, setMsg] = React.useState(null);

  const load = React.useCallback(() => {
    getDrafts().then((d) => {
      setRows(d);
      if (d.length && !sel) pick(d[0]);
    }).catch(() => {});
  }, [sel]);

  React.useEffect(() => { load(); }, []);

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
      <Card title="Drafts" className="lg:col-span-1">
        <div className="divide-y divide-slate-100">
          {rows.map((d) => (
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
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400 px-6">
            No drafts yet. Generate one from a quotation in the Quotations page.
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
  return (
    <Card title="Customers">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-y border-slate-100">
            <tr><Th>Company</Th><Th>Country</Th><Th>Industry</Th><Th>Language</Th><Th>Quotations</Th><Th>Total value</Th><Th>Last contact</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c.name} className="hover:bg-slate-50 cursor-pointer">
                <Td className="font-medium text-slate-900">{c.name}</Td>
                <Td>{c.country}</Td>
                <Td>{c.industry}</Td>
                <Td>{c.lang}</Td>
                <Td>{c.quotes}</Td>
                <Td className="font-medium tabular-nums">USD {c.value.toLocaleString()}</Td>
                <Td className="text-slate-500">{c.last}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Products() {
  return (
    <Card title="Products"
      action={<button className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Add product</button>}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-y border-slate-100">
            <tr><Th>SKU</Th><Th>Product</Th><Th>Unit price</Th><Th>MOQ</Th><Th>Lead time</Th><Th>Weight</Th><Th>HS code</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.sku} className="hover:bg-slate-50">
                <Td className="font-mono text-xs text-slate-500">{p.sku}</Td>
                <Td className="font-medium text-slate-900">{p.name}</Td>
                <Td className="tabular-nums">USD {p.price.toFixed(2)}</Td>
                <Td>{p.moq.toLocaleString()} pcs</Td>
                <Td>{p.lead} days</Td>
                <Td>{p.weight} kg</Td>
                <Td className="font-mono text-xs text-slate-500">{p.hs}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 text-xs text-slate-400 border-t border-slate-100">
        The pricing service reads unit price, MOQ and weight from this table.
      </div>
    </Card>
  );
}

function PriceSettings() {
  const [v, setV] = React.useState(null);
  const [freight, setFreight] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    getSettings().then(setV).catch(() => {});
    getFreight().then(setFreight).catch(() => {});
  }, []);

  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));

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

      <Card title="Freight by destination" className="lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-y border-slate-100">
              <tr><Th>Destination</Th><Th>Port</Th><Th>Cost</Th><Th>Transit</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {freight.map((f) => (
                <tr key={f.destination} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{f.destination}</Td>
                  <Td>{f.port || "—"}</Td>
                  <Td className="tabular-nums">USD {f.cost_usd.toLocaleString()}</Td>
                  <Td className="text-slate-500">{f.transit_days ? `${f.transit_days} days` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
function Reports() {
  const byProduct = [
    { name: "USB Cable", v: 14 }, { name: "Charger", v: 11 },
    { name: "Power Bank", v: 8 }, { name: "Speaker", v: 6 }, { name: "Plastic Case", v: 4 },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat icon={FileText}   value="32"  label="Quotations"  sub="This month"      tint="bg-blue-50 text-blue-600" />
        <Stat icon={TrendingUp} value="48%" label="Win rate"    sub="+6% vs last month" tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={DollarSign} value="86k" label="Quoted value" sub="USD, this month" tint="bg-amber-50 text-amber-600" />
        <Stat icon={Bot}        value="96%" label="AI accuracy" sub="Confirmed by sales" tint="bg-violet-50 text-violet-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Most requested products">
          <div className="px-6 pb-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byProduct} margin={{ left: -20 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="v" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Inquiry volume">
          <div className="px-6 pb-6">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [v, setV] = useState({
    company: "Taiwan Electronics Co., Ltd.",
    signature: "Amy Chen / Sales Department",
    lang: "English",
    currency: "USD",
    model: "gpt-4o-mini",
  });
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Company profile">
        <div className="px-6 pb-6 space-y-4">
          <Field label="Company name" value={v.company} onChange={set("company")} />
          <Field label="Email signature" value={v.signature} onChange={set("signature")} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default language" value={v.lang} onChange={set("lang")} />
            <Field label="Default currency" value={v.currency} onChange={set("currency")} />
          </div>
        </div>
      </Card>

      <Card title="Integrations">
        <div className="px-6 pb-6 space-y-4">
          {[["Gmail API", "amy.chen@company.com", true],
            ["OpenAI API", "sk-••••••••••••••4a9f", true],
            ["SMTP relay", "Not configured", false]].map(([k, val, ok]) => (
            <div key={k} className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
              <div>
                <div className="text-sm font-medium text-slate-900">{k}</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{val}</div>
              </div>
              <Badge cls={ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}>
                {ok ? "Connected" : "Not set"}
              </Badge>
            </div>
          ))}
          <Field label="Analysis model" value={v.model} onChange={set("model")} />
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
    quotations: <Quotations settings={settings} />,
    drafts:     <Drafts />,
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
          <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200">
            <div className="w-9 h-9 rounded-full bg-slate-200 grid place-items-center text-slate-500 text-sm font-semibold">A</div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-900 leading-tight">Amy Chen</div>
              <div className="text-xs text-slate-400">Sales</div>
            </div>
            <ChevronDown size={16} className="text-slate-400 hidden sm:block" />
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8 overflow-x-hidden">{body}</main>
      </div>
    </div>
  );
}

