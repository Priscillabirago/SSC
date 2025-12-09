export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export function storeTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("ssc.accessToken", tokens.accessToken);
  window.localStorage.setItem("ssc.refreshToken", tokens.refreshToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("ssc.accessToken");
  window.localStorage.removeItem("ssc.refreshToken");
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ssc.accessToken");
}

