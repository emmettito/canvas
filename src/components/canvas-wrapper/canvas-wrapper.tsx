import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { COLORS } from "../../constants/colors.const";
import { DEFAULT_TOOL_SIZE } from "../../constants/default-tool-size.const";
import { type CanvasState } from "../../models/canvas-state.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Tool } from "../../models/tool.model";
import { useDrawingHistory } from "../../utilities/use-drawing-history";
import { CanvasToolbar } from "../canvas-toolbar/canvas-toolbar";
import { Canvas } from "../canvas/canvas";
import "./canvas-wrapper.css";

export function CanvasWrapper(): JSX.Element {
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // Null until the wrapper has been measured.
  const [canvasState, setCanvasState] = useState<CanvasState | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pencil");
  const [tools, setTools] = useState<Record<Tool, ToolState>>({
    eraser: {
      color: undefined,
      size: DEFAULT_TOOL_SIZE,
    },
    pencil: {
      color: COLORS[0],
      size: DEFAULT_TOOL_SIZE,
    },
  });
  const { strokes, addStroke, undo, redo, canUndo, canRedo } =
    useDrawingHistory();

  const updateTool = useCallback((tool: Tool, values: Partial<ToolState>) => {
    setTools((tools) => ({
      ...tools,
      [tool]: {
        ...tools[tool],
        ...values,
      },
    }));
  }, []);

  // Observing the wrapper catches every size change, not just window resizes,
  // e.g. the toolbar wrapping onto another line.
  useEffect(() => {
    const canvasWrapper = canvasWrapperRef.current;
    if (!canvasWrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { height, width } = entry.contentRect;
      setCanvasState({ height, width });
    });
    observer.observe(canvasWrapper);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className="canvas-wrapper w-full max-w-1000 flex-1"
        ref={canvasWrapperRef}
      >
        {canvasState && (
          <Canvas
            height={canvasState.height}
            width={canvasState.width}
            strokes={strokes}
            toolState={tools[activeTool]}
            onStrokeComplete={addStroke}
          />
        )}
      </div>
      <CanvasToolbar
        activeTool={activeTool}
        tools={tools}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSelectTool={setActiveTool}
        onUpdateTool={updateTool}
      />
    </>
  );
}
