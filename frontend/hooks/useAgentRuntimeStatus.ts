"use client";

import { useEffect, useState } from "react";

import {
  AGENT_STATUS_CHANGED,
  readAgentRuntimeStatus,
  type AgentRuntimeStatus,
} from "@/lib/agent-status";

export function useAgentRuntimeStatus() {
  const [status, setStatus] = useState<AgentRuntimeStatus>({ ok: true });

  useEffect(() => {
    const sync = () => setStatus(readAgentRuntimeStatus());
    sync();
    window.addEventListener(AGENT_STATUS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENT_STATUS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return status;
}
