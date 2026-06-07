declare namespace chrome {
  namespace downloads {
    function showDefaultFolder(): void;
  }

  namespace extension {
    function isAllowedFileSchemeAccess(callback: (isAllowedAccess: boolean) => void): void;
  }

  namespace runtime {
    const lastError: { message?: string } | undefined;

    function getURL(path: string): string;

    type MessageSender = unknown;

    namespace onMessage {
      function addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    }
  }

  namespace scripting {
    function executeScript(
      details: {
        target: { tabId: number };
        files: string[];
      },
      callback?: () => void,
    ): void;
  }

  namespace tabs {
    type Tab = {
      id?: number;
      title?: string;
      url?: string;
    };

    function query(
      queryInfo: { active: boolean; currentWindow: boolean },
      callback: (tabs: Tab[]) => void,
    ): void;

    function sendMessage(
      tabId: number,
      message: unknown,
      callback?: (response?: unknown) => void,
    ): void;

    function update(tabId: number, updateProperties: { url?: string }, callback?: (tab: Tab) => void): void;
  }

  namespace storage {
    namespace session {
      function get(keys: string | string[], callback: (items: Record<string, unknown>) => void): void;
      function set(items: Record<string, unknown>, callback?: () => void): void;
      function remove(keys: string | string[], callback?: () => void): void;
    }
  }
}
