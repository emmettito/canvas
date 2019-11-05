const cursor = document.getElementById("cursor");

const canvas = document.getElementById("canvas");
const canvasWrapper = document.getElementById("canvas-wrapper");
const ctx = canvas.getContext("2d");

const colorButton = document.getElementById("canvas-color-button");

const canvasControls = document.getElementById("canvas-controls");

const minToolSize = 5;
const maxToolSize = 50;
const defaultToolSize = 15;

const tools = {
    "PEN": "Pen",
    "ERASER": "Eraser"
};

const toolSizes = {};
const popovers = {};




const createPopover = (id, parent) => {
    // wrapper
    const popover = document.createElement("div");
    popover.id = id + "-wrapper";
    popover.classList.add("popover");

    // content
    const popoverContent = document.createElement("div");
    popoverContent.id = id;
    popoverContent.classList.add("popover-content");

    // arrow
    const popoverArrow = document.createElement("div");
    popoverArrow.id = id + "-arrow";
    popoverArrow.classList.add("popover-arrow");

    popover.appendChild(popoverContent);
    popover.appendChild(popoverArrow);

    // adds popover to list of popovers
    popovers[id] = {
        toggle: false,
        element: popover
    };

    // adds popover to parent
    parent.appendChild(popover);
    
    // returns popover in case it is needed
    return popover;
}

// 
// /* TODO Please fix this
for (i in tools) {
    // set default tool size

    const tool = tools[i];
    toolSizes[tool] = defaultToolSize;

    // create tool size slider

    const name = tool.toLowerCase();
    const id = "canvas-" + name + "-slider";

    createPopover(id, canvasControls);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = minToolSize;
    slider.max = maxToolSize;
    slider.value = defaultToolSize;
    slider.className = "slider";

    document.getElementById(id).appendChild(slider);
}
// */

var tool = tools.PEN; // default tool
let toolDown = false;

let toolX, toolY;
let lastToolX = -1;
let lastToolY = -1;

let cursorSize;
let isTouch = false;

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
let colorSwatchToggle = false;
let backgroundColor = "white"; // default background color

let drawing = [];
let drawBuffer = [];
let redoBuffer = [];



