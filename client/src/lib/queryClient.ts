import { QueryClient } from "@tanstack/react-query";

function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw new Error(`${res.status}: ${res.statusText}`);
  }
}

// Store token from Privy authentication (set by the useAuth hook)
let cachedAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  cachedAuthToken = token;
}

// Get the cached auth token that was set by useAuth hook
function getAuthToken(): string | null {
  return cachedAuthToken;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<any> {
  const authToken = getAuthToken();
  
  // Debug logging
  if (!authToken) {
    console.warn('⚠️ No auth token found for request to:', url);
    console.warn('  Cached token:', cachedAuthToken);
  } else {
    console.debug('✅ Auth token found for request:', url.split('/').pop());
  }

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
    },
    credentials: "include",
  };

  if (data !== undefined) {
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, options);

  try {
    throwIfResNotOk(res);
  } catch (error) {
    let errorMessage = `Error: ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage += `: ${JSON.stringify(errorData)}`;
    } catch {
      errorMessage += `: ${res.statusText}`;
    }
    console.error("API Request Error:", errorMessage);
    throw new Error(errorMessage);
  }

  // Check if response has content
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }

  // If no JSON content, return empty object
  return {};
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = queryKey[0] as string;
        const params = queryKey[1] as Record<string, string> | undefined;

        let fullUrl = url;
        if (params) {
          const searchParams = new URLSearchParams(params);
          fullUrl += `?${searchParams.toString()}`;
        }

        const authToken = getAuthToken();
        
        // Debug logging for queries
        if (!authToken) {
          console.warn('No auth token found for query to:', fullUrl);
        }

        const res = await fetch(fullUrl, {
          credentials: "include",
          headers: {
            ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
          },
        });

        try {
          throwIfResNotOk(res);
        } catch (error) {
          let errorMessage = `Error: ${res.status}`;
          try {
            const errorData = await res.json();
            errorMessage += `: ${JSON.stringify(errorData)}`;
          } catch {
            errorMessage += `: ${res.statusText}`;
          }
          console.error("Query Function Error:", errorMessage);
          throw new Error(errorMessage);
        }

        // Check if response has content
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return res.json();
        }

        return {};
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});