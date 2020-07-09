import React from 'react';
import './canvas.css';
// import logo from './logo.svg';

class Canvas extends React.Component {
  // constructor(props: any) {
  //   super(props);
  // }

  componentDidMount() {
    const cursor: HTMLElement = document.getElementById("cursor") as HTMLElement;

    const canvas: HTMLCanvasElement = document.getElementById("canvas") as HTMLCanvasElement;
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d") as CanvasRenderingContext2D;

    const canvasWrapper: HTMLElement = document.getElementById("canvas-wrapper") as HTMLElement;
    const canvasControls = document.getElementById("canvas-controls") as HTMLElement;

    const minToolSize = 5;
    const maxToolSize = 50;
    const defaultToolSize = 15;

    // TODO refactor to use tool classes
    enum ToolType {
      Pen = 'Pen',
      Eraser = 'Eraser'
    }

    class CanvasTool {
      type: ToolType;
      size: number;
      down: boolean;
      x: number;
      y: number;
      lastX: number;
      lastY: number;

      constructor(type: ToolType) {
        this.type = type;
        this.size = defaultToolSize;
        this.down = false;
        this.x = -1;
        this.y = -1;
        this.lastX = -1;
        this.lastY = -1;
      }
    }

    const tools = new Map();
    
    Object.keys(ToolType).forEach((type: string) => {
      tools.set(type, new CanvasTool(type as ToolType));
    });

    const tool: CanvasTool = tools.get(ToolType.Pen)!;

    // TODO fix all anys
    const popovers: any = {};

    let cursorSize: number;

    const colors = [
      "#000000",
      "#CACCCD",
      "#FFFFFF",
      "#00DAFF",
      "#2C71FF",
      "#9453E8",
      "#CA37E0",
      "#EA4C8E",
      "#FF0000",
      "#FF6500",
      "#FFAB00",
      "#FFCC00",
      "#FCFD00",
      "#CFF00E",
      "#7CD460"
    ];

    let colorIndex = 0; // default color
    let backgroundColor = "white"; // default background color

    let drawing: Shape[][] = [];
    let drawBuffer: Shape[] = [];
    let redoBuffer: Shape[][] = [];

    abstract class Shape {
      draw() {}
    }

    // TODO export this 
    class Line implements Shape {
      lastX: number;
      lastY: number
      x: number;
      y: number;
      size: number; 
      color: string;

      constructor(lastX: number, lastY: number, x: number, y: number, size: number, color: string) {
        this.lastX = lastX;
        this.lastY = lastY;
        this.x = x;
        this.y = y;
        this.size = size;
        this.color = color;
      }

      draw() {
        if (this.color != null) {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = this.color;
        } else {
          ctx.globalCompositeOperation = "destination-out";
        }

        ctx.lineCap = "round";
        ctx.lineWidth = this.size;

        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
        ctx.closePath();
      }
    }

    // TODO export
    class Circle implements Shape {
      x: number;
      y: number;
      radius: number;
      color: string

      constructor(x: number, y: number, radius: number, color: string) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
      }

      draw() {
        if (this.color != null) {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = this.color;
        } else {
          ctx.globalCompositeOperation = "destination-out";
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();
      }
    }

    // canvas functions

    const drawCanvas = () => {
      canvas.style.background = backgroundColor;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawing.forEach((shapes: Shape[]) => {
        shapes.forEach((shape: Shape) => {
          shape.draw();
        });
      });
    }

    // const exportCanvas = () => {
    //   drawCanvas();

    //   // sets the actual canvas background (not just css styling)
    //   ctx.globalCompositeOperation = "destination-over";
    //   ctx.fillStyle = backgroundColor;
    //   ctx.fillRect(0, 0, canvas.width, canvas.height);

    //   // creates a temp element
    //   const link = document.createElement("a");
    //   link.setAttribute("download", "download.png");
    //   // canvas.toDataURL("image/jpeg"); // PNG is the default
    //   link.setAttribute("href", canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));

    //   // adds the temp element
    //   const parent = document.getElementById("app");
    //   parent.appendChild(link);

    //   // downloads the image
    //   link.click();

    //   // removes the temp element
    //   parent.removeChild(link);
    // }

    const createPopover = (id: string, parent: HTMLElement, button: HTMLButtonElement) => {
      // wrapper
      const wrapper = document.createElement("div");
      wrapper.id = id + "-wrapper";
      wrapper.classList.add("popover");

      // content
      const content = document.createElement("div");
      content.id = id;
      content.classList.add("popover-content");

      // arrow
      const arrow = document.createElement("div");
      arrow.id = id + "-arrow";
      arrow.classList.add("popover-arrow");

      wrapper.appendChild(content);
      wrapper.appendChild(arrow);

      // adds popover to list of popovers
      popovers[id] = {
        toggle: false,
        // width: "100%",
        button: button,
        element: wrapper
      };

      // adds popover to parent
      parent.appendChild(wrapper);
    }

    const createControls = () => {
      // background-image: url("paper.gif");
      const undoButton = document.createElement("button");
      undoButton.id = "canvas-undo-button";
      undoButton.style.backgroundImage = "url(/images/undo.svg)";
      undoButton.onclick = () => { undoDraw(); };

      const redoButton = document.createElement("button");
      redoButton.id = "canvas-redo-button";
      redoButton.style.backgroundImage = "url(/images/redo.svg)";
      redoButton.onclick = () => { redoDraw(); };

      canvasControls.appendChild(undoButton);
      canvasControls.appendChild(redoButton);

      tools.forEach((tool: CanvasTool) => {
        const toolName: string = tool.type.toLowerCase();

        // create tool button
        const button = document.createElement("button");
        button.className = "canvas-tool-button"
        button.id = "canvas-" + toolName + "-button";
        //  TODO refactor without boolean/wtf is this function
        // TODO verify tool is ToolType
        button.onclick = ((type: ToolType) => { return () => { selectTool(type, false) } })(tool.type);

        canvasControls.appendChild(button);

        // create tool size slider
        const id = "canvas-" + toolName + "-slider";
        createPopover(id, canvasControls, button);

        // TODO remove as element
        const slider: HTMLInputElement = document.createElement("input");
        slider.type = "range";
        slider.min = minToolSize.toString();
        slider.max = maxToolSize.toString();
        slider.value = defaultToolSize.toString();
        slider.className = "slider";

        slider.oninput = (e) => {
          changeToolSize(Number((e.target as HTMLInputElement).value));
        };

        document.getElementById(id)!.appendChild(slider);
      });

      // create main color swatch button

      const colorButton = document.createElement("button");
      colorButton.id = "canvas-color-button";
      colorButton.onclick = () => { return togglePopover("canvas-color-swatch"); };

      canvasControls.appendChild(colorButton);

      createPopover("canvas-color-swatch", canvasControls, colorButton);

      // TODO make sure all `as elements have type defined`
      const colorSwatch: HTMLElement = document.getElementById("canvas-color-swatch") as HTMLElement;

      // create color swatch colors

      for (let i in colors) {
        const colorOption = document.createElement("span");
        colorOption.className = "color-option";
        colorOption.id = "color-option-" + i;
        colorOption.style.background = colors[i];

        colorSwatch.appendChild(colorOption);
      }

      // add event listeners to the color buttons

      document.querySelectorAll(".color-option").forEach(button => {
        const colorIndex: number = Number(button.id.split("-").pop());

        button.addEventListener("click", () => {
          selectColor(colorIndex);
        });

        button.addEventListener("touchend", (e: Event) => {
          e.preventDefault();
          selectColor(colorIndex);
        });
      });
    }

    const resizePopover = (id: string) => {
      // todo this code gets weird when the focus button is near the edges of the screen
      const popover = popovers[id];
      const button = popover.button;

      const wrapper: HTMLElement = document.getElementById(id + "-wrapper") as HTMLElement;
      const content: HTMLElement = document.getElementById(id) as HTMLElement;
      const arrow: HTMLElement = document.getElementById(id + "-arrow") as HTMLElement;

      // reset positions before calculating
      wrapper.style.top = "0px";
      wrapper.style.width = "100%";
      arrow.style.left = "0px";
      arrow.style.bottom = "-10px;"

      // make the wrapper shrink to the content width
      const contentWidth = content.offsetWidth;
      wrapper.style.width = contentWidth + 20 + "px"; // 30 for the width padding * 2

      // make the wrapper hover above the given button
      const buttonWidth = button.offsetWidth;
      const buttonXPos = button.getBoundingClientRect().left;
      const buttonYPos = button.getBoundingClientRect().top;

      const arrowXPos = arrow.getBoundingClientRect().left;
      const arrowYPos = arrow.getBoundingClientRect().bottom;

      const xdiff = Math.abs(arrowXPos - buttonXPos) + (buttonWidth / 2);
      const ydiff = buttonYPos - arrowYPos;

      arrow.style.left = (xdiff - 10) + "px"; // -10 for the arrow width
      wrapper.style.top = (ydiff) + "px"
    }

    const resizePopovers = () => {
      for (let id in popovers) {
        resizePopover(id);
      }
    }

    const resizeCanvas = () => {
      resizePopovers();
      // set default cursor size
      changeCursorSize();

      // scale canvas for HD
      canvas.width = canvasWrapper.clientWidth * 2;
      canvas.height = canvasWrapper.clientHeight * 2;
      canvas.style.width = canvas.width * 0.5 + "px";
      canvas.style.height = canvas.height * 0.5 + "px";
      ctx.scale(2, 2);
    }

    // const resetCanvas = () => {
    //   // todo confirm reset
    //   drawing = [];
    //   drawBuffer = [];
    //   redoBuffer = [];
    //   drawCanvas();
    // }

    // canvas control functions

    // TODO remove for loops where applicable

    const undoDraw = () => {
      if (drawing.length > 0) {
        redoBuffer.unshift(drawing.pop()!);
        drawCanvas();
      }
    }

    const redoDraw = () => {
      if (redoBuffer.length > 0) {
        drawing.push(redoBuffer.shift()!);
        drawCanvas();
      }
    }

    const selectColor = (color: number) => {
      const prevColorIndex = colorIndex;
      colorIndex = color;

      let indicatorColor = "#FFFFFF";

      // todo better indicator color implementation
      if (colors[colorIndex] === "#FFFFFF") {
        indicatorColor = "#CCC";
      }

      const colorButton: HTMLButtonElement = document.getElementById("canvas-color-button") as HTMLButtonElement;
      colorButton.style.background = colors[colorIndex];
      colorButton.innerHTML = "<span style=\"border: 2px solid " + indicatorColor + ";\"></span>";

      document.getElementsByClassName("color-option")[prevColorIndex].innerHTML = "";
      document.getElementsByClassName("color-option")[colorIndex].innerHTML = "<span style=\"border: 3px solid " + indicatorColor + ";\"></span>";

      selectTool(ToolType.Pen, true);
      // hideColorSwatch(e);
    }

    const changeCursorSize = () => {
      cursorSize = tool.size * 2;
    }

    function changeToolSize(size: number) {
      tool.size = size;
      // TODO refactor tools
      tools.set(tool.type, tool);
      changeCursorSize();
    }

    // TODO refactor this function
    // TODO refactor all functions to use `function`
    const selectTool = (type: ToolType, hide: boolean) => {
      const toolName: string = type.toLowerCase();
      if (tool.type === type && !hide) {
        const id = "canvas-" + toolName + "-slider";
        togglePopover(id);
      } else {
        hideAllPopovers();
        enableTool(type);
      }
    }

    const enableTool = (type: ToolType) => {
      tool.type = type;
      // GET rid of !
      tool.size = tools.get(type)!.size;
      changeCursorSize();
    }

    const hideAllPopovers = () => {
      for (let id in popovers) {
        hidePopover(id);
      }
    }

    const showPopover = (id: string) => {
      hideAllPopovers();

      const popover = popovers[id];
      popover.toggle = true;

      const wrapper: HTMLElement = document.getElementById(id + "-wrapper") as HTMLElement;
      wrapper.style.visibility = "visible";
    }

    // TODO everywhere as element is used, verify that it is correct

    const hidePopover = (id: string) => {
      const popover = popovers[id];
      popover.toggle = false;

      const wrapper: HTMLElement = document.getElementById(id + "-wrapper") as HTMLElement;
      wrapper.style.visibility = "hidden";
    }

    const togglePopover = (id: string) => {
      const popover = popovers[id];

      if (!popover.toggle) {
        showPopover(id);
      } else {
        hidePopover(id);
      }
    }

    // canvas data functions

    const savePoint = () => {
      // TODO this was `= null;`
      let drawColor: string = backgroundColor;

      if (tool.type !== ToolType.Eraser) {
        drawColor = colors[colorIndex];
      }

      if (tool.lastX === -1 || tool.lastY === -1) {
        const circle = new Circle(tool.x, tool.y, tool.size, drawColor);
        circle.draw();
        // HELP
        drawBuffer.push(circle)
      } else {
        const line = new Line(tool.lastX, tool.lastY, tool.x, tool.y, tool.size * 2, drawColor);
        line.draw();
        // HELP
        drawBuffer.push(line);
      }

      tool.lastX = tool.x;
      tool.lastY = tool.y;
    }

    const saveBuffer = () => {
      if (drawBuffer.length > 0) {
        redoBuffer = [];
        drawing.push(drawBuffer);
        drawBuffer = [];
      }
    }

    // canvas event handlers

    const canvasDrawStart = (e: Event) => {
      e.preventDefault();
      tool.down = true;
      hideAllPopovers();
      getToolPosition(e);
      savePoint();
    }

    const canvasDrawEnd = (e: Event) => {
      e.preventDefault();
      getToolPosition(e);

      if (!tool.down) {
        saveBuffer();
      }

      tool.lastX = -1;
      tool.lastY = -1;
    }

    const canvasDrawMove = (e: Event) => {
      getToolPosition(e);

      if (tool.down) {
        savePoint();
      }
    }

    const getToolPosition = (e: Event) => {

      // e.type

      // window.alert(e.type)


      // if (e.touches) {
      if (e.type === 'mousemove') {
        getMousePosition(e as MouseEvent);
      } else if (e.type.startsWith('touch')){
        // else get mouse position
        getTouchPosition(e as TouchEvent);
      }
    }

    function getMousePosition(e: MouseEvent) {
      const offset = canvasWrapper.getBoundingClientRect();

      tool.x = e.clientX - offset.left;
      tool.y = e.clientY - offset.top;

      if (isNaN(tool.x) || isNaN(tool.y)) {
        return;
      }

      const mouseX = tool.x;
      const mouseY = tool.y;

      // update cursor position
      // TODO refactor with all of the same quote styles
      cursor.style.visibility = "visible";
      cursor.style.left = `${mouseX}px`;
      cursor.style.top = `${mouseY}px`;
      cursor.style.width = `${cursorSize}px`;
      cursor.style.height = `${cursorSize}px`;
    }

    function getTouchPosition(e: TouchEvent) {
        // get touch position
        if (e.touches.length === 1) {
          // only deal with one finger
          const touch = e.touches[0];
          const touchTarget: HTMLInputElement = touch.target as HTMLInputElement;

          // TODO ALL OF THIS

          if (touchTarget === null) return;

          const touchTargetParent: HTMLInputElement = touchTarget.offsetParent as HTMLInputElement;
          
          tool.x = touch.pageX - touchTargetParent.offsetLeft;
          tool.y = touch.pageY - touchTargetParent.offsetTop;

          cursor.style.visibility = "hidden";
        }
    }

    const canvasMouseUp = (e: Event) => {
      tool.down = false;
      canvasDrawEnd(e);
    }

    const canvasMouseOut = (e: Event) => {
      canvasDrawEnd(e);
      cursor.style.visibility = "hidden";
    }

    const canvasTouchEnd = (e: Event) => {
      tool.down = false;
      canvasDrawEnd(e);
    }

    // mouse event listeners

    canvasWrapper.addEventListener("mousedown", canvasDrawStart, false);
    canvasWrapper.addEventListener("mouseup", canvasMouseUp, false);
    canvasWrapper.addEventListener("mousemove", canvasDrawMove, false);
    canvasWrapper.addEventListener("mouseout", canvasMouseOut, false);

    // touch event listeners

    canvasWrapper.addEventListener("touchstart", canvasDrawStart, {
      passive: false
    });
    canvasWrapper.addEventListener("touchend", canvasTouchEnd, false);
    canvasWrapper.addEventListener("touchmove", canvasDrawMove, {
      passive: false
    });
    canvasWrapper.addEventListener("touchcancel", canvasDrawEnd, false);

    // window event listeners

    window.addEventListener("mousedown", () => { tool.down = true; }, false);
    window.addEventListener("mouseup", () => { tool.down = false; }, false);

    window.onload = () => {
      createControls();
      resizeCanvas();
      drawCanvas();
      selectColor(colorIndex);
      // showColorSwatch();
    }

    window.onresize = () => {
      resizeCanvas();
      drawCanvas();
    }

    // canvas listeners

    canvas.oncontextmenu = (e) => {
      e.preventDefault();
    }
  }

  componentWillUnmount() {}

  render() {
    return (
      <React.Fragment>
        <div id="canvas-wrapper">
          {/* The interface layer is used for compatibility when tracking a mouse pointer */}
          <div id="canvas-interface-layer"></div>
          <canvas id="canvas"></canvas>
          <div id="cursor"></div>
        </div>
        <div id="canvas-controls"></div>
      </React.Fragment>
    )
  }
}

export default Canvas;
