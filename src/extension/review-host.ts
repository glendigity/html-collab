const params = new URL(location.href).searchParams;
const reviewId = params.get("id") || "";

void main();

async function main(): Promise<void> {
  if (!reviewId) {
    renderError("Missing review id.");
    return;
  }

  const reviewHtml = await readPendingReview(reviewId);
  if (!reviewHtml) {
    renderError("This pending review was not found. Return to the source page and start review again.");
    return;
  }

  document.open();
  document.write(reviewHtml);
  document.close();
}

async function readPendingReview(id: string): Promise<string> {
  const key = `html-collab.review.${id}`;
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(key, (items) => {
      const message = chrome.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }
      const value = items[key];
      resolve(typeof value === "string" ? value : "");
    });
  });
}

function renderError(message: string): void {
  document.body.innerHTML = "";
  const main = document.createElement("main");
  main.style.cssText = "font: 14px/1.5 system-ui, sans-serif; max-width: 640px; margin: 48px auto; color: #1f2042;";
  const heading = document.createElement("h1");
  heading.textContent = "html-collab";
  const body = document.createElement("p");
  body.textContent = message;
  main.append(heading, body);
  document.body.append(main);
}
