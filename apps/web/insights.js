const API = globalThis.AI_HUB_API ?? "http://127.0.0.1:8787";

const $ = (selector) => document.querySelector(selector);

async function api(path) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function refreshInsights() {
  const results = await Promise.allSettled([
    api("/chains"),
    api("/sources"),
    api("/attention"),
    api("/history?limit=20"),
    api("/learning"),
  ]);

  renderNetworks(valueOf(results[0])?.chains ?? []);
  renderSources(valueOf(results[1])?.sources ?? []);
  renderAttention(valueOf(results[2])?.items ?? []);
  renderHistory(valueOf(results[3])?.records ?? []);
  renderLearning(valueOf(results[4])?.signals ?? {});
}

function renderNetworks(chains) {
  const node = $("#network-readiness");
  if (!node) return;
  const configured = chains.filter((chain) => chain.rpcConfigured).length;
  node.innerHTML = `
    <div class="queue-summary">
      <span class="queue-item done"><i></i>${configured}/${chains.length} RPC configured</span>
      <span class="queue-item waiting"><i></i>${chains.filter((chain) => chain.enabled).length} enabled</span>
    </div>
    <div class="job-list">${chains.map((chain) => `
      <div class="job-row">
        <div class="job-icon">${escapeHtml(String(chain.name ?? "?").slice(0, 1).toUpperCase())}</div>
        <span class="job-info"><strong>${escapeHtml(chain.name)}</strong><small>${escapeHtml(chain.kind)} · chain ${escapeHtml(chain.chainId ?? "n/a")}</small></span>
        <span class="badge ${chain.rpcConfigured ? "api-ok" : "api-offline"}">${chain.rpcConfigured ? "RPC configured" : "RPC missing"}</span>
      </div>`).join("") || empty("No chain configuration found.")}</div>`;
}

function renderSources(sources) {
  const node = $("#source-health");
  if (!node) return;
  node.innerHTML = `
    <div class="job-list">${sources.map((source) => {
      const state = source.disabled ? "disabled" : source.consecutiveFailures > 0 ? "degraded" : "healthy";
      return `<div class="job-row">
        <div class="job-icon">S</div>
        <span class="job-info"><strong>${escapeHtml(source.sourceName)}</strong><small>${source.totalSuccesses} success · ${source.totalFailures} failure</small></span>
        <span class="badge ${state === "healthy" ? "api-ok" : "api-offline"}">${escapeHtml(state)}</span>
      </div>`;
    }).join("") || empty("No discovery sources registered.")}</div>`;
}

function renderAttention(items) {
  const node = $("#attention-queue");
  if (!node) return;
  node.innerHTML = `<div class="job-list">${items.slice(0, 20).map((item) => `
    <div class="job-row">
      <div class="job-icon">!</div>
      <span class="job-info"><strong>${escapeHtml(item.projectName)}</strong><small>${escapeHtml(item.taskTitle)} · ${escapeHtml(item.summary)}</small></span>
      <span class="badge">${escapeHtml(item.severity)} · ${escapeHtml(item.reason)}</span>
    </div>`).join("") || empty("Nothing currently needs your attention.")}</div>`;
}

function renderHistory(records) {
  const node = $("#history-list");
  if (!node) return;
  node.innerHTML = `<div class="job-list">${records.map((record) => `
    <div class="job-row">
      <div class="job-icon">${record.outcome === "success" ? "✓" : record.outcome === "failed" ? "×" : "·"}</div>
      <span class="job-info"><strong>${escapeHtml(record.projectId)}</strong><small>${escapeHtml(record.taskKind)} · ${escapeHtml(record.outcome)} · ${formatDate(record.timestamp)}</small></span>
      <span class="badge">${escapeHtml(record.rewardOutcome ?? "unknown")}</span>
    </div>`).join("") || empty("No execution evidence recorded yet.")}</div>`;
}

function renderLearning(signals) {
  const node = $("#learning-summary");
  if (!node) return;
  const taskRates = Object.entries(signals.taskKindSuccessRate ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sourceRates = Object.entries(signals.sourceSuccessRate ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  node.innerHTML = `
    <div class="queue-summary">
      <span class="queue-item done"><i></i>${signals.totalRecords ?? 0} evidence records</span>
      <span class="queue-item waiting"><i></i>${signals.rewardedRecords ?? 0} rewarded</span>
    </div>
    <div class="job-list">
      ${taskRates.map(([kind, rate]) => rateRow(`Task: ${kind}`, rate)).join("")}
      ${sourceRates.map(([source, rate]) => rateRow(`Source: ${source}`, rate)).join("")}
      ${taskRates.length === 0 && sourceRates.length === 0 ? empty("Learning starts after execution evidence is recorded.") : ""}
    </div>`;
}

function rateRow(label, rate) {
  return `<div class="job-row"><div class="job-icon">L</div><span class="job-info"><strong>${escapeHtml(label)}</strong><small>Observed success rate</small></span><span class="badge">${Math.round(Number(rate) * 100)}%</span></div>`;
}

function valueOf(result) {
  return result.status === "fulfilled" ? result.value : undefined;
}

function empty(message) {
  return `<div class="empty compact-empty"><span>${escapeHtml(message)}</span></div>`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

await refreshInsights();
setInterval(refreshInsights, 15000);
