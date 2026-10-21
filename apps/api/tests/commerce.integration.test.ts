import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Role } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

const databaseTests = process.env.RUN_DB_TESTS === "true";

describe.skipIf(!databaseTests)("PostgreSQL commerce journeys", () => {
  const customer = request.agent(app);
  const admin = request.agent(app);
  const rider = request.agent(app);
  let product: { id: string; pricePaise: number; mrpPaise: number; sku: string };
  let addressId = "";

  beforeAll(async () => {
    const customerLogin = await customer.post("/api/v1/auth/login").send({ email: "customer@quickora.local", password: process.env.SEED_CUSTOMER_PASSWORD ?? "QuickoraCustomer123!" });
    const adminLogin = await admin.post("/api/v1/auth/login").send({ email: "admin@quickora.local", password: process.env.SEED_ADMIN_PASSWORD ?? "QuickoraAdmin123!" });
    const riderLogin = await rider.post("/api/v1/auth/login").send({ email: "rider@quickora.local", password: process.env.SEED_RIDER_PASSWORD ?? "QuickoraRider123!" });
    expect(customerLogin.status).toBe(200);
    expect(adminLogin.status).toBe(200);
    expect(riderLogin.status).toBe(200);
    const [milk, address] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { slug: "a2-cow-milk" }, select: { id: true, pricePaise: true, mrpPaise: true, sku: true } }),
      prisma.address.findFirstOrThrow({ where: { user: { email: "customer@quickora.local" }, isDefault: true } })
    ]);
    product = milk;
    addressId = address.id;
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { product: { sku: { startsWith: "TEST-" } } } });
    await prisma.inventory.deleteMany({ where: { product: { sku: { startsWith: "TEST-" } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "TEST-" } } });
    const customerRecord = await prisma.user.findUnique({ where: { email: "customer@quickora.local" } });
    if (customerRecord) await prisma.cartItem.deleteMany({ where: { cart: { userId: customerRecord.id } } });
    await prisma.$disconnect();
  });

  it("rejects invalid credentials and denies customers access to admin routes", async () => {
    const invalid = await request(app).post("/api/v1/auth/login").send({ email: "customer@quickora.local", password: "not-the-password" });
    const forbidden = await customer.get("/api/v1/admin/analytics");
    expect(invalid.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it("searches and filters persisted products", async () => {
    const response = await request(app).get("/api/v1/products?q=milk&inStock=true");
    expect(response.status).toBe(200);
    expect(response.body.data.products.some((item: { name: string }) => item.name === "A2 Cow Milk")).toBe(true);
    expect(response.body.data.pagination.total).toBeGreaterThan(0);
    const branded = await request(app).get("/api/v1/products?brand=Amul");
    expect(branded.status).toBe(200);
    expect(branded.body.data.products.length).toBeGreaterThan(0);
    expect(branded.body.data.products.every((item: { brand: string }) => item.brand === "Amul")).toBe(true);
    const secondPage = await request(app).get("/api/v1/products?limit=48&page=2");
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.products.length).toBeGreaterThan(0);
    expect(secondPage.body.data.pagination.pages).toBeGreaterThan(1);
  });

  it("validates cart quantity and coupon eligibility from current prices", async () => {
    await customer.delete("/api/v1/cart");
    const invalid = await customer.post("/api/v1/cart/items").send({ productId: "not-a-product", quantity: 1 });
    expect(invalid.status).toBe(404);
    const added = await customer.post("/api/v1/cart/items").send({ productId: product.id, quantity: 10 });
    expect(added.status).toBe(201);
    const cart = await customer.get("/api/v1/cart");
    const item = cart.body.data.items.find((row: { productId: string }) => row.productId === product.id);
    expect(item.quantity).toBe(10);
    const coupon = await customer.post("/api/v1/coupons/validate").send({ code: "WELCOME10" });
    expect(coupon.status).toBe(200);
    expect(coupon.body.data.discountPaise).toBe(Math.floor(product.pricePaise * 10 * 10 / 100));
  });

  it("recalculates checkout, records an order and restores inventory on cancellation", async () => {
    const before = await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    const orderResponse = await customer.post("/api/v1/orders").send({ addressId, paymentMethod: "COD" });
    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body.data.subtotalPaise).toBe(product.pricePaise * 10);
    expect(orderResponse.body.data.totalPaise).toBeGreaterThan(orderResponse.body.data.subtotalPaise);
    const afterOrder = await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    expect(afterOrder.quantity).toBe(before.quantity - 10);
    const cancelled = await customer.post(`/api/v1/orders/${orderResponse.body.data.id}/cancel`);
    expect(cancelled.status).toBe(200);
    const afterCancel = await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    expect(afterCancel.quantity).toBe(before.quantity);
  });

  it("serves admin analytics and scopes delivery routes by role", async () => {
    const metrics = await admin.get("/api/v1/admin/analytics");
    const customerDelivery = await customer.get("/api/v1/delivery/tasks");
    const deliveryTasks = await rider.get("/api/v1/delivery/tasks");
    expect(metrics.status).toBe(200);
    expect(customerDelivery.status).toBe(403);
    expect(deliveryTasks.status).toBe(200);
    expect(Array.isArray(deliveryTasks.body.data)).toBe(true);
  });

  it("creates products and records admin inventory movements", async () => {
    const category = await prisma.category.findFirstOrThrow();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const created = await admin.post("/api/v1/admin/products").send({
      name: `Test product ${suffix}`, description: "A valid automated test product.", brand: "QUICKORA Test",
      categoryId: category.id, pricePaise: 5000, mrpPaise: 6000, unit: "1 pack",
      sku: `TEST-${suffix}`, image: "https://example.test/test-product.jpg", quantity: 5, active: true
    });
    expect(created.status).toBe(201);
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { productId: created.body.data.id } });
    expect(inventory.quantity).toBe(5);
    const adjustments = await admin.post("/api/v1/admin/inventory/adjustments").send({ productId: created.body.data.id, delta: 3, reason: "Integration test restock" });
    expect(adjustments.status).toBe(200);
    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: created.body.data.id, actor: { role: Role.ADMIN } }, orderBy: { createdAt: "desc" } });
    expect(movement?.delta).toBe(3);
  });
});
