process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.WEB_ORIGIN ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://quickora:quickora_test@localhost:5432/quickora?schema=public";
process.env.JWT_SECRET ??= "quickora-test-secret-at-least-32-characters-long";
process.env.COOKIE_SECURE ??= "false";
