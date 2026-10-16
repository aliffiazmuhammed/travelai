const rawUrl = (import.meta.env.VITE_API_URL as string) || "";
export const API_BASE_URL = rawUrl.replace(/\/+$/, "");

