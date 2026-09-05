import { z } from "zod";

const BrowserTabIdSchema = z.string().min(1).max(100);
export const DesktopBrowserPresentationSchema = z.enum([
  "minimized",
  "peek",
  "expanded",
]);

export const DesktopBrowserTabSchema = z.object({
  id: BrowserTabIdSchema,
  title: z.string().max(300),
  url: z.string().max(4096),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
});

export const DesktopBrowserAttentionSchema = z.object({
  kind: z.enum(["sign_in", "challenge", "permission", "error", "user_action"]),
  title: z.string().max(160),
  detail: z.string().max(500),
});

/** Only display state crosses preload. Cookies, page content and CDP stay in main. */
export const DesktopBrowserStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  phase: z.enum([
    "closed",
    "ready",
    "working",
    "pausing",
    "paused",
    "needs_you",
    "closing",
  ]),
  presentation: DesktopBrowserPresentationSchema,
  tabs: z.array(DesktopBrowserTabSchema).max(8),
  activeTabId: BrowserTabIdSchema.nullable(),
  activity: z.string().max(200).nullable(),
  attention: DesktopBrowserAttentionSchema.nullable(),
  automationPaused: z.boolean(),
});
export type DesktopBrowserState = z.infer<typeof DesktopBrowserStateSchema>;
export type DesktopBrowserTab = z.infer<typeof DesktopBrowserTabSchema>;
export type DesktopBrowserAttention = z.infer<
  typeof DesktopBrowserAttentionSchema
>;

const NavigationUrlSchema = z.string().trim().min(1).max(4096);
export const DesktopBrowserCommandSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("open"), url: NavigationUrlSchema.optional() })
    .strict(),
  z.object({ type: z.literal("minimize") }).strict(),
  z.object({ type: z.literal("close") }).strict(),
  z.object({ type: z.literal("expand"), expanded: z.boolean() }).strict(),
  z.object({ type: z.literal("navigate"), url: NavigationUrlSchema }).strict(),
  z.object({ type: z.literal("back") }).strict(),
  z.object({ type: z.literal("forward") }).strict(),
  z.object({ type: z.literal("reload") }).strict(),
  z.object({ type: z.literal("stop") }).strict(),
  z.object({ type: z.literal("take_control") }).strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z.object({ type: z.literal("new_tab") }).strict(),
  z
    .object({ type: z.literal("select_tab"), tabId: BrowserTabIdSchema })
    .strict(),
  z
    .object({ type: z.literal("close_tab"), tabId: BrowserTabIdSchema })
    .strict(),
]);
export type DesktopBrowserCommand = z.infer<typeof DesktopBrowserCommandSchema>;

export const DesktopBrowserViewportSchema = z
  .object({
    x: z.number().finite().min(0).max(16000),
    y: z.number().finite().min(0).max(16000),
    width: z.number().finite().min(0).max(16000),
    height: z.number().finite().min(0).max(16000),
    visible: z.boolean(),
  })
  .strict();
export type DesktopBrowserViewport = z.infer<
  typeof DesktopBrowserViewportSchema
>;

export const DesktopBrowserImportResultSchema = z.object({
  status: z.enum(["imported", "cancelled", "unsupported", "failed"]),
  cookieCount: z.number().int().nonnegative(),
  siteCount: z.number().int().nonnegative(),
  message: z.string().max(500),
});
export type DesktopBrowserImportResult = z.infer<
  typeof DesktopBrowserImportResultSchema
>;

export interface DesktopBrowserBridge {
  getState(): Promise<DesktopBrowserState>;
  command(command: DesktopBrowserCommand): Promise<DesktopBrowserState>;
  setViewport(viewport: DesktopBrowserViewport): Promise<void>;
  importSession(): Promise<DesktopBrowserImportResult>;
  onStateChanged(listener: (state: DesktopBrowserState) => void): () => void;
  onFocusAddress(listener: () => void): () => void;
}
const CookieExportSchema = z.object({
  name: z.string().min(1).max(1024),
  value: z.string().max(16384),
  domain: z.string().min(1).max(253),
  path: z.string().startsWith("/").max(2048).default("/"),
  secure: z.boolean().default(true),
  httpOnly: z.boolean().default(false),
  hostOnly: z.boolean().optional(),
  session: z.boolean().optional(),
  expirationDate: z.number().finite().optional(),
  expires: z.number().finite().optional(),
  sameSite: z
    .enum([
      "Strict",
      "Lax",
      "None",
      "strict",
      "lax",
      "no_restriction",
      "unspecified",
    ])
    .optional(),
  partitionKey: z.unknown().optional(),
});
export const DesktopBrowserCookieExportSchema = z.union([
  z.array(CookieExportSchema).min(1).max(5000),
  z.object({ cookies: z.array(CookieExportSchema).min(1).max(5000) }),
]);
