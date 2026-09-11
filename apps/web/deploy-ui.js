const API = globalThis.AI_HUB_API ?? "http://127.0.0.1:8787";
const DEPLOY_KINDS = new Set(["deploy", "mint"]);

let current = null;
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

async function refreshDeploymentCenter() {
  const root = $("#deployment-center");
  if (!root) return;
  try {
    const data = await api("/projects");
    const rows = [];
    for (const project of data.projects ?? []) {
      for (const task of project.tasks ?? []) {
        if (!DEPLOY_KINDS.has(task.kind)) continue;
        if (task.status === "ready") rows.push({ project, task, state: "ready" });
        if (task.status === "running" && task.txHashes?.length) rows.push({ project, task, state: "running" });
      }
    }
    root.innerHTML = rows.length ? rows.map(renderRow).join("") : emptyState();
  } catch (error) {
    root.innerHTML = `<div class="queue-offline"><strong>Deployment center unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function renderRow({ project, task, state }) {
  const txHash = task.txHashes?.at(-1);
  const chainId = project.opportunity?.chainId ?? "—";
  const action = state === "ready"
    ? `<button class="button compact primary" data-deploy-preview="${escapeAttr(project.id)}" data-task="${escapeAttr(task.id)}">Prepare preview</button>`
    : `<button class="button compact secondary" data-deploy-reconcile="${escapeAttr(project.id)}" data-task="${escapeAttr(task.id)}" data-tx="${escapeAttr(txHash)}">Check receipt</button>`;
  return `<div class="job-row">
    <div class="job-icon">D</div>
    <span class="job-info"><strong>${escapeHtml(project.opportunity?.name ?? project.id)}</strong><small>${escapeHtml(task.title)} · chain ${escapeHtml(chainId)} · ${escapeHtml(state)}</small></span>
    <span class="badge">${escapeHtml(task.status)}</span>
    ${action}
  </div>`;
}

function emptyState() {
  return `<div class="empty compact-empty"><strong>No approved deployments</strong><span>Approve a deploy or mint task first.</span></div>`;
}

async function prepareDeployment(projectId, taskId) {
  try {
    const result = await api(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/deployment-preview`, {
      method: "POST",
      body: "{}",
    });
    current = { projectId, taskId, ...result };
    renderPreview(result);
    const dialog = $("#deploy-dialog");
    if (typeof dialog?.showModal === "function") dialog.showModal();
  } catch (error) {
    notify(`Deployment preview failed: ${error.message}`, "error");
  }
}

function renderPreview(result) {
  const preview = result.preview;
  const chain = result.chain;
  const template = result.template;
  $("#deploy-title").textContent = `${template.label} on ${chain.name}`;
  $("#deploy-summary").innerHTML = `
    <div><span>Network</span><strong>${escapeHtml(chain.name)}</strong></div>
    <div><span>Chain ID</span><strong>${escapeHtml(chain.chainId)}</strong></div>
    <div><span>Template</span><strong>${escapeHtml(template.contractName)}</strong></div>
    <div><span>Value</span><strong>${escapeHtml(preview.value)} wei</strong></div>
    <div><span>Preview hash</span><strong class="mono">${escapeHtml(shortHash(preview.previewHash))}</strong></div>`;
  $("#deploy-details").innerHTML = `
    <p><strong>Constructor args:</strong> ${escapeHtml(JSON.stringify(preview.constructorArgs))}</p>
    <p><strong>Unsigned deployment data:</strong></p>
    <textarea id="deploy-payload" class="payload-box" readonly>${escapeHtml(preview.data)}</textarea>
    <div class="reasons">${(preview.warnings ?? []).map((warning) => `<span>• ${escapeHtml(warning)}</span>`).join("")}</div>
    <p class="muted">Sign and broadcast this exact contract-creation payload in your wallet on the network shown above. Then paste the resulting transaction hash below so Drop Hunter can track the receipt and evidence.</p>
    <label class="tx-input-label" for="deploy-tx-hash">Transaction hash</label>
    <input id="deploy-tx-hash" class="tx-input" autocomplete="off" placeholder="0x…" />`;
  const button = $("#deploy-submit");
  button.disabled = false;
  button.textContent = "Record transaction hash";
}

async function recordTransaction() {
  if (!current) return;
  const input = $("#deploy-tx-hash");
  const transactionHash = input?.value?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
    notify("Enter a valid 32-byte transaction hash", "error");
    return;
  }
  const button = $("#deploy-submit");
  button.disabled = true;
  button.textContent = "Recording…";
  try {
    await api(`/projects/${encodeURIComponent(current.projectId)}/tasks/${encodeURIComponent(current.taskId)}/deployment-submitted`, {
      method: "POST",
      body: JSON.stringify({
        transactionHash,
        previewHash: current.preview.previewHash,
        templateId: current.template.id,
        constructorArgs: current.preview.constructorArgs,
      }),
    });
    notify(`Deployment transaction recorded: ${shortHash(transactionHash)}`);
    await reconcile(current.projectId, current.taskId, transactionHash);
    await refreshDeploymentCenter();
    globalThis.dispatchEvent(new CustomEvent("drop-hunter:changed"));
    $("#deploy-dialog")?.close();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Record transaction hash";
    notify(`Could not record deployment: ${error.message}`, "error");
  }
}

async function reconcile(projectId, taskId, transactionHash) {
  const result = await api(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/deployment-reconcile`, {
    method: "POST",
    body: JSON.stringify({ transactionHash }),
  });
  if (result.receipt?.status === "pending") notify("Deployment transaction is pending");
  else if (result.receipt?.status === "success") notify(`Deployment confirmed: ${shortHash(result.receipt.contractAddress)}`);
  else if (result.receipt?.status === "failed") notify("Deployment transaction failed on-chain", "error");
  return result;
}

async function reconcileFromButton(button) {
  button.disabled = true;
  try {
    await reconcile(button.dataset.deployReconcile, button.dataset.task, button.dataset.tx);
    await refreshDeploymentCenter();
    globalThis.dispatchEvent(new CustomEvent("drop-hunter:changed"));
  } catch (error) {
    notify(`Receipt check failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function shortHash(value) {
  const text = String(value ?? "");
  return text.length > 22 ? `${text.slice(0, 12)}…${text.slice(-8)}` : text;
}

function notify(message, kind = "success") {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast visible ${kind}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { node.className = "toast"; }, 3500);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

document.addEventListener("click", (event) => {
  const preview = event.target.closest?.("[data-deploy-preview]");
  if (preview) void prepareDeployment(preview.dataset.deployPreview, preview.dataset.task);
  const reconcileButton = event.target.closest?.("[data-deploy-reconcile]");
  if (reconcileButton) void reconcileFromButton(reconcileButton);
});

$("#deploy-submit")?.addEventListener("click", () => void recordTransaction());
$("#deploy-close")?.addEventListener("click", () => $("#deploy-dialog")?.close());
$("#deploy-dialog")?.addEventListener("click", (event) => {
  if (event.target === $("#deploy-dialog")) $("#deploy-dialog").close();
});
globalThis.addEventListener("drop-hunter:changed", () => void refreshDeploymentCenter());

await refreshDeploymentCenter();
setInterval(refreshDeploymentCenter, 15000);
