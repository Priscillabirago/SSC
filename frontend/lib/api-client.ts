import axios, { AxiosHeaders } from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  withCredentials: false,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("ssc.accessToken");
    if (token) {
      const headers = AxiosHeaders.from(config.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      !error.config._retry
    ) {
      const refreshToken = window.localStorage.getItem("ssc.refreshToken");
      if (refreshToken) {
        try {
          const refreshResponse = await api.post("/auth/refresh", { refresh_token: refreshToken });
          const { access_token: accessToken, refresh_token: newRefresh } = refreshResponse.data;
          window.localStorage.setItem("ssc.accessToken", accessToken);
          if (newRefresh) {
            window.localStorage.setItem("ssc.refreshToken", newRefresh);
          }
          const retryHeaders = AxiosHeaders.from(error.config.headers || {});
          retryHeaders.set("Authorization", `Bearer ${accessToken}`);
          error.config.headers = retryHeaders;
          error.config._retry = true;
          return api(error.config);
        } catch (refreshError) {
          window.localStorage.removeItem("ssc.accessToken");
          window.localStorage.removeItem("ssc.refreshToken");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

