export const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/deliveries", label: "Deliveries" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export const customerNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/deliveries", label: "My Deliveries" },
  { href: "/dashboard/profile", label: "Profile" },
] as const;
