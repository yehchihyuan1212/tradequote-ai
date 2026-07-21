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