import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requireTrustedOrigin } from "./middleware/trusted-origin.js";

const app = express();

app.disable("x-powered-by");

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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
