const API = globalThis.AI_HUB_API ?? "http://127.0.0.1:8787";

const chainNames = new Map([
  [8453, "Base"],
  [84532, "Base Sepolia"],
  [11155111, "Ethereum Sepolia"],
  [763373, "Ink Sepolia"],
  [421614, "Arbitrum Sepolia"],
  [11155420, "Optimism Sepolia"],
  [97, "BNB Testnet"],
  [43113, "Avalanche Fuji"],
  [80002, "Polygon Amoy"],
  [9746, "Plasma Testnet"],
  [5042002, "Arc Testnet"],
  [42431, "Tempo Testnet (Moderato)"],
]);

let projects = [];
let filter = "all";
let selected = null;
let walletAddress = null;
let walletChainId = null;

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function normalizeProject(project) {
  const opportunity = project.opportunity ?? {};
  const intelligence = project.intelligence ?? {};
  return {
    ...project,
    ...opportunity,
    projectStatus: project.status,
    score: intelligence.total ?? opportunity.score ?? 0,
    confidence: intelligence.confidence ?? opportunity.confidence ?? 0,
    rewardPotential: intelligence.rewardPotential ?? opportunity.signals?.rewardSignals ?? 0,
    risk: intelligence.risk ?? 0,
    effort: intelligence.effort ?? 0,
    freshness: intelligence.freshness ?? 0,
    reasons: intelligence.reasons ?? opportunity.reasons ?? [],
    tasks: project.tasks ?? [],
  };
}

async function loadProjects() {
  const data = await api("/projects");
  projects = (data.projects ?? []).map(normalizeProject);
  setApiStatus(true, `${projects.length} project(s) stored`);
  render();
}

async function scan() {
  const button = $("#scan");
  button.disabled = true;
  button.textContent = "Scanning…";
  try {
    const result = await api("/scan", { method: "POST", body: "{}" });
    await loadProjects();
    await refreshQueue();
    toast(`Scan complete — ${result.storedProjects ?? 0} project(s) updated`);
  } catch (error) {
    setApiStatus(false, error.message);
    toast(`Scan failed: ${error.message}`, "error");
    console.warn(error);
  } finally {
    button.textContent = "Scan opportunities";
    button.disabled = false;
  }
}

function render() {
  const chain = $("#chain").value;
  const visible = projects.filter((project) => {
    if (filter === "high" && project.score < 85) return false;
    if (filter === "approval" && !project.tasks.some((task) => taskDecision(task) === "approval")) return false;
    if (chain !== "All networks" && chainNames.get(project.chainId) !== chain) return false;
    return project.projectStatus !== "archived";
  });

  $("#opportunity-list").innerHTML = visible.map((project) => {
    const approvals = project.tasks.filter((task) => taskDecision(task) === "approval").length;
    const autonomous = project.tasks.filter((task) => taskDecision(task) === "autonomous").length;
    const completed = project.tasks.filter((task) => task.status === "completed").length;
    const stage = String(project.stage ?? "research").replaceAll("-", " ");
    return `
      <article class="opportunity">
        <div class="opportunity-main">
          <div class="title-row">
            <h3>${escapeHtml(project.name)}</h3>
            <span class="badge">${escapeHtml(chainNames.get(project.chainId) ?? String(project.chainId ?? project.vm ?? "Unknown"))}</span>
            <span class="stage">${escapeHtml(stage)}</span>
          </div>
          <div class="meta">${project.tasks.length} tasks · ${completed} completed · ${autonomous} autonomous · ${approvals} approval</div>
          <div class="tasks">${project.tasks.slice(0, 6).map((task) => {
            const mode = taskDecision(task);
            return `<span class="task ${mode === "approval" ? "approval" : "ready"}"><span class="task-dot"></span>${escapeHtml(task.title)}</span>`;
          }).join("")}${project.tasks.length > 6 ? `<span class="task more">+${project.tasks.length - 6} more</span>` : ""}</div>
          <div class="reasons">
            <span>• Project status: ${escapeHtml(project.projectStatus)}</span>
            <span>• Reward signal: ${project.rewardPotential}/100</span>
            ${(project.reasons ?? []).slice(0, 2).map((reason) => `<span>• ${escapeHtml(reason)}</span>`).join("")}
          </div>
        </div>
        <div class="opportunity-side">
          <div class="score">${Math.round(project.score)}<small>/ 100</small></div>
          <div class="score-bar"><span style="width:${Math.max(0, Math.min(100, project.score))}%"></span></div>
          <div class="side-meta">confidence ${formatConfidence(project.confidence)}</div>
          <button class="button secondary" data-open="${escapeAttr(project.id)}">View tasks</button>
        </div>
      </article>`;
  }).join("") || `<div class="empty"><strong>No stored opportunities</strong><span>Run a scan to discover projects.</span></div>`;

  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => showTasks(button.dataset.open)));
  renderStats();
}

