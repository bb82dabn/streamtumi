import { NextRequest, NextResponse } from "next/server";
import { isConfiguredInternalHostname, productForHostname, productOrigin, productRouteDecision, type ProductHost } from "@/lib/product-host";

const productHeader = "x-streamtumi-product";

function secured(_request: NextRequest, response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

function requestHeaders(request: NextRequest, product: ProductHost): Headers {
  const headers = new Headers(request.headers);
  headers.delete(productHeader);
  headers.set(productHeader, product);
  return headers;
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? request.nextUrl.hostname;
  const internalHost = hostname.replace(/^\[/, "").replace(/\]?:\d+$/, "").toLowerCase();
  if (request.nextUrl.pathname === "/api/health" && ["127.0.0.1", "::1", "localhost"].includes(internalHost)) return secured(request, NextResponse.next());
  const product = productForHostname(hostname);
  if (!product) {
    return secured(request, new NextResponse("Unknown host", { status: 421 }));
  }
  const internalRoute = request.nextUrl.pathname.startsWith("/api/internal/");
  if (internalRoute !== isConfiguredInternalHostname(hostname)) {
    return secured(request, new NextResponse("Not found", { status: 404 }));
  }
  const decision = productRouteDecision(product, request.nextUrl.pathname, request.method);
  if (decision.action === "not-found") return secured(request, new NextResponse("Not found", { status: 404 }));
  if (decision.action === "redirect") {
    const target = new URL(decision.pathname, productOrigin(decision.product));
    if (!target.search) target.search = request.nextUrl.search;
    return secured(request, NextResponse.redirect(target, 308));
  }
  if (decision.action === "rewrite") {
    const target = request.nextUrl.clone();
    target.pathname = decision.pathname;
    return secured(request, NextResponse.rewrite(target, { request: { headers: requestHeaders(request, product) } }));
  }
  return secured(request, NextResponse.next({ request: { headers: requestHeaders(request, product) } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
