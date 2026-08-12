import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AIJobService } from "./service.js";
import type { AIJobRequest } from "./types.js";

export interface AIJobHttpApiOptions { token?: string; maxBodyBytes?: number; }
export interface AIJobHttpServerOptions extends AIJobHttpApiOptions { host?: string; port?: number; }

export class AIJobHttpApi {
  private readonly token?: string;
  private readonly maxBodyBytes: number;

  constructor(private readonly service: AIJobService, options: AIJobHttpApiOptions = {}) {
    this.token = options.token?.trim() || undefined;
    this.maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
    if (!Number.isInteger(this.maxBodyBytes) || this.maxBodyBytes < 1) {
      throw new Error("maxBodyBytes must be a positive integer");
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") return this.write(res, 204, undefined);
      if (!this.authorized(req)) return this.write(res, 401, { error: "unauthorized" });

      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (req.method === "GET" && path === "/health") {
        return this.write(res, 200, { status: "ok", service: "ai-job-control-plane" });
      }
      if (req.method === "GET" && path === "/jobs") return this.write(res, 200, { jobs: this.service.list() });
      if (req.method === "POST" && path === "/jobs") {
        const job = this.service.enqueue(await this.readJson<AIJobRequest>(req));
        return this.write(res, 201, { job });
      }

      const match = path.match(/^\/jobs\/([^/]+)(?:\/(run|retry|cancel|provision-onchain|submit-onchain))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const action = match[2];
        if (req.method === "GET" && !action) {
          const job = this.service.get(id);
          return job ? this.write(res, 200, { job }) : this.write(res, 404, { error: "job_not_found", id });
        }
        if (req.method !== "POST") return this.write(res, 404, { error: "route_not_found" });
        if (action === "run") return this.write(res, 200, { job: await this.service.run(id) });
        if (action === "retry") return this.write(res, 200, { job: this.service.retry(id) });
        if (action === "cancel") return this.write(res, 200, { job: this.service.cancel(id) });
        if (action === "provision-onchain") return this.write(res, 200, { result: await this.service.provisionOnchain(id) });
        if (action === "submit-onchain") return this.write(res, 200, { result: await this.service.submitCompletionOnchain(id) });
      }

      if (req.method === "POST" && path === "/jobs/drain") {
        return this.write(res, 200, await this.service.drain());
      }
      return this.write(res, 404, { error: "route_not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.write(res, message === "request body is too large" ? 413 : 400, { error: message });
    }
  }

  createServer(): ReturnType<typeof createServer> {
    return createServer((req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      void this.handle(req, res);
    });
  }

  listen(options: AIJobHttpServerOptions = {}): ReturnType<typeof createServer> {
    const server = this.createServer();
    server.listen(options.port ?? 8787, options.host ?? "127.0.0.1");
    return server;
  }

  private authorized(req: IncomingMessage): boolean {
    return !this.token || req.headers.authorization === `Bearer ${this.token}`;
  }

  private async readJson<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > this.maxBodyBytes) throw new Error("request body is too large");
      chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) throw new Error("request body is required");
    return JSON.parse(raw) as T;
  }

  private write(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    if (status !== 204) res.end(JSON.stringify(body));
    else res.end();
  }
}
