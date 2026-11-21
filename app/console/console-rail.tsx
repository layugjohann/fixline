"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Activity,
  BookUser,
  ChartColumn,
  Check,
  FlaskConical,
  ListChecks,
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

/**
 * The console's icon rail: wordmark, the workspace's actions (such as New Message), navigation,
 * theme toggle and the workspace menu, which holds the workspace switcher and any `menuItems`.
 */
export function ConsoleRail({
  workspace,
  pendingCount,
  actions,
  menuItems,
}: {
  workspace: Workspace;
  pendingCount: number;
  actions?: ReactNode;
  menuItems?: ReactNode;
}) {
  const pathname = usePathname();
  const base = `/console/${workspace}`;

  return (
    <nav aria-label="Console" className="flex w-16 shrink-0 flex-col items-center bg-rail py-3 text-rail-foreground">
      <Link href="/" aria-label="Fixline home" className="mb-4 flex flex-col items-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Wrench className="size-4" />
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-rail-active-foreground">Fixline</span>
      </Link>

      {actions && <div className="mb-3 flex flex-col items-center gap-1">{actions}</div>}

      {NAV_GROUPS.map((group, groupIndex) => (
        <ul key={group.label} aria-label={group.label} className="flex flex-col items-center gap-1">
          {groupIndex > 0 && <li aria-hidden className="mx-auto my-2 h-px w-8 bg-rail-active" />}
          {group.items.map((item) => {
            const href = item.page && WORKSPACE_PAGES[workspace].includes(item.page) ? `${base}/${item.page}` : undefined;
            const active = href !== undefined && (pathname === href || pathname.startsWith(`${href}/`));
            const badge = item.page === "review-queue" && pendingCount > 0 ? pendingCount : undefined;
            return (
              <li key={item.label}>
                <RailLink item={item} href={href} active={active} badge={badge} />
              </li>
            );
          })}
        </ul>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <ThemeToggle />
        <WorkspaceMenu workspace={workspace} menuItems={menuItems} />
      </div>
    </nav>
  );
}

function RailLink({ item, href, active, badge }: { item: NavItem; href?: string; active: boolean; badge?: number }) {
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

function WorkspaceMenu({ workspace, menuItems }: { workspace: Workspace; menuItems?: ReactNode }) {
  const current = WORKSPACES.find((candidate) => candidate.key === workspace);
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label={`Workspace: ${current?.label}`}
            className="grid size-9 place-items-center rounded-lg bg-rail-active text-[11px] font-semibold text-rail-active-foreground ring-1 ring-white/15 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            HL
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Harbor Lane · {current?.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="end" className="w-64">
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
