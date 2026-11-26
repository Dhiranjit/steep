/**
 * Main application controller for Steep
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  let notes = [];
  let currentNote = null;
  let activeStream = null;
  let currentRawMarkdown = '';
  let isLibraryView = false;
  let libraryViewMode = 'topic'; // 'topic' | 'channel' | 'grid'
  let selectedFilter = 'all';

  // DOM Elements
  const notesListContainer = document.getElementById('notesListContainer');
  const navAllNotesCount = document.getElementById('navAllNotesCount');
  const searchNotesInput = document.getElementById('searchNotesInput');
  const btnViewAllNotes = document.getElementById('btnViewAllNotes');

  const summarizeForm = document.getElementById('summarizeForm');
  const urlInput = document.getElementById('urlInput');
  const btnSubmit = document.getElementById('btnSubmit');
  const submitText = document.getElementById('submitText');
  const submitIcon = document.getElementById('submitIcon');
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');
  const alertClose = document.getElementById('alertClose');
  const welcomeView = document.getElementById('welcomeView');
  const noteArticle = document.getElementById('noteArticle');
  const articleTitle = document.getElementById('articleTitle');
  const articleChannel = document.getElementById('articleChannel');
  const articleDate = document.getElementById('articleDate');
  const articleDuration = document.getElementById('articleDuration');
  const articleReadingTime = document.getElementById('articleReadingTime');
  const articleVideoLink = document.getElementById('articleVideoLink');
  const markdownContent = document.getElementById('markdownContent');
  const streamingIndicator = document.getElementById('streamingIndicator');
  const streamingStatusText = document.getElementById('streamingStatusText');
  const btnRegenerateNote = document.getElementById('btnRegenerateNote');
  const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');
  const btnDeleteCurrentNote = document.getElementById('btnDeleteCurrentNote');
  const btnNewNote = document.getElementById('btnNewNote');
  const brandBtn = document.getElementById('brandBtn');
  const toast = document.getElementById('toast');
  const sidebar = document.getElementById('sidebar');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const viewport = document.getElementById('viewport');

  // Library View Elements
  const allNotesView = document.getElementById('allNotesView');
  const libraryContent = document.getElementById('libraryContent');
  const topicPillsContainer = document.getElementById('topicPillsContainer');
  const libraryTotalCount = document.getElementById('libraryTotalCount');
  const toggleTopicView = document.getElementById('toggleTopicView');
  const toggleChannelView = document.getElementById('toggleChannelView');
  const toggleGridView = document.getElementById('toggleGridView');

  const durationFormatter =
    typeof Intl !== 'undefined' && typeof Intl.DurationFormat === 'function'
      ? new Intl.DurationFormat('en', { style: 'narrow' })
      : null;

  // Helpers
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (_) {
      return dateStr;
    }
  }

  function formatDuration(totalSeconds) {
    const secs = Number(totalSeconds);
    if (!secs || secs <= 0) return '';

    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remSeconds = Math.floor(secs % 60);

    const parts = {};
    if (hours > 0) {
      parts.hours = hours;
      if (minutes > 0) parts.minutes = minutes;
    } else if (minutes > 0) {
      parts.minutes = minutes;
    } else {
      parts.seconds = remSeconds;
    }

    if (durationFormatter) {
      return durationFormatter.format(parts);
    }
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${remSeconds}s`;
  }

  function formatReadingTime(minutes) {
    const mins = Number(minutes);
    if (!mins || mins <= 0) return '';
    return `${mins} min read`;
  }

  function getCleanExcerpt(markdown, maxLen = 150) {
    if (!markdown) return 'No preview available.';
    const text = markdown
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^#+\s+.*$/gm, '')
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^>\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > maxLen) {
      return text.substring(0, maxLen).trim() + '...';
    }
    return text || 'No preview available.';
  }

  function showError(msg) {
    alertMessage.textContent = msg;
    alertBanner.classList.add('show');
  }

  function hideError() {
    alertBanner.classList.remove('show');
  }

  function showToast(msg) {
    const toastMsg = document.getElementById('toastMsg');
    if (toastMsg) toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function sortByLatest(items) {
    return items.toSorted((a, b) => {
      const da = new Date((a.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
      const db = new Date((b.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }

  function renderMarkdownContent(markdown, videoUrl, { streaming = false } = {}) {
    markdownContent.innerHTML =
      window.SteepMarkdown.renderMarkdownToHtml(markdown) +
      (streaming ? '<span class="streaming-cursor"></span>' : '');
    window.SteepMarkdown.linkifyTimestampsInElement(markdownContent, videoUrl);
  }

  function updateArticleMeta({ channel, created_at, duration, reading_time, url, dateLabel }) {
    if (channel) {
      articleChannel.textContent = channel;
      articleChannel.dataset.channel = channel;
      articleChannel.style.display = 'inline-flex';
    } else {
      articleChannel.textContent = '';
      delete articleChannel.dataset.channel;
      articleChannel.style.display = 'none';
    }

    articleDate.textContent = dateLabel ?? formatDate(created_at);

    const durText = formatDuration(duration);
    if (durText) {
      articleDuration.textContent = `${durText} video`;
      articleDuration.style.display = 'inline-flex';
    } else {
      articleDuration.textContent = '';
      articleDuration.style.display = 'none';
    }

    const readText = formatReadingTime(reading_time);
    if (readText) {
      articleReadingTime.textContent = readText;
      articleReadingTime.style.display = 'inline-flex';
    } else {
      articleReadingTime.textContent = '';
      articleReadingTime.style.display = 'none';
    }

    articleVideoLink.href = url || '#';
    articleVideoLink.style.display = url ? 'inline-flex' : 'none';
  }

  function isViewingActiveStream() {
    return Boolean(
      activeStream &&
      !isLibraryView &&
      currentNote &&
      String(currentNote.id) === String(activeStream.id)
    );
  }

  function syncLibraryToggleButtons() {
    if (toggleTopicView) toggleTopicView.classList.toggle('active', libraryViewMode === 'topic');
    if (toggleChannelView) toggleChannelView.classList.toggle('active', libraryViewMode === 'channel');
    if (toggleGridView) toggleGridView.classList.toggle('active', libraryViewMode === 'grid');
  }

  // Load notes from backend
  async function loadNotes(selectedId = null) {
    try {
      const raw = await window.SteepAPI.fetchSummaries();
      notes = sortByLatest(raw);
      renderNotesList();

      if (isLibraryView) {
        renderAllNotesView();
      } else if (selectedId) {
        selectNote(selectedId);
      }
    } catch (err) {
      console.error('Error loading notes:', err);
    }
  }

  // Render notes in the sidebar (only keep 8 of the most recent)
  function renderNotesList() {
    const query = searchNotesInput.value.trim().toLowerCase();
    const filtered = notes.filter(n =>
      (n.title || '').toLowerCase().includes(query) ||
      (n.channel || '').toLowerCase().includes(query)
    );

    const displayedNotes = filtered.slice(0, 8);

    if (navAllNotesCount) navAllNotesCount.textContent = notes.length;
    notesListContainer.replaceChildren();

    if (displayedNotes.length === 0) {
      notesListContainer.innerHTML = `
        <div class="empty-notes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>${notes.length === 0 ? 'No notes yet. Enter a YouTube URL above.' : 'No notes match your search.'}</span>
        </div>
      `;
      return;
    }

    displayedNotes.forEach(note => {
      const item = document.createElement('div');
      const isActive = !isLibraryView && currentNote && currentNote.id == note.id;
      item.className = `note-item ${isActive ? 'active' : ''}`;
      item.setAttribute('data-id', note.id);

      const noteTopics = Array.isArray(note.topics) && note.topics.length > 0 ? note.topics : [];
      const primaryTopic = noteTopics[0] || null;
      const channelName = note.channel || '';
      const isNoteStreaming = Boolean(activeStream && String(activeStream.id) === String(note.id));

      item.innerHTML = `
        <div class="note-item-header">
          <span class="note-title">${window.SteepMarkdown.escapeHtml(note.title || 'Untitled Summary')}</span>
          ${isNoteStreaming ? `<span class="pulse-dot" title="Streaming summary..." style="flex-shrink: 0; margin-top: 5px;"></span>` : `
          <button class="btn-delete-note" title="Delete note" aria-label="Delete note" data-id="${note.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
          `}
        </div>
        <div class="note-meta">
          <div class="note-meta-info">
            ${channelName ? `<span class="note-channel" title="${window.SteepMarkdown.escapeHtml(channelName)}">${window.SteepMarkdown.escapeHtml(channelName)}</span>` : ''}
            <span class="note-date">${formatDate(note.created_at)}</span>
            ${primaryTopic ? `<span class="note-tag" title="${window.SteepMarkdown.escapeHtml(primaryTopic)}">${window.SteepMarkdown.escapeHtml(primaryTopic)}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-note')) return;
        selectNote(note.id);
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      });

      const delBtn = item.querySelector('.btn-delete-note');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${note.title}"?`)) {
            await deleteNote(note.id);
          }
        });
      }

      notesListContainer.appendChild(item);
    });
  }

  // Switch to All Notes / Library View
  function showAllNotesView(mode = null, filter = null) {
    hideError();

    if (mode) libraryViewMode = mode;
    if (filter !== null) selectedFilter = filter;
    syncLibraryToggleButtons();

    isLibraryView = true;
    currentNote = null;

    document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
    if (btnViewAllNotes) btnViewAllNotes.classList.add('active');

    welcomeView.style.display = 'none';
    noteArticle.style.display = 'none';
    noteArticle.classList.remove('visible');
    allNotesView.style.display = 'flex';
    allNotesView.classList.add('visible');

    renderAllNotesView();
    viewport.scrollTop = 0;

    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }

  // Render All Notes Library View
  function renderAllNotesView() {
    const query = searchNotesInput.value.trim().toLowerCase();
    const filterByChannel = libraryViewMode === 'channel';

    // Compute filter pill counts (by channel in channel mode, by topic otherwise)
    const filterCounts = {};
    notes.forEach(note => {
      if (filterByChannel) {
        const ch = note.channel || 'Unknown Channel';
        filterCounts[ch] = (filterCounts[ch] || 0) + 1;
      } else {
        const tags = Array.isArray(note.topics) && note.topics.length > 0 ? note.topics : ['General'];
        tags.forEach(t => {
          filterCounts[t] = (filterCounts[t] || 0) + 1;
        });
      }
    });

    // Reset filter if current selection no longer exists
    if (selectedFilter !== 'all' && !Object.hasOwn(filterCounts, selectedFilter)) {
      selectedFilter = 'all';
    }

    // Populate filter pills
    const pills = [];
    const allPill = document.createElement('button');
    allPill.className = `topic-pill ${selectedFilter === 'all' ? 'active' : ''}`;
    allPill.innerHTML = `All <span class="topic-pill-count">${notes.length}</span>`;
    allPill.addEventListener('click', () => {
      selectedFilter = 'all';
      renderAllNotesView();
    });
    pills.push(allPill);

    Object.keys(filterCounts)
      .toSorted((a, b) => a.localeCompare(b))
      .forEach(label => {
        const pill = document.createElement('button');
        pill.className = `topic-pill ${selectedFilter === label ? 'active' : ''}`;
        pill.innerHTML = `${window.SteepMarkdown.escapeHtml(label)} <span class="topic-pill-count">${filterCounts[label]}</span>`;
        pill.addEventListener('click', () => {
          selectedFilter = label;
          renderAllNotesView();
        });
        pills.push(pill);
      });
    topicPillsContainer.replaceChildren(...pills);

    // Filter notes
    let filtered = notes.filter(n => {
      const matchesQuery =
        (n.title || '').toLowerCase().includes(query) ||
        (n.channel || '').toLowerCase().includes(query) ||
        (n.summary || '').toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (selectedFilter === 'all') return true;
      if (filterByChannel) {
        return (n.channel || 'Unknown Channel') === selectedFilter;
      }
      const tags = Array.isArray(n.topics) && n.topics.length > 0 ? n.topics : ['General'];
      return tags.includes(selectedFilter);
    });

    filtered = sortByLatest(filtered);

    libraryTotalCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'note' : 'notes'}`;
    libraryContent.replaceChildren();

    if (filtered.length === 0) {
      libraryContent.innerHTML = `
        <div class="empty-library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p>No notes found matching your criteria.</p>
        </div>
      `;
      return;
    }

    function createNoteCard(note) {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.setAttribute('data-id', note.id);

      const excerpt = getCleanExcerpt(note.summary);
      const durText = formatDuration(note.duration);
      const readText = formatReadingTime(note.reading_time);
      const channelName = note.channel || '';

      card.innerHTML = `
        <div class="note-card-top">
          ${channelName ? `<span class="note-card-channel" title="${window.SteepMarkdown.escapeHtml(channelName)}">${window.SteepMarkdown.escapeHtml(channelName)}</span>` : '<span></span>'}
          <span class="note-card-date">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${formatDate(note.created_at)}
          </span>
        </div>

        <div class="note-card-main">
          <h3 class="note-card-title">${window.SteepMarkdown.escapeHtml(note.title || 'Untitled Summary')}</h3>
          <p class="note-card-excerpt">${window.SteepMarkdown.escapeHtml(excerpt)}</p>
          ${(durText || readText) ? `
          <div class="note-card-times">
            ${durText ? `<span class="note-card-time-pill">${window.SteepMarkdown.escapeHtml(durText)} video</span>` : ''}
            ${readText ? `<span class="note-card-time-pill">${window.SteepMarkdown.escapeHtml(readText)}</span>` : ''}
          </div>` : ''}
        </div>

        <div class="note-card-footer">
          <span class="note-card-read">
            Read summary
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>

          <div class="note-card-actions">
            ${note.url ? `
            <a href="${note.url}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Original Video" aria-label="Original Video">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </a>` : ''}
            <button class="btn-card-action btn-card-copy" title="Copy Markdown" aria-label="Copy Markdown" data-id="${note.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button class="btn-card-action btn-card-danger btn-card-delete" title="Delete Note" aria-label="Delete Note" data-id="${note.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-card-action')) return;
        selectNote(note.id);
      });

      const copyBtn = card.querySelector('.btn-card-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!note.summary) return;
          navigator.clipboard.writeText(note.summary).then(() => {
            showToast('Markdown copied to clipboard!');
          }).catch(() => {
            showError('Failed to copy markdown to clipboard');
          });
        });
      }

      const delBtn = card.querySelector('.btn-card-delete');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${note.title}"?`)) {
            await deleteNote(note.id);
          }
        });
      }

      return card;
    }

    function appendGroupSection(groupName, groupNotes, iconText) {
      const section = document.createElement('div');
      section.className = 'topic-section';
      section.innerHTML = `
        <div class="topic-section-header">
          <div class="topic-header-title">
            <span class="topic-pill-icon">${iconText}</span>
            <h2 class="topic-heading">${window.SteepMarkdown.escapeHtml(groupName)}</h2>
            <span class="topic-count-badge">${groupNotes.length}</span>
          </div>
        </div>
        <div class="notes-card-grid"></div>
      `;
      const grid = section.querySelector('.notes-card-grid');
      groupNotes.forEach(note => grid.appendChild(createNoteCard(note)));
      libraryContent.appendChild(section);
    }

    if (libraryViewMode === 'topic' || libraryViewMode === 'channel') {
      const iconText = libraryViewMode === 'channel' ? '@' : '#';
      if (selectedFilter === 'all') {
        if (libraryViewMode === 'channel') {
          const grouped = Object.groupBy(filtered, (note) => note.channel || 'Unknown Channel');
          Object.keys(grouped)
            .toSorted((a, b) => a.localeCompare(b))
            .forEach(groupName => {
              appendGroupSection(groupName, sortByLatest(grouped[groupName] ?? []), iconText);
            });
        } else {
          const grouped = new Map();
          filtered.forEach(note => {
            const tags = Array.isArray(note.topics) && note.topics.length > 0 ? note.topics : ['General'];
            tags.forEach(tag => {
              if (!grouped.has(tag)) grouped.set(tag, []);
              grouped.get(tag).push(note);
            });
          });
          Array.from(grouped.keys())
            .toSorted((a, b) => a.localeCompare(b))
            .forEach(groupName => {
              appendGroupSection(groupName, sortByLatest(grouped.get(groupName)), iconText);
            });
        }
      } else {
        appendGroupSection(selectedFilter, filtered, iconText);
      }
    } else {
      const grid = document.createElement('div');
      grid.className = 'notes-card-grid';
      filtered.forEach(note => grid.appendChild(createNoteCard(note)));
      libraryContent.appendChild(grid);
    }
  }

  // Select and load a note by ID
  async function selectNote(id) {
    hideError();

    // If selecting the note currently being streamed, attach to its live buffer
    if (activeStream && String(activeStream.id) === String(id)) {
      currentNote = activeStream;
      currentRawMarkdown = activeStream.rawMarkdown;
      isLibraryView = false;

      if (btnViewAllNotes) btnViewAllNotes.classList.remove('active');
      document.querySelectorAll('.note-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-id') == id);
      });

      welcomeView.style.display = 'none';
      allNotesView.style.display = 'none';
      allNotesView.classList.remove('visible');
      noteArticle.style.display = 'flex';
      noteArticle.classList.add('visible');
      streamingIndicator.style.display = 'inline-flex';
      if (streamingStatusText) streamingStatusText.textContent = activeStream.statusText;

      articleTitle.textContent = activeStream.title;
      updateArticleMeta(activeStream);

      if (btnRegenerateNote) {
        btnRegenerateNote.disabled = true;
        btnRegenerateNote.style.display = 'inline-flex';
      }

      if (activeStream.rawMarkdown) {
        renderMarkdownContent(activeStream.rawMarkdown, activeStream.url, { streaming: true });
      } else {
        markdownContent.innerHTML = `<span class="streaming-cursor"></span>`;
      }
      viewport.scrollTop = 0;
      return;
    }

    try {
      const data = await window.SteepAPI.fetchSummary(id);
      currentNote = data;
      currentRawMarkdown = data.summary || '';
      isLibraryView = false;

      if (btnViewAllNotes) btnViewAllNotes.classList.remove('active');
      document.querySelectorAll('.note-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-id') == id);
      });

      welcomeView.style.display = 'none';
      allNotesView.style.display = 'none';
      allNotesView.classList.remove('visible');
      noteArticle.style.display = 'flex';
      noteArticle.classList.add('visible');
      streamingIndicator.style.display = 'none';

      articleTitle.textContent = data.title;
      updateArticleMeta(data);

      if (btnRegenerateNote) {
        btnRegenerateNote.disabled = !data.transcript || Boolean(activeStream);
        btnRegenerateNote.style.display = 'inline-flex';
      }

      renderMarkdownContent(currentRawMarkdown, data.url);
      viewport.scrollTop = 0;
    } catch (err) {
      showError(err.message);
    }
  }

  // Delete a note
  async function deleteNote(id) {
    try {
      await window.SteepAPI.deleteSummary(id);
      notes = notes.filter(n => n.id != id);
      renderNotesList();

      if (isLibraryView) {
        renderAllNotesView();
      } else if (currentNote && currentNote.id == id) {
        if (notes.length > 0) {
          selectNote(notes[0].id);
        } else {
          currentNote = null;
          currentRawMarkdown = '';
          noteArticle.style.display = 'none';
          noteArticle.classList.remove('visible');
          welcomeView.style.display = 'flex';
        }
      }

      showToast('Note deleted');
    } catch (err) {
      showError(err.message);
    }
  }

  // Reset to welcome / new state
  function resetToNew() {
    currentNote = null;
    currentRawMarkdown = '';
    isLibraryView = false;

    if (btnViewAllNotes) btnViewAllNotes.classList.remove('active');
    document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));

    allNotesView.style.display = 'none';
    allNotesView.classList.remove('visible');
    noteArticle.style.display = 'none';
    noteArticle.classList.remove('visible');
    welcomeView.style.display = 'flex';
    if (!activeStream) {
      urlInput.value = '';
      setTimeout(() => urlInput.focus(), 50);
    }
    viewport.scrollTop = 0;
    hideError();
  }

  // Shared streaming flow for both new summarization and regeneration
  async function runSummaryStream({ startStream, isRegenerate = false, initialUrl = '', existingNote = null }) {
    if (activeStream) return;

    hideError();
    btnSubmit.disabled = true;
    if (btnRegenerateNote) btnRegenerateNote.disabled = true;

    if (!isRegenerate) {
      submitIcon.innerHTML = `<div class="spinner"></div>`;
      submitText.textContent = 'Summarizing...';
    }

    const streamId = isRegenerate ? existingNote.id : 'streaming-temp';
    const statusText = isRegenerate ? 'Regenerating summary...' : 'Streaming summary...';

    activeStream = {
      id: streamId,
      isRegenerate,
      title: isRegenerate ? (existingNote?.title || 'Regenerating...') : 'Extracting transcript...',
      topics: existingNote?.topics || ['General'],
      channel: existingNote?.channel || '',
      created_at: existingNote?.created_at || new Date().toISOString(),
      duration: existingNote?.duration || 0,
      reading_time: 0,
      url: existingNote?.url || initialUrl,
      dateLabel: isRegenerate ? formatDate(existingNote?.created_at) : 'Just now',
      rawMarkdown: '',
      statusText,
      savedId: existingNote?.id || null,
    };

    if (!isRegenerate) {
      notes = [activeStream, ...notes.filter(n => n.id !== 'streaming-temp')];
    }

    currentNote = activeStream;
    currentRawMarkdown = '';
    isLibraryView = false;

    if (btnViewAllNotes) btnViewAllNotes.classList.remove('active');
    allNotesView.style.display = 'none';
    allNotesView.classList.remove('visible');
    welcomeView.style.display = 'none';
    noteArticle.style.display = 'flex';
    noteArticle.classList.add('visible');
    streamingIndicator.style.display = 'inline-flex';
    if (streamingStatusText) streamingStatusText.textContent = statusText;

    articleTitle.textContent = activeStream.title;
    updateArticleMeta(activeStream);
    markdownContent.innerHTML = `<span class="streaming-cursor"></span>`;
    renderNotesList();
    if (!isRegenerate) notesListContainer.scrollTop = 0;

    function syncSidebarNote(updates) {
      notes = notes.map(n => (String(n.id) === String(streamId) ? { ...n, ...updates } : n));
      renderNotesList();
    }

    function resetSubmitControls() {
      btnSubmit.disabled = false;
      submitIcon.innerHTML = `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>`;
      submitText.textContent = 'Summarize';
    }

    await startStream({
      onDuplicate: async (duplicateId) => {
        const wasViewing = isViewingActiveStream();
        activeStream = null;
        notes = notes.filter(n => n.id !== 'streaming-temp');
        resetSubmitControls();
        urlInput.value = '';
        renderNotesList();
        if (wasViewing) {
          streamingIndicator.style.display = 'none';
          await selectNote(duplicateId);
        } else if (currentNote && btnRegenerateNote) {
          btnRegenerateNote.disabled = !currentNote.transcript;
        }
        showToast('Already saved — opened existing note');
      },
      onVideoMeta: (meta) => {
        if (!activeStream) return;
        activeStream.url = meta.url || activeStream.url;
        activeStream.channel = meta.channel || activeStream.channel;
        activeStream.duration = meta.duration || activeStream.duration;
        syncSidebarNote({
          url: activeStream.url,
          channel: activeStream.channel,
          duration: activeStream.duration,
        });
        if (isViewingActiveStream()) {
          updateArticleMeta(activeStream);
        }
      },
      onTitle: (title, topics) => {
        if (!activeStream) return;
        activeStream.title = title;
        if (Array.isArray(topics) && topics.length > 0) {
          activeStream.topics = topics;
        }
        syncSidebarNote({ title: activeStream.title, topics: activeStream.topics });
        if (isViewingActiveStream()) {
          articleTitle.textContent = title;
        }
      },
      onChunk: (chunk) => {
        if (!activeStream) return;
        activeStream.rawMarkdown += chunk;
        if (isViewingActiveStream()) {
          currentRawMarkdown = activeStream.rawMarkdown;
          renderMarkdownContent(currentRawMarkdown, activeStream.url, { streaming: true });
        }
      },
      onSaved: (id, readingTime) => {
        if (!activeStream) return;
        activeStream.savedId = id;
        activeStream.reading_time = readingTime;
        if (isViewingActiveStream()) {
          updateArticleMeta(activeStream);
        }
      },
      onFinish: async () => {
        const wasViewing = isViewingActiveStream();
        const finished = activeStream;
        activeStream = null;
        resetSubmitControls();
        if (!isRegenerate) urlInput.value = '';

        if (wasViewing && finished) {
          streamingIndicator.style.display = 'none';
          currentRawMarkdown = finished.rawMarkdown;
          renderMarkdownContent(currentRawMarkdown, finished.url, { streaming: false });
        }

        showToast(isRegenerate ? 'Summary regenerated!' : 'Summary complete!');

        try {
          const raw = await window.SteepAPI.fetchSummaries();
          notes = sortByLatest(raw);
          const targetId = finished?.savedId || (notes[0] && notes[0].id);

          if (wasViewing && targetId) {
            const fullNote = await window.SteepAPI.fetchSummary(targetId);
            currentNote = fullNote;
            currentRawMarkdown = fullNote.summary || '';
            articleTitle.textContent = fullNote.title;
            updateArticleMeta(fullNote);
            renderMarkdownContent(currentRawMarkdown, fullNote.url, { streaming: false });
            if (btnRegenerateNote) btnRegenerateNote.disabled = !fullNote.transcript;
          } else if (currentNote && btnRegenerateNote) {
            btnRegenerateNote.disabled = !currentNote.transcript;
          }

          renderNotesList();
          if (isLibraryView) {
            renderAllNotesView();
          }
        } catch (e) {
          console.error('Error refreshing notes list:', e);
        }
      },
      onError: (err) => {
        console.error('Summarization error:', err);
        const wasViewing = isViewingActiveStream();
        activeStream = null;
        resetSubmitControls();
        showError(err.message || 'An error occurred while generating the summary.');

        if (isRegenerate && existingNote) {
          syncSidebarNote(existingNote);
          if (wasViewing) {
            streamingIndicator.style.display = 'none';
            currentNote = existingNote;
            currentRawMarkdown = existingNote.summary || '';
            articleTitle.textContent = existingNote.title;
            updateArticleMeta(existingNote);
            renderMarkdownContent(currentRawMarkdown, existingNote.url);
            if (btnRegenerateNote) btnRegenerateNote.disabled = !existingNote.transcript;
          } else if (currentNote && btnRegenerateNote) {
            btnRegenerateNote.disabled = !currentNote.transcript;
          }
        } else {
          notes = notes.filter(n => n.id !== 'streaming-temp');
          if (wasViewing) {
            streamingIndicator.style.display = 'none';
            markdownContent.innerHTML = `<p style="color: var(--danger);">Unable to generate summary: ${window.SteepMarkdown.escapeHtml(err.message)}</p>`;
            currentNote = null;
          } else if (currentNote && btnRegenerateNote) {
            btnRegenerateNote.disabled = !currentNote.transcript;
          }
          renderNotesList();
        }
      }
    });
  }

  // Event Listeners
  alertClose.addEventListener('click', hideError);

  searchNotesInput.addEventListener('input', () => {
    renderNotesList();
    if (isLibraryView) {
      renderAllNotesView();
    }
  });

  if (btnViewAllNotes) {
    btnViewAllNotes.addEventListener('click', () => showAllNotesView());
  }

  if (articleChannel) {
    articleChannel.addEventListener('click', () => {
      const ch = articleChannel.dataset.channel;
      if (ch) {
        showAllNotesView('channel', ch);
      }
    });
  }

  if (toggleTopicView) {
    toggleTopicView.addEventListener('click', () => {
      if (libraryViewMode === 'channel') selectedFilter = 'all';
      libraryViewMode = 'topic';
      syncLibraryToggleButtons();
      renderAllNotesView();
    });
  }

  if (toggleChannelView) {
    toggleChannelView.addEventListener('click', () => {
      if (libraryViewMode !== 'channel') selectedFilter = 'all';
      libraryViewMode = 'channel';
      syncLibraryToggleButtons();
      renderAllNotesView();
    });
  }

  if (toggleGridView) {
    toggleGridView.addEventListener('click', () => {
      if (libraryViewMode === 'channel') selectedFilter = 'all';
      libraryViewMode = 'grid';
      syncLibraryToggleButtons();
      renderAllNotesView();
    });
  }

  btnNewNote.addEventListener('click', resetToNew);
  brandBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetToNew();
  });

  btnCopyMarkdown.addEventListener('click', () => {
    if (!currentRawMarkdown) return;
    navigator.clipboard.writeText(currentRawMarkdown).then(() => {
      showToast('Markdown copied to clipboard!');
    }).catch(() => {
      showError('Failed to copy markdown to clipboard');
    });
  });

  if (btnRegenerateNote) {
    btnRegenerateNote.addEventListener('click', async () => {
      if (!currentNote || !currentNote.id || currentNote.id === 'streaming-temp' || activeStream) return;
      const snapshot = { ...currentNote };
      await runSummaryStream({
        isRegenerate: true,
        existingNote: snapshot,
        startStream: (handlers) => window.SteepAPI.streamRegenerate(snapshot.id, handlers),
      });
    });
  }

  if (btnDeleteCurrentNote) {
    btnDeleteCurrentNote.addEventListener('click', async () => {
      if (!currentNote || !currentNote.id || currentNote.id === 'streaming-temp') return;
      if (activeStream && String(activeStream.id) === String(currentNote.id)) return;
      if (confirm(`Delete "${currentNote.title}"?`)) {
        await deleteNote(currentNote.id);
      }
    });
  }

  mobileMenuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Summarize Form Handler (Streaming)
  summarizeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url || activeStream) return;

    await runSummaryStream({
      isRegenerate: false,
      initialUrl: url,
      startStream: (handlers) => window.SteepAPI.streamSummarize(url, handlers),
    });
  });

  // Initial load
  loadNotes();
});
