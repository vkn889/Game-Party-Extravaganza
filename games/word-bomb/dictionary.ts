/**
 * Word Bomb's dictionary: ~270k English words served from /dict/words.txt and
 * loaded only on the host, before the game starts (GameModule.prepare).
 */
let words: Set<string> | null = null;
let loading: Promise<void> | null = null;

export function loadDictionary(url = '/dict/words.txt'): Promise<void> {
  if (words) return Promise.resolve();
  if (!loading) {
    loading = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Dictionary request failed: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        words = new Set(text.split('\n').map((w) => w.trim()).filter(Boolean));
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** For tests and tools: install a dictionary directly. */
export function setDictionary(list: Iterable<string>): void {
  words = new Set(list);
}

export function isWord(word: string): boolean {
  return words?.has(word) ?? false;
}
