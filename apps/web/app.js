const API = globalThis.AI_HUB_API ?? "http://127.0.0.1:8787";

const fallbackOpportunities = [
  { id:"ink-sepolia", name:"Ink Sepolia", chainId:763373, score:94, confidence:82, rewardPotential:70, risk:35, effort:40, freshness:96, stage:"testnet", tasks:[{id:"demo-deploy-erc20",title:"Deploy ERC20",description:"Deploy a documented ERC20 contract on the test network.",kind:"deploy",risk:"medium",automated:false,requiresWallet:true,requiresGas:true,requiresUserApproval:true},{id:"demo-deploy-nft",title:"Deploy NFT",description:"Deploy a documented NFT contract on the test network.",kind:"deploy",risk:"medium",automated:false,requiresWallet:true,requiresGas:true,requiresUserApproval:true},{id:"demo-verify",title:"Verify contract",description:"Verify deployment evidence and contract metadata.",kind:"verify",risk:"low",automated:true,requiresWallet:false,requiresGas:false,requiresUserApproval:false}] },
  { id:"base-sepolia", name:"Base Sepolia", chainId:84532, score:89, confidence:78, rewardPotential:65, risk:42, effort:46, freshness:91, stage:"testnet", tasks:[{id:"demo-core",title:"Deploy core",description:"Deploy the documented core contract set.",kind:"deploy",risk:"medium",automated:false,requiresWallet:true,requiresGas:true,requiresUserApproval:true},{id:"demo-adapter",title:"Deploy EVM adapter",description:"Deploy the trusted EVM adapter configuration.",kind:"deploy",risk:"medium",automated:false,requiresWallet:true,requiresGas:true,requiresUserApproval:true},{id:"demo-record",title:"Record verified activity",description:"Record completion evidence after the transaction succeeds.",kind:"other",risk:"medium",automated:true,requiresWallet:true,requiresGas:false,requiresUserApproval:true}] },
];

