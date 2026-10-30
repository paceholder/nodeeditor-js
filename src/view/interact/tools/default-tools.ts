/** The built-in tools in router precedence order (D3). Connect precedes select/move so ports win. */
import { connectTool } from "./connect-tool.js";
import { marqueeTool } from "./marquee-tool.js";
import { panTool } from "./pan-tool.js";
import { selectMoveTool } from "./select-move-tool.js";
import { type ToolSlot, toolSlot } from "./tool-router.js";

export function defaultToolSlots(): ToolSlot[] {
  return [
    toolSlot(panTool),
    toolSlot(connectTool),
    toolSlot(selectMoveTool),
    toolSlot(marqueeTool),
  ];
}
