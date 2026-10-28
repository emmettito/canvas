import { COLORS } from "../../constants/colors.const";
import { DEFAULT_TOOL_SIZE } from "../../constants/default-tool-size.const";
import { type ToolState } from "../../models/tool-state.model";
import { type Tool } from "../../models/tool.model";
import { createElement } from "../../utilities/create-element";
import { DrawingHistory } from "../../utilities/drawing-history";
import { CanvasToolbar } from "../canvas-toolbar/canvas-toolbar";
import { Canvas } from "../canvas/canvas";
import "./canvas-wrapper.css";

export interface MountedCanvas {
  /** Removes the canvas and stops listening for events. */
  unmount: () => void;
}

/**
 * Adds a canvas and its toolbar to `container`. The canvas fills the
 * container, so the host page decides its size. A container holds one canvas,
 * so unmount the existing one before mounting another.
 */
export function mountCanvas(container: HTMLElement): MountedCanvas {
  // Two canvases would each try to fill the container.
  if (container.querySelector(":scope > .canvas-root")) {
    throw new Error("This container already has a canvas.");
  }
  let activeTool: Tool = "pencil";
  let tools: Record<Tool, ToolState> = {
    eraser: {
      color: undefined,
      size: DEFAULT_TOOL_SIZE,
    },
    pencil: {
      color: COLORS[0],
      size: DEFAULT_TOOL_SIZE,
    },
  };
  const history = new DrawingHistory();

  const root = createElement("div", "canvas-root");
  const canvasWrapper = createElement("div", "canvas-wrapper");
  const canvas = new Canvas(canvasWrapper, tools[activeTool], (stroke) => {
    history.addStroke(stroke);
    update();
  });
  const toolbar = new CanvasToolbar(getToolbarState(), {
    onUndo: () => {
      history.undo();
      update();
    },
    onRedo: () => {
      history.redo();
      update();
    },
    onSelectTool: (tool) => {
      activeTool = tool;
      update();
    },
    onUpdateTool: (tool, values) => {
      tools = { ...tools, [tool]: { ...tools[tool], ...values } };
      update();
    },
  });
  root.append(canvasWrapper, toolbar.element);
  container.append(root);

  function getToolbarState() {
    return {
      activeTool,
      tools,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    };
  }

  function update() {
    canvas.setStrokes(history.strokes);
    canvas.setToolState(tools[activeTool]);
    toolbar.update(getToolbarState());
  }

  // Observing the wrapper catches every size change, not just window resizes,
  // e.g. the toolbar wrapping onto another line.
  const observer = new ResizeObserver(([entry]) => {
    const { height, width } = entry.contentRect;
    canvas.setSize(width, height);
  });
  observer.observe(canvasWrapper);

  return {
    unmount: () => {
      observer.disconnect();
      toolbar.destroy();
      root.remove();
    },
  };
}
