import { describe, expect, it } from "vitest";
import {
  type ChoiceAlternative,
  type Command,
  nodeId,
  portId,
} from "../../../core/index.js";
import type {
  ChoiceRelease,
  GestureCancellation,
} from "../tools/tool-types.js";
import type {
  ConnectionChoiceRequest,
  ConnectionChooser,
} from "./choice-types.js";
import { createConnectionChoice } from "./connection-choice.js";

const source = { node: nodeId("a"), port: portId("aR") };
const target = { node: nodeId("b"), port: portId("bL") };
const alt = (key: string): ChoiceAlternative => ({
  key,
  label: `${key} link`,
  plan: { from: source, to: target, connectionKind: key, auxiliary: [] },
});
const release: ChoiceRelease = {
  source,
  target,
  alternatives: [alt("fast"), alt("slow")],
  at: { x: 200, y: 10 },
};

/** A chooser whose answer the test settles later. */
function deferred() {
  const requests: ConnectionChoiceRequest[] = [];
  const settles: Array<(key: string | undefined) => void> = [];
  let fail: (e: unknown) => void = () => {};
  const chooser: ConnectionChooser = (request) => {
    requests.push(request);
    return new Promise((resolve, reject) => {
      settles.push(resolve);
      fail = reject;
    });
  };
  return {
    chooser,
    requests,
    /** Answer the latest request, or request `i`. */
    resolve: (key: string | undefined, i = settles.length - 1) =>
      settles[i]?.(key),
    reject: (e: unknown) => fail(e),
  };
}

function setup(chooser?: ConnectionChooser) {
  const commits: Command[] = [];
  let clears = 0;
  const choice = createConnectionChoice(
    {
      commit: (c) => void commits.push(c),
      clearPreview: () => void clears++,
      place: (w) => ({
        client: { x: w.x + 1000, y: w.y + 1000 },
        viewport: { x: w.x + 10, y: w.y + 10 },
      }),
    },
    chooser,
  );
  return { choice, commits, clears: () => clears };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("pending connection choice", () => {
  it("Host picks an option: one connect naming the key, preview cleared", async () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    expect(s.choice.pending()).toBe(true);
    const request = d.requests[0];
    expect(request?.options.map((o) => o.key)).toEqual(["fast", "slow"]);
    expect(request?.world).toEqual({ x: 200, y: 10 });
    expect(request?.viewport).toEqual({ x: 210, y: 20 });
    expect(request?.client).toEqual({ x: 1200, y: 1010 });
    expect(s.commits).toEqual([]);
    expect(s.clears()).toBe(0);
    d.resolve("slow");
    await flush();
    expect(s.commits).toEqual([
      {
        kind: "connect",
        from: source,
        to: target,
        connectionKind: "slow",
        choice: "slow",
      },
    ]);
    expect(s.clears()).toBe(1);
    expect(s.choice.pending()).toBe(false);
    expect(request?.signal.aborted).toBe(false);
  });

  it("Host declines: nothing committed, preview cleared, signal aborted", async () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    d.resolve(undefined);
    await flush();
    expect(s.commits).toEqual([]);
    expect(s.clears()).toBe(1);
    expect(d.requests[0]?.signal.aborted).toBe(true);
  });

  it("Escape while choosing: the signal aborts and a later answer is ignored", async () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    s.choice.cancel();
    expect(d.requests[0]?.signal.aborted).toBe(true);
    expect(s.clears()).toBe(1);
    d.resolve("fast");
    await flush();
    expect(s.commits).toEqual([]);
    expect(s.clears()).toBe(1);
  });

  it("Target removed while choosing cancels; unrelated removals do not", () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    s.choice.entitiesRemoved(["n9", "p9"]);
    expect(s.choice.pending()).toBe(true);
    s.choice.entitiesRemoved(["b"]);
    expect(s.choice.pending()).toBe(false);
    expect(d.requests[0]?.signal.aborted).toBe(true);
  });

  it("Dispose while choosing aborts; replacing the chooser cancels too", () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    s.choice.setChooser(d.chooser);
    expect(d.requests[0]?.signal.aborted).toBe(true);
    s.choice.open(release);
    s.choice.dispose();
    expect(d.requests[1]?.signal.aborted).toBe(true);
    expect(s.choice.installed()).toBe(false);
    expect(s.commits).toEqual([]);
  });

  it("a thrown or rejecting chooser counts as declining", async () => {
    const thrown = setup(() => {
      throw new Error("boom");
    });
    thrown.choice.open(release);
    expect(thrown.choice.pending()).toBe(false);
    expect(thrown.clears()).toBe(1);
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    d.reject(new Error("closed"));
    await flush();
    expect(s.commits).toEqual([]);
    expect(s.choice.pending()).toBe(false);
  });

  it("an unknown key counts as declining", () => {
    const s = setup(() => "warp");
    s.choice.open(release);
    expect(s.commits).toEqual([]);
    expect(s.clears()).toBe(1);
  });

  it("a synchronous answer commits within the same call", () => {
    const s = setup(() => "fast");
    s.choice.open(release);
    expect(s.commits).toHaveLength(1);
    expect(s.choice.pending()).toBe(false);
  });

  it("a second release replaces the first: only the newer answer counts", async () => {
    const d = deferred();
    const s = setup(d.chooser);
    s.choice.open(release);
    s.choice.open(release);
    expect(d.requests[0]?.signal.aborted).toBe(true);
    d.resolve("fast", 0);
    d.resolve("slow", 1);
    await flush();
    expect(s.commits.map((c) => c.kind === "connect" && c.choice)).toEqual([
      "slow",
    ]);
  });

  it("without a chooser a release only clears the preview", () => {
    const s = setup();
    expect(s.choice.installed()).toBe(false);
    s.choice.open(release);
    expect(s.choice.pending()).toBe(false);
    expect(s.clears()).toBe(1);
  });
});

