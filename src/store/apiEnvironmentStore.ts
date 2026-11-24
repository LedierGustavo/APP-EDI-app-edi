import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ApiEnvironment = "production" | "hml";

type ApiEnvironmentState = {
  environment: ApiEnvironment;
  toggleEnvironment: () => void;
};

export const useApiEnvironmentStore = create<ApiEnvironmentState>()(
  persist(
    (set) => ({
      environment: "production",
      toggleEnvironment: () =>
        set((state) => ({
          environment: state.environment === "production" ? "hml" : "production",
        })),
    }),
    { name: "app-edi-api-environment" },
  ),
);

export function getApiBaseUrl(environment: ApiEnvironment) {
  return environment === "hml" ? "https://hml-api.braspress.com" : "https://api.braspress.com";
}
