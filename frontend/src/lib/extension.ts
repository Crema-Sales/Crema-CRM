// Shared constants for the Crema browser-extension handshake.
//
// The extension ID is deterministic because `extension/manifest.json` pins a
// `key` — both the unpacked dev build and the signed Chrome Web Store build
// resolve to this same ID. Settings → Browser extension shows it so reps can
// confirm what they loaded matches.
export const EXTENSION_ID = "pdkjolcnmbokmikgdhagdfileefnaobh";

// Origin the extension dials its control WebSocket against. The extension
// rewrites https→wss itself and its baseUrl allowlist accepts any
// `*.workers.dev` host, so handing the REST base straight through is fine.
// Mirrors the prod fallback in `agent-stream.ts`.
export function agentBaseUrl(): string {
  return (
    import.meta.env.VITE_API_BASE ??
    "https://ctrl-alt-elite-agent.smashlabs.workers.dev"
  );
}

// Live state of a rep's browser extension, read from the backend's
// `/agents/:repId/status` endpoint (the `RepExtension` DO).
//  - `online`  — the extension's control WebSocket is connected.
//  - `enabled` — the rep's master switch (coffee-cup toggle) is ON.
export interface ExtensionStatus {
  online: boolean;
  enabled: boolean;
}

// Probe whether the rep's extension is connected and switched on. Returns
// `null` on any transport/HTTP failure so callers can treat "unknown" the
// same as "not connected" without a try/catch.
export async function fetchExtensionStatus(
  baseUrl: string,
  jwt: string,
  repId: string,
  signal?: AbortSignal,
): Promise<ExtensionStatus | null> {
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/agents/${encodeURIComponent(repId)}/status`,
      { headers: { Authorization: `Bearer ${jwt}` }, signal },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { online?: boolean; enabled?: boolean };
    return { online: body.online === true, enabled: body.enabled === true };
  } catch {
    return null;
  }
}
