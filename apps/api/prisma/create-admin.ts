import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const password = required("ADMIN_PASSWORD");
if (password.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
if (password.length > 72) throw new Error("ADMIN_PASSWORD must contain no more than 72 characters");
const name = required("ADMIN_NAME").trim();
if (name.length < 2) throw new Error("ADMIN_NAME must contain at least two characters");
const email = required("ADMIN_EMAIL").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL must be a valid email address");
const phone = required("ADMIN_PHONE").trim();
if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("ADMIN_PHONE must be a 10-digit Indian mobile number");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required("DATABASE_URL") })
});

try {
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      role: Role.ADMIN,
      cart: { create: {} }
    },
    select: { id: true, email: true, role: true }
  });
  console.info(`Created administrator ${user.email} (${user.id}).`);
} finally {
  await prisma.$disconnect();
}
