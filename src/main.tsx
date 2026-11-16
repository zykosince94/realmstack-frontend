import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App";
import { createQueryClient } from "./app/queryClient";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
