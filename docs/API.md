# API reference

All application routes are versioned under `/api/v1`; JSON success bodies use `{ "data": ... }`, errors use `{ "error": { "code", "message", "requestId" } }`. Swagger UI is served at `/api-docs` and the OpenAPI document at `/api/v1/openapi.json`.

## Main routes

| Capability | Routes |
|---|---|
| Health | `GET /health`, `GET /ready` |
| Authentication | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Catalog | `GET /categories`, `GET /products`, `GET /products/search?q=...`, `GET /products/:slug` |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `DELETE /cart`, `PUT /cart/merge` |
| Addresses | `GET /users/me/addresses`, `POST /users/me/addresses`, `PATCH /users/me/addresses/:id`, `DELETE /users/me/addresses/:id` |
| Checkout/orders | `POST /coupons/validate`, `POST /checkout/quote`, `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` |
| Admin | `GET /admin/analytics`, product CRUD/activation, inventory listing/adjustments, order listing/status changes, customers and coupon listing/activation |
| Delivery | profile, availability, assigned tasks, accept/reject task and status progression |

Authentication uses a signed JWT in an HTTP-only, same-site lax cookie. API mutations validate inputs on the server. Customer order and address queries are scoped to the authenticated owner. Administrative endpoints require the ADMIN role; delivery routes require DELIVERY and scope assignments to the authenticated partner.

Product page filters include `q`, `category`, `brand`, `minPrice`, `maxPrice`, `inStock`, `sort`, `page` and `limit`. Sorting options are `popular`, `price-asc`, `price-desc`, `rating` and `discount`.
