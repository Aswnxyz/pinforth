import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requireTrustedOrigin } from "./middleware/trusted-origin.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { invitationLinkRoutes, organizationInvitationRoutes } from "./modules/invitations/invitations.routes.js";
import organizationRoutes from "./modules/organizations/organizations.routes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet());

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  })
);

app.use(requireTrustedOrigin);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Pinforth API is running",
  });
});

app.use("/api/v1/auth", authRoutes);
// Before the organizations router, whose own requireAuth would otherwise run first.
app.use("/api/v1/organizations/:orgId/invitations", organizationInvitationRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/invitations", invitationLinkRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
