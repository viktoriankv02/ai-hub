import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AIJobService } from "./service.js";
import type { AIJobRequest } from "./types.js";

export interface AIJobHttpApiOptions {
  token?: string;
  maxBodyBytes?: number;
}

export interface AIJobHttpServerOptions extends AIJobHttpApiOptions {
  host?: string;
  port?: number;
}

/**
 * Small dependency-free HTTP control plane for local/backend development.
 * It deliberately exposes the AIJobService boundary rather than touching
 * persistence or executors directly.
 */
export class AIJobHttpApi {
  private readonly token?: string;
  private readonly maxBodyBytes: number;

  constructor(
    private readonly service: AIJobService,
    options: AIJobHttpApiOptions = {},
  ) {
    this.token = options.token?.trim() || undefined;
    this.maxBodyBytes = options.maxBodyBytes ?? 1_000_000;

    if (!Number.isInteger(this.maxBodyBytes) || this.maxBodyBytes < 1) {
      throw new Error("maxBodyBytes must be a positive integer");
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") {
        this.write(res, 204, undefined);
        return;
      }

      if (!this.authorized(req)) {
        this.write(res, 401, { error: "unauthorized" });
        return;
      }

      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      if (req.method === "GET" && path === "/health") {
        this.write(res, 200, { status: "ok", service: "ai-job-control-plane" });
        return;
      }

      if (req.method === "GET" && path === "/jobs") {
        this.write(res, 200, { jobs: this.service.list() });
        return;
      }

      if (req.method === "POST" && path === "/jobs") {
        const request = await this.readJson<AIJobRequest>(req);
        const job = this.service.enqueue(request);
        this.write(res, 201, { job });
        return;
      }

      const match = path.match(/^\/jobs\/([^/]+)(?:\/(run|retry|cancel))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const action = match[2];

        if (req.method === "GET" && !action) {
          const job = this.service.get(id);
          if (!job) {
            this.write(res, 404, { error: "job_not_found", id });
            return;
          }
          this.write(res, 200, { job });
          return;
        }

        if (req.method === "POST" && action === "run") {
          const job = await this.service.run(id);
          this.write(res, 200, { job });
          return;
        }

        if (req.method === "POST" && action === "retry") {
          const job = this.service.retry(id);
          this.write(res, 200, { job });
          return;
        }

        if (req.method === "POST" && action === "cancel") {
          const job = this.service.cancel(id);
          this.write(res, 200, { job });
          return;
        }
      }

      if (req.method === "POST" && path === "/jobs/drain") {
        const result = await this.service.drain();
        this.write(res, 200, result);
        return;
      }

      this.write(res, 404, { error: "route_not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "request body is too large" ? 413 : 400;
      this.write(res, status, { error: message });
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

  listen(options: AIJobHttpServerOptions = {}): ReturnType<ReturnType<typeof createServer>["listen"]> {
    const server = this.createServer();
    return server.listen(options.port ?? 8787, options.host ?? "127.0.0.1");
  }

  private authorized(req: IncomingMessage): boolean {
    if (!this.token) return true;
    const value = req.headers.authorization;
    return value === `Bearer ${this.token}`;
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
    if (status === 204) {
      res.end();
      return;
    }
    res.end(JSON.stringify(body));
  }
}
