import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OrderStatus, PaymentMethod, Role, Prisma } from "@prisma/client";
import { prisma } from "./config/prisma.js";
import { env } from "./config/env.js";
import { allowRoles, authenticate, type AuthUser } from "./middleware/auth.js";

const openApiSpec = {
  openapi: "3.0.3",
  info: { title: "QUICKORA API", version: "1.0.0", description: "Quick commerce REST API. Authentication uses an HTTP-only session cookie." },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/auth/register": { post: { summary: "Register a customer", responses: { "201": { description: "Created" } } } },
    "/auth/login": { post: { summary: "Sign in", responses: { "200": { description: "Authenticated" } } } },
    "/products": { get: { summary: "Search and filter catalog", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Product page" } } } },
    "/cart": { get: { summary: "Read authenticated cart", responses: { "200": { description: "Cart" } } } },
    "/orders": { post: { summary: "Create an order using server-recalculated prices", responses: { "201": { description: "Order created" } } } },
    "/admin/analytics": { get: { summary: "Read administrator metrics", responses: { "200": { description: "Persisted metrics" } } } }
  }
};

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const requestId = req.header("x-request-id")?.slice(0, 100) ?? randomUUID();
  res.setHeader("x-request-id", requestId);
  res.locals.requestId = requestId;
  const start = Date.now();
  res.on("finish", () => console.info(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start })));
  next();
});

const router = express.Router();
const user = (res: express.Response) => res.locals.user as AuthUser;
const pathParam = (req: express.Request, key: string) => {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};
const error = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message, requestId: res.locals.requestId } });
const asyncRoute = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "quickora-api" }));
app.get("/ready", asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ready", database: "connected" });
}));

router.get("/health", (_req, res) => res.json({ status: "ok", version: "v1" }));
router.get("/openapi.json", (_req, res) => res.json(openApiSpec));
router.use("/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
router.use("/auth/register", rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

router.post("/auth/register", asyncRoute(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().toLowerCase(),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
    password: z.string().min(10).max(72)
  }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Check the form and try again.");
  const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: input.data.email }, { phone: input.data.phone }] } });
  if (duplicate) return error(res, 409, "ACCOUNT_EXISTS", "An account with this email or phone already exists.");
  const created = await prisma.user.create({
    data: { ...input.data, passwordHash: await bcrypt.hash(input.data.password, 12), role: Role.CUSTOMER, cart: { create: {} } },
    select: { id: true, name: true, email: true, phone: true, role: true }
  });
  setSession(res, created.id);
  res.status(201).json({ data: { user: created } });
}));
router.post("/auth/login", asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().trim().email().toLowerCase(), password: z.string().min(1).max(72) }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Enter a valid email and password.");
  const account = await prisma.user.findUnique({ where: { email: input.data.email } });
  if (!account || !account.active || !(await bcrypt.compare(input.data.password, account.passwordHash))) {
    return error(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  setSession(res, account.id);
  res.json({ data: { user: { id: account.id, name: account.name, email: account.email, phone: account.phone, role: account.role } } });
}));
router.post("/auth/logout", (_req, res) => { res.clearCookie("quickora_session", cookieOptions()); res.json({ data: { loggedOut: true } }); });
router.get("/auth/me", authenticate, (req, res) => res.json({ data: { user: user(res) } }));

router.get("/categories", asyncRoute(async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  res.json({ data: categories });
}));

router.get("/products", asyncRoute(async (req, res) => {
  const query = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    inStock: z.enum(["true", "false"]).optional(),
    sort: z.enum(["popular", "price-asc", "price-desc", "rating", "discount"]).default("popular"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24)
  }).safeParse(req.query);
  if (!query.success) return error(res, 400, "VALIDATION_ERROR", "Invalid catalog filter.");
  const { q, category, brand, minPrice, maxPrice, inStock, sort, page, limit } = query.data;
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(brand ? { brand: { equals: brand, mode: "insensitive" } } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined ? { pricePaise: { ...(minPrice !== undefined ? { gte: Math.floor(minPrice * 100) } : {}), ...(maxPrice !== undefined ? { lte: Math.floor(maxPrice * 100) } : {}) } } : {}),
    ...(inStock === "true" ? { inventory: { is: { quantity: { gt: 0 } } } } : {})
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = sort === "price-asc" ? [{ pricePaise: "asc" }]
    : sort === "price-desc" ? [{ pricePaise: "desc" }]
      : sort === "rating" ? [{ rating: "desc" }, { name: "asc" }]
        : sort === "discount" ? [{ mrpPaise: "desc" }, { pricePaise: "asc" }]
          : [{ featured: "desc" }, { name: "asc" }];
  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, include: { category: true, inventory: true }, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.product.count({ where })
  ]);
  res.json({ data: { products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));
router.get("/products/search", asyncRoute(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  if (!q) return res.json({ data: { suggestions: [], popular: ["milk", "banana", "bread", "chips"] } });
  const suggestions = await prisma.product.findMany({
    where: { active: true, OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] },
    select: { id: true, slug: true, name: true, brand: true, image: true, pricePaise: true, unit: true },
    take: 6, orderBy: { featured: "desc" }
  });
  res.json({ data: { suggestions, popular: ["milk", "banana", "bread", "chips"] } });
}));
router.get("/products/:slug", asyncRoute(async (req, res) => {
  const product = await prisma.product.findFirst({ where: { slug: pathParam(req, "slug"), active: true }, include: { category: true, inventory: true } });
  if (!product) return error(res, 404, "PRODUCT_NOT_FOUND", "This product is no longer available.");
  const related = await prisma.product.findMany({ where: { categoryId: product.categoryId, id: { not: product.id }, active: true }, include: { inventory: true }, take: 6 });
  res.json({ data: { product, related } });
}));

