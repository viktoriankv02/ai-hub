import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AIJobHttpApi } from "./http-api.js";
import { AIJobService } from "./service.js";
import { AIJobMultiChainService } from "./multi-chain-service.js";

export interface MultiChainHttpApiOptions { token?: string; maxBodyBytes?: number; }

/** Adds chain-management routes without changing the stable AIJobHttpApi routes. */
export class AIJobMultiChainHttpApi {
  private readonly base: AIJobHttpApi;
  private readonly token?: string;

  constructor(
    private readonly service: AIJobService,
    private readonly multiChain: AIJobMultiChainService,
    options: MultiChainHttpApiOptions = {},
  ) {
    this.base = new AIJobHttpApi(service, options);
    this.token = options.token?.trim() || undefined;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "OPTIONS") return this.base.handle(req, res);
    if (!this.authorized(req)) return this.write(res, 401, { error: "unauthorized" });

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/chains") {
        return this.write(res, 200, { chains: this.multiChain.targets() });
      }

      const match = path.match(/^\/jobs\/([^/]+)\/chain\/(provision|complete|execute)$/);
      if (match && req.method === "POST") {
        const id = decodeURIComponent(match[1]);
        const action = match[2];
        const job = this.service.get(id);
        if (!job) return this.write(res, 404, { error: "job_not_found", id });
        const targetId = url.searchParams.get("targetId") ?? undefined;

        if (action === "provision") return this.write(res, 200, { result: await this.multiChain.provision(job, targetId) });
        if (action === "complete") return this.write(res, 200, { result: await this.multiChain.complete(job, targetId) });
        return this.write(res, 200, { result: await this.multiChain.execute(job, targetId) });
      }

      return this.base.handle(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.write(res, 400, { error: message });
    }
  }

  createServer() {
    return createServer((req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      void this.handle(req, res);
    });
  }

  private authorized(req: IncomingMessage): boolean {
    return !this.token || req.headers.authorization === `Bearer ${this.token}`;
  }

  private write(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }
}
