// Polls whether the signed-in rep's browser extension is connected and
// switched on. Backed by the `RepExtension` DO's `/agents/:repId/status`
// endpoint; refetched on an interval so a UI that gates on "extension ready"
// (e.g. the live-demo button in `extension-section.tsx`) lights up within a
// few seconds of the rep connecting it — no page reload needed.

import { useQuery } from "@tanstack/react-query";
import { getAgentToken } from "@/lib/agent-token-fns";
import { agentBaseUrl, fetchExtensionStatus } from "@/lib/extension";

export interface ExtensionStatusResult {
  /** the extension's control WebSocket is connected to the backend. */
  connected: boolean;
  /** the rep's master switch (coffee-cup toggle) is ON. */
  enabled: boolean;
  /** the first probe hasn't resolved yet. */
  loading: boolean;
}

export function useExtensionStatus(): ExtensionStatusResult {
  const query = useQuery({
    queryKey: ["extension-status"],
    queryFn: async () => {
      const token = await getAgentToken();
      if (!token.token || !token.repId) return { online: false, enabled: false };
      const status = await fetchExtensionStatus(agentBaseUrl(), token.token, token.repId);
      return status ?? { online: false, enabled: false };
    },
    // Connecting the extension happens out-of-band (the rep clicks through
    // the onboard flow in another tab); poll so the button un-gates on its own.
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  return {
    connected: query.data?.online ?? false,
    enabled: query.data?.enabled ?? false,
    loading: query.isLoading,
  };
}