router.get("/cart", authenticate, asyncRoute(async (_req, res) => {
  const cart = await prisma.cart.upsert({ where: { userId: user(res).id }, update: {}, create: { userId: user(res).id }, include: { items: { include: { product: { include: { inventory: true } } } } } });
  res.json({ data: cart });
}));
router.post("/cart/items", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1) }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Choose a valid product and quantity.");
  const product = await prisma.product.findFirst({ where: { id: input.data.productId, active: true }, include: { inventory: true } });
  if (!product) return error(res, 404, "PRODUCT_NOT_FOUND", "This product is no longer available.");
  if (!product.inventory || product.inventory.quantity < input.data.quantity) return error(res, 409, "OUT_OF_STOCK", "The requested quantity is not available.");
  const cart = await prisma.cart.upsert({ where: { userId: user(res).id }, update: {}, create: { userId: user(res).id } });
  const item = await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    update: { quantity: { increment: input.data.quantity } },
    create: { cartId: cart.id, productId: product.id, quantity: input.data.quantity }
  });
  if (item.quantity > product.inventory.quantity) {
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: product.inventory.quantity } });
    return error(res, 409, "OUT_OF_STOCK", "Only the available quantity was added.");
  }
  res.status(201).json({ data: item });
}));
router.patch("/cart/items/:id", authenticate, asyncRoute(async (req, res) => {
  const quantity = z.number().int().min(0).max(20).safeParse(req.body?.quantity);
  if (!quantity.success) return error(res, 400, "VALIDATION_ERROR", "Quantity must be between 0 and 20.");
  const found = await prisma.cartItem.findFirst({ where: { id: pathParam(req, "id"), cart: { userId: user(res).id } }, include: { product: { include: { inventory: true } } } });
  if (!found) return error(res, 404, "CART_ITEM_NOT_FOUND", "This item is not in your cart.");
  if (quantity.data > 0 && (!found.product.inventory || quantity.data > found.product.inventory.quantity)) return error(res, 409, "OUT_OF_STOCK", "The requested quantity is not available.");
  if (quantity.data === 0) await prisma.cartItem.delete({ where: { id: found.id } });
  else await prisma.cartItem.update({ where: { id: found.id }, data: { quantity: quantity.data } });
  res.json({ data: { updated: true } });
}));
router.delete("/cart/items/:id", authenticate, asyncRoute(async (req, res) => {
  const item = await prisma.cartItem.findFirst({ where: { id: pathParam(req, "id"), cart: { userId: user(res).id } } });
  if (!item) return error(res, 404, "CART_ITEM_NOT_FOUND", "This item is not in your cart.");
  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json({ data: { removed: true } });
}));
router.delete("/cart", authenticate, asyncRoute(async (_req, res) => {
  await prisma.cartItem.deleteMany({ where: { cart: { userId: user(res).id } } });
  res.json({ data: { cleared: true } });
}));
router.put("/cart/merge", authenticate, asyncRoute(async (req, res) => {
  const input = z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(20) })).max(100).safeParse(req.body?.items);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "The saved basket could not be merged.");
  const cart = await prisma.cart.upsert({ where: { userId: user(res).id }, update: {}, create: { userId: user(res).id } });
  await prisma.$transaction(async tx => {
    for (const line of input.data) {
      const product = await tx.product.findFirst({ where: { id: line.productId, active: true }, include: { inventory: true } });
      if (!product?.inventory || product.inventory.quantity < 1) continue;
      const existing = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: product.id } } });
      const quantity = Math.min(product.inventory.quantity, 20, Math.max(existing?.quantity ?? 0, line.quantity));
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
        update: { quantity },
        create: { cartId: cart.id, productId: product.id, quantity }
      });
    }
  });
  const merged = await prisma.cart.findUnique({ where: { id: cart.id }, include: { items: true } });
  res.json({ data: merged });
}));

