import { type JSX, useEffect, useRef, useState } from "react";
import { COLORS } from "../../constants/colors.const";
import { MAX_TOOL_SIZE } from "../../constants/max-tool-size.const";
import { MIN_TOOL_SIZE } from "../../constants/min-tool-size.const";
import { TOOLS } from "../../constants/tools.const";
import redoIcon from "../../images/redo.svg";
import undoIcon from "../../images/undo.svg";
import { type Color } from "../../models/color.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Tool } from "../../models/tool.model";
import { Popover } from "../popover/popover";
import "./canvas-toolbar.css";

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
function getRingColor(color: Color): string {
  return color === "--color-white"
    ? "var(--color-ring-on-light)"
    : "var(--color-ring)";
}

// e.g. "--color-red" becomes "red".
function getColorName(color: Color): string {
  return color.replace("--color-", "");
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
  const [openPopover, setOpenPopover] = useState<ToolbarPopover | null>(null);
  // The pencil always has a color. The fallback only satisfies the type.
  const pencilColor = tools.pencil.color ?? COLORS[0];
  const closePopover = () => setOpenPopover(null);

  // Close the open popover on any press outside the toolbar, e.g. on the canvas.
  useEffect(() => {
    if (!openPopover) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
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

  const onColorClick = (color: Color) => {
    onUpdateTool("pencil", { color });
    onSelectTool("pencil");
    setOpenPopover(null);
  };

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-20 select-none"
      ref={toolbarRef}
    >
      <button
        className="toolbar-button toolbar-icon-button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <img className="size-14" src={undoIcon} alt="" />
      </button>
      <button
        className="toolbar-button toolbar-icon-button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <img className="size-14" src={redoIcon} alt="" />
      </button>

      {TOOLS.map((tool) => (
        <div className="relative" key={tool}>
          <button
            className="toolbar-button"
            aria-pressed={tool === activeTool}
            aria-expanded={openPopover === tool}
            onClick={() => onToolClick(tool)}
          >
            {TOOL_LABELS[tool]}
          </button>
          {openPopover === tool && (
            <Popover onClose={closePopover}>
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

      <div className="relative">
        <button
          className="toolbar-button toolbar-icon-button"
          aria-label={`Color: ${getColorName(pencilColor)}`}
          aria-expanded={openPopover === "color"}
          style={{ backgroundColor: `var(${pencilColor})` }}
          onClick={() => togglePopover("color")}
        >
          <span
            className="color-ring"
            style={{ borderColor: getRingColor(pencilColor) }}
          />
        </button>
        {openPopover === "color" && (
          <Popover onClose={closePopover}>
            <div className="grid grid-cols-[repeat(5,40px)] gap-10">
              {COLORS.map((color) => (
                <button
                  className="color-option"
                  key={color}
                  aria-label={getColorName(color)}
                  aria-pressed={color === pencilColor}
                  style={{ backgroundColor: `var(${color})` }}
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
