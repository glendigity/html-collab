const MESSAGE_NAMESPACE = "html-collab-extension";

type Mode = "loading" | "plain" | "review" | "hosted-review" | "blocked" | "error";

type ContentResponse =
  | {
      ok: true;
      mode: "plain" | "review";
      title: string;
      filename: string;
      opCount: number;
      reviewHtml?: string;
      message?: string;
    }
  | {
      ok: false;
      message: string;
    };

const state = {
  tabId: 0,
  mode: "loading" as Mode,
  title: "",
  filename: "",
  opCount: 0,
  message: "Checking this page...",
};

const elements = {
  title: document.getElementById("hc-title"),
  message: document.getElementById("hc-message"),
  start: document.getElementById("hc-start"),
  export: document.getElementById("hc-export"),
  brief: document.getElementById("hc-brief"),
  downloads: document.getElementById("hc-downloads"),
};

document.addEventListener("DOMContentLoaded", () => {
  elements.start?.addEventListener("click", () => runAction("start-review"));
  elements.export?.addEventListener("click", () => runAction("export-review"));
  elements.brief?.addEventListener("click", () => runAction("copy-brief"));
  elements.downloads?.addEventListener("click", () => chrome.downloads.showDefaultFolder());
  void refresh();
});

async function refresh(): Promise<void> {
  setState({ mode: "loading", message: "Checking this page..." });

  try {
    const tab = await activeTab();
    if (!tab.id) {
      setState({ mode: "error", message: "No active tab found." });
      return;
    }
    state.tabId = tab.id;

    if (isReviewHostUrl(tab.url || "")) {
      setState({
        mode: "hosted-review",
        title: tab.title || "html-collab review",
        message: "Review mode is open. Use the page toolbar to comment, copy a brief, or export the review file.",
      });
      return;
    }

    if (isRestrictedUrl(tab.url || "")) {
      setState({
        mode: "blocked",
        message: "Chrome does not allow extensions to run on this page. Open a normal HTML file or web page.",
      });
      return;
    }

    if ((tab.url || "").startsWith("file:") && !(await hasFileAccess())) {
      setState({
        mode: "blocked",
        title: tab.title || "Local HTML file",
        message:
          "Enable file access first: right-click the extension icon, choose Manage Extension, then turn on Allow access to file URLs.",
      });
      return;
    }

    await ensureContentScript(tab.id);
    const response = await sendContentMessage("status");
    applyContentResponse(response);
  } catch (error) {
    setState({
      mode: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAction(type: "start-review" | "export-review" | "copy-brief"): Promise<void> {
  setControlsDisabled(true);
  try {
    const response = await sendContentMessage(type);
    applyContentResponse(response);
  } catch (error) {
    setState({
      mode: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    setControlsDisabled(false);
  }
}

function applyContentResponse(response: ContentResponse): void {
  if (!response.ok) {
    setState({ mode: "error", message: response.message });
    return;
  }

  setState({
    mode: response.mode,
    title: response.title,
    filename: response.filename,
    opCount: response.opCount,
    message:
      response.message ||
      (response.mode === "review"
        ? `${response.opCount} review operation${response.opCount === 1 ? "" : "s"} in this file.`
        : "Ready to turn this page into a reviewable HTML file."),
  });

  if (response.reviewHtml) {
    void openHostedReview(response.reviewHtml);
  }
}

function setState(update: Partial<typeof state>): void {
  Object.assign(state, update);
  render();
}

function render(): void {
  if (elements.title) {
    elements.title.textContent =
      state.mode === "review"
        ? "Review mode"
        : state.mode === "hosted-review"
          ? "Review mode"
        : state.mode === "plain"
          ? "Review this page"
          : "html-collab";
  }

  if (elements.message) {
    const detail = state.filename && state.mode === "review" ? `\nExport: ${state.filename}` : "";
    elements.message.textContent = state.message + detail;
  }

  const isPlain = state.mode === "plain";
  const isReview = state.mode === "review";
  const isHostedReview = state.mode === "hosted-review";
  setHidden(elements.start, !isPlain);
  setHidden(elements.export, !isReview);
  setHidden(elements.brief, !isReview);
  setHidden(elements.downloads, !isReview && !isHostedReview);
}

function setHidden(element: Element | null, hidden: boolean): void {
  if (element instanceof HTMLElement) {
    element.hidden = hidden;
  }
}

function setControlsDisabled(disabled: boolean): void {
  for (const element of [elements.start, elements.export, elements.brief, elements.downloads]) {
    if (element instanceof HTMLButtonElement) {
      element.disabled = disabled;
    }
  }
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tab);
    });
  });
}

async function ensureContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["dist/content.js"],
      },
      () => {
        const message = chrome.runtime.lastError?.message;
        if (message) {
          reject(new Error(message));
          return;
        }
        resolve();
      },
    );
  });
}

async function sendContentMessage(type: "status" | "start-review" | "export-review" | "copy-brief"): Promise<ContentResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      state.tabId,
      {
        namespace: MESSAGE_NAMESPACE,
        type,
      },
      (response) => {
        const message = chrome.runtime.lastError?.message;
        if (message) {
          reject(new Error(message));
          return;
        }
        if (!isContentResponse(response)) {
          reject(new Error("html-collab did not receive a valid response from this page."));
          return;
        }
        resolve(response);
      },
    );
  });
}

async function openHostedReview(reviewHtml: string): Promise<void> {
  try {
    const reviewId = crypto.randomUUID();
    await storePendingReview(reviewId, reviewHtml);
    chrome.tabs.update(state.tabId, {
      url: chrome.runtime.getURL(`review.html?id=${encodeURIComponent(reviewId)}`),
    });
    window.close();
  } catch (error) {
    setState({
      mode: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function storePendingReview(reviewId: string, reviewHtml: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.session.set({ [reviewStorageKey(reviewId)]: reviewHtml }, () => {
      const message = chrome.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }
      resolve();
    });
  });
}

function reviewStorageKey(reviewId: string): string {
  return `html-collab.review.${reviewId}`;
}

async function hasFileAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.extension.isAllowedFileSchemeAccess((isAllowed) => resolve(isAllowed));
  });
}

function isRestrictedUrl(url: string): boolean {
  return /^(chrome|edge|brave|about|chrome-extension):/i.test(url);
}

function isReviewHostUrl(url: string): boolean {
  return url.startsWith(chrome.runtime.getURL("review.html"));
}

function isContentResponse(value: unknown): value is ContentResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === false) {
    return typeof candidate.message === "string";
  }
  return (
    candidate.ok === true &&
    (candidate.mode === "plain" || candidate.mode === "review") &&
    typeof candidate.title === "string" &&
    typeof candidate.filename === "string" &&
    typeof candidate.opCount === "number"
  );
}
