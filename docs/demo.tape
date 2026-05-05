# VHS tape — generates docs/screenshots/demo.gif
# Usage:  brew install vhs && vhs docs/demo.tape

Output docs/screenshots/demo.gif

Set FontSize 13
Set Width 1200
Set Height 720
Set Theme "Dracula"
Set TypingSpeed 30ms

# --- Scene 1 — bring up the stack ---
Type "docker compose up -d postgres"
Sleep 500ms
Enter
Sleep 2s

Type "pnpm seed"
Sleep 500ms
Enter
Sleep 2500ms

# --- Scene 2 — kick off the workers in the background ---
Type "pnpm dev:workers &"
Sleep 500ms
Enter
Sleep 2s

# --- Scene 3 — flip to auto + plan a week ---
Type "pnpm demo"
Sleep 500ms
Enter
Sleep 4s

# --- Scene 4 — watch the queue drain ---
Type "watch -n 1 'curl -s localhost:4000/api/content/_meta/counts | jq .counts'"
Sleep 500ms
Enter
Sleep 12s

# done
Type "q"
