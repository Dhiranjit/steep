/**
 * Main application controller for Steep
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  let notes = [];
  let currentNote = null;
  let isStreaming = false;
  let currentRawMarkdown = '';
  let isLibraryView = false;
  let libraryViewMode = 'grouped'; // 'grouped' | 'grid'
  let selectedTopic = 'all';

  // DOM Elements
  const notesListContainer = document.getElementById('notesListContainer');
  const notesCount = document.getElementById('notesCount');
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
  const articleDate = document.getElementById('articleDate');
  const articleVideoLink = document.getElementById('articleVideoLink');
  const markdownContent = document.getElementById('markdownContent');
  const streamingIndicator = document.getElementById('streamingIndicator');
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
  const toggleGroupedView = document.getElementById('toggleGroupedView');
  const toggleGridView = document.getElementById('toggleGridView');

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

  function getCleanExcerpt(markdown, maxLen = 150) {
    if (!markdown) return 'No preview available.';
    let text = markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove header lines
      .replace(/^#+\s+.*$/gm, '')
      // Remove bold/italics markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove blockquotes and bullet points
      .replace(/^>\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      // Collapse whitespace
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

  // Sort helper: latest note on top
  function sortByLatest(items) {
    return [...items].sort((a, b) => {
      const da = new Date((a.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
      const db = new Date((b.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
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
    const isSearching = query.length > 0;
    const filtered = notes.filter(n => (n.title || '').toLowerCase().includes(query));

    // Keep at most 8 of the most recent notes in the sidebar
    const displayedNotes = filtered.slice(0, 8);

    if (navAllNotesCount) navAllNotesCount.textContent = notes.length;
    notesListContainer.innerHTML = '';

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

      item.innerHTML = `
        <div class="note-item-header">
          <span class="note-title">${window.SteepMarkdown.escapeHtml(note.title || 'Untitled Summary')}</span>
          ${note.id === 'streaming-temp' ? '' : `
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
            <span class="note-date">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${formatDate(note.created_at)}
            </span>
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
  function showAllNotesView() {
    if (isStreaming) return;
    hideError();

    isLibraryView = true;
    currentNote = null;

    // Update active highlight
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

    // Compute topics count
    const topicCounts = {};
    notes.forEach(note => {
      const tags = Array.isArray(note.topics) && note.topics.length > 0 ? note.topics : ['General'];
      tags.forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });

    // Populate topic filter pills
    topicPillsContainer.innerHTML = '';
    const allPill = document.createElement('button');
    allPill.className = `topic-pill ${selectedTopic === 'all' ? 'active' : ''}`;
    allPill.innerHTML = `All <span class="topic-pill-count">${notes.length}</span>`;
    allPill.addEventListener('click', () => {
      selectedTopic = 'all';
      renderAllNotesView();
    });
    topicPillsContainer.appendChild(allPill);

    Object.keys(topicCounts).sort().forEach(topic => {
      const pill = document.createElement('button');
      pill.className = `topic-pill ${selectedTopic === topic ? 'active' : ''}`;
      pill.innerHTML = `${window.SteepMarkdown.escapeHtml(topic)} <span class="topic-pill-count">${topicCounts[topic]}</span>`;
      pill.addEventListener('click', () => {
        selectedTopic = topic;
        renderAllNotesView();
      });
      topicPillsContainer.appendChild(pill);
    });

    // Sort helper: latest on top
    function sortByLatest(items) {
      return [...items].sort((a, b) => {
        const da = new Date((a.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
        const db = new Date((b.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
        if (db !== da) return db - da;
        return (b.id || 0) - (a.id || 0);
      });
    }

    // Filter notes
    let filtered = notes.filter(n => {
      const matchesQuery = (n.title || '').toLowerCase().includes(query) || (n.summary || '').toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (selectedTopic === 'all') return true;
      const tags = Array.isArray(n.topics) && n.topics.length > 0 ? n.topics : ['General'];
      return tags.includes(selectedTopic);
    });

    // Ensure notes are sorted latest-first
    filtered = sortByLatest(filtered);

    libraryTotalCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'note' : 'notes'}`;
    libraryContent.innerHTML = '';

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

    // Helper to build note card DOM without tags
    function createNoteCard(note) {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.setAttribute('data-id', note.id);

      const excerpt = getCleanExcerpt(note.summary);

      card.innerHTML = `
        <div class="note-card-top">
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

    if (libraryViewMode === 'grouped') {
      if (selectedTopic === 'all') {
        // Group notes by primary topic
        const groups = {};
        filtered.forEach(note => {
          const tags = Array.isArray(note.topics) && note.topics.length > 0 ? note.topics : ['General'];
          const primary = tags[0];
          if (!groups[primary]) groups[primary] = [];
          groups[primary].push(note);
        });

        // Sort groups alphabetically
        const sortedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

        sortedGroupNames.forEach(topicName => {
          // Within each group, latest notes on top
          const topicNotes = sortByLatest(groups[topicName]);
          const section = document.createElement('div');
          section.className = 'topic-section';

          section.innerHTML = `
            <div class="topic-section-header">
              <div class="topic-header-title">
                <span class="topic-pill-icon">#</span>
                <h2 class="topic-heading">${window.SteepMarkdown.escapeHtml(topicName)}</h2>
                <span class="topic-count-badge">${topicNotes.length}</span>
              </div>
            </div>
            <div class="notes-card-grid"></div>
          `;

          const grid = section.querySelector('.notes-card-grid');
          topicNotes.forEach(note => {
            grid.appendChild(createNoteCard(note));
          });

          libraryContent.appendChild(section);
        });
      } else {
        // Single topic selected in grouped mode: show topic header and latest notes on top
        const section = document.createElement('div');
        section.className = 'topic-section';
        section.innerHTML = `
          <div class="topic-section-header">
            <div class="topic-header-title">
              <span class="topic-pill-icon">#</span>
              <h2 class="topic-heading">${window.SteepMarkdown.escapeHtml(selectedTopic)}</h2>
              <span class="topic-count-badge">${filtered.length}</span>
            </div>
          </div>
          <div class="notes-card-grid"></div>
        `;
        const grid = section.querySelector('.notes-card-grid');
        filtered.forEach(note => {
          grid.appendChild(createNoteCard(note));
        });
        libraryContent.appendChild(section);
      }
    } else {
      // "All" view mode: single flat grid with all filtered notes, latest on top
      const grid = document.createElement('div');
      grid.className = 'notes-card-grid';
      filtered.forEach(note => {
        grid.appendChild(createNoteCard(note));
      });
      libraryContent.appendChild(grid);
    }
  }

  // Select and load a note by ID
  async function selectNote(id) {
    if (isStreaming) return;

    hideError();

    try {
      const data = await window.SteepAPI.fetchSummary(id);
      currentNote = data;
      currentRawMarkdown = data.summary || '';
      isLibraryView = false;

      // Update sidebar active highlights
      if (btnViewAllNotes) btnViewAllNotes.classList.remove('active');
      document.querySelectorAll('.note-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-id') == id);
      });

      // Show note view
      welcomeView.style.display = 'none';
      allNotesView.style.display = 'none';
      allNotesView.classList.remove('visible');
      noteArticle.style.display = 'flex';
      noteArticle.classList.add('visible');
      streamingIndicator.style.display = 'none';

      articleTitle.textContent = data.title;
      articleDate.textContent = formatDate(data.created_at);
      articleVideoLink.href = data.url;
      articleVideoLink.style.display = data.url ? 'inline-flex' : 'none';

      markdownContent.innerHTML = window.SteepMarkdown.renderMarkdownToHtml(currentRawMarkdown);
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
    if (isStreaming) return;
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
    urlInput.value = '';
    viewport.scrollTop = 0;
    setTimeout(() => urlInput.focus(), 50);
    hideError();
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
    btnViewAllNotes.addEventListener('click', showAllNotesView);
  }

  if (toggleGroupedView && toggleGridView) {
    toggleGroupedView.addEventListener('click', () => {
      libraryViewMode = 'grouped';
      toggleGroupedView.classList.add('active');
      toggleGridView.classList.remove('active');
      renderAllNotesView();
    });

    toggleGridView.addEventListener('click', () => {
      libraryViewMode = 'grid';
      toggleGridView.classList.add('active');
      toggleGroupedView.classList.remove('active');
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

  if (btnDeleteCurrentNote) {
    btnDeleteCurrentNote.addEventListener('click', async () => {
      if (!currentNote || !currentNote.id || currentNote.id === 'streaming-temp') return;
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
    if (!url || isStreaming) return;

    hideError();
    isStreaming = true;
    btnSubmit.disabled = true;
    submitIcon.innerHTML = `<div class="spinner"></div>`;
    submitText.textContent = 'Summarizing...';

    // Prepare UI for streaming
    isLibraryView = false;
    allNotesView.style.display = 'none';
    allNotesView.classList.remove('visible');
    welcomeView.style.display = 'none';
    noteArticle.style.display = 'flex';
    noteArticle.classList.add('visible');
    streamingIndicator.style.display = 'inline-flex';

    articleTitle.textContent = 'Extracting transcript...';
    articleDate.textContent = 'Just now';
    articleVideoLink.href = url;
    articleVideoLink.style.display = 'inline-flex';
    markdownContent.innerHTML = `<span class="streaming-cursor"></span>`;
    currentRawMarkdown = '';

    let streamingTileCreated = false;

    function createStreamingTile(title, topics) {
      if (streamingTileCreated) return;
      streamingTileCreated = true;

      const tempNote = {
        id: 'streaming-temp',
        title: title || 'Generating Summary...',
        url: url,
        created_at: new Date().toISOString(),
        topics: (Array.isArray(topics) && topics.length > 0) ? topics : ['General'],
        isStreaming: true
      };

      currentNote = tempNote;
      notes = [tempNote, ...notes.filter(n => n.id !== 'streaming-temp')];
      renderNotesList();
      notesListContainer.scrollTop = 0;
    }

    await window.SteepAPI.streamSummarize(url, {
      onTitle: (title, topics) => {
        articleTitle.textContent = title;
        createStreamingTile(title, topics);
      },
      onChunk: (chunk) => {
        if (!streamingTileCreated) {
          createStreamingTile(articleTitle.textContent !== 'Extracting transcript...' ? articleTitle.textContent : 'Generating Summary...');
        }
        currentRawMarkdown += chunk;
        markdownContent.innerHTML = window.SteepMarkdown.renderMarkdownToHtml(currentRawMarkdown) + `<span class="streaming-cursor"></span>`;
      },
      onFinish: async () => {
        markdownContent.innerHTML = window.SteepMarkdown.renderMarkdownToHtml(currentRawMarkdown);
        streamingIndicator.style.display = 'none';
        showToast('Summary complete!');
        isStreaming = false;
        btnSubmit.disabled = false;
        submitIcon.innerHTML = `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>`;
        submitText.textContent = 'Summarize';
        urlInput.value = '';

        try {
          const raw = await window.SteepAPI.fetchSummaries();
          notes = sortByLatest(raw);
          if (notes.length > 0) {
            currentNote = notes[0];
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
        showError(err.message || 'An error occurred while fetching the summary.');
        streamingIndicator.style.display = 'none';
        markdownContent.innerHTML = `<p style="color: var(--danger);">Unable to generate summary: ${window.SteepMarkdown.escapeHtml(err.message)}</p>`;
        notes = notes.filter(n => n.id !== 'streaming-temp');
        if (currentNote && currentNote.id === 'streaming-temp') {
          currentNote = notes[0] || null;
        }
        renderNotesList();
        isStreaming = false;
        btnSubmit.disabled = false;
        submitIcon.innerHTML = `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>`;
        submitText.textContent = 'Summarize';
      }
    });
  });

  // Initial load
  loadNotes();
});
