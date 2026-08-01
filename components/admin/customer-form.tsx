"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Eye, EyeOff, Loader2 } from "lucide-react";

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
import { useToast } from "@/components/ui/toast";

type CreatedCustomer = {
  id: string;
  full_name: string;
  email: string;
  temporary_password: string;
};

export function CustomerForm() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCustomer | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim()) {
      setError("Full name and email are required.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          password: password.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        profile?: { id: string; full_name: string; email: string };
        temporary_password?: string;
      };

      if (!response.ok || !payload.profile || !payload.temporary_password) {
        setError(payload.error ?? "We couldn't create this customer.");
        toastError("Unable to create customer.");
        return;
      }

      setCreated({
        id: payload.profile.id,
        full_name: payload.profile.full_name,
        email: payload.profile.email,
        temporary_password: payload.temporary_password,
      });
      success("Customer created successfully.");
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <div className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <CardTitle>Customer Created</CardTitle>
          <CardDescription>
            Share these credentials with the customer securely. The password is
            shown only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {created.full_name}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {created.email}
            </p>
            <p>
              <span className="text-muted-foreground">Temporary password:</span>{" "}
              <span className="font-mono">{created.temporary_password}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `Email: ${created.email}\nPassword: ${created.temporary_password}`,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="size-4" aria-hidden />
              {copied ? "Copied" : "Copy credentials"}
            </Button>
            <Button asChild>
              <Link href={`/admin/customers/${created.id}`}>View customer</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/admin/customers">Back to list</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
          <CardDescription>
            Creates a Supabase Auth account and company profile. Customers
            cannot self-register.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Optional"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Temporary password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Leave blank to auto-generate"
                minLength={8}
                className="pr-10"
                autoComplete="new-password"
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
            <p className="text-xs text-muted-foreground">
              If left blank, a secure temporary password is generated for you to
              share once.
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p
          className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Creating customer…
            </>
          ) : (
            "Create Customer"
          )}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href="/admin/customers">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
