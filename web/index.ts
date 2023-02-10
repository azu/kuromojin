import "./kuromoji.patch.js";
import { getTokenizer } from "../src/index";

const DICT_URL = "/dict";
export const loadTokenizer = async () => {
    return await getTokenizer({
        dicPath: DICT_URL
    });
};
export const run = async () => {
    const loadinElement = document.querySelector("#loading") as HTMLDivElement;
    const textElement = document.querySelector("#text") as HTMLTextAreaElement;
    const jsonElement = document.querySelector("#json") as HTMLTextAreaElement;
    loadinElement.textContent = "🤖Loading dictionary...";
    const tokenizer = await loadTokenizer();
    loadinElement.textContent = "🤖Complete loading!";
    setTimeout(() => {
        loadinElement.textContent = "🤖You can tokenize text!";
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
