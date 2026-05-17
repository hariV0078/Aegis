const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const fullUrl = `${API_BASE_URL}${path}`;
  console.log(`[API] ${init?.method ?? "GET"} ${fullUrl}`, init?.body);
  
  try {
    const response = await fetch(fullUrl, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API ERROR] ${response.status}: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`[API SUCCESS] ${fullUrl}`, data);
    return data as Promise<T>;
  } catch (error) {
    console.error(`[API FETCH ERROR] ${fullUrl}:`, error);
    throw error;
  }
}

export type Agent = {
  id: string;
  name: string;
  description: string;
  config_json: string;
  workflow_json?: string | null;
  status: string;
  created_at: string;
  last_run_at: string | null;
  total_runs: number;
  pii_transmitted: number;
};

export type AgentRun = {
  id: string;
  agent_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  output_summary: string | null;
  pii_items_stripped: number;
  llm_provider: string;
  midnight_tx_hash: string | null;
  midnight_status: string;
  midnight_submitted_at: string | null;
  midnight_confirmed_at: string | null;
  token_map_json?: string | null;
};

export async function createAgent(payload: {
  description: string;
  llm_provider: string;
  api_key?: string | null;
  workflow_json?: Record<string, unknown> | null;
}): Promise<{ agent: Agent; pii_stripped_during_creation: number }> {
  return request("/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAgents(): Promise<Agent[]> {
  return request("/agents");
}

export async function getAgent(agentId: string): Promise<Agent> {
  return request(`/agents/${agentId}`);
}

export async function deleteAgent(agentId: string): Promise<{ deleted: boolean; agent_id: string }> {
  return request(`/agents/${agentId}`, {
    method: "DELETE",
  });
}

export async function getRuns(agentId: string): Promise<AgentRun[]> {
  return request(`/agents/${agentId}/runs`);
}

export async function getRun(runId: string): Promise<AgentRun> {
  return request(`/agents/runs/${runId}`);
}

export async function updateAgent(agentId: string, payload: { description?: string | null; workflow_json?: Record<string, unknown> | null; }): Promise<Agent> {
  return request(`/agents/${agentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runAgent(agentId: string, payload: {
  input_data: string;
  llm_provider: string;
  api_key?: string | null;
  token_map?: Record<string, string> | null;
}): Promise<{ run_id: string; status: string; output: string; pii_stripped: number; pii_transmitted: number; tool: string }> {
  return request(`/agents/${agentId}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateAgentConfig(payload: { description: string; llm_provider?: string; api_key?: string | null; }): Promise<{ config: Record<string, unknown>; pii_stripped_count: number }> {
  return request(`/agents/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAuditLog(limit = 50): Promise<Array<Record<string, unknown>>> {
  return request(`/audit?limit=${limit}`);
}
