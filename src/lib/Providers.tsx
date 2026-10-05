"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { isApiError } from "@/lib/api/errors";
import { AuthProvider } from "@/lib/auth/AuthContext";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 4xx will not fix itself; retry only network blips and server errors, twice.
        retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
      <ToastContainer position="top-right" autoClose={5000} newestOnTop closeOnClick pauseOnFocusLoss />
    </QueryClientProvider>
  );
}
