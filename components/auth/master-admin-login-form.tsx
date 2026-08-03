"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInMasterAdminAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { PLATFORM_DEFAULTS } from "@/lib/branding";

const initialState: AuthActionState = {};

export function MasterAdminLoginForm() {
  const [state, formAction, pending] = useActionState(
    signInMasterAdminAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="w-full max-w-md border-border/80 shadow-md">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Master Admin</CardTitle>
          <CardDescription>
            Platform console for {PLATFORM_DEFAULTS.appName}. Create tenants,
            record payments, and manage company domains.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="master-email">Email</Label>
            <Input
              id="master-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="master@yourdomain.com"
              aria-invalid={Boolean(state.error)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="master-password">Password</Label>
            <div className="relative">
              <Input
                id="master-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="pr-10"
                aria-invalid={Boolean(state.error)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </div>

          {state.error ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in to Master Admin"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Tenant admin or customer?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Use company sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
