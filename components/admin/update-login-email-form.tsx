"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";

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
import {
  updateLoginEmailAction,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function UpdateLoginEmailForm({
  currentEmail,
}: {
  currentEmail: string;
}) {
  const { success, error: toastError } = useToast();
  const [state, formAction, pending] = useActionState(
    updateLoginEmailAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) success(state.success);
    if (state.error) toastError(state.error);
  }, [state.success, state.error, success, toastError]);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Login email</CardTitle>
        <CardDescription>
          Replace the temporary deploy email with your own address. You will use
          this email the next time you sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">New login email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={currentEmail}
              placeholder="you@company.com"
            />
          </div>

          {state.error ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p
              className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success"
              role="status"
            >
              {state.success}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Update login email"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
