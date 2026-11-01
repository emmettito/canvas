import {
  type ClientMessage,
  type Edit,
  type ServerMessage,
} from "../collaboration-server";
import { type DrawingChange } from "./drawing-change.model";
import { type Drawing } from "./drawing.model";

/** A change to the drawing, or undoing or redoing one, as rooms pass on. */
export type DrawingEdit = Edit<DrawingChange>;

/** What a canvas sends its room. */
export type CanvasClientMessage = ClientMessage<Drawing, DrawingChange>;

/** What a room sends a canvas. */
export type CanvasServerMessage = ServerMessage<Drawing, DrawingChange>;

/**
 * Carries a canvas's messages to and from its room on the server, e.g. over
 * a WebSocket, which `CollaborationServer` handles on the other end.
 */
export interface CollaborationConnection {
  /** Sends a message to the room. */
  send: (message: CanvasClientMessage) => void;
  /**
   * Calls `listener` with each message from the room, until the function it
   * returns is called.
   */
  listen: (listener: (message: CanvasServerMessage) => void) => () => void;
}