function renderStats() {
  const tasks = projects.flatMap((project) => project.tasks);
  $("#opportunities").textContent = projects.length;
  $("#high-score").textContent = projects.filter((project) => project.score >= 85).length;
  $("#tasks").textContent = tasks.filter((task) => task.status !== "completed" && taskDecision(task) === "autonomous").length;
  $("#approval").textContent = tasks.filter((task) => task.status !== "completed" && taskDecision(task) === "approval").length;
}

function taskDecision(task) {
  if (!task.automated) return "manual";
  if (task.kind === "social") return "manual";
  if (task.risk === "high" || task.requiresUserApproval || task.requiresWallet || task.requiresGas) return "approval";
  if (["check-in", "verify", "community"].includes(task.kind)) return "autonomous";
  return "approval";
}

function showTasks(id) {
  selected = projects.find((project) => project.id === id);
  if (!selected) return;
  $("#dialog-title").textContent = selected.name;
  $("#dialog-summary").innerHTML = `
    <div><span>Score</span><strong>${Math.round(selected.score)}/100</strong></div>
    <div><span>Confidence</span><strong>${formatConfidence(selected.confidence)}</strong></div>
    <div><span>Reward signal</span><strong>${selected.rewardPotential}/100</strong></div>
    <div><span>Status</span><strong>${escapeHtml(selected.projectStatus)}</strong></div>
    <div><span>Tasks</span><strong>${selected.tasks.length}</strong></div>`;
  $("#dialog-tasks").innerHTML = selected.tasks.map((task) => taskCard(selected, task)).join("") || `<div class="empty"><span>No tasks extracted.</span></div>`;
  bindTaskButtons();
  const dialog = $("#task-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function taskCard(project, task) {
  const mode = taskDecision(task);
  const label = mode === "autonomous" ? "Agent can execute" : mode === "approval" ? "Approval required" : "Manual";
  const actions = task.status === "completed" || task.status === "skipped" ? "" : mode === "approval"
    ? `<button class="button compact primary" data-approve-project="${escapeAttr(project.id)}" data-approve-task="${escapeAttr(task.id)}">Approve</button><button class="button compact secondary" data-skip-project="${escapeAttr(project.id)}" data-skip-task="${escapeAttr(task.id)}">Skip</button>`
    : mode === "manual" ? `<button class="button compact secondary" data-skip-project="${escapeAttr(project.id)}" data-skip-task="${escapeAttr(task.id)}">Mark skipped</button>` : "";
  return `
    <article class="task-card">
      <div class="task-card-head">
        <div><h3>${escapeHtml(task.title)}</h3><span class="task-kind">${escapeHtml(task.kind)} · ${escapeHtml(label)} · ${escapeHtml(task.status)}</span></div>
        <span class="risk ${escapeAttr(task.risk)}">${escapeHtml(task.risk)} risk</span>
      </div>
      <p>${escapeHtml(task.description ?? "")}</p>
      <div class="task-flags">
        ${task.requiresWallet ? "<span>Wallet</span>" : ""}
        ${task.requiresGas ? "<span>Gas</span>" : ""}
        ${mode === "autonomous" ? '<span class="ready-flag">Autonomous</span>' : ""}
        ${mode === "approval" ? '<span class="approval-flag">Approval gate</span>' : ""}
      </div>
      ${task.txHashes?.length ? `<small class="source">Tx: ${escapeHtml(task.txHashes.at(-1))}</small>` : ""}
      ${task.source ? `<small class="source">Source: ${escapeHtml(task.source)}</small>` : ""}
      <div class="panel-actions">${actions}</div>
    </article>`;
}

async function refreshQueue() {
  try {
    const [autonomous, approval, manual] = await Promise.all([
      api("/tasks?mode=autonomous"),
      api("/tasks?mode=approval"),
      api("/tasks?mode=manual"),
    ]);
    renderQueue(autonomous.tasks ?? [], approval.tasks ?? [], manual.tasks ?? []);
  } catch (error) {
    $("#queue").innerHTML = `<div class="queue-offline"><strong>Drop Hunter API offline</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function renderQueue(autonomous, approval, manual) {
  $("#queue").innerHTML = `
    <div class="queue-summary">
      <span class="queue-item done"><i></i>${autonomous.length} autonomous</span>
      <span class="queue-item waiting"><i></i>${approval.length} awaiting approval</span>
      <span class="queue-item cancelled"><i></i>${manual.length} manual</span>
    </div>
    <div class="job-list">${[...approval, ...autonomous, ...manual].slice(0, 15).map((item) => {
      const mode = item.automation?.mode ?? "manual";
      return `<div class="job-row">
        <div class="job-icon">${escapeHtml(String(item.task.kind ?? "T").slice(0, 1).toUpperCase())}</div>
        <span class="job-info"><strong>${escapeHtml(item.projectName)}</strong><small>${escapeHtml(item.task.title)} · ${escapeHtml(mode)}</small></span>
        <span class="badge">${escapeHtml(item.task.status)}</span>
        ${mode === "approval" ? `<button class="button compact secondary" data-approve-project="${escapeAttr(item.projectId)}" data-approve-task="${escapeAttr(item.task.id)}">Approve</button>` : ""}
      </div>`;
    }).join("") || `<div class="empty compact-empty"><span>No pending tasks.</span></div>`}</div>`;
  bindTaskButtons();
}

function bindTaskButtons() {
  document.querySelectorAll("[data-approve-task]").forEach((button) => button.addEventListener("click", async () => {
    await taskAction(button.dataset.approveProject, button.dataset.approveTask, "approve");
  }));
  document.querySelectorAll("[data-skip-task]").forEach((button) => button.addEventListener("click", async () => {
    await taskAction(button.dataset.skipProject, button.dataset.skipTask, "skip");
  }));
}

async function taskAction(projectId, taskId, action) {
  try {
    await api(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/${action}`, { method: "POST", body: "{}" });
    toast(action === "approve" ? "Task approved" : "Task skipped");
    await loadProjects();
    await refreshQueue();
    if (selected?.id === projectId && $("#task-dialog").open) showTasks(projectId);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function connectWallet() {
  if (!globalThis.ethereum?.request) {
    toast("No EIP-1193 browser wallet detected", "warning");
    return;
  }
  try {
    const accounts = await globalThis.ethereum.request({ method: "eth_requestAccounts" });
    walletAddress = accounts[0] ?? null;
    const chainHex = await globalThis.ethereum.request({ method: "eth_chainId" });
    walletChainId = Number.parseInt(chainHex, 16);
    updateWalletButton();
    updateNetworkLabel();
    toast("Wallet connected");
  } catch (error) {
    toast("Wallet connection was cancelled", "warning");
    console.warn(error);
  }
}

function updateWalletButton() {
  const button = $("#connect");
  button.textContent = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Connect wallet";
  button.classList.toggle("connected", Boolean(walletAddress));
}

function updateNetworkLabel() {
  if (walletChainId) $("#network-label").textContent = chainNames.get(walletChainId) ?? `Chain ${walletChainId}`;
}

function setApiStatus(connected, title) {
  const status = $("#api-status");
  status.textContent = connected ? "API connected" : "API offline";
  status.className = `badge ${connected ? "api-ok" : "api-offline"}`;
  status.title = title ?? "";
}

function formatConfidence(value) {
  if (value === undefined || value === null) return "—";
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
}

function toast(message, kind = "success") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast visible ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 2800);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  filter = tab.dataset.filter;
  render();
});

$("#chain").addEventListener("change", render);
$("#scan").addEventListener("click", scan);
$("#plan").addEventListener("click", refreshQueue);
$("#refresh-jobs").addEventListener("click", refreshQueue);
$("#connect").addEventListener("click", connectWallet);
$("#dialog-close").addEventListener("click", () => $("#task-dialog").close());
$("#task-dialog").addEventListener("click", (event) => { if (event.target === $("#task-dialog")) $("#task-dialog").close(); });

if (globalThis.ethereum?.on) {
  globalThis.ethereum.on("accountsChanged", (accounts) => { walletAddress = accounts[0] ?? null; updateWalletButton(); });
  globalThis.ethereum.on("chainChanged", (chainHex) => { walletChainId = Number.parseInt(chainHex, 16); updateNetworkLabel(); });
}

try {
  await loadProjects();
  await refreshQueue();
} catch (error) {
  setApiStatus(false, error.message);
  render();
  await refreshQueue();
}
setInterval(refreshQueue, 10000);