const chainNames = new Map([[763373,"Ink Sepolia"],[84532,"Base Sepolia"],[11155111,"Ethereum Sepolia"],[9746,"Plasma Testnet"],[5042002,"Arc Testnet"],[42431,"Tempo Testnet (Moderato)"]]);
const riskRank = { low: 1, medium: 2, high: 3 };
let opportunities = [];
let filter = "all";
let selected = null;
let walletAddress = null;
let walletChainId = null;

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers ?? {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function normalizeReport(report) {
  return (report.results ?? []).map((result) => ({
    ...result.opportunity,
    score: result.score.total,
    confidence: result.score.confidence,
    rewardPotential: result.score.rewardPotential,
    risk: result.score.risk,
    effort: result.score.effort,
    freshness: result.score.freshness,
    tasks: result.tasks ?? [],
    warnings: result.warnings ?? [],
    reasons: result.score.reasons ?? [],
  }));
}

function renderStats() {
  const allTasks = opportunities.flatMap((o) => o.tasks);
  $("#opportunities").textContent = opportunities.length;
  $("#high-score").textContent = opportunities.filter((o) => o.score >= 85).length;
  $("#tasks").textContent = allTasks.filter((t) => t.automated !== false).length;
  $("#approval").textContent = allTasks.filter((t) => t.requiresUserApproval).length;
}

function render() {
  const chain = $("#chain").value;
  const visible = opportunities.filter((o) => {
    if (filter === "high" && o.score < 85) return false;
    if (filter === "approval" && !o.tasks.some((t) => t.requiresUserApproval)) return false;
    if (chain !== "All networks" && chainNames.get(o.chainId) !== chain) return false;
    return true;
  });

  $("#opportunity-list").innerHTML = visible.map((o) => {
    const topReasons = (o.reasons ?? []).slice(0, 3);
    const approvalCount = o.tasks.filter((t) => t.requiresUserApproval).length;
    const stage = String(o.stage ?? "research").replaceAll("-", " ");
    return `
      <article class="opportunity">
        <div class="opportunity-main">
          <div class="title-row"><h3>${escapeHtml(o.name)}</h3><span class="badge">${escapeHtml(chainNames.get(o.chainId) ?? String(o.chainId ?? "Unknown"))}</span><span class="stage">${escapeHtml(stage)}</span></div>
          <div class="meta">${o.tasks.length} task${o.tasks.length === 1 ? "" : "s"} · confidence ${o.confidence ?? "—"}/100 · reward signal ${o.rewardPotential ?? 0}/100 · risk ${o.risk ?? "—"}/100</div>
          <div class="tasks">${o.tasks.slice(0, 5).map((t) => `<span class="task ${t.requiresUserApproval ? "approval" : "ready"}"><span class="task-dot"></span>${escapeHtml(t.title)}</span>`).join("")}${o.tasks.length > 5 ? `<span class="task more">+${o.tasks.length - 5} more</span>` : ""}</div>
          ${topReasons.length ? `<div class="reasons">${topReasons.map((reason) => `<span>• ${escapeHtml(reason)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="opportunity-side">
          <div class="score">${o.score}<small>/ 100</small></div>
          <div class="score-bar"><span style="width:${Math.max(0, Math.min(100, o.score))}%"></span></div>
          <div class="side-meta">${approvalCount ? `${approvalCount} approval${approvalCount === 1 ? "" : "s"} required` : "No approval required"}</div>
          <button class="button secondary" data-open="${escapeAttr(o.id)}">View tasks</button>
        </div>
      </article>`;
  }).join("") || `<div class="empty"><strong>No opportunities</strong><span>Try another filter or run a fresh scan.</span></div>`;

  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => showTasks(button.dataset.open)));
  renderStats();
}

function showTasks(id) {
  selected = opportunities.find((o) => o.id === id);
  if (!selected) return;
  $("#dialog-title").textContent = selected.name;
  $("#dialog-summary").innerHTML = `
    <div><span>Score</span><strong>${selected.score}/100</strong></div>
    <div><span>Confidence</span><strong>${selected.confidence ?? "—"}/100</strong></div>
    <div><span>Risk</span><strong>${selected.risk ?? "—"}/100</strong></div>
    <div><span>Tasks</span><strong>${selected.tasks.length}</strong></div>`;
  $("#dialog-tasks").innerHTML = selected.tasks.map((task) => `
    <article class="task-card">
      <div class="task-card-head"><div><h3>${escapeHtml(task.title)}</h3><span class="task-kind">${escapeHtml(task.kind ?? "other")}</span></div><span class="risk ${escapeAttr(task.risk ?? "medium")}">${escapeHtml(task.risk ?? "unknown")} risk</span></div>
      <p>${escapeHtml(task.description ?? "No task description supplied.")}</p>
      <div class="task-flags">
        ${task.requiresWallet ? `<span>Wallet</span>` : ""}${task.requiresGas ? `<span>Gas</span>` : ""}${task.requiresUserApproval ? `<span class="approval-flag">User approval</span>` : `<span class="ready-flag">Ready</span>`}
      </div>
      ${task.source ? `<small class="source">Source: ${escapeHtml(task.source)}</small>` : ""}
    </article>`).join("") || `<div class="empty"><span>No tasks extracted.</span></div>`;
  const dialog = $("#task-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
}

async function scan() {
  const button = $("#scan");
  button.disabled = true;
  button.textContent = "Scanning…";
  try {
    const report = await api("/opportunities");
    opportunities = normalizeReport(report);
    setApiStatus(true, `${report.successfulSources?.length ?? 0} source(s) succeeded`);
    render();
    toast(`Scan complete — ${opportunities.length} opportunities found`);
  } catch (error) {
    if (!opportunities.length) opportunities = fallbackOpportunities;
    setApiStatus(false, "Using local demo data");
    render();
    toast("API unavailable — showing demo data", "warning");
    console.warn(error);
  } finally {
    setTimeout(() => { button.textContent = "Scan opportunities"; button.disabled = false; }, 700);
  }
}

async function planJobs() {
  const button = $("#plan");
  button.disabled = true;
  button.textContent = "Preparing…";
  try {
    const result = await api("/opportunities/plan", { method: "POST", body: JSON.stringify({ agentId: "1", reward: "0", minimumScore: 30, includeApprovalRequired: true }) });
    button.textContent = `${result.jobs.length} jobs prepared`;
    toast(`${result.jobs.length} AI jobs added to the queue`);
    await refreshJobs();
  } catch (error) {
    button.textContent = "Planning failed";
    toast("Could not prepare jobs", "error");
    console.warn(error);
  } finally {
    setTimeout(() => { button.textContent = "Prepare eligible tasks"; button.disabled = false; }, 1000);
  }
}

async function refreshJobs() {
  try {
    const data = await api("/jobs");
    renderJobs(data.jobs ?? []);
  } catch (error) {
    $("#queue").innerHTML = `<div class="queue-offline"><strong>Control plane offline</strong><span>Start the AI job server to manage the execution queue.</span></div>`;
    console.warn(error);
  }
}

function renderJobs(jobs) {
  const counts = jobs.reduce((acc, job) => { acc[job.status] = (acc[job.status] ?? 0) + 1; return acc; }, {});
  $("#queue").innerHTML = `
    <div class="queue-summary">
      <span class="queue-item done"><i></i>${counts.completed ?? 0} completed</span>
      <span class="queue-item running"><i></i>${counts.running ?? 0} running</span>
      <span class="queue-item waiting"><i></i>${counts.queued ?? 0} queued</span>
      <span class="queue-item cancelled"><i></i>${counts.cancelled ?? 0} cancelled</span>
    </div>
    <div class="job-list">${jobs.length ? jobs.slice(-10).reverse().map((job) => {
      const taskKind = job.metadata?.taskKind ?? "task";
      const taskRisk = job.metadata?.taskRisk ?? "unknown";
      const approval = job.metadata?.requiresUserApproval === true || job.metadata?.requiresUserApproval === "true";
      return `<div class="job-row">
        <div class="job-icon">${taskKind.slice(0, 1).toUpperCase()}</div>
        <span class="job-info"><strong>${escapeHtml(job.metadata?.opportunityName ?? job.opportunityId ?? "AI task")}</strong><small>${escapeHtml(taskKind)} · ${escapeHtml(taskRisk)} risk${approval ? " · approval required" : ""}</small></span>
        <span class="badge status-${escapeAttr(job.status)}">${escapeHtml(job.status)}</span>
        ${job.status === "queued" ? `<button class="button compact secondary" data-run="${escapeAttr(job.id)}">Run</button>` : ""}
        ${job.status === "failed" ? `<button class="button compact secondary" data-retry="${escapeAttr(job.id)}">Retry</button>` : ""}
      </div>`;
    }).join("") : `<div class="empty compact-empty"><span>No jobs in the queue yet.</span></div>`}</div>`;

  document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", async () => { await jobAction(button.dataset.run, "run"); }));
  document.querySelectorAll("[data-retry]").forEach((button) => button.addEventListener("click", async () => { await jobAction(button.dataset.retry, "retry"); }));
}

async function jobAction(id, action) {
  try {
    await api(`/jobs/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
    toast(action === "run" ? "Job sent to runner" : "Job queued for retry");
    await refreshJobs();
  } catch (error) {
    toast(`Could not ${action} job`, "error");
    console.warn(error);
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
    toast(walletAddress ? `Wallet connected on ${chainNames.get(walletChainId) ?? `chain ${walletChainId}`} ` : "Wallet connected");
  } catch (error) {
    toast("Wallet connection was cancelled", "warning");
    console.warn(error);
  }
}

function updateWalletButton() {
  const button = $("#connect");
  button.textContent = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Connect wallet";
  button.classList.toggle("connected", Boolean(walletAddress));
  button.title = walletAddress ? `Connected: ${walletAddress}` : "Connect wallet";
}

function updateNetworkLabel() {
  const label = $("#network-label");
  if (!walletChainId) return;
  label.textContent = chainNames.get(walletChainId) ?? `Chain ${walletChainId}`;
}

function setApiStatus(connected, title) {
  const status = $("#api-status");
  status.textContent = connected ? "API connected" : "API offline";
  status.className = `badge ${connected ? "api-ok" : "api-offline"}`;
  status.title = title;
}

function toast(message, kind = "success") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast visible ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 2800);
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  tab.classList.add("active");
  filter = tab.dataset.filter;
  render();
});

$("#chain").addEventListener("change", render);
$("#scan").addEventListener("click", scan);
$("#plan").addEventListener("click", planJobs);
$("#refresh-jobs").addEventListener("click", refreshJobs);
$("#connect").addEventListener("click", connectWallet);
$("#dialog-close").addEventListener("click", () => $("#task-dialog").close());
$("#task-dialog").addEventListener("click", (event) => { if (event.target === $("#task-dialog")) $("#task-dialog").close(); });

if (globalThis.ethereum?.on) {
  globalThis.ethereum.on("accountsChanged", (accounts) => { walletAddress = accounts[0] ?? null; updateWalletButton(); });
  globalThis.ethereum.on("chainChanged", (chainHex) => { walletChainId = Number.parseInt(chainHex, 16); updateNetworkLabel(); });
}

await scan();
await refreshJobs();
setInterval(refreshJobs, 5000);
