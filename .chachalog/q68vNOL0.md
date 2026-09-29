---
# Allowed version bumps: patch, minor, major
quick-find: patch
---

Content search now matches inside a word, and it ignores letter case and accents. Every word typed has to match, so each word added narrows the result. A term that carries punctuation, such as an exclamation mark or a percent sign, no longer makes the search fail. The search now counts only letters and digits when it decides whether enough has been typed, and the minimum drops from four to three, so a term such as `50%` waits for more input while a three-letter word starts a search.