class Line {
    constructor(lastX, lastY, x, y, size, color) {
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

class Circle {
    constructor(x, y, radius, color) {
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

    for (let i = drawing.length - 1; i >= 0; i--) {
        for (j in drawing[i]) {
            drawing[i][j].draw();
        }
    }
}

const exportCanvas = () => {
    drawCanvas();

    // sets the actual canvas background (not just css styling)
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // creates a temp element
    const link = document.createElement("a");
    link.setAttribute("download", "download.png");
    // canvas.toDataURL("image/jpeg"); // PNG is the default
    link.setAttribute("href", canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));

    // adds the temp element
    const parent = document.getElementById("app");
    parent.appendChild(link);

    // downloads the image
    link.click();

    // removes the temp element
    parent.removeChild(link);
}

const createControls = () => {
    createPopover("canvas-color-swatch", canvasControls);

    const colorSwatch = document.getElementById("canvas-color-swatch");

    // create color swatch buttons

    for (i in colors) {
        const colorOption = document.createElement("span");
        colorOption.className = "color-option";
        colorOption.id = "color-option-" + i;
        colorOption.style.background = colors[i];

        colorSwatch.appendChild(colorOption);
    }

    // add event listeners to the color buttons

    document.querySelectorAll(".color-option").forEach(button => {
        const colorIndex = button.id.split("-").pop();

        button.addEventListener("click", e => {
            selectColor(colorIndex, e);
        });

        button.addEventListener("touchend", e => {
            e.preventDefault();
            selectColor(colorIndex, e);
        });
    });


}

const resizeColorSwatch = () => {
    // update color swatch size
    const colorSwatchWrapper = document.getElementById("canvas-color-swatch-wrapper");
    colorSwatchWrapper.style.width = "100%";
    const colorSwatch = document.getElementById("canvas-color-swatch");
    const swatchWidth = colorSwatch.offsetWidth;
    colorSwatchWrapper.style.width = swatchWidth + 10 + "px"; // 10 for the padding * 2

    // update color swatch positioning
    colorSwatchWrapper.style.top = -colorSwatchWrapper.offsetHeight - 10 + "px"; // 10 for the size of arrow

    const swatchXPos = colorSwatchWrapper.getBoundingClientRect().left;
    const colorButtonXPos = colorButton.getBoundingClientRect().left;

    const colorSwatchArrow = document.getElementById("canvas-color-swatch-arrow");
    colorSwatchArrow.style.left = colorButtonXPos - swatchXPos + 5 + "px";
}

const resizeCanvas = () => {

    resizeColorSwatch();

    // set default cursor size
    changeCursorSize();

    // scale canvas for HD
    canvas.width = canvasWrapper.clientWidth * 2;
    canvas.height = canvasWrapper.clientHeight * 2;
    canvas.style.width = canvas.width * 0.5 + "px";
    canvas.style.height = canvas.height * 0.5 + "px";
    ctx.scale(2, 2);
}

const resetCanvas = () => {
    // todo confirm reset
    drawing = [];
    drawBuffer = [];
    redoBuffer = [];
    drawCanvas();
}

// canvas control functions

const undoDraw = () => {
    if (drawing.length > 0) {
        redoBuffer.unshift(drawing.shift());
        drawCanvas();
    }
}

const redoDraw = () => {
    if (redoBuffer.length > 0) {
        drawing.unshift(redoBuffer.shift());
        drawCanvas();
    }
}

const selectColor = (color, e) => {
    const prevColorIndex = colorIndex;
    colorIndex = color;

    let indicatorColor = "#FFFFFF";

    // todo better indicator color implementation
    if (colors[colorIndex] == "#FFFFFF") {
        indicatorColor = "#CCC";
    }

    colorButton.style.background = colors[colorIndex];
    colorButton.innerHTML = "<span style=\"border: 2px solid " + indicatorColor + ";\"></span>";

    document.getElementsByClassName("color-option")[prevColorIndex].innerHTML = "";
    document.getElementsByClassName("color-option")[colorIndex].innerHTML = "<span style=\"border: 3px solid " + indicatorColor + ";\"></span>";

    selectTool(tools.PEN);
    // hideColorSwatch(e);
}

const changeCursorSize = () => {
    cursorSize = toolSizes[tool] * 2;
}

const changeToolSize = (size) => {
    let toolSize = toolSizes[tool];
    toolSize = Math.max(5, toolSize + size);
    toolSizes[tool] = toolSize;
    changeCursorSize();
}

const selectTool = (tool) => {
    if (this.tool == tool) {
        // todo toggle size popover

    } else {
        enableTool(tool);
    }
}

const enableTool = (tool) => {
    this.tool = tool;
    changeCursorSize();
}

const hideMenus = () => {
    hideColorSwatch();
}

const togglePopover = popover => {

}

const toggleColorSwatch = () => {
    colorSwatchToggle = !colorSwatchToggle;

    if (colorSwatchToggle) {
        showColorSwatch();
    } else {
        hideColorSwatch();
    }
}

const hideColorSwatch = (e) => {
    const colorSwatchWrapper = document.getElementById("canvas-color-swatch-wrapper");
    colorSwatchToggle = false;
    colorSwatchWrapper.style.visibility = "hidden";

    // if (e && !e.touches) {
    //     console.log("here")
    //     getToolPos(e);
    // }
}

const showColorSwatch = (e) => {
    const colorSwatchWrapper = document.getElementById("canvas-color-swatch-wrapper");
    colorSwatchToggle = true;
    colorSwatchWrapper.style.visibility = "visible";
}

// canvas data functions

const savePoint = () => {
    let drawColor = null;

    if (tool == tools.PEN) {
        drawColor = colors[colorIndex];
    }

    if (lastToolX == -1 || lastToolY == -1) {
        const circle = new Circle(toolX, toolY, toolSizes[tool], drawColor);
        circle.draw();
        drawBuffer.push(circle)
    } else {
        const line = new Line(lastToolX, lastToolY, toolX, toolY, toolSizes[tool] * 2, drawColor);
        line.draw();
        drawBuffer.push(line);
    }

    lastToolX = toolX;
    lastToolY = toolY;
}

const saveBuffer = () => {
    if (drawBuffer.length > 0) {
        redoBuffer = [];
        drawing.unshift(drawBuffer);
        drawBuffer = [];
    }
}

// canvas event functions

const canvasDrawStart = (e) => {
    e.preventDefault();
    toolDown = true;
    hideMenus();
    getToolPos(e);
    savePoint();
}

const canvasDrawEnd = (e) => {
    e.preventDefault();
    getToolPos(e);

    if (!toolDown) {
        saveBuffer();
    }

    lastToolX = -1;
    lastToolY = -1;
}

const canvasDrawMove = (e) => {
    getToolPos(e);

    if (toolDown) {
        savePoint();
    }
}

const getToolPos = (e) => {
    if (e.touches) {
        // get touch position
        if (e.touches.length == 1) {
            // only deal with one finger
            const touch = e.touches[0];

            toolX = touch.pageX - touch.target.offsetParent.offsetLeft;
            toolY = touch.pageY - touch.target.offsetParent.offsetTop;

            cursor.style = "visibility: hidden;";
        }
    } else {
        // else get mouse position
        const offset = canvasWrapper.getBoundingClientRect();

        toolX = e.clientX - offset.left;
        toolY = e.clientY - offset.top;

        if (isNaN(toolX) || isNaN(toolY)) {
            return;
        }

        const mouseX = toolX;
        const mouseY = toolY;

        // update cursor position
        cursor.style = "visibility: visible; left: " + mouseX + "px; top: " + mouseY + "px; width: " + cursorSize + "px; height: " + cursorSize + "px;";
    }
}

const canvasMouseUp = (e) => {
    toolDown = false;
    canvasDrawEnd(e);
}

const canvasMouseOut = (e) => {
    canvasDrawEnd(e);
    cursor.style = "visibility: hidden;";
}

const canvasTouchEnd = (e) => {
    toolDown = false;
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
window.addEventListener("mousedown", () => { toolDown = true; }, false);
window.addEventListener("mouseup", () => { toolDown = false; }, false);

window.onload = () => {
    loaded = true;
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

canvas.oncontextmenu = (e) => {
    e.preventDefault();
};

console.log("CANVAS LOADED");