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
   * Internal helper to consume NDJSON summary event streams.
   */
  async _consumeSummaryStream(response, { onDuplicate, onVideoMeta, onTitle, onChunk, onSaved, onFinish, onError }) {
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
    let isDuplicate = false;

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed);
      if (event.type === 'duplicate') {
        isDuplicate = true;
        if (onDuplicate) onDuplicate(event.id, event.title);
      } else if (event.type === 'video_meta' && onVideoMeta) {
        onVideoMeta(event);
      } else if (event.type === 'meta' && onTitle) {
        onTitle(event.title, event.topics);
      } else if (event.type === 'chunk' && onChunk) {
        onChunk(event.delta);
      } else if (event.type === 'saved' && onSaved) {
        onSaved(event.id, event.reading_time);
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

    if (!isDuplicate && onFinish) onFinish();
  },

  /**
   * Streams NDJSON summary events from the server.
   */
  async streamSummarize(url, handlers) {
    try {
      const params = new URLSearchParams({ url });
      const response = await fetch(`/summarize?${params.toString()}`);
      await this._consumeSummaryStream(response, handlers);
    } catch (err) {
      if (handlers.onError) handlers.onError(err);
      else console.error('Streaming error:', err);
    }
  },

  /**
   * Regenerates an existing summary using its saved transcript.
   */
  async streamRegenerate(id, handlers) {
    try {
      const response = await fetch(`/summaries/${id}/regenerate`, { method: 'POST' });
      await this._consumeSummaryStream(response, handlers);
    } catch (err) {
      if (handlers.onError) handlers.onError(err);
      else console.error('Regeneration error:', err);
    }
  }
};

window.SteepAPI = SteepAPI;

