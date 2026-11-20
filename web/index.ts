/// <reference types="vite/client" />
import { getTokenizer, Tokenizer } from "../src/index";
// The bundler copies the dictionary of the package into the output and gives its URL.
// The URL keeps the ending `.dict`, which tells kuromojin the format of the dictionary.
import dictionaryUrl from "../dict/kuromojin.dict?url";

export const run = () => {
    const statusElement = document.querySelector("#loading") as HTMLDivElement;
    const textElement = document.querySelector("#text") as HTMLTextAreaElement;
    const jsonElement = document.querySelector("#json") as HTMLTextAreaElement;
    let tokenizer: Tokenizer | undefined;

    const analyze = () => {
        if (tokenizer === undefined) return;
        jsonElement.value = JSON.stringify(tokenizer.tokenizeForSentence(textElement.value), null, 4);
    };

    // the text of the URL
    try {
        textElement.value = decodeURIComponent(location.hash.slice(1));
    } catch {
        // a fragment that is not a percent-encoded text: the field stays empty
    }
    textElement.addEventListener("input", () => {
        history.replaceState(null, "", "#" + encodeURIComponent(textElement.value));
        analyze();
    });

    statusElement.textContent = "Loading the dictionary...";
    getTokenizer({ dicPath: dictionaryUrl }).then(
        (loaded) => {
            tokenizer = loaded;
            statusElement.textContent = "Ready. Type a text to see its tokens.";
            // a text that was typed or taken from the URL before the dictionary was loaded
            analyze();
        },
        (error: Error) => {
            statusElement.textContent = `Failed to load the dictionary: ${error.message}`;
        }
    );
};
