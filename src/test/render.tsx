import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../app/App";

/** Renders the dashboard with a fresh query cache that never retries, so failures show at once. */
export function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
}
