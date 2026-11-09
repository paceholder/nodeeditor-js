// Example connection-choice picker and the demo policy that needs it. The library ships
// no picker: when the policy offers several alternatives for the port a connection is
// dropped on, it calls this async function and waits. The answer is an option key, or
// undefined to cancel; the library aborts `signal` when the user presses Escape or
// clicks elsewhere, and this picker then closes.
import {
  type ConnectionPolicy,
  createDefaultConnectionPolicy,
} from "@paceholder/nodeeditor-js";
import type {
  ConnectionChooser,
  ViewHandle,
} from "@paceholder/nodeeditor-js/view";

const KINDS = [
  { key: "direct", label: "Direct link" },
  { key: "delayed", label: "Delayed link" },
] as const;

/**
 * The default policy, except that a signal link from a sensor to a controller can be
 * one of two kinds, so the user is asked which. Every other pair behaves as before.
 */
export function demoPolicy(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept") return outcome;
      const types = [outcome.plan.from.node, outcome.plan.to.node].map(
        (id) => graph.getNode(id)?.type,
      );
      if (types[0] !== "sensor" || types[1] !== "controller") return outcome;
      // A named choice, or the stored kind when the commit is validated again.
      const named = proposal.choice ?? proposal.kind;
      const kind = KINDS.find((k) => k.key === named);
      if (kind) {
        return {
          kind: "accept",
          plan: { ...outcome.plan, connectionKind: kind.key },
        };
      }
      return {
        kind: "choice",
        alternatives: KINDS.map((k) => ({
          ...outcome.plan,
          connectionKind: k.key,
          key: k.key,
          label: k.label,
        })),
      };
    },
  };
}

/**
 * A small list at the drop point; resolves with the clicked option's key. With a host
 * validator installed, the view then judges the chosen alternative itself before it
 * connects, so the picker only answers.
 */
export function choicePicker(view: ViewHandle): ConnectionChooser {
  return (request) =>
    new Promise((resolve) => {
      const list = document.createElement("div");
      list.className = "context-menu";
      list.setAttribute("role", "menu");
      // World-anchored: it stays on the dropped-on port while the view pans or zooms.
      const handle = view.overlay.attach(list, {
        kind: "world",
        point: request.world,
      });
      let finished = false;
      const done = (key: string | undefined) => {
        if (finished) return;
        finished = true;
        handle.dispose();
        view.element.focus();
        resolve(key);
      };
      for (const option of request.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.textContent = `${option.label} (${option.connectionKind})`;
        item.addEventListener("click", () => done(option.key));
        list.append(item);
      }
      request.signal.addEventListener("abort", () => done(undefined));
      list.querySelector("button")?.focus();
    });
}
