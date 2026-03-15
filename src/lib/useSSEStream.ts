/**
 * Utility for consuming Server-Sent Events (SSE) streams from fetch responses.
 *
 * Handles the TextDecoder + ReadableStream reader loop, buffering partial
 * lines across chunks, and parsing the `event:` / `data:` SSE fields.
 *
 * Despite the filename this is a plain async function, not a React hook.
 */

/**
 * Consume an SSE stream from a fetch Response, calling `onEvent` for each
 * complete event received.
 *
 * @param response  A fetch Response whose body is a `text/event-stream`.
 * @param onEvent   Called once per SSE event with the event type (defaults to
 *                  `"message"` when no `event:` field is present) and the
 *                  accumulated `data:` payload (multiple `data:` lines within
 *                  the same event are joined with `"\n"`).
 */
export async function consumeSSEStream(
  response: Response,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  // Per-event accumulators, reset on each blank-line boundary.
  let eventType = 'message';
  let dataLines: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // The last element may be an incomplete line; keep it in the buffer.
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');

      // A blank line signals the end of the current event.
      if (line === '') {
        if (dataLines.length > 0) {
          onEvent(eventType, dataLines.join('\n'));
        }
        // Reset for the next event.
        eventType = 'message';
        dataLines = [];
        continue;
      }

      // Comment lines (starting with ':') are ignored per the SSE spec.
      if (line.startsWith(':')) continue;

      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith('event:')) {
        eventType = line.slice(6);
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      }
      // Other fields (id:, retry:) are intentionally ignored.
    }
  }

  // Flush any trailing event that wasn't followed by a blank line.
  if (dataLines.length > 0) {
    onEvent(eventType, dataLines.join('\n'));
  }
}
