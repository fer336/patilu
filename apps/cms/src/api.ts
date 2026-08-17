import type { AgentToken, CreatedAgentToken, Product, ProductImage, ProductInput } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const ADMIN_SESSION_KEY = "patilu_admin_session";

interface AdminSessionResponse {
  token: string;
  token_type: "bearer";
  expires_in: number;
  email: string;
}

export function getAdminSessionToken(): string | null {
  return sessionStorage.getItem(ADMIN_SESSION_KEY);
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

function adminHeaders(path: string): HeadersInit {
  if (!path.startsWith("/admin/")) return {};
  const token = getAdminSessionToken();
  if (!token) throw new Error("Sign in with Google to manage the CMS.");
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { ...adminHeaders(path), ...init?.headers };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? headers : { "Content-Type": "application/json", ...headers },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail = typeof body === "object" && body !== null && "detail" in body ? String(body.detail) : null;
    throw new Error(detail || `La API respondió con estado ${response.status}.`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export const catalogApi = {
  list: () => request<Product[]>("/admin/products"),
  create: (input: ProductInput) => request<Product>("/admin/products", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ProductInput>) => request<Product>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  delete: (id: string) => request<void>(`/admin/products/${id}`, { method: "DELETE" }),
  updateImage: (productId: string, image: ProductImage) => request<Product>(`/admin/products/${productId}/images/${image.id}`, {
    method: "PATCH",
    body: JSON.stringify({ alt_text: image.alt_text, position: image.position }),
  }),
  setPrimary: (productId: string, imageId: string) => request<Product>(`/admin/products/${productId}/images/${imageId}/primary`, { method: "PUT" }),
  deleteImage: (productId: string, imageId: string) => request<Product>(`/admin/products/${productId}/images/${imageId}`, { method: "DELETE" }),
  reorderImages: (productId: string, images: ProductImage[]) => request<Product>(`/admin/products/${productId}/images/order`, {
    method: "PUT",
    body: JSON.stringify({ images: images.map((image, position) => ({ id: image.id, position })) }),
  }),
  uploadImages: (productId: string, images: File[], altTexts: string[], primaryIndex: number | null) => {
    const body = new FormData();
    images.forEach((image) => body.append("files", image));
    altTexts.forEach((altText) => body.append("alt_texts", altText));
    if (primaryIndex !== null) body.append("primary_index", String(primaryIndex));
    return request<Product>(`/admin/products/${productId}/images`, { method: "POST", body });
  },
};

export const agentTokenApi = {
  list: () => request<AgentToken[]>("/admin/agent-tokens"),
  create: (name: string) => request<CreatedAgentToken>("/admin/agent-tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revoke: (id: string) => request<AgentToken>(`/admin/agent-tokens/${id}/revoke`, { method: "POST" }),
  delete: (id: string) => request<void>(`/admin/agent-tokens/${id}`, { method: "DELETE" }),
};

export const authApi = {
  signInWithGoogle: async (credential: string): Promise<AdminSessionResponse> => {
    const session = await request<AdminSessionResponse>("/admin/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    sessionStorage.setItem(ADMIN_SESSION_KEY, session.token);
    return session;
  },
  signOut: clearAdminSession,
};
