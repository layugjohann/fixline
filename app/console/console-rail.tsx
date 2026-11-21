"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  BookUser,
  ChartColumn,
  Check,
  FlaskConical,
  ListChecks,
  Menu,
  MessagesSquare,
  PlayCircle,
  SquareKanban,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export type Workspace = "demo" | "sandbox";

interface NavItem {
  label: string;
  icon: ReactNode;
  /** The page, under the workspace's path. Absent while the page isn't built yet. */
  page?: string;
}

/** The pages each workspace has built so far; the rest show as coming soon. */
const WORKSPACE_PAGES: Record<Workspace, readonly string[]> = {
  demo: ["review-queue", "board", "property-roster", "runs", "scorecard"],
  sandbox: ["incoming-messages", "review-queue", "board", "property-roster", "scorecard"],
};

/** The rail's navigation, in glossary terms, grouped as Work, Reference and Agent. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { label: "Incoming Messages", icon: <MessagesSquare />, page: "incoming-messages" },
      { label: "Review Queue", icon: <ListChecks />, page: "review-queue" },
      { label: "Board", icon: <SquareKanban />, page: "board" },
    ],
  },
  { label: "Reference", items: [{ label: "Property Roster", icon: <BookUser />, page: "property-roster" }] },
  {
    label: "Agent",
    items: [
      { label: "Runs", icon: <Activity />, page: "runs" },
      { label: "Scorecard", icon: <ChartColumn />, page: "scorecard" },
    ],
  },
];

const itemClass =
  "relative grid size-10 place-items-center rounded-lg outline-none [&_svg]:size-4 focus-visible:ring-2 focus-visible:ring-ring";

interface ResolvedNavItem {
  item: NavItem;
  /** Absent while the workspace hasn't built the page. */
  href?: string;
  active: boolean;
  badge?: number;
}

/** The navigation groups with each item's link, whether it's the current page, and its badge. */
function resolveNav(workspace: Workspace, pathname: string, pendingCount: number) {
  const base = `/console/${workspace}`;
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.map((item): ResolvedNavItem => {
      const href = item.page && WORKSPACE_PAGES[workspace].includes(item.page) ? `${base}/${item.page}` : undefined;
      const active = href !== undefined && (pathname === href || pathname.startsWith(`${href}/`));
      const badge = item.page === "review-queue" && pendingCount > 0 ? pendingCount : undefined;
      return { item, href, active, badge };
    }),
  }));
}

interface ConsoleRailProps {
  workspace: Workspace;
  pendingCount: number;
  actions?: ReactNode;
  menuItems?: ReactNode;
}

/**
 * The console's navigation. From `lg` up it is the icon rail: wordmark, the workspace's actions
 * (such as New Message), navigation, theme toggle and the workspace menu, which holds the
 * workspace switcher and any `menuItems`. Below `lg` it is a top bar whose menu button opens the
 * same navigation as a drawer.
 */
export function ConsoleRail(props: ConsoleRailProps) {
  return (
    <>
      <IconRail {...props} />
      <TopBar {...props} />
    </>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Fixline home"
      className={cn(
        "flex items-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "flex-col" : "gap-2 pr-1",
      )}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Wrench className="size-4" />
      </span>
      <span className={cn("font-semibold tracking-wide text-rail-active-foreground", compact ? "text-[10px]" : "text-sm")}>
        Fixline
      </span>
    </Link>
  );
}

