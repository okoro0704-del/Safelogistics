"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Shield } from "lucide-react";

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

type Status = {
  setupAvailable?: boolean;
  supabaseHost?: string;
  misconfiguredLocal?: boolean;
  hadExtraPath?: boolean;
  error?: string;
};

export function MasterAdminSetupForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState("master@parcelmovement.app");
  const [password, setPassword] = useState("TempMaster123!");
  const [fullName, setFullName] = useState("Platform Master");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/master-admin/bootstrap", {
          cache: "no-store",
        });
        const data = (await res.json()) as Status;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) {
          setStatus({ error: "Could not reach bootstrap API." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/master-admin/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, fullName }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          setFormError(data.error ?? "Setup failed.");
          return;
        }
        setSuccess(data.message ?? "Master Admin created.");
        router.push("/hub/login");
        router.refresh();
      } catch {
        setFormError("Setup request failed. Check Netlify env vars.");
      }
    });
  }

  if (!status) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking setup…
        </CardContent>
      </Card>
    );
  }

  if (status.misconfiguredLocal) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>Supabase misconfigured</CardTitle>
          <CardDescription>
            This Netlify site is using a localhost Supabase URL (
            {status.supabaseHost}). Login cannot work until you set production
            env vars and redeploy.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.error) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>Setup unavailable</CardTitle>
          <CardDescription>{status.error}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Confirm <code>SUPABASE_SERVICE_ROLE_KEY</code> is set in Netlify and
          migrations were applied with <code>supabase db push</code>.
        </CardContent>
      </Card>
    );
  }

  if (!status.setupAvailable) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>Master Admin already exists</CardTitle>
          <CardDescription>
            First-time setup is locked. Sign in at the Application Hub, or reset
            the password in Supabase → Authentication → Users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/hub/login">Go to Application Hub login</Link>
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If SQL created a broken Master Admin and login never works, run this
            in Supabase SQL Editor, then reload this setup page:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-left text-xs">
            {`DELETE FROM public.profiles WHERE role = 'master_admin';`}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/80 shadow-md">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="size-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Create Master Admin</CardTitle>
          <CardDescription>
            One-time setup for Parcel Movement. Uses the Auth Admin API (not SQL
            password hashes). Connected to{" "}
            <span className="font-mono text-xs">{status.supabaseHost}</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="setup-name">Full name</Label>
            <Input
              id="setup-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-email">Email</Label>
            <Input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-password">Password</Label>
            <Input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {formError ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
          {status.hadExtraPath ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              Netlify Supabase URL had an extra path (e.g. /rest/v1). The app now
              strips it automatically — if create still fails, set
              NEXT_PUBLIC_SUPABASE_URL to exactly https://YOUR_REF.supabase.co
              and redeploy.
            </p>
          ) : null}
          {success ? (
            <p
              className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary"
              role="status"
            >
              {success}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create Master Admin"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
