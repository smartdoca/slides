import { it, expect } from "vitest";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { wireEncode, wireDecode } from "./websocket";
import { readDocument, encodeSlide, slidesOf, rootOf } from "./yjs-codec";
import { createTextElement } from "../model/create";
import { EditorController } from "../model/controller";
import { presentationStore } from "../model/projection-store";

it.runIf(process.env.EPPT_PERF === "1")(
  "measures durable ACKs and remote convergence for an isolated 500-slide room",
  async () => {
    const room = "test-perf-" + crypto.randomUUID();
    const origin = process.env.EPPT_TEST_ORIGIN ?? "ws://127.0.0.1:5180";
    const sockets = [
      new WebSocket(origin + "/eppt-sync"),
      new WebSocket(origin + "/eppt-sync"),
    ];
    const queues = sockets.map(() => [] as any[]);
    sockets.forEach((socket, i) =>
      socket.on("message", (bytes) =>
        queues[i].push(wireDecode(bytes.toString())),
      ),
    );
    const receive = async (index: number, type: string) => {
      const deadline = performance.now() + 30000;
      while (performance.now() < deadline) {
        const error = queues[index].find((m) => m.type === "error");
        if (error) throw Error(JSON.stringify(error));
        const at = queues[index].findIndex((m) => m.type === type);
        if (at >= 0) return queues[index].splice(at, 1)[0];
        await new Promise((r) => setTimeout(r, 1));
      }
      throw Error("Timeout " + type);
    };
    const docs = [new Y.Doc(), new Y.Doc()];
    try {
      await Promise.all(
        sockets.map(
          (socket) =>
            new Promise<void>((resolve, reject) => {
              socket.once("open", () => resolve());
              socket.once("error", reject);
            }),
        ),
      );
      for (let i = 0; i < 2; i++)
        sockets[i].send(
          wireEncode({
            type: "sync-request",
            id: crypto.randomUUID(),
            room,
            protocolVersion: 1,
            codec: "eppt",
            codecRevision: 5,
            schemaVersion: 2,
            vector: Y.encodeStateVector(docs[i]),
          }),
        );
      const init = await receive(0, "sync-response");
      Y.applyUpdate(docs[0], init.update);
      Y.applyUpdate(docs[1], (await receive(1, "sync-response")).update);
      const store = presentationStore(docs[1]);
      const send = async (index: number, action: () => void) => {
        let update!: Uint8Array;
        const capture = (bytes: Uint8Array) => {
          update = bytes;
        };
        docs[index].on("update", capture);
        action();
        docs[index].off("update", capture);
        const request = {
          type: "update",
          id: crypto.randomUUID(),
          room,
          epochId: init.epochId,
          update,
        };
        const start = performance.now();
        sockets[index].send(wireEncode(request));
        const ack = await receive(index, "ack"),
          latency = performance.now() - start;
        Y.applyUpdate(
          docs[1 - index],
          (await receive(1 - index, "update")).update,
        );
        return { latency, request, ack };
      };
      for (let offset = 0; offset < 499; offset += 25)
        await send(0, () =>
          docs[0].transact(() => {
            for (let i = offset; i < Math.min(499, offset + 25); i++) {
              const slide = {
                id: `perf-${i}`,
                elementOrder: [] as string[],
                elements: {} as Record<
                  string,
                  ReturnType<typeof createTextElement>
                >,
              };
              for (let j = 0; j < 20; j++) {
                const el = createTextElement(`协作压测 ${i}/${j}`);
                slide.elementOrder.push(el.id);
                slide.elements[el.id] = el;
              }
              slidesOf(docs[0]).set(slide.id, encodeSlide(slide));
              (rootOf(docs[0]).get("slideOrder") as Y.Array<string>).push([
                slide.id,
              ]);
            }
          }),
        );
      const c = docs.map((doc) => new EditorController(doc)),
        latencies = [];
      let last!: Awaited<ReturnType<typeof send>>;
      for (let i = 0; i < 30; i++) {
        const sid = i % 2 ? "perf-498" : "perf-0",
          view = readDocument(docs[i % 2]);
        last = await send(i % 2, () =>
          c[i % 2].patch(sid, view.slides[sid].elementOrder[0], {
            fill: `#${(0x123400 + i).toString(16)}`,
          }),
        );
        latencies.push(last.latency);
      }
      sockets[1].send(wireEncode(last.request));
      expect((await receive(1, "ack")).seq).toBe(last.ack.seq);
      const sameElement = readDocument(docs[0]).slides["perf-0"].elementOrder[0];
      await Promise.all([
        send(0, () => c[0].patch("perf-0", sameElement, { fill: "#abcdef" })),
        send(1, () => c[1].patch("perf-0", sameElement, { opacity: 0.75 })),
      ]);
      expect(store.getSnapshot()).toEqual(readDocument(docs[0]));
      const restored = new Y.Doc();
      sockets[0].send(wireEncode({
        type: "sync-request", id: crypto.randomUUID(), room,
        protocolVersion: 1, codec: "eppt", codecRevision: 5, schemaVersion: 2,
        epochId: init.epochId, vector: Y.encodeStateVector(restored),
      }));
      Y.applyUpdate(restored, (await receive(0, "sync-response")).update);
      expect(readDocument(restored)).toEqual(readDocument(docs[0]));
      restored.destroy();
      latencies.sort((a, b) => a - b);
      console.log(
        "DURABLE_ACK_BENCHMARK",
        JSON.stringify({
          room,
          pages: 500,
          elements: Object.values(readDocument(docs[0]).slides).reduce(
            (n, s) => n + s.elementOrder.length,
            0,
          ),
          samples: 30,
          medianMs: latencies[15],
          p95Ms: latencies[28],
          maxMs: latencies[29],
          converged: true,
          duplicateAck: true,
          concurrentSameElement: true,
          fullReload: true,
        }),
      );
      c.forEach((controller) => controller.dispose());
    } finally {
      sockets.forEach((socket) => socket.close());
      docs.forEach((doc) => doc.destroy());
    }
  },
  120000,
);
