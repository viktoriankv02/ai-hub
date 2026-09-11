const API = globalThis.AI_HUB_REWARD_API ?? "http://127.0.0.1:8788";
const $ = (selector) => document.querySelector(selector);
let requestToken = 0;

async function api(path) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function loadOverview(projectId) {
  const root = $("#dialog-overview");
  if (!root) return;
  const token = ++requestToken;
  root.innerHTML = `<div class="queue-offline"><span>Loading project evidence and rewards…</span></div>`;
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/overview`);
    if (token !== requestToken) return;
    renderOverview(data.overview);
  } catch (error) {
    if (token !== requestToken) return;
    root.innerHTML = `<div class="queue-offline"><strong>Overview unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function renderOverview(overview) {
  const root = $("#dialog-overview");
  if (!root || !overview) return;
  const progress = overview.progress ?? {};
  const rewards = overview.rewardSummary ?? {};
  const evidence = overview.evidence ?? [];
  const attention = overview.attention ?? [];
  const learning = overview.learning ?? {};
  root.innerHTML = `
    <div class="overview-grid">
      <div><span>Progress</span><strong>${number(progress.completed)}/${number(progress.total)} · ${number(progress.percent)}%</strong></div>
      <div><span>Evidence</span><strong>${evidence.length}</strong></div>
      <div><span>Claimable rewards</span><strong>${number(rewards.claimable)}</strong></div>
      <div><span>Confirmed value</span><strong>${money(rewards.confirmedUsd)}</strong></div>
      <div><span>Needs attention</span><strong>${attention.length}</strong></div>
      <div><span>Learning samples</span><strong>${number(learning.totalRecords)}</strong></div>
    </div>
    ${attention.length ? `<div class="overview-section"><strong>Attention</strong>${attention.slice(0, 4).map((item) => `<span>• ${escapeHtml(item.taskTitle)} — ${escapeHtml(item.reasons?.[0] ?? item.kind)}</span>`).join("")}</div>` : ""}
    ${evidence.length ? `<div class="overview-section"><strong>Recent evidence</strong>${evidence.slice(0, 4).map((record) => `<span>• ${escapeHtml(record.taskKind)} — ${escapeHtml(record.outcome)} · ${escapeHtml(formatDate(record.timestamp))}</span>`).join("")}</div>` : ""}`;
}

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function money(value) { return `$${Number(value ?? 0).toFixed(2)}`; }
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-open]");
  if (button?.dataset.open) void loadOverview(button.dataset.open);
});
