const BASE = "http://localhost:8000/api";

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
}

export const getInbox      = () => get("/inbox");
export const getEmail      = (id) => get(`/inbox/${id}`);
export const getStats      = () => get("/stats");
export const getProducts   = () => get("/products");
export const getQuotations = () => get("/quotations");
export const getCustomers  = () => get("/customers");
export const getCustomer   = (id) => get(`/customers/${id}`);
export const markViewed = (id) =>
  fetch(`${BASE}/inbox/${id}/viewed`, { method: "POST" });

export const getSettings = () => get("/settings");
export const getFreight  = () => get("/freight");

export async function saveSettings(payload) {
  const r = await fetch(`${BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("Save failed");
  return r.json();
}

export const getDrafts = () => get("/drafts");

export async function generateDraft(quoteNo) {
  const r = await fetch(`${BASE}/quotations/${quoteNo}/draft`, { method: "POST" });
  return r.json();
}

export async function saveDraft(id, subject, body) {
  const r = await fetch(`${BASE}/drafts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, body }),
  });
  return r.json();
}

export async function sendDraftToGmail(id) {
  const r = await fetch(`${BASE}/drafts/${id}/send-to-gmail`, { method: "POST" });
  return r.json();
}
export async function recalcQuote(quoteNo) {
  const r = await fetch(`${BASE}/quotations/${quoteNo}/recalculate`, { method: "POST" });
  return r.json();
}

export async function syncInbox() {
  const r = await fetch(`${BASE}/inbox/sync`, { method: "POST" });
  return r.json();
}

export const getReports = () => get("/reports");

export const getSystemInfo = () => get("/system-info");

export async function quoteFromEmail(messageId) {
  const r = await fetch(`${BASE}/inbox/${messageId}/quote`, { method: "POST" });
  return r.json();
}

export async function draftFromEmail(messageId) {
  const r = await fetch(`${BASE}/inbox/${messageId}/draft`, { method: "POST" });
  return r.json();
}
export async function regenerateDraft(draftId) {
  const r = await fetch(`${BASE}/drafts/${draftId}/regenerate`, { method: "POST" });
  return r.json();
}
export const getInboxArchived = () => get("/inbox?archived=true");

export async function replyFromEmail(messageId, mode = "template") {
  const r = await fetch(`${BASE}/inbox/${messageId}/reply?mode=${mode}`, { method: "POST" });
  return r.json();
}

export async function archiveEmail(messageId) {
  const r = await fetch(`${BASE}/inbox/${messageId}/archive`, { method: "POST" });
  return r.json();
}

export async function unarchiveEmail(messageId) {
  const r = await fetch(`${BASE}/inbox/${messageId}/unarchive`, { method: "POST" });
  return r.json();
}

export const getIrrelevant = () => get("/irrelevant");

export async function purgeIrrelevant() {
  const r = await fetch(`${BASE}/irrelevant/purge`, { method: "POST" });
  return r.json();
}


export async function keepEmail(messageId) {
  const r = await fetch(`${BASE}/inbox/${messageId}/keep`, { method: "POST" });
  return r.json();
}