function IconRail({ workspace, pendingCount, actions, menuItems }: ConsoleRailProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="hidden w-16 shrink-0 flex-col items-center bg-rail py-3 text-rail-foreground lg:flex">
      <div className="mb-4">
        <Wordmark compact />
      </div>

      {actions && <div className="mb-3 flex flex-col items-center gap-1">{actions}</div>}

      {resolveNav(workspace, pathname, pendingCount).map((group, groupIndex) => (
        <ul key={group.label} aria-label={group.label} className="flex flex-col items-center gap-1">
          {groupIndex > 0 && <li aria-hidden className="mx-auto my-2 h-px w-8 bg-rail-active" />}
          {group.items.map((resolved) => (
            <li key={resolved.item.label}>
              <RailLink {...resolved} />
            </li>
          ))}
        </ul>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <ThemeToggle />
        <WorkspaceMenu workspace={workspace} menuItems={menuItems} />
      </div>
    </nav>
  );
}

/** Below `lg`: a top bar with the workspace's actions and the theme toggle, and the navigation in a drawer. */
function TopBar({ workspace, pendingCount, actions, menuItems }: ConsoleRailProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const groups = resolveNav(workspace, pathname, pendingCount);
  const current = groups.flatMap((group) => group.items).find((resolved) => resolved.active);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-rail px-2 text-rail-foreground lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label={pendingCount > 0 ? `Open navigation, ${pendingCount} to review` : "Open navigation"}
          className="relative grid size-10 place-items-center rounded-lg outline-none hover:bg-rail-active hover:text-rail-active-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5"
        >
          <Menu />
          {pendingCount > 0 && (
            <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          )}
        </SheetTrigger>
        <SheetContent
          side="left"
          aria-describedby="console-drawer-description"
          className="w-72 max-w-[85vw] gap-0 border-white/10 bg-rail p-0 text-rail-foreground"
        >
          <SheetTitle className="sr-only">Console navigation</SheetTitle>
          <SheetDescription id="console-drawer-description" className="sr-only">
            Pages in the Harbor Lane {workspace === "demo" ? "Demo" : "sandbox"} workspace
          </SheetDescription>
          <div className="px-4 pt-4 pb-2">
            <Wordmark />
          </div>
          <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 py-2">
            {groups.map((group) => (
              <div key={group.label} className="mt-3 first:mt-0">
                <h2 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-rail-foreground uppercase">{group.label}</h2>
                <ul aria-label={group.label} className="flex flex-col gap-0.5">
                  {group.items.map((resolved) => (
                    <li key={resolved.item.label}>
                      <DrawerLink {...resolved} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <WorkspaceMenu workspace={workspace} menuItems={menuItems} layout="drawer" onSelectItem={close} />
          </div>
        </SheetContent>
      </Sheet>

      <Wordmark />
      {current && (
        <span className="min-w-0 truncate text-rail-active-foreground/90">
          <span aria-hidden className="mr-2 text-rail-foreground">
            /
          </span>
          {current.item.label}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}

function DrawerLink({ item, href, active, badge, onNavigate }: ResolvedNavItem & { onNavigate: () => void }) {
  const rowClass =
    "flex h-10 items-center gap-3 rounded-lg px-2 outline-none [&_svg]:size-4 focus-visible:ring-2 focus-visible:ring-ring";
  if (!href) {
    return (
      <span role="link" aria-disabled="true" className={cn(rowClass, "cursor-not-allowed opacity-50")}>
        {item.icon}
        <span className="flex-1">{item.label}</span>
        <span className="text-xs">coming soon</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={badge === undefined ? item.label : `${item.label}, ${badge} to review`}
      aria-current={active ? "page" : undefined}
      className={cn(
        rowClass,
        active ? "bg-rail-active text-rail-active-foreground" : "hover:bg-rail-active hover:text-rail-active-foreground",
      )}
    >
      {item.icon}
      <span className="flex-1">{item.label}</span>
      {badge !== undefined && (
        <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}

function RailLink({ item, href, active, badge }: ResolvedNavItem) {
  if (!href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="link"
            aria-disabled="true"
            aria-label={`${item.label} (coming soon)`}
            tabIndex={0}
            className={cn(itemClass, "cursor-not-allowed opacity-40")}
          >
            {item.icon}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label} · coming soon</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={badge === undefined ? item.label : `${item.label}, ${badge} to review`}
          aria-current={active ? "page" : undefined}
          className={cn(
            itemClass,
            active
              ? "bg-rail-active text-rail-active-foreground"
              : "hover:bg-rail-active hover:text-rail-active-foreground",
          )}
        >
          {item.icon}
          {badge !== undefined && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
            >
              {badge}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {badge !== undefined && ` · ${badge} to review`}
      </TooltipContent>
    </Tooltip>
  );
}

const WORKSPACES: { key: Workspace; label: string; detail: string; href: string; icon: ReactNode }[] = [
  {
    key: "demo",
    label: "Demo",
    detail: "Recorded runs, read-only",
    href: "/console/demo/review-queue",
    icon: <PlayCircle />,
  },
  {
    key: "sandbox",
    label: "Your sandbox",
    detail: "Live runs in your browser",
    href: "/console/sandbox/incoming-messages",
    icon: <FlaskConical />,
  },
];

function WorkspaceMenu({
  workspace,
  menuItems,
  layout = "rail",
  onSelectItem,
}: {
  workspace: Workspace;
  menuItems?: ReactNode;
  layout?: "rail" | "drawer";
  /** Called when any item is chosen, such as to close the drawer the menu sits in. */
  onSelectItem?: () => void;
}) {
  const current = WORKSPACES.find((candidate) => candidate.key === workspace);
  const badge = (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rail-active text-[11px] font-semibold text-rail-active-foreground ring-1 ring-white/15">
      HL
    </span>
  );
  return (
    // In the drawer the menu sits inside a modal Sheet, so it is modal too and takes over focus from it.
    <DropdownMenu modal={layout === "drawer"}>
      {layout === "rail" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger aria-label={`Workspace: ${current?.label}`} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {badge}
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Harbor Lane · {current?.label}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger
          aria-label={`Workspace: ${current?.label}`}
          className="flex w-full items-center gap-3 rounded-lg p-1 text-left outline-none hover:bg-rail-active focus-visible:ring-2 focus-visible:ring-ring"
        >
          {badge}
          <span className="min-w-0">
            <span className="block truncate font-medium text-rail-active-foreground">Harbor Lane</span>
            <span className="block truncate text-xs">{current?.label}</span>
          </span>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        side={layout === "rail" ? "right" : "top"}
        align={layout === "rail" ? "end" : "start"}
        className="w-64"
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('[role="menuitem"]')) onSelectItem?.();
        }}
      >
        <DropdownMenuLabel>Harbor Lane Property Management</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {WORKSPACES.map((candidate) => (
          <DropdownMenuItem key={candidate.key} asChild>
            <a href={candidate.href} className="flex items-start gap-2">
              <span className="mt-0.5 text-muted-foreground">{candidate.icon}</span>
              <span className="flex-1">
                <span className="block font-medium">{candidate.label}</span>
                <span className="block text-xs text-muted-foreground">{candidate.detail}</span>
              </span>
              {candidate.key === workspace && <Check className="mt-0.5 text-primary" aria-label="Current workspace" />}
            </a>
          </DropdownMenuItem>
        ))}
        {menuItems && (
          <>
            <DropdownMenuSeparator />
            {menuItems}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
