# VHS tape — generates docs/screenshots/demo.gif
# Usage:  vhs docs/demo.tape

Output docs/screenshots/demo.gif

Set FontSize 14
Set Width 1100
Set Height 620
Set Theme "Dracula"
Set TypingSpeed 25ms
Set PlaybackSpeed 1.0

# --- Scene 1 — flip campaign to autonomous mode + plan ---
Type "pnpm demo"
Sleep 400ms
Enter
Sleep 3500ms

# --- Scene 2 — start watching the pipeline ---
Type "./scripts/demo-watch.sh"
Sleep 300ms
Enter

# Let the watcher render and the workers do their work.
# Items walk planned → script_drafted → script_approved → assets_ready
# → video_generating → video_ready → ready_to_publish → scheduled → published.
Sleep 35s

# --- Done ---
Ctrl+C
Sleep 500ms
