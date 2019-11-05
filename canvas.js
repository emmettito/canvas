"use strict";
const cursor = document.getElementById("cursor");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const canvasWrapper = document.getElementById("canvas-wrapper");
const canvasControls = document.getElementById("canvas-controls");

const minToolSize = 5;
const maxToolSize = 50;
const defaultToolSize = 15;

var tool = {
    key: null,
    name: null,
    size: defaultToolSize,
    down: false,
    x: -1,
    y: -1,
    lastX: -1,
    lastY: -1
}

const tools = {
    "pen": {
        name: "Pen",
        size: defaultToolSize
    },
    "eraser": {
        name: "Eraser",
        size: defaultToolSize
    }
};

const popovers = {};

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
        for (let j in drawing[i]) {
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

const createPopover = (id, parent, button) => {
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
    for (let tool in tools) {
        // create tool button
        const button = document.createElement("button");
        button.id = "canvas-" + tool + "-button";
        button.onclick = (tool => { return () => { selectTool(tool) } })(tool);
        button.innerHTML = tools[tool].name;

        canvasControls.appendChild(button);

        // create tool size slider
        const id = "canvas-" + tool + "-slider";
        createPopover(id, canvasControls, button);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = minToolSize;
        slider.max = maxToolSize;
        slider.value = defaultToolSize;
        slider.className = "slider";
        slider.oninput = function () {
            changeToolSize(this.value);
        }

        document.getElementById(id).appendChild(slider);
    }

    // create main color swatch button

    const colorButton = document.createElement("span");
    colorButton.id = "canvas-color-button";
    colorButton.onclick = () => { return togglePopover("canvas-color-swatch"); };

    canvasControls.appendChild(colorButton);

    createPopover("canvas-color-swatch", canvasControls, colorButton);

    const colorSwatch = document.getElementById("canvas-color-swatch");

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

const resizePopover = id => {
    // todo this code gets weird when the focus button is near the edges of the screen
    const popover = popovers[id];
    const button = popover.button;

    const wrapper = document.getElementById(id + "-wrapper");
    const content = document.getElementById(id);
    const arrow = document.getElementById(id + "-arrow");

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

const selectColor = color => {
    const prevColorIndex = colorIndex;
    colorIndex = color;

    let indicatorColor = "#FFFFFF";

    // todo better indicator color implementation
    if (colors[colorIndex] == "#FFFFFF") {
        indicatorColor = "#CCC";
    }

    const colorButton = document.getElementById("canvas-color-button");
    colorButton.style.background = colors[colorIndex];
    colorButton.innerHTML = "<span style=\"border: 2px solid " + indicatorColor + ";\"></span>";

    document.getElementsByClassName("color-option")[prevColorIndex].innerHTML = "";
    document.getElementsByClassName("color-option")[colorIndex].innerHTML = "<span style=\"border: 3px solid " + indicatorColor + ";\"></span>";

    selectTool("pen", true);
    // hideColorSwatch(e);
}

const changeCursorSize = () => {
    cursorSize = tool.size * 2;
}

const changeToolSize = size => {
    // console.log(size)
    tool.size = size;
    tools[tool.key].size = tool.size;
    changeCursorSize();
}

const selectTool = (tool, hide) => {
    if (this.tool.key == tool && !hide) {
        const id = "canvas-" + tool + "-slider";
        togglePopover(id);
    } else {
        hideAllPopovers();
        enableTool(tool);
    }
}

const enableTool = tool => {
    this.tool.key = tool;
    this.tool.name = tools[tool].name;
    this.tool.size = tools[tool].size;
    changeCursorSize();
}

const hideAllPopovers = () => {
    for (let id in popovers) {
        hidePopover(id);
    }
}

const showPopover = id => {
    hideAllPopovers();

    const popover = popovers[id];
    popover.toggle = true;

    const wrapper = document.getElementById(id + "-wrapper");
    wrapper.style.visibility = "visible";
}

const hidePopover = id => {
    const popover = popovers[id];
    popover.toggle = false;

    const wrapper = document.getElementById(id + "-wrapper");
    wrapper.style.visibility = "hidden";
}

const togglePopover = id => {
    const popover = popovers[id];

    if (!popover.toggle) {
        showPopover(id);
    } else {
        hidePopover(id);
    }
}

// canvas data functions

const savePoint = () => {
    let drawColor = null;

    if (tool.name !== "Eraser") {
        drawColor = colors[colorIndex];
    }

    if (tool.lastX == -1 || tool.lastY == -1) {
        const circle = new Circle(tool.x, tool.y, tool.size, drawColor);
        circle.draw();
        drawBuffer.push(circle)
    } else {
        const line = new Line(tool.lastX, tool.lastY, tool.x, tool.y, tool.size * 2, drawColor);
        line.draw();
        drawBuffer.push(line);
    }

    tool.lastX = tool.x;
    tool.lastY = tool.y;
}

const saveBuffer = () => {
    if (drawBuffer.length > 0) {
        redoBuffer = [];
        drawing.unshift(drawBuffer);
        drawBuffer = [];
    }
}

// canvas event handlers

const canvasDrawStart = e => {
    e.preventDefault();
    tool.down = true;
    hideAllPopovers();
    getToolPos(e);
    savePoint();
}

const canvasDrawEnd = e => {
    e.preventDefault();
    getToolPos(e);

    if (!tool.down) {
        saveBuffer();
    }

    tool.lastX = -1;
    tool.lastY = -1;
}

const canvasDrawMove = e => {
    getToolPos(e);

    if (tool.down) {
        savePoint();
    }
}

const getToolPos = e => {
    if (e.touches) {
        // get touch position
        if (e.touches.length == 1) {
            // only deal with one finger
            const touch = e.touches[0];

            tool.x = touch.pageX - touch.target.offsetParent.offsetLeft;
            tool.y = touch.pageY - touch.target.offsetParent.offsetTop;

            cursor.style = "visibility: hidden;";
        }
    } else {
        // else get mouse position
        const offset = canvasWrapper.getBoundingClientRect();

        tool.x = e.clientX - offset.left;
        tool.y = e.clientY - offset.top;

        if (isNaN(tool.x) || isNaN(tool.y)) {
            return;
        }

        const mouseX = tool.x;
        const mouseY = tool.y;

        // update cursor position
        cursor.style = "visibility: visible; left: " + mouseX + "px; top: " + mouseY + "px; width: " + cursorSize + "px; height: " + cursorSize + "px;";
    }
}

const canvasMouseUp = e => {
    tool.down = false;
    canvasDrawEnd(e);
}

const canvasMouseOut = e => {
    canvasDrawEnd(e);
    cursor.style = "visibility: hidden;";
}

const canvasTouchEnd = e => {
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
};

console.log("CANVAS LOADED");