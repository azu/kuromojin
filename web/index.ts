import { getTokenizer } from "../src/index";

// public/dict is a copy of dict/ (npm run cp-public). ?dict=<path> loads another dictionary directory.
const DICT_URL = new URL(new URLSearchParams(location.search).get("dict") ?? "./dict/", location.href).href;
export const loadTokenizer = async () => {
    return await getTokenizer({
        dicPath: DICT_URL
    });
};
export const run = async () => {
    const loadingElement = document.querySelector("#loading") as HTMLDivElement;
    const textElement = document.querySelector("#text") as HTMLTextAreaElement;
    const jsonElement = document.querySelector("#json") as HTMLTextAreaElement;
    loadingElement.textContent = "🤖Loading dictionary... Require DecompressionStream support.";
    const start = performance.now();
    const tokenizer = await loadTokenizer();
    const loadTime = performance.now() - start;
    // for debugging in the console
    Object.assign(window, { kuromojinTokenizer: tokenizer, kuromojinLoadTime: loadTime });
    loadingElement.textContent = `🤖Complete loading! (${Math.round(loadTime)} ms)`;
    setTimeout(() => {
        loadingElement.textContent = "🤖You can tokenize text!";
    }, 1000);
    const onUpdate = (text: string) => {
        try {
            const json = tokenizer.tokenize(text);
            jsonElement.textContent = JSON.stringify(json, null, 4);
            location.hash = encodeURIComponent(text);
        } catch {}
    };

    textElement?.addEventListener("input", () => {
        onUpdate(textElement.value);
    });

    const textFromURL = location.hash;
    if (textFromURL.length > 0) {
        const decodedText = decodeURIComponent(textFromURL.slice(1));
        textElement.value = decodedText;
        onUpdate(decodedText);
    }
};
