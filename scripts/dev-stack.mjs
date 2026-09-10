import { spawn } from "node:child_process";

const processes = [
  ["AI job API", ["scripts/ai-job-server.ts"]],
  ["AI Hub web", ["scripts/web-server.mjs"]],
];

const children = processes.map(([label, script]) => {
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", ...script], {
    stdio: "inherit",
    env: process.env,
    windowsHide: false,
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`${label} stopped${signal ? ` with ${signal}` : ` with code ${code}`}`);
      shutdown(code ?? 1);
    }
  });
  return child;
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 100);
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

console.log("AI Hub local stack");
console.log("Web: http://127.0.0.1:3000");
console.log("API: http://127.0.0.1:8787");
console.log("Press Ctrl+C to stop both services.");
