"use client";

import { useAuth } from "@/lib/auth/context";
import { primaryCtaAction } from "./landing-content";
import { PrimaryCta } from "./primary-cta";

/**
 * The closing CTA, resolved from the live session like the hero's.
 *
 * A client island so a signed-in visitor is sent to their workspace instead
 * of the static anonymous `/register` link.
 */
export function ClosingCta() {
  const { isAuthenticated, isLoading } = useAuth();
  return <PrimaryCta action={primaryCtaAction(isAuthenticated, isLoading)} />;
}
