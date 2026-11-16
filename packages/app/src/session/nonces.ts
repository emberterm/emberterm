// Per-session secret for OSC 133;E command marks (see parseOsc133Command). Not reactive state.
const nonces = new Map<string, string>();

/** 128 random bits as hex. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function setPaneNonce(sessionId: string, nonce: string) { nonces.set(sessionId, nonce); }
export function getPaneNonce(sessionId: string): string | undefined { return nonces.get(sessionId); }
export function forgetPaneNonce(sessionId: string) { nonces.delete(sessionId); }
