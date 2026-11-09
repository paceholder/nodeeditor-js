import { useCommand, useHistory } from "@paceholder/nodeeditor-js/react";
import { COMMAND_IDS } from "@paceholder/nodeeditor-js/view";

/** Buttons follow command availability; the reason shows as the tooltip when refused. */
export function Toolbar() {
  const history = useHistory();
  const undo = useCommand(COMMAND_IDS.undo);
  const redo = useCommand(COMMAND_IDS.redo);
  const del = useCommand(COMMAND_IDS.delete);
  return (
    <div className="toolbar">
      <button
        type="button"
        disabled={!undo.available}
        title={history.undoLabel}
        onClick={undo.run}
      >
        Undo
      </button>
      <button
        type="button"
        disabled={!redo.available}
        title={history.redoLabel}
        onClick={redo.run}
      >
        Redo
      </button>
      <button
        type="button"
        disabled={!del.available}
        title={del.reason?.message ?? "Delete the selection"}
        onClick={del.run}
      >
        Delete
      </button>
    </div>
  );
}
