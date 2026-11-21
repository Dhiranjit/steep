/**
 * API communication module for Steep
 */

const SteepAPI = {
  /**
   * Fetches the list of all saved summaries from the database.
   */
  async fetchSummaries() {
    const res = await fetch('/summaries');
    if (!res.ok) {
      throw new Error('Failed to fetch summaries list');
    }
    return await res.json();
  },

  /**
   * Fetches a single summary by its ID.
   */
  async fetchSummary(id) {
    const res = await fetch(`/summaries/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to load summary #${id}`);
    }
    return await res.json();
  },

  /**
   * Deletes a summary by its ID.
   */
  async deleteSummary(id) {
    const res = await fetch(`/summaries/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`Failed to delete summary #${id}`);
    }
    return await res.json();
  },

  /**
   * Streams NDJSON summary events from the server ({type: "meta" | "chunk" | "error"}).
   */
  async streamSummarize(url, { onTitle, onChunk, onFinish, onError }) {
    try {
      const response = await fetch(`/summarize?url=${encodeURIComponent(url)}`);

      if (!response.ok) {
        let errDetail = 'Failed to generate summary';
        try {
          const errData = await response.json();
          if (errData.detail) errDetail = errData.detail;
        } catch (_) {
          const textErr = await response.text();
          if (textErr) errDetail = textErr;
        }
        throw new Error(errDetail);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const event = JSON.parse(trimmed);
        if (event.type === 'meta' && onTitle) {
          onTitle(event.title, event.topics);
        } else if (event.type === 'chunk' && onChunk) {
          onChunk(event.delta);
        } else if (event.type === 'error') {
          throw new Error(event.message || 'An error occurred while generating the summary.');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          handleLine(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleLine(buffer);
      }

      if (onFinish) onFinish();

    } catch (err) {
      if (onError) onError(err);
      else console.error('Streaming error:', err);
    }
  }
};

window.SteepAPI = SteepAPI;

