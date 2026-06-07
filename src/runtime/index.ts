export const iframeLoaderRuntime = String.raw`
(() => {
  const SOURCE_SCRIPT_ID = "html-collab-source";
  const STATE_SCRIPT_ID = "html-collab-state";
  const ACTOR_STORAGE_PREFIX = "html-collab.actor.";
  const AUTOSAVE_DELAY_MS = 700;
  const EDIT_VIEW_STORAGE_KEY = "html-collab.editView";
  const WELCOME_DISMISSED_KEY = "html-collab.welcome.dismissed";

  let state;
  let sourceHtml = "";
  let selectedAnchor = null;
  let editViewMode = "markup";
  let commentRangeIndex = [];
  let activeHighlight = null;
  let autosaveHandle = null;
  let autosaveEnabled = false;
  let autosaveTimer = 0;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let autosavePrompted = false;
  let autosavePromptInFlight = false;

  function readJsonScript(id) {
    const node = document.getElementById(id);
    if (!node) {
      throw new Error("Missing " + id + " script");
    }
    return JSON.parse(node.textContent || "{}");
  }

  function writeJsonScript(id, value) {
    const node = document.getElementById(id);
    if (!node) {
      throw new Error("Missing " + id + " script");
    }
    node.textContent = JSON.stringify(value, null, 2).replace(/[<>&]/g, (character) => {
      if (character === "<") return "\\u003c";
      if (character === ">") return "\\u003e";
      return "\\u0026";
    });
  }

  function decodeBase64Utf8(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  function loadSourceFrame() {
    const frame = getFrame();
    frame.addEventListener("load", () => {
      installFrameSelectionHandlers();
      renderHighlights();
      renderThreads();
      focusFromLocationHash();
    });
    frame.srcdoc = sourceHtml;
  }

  function reloadSourceFrame() {
    getFrame().srcdoc = sourceHtml;
  }

  function refreshHighlights() {
    const viewport = captureFrameViewport();
    clearHighlights();
    renderHighlights();
    restoreFrameViewport(viewport);
  }

  function captureFrameViewport() {
    const frame = getFrame();
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument || !frameDocument.documentElement) {
      return null;
    }

    const width = frameDocument.documentElement.clientWidth || frameWindow.innerWidth || 0;
    const height = frameDocument.documentElement.clientHeight || frameWindow.innerHeight || 0;
    const points = [
      [0.5, 0.25],
      [0.5, 0.5],
      [0.35, 0.25],
      [0.65, 0.25],
    ];

    for (const [xRatio, yRatio] of points) {
      const element = restorableViewportElement(
        frameDocument,
        frameDocument.elementFromPoint(Math.round(width * xRatio), Math.round(height * yRatio)),
      );
      if (element) {
        return {
          x: frameWindow.scrollX,
          y: frameWindow.scrollY,
          anchor: element,
          anchorTop: element.getBoundingClientRect().top,
        };
      }
    }

    return {
      x: frameWindow.scrollX,
      y: frameWindow.scrollY,
    };
  }

  function restorableViewportElement(frameDocument, element) {
    let current = element;
    while (current && current !== frameDocument.body && current !== frameDocument.documentElement) {
      if (
        current.matches?.(
          "mark[data-html-collab-thread],mark[data-html-collab-edit],del,ins,.html-collab-edit-preview-replacement",
        )
      ) {
        current = current.parentElement;
        continue;
      }
      return current;
    }
    return null;
  }

  function restoreFrameViewport(viewport) {
    if (!viewport) {
      return;
    }

    const restore = () => {
      const frameWindow = getFrame().contentWindow;
      if (!frameWindow) {
        return;
      }
      if (viewport.anchor?.isConnected && typeof viewport.anchorTop === "number") {
        const delta = viewport.anchor.getBoundingClientRect().top - viewport.anchorTop;
        frameWindow.scrollTo(viewport.x, frameWindow.scrollY + delta);
        return;
      }
      frameWindow.scrollTo(viewport.x, viewport.y);
    };

    restore();
    window.requestAnimationFrame(restore);
  }

  function clearHighlights() {
    const frame = getFrame();
    const frameDocument = frame.contentDocument;
    if (!frameDocument || !frameDocument.body) {
      return;
    }
    clearCommentHighlights(frame.contentWindow);
    const marks = frameDocument.querySelectorAll('mark[data-html-collab-thread],mark[data-html-collab-edit]');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) {
        return;
      }
      if (mark.dataset.htmlCollabEdit && typeof mark.dataset.htmlCollabOriginal === "string") {
        parent.insertBefore(frameDocument.createTextNode(mark.dataset.htmlCollabOriginal), mark);
        parent.removeChild(mark);
        return;
      }
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    });
    frameDocument.body.normalize();
  }

  function getFrame() {
    const frame = document.getElementById("html-collab-source-frame");
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error("Missing html-collab source iframe");
    }
    return frame;
  }

  function init() {
    const source = readJsonScript(SOURCE_SCRIPT_ID);
    if (source.encoding !== "base64" || typeof source.html !== "string") {
      throw new Error("Unsupported html-collab source payload");
    }

    sourceHtml = decodeBase64Utf8(source.html);
    state = readJsonScript(STATE_SCRIPT_ID);
    hydrateReviewer();
    hydrateEditView();
    bindShellEvents();
    loadSourceFrame();
    renderThreads();
    updateAutosaveButton();
    focusFromLocationHash();
    setStatus("Ready");
    if (shouldShowWelcomeOnFirstOpen()) {
      openWelcomeModal();
    }
  }

  function bindShellEvents() {
    const addButton = document.getElementById("html-collab-add-comment");
    const editButton = document.getElementById("html-collab-suggest-edit");
    const autosaveButton = document.getElementById("html-collab-autosave");
    const mergeButton = document.getElementById("html-collab-merge");
    const mergeInput = document.getElementById("html-collab-merge-files");
    const briefButton = document.getElementById("html-collab-brief");
    const exportButton = document.getElementById("html-collab-export");
    const reviewerInput = document.getElementById("html-collab-reviewer");
    const editView = document.getElementById("html-collab-edit-view");
    const cancelButton = document.getElementById("html-collab-cancel-comment");
    const submitButton = document.getElementById("html-collab-submit-comment");
    const commentBody = document.getElementById("html-collab-comment-body");
    const editKind = document.getElementById("html-collab-edit-kind");
    const editReplacement = document.getElementById("html-collab-edit-replacement");
    const editNote = document.getElementById("html-collab-edit-note");
    const cancelEditButton = document.getElementById("html-collab-cancel-edit");
    const submitEditButton = document.getElementById("html-collab-submit-edit");
    const contextCommentButton = document.getElementById("html-collab-context-comment");
    const contextEditButton = document.getElementById("html-collab-context-edit");
    const helpButton = document.getElementById("html-collab-help-button");
    const showWelcomeLink = document.getElementById("html-collab-show-welcome");
    const welcomeStart = document.getElementById("html-collab-welcome-start");
    const welcomeClose = document.getElementById("html-collab-welcome-close");
    const welcomeModal = document.getElementById("html-collab-welcome-modal");

    addButton?.addEventListener("click", () => openCommentComposer());
    editButton?.addEventListener("click", () => openEditComposer());
    contextCommentButton?.addEventListener("click", () => {
      hideSelectionMenu();
      openCommentComposer();
    });
    contextEditButton?.addEventListener("click", () => {
      hideSelectionMenu();
      openEditComposer();
    });
    helpButton?.addEventListener("click", () => toggleHelp());
    showWelcomeLink?.addEventListener("click", () => {
      hideHelp();
      openWelcomeModal();
    });
    welcomeStart?.addEventListener("click", () => closeWelcomeModal());
    welcomeClose?.addEventListener("click", () => closeWelcomeModal());
    welcomeModal?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeWelcomeModal();
    });
    autosaveButton?.addEventListener("click", () => requestAutosave());
    mergeButton?.addEventListener("click", () => mergeInput?.click());
    briefButton?.addEventListener("click", () => openBriefModal());
    exportButton?.addEventListener("click", () => downloadReviewFile());
    document.getElementById("html-collab-brief-copy")?.addEventListener("click", () => copyBriefToClipboard());
    document.getElementById("html-collab-brief-download")?.addEventListener("click", () => downloadReviewBrief());
    document.getElementById("html-collab-brief-close")?.addEventListener("click", () => closeBriefModal());
    document.getElementById("html-collab-brief-modal")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeBriefModal();
    });
    mergeInput?.addEventListener("change", () => mergeSelectedFiles(mergeInput));
    cancelButton?.addEventListener("click", () => closeCommentComposer());
    submitButton?.addEventListener("click", () => submitComment());
    commentBody?.addEventListener("keydown", (event) => handleCommentComposerKeydown(event));
    editKind?.addEventListener("change", () => updateEditComposerKind());
    editKind?.addEventListener("keydown", (event) => handleEditComposerKeydown(event));
    editReplacement?.addEventListener("keydown", (event) => handleEditComposerKeydown(event));
    editNote?.addEventListener("keydown", (event) => handleEditComposerKeydown(event));
    cancelEditButton?.addEventListener("click", () => closeEditComposer());
    submitEditButton?.addEventListener("click", () => submitEditSuggestion());
    editView?.addEventListener("change", () => updateEditView(editView));
    window.addEventListener("hashchange", () => focusFromLocationHash());
    window.addEventListener("resize", () => hideSelectionMenu());
    document.addEventListener("click", (event) => {
      const menu = document.getElementById("html-collab-context-menu");
      if (menu instanceof HTMLElement && !menu.contains(event.target)) {
        hideSelectionMenu();
      }
      const help = document.getElementById("html-collab-help");
      const button = document.getElementById("html-collab-help-button");
      if (
        help instanceof HTMLElement &&
        button instanceof HTMLElement &&
        !help.hidden &&
        !help.contains(event.target) &&
        !button.contains(event.target)
      ) {
        hideHelp();
      }
    });
    document.addEventListener("keydown", (event) => handleReviewShortcut(event));
    reviewerInput?.addEventListener("change", () => {
      if (!currentReviewerName()) {
        return;
      }
      const actor = ensureActor();
      if (!actor) {
        return;
      }
      actor.name = currentReviewerName();
      state.actors[actor.actorId] = actor;
      persistState();
      renderThreads();
    });
  }

  function hydrateReviewer() {
    const input = document.getElementById("html-collab-reviewer");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const storedName = localStorage.getItem("html-collab.reviewerName");
    input.value = storedName || "";
  }

  function hydrateEditView() {
    const input = document.getElementById("html-collab-edit-view");
    const stored = localStorage.getItem(EDIT_VIEW_STORAGE_KEY);
    editViewMode = stored === "preview" ? "preview" : "markup";
    if (input instanceof HTMLSelectElement) {
      input.value = editViewMode;
    }
  }

  function updateEditView(input) {
    if (!(input instanceof HTMLSelectElement)) {
      return;
    }
    editViewMode = input.value === "preview" ? "preview" : "markup";
    localStorage.setItem(EDIT_VIEW_STORAGE_KEY, editViewMode);
    refreshHighlights();
    setStatus(editViewMode === "preview" ? "Previewing replacements" : "Showing tracked changes");
  }

  function installFrameSelectionHandlers() {
    const frame = getFrame();
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.addEventListener("mouseup", captureSelection);
    frameDocument.addEventListener("keyup", captureSelection);
    frameDocument.addEventListener("selectionchange", captureSelection);
    frameDocument.addEventListener("contextmenu", showSelectionMenu);
    frameDocument.addEventListener("keydown", (event) => handleReviewShortcut(event));
    frameDocument.addEventListener("scroll", () => hideSelectionMenu(), true);
  }

  function captureSelection() {
    const anchor = getSelectionAnchor();
    selectedAnchor = anchor;
    if (!anchor) {
      hideSelectionMenu();
    }
    const addButton = document.getElementById("html-collab-add-comment");
    const editButton = document.getElementById("html-collab-suggest-edit");
    if (addButton instanceof HTMLButtonElement) {
      addButton.disabled = !anchor;
    }
    if (editButton instanceof HTMLButtonElement) {
      editButton.disabled = !anchor;
    }
    if (anchor) {
      setStatus("Text selected");
    }
  }

  function showSelectionMenu(event) {
    const anchor = getSelectionAnchor();
    selectedAnchor = anchor;
    if (!anchor) {
      hideSelectionMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectionButtonsEnabled(true);

    const frame = getFrame();
    const menu = document.getElementById("html-collab-context-menu");
    if (!(menu instanceof HTMLElement)) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    menu.hidden = false;
    const left = frameRect.left + event.clientX;
    const top = frameRect.top + event.clientY;
    const width = menu.offsetWidth || 128;
    const height = menu.offsetHeight || 82;
    menu.style.left = Math.min(left, window.innerWidth - width - 8) + "px";
    menu.style.top = Math.min(top, window.innerHeight - height - 8) + "px";
  }

  function hideSelectionMenu() {
    const menu = document.getElementById("html-collab-context-menu");
    if (menu instanceof HTMLElement) {
      menu.hidden = true;
    }
  }

  function toggleHelp() {
    const help = document.getElementById("html-collab-help");
    const button = document.getElementById("html-collab-help-button");
    if (!(help instanceof HTMLElement)) {
      return;
    }
    help.hidden = !help.hidden;
    if (button instanceof HTMLButtonElement) {
      button.setAttribute("aria-expanded", help.hidden ? "false" : "true");
    }
  }

  function hideHelp() {
    const help = document.getElementById("html-collab-help");
    const button = document.getElementById("html-collab-help-button");
    if (help instanceof HTMLElement) {
      help.hidden = true;
    }
    if (button instanceof HTMLButtonElement) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function shouldShowWelcomeOnFirstOpen() {
    if (!state || typeof state.docId !== "string") {
      return false;
    }
    const actorKey = ACTOR_STORAGE_PREFIX + state.docId;
    if (localStorage.getItem(actorKey)) {
      return false;
    }
    if (localStorage.getItem(WELCOME_DISMISSED_KEY)) {
      return false;
    }
    return true;
  }

  function openWelcomeModal() {
    const modal = document.getElementById("html-collab-welcome-modal");
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    modal.hidden = false;
    const startButton = document.getElementById("html-collab-welcome-start");
    if (startButton instanceof HTMLButtonElement) {
      window.setTimeout(() => startButton.focus(), 80);
    }
  }

  function closeWelcomeModal() {
    const modal = document.getElementById("html-collab-welcome-modal");
    if (modal instanceof HTMLElement) {
      modal.hidden = true;
    }
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch (error) {
      void error;
    }
  }

  function handleReviewShortcut(event) {
    if (event.defaultPrevented || isEditableEventTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (!selectedAnchor && (key === "c" || key === "e")) {
      selectedAnchor = getSelectionAnchor();
    }

    if (key === "escape") {
      const welcomeModal = document.getElementById("html-collab-welcome-modal");
      if (welcomeModal && !welcomeModal.hidden) {
        closeWelcomeModal();
        return;
      }
      const briefModal = document.getElementById("html-collab-brief-modal");
      if (briefModal && !briefModal.hidden) {
        closeBriefModal();
        return;
      }
      hideSelectionMenu();
      hideHelp();
      closeCommentComposer();
      closeEditComposer();
      return;
    }
    if (!selectedAnchor || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (key === "c") {
      event.preventDefault();
      hideSelectionMenu();
      openCommentComposer();
      return;
    }
    if (key === "e") {
      event.preventDefault();
      hideSelectionMenu();
      openEditComposer();
    }
  }

  function handleCommentComposerKeydown(event) {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommentComposer();
      setStatus("Comment canceled");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitComment();
    }
  }

  function handleEditComposerKeydown(event) {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditComposer();
      setStatus("Edit canceled");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitEditSuggestion();
    }
  }

  function isInteractiveClickTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(target.closest("button, textarea, input, select, a, label"));
  }

  function isEditableEventTarget(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
  }

  function setSelectionButtonsEnabled(enabled) {
    const addButton = document.getElementById("html-collab-add-comment");
    const editButton = document.getElementById("html-collab-suggest-edit");
    if (addButton instanceof HTMLButtonElement) {
      addButton.disabled = !enabled;
    }
    if (editButton instanceof HTMLButtonElement) {
      editButton.disabled = !enabled;
    }
  }

  function getSelectionAnchor() {
    const frame = getFrame();
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) {
      return null;
    }

    const selection = frameWindow.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rawQuote = selection.toString();
    const quote = rawQuote.trim();
    if (!quote) {
      return null;
    }

    const leadingWhitespace = rawQuote.length - rawQuote.replace(/^\s+/, "").length;
    const trailingWhitespace = rawQuote.length - rawQuote.replace(/\s+$/, "").length;
    const fullText = renderedTextContent(frameDocument.body);
    const start = textOffsetForRangeBoundary(frameDocument.body, range.startContainer, range.startOffset);
    const end = textOffsetForRangeBoundary(frameDocument.body, range.endContainer, range.endOffset);
    const safeStart = Math.max(0, start + leadingWhitespace);
    const safeEnd = Math.max(safeStart, end - trailingWhitespace);

    return {
      kind: "text",
      quote,
      prefix: fullText.slice(Math.max(0, safeStart - 40), safeStart),
      suffix: fullText.slice(safeEnd, Math.min(fullText.length, safeEnd + 40)),
      position: {
        start: safeStart,
        end: safeEnd,
      },
      elementFingerprint: elementFingerprint(range.commonAncestorContainer),
      headingPath: headingPathForNode(frameDocument, range.commonAncestorContainer),
    };
  }

  function headingPathForNode(frameDocument, node) {
    if (!frameDocument || !frameDocument.body || !node) {
      return [];
    }
    const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!target) {
      return [];
    }
    const headings = frameDocument.body.querySelectorAll("h1,h2,h3,h4,h5,h6");
    const stack = [];
    headings.forEach((heading) => {
      if (heading === target) {
        return;
      }
      const relation = heading.compareDocumentPosition(target);
      const headingPrecedesTarget = (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        || (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0;
      if (!headingPrecedesTarget) {
        return;
      }
      const level = parseInt(heading.tagName.slice(1), 10) || 1;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, heading });
    });
    return stack
      .map((entry) => (entry.heading.textContent || "").replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0)
      .slice(-4)
      .map((text) => (text.length > 80 ? text.slice(0, 79) + "…" : text));
  }

  function isRenderedTextNode(node) {
    const parent = node.parentElement;
    if (!parent) {
      return false;
    }
    return !parent.closest(
      "script,style,noscript,template,.html-collab-edit-inline-replacement,.html-collab-edit-preview-replacement",
    );
  }

  function renderedTextWalker(frameDocument, root) {
    return frameDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isRenderedTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
  }

  function renderedTextContent(root) {
    if (!root) {
      return "";
    }
    const walker = renderedTextWalker(root.ownerDocument, root);
    let text = "";
    let node = walker.nextNode();
    while (node) {
      text += node.textContent;
      node = walker.nextNode();
    }
    return text;
  }

  function textOffsetForRangeBoundary(root, targetNode, targetOffset) {
    if (!root || !targetNode) {
      return 0;
    }

    const doc = root.ownerDocument;
    const boundary = doc.createRange();
    try {
      boundary.setStart(targetNode, targetOffset);
    } catch {
      return 0;
    }

    let offset = 0;
    const walker = renderedTextWalker(doc, root);
    let node = walker.nextNode();
    while (node) {
      if (node === targetNode) {
        return offset + targetOffset;
      }
      const length = node.textContent.length;
      let endsAtOrBeforeBoundary;
      try {
        endsAtOrBeforeBoundary = boundary.comparePoint(node, length) <= 0;
      } catch {
        endsAtOrBeforeBoundary = true;
      }
      if (!endsAtOrBeforeBoundary) {
        break;
      }
      offset += length;
      node = walker.nextNode();
    }

    return offset;
  }

  function elementFingerprint(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) {
      return "";
    }

    const parts = [];
    let current = element;
    while (current && current.tagName && parts.length < 4) {
      parts.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
    }
    return parts.join("/");
  }

  function openCommentComposer() {
    if (!selectedAnchor) {
      setStatus("Select text in the report first");
      return;
    }

    const composer = document.getElementById("html-collab-composer");
    const quote = document.getElementById("html-collab-selected-quote");
    const body = document.getElementById("html-collab-comment-body");
    if (!(composer instanceof HTMLElement) || !(quote instanceof HTMLElement)) {
      return;
    }

    closeEditComposer();
    quote.textContent = selectedAnchor.quote;
    composer.hidden = false;
    if (body instanceof HTMLTextAreaElement) {
      body.value = "";
      body.focus();
    }
  }

  function closeCommentComposer() {
    const composer = document.getElementById("html-collab-composer");
    if (composer instanceof HTMLElement) {
      composer.hidden = true;
    }
  }

  function openEditComposer() {
    if (!selectedAnchor) {
      setStatus("Select text in the report first");
      return;
    }

    const composer = document.getElementById("html-collab-edit-composer");
    const quote = document.getElementById("html-collab-edit-selected-quote");
    const replacement = document.getElementById("html-collab-edit-replacement");
    const note = document.getElementById("html-collab-edit-note");
    const kind = document.getElementById("html-collab-edit-kind");
    if (!(composer instanceof HTMLElement) || !(quote instanceof HTMLElement)) {
      return;
    }

    closeCommentComposer();
    quote.textContent = selectedAnchor.quote;
    composer.hidden = false;
    if (kind instanceof HTMLSelectElement) {
      kind.value = "replace";
    }
    if (replacement instanceof HTMLTextAreaElement) {
      replacement.value = "";
      replacement.focus();
    }
    if (note instanceof HTMLTextAreaElement) {
      note.value = "";
    }
    updateEditComposerKind();
  }

  function closeEditComposer() {
    const composer = document.getElementById("html-collab-edit-composer");
    if (composer instanceof HTMLElement) {
      composer.hidden = true;
    }
  }

  function updateEditComposerKind() {
    const kind = document.getElementById("html-collab-edit-kind");
    const replacement = document.getElementById("html-collab-edit-replacement");
    if (!(kind instanceof HTMLSelectElement) || !(replacement instanceof HTMLTextAreaElement)) {
      return;
    }
    const isDelete = kind.value === "delete";
    replacement.disabled = isDelete;
    replacement.placeholder = isDelete ? "No replacement for delete suggestions" : "Replacement or inserted text";
  }

  function submitComment() {
    const body = document.getElementById("html-collab-comment-body");
    if (!(body instanceof HTMLTextAreaElement) || !selectedAnchor) {
      return;
    }

    const text = body.value.trim();
    if (!text) {
      setStatus("Comment body is empty");
      return;
    }

    const threadId = createId("thread");
    const op = addOp("comment.create", selectedAnchor, {
      threadId,
      body: text,
    });
    if (!op) {
      return;
    }
    closeCommentComposer();
    selectedAnchor = null;
    refreshHighlights();
    renderThreads();
    setStatus("Comment added");
  }

  function submitEditSuggestion() {
    if (!selectedAnchor) {
      return;
    }

    const kindInput = document.getElementById("html-collab-edit-kind");
    const replacementInput = document.getElementById("html-collab-edit-replacement");
    const noteInput = document.getElementById("html-collab-edit-note");
    if (!(kindInput instanceof HTMLSelectElement) || !(replacementInput instanceof HTMLTextAreaElement)) {
      return;
    }

    const kind = kindInput.value;
    const replacement = replacementInput.value.trim();
    const note = noteInput instanceof HTMLTextAreaElement ? noteInput.value.trim() : "";
    if (kind !== "replace" && kind !== "insert" && kind !== "delete") {
      setStatus("Choose an edit type");
      return;
    }
    if (kind !== "delete" && !replacement) {
      setStatus("Suggested text is empty");
      return;
    }

    const payload = {
      editId: createId("edit"),
      kind,
    };
    if (kind !== "delete") {
      payload.replacement = replacement;
    }
    if (note) {
      payload.note = note;
    }
    const op = addOp("edit.suggest", selectedAnchor, payload);
    if (!op) {
      return;
    }
    closeEditComposer();
    selectedAnchor = null;
    refreshHighlights();
    renderThreads();
    setStatus("Edit suggested");
  }

  function renderHighlights() {
    const frame = getFrame();
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument) {
      return;
    }

    installHighlightStyles(frameDocument);
    const reduced = reduceState(state);
    if (supportsCustomHighlights(frameWindow)) {
      renderCommentHighlights(frameDocument, frameWindow, reduced.threads);
    } else {
      reduced.threads.forEach((thread, index) => {
        if (thread.root.deleted) {
          return;
        }
        const className = thread.status === "resolved" ? "html-collab-mark-resolved" : "html-collab-mark-open";
        highlightAnchor(frameDocument, thread.anchor, thread.threadId, String(index + 1), className);
      });
    }
    reduced.edits.forEach((edit, index) => {
      if (edit.status === "deleted") {
        return;
      }
      const className = "html-collab-edit-" + edit.status + " html-collab-edit-" + edit.kind;
      highlightEdit(frameDocument, edit, String(index + 1), className);
    });
  }

  function installHighlightStyles(frameDocument) {
    if (frameDocument.getElementById("html-collab-highlight-styles")) {
      return;
    }

    const style = frameDocument.createElement("style");
    style.id = "html-collab-highlight-styles";
    style.textContent = [
      "mark[data-html-collab-thread]{padding:0;border-radius:2px;cursor:pointer;color:inherit;}",
      "mark.html-collab-mark-open{background:#fff08a;box-shadow:inset 0 0 0 1px rgba(184,134,11,.22);}",
      "mark.html-collab-mark-resolved{background:#dbeafe;box-shadow:inset 0 0 0 1px rgba(37,99,235,.18);}",
      "mark[data-html-collab-edit]{padding:0;border-radius:2px;cursor:pointer;color:inherit;box-shadow:inset 0 0 0 1px rgba(22,101,52,.2);}",
      "mark.html-collab-edit-open{background:#dcfce7;}",
      "mark.html-collab-edit-accepted{background:#bbf7d0;}",
      "mark.html-collab-edit-rejected{background:#f1f5f9;color:#64748b;text-decoration:line-through;}",
      "mark.html-collab-edit-delete{text-decoration:line-through;text-decoration-thickness:2px;}",
      "html{overflow-anchor:none;}",
      ".html-collab-edit-original{text-decoration:line-through;text-decoration-thickness:2px;color:#64748b;}",
      ".html-collab-edit-inline-replacement{background:#bbf7d0;color:#14532d;text-decoration:none;padding:0;border-radius:2px;}",
      ".html-collab-edit-inline-replacement::before{content:' ';}",
      ".html-collab-edit-preview-replacement{background:#bbf7d0;color:#14532d;text-decoration:none;padding:0;border-radius:2px;}",
      "mark.html-collab-mark-active{outline:2px solid #2563eb;outline-offset:1px;border-radius:2px;animation:html-collab-mark-pulse 1400ms ease-out;}",
      "@keyframes html-collab-mark-pulse{0%{box-shadow:0 0 0 0 rgba(37,99,235,.55);}40%{box-shadow:0 0 0 8px rgba(37,99,235,.15);}100%{box-shadow:0 0 0 0 rgba(37,99,235,0);}}",
      "::highlight(html-collab-open){background-color:#fff08a;}",
      "::highlight(html-collab-resolved){background-color:#dbeafe;}",
      "::highlight(html-collab-active){background-color:#fde047;text-shadow:0 0 0 currentColor;}",
    ].join("");
    frameDocument.head?.appendChild(style);
  }

  function highlightEdit(frameDocument, edit, number, className) {
    if (!edit || !edit.anchor) {
      return false;
    }
    const range = resolveAnchorRange(frameDocument, edit.anchor);
    if (!range) {
      return false;
    }
    return surroundEditRange(frameDocument, range, edit, number, className);
  }

  function highlightAnchor(frameDocument, anchor, threadId, number, className) {
    const range = resolveAnchorRange(frameDocument, anchor);
    if (!range) {
      return false;
    }
    return surroundRange(frameDocument, range, threadId, number, className);
  }

  function rangeMatchesQuote(rangeText, quote) {
    if (typeof quote !== "string" || quote.length === 0) {
      return true;
    }
    if (rangeText === quote) {
      return true;
    }
    const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
    const normalizedQuote = normalize(quote);
    return normalizedQuote.length > 0 && normalize(rangeText) === normalizedQuote;
  }

  function resolveAnchorRange(frameDocument, anchor) {
    if (!anchor) {
      return null;
    }
    if (anchor.position) {
      const byOffset = rangeFromOffsets(frameDocument, anchor.position.start, anchor.position.end, anchor.quote);
      if (byOffset) {
        return byOffset;
      }
    }
    return rangeFromQuote(frameDocument, anchor);
  }

  function rangeFromOffsets(frameDocument, start, end, quote) {
    if (end <= start) {
      return null;
    }

    const body = frameDocument.body;
    const range = frameDocument.createRange();
    let offset = 0;
    let foundStart = false;
    let foundEnd = false;
    const walker = renderedTextWalker(frameDocument, body);
    let node = walker.nextNode();
    while (node) {
      const nextOffset = offset + node.textContent.length;
      if (!foundStart && start >= offset && start <= nextOffset) {
        range.setStart(node, start - offset);
        foundStart = true;
      }
      if (foundStart && end >= offset && end <= nextOffset) {
        range.setEnd(node, end - offset);
        foundEnd = true;
        break;
      }
      offset = nextOffset;
      node = walker.nextNode();
    }

    if (!foundStart || !foundEnd || range.collapsed) {
      return null;
    }
    if (!rangeMatchesQuote(range.toString(), quote)) {
      return null;
    }
    return range;
  }

  function rangeFromQuote(frameDocument, anchor) {
    const rawQuote = anchor && typeof anchor === "object" ? anchor.quote : anchor;
    const needle = (rawQuote || "").trim();
    if (!needle) {
      return null;
    }

    const fullText = renderedTextContent(frameDocument.body);
    const lowerFull = fullText.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const prefix = (anchor && typeof anchor === "object" && anchor.prefix ? anchor.prefix : "").toLowerCase();
    const suffix = (anchor && typeof anchor === "object" && anchor.suffix ? anchor.suffix : "").toLowerCase();

    let bestIndex = -1;
    let bestScore = -1;
    let from = lowerFull.indexOf(lowerNeedle);
    while (from !== -1) {
      let score = 0;
      if (prefix) {
        const before = lowerFull.slice(Math.max(0, from - prefix.length), from);
        score += commonSuffixLength(before, prefix);
      }
      if (suffix) {
        const afterStart = from + lowerNeedle.length;
        const after = lowerFull.slice(afterStart, afterStart + suffix.length);
        score += commonPrefixLength(after, suffix);
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = from;
      }
      from = lowerFull.indexOf(lowerNeedle, from + 1);
    }

    if (bestIndex === -1) {
      return null;
    }
    return rangeFromOffsets(frameDocument, bestIndex, bestIndex + needle.length, rawQuote);
  }

  function commonPrefixLength(a, b) {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a[i] === b[i]) {
      i += 1;
    }
    return i;
  }

  function commonSuffixLength(a, b) {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) {
      i += 1;
    }
    return i;
  }

  function supportsCustomHighlights(frameWindow) {
    return !!(
      frameWindow &&
      frameWindow.CSS &&
      frameWindow.CSS.highlights &&
      typeof frameWindow.Highlight === "function"
    );
  }

  function renderCommentHighlights(frameDocument, frameWindow, threads) {
    const open = new frameWindow.Highlight();
    const resolved = new frameWindow.Highlight();
    commentRangeIndex = [];

    threads.forEach((thread) => {
      if (thread.root.deleted) {
        return;
      }
      const range = resolveAnchorRange(frameDocument, thread.anchor);
      if (!range) {
        return;
      }
      (thread.status === "resolved" ? resolved : open).add(range);
      commentRangeIndex.push({ threadId: thread.threadId, range });
    });

    const registry = frameWindow.CSS.highlights;
    registry.set("html-collab-open", open);
    registry.set("html-collab-resolved", resolved);
    if (!activeHighlight) {
      activeHighlight = new frameWindow.Highlight();
    }
    registry.set("html-collab-active", activeHighlight);

    bindCommentClick(frameDocument);
  }

  function clearCommentHighlights(frameWindow) {
    commentRangeIndex = [];
    if (!frameWindow || !frameWindow.CSS || !frameWindow.CSS.highlights) {
      return;
    }
    frameWindow.CSS.highlights.delete("html-collab-open");
    frameWindow.CSS.highlights.delete("html-collab-resolved");
    if (activeHighlight) {
      activeHighlight.clear();
    }
  }

  function bindCommentClick(frameDocument) {
    if (frameDocument.__htmlCollabCommentClickBound) {
      return;
    }
    frameDocument.__htmlCollabCommentClickBound = true;
    frameDocument.addEventListener("click", (event) => {
      if (!commentRangeIndex.length) {
        return;
      }
      const point = caretPointFromPoint(frameDocument, event.clientX, event.clientY);
      if (!point || !point.node) {
        return;
      }
      for (const entry of commentRangeIndex) {
        try {
          if (entry.range.isPointInRange(point.node, point.offset)) {
            focusThread(entry.threadId);
            return;
          }
        } catch {
          // range may be detached after a DOM change; skip it
        }
      }
    });
  }

  function caretPointFromPoint(frameDocument, x, y) {
    if (typeof frameDocument.caretPositionFromPoint === "function") {
      const position = frameDocument.caretPositionFromPoint(x, y);
      if (position) {
        return { node: position.offsetNode, offset: position.offset };
      }
    }
    if (typeof frameDocument.caretRangeFromPoint === "function") {
      const range = frameDocument.caretRangeFromPoint(x, y);
      if (range) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }
    return null;
  }

  function scrollRangeIntoView(frameWindow, range) {
    const rect = range.getBoundingClientRect();
    if (rect && (rect.height || rect.width)) {
      const targetY = frameWindow.scrollY + rect.top - frameWindow.innerHeight / 2 + rect.height / 2;
      frameWindow.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      return;
    }
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function pulseRange(frameWindow, range) {
    if (!activeHighlight) {
      return;
    }
    activeHighlight.clear();
    activeHighlight.add(range);
    frameWindow.setTimeout(() => activeHighlight.clear(), 1400);
  }

  function surroundRange(frameDocument, range, threadId, number, className) {
    const mark = frameDocument.createElement("mark");
    mark.dataset.htmlCollabThread = threadId;
    mark.dataset.htmlCollabNumber = number;
    mark.className = className;
    mark.addEventListener("click", () => focusThread(threadId));

    try {
      range.surroundContents(mark);
      return true;
    } catch {
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
      return true;
    }
  }

  function surroundEditRange(frameDocument, range, edit, number, className) {
    const mark = frameDocument.createElement("mark");
    mark.dataset.htmlCollabEdit = edit.editId;
    mark.dataset.htmlCollabNumber = number;
    mark.dataset.htmlCollabOriginal = range.toString();
    if (edit.replacement) {
      mark.dataset.htmlCollabReplacement = edit.replacement;
    }
    mark.className = className;
    mark.addEventListener("click", () => focusEdit(edit.editId));

    try {
      const contents = range.extractContents();
      appendTrackedEditContents(frameDocument, mark, contents, edit);
      range.insertNode(mark);
      return true;
    } catch {
      return false;
    }
  }

  function appendTrackedEditContents(frameDocument, mark, contents, edit) {
    if (editViewMode === "preview" && edit.status !== "rejected") {
      appendPreviewEditContents(frameDocument, mark, contents, edit);
      return;
    }

    if (edit.kind === "replace") {
      const original = frameDocument.createElement("del");
      original.className = "html-collab-edit-original";
      original.appendChild(contents);
      mark.appendChild(original);
      appendInlineReplacement(frameDocument, mark, edit.replacement || "");
      return;
    }

    mark.appendChild(contents);
    if (edit.kind === "insert") {
      appendInlineReplacement(frameDocument, mark, edit.replacement || "");
    }
  }

  function appendInlineReplacement(frameDocument, mark, text) {
    const replacement = frameDocument.createElement("ins");
    replacement.className = "html-collab-edit-inline-replacement";
    replacement.textContent = text;
    mark.appendChild(replacement);
  }

  function appendPreviewEditContents(frameDocument, mark, contents, edit) {
    if (edit.kind === "replace") {
      const replacement = frameDocument.createElement("span");
      replacement.className = "html-collab-edit-preview-replacement";
      replacement.textContent = edit.replacement || "";
      mark.appendChild(replacement);
      return;
    }

    if (edit.kind === "insert") {
      mark.appendChild(contents);
      appendInlineReplacement(frameDocument, mark, edit.replacement || "");
      return;
    }

    mark.textContent = "";
  }

  function renderThreads() {
    const list = document.getElementById("html-collab-thread-list");
    const empty = document.getElementById("html-collab-empty");
    if (!(list instanceof HTMLElement)) {
      return;
    }

    const reduced = reduceState(state);
    list.textContent = "";
    if (empty instanceof HTMLElement) {
      empty.hidden = reduced.threads.length + reduced.edits.length > 0;
    }

    const frame = document.getElementById("html-collab-source-frame");
    const frameDoc = frame instanceof HTMLIFrameElement ? frame.contentDocument : null;
    const docText = frameDoc && frameDoc.body ? frameDoc.body.textContent || "" : "";

    const items = [];
    reduced.threads.forEach((thread) => {
      items.push({
        kind: "thread",
        data: thread,
        position: anchorPosition(thread.anchor, docText),
        createdAt: thread.createdAt,
      });
    });
    reduced.edits.forEach((edit) => {
      items.push({
        kind: "edit",
        data: edit,
        position: anchorPosition(edit.anchor, docText, edit.replacement),
        createdAt: edit.createdAt,
      });
    });

    items.sort((left, right) => {
      const leftPos = left.position == null ? Infinity : left.position;
      const rightPos = right.position == null ? Infinity : right.position;
      if (leftPos !== rightPos) {
        return leftPos - rightPos;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });

    items.forEach((item, index) => {
      const number = index + 1;
      if (item.kind === "thread") {
        list.appendChild(renderThread(item.data, number));
      } else {
        list.appendChild(renderEdit(item.data, number));
      }
    });
  }

  function anchorPosition(anchor, docText, replacement) {
    if (anchor && anchor.position && typeof anchor.position.start === "number") {
      return anchor.position.start;
    }
    if (anchor && typeof anchor.quote === "string" && docText) {
      const index = docText.indexOf(anchor.quote);
      if (index >= 0) {
        return index;
      }
    }
    if (typeof replacement === "string" && docText) {
      const index = docText.indexOf(replacement);
      if (index >= 0) {
        return index;
      }
    }
    return null;
  }

  function renderPanelHeading(text) {
    const heading = document.createElement("h2");
    heading.className = "html-collab-panel-heading";
    heading.textContent = text;
    return heading;
  }

  function renderThread(thread, number) {
    const article = document.createElement("article");
    article.className = "html-collab-thread";
    article.id = threadElementId(thread.threadId);
    article.dataset.threadId = thread.threadId;
    article.addEventListener("click", (event) => {
      if (isInteractiveClickTarget(event.target)) {
        return;
      }
      setThreadHash(thread.threadId);
      scrollToAnchor(thread.threadId);
    });

    const header = document.createElement("div");
    header.className = "html-collab-thread-header";

    const quote = document.createElement("blockquote");
    quote.className = "html-collab-thread-quote";
    quote.textContent = thread.anchor.quote;

    const pin = document.createElement("div");
    pin.className = "html-collab-thread-pin";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "html-collab-thread-number";
    button.textContent = String(number);
    button.addEventListener("click", () => {
      setThreadHash(thread.threadId);
      scrollToAnchor(thread.threadId);
    });

    const status = document.createElement("span");
    status.className = "html-collab-thread-status";
    status.textContent = thread.status;

    pin.append(button, status);
    header.append(quote, pin);
    article.appendChild(header);

    article.appendChild(renderMessage(thread.root, "comment"));
    thread.replies.forEach((reply) => article.appendChild(renderMessage(reply, "reply")));

    const replyBlock = document.createElement("div");
    replyBlock.className = "html-collab-thread-reply";

    const reply = document.createElement("textarea");
    reply.className = "html-collab-reply-body";
    reply.rows = 1;
    reply.placeholder = "Reply";
    reply.addEventListener("input", () => {
      reply.style.height = "auto";
      reply.style.height = reply.scrollHeight + "px";
    });

    const replyActions = document.createElement("div");
    replyActions.className = "html-collab-thread-actions";

    const replyButton = document.createElement("button");
    replyButton.type = "button";
    replyButton.textContent = "Reply";
    replyButton.addEventListener("click", () => {
      const body = reply.value.trim();
      if (!body) {
        return;
      }
      const op = addOp("reply.create", { threadId: thread.threadId, parentId: thread.root.messageId }, { body });
      if (!op) {
        return;
      }
      reply.value = "";
      renderThreads();
      setStatus("Reply added");
    });

    const resolveButton = document.createElement("button");
    resolveButton.type = "button";
    resolveButton.textContent = thread.status === "resolved" ? "Reopen" : "Resolve";
    resolveButton.addEventListener("click", () => {
      const op = addOp(thread.status === "resolved" ? "thread.reopen" : "thread.resolve", { threadId: thread.threadId }, {});
      if (!op) {
        return;
      }
      refreshHighlights();
      renderThreads();
      setStatus(thread.status === "resolved" ? "Thread reopened" : "Thread resolved");
    });

    replyActions.append(replyButton, resolveButton);
    replyBlock.append(reply, replyActions);
    article.appendChild(replyBlock);
    return article;
  }

  function renderEdit(edit, number) {
    const article = document.createElement("article");
    article.className = "html-collab-thread html-collab-edit-suggestion";
    article.id = editElementId(edit.editId);
    article.dataset.editId = edit.editId;
    article.addEventListener("click", (event) => {
      if (isInteractiveClickTarget(event.target)) {
        return;
      }
      setEditHash(edit.editId);
      scrollToEdit(edit.editId);
    });

    const header = document.createElement("div");
    header.className = "html-collab-thread-header";

    const quote = document.createElement("blockquote");
    quote.className = "html-collab-thread-quote";
    quote.textContent = edit.anchor.quote;

    const pin = document.createElement("div");
    pin.className = "html-collab-thread-pin";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "html-collab-thread-number";
    button.textContent = "E" + number;
    button.addEventListener("click", () => {
      setEditHash(edit.editId);
      scrollToEdit(edit.editId);
    });

    const status = document.createElement("span");
    status.className = "html-collab-thread-status";
    status.textContent = edit.status;

    pin.append(button, status);
    header.append(quote, pin);
    article.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "html-collab-message-meta";
    const actor = state.actors[edit.actorId];
    const author = document.createElement("span");
    author.textContent = (actor?.name || edit.actorId) + " · " + formatTime(edit.createdAt);
    meta.appendChild(author);
    article.appendChild(meta);

    const detail = document.createElement("p");
    detail.className = "html-collab-edit-detail";
    if (edit.kind === "replace") {
      detail.textContent = "Replace with: ";
      const replacement = document.createElement("span");
      replacement.className = "html-collab-edit-replacement";
      replacement.textContent = edit.replacement || "";
      detail.appendChild(replacement);
    } else if (edit.kind === "insert") {
      detail.textContent = "Insert after selection: ";
      const replacement = document.createElement("span");
      replacement.className = "html-collab-edit-replacement";
      replacement.textContent = edit.replacement || "";
      detail.appendChild(replacement);
    } else {
      detail.textContent = "Delete selected text.";
    }
    article.appendChild(detail);

    if (edit.note) {
      const note = document.createElement("p");
      note.className = "html-collab-edit-note";
      note.textContent = edit.note;
      article.appendChild(note);
    }

    if (edit.status === "deleted") {
      return article;
    }

    const actions = document.createElement("div");
    actions.className = "html-collab-thread-actions";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "html-collab-action-secondary";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const op = addOp("edit.delete", { editId: edit.editId }, {});
      if (!op) {
        return;
      }
      refreshHighlights();
      renderThreads();
      setStatus("Edit deleted");
    });
    actions.appendChild(deleteButton);

    if (edit.status === "open") {
      const accept = document.createElement("button");
      accept.type = "button";
      accept.textContent = "Accept";
      accept.addEventListener("click", () => {
        const op = addOp("edit.accept", { editId: edit.editId }, {});
        if (!op) {
          return;
        }
        refreshHighlights();
        renderThreads();
        setStatus("Edit accepted");
      });

      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => {
        const op = addOp("edit.reject", { editId: edit.editId }, {});
        if (!op) {
          return;
        }
        refreshHighlights();
        renderThreads();
        setStatus("Edit rejected");
      });

      actions.append(accept, reject);
    }

    article.appendChild(actions);
    return article;
  }

  function renderMessage(message, type) {
    const wrapper = document.createElement("div");
    wrapper.className = "html-collab-message";

    const meta = document.createElement("div");
    meta.className = "html-collab-message-meta";
    const actor = state.actors[message.actorId];
    const author = document.createElement("span");
    author.textContent = (actor?.name || message.actorId) + " · " + formatTime(message.createdAt);
    meta.appendChild(author);

    if (!message.deleted) {
      const deleteLink = document.createElement("button");
      deleteLink.type = "button";
      deleteLink.className = "html-collab-action-secondary";
      deleteLink.textContent = "Delete";
      deleteLink.addEventListener("click", () => {
        const opType = type === "comment" ? "comment.delete" : "reply.delete";
        const op = addOp(opType, { messageId: message.messageId }, {});
        if (!op) {
          return;
        }
        refreshHighlights();
        renderThreads();
        setStatus(type === "comment" ? "Comment deleted" : "Reply deleted");
      });
      meta.appendChild(deleteLink);
    }

    const body = document.createElement("p");
    body.textContent = message.deleted ? "Deleted" : message.body;
    if (message.deleted) {
      body.className = "html-collab-message-deleted";
    }

    wrapper.append(meta, body);
    return wrapper;
  }

  function focusThread(threadId) {
    const thread = document.getElementById(threadElementId(threadId));
    if (thread instanceof HTMLElement) {
      thread.scrollIntoView({ block: "nearest" });
      thread.classList.add("html-collab-thread-active");
      window.setTimeout(() => thread.classList.remove("html-collab-thread-active"), 1200);
    }
  }

  function focusEdit(editId) {
    const edit = document.getElementById(editElementId(editId));
    if (edit instanceof HTMLElement) {
      edit.scrollIntoView({ block: "nearest" });
      edit.classList.add("html-collab-thread-active");
      window.setTimeout(() => edit.classList.remove("html-collab-thread-active"), 1200);
    }
  }

  function scrollToAnchor(threadId) {
    const frame = getFrame();
    const frameDocument = frame.contentDocument;
    const mark = frameDocument?.querySelector('[data-html-collab-thread="' + cssEscape(threadId) + '"]');
    if (mark && typeof mark.scrollIntoView === "function") {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      pulseMark(mark);
      return;
    }
    const entry = commentRangeIndex.find((item) => item.threadId === threadId);
    if (entry && frame.contentWindow) {
      scrollRangeIntoView(frame.contentWindow, entry.range);
      pulseRange(frame.contentWindow, entry.range);
    }
  }

  function scrollToEdit(editId) {
    const frameDocument = getFrame().contentDocument;
    const mark = frameDocument?.querySelector('[data-html-collab-edit="' + cssEscape(editId) + '"]');
    if (mark && typeof mark.scrollIntoView === "function") {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      pulseMark(mark);
    }
  }

  function pulseMark(mark) {
    if (!mark || !mark.classList) {
      return;
    }
    mark.classList.remove("html-collab-mark-active");
    void mark.offsetWidth;
    mark.classList.add("html-collab-mark-active");
    window.setTimeout(() => mark.classList.remove("html-collab-mark-active"), 1400);
  }

  function addOp(type, target, payload) {
    const actor = ensureActor();
    if (!actor) {
      return null;
    }
    const clock = nextClock();
    const op = {
      opId: actor.actorId + ":" + nextActorCounter(actor.actorId),
      actorId: actor.actorId,
      time: new Date().toISOString(),
      clock,
      type,
      target,
      payload,
    };
    state.ops.push(op);
    persistState();
    void requestAutosave({ automatic: true });
    return op;
  }

  function ensureActor() {
    const name = currentReviewerName() || promptReviewerName();
    if (!name) {
      setStatus("Enter your name to continue");
      return null;
    }
    localStorage.setItem("html-collab.reviewerName", name);

    const key = ACTOR_STORAGE_PREFIX + state.docId;
    let actorId = localStorage.getItem(key);
    if (!actorId) {
      actorId = createId("actor");
      localStorage.setItem(key, actorId);
    }

    const actor = state.actors[actorId] || {
      actorId,
      name,
      createdAt: new Date().toISOString(),
    };
    actor.name = name;
    state.actors[actorId] = actor;
    return actor;
  }

  function currentReviewerName() {
    const input = document.getElementById("html-collab-reviewer");
    if (input instanceof HTMLInputElement && input.value.trim()) {
      return input.value.trim();
    }
    return "";
  }

  function promptReviewerName() {
    const input = document.getElementById("html-collab-reviewer");
    const suggested = input instanceof HTMLInputElement ? input.value.trim() : "";
    const name = window.prompt("Enter your name for this review", suggested);
    const trimmed = name?.trim() || "";
    if (!trimmed) {
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
      return "";
    }
    if (input instanceof HTMLInputElement) {
      input.value = trimmed;
    }
    return trimmed;
  }

  function nextClock() {
    return state.ops.reduce((max, op) => Math.max(max, Number(op.clock) || 0), 0) + 1;
  }

  function nextActorCounter(actorId) {
    let max = 0;
    for (const op of state.ops) {
      if (typeof op.opId !== "string" || !op.opId.startsWith(actorId + ":")) {
        continue;
      }
      const value = Number(op.opId.slice(actorId.length + 1));
      if (Number.isFinite(value)) {
        max = Math.max(max, value);
      }
    }
    return max + 1;
  }

  function persistState(options = {}) {
    writeJsonScript(STATE_SCRIPT_ID, state);
    if (options.autosave !== false) {
      scheduleAutosave();
    }
  }

  async function requestAutosave(options = {}) {
    if (autosaveEnabled && autosaveHandle) {
      await autosaveNow();
      return;
    }
    if (autosavePromptInFlight || (options.automatic && autosavePrompted)) {
      return;
    }

    if (typeof window.showSaveFilePicker !== "function") {
      setStatus("Autosave needs a Chromium browser; changes are only in this tab");
      return;
    }

    try {
      autosavePrompted = true;
      autosavePromptInFlight = true;
      setStatus(options.automatic ? "Choose where to save this local review file" : "Choose a local review file to keep changes");
      const handle = await window.showSaveFilePicker({
        suggestedName: reviewFilename(),
        types: [
          {
            description: "HTML review file",
            accept: { "text/html": [".html"] },
          },
        ],
      });
      await assertAutosaveTarget(handle);
      autosaveHandle = handle;
      autosaveEnabled = true;
      updateAutosaveButton();
      persistState({ autosave: false });
      await autosaveNow();
    } catch (error) {
      autosaveEnabled = false;
      autosaveHandle = null;
      updateAutosaveButton();
      if (error?.name === "AbortError") {
        setStatus("Autosave not enabled; choose a local review file before closing this tab");
      } else {
        setStatus("Autosave failed: " + errorMessage(error));
      }
    } finally {
      autosavePromptInFlight = false;
    }
  }

  async function assertAutosaveTarget(handle) {
    if (!handle || typeof handle.getFile !== "function") {
      return;
    }

    const file = await handle.getFile();
    if (!file || file.size === 0) {
      return;
    }

    const existingHtml = await file.text();
    const existingState = parseJsonScriptFromHtml(existingHtml, STATE_SCRIPT_ID);
    if (existingState.docId !== state.docId || existingState.sourceFingerprint !== state.sourceFingerprint) {
      throw new Error("selected file is a different review");
    }
  }

  function scheduleAutosave() {
    if (!autosaveEnabled || !autosaveHandle) {
      return;
    }
    if (autosaveTimer) {
      window.clearTimeout(autosaveTimer);
    }
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = 0;
      autosaveNow();
    }, AUTOSAVE_DELAY_MS);
  }

  async function autosaveNow() {
    if (!autosaveEnabled || !autosaveHandle) {
      return;
    }
    if (autosaveInFlight) {
      autosaveQueued = true;
      return;
    }

    autosaveInFlight = true;
    updateAutosaveButton();
    try {
      const mergeResult = await mergeAutosaveTarget();
      const writable = await autosaveHandle.createWritable();
      await writable.write(serializeReviewHtml());
      await writable.close();
      if (mergeResult.addedOps > 0 || mergeResult.addedActors > 0) {
        setStatus(
          "Merged " +
            mergeResult.addedOps +
            " synced ops and autosaved " +
            shortTime(new Date()),
        );
      } else {
        setStatus("Autosaved " + shortTime(new Date()));
      }
    } catch (error) {
      autosaveEnabled = false;
      autosaveHandle = null;
      autosaveQueued = false;
      setStatus("Autosave failed: " + errorMessage(error));
    } finally {
      autosaveInFlight = false;
      updateAutosaveButton();
      if (autosaveQueued && autosaveEnabled) {
        autosaveQueued = false;
        scheduleAutosave();
      }
    }
  }

  async function mergeAutosaveTarget() {
    if (!autosaveHandle || typeof autosaveHandle.getFile !== "function") {
      return { addedOps: 0, addedActors: 0 };
    }

    const file = await autosaveHandle.getFile();
    if (!file || file.size === 0) {
      return { addedOps: 0, addedActors: 0 };
    }

    const existingHtml = await file.text();
    const existingState = parseJsonScriptFromHtml(existingHtml, STATE_SCRIPT_ID);
    const result = mergeImportedState(existingState);
    if (result.addedOps > 0 || result.addedActors > 0) {
      writeJsonScript(STATE_SCRIPT_ID, state);
      refreshHighlights();
      renderThreads();
    }
    return result;
  }

  function serializeReviewHtml() {
    const html = document.documentElement.cloneNode(true);
    if (html instanceof HTMLElement) {
      const externalRuntime = html.querySelector('script[data-html-collab-runtime="external"]');
      const runtimeSource = window.__HTML_COLLAB_RUNTIME_SOURCE__;
      if (externalRuntime instanceof HTMLScriptElement && typeof runtimeSource === "string") {
        externalRuntime.removeAttribute("src");
        externalRuntime.removeAttribute("data-html-collab-runtime");
        externalRuntime.textContent = "\n" + runtimeSource + "\n  ";
      }
      return "<!doctype html>\n" + html.outerHTML;
    }
    return "<!doctype html>\n" + document.documentElement.outerHTML;
  }

  function downloadReviewFile() {
    const blob = new Blob([serializeReviewHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reviewFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Review file exported");
  }

  function updateAutosaveButton() {
    const button = document.getElementById("html-collab-autosave");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.textContent = autosaveInFlight ? "Autosaving" : autosaveEnabled ? "Autosave On" : "Autosave";
    button.setAttribute("aria-pressed", autosaveEnabled ? "true" : "false");
    button.title = autosaveEnabled ? "Autosave is writing feedback to the selected local review file" : "Choose a local review file. Until then changes live only in this tab";
  }

  async function mergeSelectedFiles(input) {
    if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
      return;
    }

    let addedOps = 0;
    let addedActors = 0;
    let rejected = 0;

    for (const file of Array.from(input.files)) {
      try {
        const importedHtml = await file.text();
        const importedState = parseJsonScriptFromHtml(importedHtml, STATE_SCRIPT_ID);
        const result = mergeImportedState(importedState);
        addedOps += result.addedOps;
        addedActors += result.addedActors;
      } catch {
        rejected += 1;
      }
    }

    input.value = "";
    persistState();
    refreshHighlights();
    renderThreads();

    const message = rejected > 0
      ? "Merged " + addedOps + " ops; rejected " + rejected + " file" + (rejected === 1 ? "" : "s")
      : "Merged " + addedOps + " ops";
    setStatus(message + (addedActors > 0 ? " from " + addedActors + " reviewer" + (addedActors === 1 ? "" : "s") : ""));
  }

  function mergeImportedState(importedState) {
    if (!importedState || importedState.docId !== state.docId) {
      throw new Error("docId mismatch");
    }
    if (importedState.sourceFingerprint !== state.sourceFingerprint) {
      throw new Error("source fingerprint mismatch");
    }

    let addedOps = 0;
    let addedActors = 0;
    const existingOps = new Set(state.ops.map((op) => op.opId));

    for (const [actorId, actor] of Object.entries(importedState.actors || {})) {
      if (!state.actors[actorId]) {
        addedActors += 1;
        state.actors[actorId] = actor;
      }
    }

    for (const op of importedState.ops || []) {
      if (!op || typeof op.opId !== "string" || existingOps.has(op.opId)) {
        continue;
      }
      state.ops.push(op);
      existingOps.add(op.opId);
      addedOps += 1;
    }

    state.ops.sort(compareOps);
    return { addedOps, addedActors };
  }

  function parseJsonScriptFromHtml(html, id) {
    const pattern = /<script\b[^>]*>/gi;
    let match = pattern.exec(html);
    while (match) {
      const openTag = match[0];
      if (new RegExp("\\bid\\s*=\\s*([\"'])" + escapeRegExp(id) + "\\1", "i").test(openTag)) {
        const contentStart = match.index + openTag.length;
        const closeIndex = html.indexOf("<" + "/script>", contentStart);
        if (closeIndex === -1) {
          throw new Error("Missing closing script for " + id);
        }
        return JSON.parse(html.slice(contentStart, closeIndex));
      }
      match = pattern.exec(html);
    }
    throw new Error("Missing " + id);
  }

  function openBriefModal() {
    const modal = document.getElementById("html-collab-brief-modal");
    const body = document.getElementById("html-collab-brief-body");
    if (!modal || !body) {
      return;
    }
    body.textContent = renderMarkdownBrief();
    resetBriefCopyButton();
    modal.hidden = false;
    setStatus("Brief ready — copy or download");
  }

  function closeBriefModal() {
    const modal = document.getElementById("html-collab-brief-modal");
    if (modal) {
      modal.hidden = true;
    }
  }

  function resetBriefCopyButton() {
    const button = document.getElementById("html-collab-brief-copy");
    if (button instanceof HTMLButtonElement) {
      button.textContent = "Copy";
      button.classList.remove("is-success");
      button.disabled = false;
    }
  }

  function copyBriefToClipboard() {
    const brief = renderMarkdownBrief();
    const button = document.getElementById("html-collab-brief-copy");
    const markCopied = () => {
      if (button instanceof HTMLButtonElement) {
        button.textContent = "Copied";
        button.classList.add("is-success");
      }
      setStatus("Brief copied to clipboard");
      window.setTimeout(resetBriefCopyButton, 2400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(brief).then(markCopied).catch(() => copyBriefFallback(brief, markCopied));
      return;
    }
    copyBriefFallback(brief, markCopied);
  }

  function copyBriefFallback(brief, onSuccess) {
    const textarea = document.createElement("textarea");
    textarea.value = brief;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      onSuccess();
    } catch (error) {
      setStatus("Could not copy — try Download .md");
    } finally {
      textarea.remove();
    }
  }

  function downloadReviewBrief() {
    const brief = renderMarkdownBrief();
    const blob = new Blob([brief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = briefFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Brief downloaded");
  }

  function renderMarkdownBrief() {
    const reduced = reduceState(state);
    const reviewers = Object.values(state.actors || {})
      .map((actor) => actor.name)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const openThreads = reduced.threads.filter((thread) => thread.status === "open").length;
    const resolvedThreads = reduced.threads.filter((thread) => thread.status === "resolved").length;
    const openEdits = reduced.edits.filter((edit) => edit.status === "open").length;
    const acceptedEdits = reduced.edits.filter((edit) => edit.status === "accepted").length;
    const rejectedEdits = reduced.edits.filter((edit) => edit.status === "rejected").length;
    const deletedEdits = reduced.edits.filter((edit) => edit.status === "deleted").length;
    const lines = [
      "# Review Brief: " + (state.title || state.docId),
      "",
      "**Reviewers:** " + (reviewers.length ? reviewers.join(", ") : "None"),
      "**Comments:** " + openThreads + " open, " + resolvedThreads + " resolved",
      "**Suggested edits:** " + openEdits + " open, " + acceptedEdits + " accepted, " + rejectedEdits + " rejected, " + deletedEdits + " deleted",
      "",
      "## Comments",
      "",
    ];

    if (reduced.threads.length === 0) {
      lines.push("No comments.", "");
    }

    reduced.threads.forEach((thread, index) => {
      lines.push("### Comment " + (index + 1) + ": " + thread.status);
      lines.push("");
      lines.push("- [Open in review](" + reviewThreadHref(thread.threadId) + ")");
      const location = locationLabel(thread.anchor);
      if (location) {
        lines.push("- Location: " + location);
      }
      lines.push("- ID: " + thread.threadId);
      lines.push("");
      lines.push("Context:");
      lines.push("");
      lines.push("> " + renderAnchorContextMarkdown(thread.anchor));
      lines.push("");
      lines.push("Messages:");
      const messages = [thread.root].concat(thread.replies);
      for (const message of messages) {
        if (!message.deleted) {
          const actor = state.actors[message.actorId]?.name || message.actorId;
          lines.push("- " + actor + ": " + message.body);
        }
      }
      lines.push("");
    });

    lines.push("## Suggested Edits", "");
    if (reduced.edits.length === 0) {
      lines.push("No suggested edits.", "");
    }

    reduced.edits.forEach((edit, index) => {
      lines.push("### Edit " + (index + 1) + ": " + edit.status + " " + edit.kind);
      lines.push("");
      lines.push("- [Open in review](" + reviewEditHref(edit.editId) + ")");
      const location = locationLabel(edit.anchor);
      if (location) {
        lines.push("- Location: " + location);
      }
      const actor = state.actors[edit.actorId]?.name || edit.actorId;
      lines.push("- ID: " + edit.editId);
      lines.push("- Reviewer: " + actor);
      lines.push("");
      lines.push("Context:");
      lines.push("");
      lines.push("> " + renderAnchorContextMarkdown(edit.anchor));
      lines.push("");
      if (edit.kind === "replace") {
        lines.push("Replace with: " + (edit.replacement || ""));
      } else if (edit.kind === "insert") {
        lines.push("Insert after selection: " + (edit.replacement || ""));
      } else {
        lines.push("Delete selected text.");
      }
      if (edit.note) {
        lines.push("Note: " + edit.note);
      }
      lines.push("");
    });

    return lines.join("\n").trimEnd() + "\n";
  }

  function locationLabel(anchor) {
    const path = Array.isArray(anchor.headingPath) ? anchor.headingPath : [];
    const heading = path[path.length - 1];
    if (heading && !sameText(heading, anchor.quote) && !containsText(heading, anchor.quote)) {
      return truncate(heading, 96);
    }
    return "";
  }

  function renderAnchorContextMarkdown(anchor) {
    const prefix = collapseWhitespace(anchor.prefix || "");
    const quote = collapseWhitespace(anchor.quote || "");
    const suffix = collapseWhitespace(anchor.suffix || "");
    const head = prefix ? "…" + escapeMarkdownInline(prefix) + " " : "";
    const tail = suffix ? " " + escapeMarkdownInline(suffix) + "…" : "";
    return head + "**" + escapeMarkdownInline(quote) + "**" + tail;
  }

  function collapseWhitespace(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function truncate(value, max) {
    const collapsed = collapseWhitespace(value);
    if (collapsed.length <= max) {
      return collapsed;
    }
    return collapsed.slice(0, max - 1) + "…";
  }

  function sameText(left, right) {
    return collapseWhitespace(left).toLowerCase() === collapseWhitespace(right).toLowerCase();
  }

  function containsText(haystack, needle) {
    return collapseWhitespace(haystack).toLowerCase().includes(collapseWhitespace(needle).toLowerCase());
  }

  function escapeMarkdownInline(value) {
    return String(value).replace(/([\\\`*_{}\[\]()#+\-!|>])/g, "\\$1");
  }

  function reviewThreadHref(threadId) {
    return reviewFileHref() + "#" + threadElementId(threadId);
  }

  function reviewEditHref(editId) {
    return reviewFileHref() + "#" + editElementId(editId);
  }

  function reviewFileHref() {
    if (location.protocol === "file:" && location.href) {
      return location.href.split("#")[0];
    }
    return reviewFilename();
  }

  function reviewFilename() {
    const title = state.title || "report.html";
    if (title.endsWith(".review.html")) {
      return title;
    }
    if (title.endsWith(".html")) {
      return title.slice(0, -5) + ".review.html";
    }
    return title + ".review.html";
  }

  function briefFilename() {
    const title = state.title || "report.html";
    if (title.endsWith(".review.html")) {
      return title.slice(0, -12) + ".review-brief.md";
    }
    if (title.endsWith(".html")) {
      return title.slice(0, -5) + ".review-brief.md";
    }
    return title + ".review-brief.md";
  }

  function reduceState(reviewState) {
    const unique = new Map();
    for (const op of reviewState.ops || []) {
      if (op && typeof op.opId === "string") {
        unique.set(op.opId, op);
      }
    }
    const ops = Array.from(unique.values()).sort(compareOps);
    const threads = new Map();
    const messages = new Map();
    const edits = new Map();

    for (const op of ops) {
      if (op.type === "comment.create") {
        if (threads.has(op.payload.threadId)) {
          continue;
        }
        const root = {
          messageId: op.opId,
          actorId: op.actorId,
          body: op.payload.body,
          deleted: false,
          createdAt: op.time,
          updatedAt: op.time,
          updateOp: op,
        };
        const thread = {
          threadId: op.payload.threadId,
          status: "open",
          anchor: op.target,
          root,
          replies: [],
          createdAt: op.time,
          statusOp: null,
        };
        threads.set(thread.threadId, thread);
        messages.set(root.messageId, root);
      } else if (op.type === "edit.suggest") {
        const editId = op.payload.editId;
        if (!editId || edits.has(editId)) {
          continue;
        }
        edits.set(editId, {
          editId,
          status: "open",
          kind: op.payload.kind,
          anchor: op.target,
          replacement: op.payload.replacement,
          note: op.payload.note,
          actorId: op.actorId,
          createdAt: op.time,
          updatedAt: op.time,
          statusOp: null,
        });
      }
    }

    for (const op of ops) {
      if (op.type === "reply.create") {
        const thread = threads.get(op.target.threadId);
        if (!thread) continue;
        const reply = {
          messageId: op.opId,
          actorId: op.actorId,
          body: op.payload.body,
          deleted: false,
          createdAt: op.time,
          updatedAt: op.time,
          updateOp: op,
        };
        thread.replies.push(reply);
        messages.set(reply.messageId, reply);
      } else if (op.type === "comment.edit" || op.type === "reply.edit") {
        const message = messages.get(op.target.messageId);
        if (message && compareOps(message.updateOp, op) <= 0) {
          message.body = op.payload.body;
          message.updatedAt = op.time;
          message.updateOp = op;
        }
      } else if (op.type === "comment.delete" || op.type === "reply.delete") {
        const message = messages.get(op.target.messageId);
        if (message && compareOps(message.updateOp, op) <= 0) {
          message.deleted = true;
          message.updatedAt = op.time;
          message.updateOp = op;
        }
      } else if (op.type === "thread.resolve" || op.type === "thread.reopen") {
        const thread = threads.get(op.target.threadId);
        if (thread && (!thread.statusOp || compareOps(thread.statusOp, op) <= 0)) {
          thread.status = op.type === "thread.resolve" ? "resolved" : "open";
          thread.statusOp = op;
        }
      } else if (op.type === "edit.accept" || op.type === "edit.reject" || op.type === "edit.delete") {
        const edit = edits.get(op.target.editId);
        if (edit && (!edit.statusOp || compareOps(edit.statusOp, op) <= 0)) {
          edit.status = op.type === "edit.accept" ? "accepted" : op.type === "edit.reject" ? "rejected" : "deleted";
          edit.updatedAt = op.time;
          edit.statusOp = op;
        }
      }
    }

    return {
      threads: Array.from(threads.values()).sort((left, right) => {
        const created = left.createdAt.localeCompare(right.createdAt);
        return created || left.threadId.localeCompare(right.threadId);
      }),
      edits: Array.from(edits.values()).sort((left, right) => {
        const created = left.createdAt.localeCompare(right.createdAt);
        return created || left.editId.localeCompare(right.editId);
      }),
    };
  }

  function compareOps(left, right) {
    if ((left.clock || 0) !== (right.clock || 0)) {
      return (left.clock || 0) - (right.clock || 0);
    }
    const time = String(left.time || "").localeCompare(String(right.time || ""));
    if (time !== 0) {
      return time;
    }
    return String(left.opId || "").localeCompare(String(right.opId || ""));
  }

  function createId(prefix) {
    if (crypto.randomUUID) {
      return prefix + "-" + crypto.randomUUID();
    }
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function threadElementId(threadId) {
    return "html-collab-thread-" + encodeURIComponent(threadId);
  }

  function editElementId(editId) {
    return "html-collab-edit-" + encodeURIComponent(editId);
  }

  function setThreadHash(threadId) {
    const hash = "#" + threadElementId(threadId);
    if (location.hash !== hash && history.replaceState) {
      try {
        history.replaceState(null, "", hash);
      } catch {
        location.hash = hash;
      }
    }
  }

  function setEditHash(editId) {
    const hash = "#" + editElementId(editId);
    if (location.hash !== hash && history.replaceState) {
      try {
        history.replaceState(null, "", hash);
      } catch {
        location.hash = hash;
      }
    }
  }

  function focusFromLocationHash() {
    const editId = editIdFromHash(location.hash);
    if (editId) {
      focusEdit(editId);
      scrollToEdit(editId);
      return;
    }

    const threadId = threadIdFromHash(location.hash);
    if (!threadId) {
      return;
    }
    focusThread(threadId);
    scrollToAnchor(threadId);
  }

  function threadIdFromHash(hash) {
    const prefix = "#html-collab-thread-";
    if (!hash || !hash.startsWith(prefix)) {
      return null;
    }
    const encoded = hash.slice(prefix.length);
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  function editIdFromHash(hash) {
    const prefix = "#html-collab-edit-";
    if (!hash || !hash.startsWith(prefix)) {
      return null;
    }
    const encoded = hash.slice(prefix.length);
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) {
      return CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function shortTime(date) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function errorMessage(error) {
    if (error && typeof error.message === "string" && error.message) {
      return error.message;
    }
    return "unknown error";
  }

  function setStatus(message) {
    const status = document.getElementById("html-collab-status");
    if (status instanceof HTMLElement) {
      status.textContent = message;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;
