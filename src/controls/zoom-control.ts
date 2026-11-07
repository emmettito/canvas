import { type ToolbarControl } from "../models/toolbar-control.model";
import { type ZoomAction } from "../models/toolbar-control.model";
import {
  createMenu,
  createTextButton,
  MOD,
  SHIFT,
} from "../components/canvas-toolbar/toolbar-elements";

const ITEMS: { action: ZoomAction; label: string; hint: string }[] = [
  { action: "in", label: "Zoom in", hint: `${MOD}+` },
  { action: "out", label: "Zoom out", hint: `${MOD}−` },
  { action: "reset", label: "Zoom to 100%", hint: `${MOD}0` },
  { action: "fit", label: "Zoom to fit", hint: `${SHIFT}1` },
];

/**
 * Shows the zoom, with a menu to change it, and to show or hide the rulers.
 * It shows the zoom, so it takes no icon. The keys work without it.
 */
export function zoomControl(): ToolbarControl {
  return {
    name: "zoom",
    mount: (host) => {
      const button = createTextButton();
      button.dataset.tooltip = "Zoom";
      const popover = {
        key: "zoom",
        opener: button,
        render: () =>
          createMenu(host, [
            ...ITEMS.map(({ action, label, hint }) => ({
              label,
              hint,
              onSelect: () => host.actions.onZoom(action),
            })),
            // Named for what it does, rather than checked, so its shortcut
            // lines up with the others'.
            {
              label: host.state.rulers ? "Hide rulers" : "Show rulers",
              hint: `${SHIFT}R`,
              onSelect: () => host.actions.onToggleRulers(),
            },
          ]),
      };
      button.addEventListener("click", () => host.togglePopover(popover));
      return {
        element: button,
        anchored: true,
        expands: true,
        update: (state) => {
          const zoom = `${Math.round(state.zoom * 100)}%`;
          button.textContent = zoom;
          button.setAttribute("aria-label", `Zoom: ${zoom}`);
        },
      };
    },
  };
}
