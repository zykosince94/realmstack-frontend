import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/errors";

/**
 * Retries only failures that might succeed on a second try (network errors and 5xx).
 * A 4xx means the request itself is wrong, so retrying would just repeat the error.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}
