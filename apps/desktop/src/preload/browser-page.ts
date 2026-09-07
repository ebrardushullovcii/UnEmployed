import { webFrame } from "electron";
import { CHROME_IDENTITY_SCRIPT } from "../main/services/browser/browser-identity";

// Sandboxed page preload for the embedded browser. It exposes no bridge and
// no IPC: it only runs the Chrome identity script in the page's main world
// before any page script (ADR 0017).
void webFrame.executeJavaScript(CHROME_IDENTITY_SCRIPT);
