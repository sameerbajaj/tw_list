# X / Twitter Extension Development Learnings

This document captures key learnings, DOM structures, and strategies discovered while developing the `tw_list` extension. Refer to this when making future updates.

## Critical Learnings

### 1. DOM Obfuscation & Variability
- **Class Names**: Use randomized, utility-like class names (e.g., `css-175oi2r`, `r-1mmae3n`) which are **unstable** and should be avoided or used with extreme caution.
- **Attributes**: `data-testid` attributes are the most reliable way to target elements, but they are **inconsistent**.
    - **Reliable**: `data-testid="UserCell"` (on most lists), `data-testid="User-Name"`.
    - **Missing**: Some user lists (like the "Following" page) simply use generic `button` or `div` elements without `data-testid="UserCell"`.

### 2. User Cell Structure (The "UserCell")
A "User Cell" is the UI component representing a single user row in a list or sidebar.

#### Structure Variations:
1.  **Standard List Item (`div`)**:
    -   Found in "Who to follow" sidebars.
    -   Has `data-testid="UserCell"`.
    -   Usually a `div` or `li`.

2.  **Actionable List Item (`button`)**:
    -   Found on **Following / Followers** pages.
    -   Often implemented as a root `button[role="button"]` element (the whole row is clickable).
    -   **Crucial**: May *specifically* lack `data-testid="UserCell"`.
    -   Contains multiple nested interactive elements (Avatar link, Name link, Handle link, Follow button).

### 3. Selector Strategy for "Following" Page
Because `data-testid` is unreliable on the Following page, the robust search strategy is:
1.  **Prioritize `[data-testid="UserCell"]`**: Catch the standard cases first.
2.  **Fallback to Structure Match**: Look for `button[role="button"]` or `div[role="button"]` elements that contain:
    -   An anchor tag (`a[href^="/"]`).
    -   A nested "Follow" button (`button[role="button"]`).

### 4. Username Extraction
Extracting the username is tricky because of multiple links in a cell:
-   **Avatar Link**: Usually the first link. Contains an image (often `alt=""` or user name).
-   **Name Link**: Contains the display name text.
-   **Handle Link**: Contains the `@handle` text.
-   **Strategy**:
    -   Check `href` segments (ignore `/home`, `/explore`, etc.).
    -   If link extraction fails, regex match the inner text for `@username`.

### 5. Button Injection Placement (The "Spacing Gap" Issue)
This was the hardest problem.
-   **The Problem**: The user cell header uses `display: flex; justify-content: space-between`.
    -   It usually expects 2 children: `[Name/Handle Wrappper]` and `[Follow Button]`.
    -   Inserting our button as a 3rd child makes it the "middle" element, causing huge gaps.
-   **The Failed Fix**: Inserting *before* the Follow button still treats it as a flex item participating in the spacing.
-   **The Correct Fix (Injection Strategy)**:
    -   **DO NOT** inject as a sibling to the name or follow button.
    -   **DO** inject **INSIDE** the Name/Handle wrapper.
    -   **Target**: Find `div[data-testid="User-Name"]`, then find its **first child `div`** (which is usually a flex row holding the name text and verified badge).
    -   Append the button to *that* row.
    -   **Styling**: Use `margin-left: 4px` and `flex-shrink: 0` to sit flush against the name.

### 6. The "Invisible Button" Trap
-   **The Trap**: A naive "find first link and append to parent" strategy usually selects the **Avatar Link**.
-   **The Issue**: The custom avatar container often has `overflow: hidden`, rendering your injected button invisible even if it exists in the DOM.
-   **The Fix**: Explicitly finding links that contain **text content** (the name) and ignoring image-only links ensuring you target the visible text area.

### 7. API & State
-   **CSRF Token**: Essential for authenticated requests. Get it from the `ct0` cookie.
-   **Rate Limiting**: Twitter has aggressive rate limits. A request queue with random delays (e.g., 500ms - 1500ms) is mandatory.
-   **Store State**: Use `localStorage` to cache list memberships to avoid re-fetching on every page load/scroll (MutationObserver triggers frequently).

## Important Files
-   `content.js`: Main logic.
-   `manifest.json`: Permissions and matching patterns.

## Debugging Tips
-   Use `createTreeWalker` to find text nodes if selectors fail.
-   Always check `overflow` properties on parent containers if an element is injected but not seen.

## 8. Extension Icons & Branding (Key Learnings)

### Manifest V3 Icon Configuration
-   **Toolbar Visibility**: To ensure the extension icon appears in the browser toolbar, you **MUST** define `default_icon` within the `action` object in `manifest.json`.
-   **Format Requirement**: This `default_icon` property **MUST** be an object specifying image paths for different sizes (standard keys: "16", "32", "48", "128").
-   **Structure**:
    ```json
    "action": {
      "default_icon": {
        "16": "icon16.png",
        "32": "icon32.png",
        "48": "icon48.png",
        "128": "icon128.png"
      }
    }
    ```
-   **Top-Level Icons**: Defining `icons` at the root of `manifest.json` is necessary for the extensions management page (`chrome://extensions`) but **insufficient** for the toolbar action icon.

### Design Aesthetics
-   **Full Bleed**: Avoid white borders or padding around the icon. The image should extend to the edges (full bleed) for a modern look.
-   **Creative Context**: Avoid generic symbols (like puzzle pieces or plain clipboards). Incorporate relevant imagery (e.g., a bird for a Twitter tool) to make the icon unique and thematic.
-   **Quality**: Prefer high-resolution, polished assets (3D/Glossy style often preferred over flat) to convey a premium feel.

### In-Page Icon Consistency
-   **The Issue**: Injecting inline SVGs or Emojis into the page creates visual inconsistency if it doesn't match the extension's brand icon.
-   **The Solution**: Inject the **exact same icon file** used by the extension.
    1.  **Web Accessible Resources**: Add the icon files (e.g., `icon48.png`) to `web_accessible_resources` -> `resources` in `manifest.json` so the content script can access them.
    2.  **Content Script injection**: Use `chrome.runtime.getURL('icon48.png')` to resolve the full path and inject an `<img>` tag instead of an `<svg>`.
    3.  **Result**: Perfect branding consistency across the toolbar and the injected UI elements.
