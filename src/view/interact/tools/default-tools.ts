/**
 * The built-in tools in router precedence order (D3). Resize precedes connect, so a
 * press on the resize handle never starts a connection; connect precedes
 * select/move so ports win; empty-canvas pan takes plain drags that nothing claimed,
 * before the marquee.
 */
import { connectTool } from "./connect-tool.js";
import { emptyPanTool } from "./empty-pan-tool.js";
import { marqueeTool } from "./marquee-tool.js";
import { panTool } from "./pan-tool.js";
import { resizeTool } from "./resize-tool.js";
import { selectMoveTool } from "./select-move-tool.js";
import { type ToolSlot, toolSlot } from "./tool-router.js";

export function defaultToolSlots(): ToolSlot[] {
  return [
    toolSlot(panTool),
    toolSlot(resizeTool),
    toolSlot(connectTool),
    toolSlot(selectMoveTool),
    toolSlot(emptyPanTool),
    toolSlot(marqueeTool),
  ];
}
