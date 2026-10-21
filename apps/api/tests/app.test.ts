import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

describe("HTTP contract", () => {
  afterAll(async () => prisma.$disconnect());

  it("exposes an API liveness endpoint", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "quickora-api" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a consistent JSON error for unknown endpoints", async () => {
    const response = await request(app).get("/api/v1/not-a-route");
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: "NOT_FOUND" });
  });

  it("documents the versioned REST API", async () => {
    const response = await request(app).get("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.paths["/orders"]).toBeDefined();
  });

  it("protects order and administrator data from anonymous requests", async () => {
    const orderResponse = await request(app).get("/api/v1/orders");
    const adminResponse = await request(app).get("/api/v1/admin/analytics");
    expect(orderResponse.status).toBe(401);
    expect(adminResponse.status).toBe(401);
  });
});
