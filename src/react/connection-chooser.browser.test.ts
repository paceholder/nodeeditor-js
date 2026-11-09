/// <reference types="@vitest/browser-playwright" />
import { act, createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ConnectionPolicy,
  createDefaultConnectionPolicy,
  createGraphModel,
} from "../core/index.js";
import { graphOps, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ConnectionChooser, ViewHandle } from "../view/index.js";
import { mouse } from "../view/interact/input/input-test-support.js";
import { EditorProvider, NodeEditor, useEditor } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

/** The default policy, but a connection into node `b` has to be a "fast" or "slow" one. */
function twoKindsIntoB(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept" || proposal.to.node !== "b") return outcome;
      const kind = proposal.choice ?? proposal.kind;
      if (kind !== undefined) {
        return {
          kind: "accept",
          plan: { ...outcome.plan, connectionKind: kind },
        };
      }
      return {
        kind: "choice",
        alternatives: ["fast", "slow"].map((k) => ({
          ...outcome.plan,
          connectionKind: k,
          key: k,
          label: `${k} link`,
        })),
      };
    },
  };
}

function makeModel() {
  const model = createGraphModel({ connectionPolicy: twoKindsIntoB() });
  const ops = graphOps([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 300, 100),
  ]);
  if (model.submit({ ops }).status !== "accepted") throw new Error("fixture");
  return model;
}

type Seen = { view: ViewHandle | null };

function Probe(props: { into: Seen }): null {
  props.into.view = useEditor();
  return null;
}

/** A host whose chooser is a new function on every render and sets state when asked. */
function StatefulHost(props: {
  model: ReturnType<typeof makeModel>;
  seen: Seen;
  settles: Array<(key: string | undefined) => void>;
  aborted: boolean[];
}) {
  const [asked, setAsked] = useState(0);
  const chooseConnection: ConnectionChooser = (request) => {
    setAsked(asked + 1);
    return new Promise((resolve) => {
      props.settles.push(resolve);
      request.signal.addEventListener("abort", () => props.aborted.push(true));
    });
  };
  return createElement(
    EditorProvider,
    null,
    createElement(NodeEditor, {
      model: props.model,
      input: { platform: "other", chooseConnection },
    }),
    createElement(Probe, { into: props.seen }),
  );
}

function tree(
  model: ReturnType<typeof makeModel>,
  seen: Seen,
  chooseConnection?: ConnectionChooser,
) {
  return createElement(
    EditorProvider,
    null,
    createElement(NodeEditor, {
      model,
      input: {
        platform: "other",
        ...(chooseConnection && { chooseConnection }),
      },
    }),
    createElement(Probe, { into: seen }),
  );
}

/** Drag from a.aR to b.bL. */
const connect = (seen: Seen) =>
  act(async () => {
    if (seen.view) mouse(seen.view).drag([120, 100], [280, 100]);
  });

describe("connection chooser prop", () => {
  it("an inline chooser that sets host state does not abort the choice it just opened", async () => {
    const model = makeModel();
    const seen: Seen = { view: null };
    const settles: Array<(key: string | undefined) => void> = [];
    const aborted: boolean[] = [];
    const r = await renderReact(
      createElement(StatefulHost, { model, seen, settles, aborted }),
    );
    rendered.push(r);
    await frames();
    await connect(seen);
    await frames();
    expect(settles).toHaveLength(1);
    expect(aborted).toEqual([]);
    await act(async () => settles[0]?.("slow"));
    await frames();
    expect(model.reader.connections().map((c) => c.kind)).toEqual(["slow"]);
  });

  it("the most recent chooser function answers the next request", async () => {
    const model = makeModel();
    const seen: Seen = { view: null };
    const seenBy: string[] = [];
    const chooser =
      (name: string): ConnectionChooser =>
      () => {
        seenBy.push(name);
        return undefined;
      };
    const r = await renderReact(tree(model, seen, chooser("first")));
    rendered.push(r);
    await frames();
    await r.rerender(tree(model, seen, chooser("second")));
    await frames();
    await connect(seen);
    expect(seenBy).toEqual(["second"]);
  });

  it("removing the chooser prop uninstalls it", async () => {
    const model = makeModel();
    const seen: Seen = { view: null };
    const r = await renderReact(tree(model, seen, () => "fast"));
    rendered.push(r);
    await frames();
    await r.rerender(tree(model, seen));
    await frames();
    await connect(seen);
    await frames();
    expect(model.reader.connections()).toEqual([]);
  });
});
