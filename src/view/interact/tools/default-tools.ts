/**
 * The built-in tools in router precedence order (D3). Resize precedes connect, so a
 * press on the resize handle never starts a connection; connect precedes
 * route-edit and select/move so ports win; a route handle of a selected connection
 * precedes select/move, so dragging it never moves a node; empty-canvas pan
 * takes plain drags that nothing claimed, before the marquee.
 *
 * Each call makes a fresh route-edit tool, which remembers the last click for
 * double-click detection.
 */
import { connectTool } from "./connect-tool.js";
import { emptyPanTool } from "./empty-pan-tool.js";
import { marqueeTool } from "./marquee-tool.js";
import { panTool } from "./pan-tool.js";
import { resizeTool } from "./resize-tool.js";
import { createRouteEditTool } from "./route-edit-tool.js";
import { selectMoveTool } from "./select-move-tool.js";
import { type ToolSlot, toolSlot } from "./tool-router.js";

export function defaultToolSlots(): ToolSlot[] {
  return [
    toolSlot(panTool),
    toolSlot(resizeTool),
    toolSlot(connectTool),
    toolSlot(createRouteEditTool()),
    toolSlot(selectMoveTool),
    toolSlot(emptyPanTool),
    toolSlot(marqueeTool),
  ];
}
