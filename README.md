# Twitter List Quick Add

A simple Chrome extension to quickly add users to Twitter lists while browsing profiles.

## Features

- Adds a 📋 button next to every username in your timeline
- Adds a "+ List" button to every Twitter/X profile page
- Click to see all your lists in a dropdown
- One-click to add the user to any list
- Works seamlessly with Twitter's UI
- Debug logging to help troubleshoot issues

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
3. Click it to see your lists
4. Click any list name to add that user to the list
5. You'll see a checkmark when it's done!

### From Profile Page
1. Go to any Twitter/X profile (e.g., `https://x.com/elonmusk`)
2. You'll see a blue "+ List" button near the Follow button
3. Click it to see your lists
4. Click any list name to add the user to that list
5. You'll see a checkmark when it's done!

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
