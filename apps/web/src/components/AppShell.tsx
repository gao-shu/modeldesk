"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_RUN_HREF,
  NAV_SECTIONS,
} from "@modeldesk/shared/nav";

function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function detectDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("shell") === "desktop") return true;
  if (params.get("shell") === "web") return false;
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

function currentSectionLabel(pathname: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (navActive(pathname, item.href)) return item.label;
    }
  }
  return APP_NAME;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const [displayPath, setDisplayPath] = useState(pathname);
  const [desktop, setDesktop] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const isDesktop = detectDesktopShell();
    setDesktop(isDesktop);
    document.documentElement.dataset.shell = isDesktop ? "desktop" : "web";
  }, []);

  useEffect(() => {
    setDisplayPath(pathname);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("modeldesk:page-active", {
          detail: { path: pathname },
        }),
      );
    }
  }, [pathname]);

  function navigate(href: string) {
    const next = normalizePath(href);
    if (next === displayPath) return;
    setDisplayPath(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("modeldesk:page-active", {
          detail: { path: next },
        }),
      );
    }
    startTransition(() => {
      router.push(next);
    });
  }

  const pageLabel = currentSectionLabel(displayPath);

  return (
    <div
      className={`flex h-dvh overflow-hidden text-zinc-900 ${
        desktop ? "bg-zinc-100" : "bg-zinc-50"
      }`}
    >
      <aside
        className={`flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white ${
          desktop ? "w-48" : "w-56"
        }`}
      >
        <div
          className="shrink-0 border-b border-zinc-200 px-3"
          style={{ paddingTop: "var(--md-aside-brand-py)", paddingBottom: "var(--md-aside-brand-py)" }}
        >
          <Link
            href={DEFAULT_RUN_HREF}
            prefetch={false}
            className="block"
            onClick={(e) => {
              e.preventDefault();
              navigate(DEFAULT_RUN_HREF);
            }}
          >
            <div
              className={`font-semibold tracking-tight ${
                desktop ? "text-base" : "text-lg"
              }`}
            >
              {APP_NAME}
            </div>
            {!desktop && APP_TAGLINE ? (
              <div className="mt-0.5 text-xs text-zinc-500">{APP_TAGLINE}</div>
            ) : null}
          </Link>
        </div>
        <nav
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
            desktop ? "gap-1 p-1.5" : "gap-1 p-2"
          }`}
        >
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <div
              key={section.id}
              className={`flex flex-col gap-0.5 ${
                sectionIndex > 0 ? "mt-2 border-t border-zinc-100 pt-2" : ""
              }`}
            >
              {section.label ? (
                <div
                  className={`select-none px-2.5 pb-0.5 pt-0.5 font-medium tracking-wider text-zinc-400 ${
                    desktop ? "text-[10px]" : "text-[11px]"
                  }`}
                >
                  {section.label}
                </div>
              ) : null}
              {section.items.map((item) => {
                const active = navActive(displayPath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.href);
                    }}
                    className={`rounded-md px-2.5 text-sm transition-colors ${
                      desktop ? "py-1.5" : "py-2"
                    } ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <div className="font-medium">{item.label}</div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {desktop ? (
          <div className="flex h-9 shrink-0 items-center border-b border-zinc-200/80 bg-white/90 px-4 text-xs text-zinc-500">
            <span className="font-medium text-zinc-800">{pageLabel}</span>
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{
            paddingLeft: "var(--md-main-pad-x)",
            paddingRight: "var(--md-main-pad-x)",
            paddingTop: "var(--md-main-pad-y)",
            paddingBottom: "var(--md-main-pad-y)",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