router.get("/users/me/addresses", authenticate, asyncRoute(async (_req, res) => {
  const addresses = await prisma.address.findMany({ where: { userId: user(res).id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  res.json({ data: addresses });
}));
const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(80), phone: z.string().regex(/^[6-9]\d{9}$/),
  house: z.string().trim().min(1).max(100), street: z.string().trim().min(2).max(120),
  landmark: z.string().trim().max(120).optional(), locality: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80),
  pinCode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
  type: z.enum(["Home", "Work", "Other"]), isDefault: z.boolean().default(false)
});
router.post("/users/me/addresses", authenticate, asyncRoute(async (req, res) => {
  const input = addressSchema.safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Check the address details.");
  const address = await prisma.$transaction(async tx => {
    if (input.data.isDefault) await tx.address.updateMany({ where: { userId: user(res).id }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input.data, userId: user(res).id } });
  });
  res.status(201).json({ data: address });
}));
router.patch("/users/me/addresses/:id", authenticate, asyncRoute(async (req, res) => {
  const input = addressSchema.partial().safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Check the address details.");
  const existing = await prisma.address.findFirst({ where: { id: pathParam(req, "id"), userId: user(res).id } });
  if (!existing) return error(res, 404, "ADDRESS_NOT_FOUND", "Address not found.");
  const updated = await prisma.$transaction(async tx => {
    if (input.data.isDefault) await tx.address.updateMany({ where: { userId: user(res).id }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: input.data });
  });
  res.json({ data: updated });
}));
router.delete("/users/me/addresses/:id", authenticate, asyncRoute(async (req, res) => {
  const result = await prisma.address.deleteMany({ where: { id: pathParam(req, "id"), userId: user(res).id } });
  if (result.count === 0) return error(res, 404, "ADDRESS_NOT_FOUND", "Address not found.");
  res.json({ data: { deleted: true } });
}));

async function calculateQuote(userId: string, couponCode?: string, db: Prisma.TransactionClient = prisma) {
  const cart = await db.cart.findUnique({ where: { userId }, include: { items: { include: { product: { include: { inventory: true } } } } } });
  if (!cart?.items.length) throw new AppError(400, "EMPTY_CART", "Add items to your cart before checkout.");
  let subtotalPaise = 0;
  for (const item of cart.items) {
    if (!item.product.active || !item.product.inventory || item.product.inventory.quantity < item.quantity) throw new AppError(409, "OUT_OF_STOCK", `${item.product.name} is no longer available in that quantity.`);
    subtotalPaise += item.product.pricePaise * item.quantity;
  }
  let discountPaise = 0;
  let coupon: { id: string; code: string } | null = null;
  if (couponCode) {
    const match = await db.coupon.findUnique({ where: { code: couponCode.trim().toUpperCase() } });
    const now = new Date();
    if (!match || !match.active || match.startsAt > now || match.expiresAt < now || (match.usageLimit !== null && match.usedCount >= match.usageLimit)) throw new AppError(400, "INVALID_COUPON", "This coupon is invalid or has expired.");
    const priorUses = await db.couponRedemption.count({ where: { couponId: match.id, userId } });
    if (priorUses >= match.perUserLimit) throw new AppError(400, "COUPON_LIMIT", "You have already used this coupon the maximum number of times.");
    if (subtotalPaise < match.minOrderPaise) throw new AppError(400, "COUPON_MINIMUM", `Add ${formatRupees(match.minOrderPaise - subtotalPaise)} more to use this coupon.`);
    discountPaise = match.type === "PERCENT" ? Math.floor(subtotalPaise * match.value / 100) : match.value;
    if (match.maxDiscount !== null) discountPaise = Math.min(discountPaise, match.maxDiscount);
    discountPaise = Math.min(discountPaise, subtotalPaise);
    coupon = { id: match.id, code: match.code };
  }
  const deliveryFeePaise = subtotalPaise >= 49900 ? 0 : 2500;
  const platformFeePaise = 500;
  return { cart, subtotalPaise, discountPaise, deliveryFeePaise, platformFeePaise, totalPaise: subtotalPaise - discountPaise + deliveryFeePaise + platformFeePaise, coupon };
}
function formatRupees(paise: number) { return `₹${Math.ceil(paise / 100)}`; }

