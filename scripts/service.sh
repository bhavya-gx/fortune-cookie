#!/bin/zsh
# Run the bot in the background: starts at login, restarts if it crashes.
#   npm run service:install    install and start
#   npm run service:uninstall  stop and remove
#   npm run service:restart    restart (after editing .env)
# Before installing, give node Full Disk Access (the path is printed below).
set -e
LABEL=com.fortunecookie.bot
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
TARGET="gui/$(id -u)"

case "$1" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$DIR/data"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file-if-exists=.env</string>
    <string>src/mac.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$DIR/data/bot.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/bot.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "$TARGET/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$TARGET" "$PLIST"
    echo "🥠 Installed. Logs: $DIR/data/bot.log"
    echo "Give this file Full Disk Access if you have not: $(readlink -f "$NODE")"
    ;;
  uninstall)
    launchctl bootout "$TARGET/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "🥠 Removed."
    ;;
  restart)
    launchctl kickstart -k "$TARGET/$LABEL"
    echo "🥠 Restarted."
    ;;
  *)
    launchctl print "$TARGET/$LABEL" 2>/dev/null | grep -m1 -E "^\s*state" || echo "not installed"
    ;;
esac
