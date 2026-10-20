
import express from "express";
import cors from "cors";

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  })
);

app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Pinforth API is running",
  });
});

// Unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;
