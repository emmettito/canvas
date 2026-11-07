import { EXPORT_FORMATS } from "../constants/export-formats.const";
import { EXPORT_SCALES } from "../constants/export-scales.const";
import { UNTITLED_NAME } from "../constants/untitled-name.const";
import {
  type ExportFormat,
  type ExportOptions,
  type ExportScale,
} from "../models/export-options.model";
import {
  type FileMenuItem,
  type ToolbarControl,
  type ToolbarHost,
  type ToolbarPopover,
} from "../models/toolbar-control.model";
import {
  checkIcon,
  createFormButtons,
  createIconButton,
  createSegmented,
  createSubmitButton,
} from "../components/canvas-toolbar/toolbar-elements";
import { createElement } from "../utilities/create-element";
import { downloadBlob } from "../utilities/download-blob";
import {
  canExportAt,
  EXPORT_EXTENSIONS,
  exportDrawing,
  getExportSize,
} from "../utilities/export-drawing";
import { getFileName } from "../utilities/get-file-name";

const LABEL = "Export";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  svg: "SVG",
};

/**
 * Makes the file, drawn again at the chosen scale rather than copied from
 * the screen, so its size doesn't depend on the screen's, and downloads it,
 * named for the canvas. Whoever's drawing, if anyone, is kept in the file as
 * its author, except a JPEG.
 */
async function download(host: ToolbarHost, options: ExportOptions) {
  const { actions } = host;
  // The next export starts from these.
  actions.onExportOptions(options);
  const { drawing, area, background, textStyle, files } =
    await actions.getExportSource();
  const blob = await exportDrawing(
    drawing,
    area,
    options,
    background,
    textStyle,
    files,
    host.state.author
  );
  if (blob) {
    downloadBlob(
      blob,
      getFileName(host.state.name, EXPORT_EXTENSIONS[options.format])
    );
  }
}

// A dialog of its own, in the middle of the window. The canvas's name comes
// first, since it names the file, and it's renamed as it's typed. Enter
// exports, and Escape or Cancel closes it without exporting.
function createPopover(host: ToolbarHost, opener: HTMLElement): ToolbarPopover {
  return {
    key: "export",
    opener,
    dialog: true,
    render: () => createForm(host),
  };
}

function createForm(host: ToolbarHost): HTMLFormElement {
  const { drawingSize, exportOptions, name: canvasName } = host.state;
  const form = createElement("form", "canvas-form canvas-export");
  const title = createElement("h2", "canvas-dialog-title");
  title.textContent = LABEL;

  const nameField = createElement("label", "canvas-field");
  const nameLabel = createElement("span", "canvas-field-legend");
  nameLabel.textContent = "Name";
  const name = createElement("input", "canvas-text-input");
  name.type = "text";
  name.value = canvasName;
  name.placeholder = UNTITLED_NAME;
  name.spellcheck = false;
  name.addEventListener("input", () =>
    host.actions.onRename(name.value.trim())
  );
  nameField.append(nameLabel, name);

  const formats = createSegmented(
    "Format",
    "format",
    EXPORT_FORMATS.map((format) => ({
      value: format,
      label: FORMAT_LABELS[format],
      checked: format === exportOptions.format,
    }))
  );
  const scales = createSegmented(
    "Size",
    "scale",
    EXPORT_SCALES.map((scale) => ({
      value: String(scale),
      label: `${scale}×`,
      checked: scale === exportOptions.scale,
    }))
  );
  const pixels = createElement("p", "canvas-export-size");
  scales.append(pixels);

  const transparent = createElement("label", "canvas-checkbox");
  const transparentInput = createElement("input");
  transparentInput.type = "checkbox";
  transparentInput.name = "transparent";
  transparentInput.checked = exportOptions.transparent;
  transparent.append(transparentInput, "Transparent background");

  const read = (): ExportOptions => {
    const data = new FormData(form);
    return {
      format: data.get("format") as ExportFormat,
      scale: Number(data.get("scale")) as ExportScale,
      transparent: transparentInput.checked,
    };
  };
  // Shows the size in pixels, and turns off what the format can't do: JPEG
  // has no transparency, and a PNG or JPEG can be too big to make.
  const refresh = () => {
    const { format } = read();
    const isImage = format !== "svg";
    transparentInput.disabled = format === "jpeg";
    transparent.toggleAttribute("data-disabled", format === "jpeg");
    const radios = [
      ...scales.querySelectorAll<HTMLInputElement>('input[name="scale"]'),
    ];
    for (const radio of radios) {
      radio.disabled =
        isImage &&
        !canExportAt(drawingSize, Number(radio.value) as ExportScale);
    }
    // The largest that fits, if the chosen one doesn't.
    if (radios.find((radio) => radio.checked)?.disabled) {
      const fits = radios.filter((radio) => !radio.disabled);
      (fits.at(-1) ?? radios[0]).checked = true;
    }
    const { width, height } = getExportSize(drawingSize, read().scale);
    pixels.textContent = `${width} × ${height} px`;
  };
  form.addEventListener("change", refresh);

  form.addEventListener("submit", (event) => {
    // It would otherwise submit a form the host mounted the canvas in.
    event.preventDefault();
    const options = read();
    host.closePopover();
    void download(host, options);
  });
  form.append(
    title,
    nameField,
    formats,
    scales,
    transparent,
    createFormButtons(host, createSubmitButton(LABEL))
  );
  refresh();
  return form;
}

/** Names and exports what the canvas shows as a PNG, JPEG or SVG. */
export function exportButton(icon: Element): ToolbarControl {
  checkIcon(icon, "export");
  return {
    name: "export",
    mount: (host) => {
      const button = createIconButton(LABEL, icon);
      const popover = createPopover(host, button);
      button.addEventListener("click", () => host.togglePopover(popover));
      return { element: button, anchored: true };
    },
  };
}

/** `exportButton`, in the file menu. */
export function exportItem(): FileMenuItem {
  return {
    name: "export",
    label: LABEL,
    select: (host, opener) => host.togglePopover(createPopover(host, opener)),
  };
}
