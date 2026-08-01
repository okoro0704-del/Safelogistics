"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";

import { BrandTheme } from "@/components/branding/brand-theme";
import { BrandMark } from "@/components/layout/brand-mark";
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
  hasReadablePrimaryContrast,
  PLATFORM_DEFAULTS,
  resolveBrand,
} from "@/lib/branding";
import {
  COMPANY_CURRENCIES,
  COMPANY_TIMEZONES,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
} from "@/lib/company-settings";
import {
  formatMoneyCents,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/lib/payments/constants";
import { cn, isValidCompanySlug, normalizeCompanySlug } from "@/lib/utils";

const STEPS = [
  { id: "company", label: "Company" },
  { id: "payment", label: "Payment" },
  { id: "admin", label: "Administrator" },
  { id: "branding", label: "Branding" },
  { id: "config", label: "Configuration" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const PROGRESS_MESSAGES = [
  "Creating company…",
  "Recording payment…",
  "Creating administrator…",
  "Configuring branding…",
  "Applying settings…",
  "Finalizing app…",
];

export function CreateAppWizard() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [primary, setPrimary] = useState<string>(PLATFORM_DEFAULTS.primaryColor);
  const [secondary, setSecondary] = useState<string>(
    PLATFORM_DEFAULTS.secondaryColor,
  );
  const [accent, setAccent] = useState<string>(PLATFORM_DEFAULTS.accentColor);
  const [tagline, setTagline] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [skipBranding, setSkipBranding] = useState(false);

  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [paymentReceived, setPaymentReceived] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    (typeof PAYMENT_METHODS)[number]
  >("bank_transfer");
  const [paymentAmountCents, setPaymentAmountCents] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(DEFAULT_CURRENCY);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [created, setCreated] = useState<{
    companyId: string;
    companyName: string;
    adminEmail: string;
    temporaryPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  const step = STEPS[stepIndex]?.id ?? "company";

  const previewBrand = useMemo(
    () =>
      resolveBrand({
        companyName: companyName || "Your Company",
        companySlug: slug || "your-company",
        branding: skipBranding
          ? null
          : {
              company_id: "preview",
              logo_url: logoPreview,
              favicon_url: null,
              primary_color: primary,
              secondary_color: secondary,
              accent_color: accent,
              tagline: tagline || null,
              support_email: supportEmail || null,
              website_url: websiteUrl || null,
            },
      }),
    [
      companyName,
      slug,
      skipBranding,
      logoPreview,
      primary,
      secondary,
      accent,
      tagline,
      supportEmail,
      websiteUrl,
    ],
  );

  const contrastOk = hasReadablePrimaryContrast(previewBrand.primaryColor);

  useEffect(() => {
    if (!pending) return;
    setProgressIndex(0);
    const id = window.setInterval(() => {
      setProgressIndex((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 700);
    return () => window.clearInterval(id);
  }, [pending]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (created || pending) return;
      if (!companyName && !adminEmail && !adminName) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [companyName, adminEmail, adminName, created, pending]);

  const checkSlug = useCallback(async (value: string) => {
    if (!value || !isValidCompanySlug(value)) {
      setSlugStatus(value ? "invalid" : "idle");
      return;
    }
    setSlugStatus("checking");
    try {
      const response = await fetch(
        `/api/master-admin/companies?slug=${encodeURIComponent(value)}`,
      );
      const payload = (await response.json()) as {
        available?: boolean;
      };
      setSlugStatus(payload.available ? "available" : "taken");
    } catch {
      setSlugStatus("idle");
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void checkSlug(slug);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [slug, checkSlug]);

  function onNameChange(value: string) {
    setCompanyName(value);
    if (!slugTouched) setSlug(normalizeCompanySlug(value));
  }

  function validateStep(id: StepId): string | null {
    if (id === "company") {
      if (!companyName.trim()) return "Company name is required.";
      if (!slug || !isValidCompanySlug(slug)) {
        return "Enter a valid URL-safe slug.";
      }
      if (slugStatus === "taken") {
        return "This app URL identifier is already in use.";
      }
      if (slugStatus === "checking") {
        return "Please wait while we check the slug.";
      }
    }
    if (id === "payment") {
      if (paymentReceived) {
        const amount = Number(paymentAmountCents);
        if (!Number.isInteger(amount) || amount < 0) {
          return "Enter payment amount in integer cents.";
        }
        if (!paymentMethod) {
          return "Select a payment method.";
        }
      }
    }
    if (id === "admin") {
      if (!adminName.trim()) return "Administrator name is required.";
      if (!adminEmail.trim()) return "Administrator email is required.";
    }
    if (id === "branding" && !skipBranding && !contrastOk) {
      return "Primary color may make buttons hard to read. Choose a different color.";
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      toastError(message);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function onSubmit() {
    const early =
      validateStep("company") ||
      validateStep("payment") ||
      validateStep("admin") ||
      validateStep("branding");
    if (early) {
      setError(early);
      toastError(early);
      return;
    }
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("company_name", companyName.trim());
      form.set("company_slug", slug);
      if (description.trim()) form.set("company_description", description.trim());
      form.set("admin_full_name", adminName.trim());
      form.set("admin_email", adminEmail.trim());
      form.set("timezone", timezone);
      form.set("currency", currency);
      form.set("payment_received", paymentReceived ? "true" : "false");
      if (paymentReceived) {
        form.set("payment_amount_cents", paymentAmountCents || "0");
        form.set("payment_currency", paymentCurrency);
        form.set("payment_method", paymentMethod);
        if (paymentDate) form.set("payment_date", paymentDate);
        if (paymentReference.trim()) {
          form.set("payment_reference", paymentReference.trim());
        }
        if (paymentNotes.trim()) {
          form.set("payment_notes", paymentNotes.trim());
        }
      }
      if (supportEmail.trim()) form.set("support_email", supportEmail.trim());
      if (supportPhone.trim()) form.set("support_phone", supportPhone.trim());
      if (websiteUrl.trim()) form.set("website_url", websiteUrl.trim());

      if (!skipBranding) {
        form.set("primary_color", primary);
        form.set("secondary_color", secondary);
        form.set("accent_color", accent);
        if (tagline.trim()) form.set("tagline", tagline.trim());
        if (logoFile) form.set("logo", logoFile);
        if (faviconFile) form.set("favicon", faviconFile);
      }

      const response = await fetch("/api/master-admin/companies", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        error?: string;
        company?: { id: string; name: string };
        temporary_password?: string;
        admin_email?: string;
      };

      if (!response.ok || !payload.company || !payload.temporary_password) {
        const message =
          payload.error ??
          "Unable to create the app. No usable tenant was created.";
        setError(message);
        toastError(message);
        return;
      }

      setCreated({
        companyId: payload.company.id,
        companyName: payload.company.name,
        adminEmail: payload.admin_email ?? adminEmail,
        temporaryPassword: payload.temporary_password,
      });
      success("App created successfully.");
      router.refresh();
    });
  }

  if (created) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <CardTitle>App Created</CardTitle>
          <CardDescription>
            {created.companyName} is active. Share administrator access
            securely — the temporary password is shown only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">App:</span>{" "}
              {created.companyName}
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span> Active
            </p>
            <p>
              <span className="text-muted-foreground">Administrator:</span>{" "}
              {created.adminEmail}
            </p>
            <p className="font-mono">
              <span className="font-sans text-muted-foreground">
                Temporary password:
              </span>{" "}
              {created.temporaryPassword}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(created.adminEmail);
                setCopied("email");
                success("Admin email copied");
              }}
            >
              <Copy className="size-4" aria-hidden />
              {copied === "email" ? "Copied" : "Copy Admin Email"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(created.temporaryPassword);
                setCopied("password");
                success("Password copied");
              }}
            >
              <Copy className="size-4" aria-hidden />
              {copied === "password" ? "Copied" : "Copy password"}
            </Button>
            <Button asChild>
              <Link href={`/master-admin/companies/${created.companyId}`}>
                View Company
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/master-admin/companies/new">Create Another App</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pending) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Creating App…</CardTitle>
          <CardDescription>
            Provisioning a complete tenant. Please wait.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROGRESS_MESSAGES.map((message, index) => (
            <div
              key={message}
              className={cn(
                "flex items-center gap-2 text-sm",
                index <= progressIndex
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {index < progressIndex ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : index === progressIndex ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <span className="size-4 rounded-full border border-border" />
              )}
              {message}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Create New App</CardTitle>
          <CardDescription>
            Provision a white-label delivery tenant with admin, branding, and
            settings.
          </CardDescription>
          <ol className="mt-4 flex flex-wrap gap-2" aria-label="Provisioning steps">
            {STEPS.map((item, index) => (
              <li key={item.id}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    index === stepIndex
                      ? "bg-primary text-primary-foreground"
                      : index < stepIndex
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <span className="tabular-nums">{index + 1}</span>
                  {item.label}
                </span>
              </li>
            ))}
          </ol>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === "company" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => onNameChange(e.target.value)}
                  required
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-slug">Company slug</Label>
                <Input
                  id="company-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(normalizeCompanySlug(e.target.value));
                  }}
                  className="font-mono"
                  required
                  aria-describedby="slug-help"
                />
                <p id="slug-help" className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens. Used as the app URL
                  identifier.
                </p>
                {slugStatus === "checking" ? (
                  <p className="text-xs text-muted-foreground">Checking slug…</p>
                ) : null}
                {slugStatus === "available" ? (
                  <p className="text-xs text-success">✓ Slug available</p>
                ) : null}
                {slugStatus === "taken" ? (
                  <p className="text-xs text-destructive" role="alert">
                    Slug already exists
                  </p>
                ) : null}
                {slugStatus === "invalid" ? (
                  <p className="text-xs text-destructive" role="alert">
                    Invalid slug format
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-description">
                  Description{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <textarea
                  id="company-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          ) : null}

          {step === "payment" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Optionally record an offline payment already received. No card
                data is collected.
              </p>
              <div className="space-y-2">
                <Label>Has payment been received?</Label>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={paymentReceived}
                      onChange={() => setPaymentReceived(true)}
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!paymentReceived}
                      onChange={() => setPaymentReceived(false)}
                    />
                    No
                  </label>
                </div>
              </div>

              {paymentReceived ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pay-amount">Amount (cents)</Label>
                    <Input
                      id="pay-amount"
                      inputMode="numeric"
                      value={paymentAmountCents}
                      onChange={(e) => setPaymentAmountCents(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatMoneyCents(
                        Number(paymentAmountCents) || 0,
                        paymentCurrency,
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-currency">Currency</Label>
                    <select
                      id="pay-currency"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={paymentCurrency}
                      onChange={(e) => setPaymentCurrency(e.target.value)}
                    >
                      {COMPANY_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-method">Payment method</Label>
                    <select
                      id="pay-method"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(
                          e.target.value as (typeof PAYMENT_METHODS)[number],
                        )
                      }
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-date">Payment date</Label>
                    <Input
                      id="pay-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-ref">Reference (optional)</Label>
                    <Input
                      id="pay-ref"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pay-notes">Notes (optional)</Label>
                    <Input
                      id="pay-notes"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  No payment record will be created.
                </p>
              )}
            </div>
          ) : null}

          {step === "admin" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The first administrator is created with role{" "}
                <span className="font-medium text-foreground">admin</span> for
                this company only.
              </p>
              <div className="space-y-2">
                <Label htmlFor="admin-name">Admin full name</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>
          ) : null}

          {step === "branding" ? (
            <div className="space-y-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={skipBranding}
                  onChange={(e) => setSkipBranding(e.target.checked)}
                />
                <span>
                  Skip custom branding for now — use platform defaults. You can
                  edit branding later.
                </span>
              </label>
              {!skipBranding ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="logo">Logo</Label>
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setLogoFile(file);
                        if (logoPreview?.startsWith("blob:")) {
                          URL.revokeObjectURL(logoPreview);
                        }
                        setLogoPreview(file ? URL.createObjectURL(file) : null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="favicon">Favicon</Label>
                    <Input
                      id="favicon"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/x-icon"
                      onChange={(e) => {
                        setFaviconFile(e.target.files?.[0] ?? null);
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(
                      [
                        ["primary", "Primary", primary, setPrimary],
                        ["secondary", "Secondary", secondary, setSecondary],
                        ["accent", "Accent", accent, setAccent],
                      ] as const
                    ).map(([key, label, value, setter]) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`color-${key}`}>{label}</Label>
                        <div className="flex gap-2">
                          <Input
                            id={`color-${key}`}
                            type="color"
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                            className="h-10 w-14 p-1"
                          />
                          <Input
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                            className="font-mono"
                            aria-label={`${label} hex`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {!contrastOk ? (
                    <p className="text-xs text-amber-700" role="status">
                      Primary color may reduce button readability.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input
                      id="tagline"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="Moving what matters."
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === "config" ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {COMPANY_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {COMPANY_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-email">Support email</Label>
                <Input
                  id="support-email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-phone">Support phone</Label>
                <Input
                  id="support-phone"
                  type="tel"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://"
                />
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4 text-sm">
              <section className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">Company</h3>
                <p className="mt-1">{companyName}</p>
                <p className="font-mono text-muted-foreground">{slug}</p>
                {description ? (
                  <p className="mt-2 text-muted-foreground">{description}</p>
                ) : null}
              </section>
              <section className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">Payment</h3>
                <p className="mt-1 font-medium">
                  {paymentReceived
                    ? `Payment received (${formatMoneyCents(
                        Number(paymentAmountCents) || 0,
                        paymentCurrency,
                      )} · ${PAYMENT_METHOD_LABELS[paymentMethod]})`
                    : "No payment recorded"}
                </p>
                {paymentReceived && paymentDate ? (
                  <p className="text-muted-foreground">{paymentDate}</p>
                ) : null}
                {paymentReceived && paymentReference.trim() ? (
                  <p className="text-muted-foreground">
                    Ref: {paymentReference.trim()}
                  </p>
                ) : null}
              </section>
              <section className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">Administrator</h3>
                <p className="mt-1">{adminName}</p>
                <p className="text-muted-foreground">{adminEmail}</p>
              </section>
              <section className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">Branding</h3>
                <p className="mt-1">
                  {skipBranding ? "Platform defaults" : "Custom branding"}
                </p>
                {!skipBranding && tagline ? (
                  <p className="text-muted-foreground">&ldquo;{tagline}&rdquo;</p>
                ) : null}
              </section>
              <section className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">Configuration</h3>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Timezone</dt>
                    <dd>{timezone}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Currency</dt>
                    <dd>{currency}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Support</dt>
                    <dd>{supportEmail || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="break-all">{websiteUrl || "—"}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </Button>
            {step === "review" ? (
              <Button type="button" onClick={onSubmit}>
                Create App
              </Button>
            ) : (
              <Button type="button" onClick={goNext}>
                Continue
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle className="text-base">Live preview</CardTitle>
          <CardDescription>How the tenant shell may appear.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandTheme brand={previewBrand}>
            <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <BrandMark href="#" brand={previewBrand} />
              </div>
              <div className="space-y-3 p-4">
                <p className="text-sm font-semibold">Dashboard</p>
                <p className="text-xs text-muted-foreground">
                  {previewBrand.tagline}
                </p>
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                >
                  Track Delivery
                </button>
              </div>
            </div>
          </BrandTheme>
        </CardContent>
      </Card>
    </div>
  );
}
