# Twitter List Quick Add

A simple Chrome extension to quickly add users to Twitter lists while browsing profiles.

## Features

- 📋 **Timeline buttons** - Quick add from your feed
- 👤 **Profile buttons** - Add from profile pages
- ✓ **View current lists** - See which lists users are already on
- ➕➖ **Add & Remove** - Manage list membership with checkboxes
- ⚡ **Smart caching** - 24-hour localStorage cache for instant lookups
- 🛡️ **Rate limiting** - Built-in protection to keep your account safe
- ⚙️ **Safety presets** - Conservative, Balanced, or Aggressive modes
- 🔄 **Multi-select** - Add users to multiple lists at once

## Installation

1. **Open Chrome and go to Extensions**
   - Navigate to `chrome://extensions/`
   - Or click the three dots menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Select this folder (`tw_list`)

4. **Done!**
   - The extension is now active
   - Visit any Twitter/X profile to see the "+ List" button

## How to Use

### From Timeline (Recommended!)
1. Browse your Twitter/X home feed
2. You'll see a 📋 button next to each username in tweets
3. Click it - extension checks which lists they're on (cached after first check)
4. Select/deselect lists with checkboxes
5. Click "Save Changes" to apply

### From Profile Page
1. Go to any Twitter/X profile (e.g., `https://x.com/elonmusk`)
2. You'll see a blue "+ List" button near the Follow button
3. Click it to see your lists with current membership status
4. Check/uncheck boxes to add/remove from lists
5. Click "Save Changes"

### Settings (Click Extension Icon)
**Conservative (Safest)**
- 500ms between requests
- 10 new users per 10 minutes
- Auto quick-mode (skips checking current lists)
- **Best for: Main accounts, minimal risk**

**Balanced (Recommended)**
- 300ms between requests
- 20 new users per 5 minutes
- Manual quick-mode option
- **Best for: Most users, good speed/safety balance**

**Aggressive (Use with caution)**
- 200ms between requests
- 30 new users per 5 minutes
- Optional quick-mode
- **Best for: Power users, test accounts**

## Notes

- This extension uses Twitter's internal APIs (the same ones the website uses)
- It's for personal use and learning purposes
- Make sure you're logged into Twitter/X for it to work
- Your lists are cached during your browsing session

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main logic for detecting profiles and adding users to lists
- `styles.css` - Styling for the button and dropdown
- `README.md` - This file

## Troubleshooting

**Button not appearing?**
- Make sure you're logged into Twitter/X
- Try refreshing the page
- Check the console for debug logs (F12 → Console tab)
- Look for messages starting with `[Twitter List Quick Add]`
- For profile pages: Make sure you're on a user profile (e.g., `x.com/username`)
- For timeline: Scroll and wait a few seconds for tweets to load

**"No lists found" error?**
- Create at least one list on Twitter first
- Go to More → Lists → Create a list
- Refresh the page after creating lists

**Authentication error?**
- Make sure you're logged into Twitter/X
- Try logging out and back in
- Clear your cookies and cache

**Debugging**
- Open the browser console (F12 → Console)
- Look for `[Twitter List Quick Add]` messages
- Check if the extension found your user ID
- Check if lists were fetched successfully
- To disable debug logs, edit `content.js` and set `DEBUG = false`

## Disclaimer

This extension is for educational purposes. It uses Twitter's internal APIs which may change at any time. Use at your own risk. This is not affiliated with or endorsed by Twitter/X.
