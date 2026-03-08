declare module 'ws' {
  import { EventEmitter } from 'events';

  class WebSocket extends EventEmitter {
    static CONNECTING: number;
    static OPEN: number;
    static CLOSING: number;
    static CLOSED: number;

    binaryType: string;
    bufferedAmount: number;
    extensions: string;
    protocol: string;
    readyState: number;
    url: string;

    constructor(address: string | URL, options?: WebSocket.ClientOptions);
    constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions);

    close(code?: number, reason?: string | Buffer): void;
    ping(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: unknown, cb?: (err?: Error) => void): void;
    send(data: unknown, options: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
    terminate(): void;

    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;

    once(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    once(event: 'open', listener: () => void): this;
    once(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;

    off(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    off(event: 'error', listener: (err: Error) => void): this;
    off(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    off(event: 'open', listener: () => void): this;
    off(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    off(event: string | symbol, listener: (...args: unknown[]) => void): this;

    addEventListener(type: 'close', listener: (event: WebSocket.CloseEvent) => void): void;
    addEventListener(type: 'error', listener: (event: WebSocket.ErrorEvent) => void): void;
    addEventListener(type: 'message', listener: (event: WebSocket.MessageEvent) => void): void;
    addEventListener(type: 'open', listener: (event: WebSocket.Event) => void): void;

    removeEventListener(type: 'close', listener: (event: WebSocket.CloseEvent) => void): void;
    removeEventListener(type: 'error', listener: (event: WebSocket.ErrorEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: WebSocket.MessageEvent) => void): void;
    removeEventListener(type: 'open', listener: (event: WebSocket.Event) => void): void;
  }

  namespace WebSocket {
    interface ClientOptions {
      protocol?: string;
      followRedirects?: boolean;
      handshakeTimeout?: number;
      maxRedirects?: number;
      perMessageDeflate?: boolean | PerMessageDeflateOptions;
      localAddress?: string;
      protocolVersion?: number;
      headers?: { [key: string]: string };
      origin?: string;
      agent?: unknown;
      host?: string;
      family?: number;
      checkServerIdentity?(servername: string, cert: unknown): boolean;
      rejectUnauthorized?: boolean;
      maxPayload?: number;
      skipUTF8Validation?: boolean;
    }

    interface PerMessageDeflateOptions {
      serverNoContextTakeover?: boolean;
      clientNoContextTakeover?: boolean;
      serverMaxWindowBits?: number;
      clientMaxWindowBits?: number;
      zlibDeflateOptions?: object;
      zlibInflateOptions?: object;
      threshold?: number;
      concurrencyLimit?: number;
    }

    interface Event {
      type: string;
      target: WebSocket;
    }

    interface CloseEvent extends Event {
      wasClean: boolean;
      code: number;
      reason: string;
    }

    interface ErrorEvent extends Event {
      error: unknown;
      message: string;
    }

    interface MessageEvent extends Event {
      data: string | Buffer | ArrayBuffer | Buffer[];
    }
  }

  export { WebSocket };
  export default WebSocket;
}
