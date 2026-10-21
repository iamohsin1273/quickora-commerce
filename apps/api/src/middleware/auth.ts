import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

export type AuthUser = { id: string; role: Role; name: string; email: string; phone: string };

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.quickora_session as string | undefined;
  if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } });
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    res.clearCookie("quickora_session");
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session has expired. Please sign in again." } });
  }
  if (!claims.sub) {
    res.clearCookie("quickora_session");
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session has expired. Please sign in again." } });
  }
  void prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, role: true, name: true, email: true, phone: true, active: true } })
    .then(account => {
      if (!account?.active) {
        res.clearCookie("quickora_session");
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer active." } });
        return;
      }
      res.locals.user = account;
      next();
    })
    .catch(next);
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as AuthUser | undefined;
    if (!user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } });
    if (!roles.includes(user.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
    return next();
  };
}
