# Guide: using the editor from React

A tutorial for application developers who host the editor in a React 19 application:
mount it, read editor state in components, anchor React content to a node, and add the
zoom and lock controls. Everything here comes from `nodeeditor-js/react`; the model and
geometry names stay in `nodeeditor-js` and the view names in `nodeeditor-js/view`. Each
name has exactly one import path, so the react entry never re-exports them.
For the view itself read [guide-view.md](guide-view.md), and for the model side read
[guide-using-the-model.md](guide-using-the-model.md).

React is an optional peer dependency (`react` and `react-dom`, version 19 or newer). The
entry point is safe to import and to render on a server: nothing runs at import time and
the canvas is created only after the component mounts in a browser.

A working example with an inspector, a toolbar, a hover popover and the controls is in
`examples/react` (`npm run demo:react`).

## 1. Mounting

```tsx
import { createGraphModel } from "nodeeditor-js";
import { EditorProvider, NodeEditor } from "nodeeditor-js/react";

const model = createGraphModel();

function App() {
  return (
    <EditorProvider>
      <NodeEditor model={model} style={{ height: 600 }} />
      <Inspector />
    </EditorProvider>
  );
}
```

`NodeEditor` renders one container `div` and mounts one view into it. It takes the same
options as `mountView` plus `className` and `style` for the container. The view is created
in an effect and disposed in its cleanup, so Strict Mode's setup, cleanup, setup leaves
exactly one view with one set of listeners.

`EditorProvider` shares the mounted view with components anywhere below it, so a toolbar
or an inspector does not need the view passed down. Without a provider the hooks stay
inert: they return empty values and never throw. `useEditor()` returns the view handle, or
`null` before the editor mounts and after it unmounts.

`NodeEditor` also works without a provider. Give it children, and the components that
read the editor (`ViewControls`, `NodeOverlay`, any component using the hooks) see the
editor they sit in:

```tsx
<NodeEditor model={model} onReady={(view) => (window.editor = view)}>
  <ViewControls />
  <NodeOverlay node={id}>...</NodeOverlay>
</NodeEditor>
```

Children render next to the container `div`, not inside it, so they should render into
the view's overlay layer (the controls and overlays do) or position themselves.
`onReady(view)` receives the view handle each time one is mounted, again after a remount;
use `useEditor()` instead when the code sits below a provider.

One provider serves one editor. If a second `NodeEditor` mounts into a provider that
already has one, the hooks follow the newest and, in development, a warning says so. An
editor that unmounts clears the slot only when the slot is still its own. For two editors
on one page, wrap each in its own `EditorProvider`.

The model belongs to the application, not to the component. Unmounting the editor never
changes or disposes the model, and a new `NodeEditor` over the same model shows the same
graph.

### Which prop changes remount

Only some options can change on a live view. The component sorts its props into kinds.
The sorting is a total map in the source, so a new view option cannot be added without
deciding which kind it is.

| Kind | Props | What a change does |
| --- | --- | --- |
| Live | `theme`, `locked`, `zoomLimits`, `input.toolOptions`, `input.chooseConnection` | Applied to the live view. Selection, viewport and any gesture stay. |
| Initial | `initialViewport`, `initialFit` | Read once at mount, ignored afterwards. An inline object costs nothing. |
| Remount | `model`, `geometry`, `routes`, `routeEditors`, `zOrder`, `painters`, `assets`, `viewState`, `gestureBitmap`, `frameClock`, `input` (on or off), `input.tools`, `input.keymap`, `input.platform`, `input.clipboard` | A fresh view replaces the old one, which is disposed first. Viewport and selection start over. |

Identity decides, not content: a new object with the same fields still remounts. Create
registries, keymaps and similar values once (module scope or `useMemo`), as the example
does. A remount does not leak: the old view is disposed before the new one mounts. In
development the component warns once when the view remounts on three renders in a row,
which usually means a remount option is created anew on every render.

### Theme and tool options describe the whole value

`theme` and `input.toolOptions` are replaced, not patched, when they change: a key you drop
is back at its default, and removing the prop restores the default theme or tool options.
The imperative `view.setTheme(patch)` and `view.setToolOptions(patch)` still merge. The
component compares these props by identity, so memoize them if they are large.

### The lock is a live prop

