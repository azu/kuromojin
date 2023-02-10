import * as path from "node:path";
import nodePolyfills from 'vite-plugin-node-stdlib-browser'
const __dirname = path.dirname(new URL(import.meta.url).pathname);
export default {
    plugins: [nodePolyfills()]
};
