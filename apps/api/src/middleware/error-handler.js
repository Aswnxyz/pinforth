import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export const notFoundHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: "Route not found",
  });
};

// Errors thrown by express.json() carry a `type` from body-parser.
const isBodyParserError = (err) =>
  typeof err === "object" &&
  err !== null &&
  typeof err.type === "string" &&
  "status" in err;

export const errorHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (isBodyParserError(err)) {
    const tooLarge = err.type === "entity.too.large";

    res.status(tooLarge ? 413 : 400).json({
      success: false,
      code: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY",
      message: tooLarge ? "Request body is too large" : "Request body is not valid JSON",
    });
    return;
  }

  if (env.NODE_ENV !== "test") {
    console.error(err);
  }

  // Never leak internals to the client.
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};