`locked` is applied whenever it changes, with no remount. The lock can also change from
inside the editor (the lock button of `ViewControls`) or through `view.setLocked`.
`onLockedChange(locked)` reports every change, whoever made it. To keep the lock fully
under the host's control, hold it in state and pass both:

```tsx
const [locked, setLocked] = useState(false);
<NodeEditor model={model} locked={locked} onLockedChange={setLocked} />
```

Without `onLockedChange`, the prop sets the lock at mount and whenever it changes, and a
press of the lock button changes the view until the prop changes again.

## 2. Reading editor state

Hooks read the editor through `useSyncExternalStore` with stable snapshots: a hook returns
the same object while nothing it reports has changed, so it can sit in a dependency list.

| Hook | Returns | Re-renders when |
| --- | --- | --- |
| `useSelection()` | `{ nodes, connections, primary }`: the selected IDs and the primary entity with its kind | the selection changes |
| `useViewport()` | the pan and zoom | the viewport changes, at most once per frame |
| `useHover()` | the hovered node, port or connection, or `null` | the hovered entity changes |
| `useViewLocked()` | `boolean` | the lock changes |
| `useCommand(id, args?)` | `{ available, reason, run }` for one button | the answer changes, including through the view lock |
| `useCommandAvailability(id, args?)` | whether the command can run now, with the reason if not | selection, model, history or lock changes alter the answer |
| `useHistory()` | `canUndo`, `canRedo` and labels | the history state changes |
| `useNode(id)` | the node's record, or `undefined` while absent | a committed change touched that node |
| `useConnection(id)` | the connection's record, or `undefined` | a committed change touched that connection |

`primary` is `{ kind: "node" | "connection", id }`, or `undefined` for an empty selection. The hook
never shows the view's own key strings; they appear only when you set the selection
through `view.selection`.

### Subscription granularity

The goal is that a busy editor does not make the whole application render.

- **Pointer samples never become React state.** A drag produces many pointer events per
  frame. The view applies them to its own scene; the hooks above see only committed edits
  and coalesced notifications. The viewport hook is notified at most once per animation
  frame, however many pan samples arrive.
- **A node hook wakes only for its node.** `useNode(id)` subscribes to one entity through
  one dispatcher per provider. Dragging node A re-renders a component showing node B zero
  times. The dispatcher listens to the model only while some entity hook is registered.
  A model `reset` wakes every entity hook, because everything may have changed.
