"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  hasReadablePrimaryContrast,
  resolveBrand,
  type CompanyBrandingRow,
} from "@/lib/branding";

export function BrandingEditor({
  companyId,
  companyName,
  companySlug,
  initial,
}: {
  companyId: string;
  companyName: string;
  companySlug: string;
  initial: CompanyBrandingRow | null;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);

  const [primary, setPrimary] = useState(initial?.primary_color ?? "#0f766e");
  const [secondary, setSecondary] = useState(
    initial?.secondary_color ?? "#e2e8f0",
  );
  const [accent, setAccent] = useState(initial?.accent_color ?? "#115e59");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [supportEmail, setSupportEmail] = useState(
    initial?.support_email ?? "",
  );
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? null);
  const [faviconUrl, setFaviconUrl] = useState(initial?.favicon_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [clearFavicon, setClearFavicon] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initial?.logo_url ?? null,
  );

  const previewBrand = useMemo(
    () =>
      resolveBrand({
        companyName,
        companySlug,
        branding: {
          company_id: companyId,
          logo_url: clearLogo ? null : logoPreview,
          favicon_url: clearFavicon ? null : faviconUrl,
          primary_color: primary,
          secondary_color: secondary,
          accent_color: accent,
          tagline: tagline || null,
          support_email: supportEmail || null,
          website_url: websiteUrl || null,
        },
      }),
    [
      companyId,
      companyName,
      companySlug,
      primary,
      secondary,
      accent,
      tagline,
      supportEmail,
      websiteUrl,
      logoPreview,
      faviconUrl,
      clearLogo,
      clearFavicon,
    ],
  );

  const contrastOk = hasReadablePrimaryContrast(previewBrand.primaryColor);

  function onLogoChange(file: File | null) {
    setLogoFile(file);
    setClearLogo(false);
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setLogoPreview(logoUrl);
    }
  }

  function save() {
    startTransition(async () => {
      const form = new FormData();
      form.set("primary_color", primary);
      form.set("secondary_color", secondary);
      form.set("accent_color", accent);
      form.set("tagline", tagline);
      form.set("support_email", supportEmail);
      form.set("website_url", websiteUrl);
      form.set("clear_logo", clearLogo ? "true" : "false");
      form.set("clear_favicon", clearFavicon ? "true" : "false");
      if (logoFile) form.set("logo", logoFile);
      if (faviconFile) form.set("favicon", faviconFile);

      const response = await fetch(
        `/api/master-admin/companies/${companyId}/branding`,
        { method: "PUT", body: form },
      );
      const payload = (await response.json()) as {
        error?: string;
        branding?: CompanyBrandingRow;
        message?: string;
      };

      if (!response.ok || !payload.branding) {
        toastError(payload.error ?? "Unable to update branding.");
        return;
      }

      setLogoUrl(payload.branding.logo_url);
      setFaviconUrl(payload.branding.favicon_url);
      setLogoPreview(payload.branding.logo_url);
      setLogoFile(null);
      setFaviconFile(null);
      setClearLogo(false);
      setClearFavicon(false);
      success(payload.message ?? "Branding updated successfully.");
      router.refresh();
    });
  }

  function resetBranding() {
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/branding`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to reset branding.");
        setResetOpen(false);
        return;
      }
      setPrimary("#0f766e");
      setSecondary("#e2e8f0");
      setAccent("#115e59");
      setTagline("");
      setSupportEmail("");
      setWebsiteUrl("");
      setLogoUrl(null);
      setFaviconUrl(null);
      setLogoPreview(null);
      setLogoFile(null);
      setFaviconFile(null);
      setClearLogo(false);
      setClearFavicon(false);
      success(payload.message ?? "Branding reset to platform defaults.");
      setResetOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>Brand settings</CardTitle>
          <CardDescription>
            Customize how {companyName} appears across Admin, Customer, and
            public tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="brand-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {logoPreview && !clearLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt={`${companyName} logo preview`}
                    className="size-full object-contain p-1"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Default</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Label
                  htmlFor="brand-logo"
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
                >
                  <Upload className="size-4" aria-hidden />
                  Upload
                </Label>
                <Input
                  id="brand-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) =>
                    onLogoChange(e.target.files?.[0] ?? null)
                  }
                />
                {(logoPreview || logoUrl) && !clearLogo ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setClearLogo(true);
                      setLogoFile(null);
                      setLogoPreview(null);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, or WebP. Max 2MB.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-favicon">Favicon</Label>
            <Input
              id="brand-favicon"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon"
              onChange={(e) => {
                setFaviconFile(e.target.files?.[0] ?? null);
                setClearFavicon(false);
              }}
            />
            {faviconUrl && !clearFavicon ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setClearFavicon(true);
                  setFaviconFile(null);
                }}
              >
                Remove favicon
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["primary", "Primary", primary, setPrimary],
                ["secondary", "Secondary", secondary, setSecondary],
                ["accent", "Accent", accent, setAccent],
              ] as const
            ).map(([id, label, value, setter]) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={`color-${id}`}>{label}</Label>
                <div className="flex gap-2">
                  <Input
                    id={`color-${id}`}
                    type="color"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="h-10 w-14 cursor-pointer p-1"
                    aria-label={`${label} color picker`}
                  />
                  <Input
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="font-mono uppercase"
                    aria-label={`${label} hex value`}
                  />
                </div>
              </div>
            ))}
          </div>

          {!contrastOk ? (
            <p className="text-sm text-warning" role="status">
              Primary color may have low contrast on buttons. Consider a darker
              or lighter shade.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Moving what matters."
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-email">Support email</Label>
            <Input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website-url">Website</Label>
            <Input
              id="website-url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={save}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save branding"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setResetOpen(true)}
            >
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <CardDescription>
            Approximate shell + tracking CTA using the selected brand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandTheme brand={previewBrand}>
            <div className="overflow-hidden rounded-xl border border-border shadow-sm">
              <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
                <BrandMark href="#" brand={previewBrand} />
              </div>
              <div className="space-y-4 bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--brand-primary)_12%,white)_0%,_#f4f6f8_55%)] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {companyName}
                </p>
                <h3 className="text-2xl font-semibold tracking-tight">
                  Track your deliveries
                </h3>
                <p className="text-sm text-muted-foreground">
                  {previewBrand.tagline}
                </p>
                <Button type="button">Track Delivery</Button>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-3/4 rounded-full bg-primary" />
                </div>
              </div>
            </div>
          </BrandTheme>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={(v) => !pending && setResetOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset branding?</DialogTitle>
            <DialogDescription>
              This will remove {companyName}&apos;s custom branding and restore
              the platform defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={resetBranding}
            >
              {pending ? "Resetting…" : "Reset Branding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
