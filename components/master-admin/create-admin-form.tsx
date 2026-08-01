"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";

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

export function CreateAdminForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/admins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName, email }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        temporary_password?: string;
        email?: string;
      };
      if (!response.ok || !payload.temporary_password) {
        const message = payload.error ?? "Unable to create administrator.";
        setError(message);
        toastError(message);
        return;
      }
      setCreated({
        email: payload.email ?? email,
        temporaryPassword: payload.temporary_password,
      });
      setFullName("");
      setEmail("");
      success("Administrator created successfully.");
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            Admin created
          </CardTitle>
          <CardDescription>
            Share credentials securely. Password shown once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Email:</span> {created.email}
          </p>
          <p className="font-mono text-sm">{created.temporaryPassword}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(created.temporaryPassword);
                success("Password copied");
              }}
            >
              <Copy className="size-3.5" aria-hidden />
              Copy password
            </Button>
            <Button type="button" size="sm" onClick={() => setCreated(null)}>
              Create another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create admin</CardTitle>
        <CardDescription>
          Adds another company administrator for this tenant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-2">
            <Label htmlFor="new-admin-name">Name</Label>
            <Input
              id="new-admin-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-admin-email">Email</Label>
            <Input
              id="new-admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create admin"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
