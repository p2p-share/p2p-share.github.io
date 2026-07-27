(() => {
  "use strict";
  globalThis.addEventListener("message", (event) => {
    if (event.source !== globalThis.parent || event.data?.source !== "p2p-preview-run") return;
    const code = typeof event.data.code === "string" ? event.data.code : "";
    const url = globalThis.URL.createObjectURL(new globalThis.Blob([code], { type: "text/javascript" }));
    const script = globalThis.document.createElement("script");
    script.src = url;
    script.addEventListener("load", () => globalThis.URL.revokeObjectURL(url), { once: true });
    script.addEventListener("error", () => globalThis.URL.revokeObjectURL(url), { once: true });
    globalThis.document.body.append(script);
  }, { once: true });
})();
