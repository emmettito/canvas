import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { COLORS } from "../../constants/colors.const";
import { DEFAULT_TOOL_SIZE } from "../../constants/default-tool-size.const";
import { type CanvasState } from "../../models/canvas-state.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Tool } from "../../models/tool.model";
import { useDebouncedCallback } from "../../utilities/use-debounced-callback";
import { useDrawingHistory } from "../../utilities/use-drawing-history";
import { CanvasToolbar } from "../canvas-toolbar/canvas-toolbar";
import { Canvas } from "../canvas/canvas";
import "./canvas-wrapper.css";

export function CanvasWrapper(): JSX.Element {
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    height: undefined,
    width: undefined,
  });
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

  const updateCanvasState = useCallback((values: Partial<CanvasState>) => {
    setCanvasState((canvasState) => ({ ...canvasState, ...values }));
  }, []);

  const updateTool = useCallback((tool: Tool, values: Partial<ToolState>) => {
    setTools((tools) => ({
      ...tools,
      [tool]: {
        ...tools[tool],
        ...values,
      },
    }));
  }, []);

  const onResize = useCallback(() => {
    const canvasWrapper = canvasWrapperRef.current;
    if (!canvasWrapper) {
      return;
    }
    // Client size excludes the border, which the canvas sits inside of.
    const { clientHeight: height, clientWidth: width } = canvasWrapper;
    updateCanvasState({ height, width });
  }, [updateCanvasState]);

  const debouncedOnResize = useDebouncedCallback(onResize);

  useEffect(() => {
    window.addEventListener("resize", debouncedOnResize);
    onResize();
    return () => {
      window.removeEventListener("resize", debouncedOnResize);
    };
  }, [debouncedOnResize, onResize]);

  return (
    <>
      <div
        className="canvas-wrapper w-full max-w-1000 flex-1"
        ref={canvasWrapperRef}
      >
        <Canvas
          height={canvasState.height}
          width={canvasState.width}
          strokes={strokes}
          toolState={tools[activeTool]}
          onStrokeComplete={addStroke}
        />
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
