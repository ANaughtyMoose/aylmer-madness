// index.html's storage decision, loaded as its own <script type="module"> ahead
// of main.js so it runs before any game module reads a key. See storage-ns.js.
// No flag: the raw player keys, exactly as before. `?review=<name>` or
// `?audioReview=1` or being iframed by a tools/ harness: an isolated namespace.
import { installStorageNamespace } from './storage-ns.js';

installStorageNamespace({ base: '', reviewBase: 'aylmer.review.', audioPrefix: 'aylmer.review.audio.' });
