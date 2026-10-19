import { handleApi } from "../server/app.ts";

export interface WorkerEnv {
  ASSETS?: {
    fetch(input: Request): Promise<Response>;
  };
}

function redirect(request: Request, pathname: string): Response {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return Response.redirect(url, 302);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return redirect(request, "/arch-template/");

    const apiResponse = await handleApi(request);
    if (apiResponse) return apiResponse;

    if (url.pathname === "/arch-template") return redirect(request, "/arch-template/");
    if (!env?.ASSETS) {
      return new Response("UI assets are not configured on this worker.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const assetUrl = new URL(request.url);
    if (assetUrl.pathname.startsWith("/arch-template/")) {
      const stripped = assetUrl.pathname.slice("/arch-template".length);
      assetUrl.pathname = stripped === "" ? "/" : stripped;
    }
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
