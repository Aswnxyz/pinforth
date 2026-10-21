import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type { OrganizationRole } from "../generated/prisma/client.js";
import { forbidden, notFound, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const orgIdSchema = z.uuid();

// Non-members get the same 404 as a missing organization, so IDs can't be
// probed to learn which organizations exist.
const orgNotFound = () => notFound("Organization not found");

// Mount after requireAuth on routes with an :orgId param. With no roles, any member passes.
export function requireOrgRole(...roles: OrganizationRole[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) throw unauthorized();

    const parsed = orgIdSchema.safeParse(req.params.orgId);
    if (!parsed.success) throw orgNotFound();

    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: parsed.data, userId: req.auth.userId } },
      select: { id: true, organizationId: true, role: true },
    });

    if (!membership) throw orgNotFound();

    // They're a member, so it's fine to say the action itself isn't allowed.
    if (roles.length > 0 && !roles.includes(membership.role)) {
      throw forbidden("Your role in this organization doesn't allow this");
    }

    req.membership = membership;
    next();
  };
}

export function getMembership(req: Request) {
  if (!req.membership) throw orgNotFound();
  return req.membership;
}
