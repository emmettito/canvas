import { type JSX, type PointerEvent, useEffect, useRef } from "react";
import { type Point } from "../../models/point.model";
import { type Stroke } from "../../models/stroke.model";
import { type ToolState } from "../../models/tool-state.model";
import { drawStroke } from "../../utilities/draw-stroke";
import { getCssVariable } from "../../utilities/get-css-variable";
import "./canvas.css";

interface CanvasProps {
  height: number;
  width: number;
  strokes: Stroke[];
  toolState: ToolState;
  onStrokeComplete: (stroke: Stroke) => void;
}

export function Canvas({
  height,
  width,
  strokes,
  toolState,
  onStrokeComplete,
}: CanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  // The stroke being drawn is kept out of state so moves don't re-render.
  const strokeRef = useRef<Stroke>(null);

  // Resizing clears the canvas, so everything is redrawn on any change.
  useEffect(() => {
    if (height === undefined || width === undefined) {
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    // Scale canvas for HD
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.scale(scale, scale);
    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }
  }, [height, width, strokes]);

  const getPoint = (event: PointerEvent<HTMLDivElement>): Point => {
    const { left, top } = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  };

  const moveCursor = (event: PointerEvent<HTMLDivElement>) => {
    const cursor = cursorRef.current;
    // Touch and pen have no hover position, so the cursor only follows a mouse.
    if (event.pointerType !== "mouse") {
      cursor.style.visibility = "hidden";
      return;
    }
    const { x, y } = getPoint(event);
    const size = toolState.size * 2;
    cursor.style.visibility = "visible";
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    // Capture keeps the stroke going if the pointer leaves the canvas.
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeRef.current = {
      color:
        toolState.color === undefined
          ? undefined
          : getCssVariable(toolState.color),
      points: [getPoint(event)],
      size: toolState.size,
    };
    drawStroke(canvasRef.current.getContext("2d"), strokeRef.current);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      return;
    }
    moveCursor(event);
    const stroke = strokeRef.current;
    if (!stroke) {
      return;
    }
    stroke.points.push(getPoint(event));
    drawStroke(
      canvasRef.current.getContext("2d"),
      stroke,
      stroke.points.length - 2
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const stroke = strokeRef.current;
    if (!event.isPrimary || !stroke) {
      return;
    }
    strokeRef.current = null;
    onStrokeComplete(stroke);
  };

  const onPointerLeave = () => {
    cursorRef.current.style.visibility = "hidden";
  };

  return (
    <>
      {/* The interface layer is used for compatibility when tracking a mouse pointer. */}
      <div
        className="absolute inset-0 z-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      ></div>
      <canvas className="absolute top-0 left-0" ref={canvasRef} />
      <div className="canvas-cursor" ref={cursorRef}></div>
    </>
  );
}
