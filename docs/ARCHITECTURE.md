# Architecture

QUICKORA is a modular monolith with a separate React client and Express API. PostgreSQL persists identity, catalog, inventory, carts, coupons, orders and delivery assignments; Prisma provides typed database access.

```mermaid
flowchart LR
  Browser[React storefront / admin / delivery] -->|HTTP + HttpOnly session cookie| API[Express REST API /api/v1]
  Browser -->|Docker build static assets| Nginx[Nginx web container]
  Nginx -->|/api and /api-docs proxy| API
  API --> Prisma[Prisma ORM]
  Prisma --> DB[(PostgreSQL)]
  API --> Docs[OpenAPI / Swagger UI]
```

The browser maintains a persisted guest basket for convenience. The API revalidates product activity, current stock, coupons and prices at checkout. A serializable transaction atomically decrements stock, writes immutable order item/address snapshots, records coupon redemption and clears the account basket. Role middleware and resource ownership checks protect private routes.

```mermaid
sequenceDiagram
  participant C as Customer
  participant W as Web client
  participant A as API
  participant D as PostgreSQL
  C->>W: Add products / choose address / coupon
  W->>A: POST checkout quote
  A->>D: Read live cart, inventory, coupon
  A-->>W: Server-calculated quote
  C->>W: Place order
  W->>A: POST /orders
  A->>D: Serializable transaction: validate, decrement, snapshot, create order
  D-->>A: Persisted order
  A-->>W: Confirmation + status
```

Order lifecycle:

```mermaid
stateDiagram-v2
  [*] --> CONFIRMED
  CONFIRMED --> PREPARING
  PREPARING --> READY_FOR_PICKUP
  READY_FOR_PICKUP --> OUT_FOR_DELIVERY
  OUT_FOR_DELIVERY --> DELIVERED
  PENDING --> CANCELLED
  CONFIRMED --> CANCELLED
  PREPARING --> CANCELLED
  CONFIRMED --> FAILED
  OUT_FOR_DELIVERY --> FAILED
```

The customer application polls persisted status every 15 seconds. Delivery dispatch and ETA are demo operations, not live GPS tracking.
