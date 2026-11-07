import { TOOL_SHORTCUTS } from "../constants/tool-shortcuts.const";
import {
  type ToolbarControl,
  type ToolbarHost,
  type ToolbarTool,
} from "../models/toolbar-control.model";
import { type Tool } from "@emmettito/canvas";
import {
  checkIcon,
  createIconButton,
  getToolShortcut,
} from "../components/canvas-toolbar/toolbar-elements";
import { createToolOptions } from "./tool-options";

// Clicking the dropper again goes back to the tool before it. The tools with
// options show them in a bar of their own instead.
function pick({ state, actions, closePopover }: ToolbarHost, tool: Tool) {
  if (tool === state.activeTool) {
    if (tool === "dropper") {
      actions.onSelectTool(tool);
    }
  } else {
    closePopover();
    actions.onSelectTool(tool);
  }
}

// A button that picks `tool`. A tool's key only picks it while its button is
// on a toolbar.
function toolButton(
  icon: Element,
  tool: Tool,
  label: string,
  options?: ToolbarTool["options"]
): ToolbarControl {
  checkIcon(icon, tool);
  const shortcut = TOOL_SHORTCUTS[tool];
  return {
    name: tool,
    tool: { tool, label, shortcut, options },
    mount: (host) => {
      const button = createIconButton(label, icon, getToolShortcut(shortcut));
      button.addEventListener("click", () => pick(host, tool));
      return {
        element: button,
        update: (state) =>
          button.setAttribute(
            "aria-pressed",
            String(tool === state.activeTool)
          ),
      };
    },
  };
}

/** Picks, moves and resizes what's placed. */
export function selectTool(icon: Element): ToolbarControl {
  return toolButton(icon, "select", "Select");
}

/** Pans by dragging from anywhere. */
export function handTool(icon: Element): ToolbarControl {
  return toolButton(icon, "hand", "Hand");
}

/** Draws, with its sizes and colors shown while it's picked. */
export function pencilTool(icon: Element): ToolbarControl {
  return toolButton(icon, "pencil", "Pencil", createToolOptions("pencil"));
}

/** Draws see-through, with its sizes and colors shown while it's picked. */
export function highlighterTool(icon: Element): ToolbarControl {
  return toolButton(
    icon,
    "highlighter",
    "Highlighter",
    createToolOptions("highlighter")
  );
}

/** Erases, with its sizes shown while it's picked. */
export function eraserTool(icon: Element): ToolbarControl {
  return toolButton(icon, "eraser", "Eraser", createToolOptions("eraser"));
}

/** Fills areas with its own color, shown while it's picked. */
export function bucketTool(icon: Element): ToolbarControl {
  return toolButton(
    icon,
    "bucket",
    "Paint bucket",
    createToolOptions("bucket")
  );
}

/** Adds sticky notes, with their colors shown while it's picked. */
export function noteTool(icon: Element): ToolbarControl {
  return toolButton(icon, "note", "Sticky note", createToolOptions("note"));
}

/** Adds text. */
export function textTool(icon: Element): ToolbarControl {
  return toolButton(icon, "text", "Text");
}

/** Picks a color from the drawing. */
export function dropperTool(icon: Element): ToolbarControl {
  return toolButton(icon, "dropper", "Dropper");
}
