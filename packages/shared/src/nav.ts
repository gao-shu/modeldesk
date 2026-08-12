/** Sidebar nav — kept separate so AppShell does not pull api-formats / run-params. */

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export type NavSection = {
  id: string;
  label: string | null;
  items: readonly NavItem[];
};

export const APP_NAME = "ModelDesk" as const;
export const APP_TAGLINE = "" as const;

/** Sidebar sections for the unified selection desk shell. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "runs",
    label: "实测",
    items: [
      { href: "/runs/text", label: "文本", description: "" },
      { href: "/runs/image", label: "图片", description: "" },
      { href: "/runs/video", label: "视频", description: "" },
      { href: "/runs/audio", label: "语音", description: "" },
      { href: "/runs/music", label: "音乐", description: "" },
    ],
  },
  {
    id: "manage",
    label: "管理",
    items: [
      { href: "/gallery", label: "生成结果", description: "" },
      { href: "/models", label: "模型配置", description: "" },
      { href: "/settings", label: "系统设置", description: "" },
      { href: "/about", label: "项目说明", description: "" },
    ],
  },
] as const;

/** Flat list (compat). Prefer NAV_SECTIONS in the shell. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items,
);

export const DEFAULT_RUN_HREF = "/runs/text" as const;
