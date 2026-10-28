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

// What is currently drawn on the canvas.
interface Painted {
  height: number;
  width: number;
  strokes: Stroke[];
}

function startsWith(strokes: Stroke[], prefix: Stroke[]): boolean {
  return (
    prefix.length <= strokes.length &&
    prefix.every((stroke, index) => stroke === strokes[index])
  );
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
  const strokeRef = useRef<Stroke | null>(null);
  const paintedRef = useRef<Painted | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const painted = paintedRef.current;
    paintedRef.current = { height, width, strokes };

    // Strokes that were only added, e.g. by redo, can be drawn on top.
    if (
      painted &&
      painted.height === height &&
      painted.width === width &&
      startsWith(strokes, painted.strokes)
    ) {
      for (const stroke of strokes.slice(painted.strokes.length)) {
        drawStroke(context, stroke);
      }
      return;
    }

    // Resizing clears the canvas, so everything is redrawn.
    // Scale canvas for HD
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.scale(scale, scale);
    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }
    // Keep a stroke in progress, e.g. if the window resizes mid-stroke.
    if (strokeRef.current) {
      drawStroke(context, strokeRef.current);
    }
  }, [height, width, strokes]);

  const getContext = () => canvasRef.current?.getContext("2d");

  const getPoint = (event: PointerEvent<HTMLDivElement>): Point => {
    const { left, top } = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  };

  const moveCursor = (event: PointerEvent<HTMLDivElement>) => {
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }
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
    const context = getContext();
    if (!context || !event.isPrimary || event.button !== 0) {
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
    drawStroke(context, strokeRef.current);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      return;
    }
    moveCursor(event);
    const stroke = strokeRef.current;
    const context = getContext();
    if (!stroke || !context) {
      return;
    }
    stroke.points.push(getPoint(event));
    drawStroke(context, stroke, stroke.points.length - 2);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const stroke = strokeRef.current;
    if (!event.isPrimary || !stroke) {
      return;
    }
    strokeRef.current = null;
    // The stroke is already drawn, so it shouldn't be drawn again once added.
    const painted = paintedRef.current;
    if (painted) {
      paintedRef.current = {
        ...painted,
        strokes: [...painted.strokes, stroke],
      };
    }
    onStrokeComplete(stroke);
  };

  const onPointerLeave = () => {
    if (cursorRef.current) {
      cursorRef.current.style.visibility = "hidden";
    }
  };

  return (
    <>
      {/* The interface layer sits above the canvas and handles all pointer input. */}
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
