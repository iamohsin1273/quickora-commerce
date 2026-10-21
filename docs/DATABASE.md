# Database

Prisma 7 schema and client configuration are in `apps/api/prisma/schema.prisma` and `apps/api/prisma.config.ts`; the initial PostgreSQL migration is in `apps/api/prisma/migrations`. Monetary values are stored as integer paise. Order items and address snapshots preserve the historical product name, SKU, unit, image, quantities, price and delivery address even if the source records change.

Core relations cover users and roles, addresses, categories/products, inventory/movements, account carts, coupons/redemptions, orders/items, delivery partner profiles/assignments and administrative audit logs. Product/category, inventory, order owner/status and coupon redemption lookups have supporting indexes and unique constraints.

Run migration and seed with:

```powershell
npm run prisma:generate -w @quickora/api
npm run db:migrate -w @quickora/api
npm run db:seed -w @quickora/api
```

The seed uses upserts for categories, products, inventory, demo users, partner profile and coupons so rerunning it does not duplicate those records.
