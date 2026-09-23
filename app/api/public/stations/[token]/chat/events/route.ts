import { jsonError } from "@/lib/http";
import { subscribeStationEvents } from "@/lib/chat-events";
import { viewerCount } from "@/lib/presence";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "chat-events", 30, 60);
    const { token } = await context.params;
    const station = await resolvePublicStation(token);
    const encoder = new TextEncoder();
    let unsubscribe: (() => Promise<void>) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* connection closed */ }
        };
        send("presence", { viewerCount: await viewerCount(station.id) });
        unsubscribe = await subscribeStationEvents(station.id, (event) => send(event.type, event.data));
        if (request.signal.aborted) {
          await unsubscribe();
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* connection closed */ } }, 20_000);
        request.signal.addEventListener("abort", () => {
          if (heartbeat) clearInterval(heartbeat);
          void unsubscribe?.();
          try { controller.close(); } catch { /* already closed */ }
        }, { once: true });
      },
      async cancel() {
        if (heartbeat) clearInterval(heartbeat);
        await unsubscribe?.();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