/** A choice whose picked alternative waits for a host verdict the test settles. */
function verifying() {
  const commits: Command[] = [];
  const requested: Command[] = [];
  const log: string[] = [];
  const cancellations: GestureCancellation[] = [];
  let awaiting = true;
  let clears = 0;
  const d = deferred();
  const choice = createConnectionChoice(
    {
      commit: (c) => {
        commits.push(c);
        log.push("commit");
      },
      clearPreview: () => void clears++,
      cancelled: (c) => void cancellations.push(c),
      verification: {
        awaiting: () => awaiting,
        request: (c) => void requested.push(c),
        showPending: () => void log.push("pending"),
        ended: () => void log.push("ended"),
      },
      place: (w) => ({ client: w, viewport: { x: w.x, y: w.y } }),
    },
    d.chooser,
  );
  return {
    choice,
    commits,
    requested,
    log,
    cancellations,
    d,
    clears: () => clears,
    settle: () => {
      awaiting = false;
      choice.verdictSettled();
    },
  };
}

describe("a picked alternative waits for its host verdict", () => {
  it("the pick asks for the verdict, shows pending, and commits once when it settles", async () => {
    const s = verifying();
    s.choice.open(release);
    s.d.resolve("slow");
    await flush();
    expect(s.commits).toEqual([]);
    expect(s.requested).toEqual([
      {
        kind: "connect",
        from: source,
        to: target,
        connectionKind: "slow",
        choice: "slow",
      },
    ]);
    expect(s.choice.pending()).toBe(true);
    expect(s.clears()).toBe(0);
    expect(s.d.requests[0]?.signal.aborted).toBe(false);
    s.choice.verdictSettled();
    expect(s.commits).toEqual([]);
    s.settle();
    expect(s.commits).toHaveLength(1);
    expect(s.choice.pending()).toBe(false);
    // The commit comes before the end, so a failed verdict is still seen by it.
    expect(s.log).toEqual(["pending", "commit", "ended"]);
    s.settle();
    expect(s.commits).toHaveLength(1);
  });

  it("a pick that needs no verdict commits at once and ends nothing", async () => {
    const s = verifying();
    s.settle();
    s.choice.open(release);
    s.d.resolve("fast");
    await flush();
    expect(s.commits).toHaveLength(1);
    expect(s.log).toEqual(["commit", "ended"]);
  });

  it("cancelling, removal of an involved port, a new chooser and dispose end the wait with nothing committed", async () => {
    for (const end of [
      (s: ReturnType<typeof verifying>) => s.choice.cancel(),
      (s: ReturnType<typeof verifying>) => s.choice.entitiesRemoved(["bL"]),
      (s: ReturnType<typeof verifying>) => s.choice.setChooser(undefined),
      (s: ReturnType<typeof verifying>) => s.choice.dispose(),
    ]) {
      const s = verifying();
      s.choice.open(release);
      s.d.resolve("fast");
      await flush();
      end(s);
      expect(s.choice.pending()).toBe(false);
      expect(s.log).toEqual(["pending", "ended"]);
      s.settle();
      expect(s.commits).toEqual([]);
    }
  });

  it("removing an involved port or node cancels the wait and tells the host; an unrelated removal does not", async () => {
    const s = verifying();
    s.choice.open(release);
    s.d.resolve("fast");
    await flush();
    s.choice.entitiesRemoved(["zzz"]);
    expect(s.choice.pending()).toBe(true);
    expect(s.cancellations).toEqual([]);
    s.choice.entitiesRemoved(["x", "bL", "a"]);
    expect(s.choice.pending()).toBe(false);
    expect(s.cancellations).toEqual([
      { reason: "entity-removed", ids: ["bL", "a"] },
    ]);
    expect(s.d.requests[0]?.signal.aborted).toBe(true);
    expect(s.log).toEqual(["pending", "ended"]);
    s.settle();
    expect(s.commits).toEqual([]);
  });

  it("an external change of an involved entity cancels the wait and tells the host; an unrelated one does not", async () => {
    const s = verifying();
    s.choice.open(release);
    s.d.resolve("fast");
    await flush();
    s.choice.externallyChanged(["zzz"]);
    expect(s.choice.pending()).toBe(true);
    s.choice.externallyChanged(["aR", "other"]);
    expect(s.choice.pending()).toBe(false);
    expect(s.cancellations).toEqual([
      { reason: "external-change", ids: ["aR"] },
    ]);
    expect(s.d.requests[0]?.signal.aborted).toBe(true);
    expect(s.log).toEqual(["pending", "ended"]);
    s.settle();
    expect(s.commits).toEqual([]);
  });

  it("the commit of the choice itself is not a cancellation", async () => {
    const s = verifying();
    s.choice.open(release);
    s.d.resolve("fast");
    await flush();
    s.settle();
    // The commit's own change arrives after the choice is over.
    s.choice.entitiesRemoved(["bL"]);
    s.choice.externallyChanged(["aR"]);
    expect(s.commits).toHaveLength(1);
    expect(s.cancellations).toEqual([]);
  });

  it("a choice the host is still deciding is not told about external changes", async () => {
    const s = verifying();
    s.choice.open(release);
    s.choice.externallyChanged(["aR"]);
    expect(s.choice.pending()).toBe(true);
    s.choice.entitiesRemoved(["bL"]);
    expect(s.choice.pending()).toBe(false);
    expect(s.cancellations).toEqual([]);
  });

  it("a second release during the wait replaces it", async () => {
    const s = verifying();
    s.choice.open(release);
    s.d.resolve("fast");
    await flush();
    s.choice.open(release);
    expect(s.log).toEqual(["pending", "ended"]);
    s.settle();
    expect(s.commits).toEqual([]);
  });
});
