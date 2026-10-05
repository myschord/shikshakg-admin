import { BookOpenCheck, Megaphone, Newspaper, History, CalendarCheck, CalendarClock, ClipboardList, FileText, FileUp, Flag, GraduationCap, Home, Layers, Library, ListChecks, Sparkles, Tags, UserCog, Wallet, type LucideIcon } from "lucide-react";
import type { StaffRole } from "@/lib/api/auth";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Who sees this item. The backend still checks the role on every call. */
  roles: StaffRole[];
  /** False while the screen is not built yet: shown as "Soon" and not clickable. */
  built: boolean;
};
export type NavGroup = { title: string; items: NavItem[] };

const both: StaffRole[] = ["admin", "content_editor"];
const adminOnly: StaffRole[] = ["admin"];

// Order follows the daily work: what needs attention, then content, then money and settings.
export const navGroups: NavGroup[] = [
  { title: "Work", items: [{ label: "Today", href: "/", icon: Home, roles: both, built: true }] },
  {
    title: "Content",
    items: [
      { label: "Exam dates", href: "/exam-dates", icon: CalendarClock, roles: both, built: true },
      { label: "Catalog", href: "/catalog", icon: Layers, roles: both, built: true },
      { label: "Question bank", href: "/questions", icon: Library, roles: both, built: true },
      { label: "Review queue", href: "/questions/review", icon: ListChecks, roles: both, built: true },
      { label: "Student reports", href: "/reports", icon: Flag, roles: both, built: true },
      { label: "Pools and aliases", href: "/pools", icon: Tags, roles: both, built: true },
      { label: "JSON imports", href: "/imports", icon: FileUp, roles: both, built: true },
      { label: "PDF extraction", href: "/pdf", icon: FileText, roles: both, built: true },
      { label: "Papers", href: "/papers", icon: BookOpenCheck, roles: both, built: true },
      { label: "Tests", href: "/tests", icon: ClipboardList, roles: both, built: true },
      { label: "Courses", href: "/courses", icon: GraduationCap, roles: both, built: true },
      { label: "Current affairs", href: "/current-affairs", icon: Newspaper, roles: both, built: true },
      { label: "Daily quiz", href: "/daily-quiz", icon: CalendarCheck, roles: both, built: true },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Commerce", href: "/commerce", icon: Wallet, roles: adminOnly, built: true },
      { label: "AI controls", href: "/ai-controls", icon: Sparkles, roles: adminOnly, built: true },
      { label: "Announcements", href: "/announcements", icon: Megaphone, roles: adminOnly, built: true },
      { label: "Users and roles", href: "/users", icon: UserCog, roles: adminOnly, built: true },
      { label: "Action log", href: "/action-log", icon: History, roles: adminOnly, built: true },
    ],
  },
];

/** The menu this role may see, with empty groups dropped. */
export function navFor(role: StaffRole): NavGroup[] {
  return navGroups.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
}

/** Which roles may open a path (used by pages that must refuse other roles even on a direct link). */
export function rolesFor(pathname: string): StaffRole[] | null {
  for (const g of navGroups) for (const i of g.items) if (i.href !== "/" && (pathname === i.href || pathname.startsWith(`${i.href}/`))) return i.roles;
  return null;
}