router.post("/coupons/validate", authenticate, asyncRoute(async (req, res) => {
  const code = z.string().trim().min(1).max(40).safeParse(req.body?.code);
  if (!code.success) return error(res, 400, "VALIDATION_ERROR", "Enter a coupon code.");
  try {
    const quote = await calculateQuote(user(res).id, code.data);
    res.json({ data: { code: quote.coupon?.code, discountPaise: quote.discountPaise, totalPaise: quote.totalPaise } });
  } catch (e) { if (e instanceof AppError) return error(res, e.status, e.code, e.message); throw e; }
}));
router.post("/checkout/quote", authenticate, asyncRoute(async (req, res) => {
  const code = z.string().optional().safeParse(req.body?.couponCode);
  if (!code.success) return error(res, 400, "VALIDATION_ERROR", "Invalid coupon code.");
  try {
    const quote = await calculateQuote(user(res).id, code.data);
    res.json({ data: { subtotalPaise: quote.subtotalPaise, discountPaise: quote.discountPaise, deliveryFeePaise: quote.deliveryFeePaise, platformFeePaise: quote.platformFeePaise, totalPaise: quote.totalPaise } });
  } catch (e) { if (e instanceof AppError) return error(res, e.status, e.code, e.message); throw e; }
}));
router.post("/orders", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ addressId: z.string().min(1), couponCode: z.string().trim().max(40).optional(), paymentMethod: z.nativeEnum(PaymentMethod) }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Choose an address and payment method.");
  const deliveryAddress = await prisma.address.findFirst({ where: { id: input.data.addressId, userId: user(res).id } });
  if (!deliveryAddress) return error(res, 404, "ADDRESS_NOT_FOUND", "Choose a saved delivery address.");
  const zones = await prisma.deliveryZone.findMany({ where: { active: true }, select: { pinPrefix: true } });
  if (!zones.some(zone => deliveryAddress.pinCode.startsWith(zone.pinPrefix))) return error(res, 400, "UNSERVICEABLE", "We are not delivering to this PIN code yet. Please choose a supported delivery area.");
  try {
    const created = await prisma.$transaction(async tx => {
      const quote = await calculateQuote(user(res).id, input.data.couponCode, tx);
      for (const item of quote.cart.items) {
        const updated = await tx.inventory.updateMany({
          where: { productId: item.productId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } }
        });
        if (updated.count !== 1) throw new AppError(409, "OUT_OF_STOCK", `${item.product.name} just sold out. Your cart has been preserved.`);
      }
      const order = await tx.order.create({
        data: {
          orderNumber: `QOR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          userId: user(res).id, addressId: deliveryAddress.id,
          addressSnapshot: { fullName: deliveryAddress.fullName, phone: deliveryAddress.phone, house: deliveryAddress.house, street: deliveryAddress.street, landmark: deliveryAddress.landmark, locality: deliveryAddress.locality, city: deliveryAddress.city, state: deliveryAddress.state, pinCode: deliveryAddress.pinCode },
          subtotalPaise: quote.subtotalPaise, discountPaise: quote.discountPaise, deliveryFeePaise: quote.deliveryFeePaise, platformFeePaise: quote.platformFeePaise, totalPaise: quote.totalPaise,
          couponCode: quote.coupon?.code, paymentMethod: input.data.paymentMethod,
          paymentStatus: input.data.paymentMethod === PaymentMethod.COD ? "PENDING" : "DEMO_ONLY",
          estimatedDelivery: new Date(Date.now() + 35 * 60 * 1000),
          payment: { create: {
            provider: input.data.paymentMethod === PaymentMethod.COD ? "COD" : "DEMO",
            status: input.data.paymentMethod === PaymentMethod.COD ? "PENDING" : "DEMO_ONLY",
            amountPaise: quote.totalPaise
          } },
          items: { create: quote.cart.items.map(item => ({ productId: item.product.id, productName: item.product.name, productSku: item.product.sku, image: item.product.image, unit: item.product.unit, quantity: item.quantity, unitPricePaise: item.product.pricePaise, mrpPaise: item.product.mrpPaise })) }
        },
        include: { items: true }
      });
      if (quote.coupon) {
        const changed = await tx.coupon.updateMany({ where: { id: quote.coupon.id, active: true, OR: [{ usageLimit: null }, { usedCount: { lt: (await tx.coupon.findUniqueOrThrow({ where: { id: quote.coupon.id } })).usageLimit ?? 0 } }] }, data: { usedCount: { increment: 1 } } });
        if (changed.count !== 1) throw new AppError(409, "COUPON_LIMIT", "This coupon has just reached its usage limit.");
        await tx.couponRedemption.create({ data: { couponId: quote.coupon.id, userId: user(res).id, orderId: order.id } });
      }
      await tx.cartItem.deleteMany({ where: { cartId: quote.cart.id } });
      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: created });
  } catch (e) {
    if (e instanceof AppError) return error(res, e.status, e.code, e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return error(res, 409, "CHECKOUT_CONFLICT", "Stock changed while you were checking out. Please review your cart.");
    throw e;
  }
}));
router.get("/orders", authenticate, asyncRoute(async (_req, res) => {
  const orders = await prisma.order.findMany({ where: { userId: user(res).id }, include: { items: true }, orderBy: { createdAt: "desc" } });
  res.json({ data: orders });
}));
router.get("/orders/:id", authenticate, asyncRoute(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: pathParam(req, "id"), userId: user(res).id }, include: { items: true, assignment: { select: { status: true } } } });
  if (!order) return error(res, 404, "ORDER_NOT_FOUND", "Order not found.");
  res.json({ data: order });
}));
router.post("/orders/:id/cancel", authenticate, asyncRoute(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: pathParam(req, "id"), userId: user(res).id }, include: { items: true } });
  if (!order) return error(res, 404, "ORDER_NOT_FOUND", "Order not found.");
  if (!["PENDING", "CONFIRMED"].includes(order.status)) return error(res, 409, "INVALID_TRANSITION", "This order can no longer be cancelled.");
  await prisma.$transaction(async tx => {
    const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: OrderStatus.CANCELLED } });
    if (!changed.count) throw new AppError(409, "INVALID_TRANSITION", "This order has already changed and can no longer be cancelled.");
    for (const item of order.items) if (item.productId) await tx.inventory.update({ where: { productId: item.productId }, data: { quantity: { increment: item.quantity } } });
  });
  res.json({ data: { cancelled: true } });
}));

const admin = [authenticate, allowRoles(Role.ADMIN)];
router.get("/admin/analytics", ...admin, asyncRoute(async (_req, res) => {
  const [orders, customers, activeProducts, lowStock, pending] = await Promise.all([
    prisma.order.findMany({ select: { totalPaise: true, createdAt: true, status: true, items: { select: { quantity: true, unitPricePaise: true, product: { select: { category: { select: { name: true } } } } } } } }),
    prisma.user.count({ where: { role: Role.CUSTOMER, active: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.inventory.count({ where: { quantity: { lte: 5 } } }),
    prisma.order.count({ where: { status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] } } })
  ]);
  const qualifyingOrders = orders.filter(order => order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.FAILED);
  const revenue = qualifyingOrders.reduce((sum, order) => sum + order.totalPaise, 0);
  const statusCounts = new Map<string, number>();
  const categoryRevenue = new Map<string, number>();
  const salesByDate = new Map<string, { revenuePaise: number; orders: number }>();
  for (const order of orders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.FAILED) continue;
    const dateKey = order.createdAt.toISOString().slice(0, 10);
    const day = salesByDate.get(dateKey) ?? { revenuePaise: 0, orders: 0 };
    day.revenuePaise += order.totalPaise;
    day.orders++;
    salesByDate.set(dateKey, day);
    for (const item of order.items) {
      const name = item.product?.category.name ?? "Other";
      categoryRevenue.set(name, (categoryRevenue.get(name) ?? 0) + item.unitPricePaise * item.quantity);
    }
  }
  const salesTrend = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - offset));
    const key = date.toISOString().slice(0, 10);
    return { date: key, day: date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }), ...(salesByDate.get(key) ?? { revenuePaise: 0, orders: 0 }) };
  });
  const orderStatuses = Array.from(statusCounts, ([status, count]) => ({ status, count }));
  const categoryPerformance = Array.from(categoryRevenue, ([category, revenuePaise]) => ({ category, revenuePaise })).sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 8);
  res.json({ data: {
    totalOrders: orders.length, revenuePaise: revenue,
    averageOrderValuePaise: qualifyingOrders.length ? Math.round(revenue / qualifyingOrders.length) : 0,
    customers, activeProducts, lowStock, pendingOrders: pending,
    cancellationRate: orders.length ? Math.round(orders.filter(order => order.status === OrderStatus.CANCELLED).length * 100 / orders.length) : 0,
    salesTrend, orderStatuses, categoryPerformance
  } });
}));
router.get("/admin/products", ...admin, asyncRoute(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const [products, total] = await Promise.all([
    prisma.product.findMany({ where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}, include: { category: true, inventory: true }, skip: (page - 1) * 20, take: 20, orderBy: { name: "asc" } }),
    prisma.product.count({ where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {} })
  ]);
  res.json({ data: { products, total, page } });
}));
const productInput = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(500),
  brand: z.string().trim().min(1).max(80), categoryId: z.string().min(1),
  pricePaise: z.number().int().positive(), mrpPaise: z.number().int().positive(),
  unit: z.string().trim().min(1).max(40), sku: z.string().trim().min(3).max(40),
  image: z.string().url(), quantity: z.number().int().min(0).default(0), active: z.boolean().default(true)
}).refine(value => value.mrpPaise === undefined || value.pricePaise === undefined || value.mrpPaise >= value.pricePaise, { message: "MRP must be at least the selling price." });
router.post("/admin/products", ...admin, asyncRoute(async (req, res) => {
  const input = productInput.safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Check product details.");
  if (!await prisma.category.findUnique({ where: { id: input.data.categoryId } })) return error(res, 400, "INVALID_CATEGORY", "Choose an existing product category.");
  const slugBase = input.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const slug = `${slugBase}-${Date.now().toString(36)}`;
  const product = await prisma.$transaction(async tx => {
    const { quantity, active, ...productData } = input.data;
    const created = await tx.product.create({ data: { ...productData, slug, featured: false, active } });
    await tx.inventory.create({ data: { productId: created.id, quantity } });
    await tx.inventoryMovement.create({ data: { productId: created.id, actorId: user(res).id, delta: quantity, reason: "Initial stock" } });
    await tx.auditLog.create({ data: { actorId: user(res).id, action: "PRODUCT_CREATED", entityType: "Product", entityId: created.id } });
    return created;
  });
  res.status(201).json({ data: product });
}));
router.patch("/admin/products/:id", ...admin, asyncRoute(async (req, res) => {
  const input = productInput.partial().safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Check product details.");
  const found = await prisma.product.findUnique({ where: { id: pathParam(req, "id") } });
  if (!found) return error(res, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  const { quantity, ...productData } = input.data;
  const nextPrice = productData.pricePaise ?? found.pricePaise;
  const nextMrp = productData.mrpPaise ?? found.mrpPaise;
  if (nextMrp < nextPrice) return error(res, 400, "VALIDATION_ERROR", "MRP must be at least the selling price.");
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.product.update({ where: { id: found.id }, data: productData });
    if (quantity !== undefined) {
      const inventory = await tx.inventory.findUniqueOrThrow({ where: { productId: found.id } });
      const delta = quantity - inventory.quantity;
      await tx.inventory.update({ where: { productId: found.id }, data: { quantity } });
      if (delta !== 0) await tx.inventoryMovement.create({ data: { productId: found.id, actorId: user(res).id, delta, reason: "Admin product edit" } });
    }
    await tx.auditLog.create({ data: { actorId: user(res).id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: found.id } });
    return result;
  });
  res.json({ data: updated });
}));
router.get("/admin/inventory", ...admin, asyncRoute(async (_req, res) => {
  const stock = await prisma.inventory.findMany({ include: { product: { select: { id: true, name: true, sku: true, image: true } } }, orderBy: { quantity: "asc" } });
  res.json({ data: stock });
}));
router.post("/admin/inventory/adjustments", ...admin, asyncRoute(async (req, res) => {
  const input = z.object({ productId: z.string().min(1), delta: z.number().int().min(-10000).max(10000), reason: z.string().trim().min(3).max(160) }).safeParse(req.body);
  if (!input.success || input.data.delta === 0) return error(res, 400, "VALIDATION_ERROR", "Provide a non-zero stock change and reason.");
  const inventory = await prisma.inventory.findUnique({ where: { productId: input.data.productId } });
  if (!inventory) return error(res, 404, "PRODUCT_NOT_FOUND", "Inventory record not found.");
  if (inventory.quantity + input.data.delta < inventory.reserved) return error(res, 409, "INVALID_STOCK", "Available stock cannot fall below reserved stock.");
  await prisma.$transaction(async tx => {
    const changed = await tx.inventory.updateMany({
      where: { productId: input.data.productId, quantity: { gte: inventory.reserved - input.data.delta } },
      data: { quantity: { increment: input.data.delta } }
    });
    if (!changed.count) throw new AppError(409, "INVALID_STOCK", "The stock changed before this adjustment could be applied.");
    await tx.inventoryMovement.create({ data: { productId: input.data.productId, actorId: user(res).id, delta: input.data.delta, reason: input.data.reason } });
    await tx.auditLog.create({ data: { actorId: user(res).id, action: "INVENTORY_ADJUSTED", entityType: "Product", entityId: input.data.productId, metadata: { delta: input.data.delta, reason: input.data.reason } } });
  });
  res.json({ data: { adjusted: true } });
}));
router.get("/admin/orders", ...admin, asyncRoute(async (_req, res) => {
  const orders = await prisma.order.findMany({ include: { user: { select: { id: true, name: true, email: true, phone: true } }, items: true, assignment: { include: { partner: { include: { user: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ data: orders });
}));
router.get("/admin/delivery/partners", ...admin, asyncRoute(async (_req, res) => {
  const partners = await prisma.deliveryPartnerProfile.findMany({
    include: { user: { select: { id: true, name: true, phone: true, active: true } }, _count: { select: { assignments: true } } },
    orderBy: [{ available: "desc" }, { user: { name: "asc" } }]
  });
  res.json({ data: partners });
}));
router.post("/admin/delivery/assignments", ...admin, asyncRoute(async (req, res) => {
  const input = z.object({ orderId: z.string().min(1), partnerId: z.string().min(1) }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Select an order and delivery partner.");
  const [order, partner] = await Promise.all([
    prisma.order.findUnique({ where: { id: input.data.orderId } }),
    prisma.deliveryPartnerProfile.findUnique({ where: { id: input.data.partnerId }, include: { user: { select: { active: true } } } })
  ]);
  if (!order) return error(res, 404, "ORDER_NOT_FOUND", "Order not found.");
  if (!partner?.user.active) return error(res, 404, "PARTNER_NOT_FOUND", "Delivery partner not found or inactive.");
  if (order.status !== OrderStatus.READY_FOR_PICKUP) return error(res, 409, "INVALID_ASSIGNMENT", "Move the order to READY_FOR_PICKUP before assigning a delivery partner.");
  const existing = await prisma.deliveryAssignment.findUnique({ where: { orderId: order.id } });
  if (existing && ["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"].includes(existing.status)) return error(res, 409, "INVALID_ASSIGNMENT", "An active delivery cannot be reassigned.");
  const assignment = await prisma.$transaction(async tx => {
    const assigned = await tx.deliveryAssignment.upsert({
      where: { orderId: order.id },
      update: { partnerId: partner.id, status: "ASSIGNED" },
      create: { orderId: order.id, partnerId: partner.id, status: "ASSIGNED" }
    });
    await tx.auditLog.create({ data: { actorId: user(res).id, action: "DELIVERY_ASSIGNED", entityType: "Order", entityId: order.id, metadata: { partnerId: partner.id } } });
    return assigned;
  });
  res.status(existing ? 200 : 201).json({ data: assignment });
}));
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.FAILED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.FAILED],
  PREPARING: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  READY_FOR_PICKUP: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.FAILED],
  DELIVERED: [], CANCELLED: [], FAILED: []
};
router.patch("/admin/orders/:id/status", ...admin, asyncRoute(async (req, res) => {
  const status = z.nativeEnum(OrderStatus).safeParse(req.body?.status);
  if (!status.success) return error(res, 400, "VALIDATION_ERROR", "Select a valid order status.");
  const order = await prisma.order.findUnique({ where: { id: pathParam(req, "id") } });
  if (!order) return error(res, 404, "ORDER_NOT_FOUND", "Order not found.");
  if (!allowedTransitions[order.status].includes(status.data)) return error(res, 409, "INVALID_TRANSITION", `Cannot move an order from ${order.status} to ${status.data}.`);
  await prisma.$transaction(async tx => {
    const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: status.data } });
    if (!changed.count) throw new AppError(409, "INVALID_TRANSITION", "This order has already changed. Refresh and try again.");
    await tx.auditLog.create({ data: { actorId: user(res).id, action: "ORDER_STATUS_CHANGED", entityType: "Order", entityId: order.id, metadata: { from: order.status, to: status.data } } });
  });
  res.json({ data: { updated: true, status: status.data } });
}));
router.get("/admin/customers", ...admin, asyncRoute(async (_req, res) => {
  const customers = await prisma.user.findMany({ where: { role: Role.CUSTOMER }, select: { id: true, name: true, email: true, phone: true, createdAt: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ data: customers });
}));
router.get("/admin/coupons", ...admin, asyncRoute(async (_req, res) => res.json({ data: await prisma.coupon.findMany({ orderBy: { code: "asc" } }) })));
router.post("/admin/coupons", ...admin, asyncRoute(async (req, res) => {
  const input = z.object({ code: z.string().trim().min(3).max(40).transform(v => v.toUpperCase()), type: z.enum(["PERCENT", "FIXED"]), value: z.number().int().positive(), minOrderPaise: z.number().int().nonnegative(), maxDiscount: z.number().int().positive().nullable().optional(), startsAt: z.string().datetime(), expiresAt: z.string().datetime(), usageLimit: z.number().int().positive().nullable().optional(), perUserLimit: z.number().int().positive().default(1), active: z.boolean().default(true) }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Check coupon details.");
  if (new Date(input.data.expiresAt) <= new Date(input.data.startsAt)) return error(res, 400, "VALIDATION_ERROR", "Expiry must be after the start date.");
  const coupon = await prisma.coupon.create({ data: { ...input.data, startsAt: new Date(input.data.startsAt), expiresAt: new Date(input.data.expiresAt) } });
  res.status(201).json({ data: coupon });
}));
router.patch("/admin/coupons/:id", ...admin, asyncRoute(async (req, res) => {
  const input = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!input.success) return error(res, 400, "VALIDATION_ERROR", "Provide a valid active state.");
  const coupon = await prisma.coupon.updateMany({ where: { id: pathParam(req, "id") }, data: input.data });
  if (!coupon.count) return error(res, 404, "COUPON_NOT_FOUND", "Coupon not found.");
  res.json({ data: { updated: true } });
}));

router.get("/delivery/profile", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (_req, res) => {
  const profile = await prisma.deliveryPartnerProfile.findUnique({ where: { userId: user(res).id } });
  res.json({ data: profile });
}));
router.patch("/delivery/availability", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (req, res) => {
  const available = z.boolean().safeParse(req.body?.available);
  if (!available.success) return error(res, 400, "VALIDATION_ERROR", "Choose an availability state.");
  const profile = await prisma.deliveryPartnerProfile.update({ where: { userId: user(res).id }, data: { available: available.data } });
  res.json({ data: profile });
}));
router.get("/delivery/tasks", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (_req, res) => {
  const profile = await prisma.deliveryPartnerProfile.findUnique({ where: { userId: user(res).id } });
  if (!profile) return error(res, 404, "PROFILE_NOT_FOUND", "Delivery partner profile not found.");
  const tasks = await prisma.deliveryAssignment.findMany({ where: { partnerId: profile.id }, include: { order: { include: { items: true, user: { select: { name: true, phone: true } } } } }, orderBy: { assignedAt: "desc" } });
  res.json({ data: tasks });
}));
router.post("/delivery/tasks/:id/accept", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (req, res) => {
  const profile = await prisma.deliveryPartnerProfile.findUnique({ where: { userId: user(res).id } });
  if (!profile) return error(res, 404, "PROFILE_NOT_FOUND", "Delivery partner profile not found.");
  const task = await prisma.deliveryAssignment.findFirst({ where: { id: pathParam(req, "id"), partnerId: profile.id } });
  if (!task) return error(res, 404, "TASK_NOT_FOUND", "Delivery task not found.");
  if (task.status !== "ASSIGNED") return error(res, 409, "INVALID_TRANSITION", "This task is no longer available to accept.");
  const changed = await prisma.deliveryAssignment.updateMany({ where: { id: task.id, partnerId: profile.id, status: "ASSIGNED" }, data: { status: "ACCEPTED" } });
  if (!changed.count) return error(res, 409, "INVALID_TRANSITION", "This task has already changed. Refresh and try again.");
  res.json({ data: { accepted: true } });
}));
router.post("/delivery/tasks/:id/reject", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (req, res) => {
  const profile = await prisma.deliveryPartnerProfile.findUnique({ where: { userId: user(res).id } });
  if (!profile) return error(res, 404, "PROFILE_NOT_FOUND", "Delivery partner profile not found.");
  const task = await prisma.deliveryAssignment.findFirst({ where: { id: pathParam(req, "id"), partnerId: profile.id } });
  if (!task) return error(res, 404, "TASK_NOT_FOUND", "Delivery task not found.");
  if (task.status !== "ASSIGNED") return error(res, 409, "INVALID_TRANSITION", "Only an unaccepted task can be rejected.");
  await prisma.$transaction([
    prisma.deliveryAssignment.update({ where: { id: task.id }, data: { status: "REJECTED" } }),
    prisma.auditLog.create({ data: { actorId: user(res).id, action: "DELIVERY_REJECTED", entityType: "Order", entityId: task.orderId } })
  ]);
  res.json({ data: { rejected: true } });
}));
router.post("/delivery/tasks/:id/status", authenticate, allowRoles(Role.DELIVERY), asyncRoute(async (req, res) => {
  const status = z.enum(["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]).safeParse(req.body?.status);
  if (!status.success) return error(res, 400, "VALIDATION_ERROR", "Select a valid delivery step.");
  const profile = await prisma.deliveryPartnerProfile.findUnique({ where: { userId: user(res).id } });
  if (!profile) return error(res, 404, "PROFILE_NOT_FOUND", "Delivery partner profile not found.");
  const task = await prisma.deliveryAssignment.findFirst({ where: { id: pathParam(req, "id"), partnerId: profile.id }, include: { order: true } });
  if (!task) return error(res, 404, "TASK_NOT_FOUND", "Delivery task not found.");
  const next: Record<string, { assignment: string; order: OrderStatus; valid: string[] }> = {
    PICKED_UP: { assignment: "PICKED_UP", order: OrderStatus.OUT_FOR_DELIVERY, valid: ["ACCEPTED"] },
    OUT_FOR_DELIVERY: { assignment: "OUT_FOR_DELIVERY", order: OrderStatus.OUT_FOR_DELIVERY, valid: ["PICKED_UP"] },
    DELIVERED: { assignment: "DELIVERED", order: OrderStatus.DELIVERED, valid: ["OUT_FOR_DELIVERY"] }
  };
  const target = next[status.data];
  if (!target.valid.includes(task.status)) return error(res, 409, "INVALID_TRANSITION", `Cannot move delivery from ${task.status} to ${status.data}.`);
  await prisma.$transaction(async tx => {
    const changed = await tx.deliveryAssignment.updateMany({ where: { id: task.id, partnerId: profile.id, status: task.status }, data: { status: target.assignment } });
    if (!changed.count) throw new AppError(409, "INVALID_TRANSITION", "This delivery has already changed. Refresh and try again.");
    if (target.order !== task.order.status) {
      const orderChanged = await tx.order.updateMany({ where: { id: task.orderId, status: task.order.status }, data: { status: target.order } });
      if (!orderChanged.count) throw new AppError(409, "INVALID_TRANSITION", "The order status has already changed.");
    }
  });
  res.json({ data: { status: status.data } });
}));

app.use("/api/v1", router);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use((req, res) => error(res, 404, "NOT_FOUND", `No route found for ${req.method} ${req.path}.`));

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const requestId = res.locals.requestId;
  if (err instanceof AppError) return error(res, err.status, err.code, err.message);
  console.error(JSON.stringify({ requestId, error: err instanceof Error ? err.message : "Unknown error" }));
  return error(res, 500, "INTERNAL_ERROR", env.NODE_ENV === "production" ? "An unexpected error occurred." : err instanceof Error ? err.message : "Unexpected error.");
};
app.use(errorHandler);

class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function setSession(res: express.Response, id: string) {
  const token = jwt.sign({}, env.JWT_SECRET, { subject: id, expiresIn: "7d" });
  res.cookie("quickora_session", token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}
function cookieOptions() {
  return { httpOnly: true, secure: env.COOKIE_SECURE === "true", sameSite: "lax" as const, path: "/" };
}
