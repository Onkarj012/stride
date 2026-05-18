const API_URL = import.meta.env.VITE_API_URL || "";

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  getToken?: () => Promise<string | null>,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {}
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let errorMsg = "Request failed";
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("Invalid response from server");
  }
}
