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
   * Streams a summary response from the server.
   * Expects the first line to be JSON { "title": "..." }, followed by markdown chunks.
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
      let isFirstLine = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        if (isFirstLine) {
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const firstLine = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            try {
              let clean = firstLine;
              if (clean.startsWith('```json')) clean = clean.slice(7).trim();
              if (clean.startsWith('```')) clean = clean.slice(3).trim();
              if (clean.endsWith('```')) clean = clean.slice(0, -3).trim();
              const parsed = JSON.parse(clean);
              if (parsed.title && onTitle) {
                onTitle(parsed.title, parsed.topics);
              }
            } catch (e) {
              // If not JSON, treat line as standard content
              buffer = firstLine + '\n' + buffer;
            }

            isFirstLine = false;
          }
        }

        if (!isFirstLine && buffer) {
          if (onChunk) onChunk(buffer);
          buffer = '';
        }
      }

      if (buffer && onChunk) {
        onChunk(buffer);
      }

      if (onFinish) onFinish();

    } catch (err) {
      if (onError) onError(err);
      else console.error('Streaming error:', err);
    }
  }
};

window.SteepAPI = SteepAPI;

