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
    api("/approvals"),
    api("/history?limit=20"),
    api("/learning"),
    api("/agent/status"),
  ]);

  renderNetworks(valueOf(results[0])?.chains ?? []);
  renderSources(valueOf(results[1])?.sources ?? []);
  renderAttention(valueOf(results[2])?.items ?? []);
  renderApprovals(valueOf(results[3])?.requests ?? []);
  renderHistory(valueOf(results[4])?.records ?? []);
  renderLearning(valueOf(results[5])?.signals ?? {});
  renderAgentStatus(valueOf(results[6]) ?? {});
}

function renderAgentStatus(data) {
  const node = $("#agent-runtime-status");
  if (!node) return;
  const status = data.status;
  const state = data.online ? status?.state ?? "idle" : data.configured ? "offline" : "disabled";
  const result = status?.lastResult;
  node.innerHTML = `<div class="queue-summary">
    <span class="queue-item ${data.online ? "done" : "waiting"}"><i></i>Agent ${escapeHtml(state)}</span>
    <span class="queue-item"><i></i>${number(result?.completed)} completed last cycle</span>
    <span class="queue-item"><i></i>${number(result?.failed)} failed last cycle</span>
    <span class="queue-item"><i></i>${number(status?.trustedCheckIns)} trusted check-ins</span>
  </div>${status?.lastError ? `<div class="queue-offline"><strong>Last agent error</strong><span>${escapeHtml(status.lastError)}</span></div>` : ""}`;
}

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

function renderApprovals(requests) {
  const node = $("#approval-inbox");
  if (!node) return;
  node.innerHTML = `<div class="job-list">${requests.map((request) => `
    <div class="job-row approval-request">
      <div class="job-icon">A</div>
      <span class="job-info">
        <strong>${escapeHtml(request.projectName)} — ${escapeHtml(request.taskTitle)}</strong>
        <small>${escapeHtml(chainLabel(request.chainId))} · ${escapeHtml(request.taskKind)} · ${escapeHtml(request.risk)} risk · ${costLabel(request)}</small>
        <small>${escapeHtml(request.reasons?.join(" · ") || "Explicit approval required")}${request.rewardHint ? ` · Potential: ${escapeHtml(request.rewardHint)}` : ""}</small>
      </span>
      <button class="button compact primary" data-approve-project="${escapeAttr(request.projectId)}" data-approve-task="${escapeAttr(request.taskId)}">Approve</button>
      <button class="button compact secondary" data-skip-project="${escapeAttr(request.projectId)}" data-skip-task="${escapeAttr(request.taskId)}">Skip</button>
      <button class="button compact secondary" data-open="${escapeAttr(request.projectId)}">Details</button>
    </div>`).join("") || empty("No actions are waiting for approval.")}</div>`;
  node.querySelectorAll("[data-approve-task]").forEach((button) => button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("drop-hunter:task-action", { detail: { projectId: button.dataset.approveProject, taskId: button.dataset.approveTask, action: "approve" } }));
  }));
  node.querySelectorAll("[data-skip-task]").forEach((button) => button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("drop-hunter:task-action", { detail: { projectId: button.dataset.skipProject, taskId: button.dataset.skipTask, action: "skip" } }));
  }));
  node.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("drop-hunter:open-project", { detail: { projectId: button.dataset.open } }));
  }));
}

function chainLabel(chainId) { return chainId ? `Chain ${chainId}` : "Chain not identified"; }
function costLabel(request) {
  if (Number.isFinite(Number(request.estimatedCostUsd))) return `estimated $${Number(request.estimatedCostUsd).toFixed(2)}`;
  return request.requiresFunds ? "funds/gas required" : "no funds required";
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
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

await refreshInsights();
setInterval(refreshInsights, 15000);
