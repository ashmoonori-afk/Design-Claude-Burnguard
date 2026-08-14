import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrapApiAuthority } from "@/api/client";
import { queryClient } from "@/api/queryClient";
import App from "./App";
import "./index.css";

async function main(): Promise<void> {
  await bootstrapApiAuthority();

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("BurnGuard root element is missing.");
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void main();