- **Coarse hooks are coarse on purpose.** `useSelection` re-renders on every selection
  change, `useHistory` on every history change. Keep such components small, and put the
  fine-grained reads (one node's title, say) in a child that calls `useNode`.
- **Entity hooks cover nodes and connections.** A change to a node's ports alone does not
  wake `useNode`; the record holds the port IDs, not the port contents.

```tsx
function Inspector() {
  const { primary } = useSelection(); // renders when the selection changes
  return primary?.kind === "node" ? (
    <NodeDetails id={primary.id} />
  ) : (
    <p>Select a node.</p>
  );
}

function NodeDetails({ id }: { id: NodeId }) {
  const node = useNode(id); // renders when this node changes, not while others are dragged
  return <h2>{node?.title ?? "removed"}</h2>;
}
```

### Toolbars

`useCommand(id, args?)` is what a toolbar button needs: `available`, the `reason` while it
cannot run, and a `run()` that executes it. The IDs are in `COMMAND_IDS` from
`nodeeditor-js/view`. The answer follows selection, model, history and the view lock, and
the object keeps its identity while it is unchanged.

```tsx
function DeleteButton() {
  const del = useCommand(COMMAND_IDS.delete);
  return (
    <button
      type="button"
      disabled={!del.available}
      title={del.reason?.message ?? "Delete"}
      onClick={del.run}
    >
      Delete
    </button>
  );
}
```

`useCommandAvailability(id, args?)` is the read-only part when you do not need `run`, and
`useHistory` reports the undo and redo labels. `args` is part of the answer's identity: pass
a stable value (a constant or a memoized object), not a new literal on every render.

A model that is read-only gets an inert history: `useHistory` reports nothing to undo. The
test is `hasHistory(model)` from `nodeeditor-js/view`, a type guard you can use for your own
models too: it holds for any model that provides `historyState()`.

## 3. Content anchored to a node

`NodeOverlay` renders React children at a node: a popover, an inline editor, a status
badge. It attaches one slot to the view's overlay layer and portals the children into it,
so the content is ordinary React (it keeps your context providers) but is positioned by
the view and follows the node through pan, zoom and node moves.

```tsx
<NodeOverlay node={id} placement="top" offset={6}>
  <Popover />
</NodeOverlay>
```

| Prop | Meaning |
| --- | --- |
| `node` | The anchored node. |
| `placement` | Where the content sits relative to the node's body, such as `"top"` or `"top-left"` (the default). |
| `offset` | Gap in CSS pixels for the edge placements. |
| `scale` | Scale the content with zoom instead of keeping its size. |
| `onNodeGone` | Called once when the node is removed from the model the editor shows. |

Rules and limits:

- **Absent node.** While the node is absent the slot is hidden and `onNodeGone` fires once.
  Nothing throws. Only a removal counts: unmounting the editor, or giving it another model,
  does not call `onNodeGone`, and a node that was never in the model does not either.
- **Input isolation.** A press on overlay content never starts a pan, a selection or a node
  move, and keys typed in a field inside it never run graph commands such as delete.
- **Wheel.** The wheel over overlay content does not zoom the canvas, so a scrollable
  popover scrolls. The wheel over empty overlay area still zooms.
- **Scope.** The overlay layer is for a handful of nodes at a time, such as the hovered or
  selected node. It is not a way to draw a React component inside every node of a large
  graph; node bodies are painted on the canvas.

For a hover popover, `useHover()` gives the entity and `view.on("hover", ...)` gives the
node's screen rectangle in the event. A delay before showing a tooltip is the
application's to implement.

## 4. Zoom, fit and lock controls

`<ViewControls />` is a small optional panel of plain buttons: zoom in, zoom out, fit to
content and a lock toggle. It sits in the bottom-left corner of the view by default and
carries no stylesheet. Buttons have stable class names (`nodeeditor-controls`,
`nodeeditor-controls__zoom-in`, and so on) for styling.

```tsx
<ViewControls corner="bottom-right" buttons={{ lock: false }} zoomFactor={1.5} />
```

| Prop | Meaning |
| --- | --- |
| `corner` | `"bottom-left"` (default), `"bottom-right"`, `"top-left"` or `"top-right"`. |
| `buttons` | Set `zoomIn`, `zoomOut`, `fit` or `lock` to `false` to leave a button out. |
| `zoomFactor` | Zoom factor of one press. Default 1.25. |
| `labels` | Accessible names and tooltips, for localization. |
| `className`, `style` | Restyle the panel. |

The panel is drawn in the overlay layer, so a press or a wheel turn on it never reaches
the canvas. An application that wants different controls builds them with
`useViewLocked`, `useCommandAvailability` and `view.viewport.zoomAt`.

`zoomLimits` bounds wheel, pinch, button and fit zoom and is a live prop: it is compared by
its `min` and `max`, so an inline object is fine and a change updates the mounted view.
`initialFit` fits the content once when the view first has a size and is skipped when
`initialViewport` is given. Both `initialFit` and `initialViewport` are read at
mount and ignored afterwards, like a `defaultValue`; to move the view later, use
`view.viewport.set` or the fit command.

### Locking

A locked view refuses editing and keeps viewing. While locked, move, resize, connect,
route editing, delete, paste, cut and duplicate do nothing and report the reason "The
view is locked". Selection, copy, fit, reset, pan, zoom and hover keep working. Locking
ends a gesture in progress. Start locked with the `locked` mount option, or change it with
`view.setLocked(value)`; `view.locked` reads it and `useViewLocked()` follows it.

The lock belongs to the view, not the model. It never enters history or a snapshot, and
code that edits the model directly is not blocked. A command a host registers is refused
while the view is locked unless it is marked as a view-only command. A toolbar built on
`useHistory` still shows undo as enabled while locked, because the history belongs to the
model; the undo command itself is refused.

## 5. Testing components

Hooks need a real DOM and a mounted view, so the repository tests them in browser mode
(`npm run test:browser`) with a small render helper in `src/react/test-support`. The
server-render test runs in the Node project (`npm test`) and checks that the entry point
imports and renders to a string without a browser.
