/** Route-based fetch mock: first matching substring wins. Never hits the network. */
export function mockFetch(routes: [string, unknown | ((url: string) => unknown)][]) {
  const fn = jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find(([match]) => url.includes(match));
    if (!route) return { ok: false, status: 404, json: async () => ({}) } as Response;
    const body =
      typeof route[1] === 'function' ? (route[1] as (u: string) => unknown)(url) : route[1];
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
