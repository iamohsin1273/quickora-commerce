export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  let payload: { data?: T; error?: { message?: string; code?: string } };
  try {
    payload = await response.json() as { data?: T; error?: { message?: string; code?: string } };
  } catch {
    throw new ApiRequestError("The server returned an unreadable response. Please try again.", response.status);
  }
  if (!response.ok) throw new ApiRequestError(payload.error?.message ?? "Something went wrong. Please try again.", response.status, payload.error?.code);
  return payload.data as T;
}
