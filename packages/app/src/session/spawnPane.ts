import { sessionAck, sessionCreate } from "../ipc/client.js";
import { createOutputSink, registerOutputSink } from "../terminal/outputSink.js";
import { noteOutput } from "../stores/app.js";

const STARTUP_GRACE_MS = 2000;

/** Starts a PTY session and wires its output to a sink the Grid attaches to later. */
export async function spawnPane(profileId?: string, cwd?: string, history?: string[]): Promise<string> {
  let sid: string | null = null;
  // A Grid attaches only after the sink is registered below, so acks always have an id.
  const sink = createOutputSink((bytes) => {
    if (sid) sessionAck(sid, bytes).catch(console.error);
  });
  const born = Date.now();
  const sessionId = await sessionCreate({
    profileId,
    cwd,
    history,
    onOutput: (bytes) => {
      sink.push(bytes);
      // The shell's startup banner is not news; only later output marks the tab unread.
      if (sid) noteOutput(sid, Date.now() - born > STARTUP_GRACE_MS);
    },
  });
  sid = sessionId;
  registerOutputSink(sessionId, sink);
  return sessionId;
}
