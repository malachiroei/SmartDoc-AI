import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SmartDoc keeps Next.js API routes on the server (Vercel / local next start).
 * The Android shell loads that URL in a WebView — do NOT use `output: 'export'`.
 *
 * Dev against local Next: temporarily set server.url to http://10.0.2.2:3000
 * (Android emulator → host machine) and android.allowMixedContent / cleartext as needed.
 */
const config: CapacitorConfig = {
  appId: "ai.smartdoc.app",
  appName: "SmartDoc AI",
  webDir: "capacitor-www",
  server: {
    // Production / staging web app
    url: "https://smartdoc-ai-lovat.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
