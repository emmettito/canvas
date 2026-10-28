import { JSX, useEffect, useRef, useState } from "react";
import { COLORS } from "../../constants/colors.const";
import { MAX_TOOL_SIZE } from "../../constants/max-tool-size.const";
import { MIN_TOOL_SIZE } from "../../constants/min-tool-size.const";
import { TOOLS } from "../../constants/tools.const";
import redoIcon from "../../images/redo.svg";
import undoIcon from "../../images/undo.svg";
import { ToolState } from "../../models/tool-state.model";
import { Tool } from "../../models/tool.model";
import { Popover } from "../popover/popover";
import "./canvas-toolbar.scss";

type ToolbarPopover = Tool | "color";

const TOOL_LABELS: Record<Tool, string> = {
  eraser: "Eraser",
  pencil: "Pencil",
};

interface CanvasToolbarProps {
  activeTool: Tool;
  tools: Record<Tool, ToolState>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: (tool: Tool) => void;
  onUpdateTool: (tool: Tool, values: Partial<ToolState>) => void;
}

// The selection ring needs to stand out against the color it sits on.
function getRingColor(color: string): string {
  return color === "#FFFFFF" ? "#CCCCCC" : "#FFFFFF";
}

export function CanvasToolbar({
  activeTool,
  tools,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSelectTool,
  onUpdateTool,
}: CanvasToolbarProps): JSX.Element {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [openPopover, setOpenPopover] = useState<ToolbarPopover>(null);
  const pencilColor = tools.pencil.color;

  // Close the open popover on any press outside the toolbar, e.g. on the canvas.
  useEffect(() => {
    if (!openPopover) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openPopover]);

  const togglePopover = (popover: ToolbarPopover) => {
    setOpenPopover((openPopover) => (openPopover === popover ? null : popover));
  };

  // Clicking the active tool again opens its size slider.
  const onToolClick = (tool: Tool) => {
    if (tool === activeTool) {
      togglePopover(tool);
    } else {
      onSelectTool(tool);
      setOpenPopover(null);
    }
  };

  const onColorClick = (color: string) => {
    onUpdateTool("pencil", { color });
    onSelectTool("pencil");
    setOpenPopover(null);
  };

  return (
    <div className="canvas-toolbar" ref={toolbarRef}>
      <button
        className="canvas-toolbar-button icon-button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <img src={undoIcon} alt="" />
      </button>
      <button
        className="canvas-toolbar-button icon-button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <img src={redoIcon} alt="" />
      </button>

      {TOOLS.map((tool) => (
        <div className="canvas-toolbar-item" key={tool}>
          <button
            className="canvas-toolbar-button"
            aria-pressed={tool === activeTool}
            onClick={() => onToolClick(tool)}
          >
            {TOOL_LABELS[tool]}
          </button>
          {openPopover === tool && (
            <Popover>
              <input
                className="tool-size-slider"
                type="range"
                aria-label={`${TOOL_LABELS[tool]} size`}
                min={MIN_TOOL_SIZE}
                max={MAX_TOOL_SIZE}
                value={tools[tool].size}
                onChange={(event) =>
                  onUpdateTool(tool, { size: Number(event.target.value) })
                }
              />
            </Popover>
          )}
        </div>
      ))}

      <div className="canvas-toolbar-item">
        <button
          className="canvas-toolbar-button icon-button"
          aria-label="Color"
          style={{ backgroundColor: pencilColor }}
          onClick={() => togglePopover("color")}
        >
          <span
            className="color-ring"
            style={{ borderColor: getRingColor(pencilColor) }}
          />
        </button>
        {openPopover === "color" && (
          <Popover>
            <div className="color-swatch">
              {COLORS.map((color) => (
                <button
                  className="color-option"
                  key={color}
                  aria-label={color}
                  aria-pressed={color === pencilColor}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorClick(color)}
                >
                  {color === pencilColor && (
                    <span
                      className="color-ring"
                      style={{ borderColor: getRingColor(color) }}
                    />
                  )}
                </button>
              ))}
            </div>
          </Popover>
        )}
      </div>
    </div>
  );
}
