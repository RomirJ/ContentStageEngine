import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  arg1: string,
  arg2: string | RequestInit,
  arg3?: unknown,
): Promise<Response> {
  let url: string;
  let init: RequestInit = { credentials: "include" };

  if (typeof arg2 === "object" && !(typeof arg2 === "string")) {
    // apiRequest(url, fetchOptions)
    url = arg1;
    init = { ...init, ...arg2 };
  } else {
    // apiRequest(method, url, data) or apiRequest(url, method, data)
    const isUrlFirst = arg1.startsWith("/") || arg1.startsWith("http");
    const method = isUrlFirst ? (arg2 as string) : arg1;
    url = isUrlFirst ? arg1 : (arg2 as string);
    const data = arg3;
    init = {
      ...init,
      method,
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    };
  }

  const res = await fetch(url, init);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
