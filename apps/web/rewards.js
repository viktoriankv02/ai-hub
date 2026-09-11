const API = globalThis.AI_HUB_REWARD_API ?? "http://127.0.0.1:8788";
const $ = (selector) => document.querySelector(selector);
let syncing = false;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function refreshRewards() {
  const root = $("#reward-list");
  const summaryRoot = $("#reward-summary");
  if (!root || !summaryRoot) return;
  try {
    if (!syncing) {
      syncing = true;
      try {
        await api("/rewards/sync-evidence", { method: "POST", body: "{}" });
      } finally {
        syncing = false;
      }
    }
    const [list, summary] = await Promise.all([api("/rewards"), api("/rewards/summary")]);
    renderSummary(summary.summary ?? {});
    renderRewards(list.rewards ?? []);
  } catch (error) {
    syncing = false;
    summaryRoot.innerHTML = `<div class="queue-offline"><strong>Rewards API offline</strong><span>${escapeHtml(error.message)}</span></div>`;
    root.innerHTML = "";
  }
}

function renderSummary(summary) {
  $("#reward-summary").innerHTML = `
    <div class="queue-summary">
      <span class="queue-item waiting"><i></i>${number(summary.detected)} detected</span>
      <span class="queue-item running"><i></i>${number(summary.claimable)} claimable</span>
      <span class="queue-item"><i></i>${number(summary.claimed)} claimed</span>
      <span class="queue-item done"><i></i>${number(summary.confirmed)} confirmed</span>
      <span class="queue-item"><i></i>${money(summary.estimatedUsd)} estimated</span>
      <span class="queue-item done"><i></i>${money(summary.confirmedUsd)} confirmed value</span>
    </div>`;
}

function renderRewards(rewards) {
  const root = $("#reward-list");
  if (!rewards.length) {
    root.innerHTML = `<div class="empty compact-empty"><strong>No rewards detected yet</strong><span>Reward records will appear here when a campaign, on-chain check, or manual review identifies a reward.</span></div>`;
    return;
  }
  root.innerHTML = `<div class="job-list">${rewards.slice(0, 50).map(renderReward).join("")}</div>`;
}

function renderReward(reward) {
  const asset = reward.assetSymbol ?? reward.assetAddress ?? "reward";
  const amount = reward.amount ? `${reward.amount} ${asset}` : asset;
  const value = reward.estimatedUsd === undefined ? "" : ` · ${money(reward.estimatedUsd)}`;
  const action = nextAction(reward.status);
  return `<div class="job-row reward-row">
    <div class="job-icon">R</div>
    <span class="job-info">
      <strong>${escapeHtml(amount)}${escapeHtml(value)}</strong>
      <small>${escapeHtml(reward.projectId)} · ${escapeHtml(reward.source)} · confidence ${Math.round((reward.confidence ?? 0) * 100)}%</small>
    </span>
    <span class="badge reward-${escapeAttr(reward.status)}">${escapeHtml(reward.status)}</span>
    ${action ? `<button class="button compact secondary" data-reward-id="${escapeAttr(reward.id)}" data-reward-status="${escapeAttr(action.status)}">${escapeHtml(action.label)}</button>` : ""}
  </div>`;
}

function nextAction(status) {
  if (status === "detected") return { status: "claimable", label: "Mark claimable" };
  if (status === "claimable") return { status: "claimed", label: "Mark claimed" };
  if (status === "claimed") return { status: "confirmed", label: "Confirm reward" };
  return null;
}

async function updateReward(button) {
  button.disabled = true;
  try {
    await api(`/rewards/${encodeURIComponent(button.dataset.rewardId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.rewardStatus }),
    });
    notify(`Reward marked ${button.dataset.rewardStatus}`);
    await refreshRewards();
  } catch (error) {
    notify(`Reward update failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function money(value) { return `$${Number(value ?? 0).toFixed(2)}`; }
function notify(message, kind = "success") {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast visible ${kind}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { node.className = "toast"; }, 3000);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-reward-id]");
  if (button) void updateReward(button);
});
globalThis.addEventListener("drop-hunter:changed", () => void refreshRewards());

await refreshRewards();
setInterval(refreshRewards, 15000);
