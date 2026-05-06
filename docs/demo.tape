# VHS tape — generates docs/screenshots/demo.gif
# Usage:  vhs docs/demo.tape

Output docs/screenshots/demo.gif

Set FontSize 14
Set Width 1100
Set Height 620
Set TypingSpeed 25ms
Set PlaybackSpeed 1.0

# Custom paper-and-ink theme matching the dashboard
Set Theme {"name":"social-agent-paper","background":"#f5f1e8","foreground":"#0a0a0a","cursor":"#166534","selection":"#d6cdb8","black":"#0a0a0a","red":"#991b1b","green":"#166534","yellow":"#a16207","blue":"#1e40af","magenta":"#7c2d12","cyan":"#0e7490","white":"#737373","brightBlack":"#737373","brightRed":"#dc2626","brightGreen":"#22c55e","brightYellow":"#ca8a04","brightBlue":"#2563eb","brightMagenta":"#a16207","brightCyan":"#0891b2","brightWhite":"#0a0a0a"}

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
Sleep 35s

# --- Done ---
Ctrl+C
Sleep 500ms
