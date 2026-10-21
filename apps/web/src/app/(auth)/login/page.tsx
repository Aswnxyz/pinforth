import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Pinforth workspace to review feedback, track issues, and record client approval.",
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Sign in
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Access your agency&apos;s reviews, issues, and release approvals.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Pinforth?{" "}
        <Link
          href="/register"
          className="rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
