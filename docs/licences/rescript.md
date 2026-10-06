# Rescript

`lib/wordFixes.ts` (correcting a misheard word, `docs/specs/019-editor-light-v2.md` item 2.3) times the
typed words as Rescript's `correctWords` does (`lib/store.ts`): the text is split into words, which share
the old words' span in proportion to their length, the last one ending where the old span ended. Ours
also keeps each word at least 20 ms long, and stores the change as a correction over the transcript
instead of editing the words. Source: https://github.com/wassgha/rescript at `a9b378e^` (`41d14da`, 30 July
2026), the last tree under the MIT licence, read on 6 October 2026.

**Rescript is PolyForm Noncommercial from `a9b378e` on.** Never copy from, or read for code, anything at or
after that commit (or `608c2d4`); see `docs/research/2026-10-05-open-source-editors.md`.

Its licence at `a9b378e^`:

```
MIT License

Copyright (c) 2026 Rescript contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
