const opportunities = [
  {name:"Project Atlas",chain:"Ink Sepolia",score:94,reward:"High reward signal",cost:"~$1.80",tasks:["Bridge","Swap","Quest","Verify"],approval:true},
  {name:"Nova Campaign",chain:"Base Sepolia",score:89,reward:"Points + potential token",cost:"~$2.40",tasks:["Mint","Quest","Verify"],approval:true},
  {name:"Orbit Builders",chain:"Ethereum Sepolia",score:82,reward:"Builder incentives",cost:"~$0.90",tasks:["Deploy","Verify","Community"],approval:false},
  {name:"Lumen Liquidity",chain:"Base Sepolia",score:76,reward:"Liquidity campaign",cost:"~$6.20",tasks:["Bridge","Liquidity","Quest"],approval:true},
  {name:"Testnet Quest",chain:"Ink Sepolia",score:71,reward:"Quest points",cost:"~$0.20",tasks:["Quest","Social","Verify"],approval:false}
];

let filter = "all";
const list = document.querySelector("#opportunity-list");

function render(){
  const chain = document.querySelector("#chain").value;
  const visible = opportunities.filter(o => {
    if(filter === "high" && o.score < 85) return false;
    if(filter === "approval" && !o.approval) return false;
    if(chain !== "All networks" && o.chain !== chain) return false;
    return true;
  });
  list.innerHTML = visible.map(o => `
    <article class="opportunity">
      <div>
        <div class="title-row"><h3>${o.name}</h3><span class="badge">${o.chain}</span></div>
        <div class="meta">${o.reward} · estimated cost ${o.cost}</div>
        <div class="tasks">${o.tasks.map(t => `<span class="task ${o.approval && ["Bridge","Swap","Liquidity","Mint","Deploy"].includes(t) ? "approval" : ""}">${t}</span>`).join("")}</div>
      </div>
      <div>
        <div class="score">${o.score}<small>/ 100</small></div>
        <div class="row-actions"><button class="button secondary" data-open="${o.name}">View tasks</button></div>
      </div>
    </article>`).join("");
  document.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click",()=>alert(`${btn.dataset.open}: task planner and approval flow will be connected to the AI Agent backend.`)));
}

document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  tab.classList.add("active"); filter=tab.dataset.filter; render();
}));
document.querySelector("#chain").addEventListener("change",render);
document.querySelector("#scan").addEventListener("click",()=>{
  const button=document.querySelector("#scan"); button.textContent="Scanning…"; button.disabled=true;
  setTimeout(()=>{button.textContent="Scan complete"; document.querySelector("#opportunities").textContent="12"; setTimeout(()=>{button.textContent="Scan opportunities";button.disabled=false},900)},800);
});
document.querySelector("#connect").addEventListener("click",()=>alert("Wallet connection will be enabled when the execution/approval layer is wired to the frontend."));
render();
