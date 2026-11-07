import { TIMER_LAYOUT } from "../constants/timer-layout.const";
import { TIMER_SOUNDS } from "../constants/timer-sounds.const";
import { type TimerSound } from "../models/timer.model";
import {
  type ToolbarControl,
  type ToolbarHost,
} from "../models/toolbar-control.model";
import {
  createButton,
  createFormButtons,
  createSegmented,
  createSubmitButton,
  createTextButton,
} from "../components/canvas-toolbar/toolbar-elements";
import { createElement } from "../utilities/create-element";
import { formatTimer } from "../utilities/format-timer";
import { playTimerSound } from "../utilities/play-timer-sound";

// How long to set it for, from a few lengths or any number of minutes, and
// what it plays, which is played as it's picked, to hear it. Enter starts it.
function createForm(host: ToolbarHost): HTMLFormElement {
  const { timerDuration, timerSound } = host.state;
  const form = createElement("form", "canvas-form canvas-timer");
  const title = createElement("p", "canvas-confirmation-message");
  title.textContent = "Timer";

  const minutes = createElement("input", "canvas-text-input");
  minutes.type = "number";
  minutes.name = "minutes";
  minutes.min = "1";
  minutes.max = String(TIMER_LAYOUT.maxMinutes);
  minutes.step = "1";
  minutes.required = true;
  minutes.value = String(Math.max(1, Math.round(timerDuration / 60_000)));
  minutes.setAttribute("aria-label", "Minutes");
  minutes.addEventListener("focus", () => minutes.select(), { once: true });
  const presets = createSegmented(
    "Minutes",
    "preset",
    TIMER_LAYOUT.presets.map((preset) => ({
      value: String(preset),
      label: String(preset),
      checked: String(preset) === minutes.value,
    }))
  );
  presets.append(minutes);
  // Picking a length fills it in, and typing one that's offered picks it.
  presets.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "preset") {
      minutes.value = input.value;
    }
  });
  minutes.addEventListener("input", () => {
    for (const radio of presets.querySelectorAll<HTMLInputElement>(
      'input[name="preset"]'
    )) {
      radio.checked = radio.value === minutes.value;
    }
  });

  const sounds = createSegmented(
    "Sound",
    "sound",
    TIMER_SOUNDS.map(({ value, label }) => ({
      value,
      label,
      checked: value === timerSound,
    }))
  );
  const readSound = () => new FormData(form).get("sound") as TimerSound;
  sounds.addEventListener("change", () => playTimerSound(readSound()));

  form.addEventListener("submit", (event) => {
    // It would otherwise submit a form the host mounted the canvas in.
    event.preventDefault();
    const duration = Number(minutes.value) * 60_000;
    const sound = readSound();
    host.closePopover();
    host.actions.onStartTimer(duration, sound);
  });
  form.append(
    title,
    presets,
    sounds,
    createFormButtons(host, createSubmitButton("Start"))
  );
  return form;
}

// How long's left, counting down in `readout`, and who started it, with a
// minute more, or stopping it, for everyone.
function createStatus(host: ToolbarHost, readout: HTMLElement): HTMLDivElement {
  const { timer, timerSound } = host.state;
  const status = createElement("div", "canvas-form canvas-timer");
  readout.textContent = formatTimer(timer!.remaining);
  status.append(readout);
  if (timer!.by) {
    const by = createElement("p", "canvas-timer-by");
    by.textContent = `Started by ${timer!.by}`;
    status.append(by);
  }
  const buttons = createElement("div", "canvas-confirmation-buttons");
  const more = createButton("canvas-button");
  more.textContent = "+1 min";
  more.addEventListener("click", () =>
    host.actions.onStartTimer(
      host.state.timer!.remaining + TIMER_LAYOUT.addTime,
      timerSound
    )
  );
  const stop = createButton("canvas-button canvas-button-primary");
  stop.textContent = "Stop";
  stop.addEventListener("click", () => {
    host.closePopover();
    host.actions.onStopTimer();
  });
  buttons.append(more, stop);
  status.append(buttons);
  return status;
}

/**
 * A timer, showing how long's left, that goes off with a sound. While
 * drawing together, it goes off for everyone. It shows the time, so it takes
 * no icon.
 */
export function timerControl(): ToolbarControl {
  return {
    name: "timer",
    mount: (host) => {
      const button = createTextButton("canvas-timer-button");
      button.dataset.tooltip = "Timer";
      // What the popover shows, once it's open: the form to start one, or
      // how long's left, which counts down in `readout`.
      let shown: "form" | "status" | null = null;
      let readout: HTMLElement | null = null;
      const popover = {
        key: "timer",
        opener: button,
        render: () => {
          if (!host.state.timer) {
            shown = "form";
            return createForm(host);
          }
          shown = "status";
          readout = createElement("p", "canvas-timer-readout");
          readout.setAttribute("role", "timer");
          readout.setAttribute("aria-label", "Time left");
          return createStatus(host, readout);
        },
      };
      button.addEventListener("click", () => host.togglePopover(popover));
      return {
        element: button,
        anchored: true,
        expands: true,
        update: (state) => {
          if (host.openPopover?.key !== popover.key) {
            shown = null;
            readout = null;
          }
          const { timer } = state;
          const left = timer && formatTimer(timer.remaining);
          button.textContent = left ?? "Timer";
          button.setAttribute(
            "aria-label",
            left ? `Timer: ${left} left` : "Timer"
          );
          button.toggleAttribute("data-running", timer !== null);
          // Starting or stopping it, from here or by someone else, changes
          // what its popover offers, so it's closed.
          if (shown && shown !== (timer ? "status" : "form")) {
            host.closePopover();
            return;
          }
          if (readout && left) {
            readout.textContent = left;
          }
        },
      };
    },
  };
}
