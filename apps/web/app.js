const API = globalThis.AI_HUB_API ?? "http://127.0.0.1:8787";

const fallbackOpportunities = [
  { id:"ink-sepolia", name:"Ink Sepolia", chainId:763373, score:94, tasks:[{title:"Deploy ERC20",kind:"deploy",risk:"medium",requiresUserApproval:true},{title:"Deploy NFT",kind:"deploy",risk:"medium",requiresUserApproval:true},{title:"Verify contract",kind:"verify",risk:"low",requiresUserApproval:false},{title:"Record activity",kind:"other",risk:"medium",requiresUserApproval:true}] } ,
  { id:"base-sepolia", name:"Base Sepolia", chainId:84532, score:89, tasks:[{title:"Deploy core",kind:"deploy",risk:"medium",requiresUserApproval:true},{title:"Deploy EVM adapter",kind:"deploy",risk:"medium",requiresUserApproval:true},{title:"Record verified activity",kind:"other",risk:"medium",requiresUserApproval:true},{title:"Test reward flow",kind:"other",risk:"high",requiresUserApproval:true}] },
];

const chainNames = new Map([[763373,"Ink Sepolia"],[84532,"Base Sepolia"],[11155111,"Ethereum Sepolia"],[9746,"Plasma Testnet"],[5042002,"Arc Testnet"],[42431,"Tempo Testnet (Moderato)"]]);
let opportunities = [];
let filter = "all";
let selected = null;

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

  $("#opportunity-list").innerHTML = visible.map((o) => `
    <article class="opportunity">
      <div>
        <div class="title-row"><h3>${escapeHtml(o.name)}</h3><span class="badge">${escapeHtml(chainNames.get(o.chainId) ?? String(o.chainId ?? "Unknown"))}</span></div>
        <div class="meta">${o.tasks.length} project tasks · confidence ${o.confidence ?? "—"}/100 · reward signal ${o.rewardPotential ?? 0}/100</div>
        <div class="tasks">${o.tasks.map((t) => `<span class="task ${t.requiresUserApproval ? "approval" : ""}">${escapeHtml(t.title)}</span>`).join("")}</div>
      </div>
      <div>
        <div class="score">${o.score}<small>/ 100</small></div>
        <div class="row-actions"><button class="button secondary" data-open="${escapeAttr(o.id)}">View tasks</button></div>
      </div>
    </article>`).join("") || `<p class="muted">No opportunities match the current filters.</p>`;

  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => showTasks(button.dataset.open)));
  renderStats();
}

function showTasks(id) {
  selected = opportunities.find((o) => o.id === id);
  if (!selected) return;
  const taskText = selected.tasks.map((t, i) => `${i + 1}. ${t.title} — ${t.kind}, ${t.risk} risk${t.requiresUserApproval ? ", approval required" : ""}`).join("\n");
  alert(`${selected.name}\nScore: ${selected.score}/100\n\n${taskText || "No tasks extracted."}`);
}

async function scan() {
  const button = $("#scan");
  button.disabled = true;
  button.textContent = "Scanning…";
  try {
    const report = await api("/opportunities");
    opportunities = normalizeReport(report);
    $("#api-status").textContent = "API connected";
    $("#api-status").title = `${report.successfulSources?.length ?? 0} source(s) succeeded`;
    render();
    button.textContent = "Scan complete";
  } catch (error) {
    if (!opportunities.length) opportunities = fallbackOpportunities;
    $("#api-status").textContent = "API offline — demo data";
    render();
    button.textContent = "Scan unavailable";
    console.warn(error);
  } finally {
    setTimeout(() => { button.textContent = "Scan opportunities"; button.disabled = false; }, 900);
  }
}

async function planJobs() {
  const button = $("#plan");
  button.disabled = true;
  button.textContent = "Preparing…";
  try {
    const result = await api("/opportunities/plan", {
      method: "POST",
      body: JSON.stringify({ agentId: "1", reward: "0", minimumScore: 30, includeApprovalRequired: true }),
    });
    button.textContent = `${result.jobs.length} jobs prepared`;
    await refreshJobs();
  } catch (error) {
    button.textContent = "Planning failed";
    console.warn(error);
  } finally {
    setTimeout(() => { button.textContent = "Prepare eligible tasks"; button.disabled = false; }, 1200);
  }
}

async function refreshJobs() {
  try {
    const data = await api("/jobs");
    renderJobs(data.jobs ?? []);
  } catch (error) {
    $("#queue").innerHTML = `<span class="queue-item waiting">Control plane offline</span>`;
    console.warn(error);
  }
}

function renderJobs(jobs) {
  const counts = jobs.reduce((acc, job) => { acc[job.status] = (acc[job.status] ?? 0) + 1; return acc; }, {});
  $("#queue").innerHTML = `
    <span class="queue-item done">✓ ${counts.completed ?? 0} completed</span>
    <span class="queue-item running">● ${counts.running ?? 0} running</span>
    <span class="queue-item waiting">${counts.queued ?? 0} queued</span>
    <span class="queue-item waiting">${counts.cancelled ?? 0} cancelled</span>
    <div class="job-list">${jobs.slice(-8).reverse().map((job) => `
      <div class="job-row">
        <span><strong>${escapeHtml(job.metadata?.opportunityName ?? job.opportunityId ?? "AI task")}</strong><small>${escapeHtml(job.metadata?.taskKind ?? "task")} · ${escapeHtml(job.metadata?.taskRisk ?? "unknown")} risk</small></span>
        <span class="badge">${escapeHtml(job.status)}</span>
        ${job.status === "queued" ? `<button class="button secondary" data-run="${escapeAttr(job.id)}">Run</button>` : ""}
        ${job.status === "failed" ? `<button class="button secondary" data-retry="${escapeAttr(job.id)}">Retry</button>` : ""}
      </div>`).join("")}</div>`;

  document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", async () => { await jobAction(button.dataset.run, "run"); }));
  document.querySelectorAll("[data-retry]").forEach((button) => button.addEventListener("click", async () => { await jobAction(button.dataset.retry, "retry"); }));
}

async function jobAction(id, action) {
  try {
    await api(`/jobs/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
    await refreshJobs();
  } catch (error) { console.warn(error); }
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  tab.classList.add("active");
  filter = tab.dataset.filter;
  render();
}));
$("#chain").addEventListener("change", render);
$("#scan").addEventListener("click", scan);
$("#plan").addEventListener("click", planJobs);
$("#refresh-jobs").addEventListener("click", refreshJobs);
$("#connect").addEventListener("click", async () => {
  if (!globalThis.ethereum?.request) { alert("No browser wallet detected. Install MetaMask or another EIP-1193 wallet."); return; }
  try {
    const accounts = await globalThis.ethereum.request({ method: "eth_requestAccounts" });
    $("#connect").textContent = accounts[0] ? `${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}` : "Wallet connected";
  } catch (error) { console.warn(error); }
});

await scan();
await refreshJobs();
setInterval(refreshJobs, 5000);
