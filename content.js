// Twitter List Quick Add Extension
// Adds a button to quickly add users to lists while browsing

// Detect if we're on TweetDeck/X Pro
const isTweetDeck = window.location.hostname === 'pro.x.com' || window.location.hostname === 'tweetdeck.twitter.com';

// Use the appropriate API endpoint based on site
const GRAPHQL_ENDPOINT = isTweetDeck ? 'https://pro.x.com/i/api/graphql' : 'https://x.com/i/api/graphql';

const ADD_MEMBER_QUERY_ID = 'EadD8ivrhZhYQr2pDmCpjA';
const REMOVE_MEMBER_QUERY_ID = 'B5tMzrMYuFHJex_4EXFTSw';
const LIST_MEMBERS_QUERY_ID = '8ybCIfKAYYex7FdmJ0PzwQ';
const LIST_OWNERSHIPS_QUERY_ID = 'J25SWJdbyp3MRho1c9NhqQ';
const LISTS_QUERY_ID = 'xzVN0C62pNPWVfUjixdzeQ';
const USER_BY_SCREEN_NAME_QUERY_ID = '-oaLodhGbbnzJBACb1kk2Q';
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const DEBUG = true;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Load settings from localStorage
function getSettings() {
  try {
    const settings = localStorage.getItem('tw_list_settings');
    if (settings) {
      return JSON.parse(settings);
    }
  } catch (e) {
    // Ignore
  }
  // Default settings (Balanced)
  return {
    preset: 'balanced',
    requestDelay: 300,
    maxLookupsPerPeriod: 20,
    lookupPeriod: 5 * 60 * 1000,
    skipMembershipCheck: false // Default: always check memberships
  };
}

// Get current settings
let currentSettings = getSettings();
let REQUEST_DELAY = currentSettings.requestDelay;
let MAX_LOOKUPS_PER_PERIOD = currentSettings.maxLookupsPerPeriod;
let LOOKUP_PERIOD = currentSettings.lookupPeriod;

// Reload settings when they change
window.addEventListener('storage', (e) => {
  if (e.key === 'tw_list_settings') {
    currentSettings = getSettings();
    REQUEST_DELAY = currentSettings.requestDelay;
    MAX_LOOKUPS_PER_PERIOD = currentSettings.maxLookupsPerPeriod;
    LOOKUP_PERIOD = currentSettings.lookupPeriod;
    log('Settings updated:', currentSettings.preset);
  }
});

let cachedLists = null;
let myUserId = null; // Store the logged-in user's ID

// Try to extract user ID from Twitter's initial state
function extractMyUserId() {
  if (myUserId) return myUserId;

  // Try to get from window.__INITIAL_STATE__ or other Twitter globals
  try {
    // Method 1: Check document for user ID in meta tags or scripts
    const metaTag = document.querySelector('meta[name="twitter:data1"]');
    if (metaTag) {
      const content = metaTag.getAttribute('content');
      log('🔍 DEBUG: Found meta tag:', content);
    }

    // Method 2: Look for Twitter's React props in DOM
    const reactRoot = document.querySelector('#react-root');
    if (reactRoot && reactRoot._reactRootContainer) {
      log('🔍 DEBUG: Found React root');
    }

    // Method 3: Parse cookies for user ID (Twitter stores it in cookies)
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'twid') {
        // Twitter stores user ID in twid cookie as u=<userid>
        // Need to decode URL encoding first (u%3D55644285 -> u=55644285)
        const decodedValue = decodeURIComponent(value);
        log('🔍 DEBUG: twid cookie found:', value, '-> decoded:', decodedValue);

        const match = decodedValue.match(/u=(\d+)/);
        if (match && match[1]) {
          myUserId = match[1];
          log('✅ DEBUG: Extracted user ID from cookie:', myUserId);
          return myUserId;
        }
      }
    }
  } catch (e) {
    log('❌ DEBUG: Error extracting user ID:', e);
  }

  return myUserId;
}

const processedTweets = new Set();
const userIdCache = new Map();
const pendingLookups = new Map();

// Request queue for throttling
const requestQueue = [];
let isProcessingQueue = false;

// Rate limiting tracking
const lookupHistory = [];

// LocalStorage cache management
const CACHE_KEYS = {
  MEMBERSHIPS: 'tw_list_memberships',
  LIST_ACTIVITY: 'tw_list_activity'
};

// Add request to queue with throttling
async function queueRequest(requestFn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ requestFn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;

  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const { requestFn, resolve, reject } = requestQueue.shift();

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    // Wait before processing next request
    if (requestQueue.length > 0) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY));
    }
  }

  isProcessingQueue = false;
}

// Check if rate limit would be exceeded
function checkRateLimit() {
  const now = Date.now();
  // Clean old entries
  const cutoff = now - LOOKUP_PERIOD;
  const recentLookups = lookupHistory.filter(time => time > cutoff);
  lookupHistory.length = 0;
  lookupHistory.push(...recentLookups);

  return recentLookups.length < MAX_LOOKUPS_PER_PERIOD;
}

function trackLookup() {
  lookupHistory.push(Date.now());
}

function getCache(key) {
  try {
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.expires && Date.now() > parsed.expires) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function setCache(key, data, duration = CACHE_DURATION) {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      expires: Date.now() + duration
    }));
  } catch (e) {
    log('Cache write failed:', e);
  }
}

function updateListActivity(listId) {
  const activity = getCache(CACHE_KEYS.LIST_ACTIVITY) || {};
  activity[listId] = Date.now();
  setCache(CACHE_KEYS.LIST_ACTIVITY, activity);
}

function log(...args) {
  if (DEBUG) console.log('[Twitter List Quick Add]', ...args);
}

// Get CSRF token from cookies
function getCsrfToken() {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'ct0') {
      return value;
    }
  }
  return null;
}

// Look up user ID by username using Twitter's API
async function getUserIdByUsername(username) {
  username = username.toLowerCase();

  // Check cache first
  if (userIdCache.has(username)) {
    return userIdCache.get(username);
  }

  // Check if lookup is already in progress
  if (pendingLookups.has(username)) {
    return pendingLookups.get(username);
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    log('No CSRF token for user lookup');
    return null;
  }

  // Create promise for this lookup
  const lookupPromise = (async () => {
    try {
      const variables = {
        screen_name: username,
        withGrokTranslatedBio: false
      };

      const features = {
        hidden_profile_subscriptions_enabled: true,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        responsive_web_profile_redirect_enabled: false,
        rweb_tipjar_consumption_enabled: true,
        verified_phone_label_enabled: true,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: true,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true
      };

      const fieldToggles = {
        withPayments: false,
        withAuxiliaryUserLabels: true
      };

      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(features),
        fieldToggles: JSON.stringify(fieldToggles)
      });

      const response = await fetch(`${GRAPHQL_ENDPOINT}/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?${params}`, {
        headers: {
          'authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-client-language': 'en'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        log('API ERROR for', username, '- Status:', response.status);
        return null;
      }

      const userId = data?.data?.user?.result?.rest_id;

      if (userId) {
        userIdCache.set(username, userId);
        log('✓ Looked up user ID:', username, '->', userId);
        return userId;
      } else {
        log('Could not find user ID for:', username);
        return null;
      }
    } catch (error) {
      log('Error looking up user:', username, error);
      return null;
    } finally {
      pendingLookups.delete(username);
    }
  })();

  pendingLookups.set(username, lookupPromise);
  return lookupPromise;
}

// Fetch user's lists
async function fetchLists() {
  if (cachedLists) {
    return cachedLists;
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    log('ERROR: No CSRF token found');
    return [];
  }

  const params = new URLSearchParams({
    variables: JSON.stringify({ count: 100 }),
    features: JSON.stringify({
      rweb_video_screen_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: true,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_enhance_cards_enabled: false
    })
  });

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${LISTS_QUERY_ID}/ListsManagementPageTimeline?${params}`, {
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-client-language': 'en'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      log('Lists API ERROR - Status:', response.status);
      return [];
    }

    // Extract user ID from cookie if not already set
    if (!myUserId) {
      extractMyUserId();
    }

    const viewer = data?.data?.viewer;
    const instructions = viewer?.list_management_timeline?.timeline?.instructions || [];

    // Find the TimelineAddEntries instruction
    const addEntriesInstruction = instructions.find(inst => inst.type === 'TimelineAddEntries');

    if (!addEntriesInstruction) {
      log('No TimelineAddEntries instruction found');
      return [];
    }

    const entries = addEntriesInstruction.entries || [];

    // Extract lists from entries
    cachedLists = [];
    for (const entry of entries) {
      // Check if this is a module with items
      if (entry.content?.items) {
        for (const item of entry.content.items) {
          const list = item.item?.itemContent?.list;
          if (list && list.id_str && list.name) {
            // Filter: Only show Private lists as they are owned by the user
            if (list.mode === 'Private') {
              cachedLists.push({
                id: list.id_str,
                name: list.name
              });
            } else {
              log('Skipping list (not private):', list.name, list.mode);
            }
          }
        }
      }
      // Or a direct list entry
      else if (entry.content?.itemContent?.list) {
        const list = entry.content.itemContent.list;
        if (list.id_str && list.name) {
          // Filter: Only show Private lists
          if (list.mode === 'Private') {
            cachedLists.push({
              id: list.id_str,
              name: list.name
            });
          } else {
            log('Skipping list (not private):', list.name, list.mode);
          }
        }
      }
    }

    log('Fetched', cachedLists.length, 'lists');
    return cachedLists;
  } catch (error) {
    log('ERROR fetching lists:', error);
    return [];
  }
}

// Check which lists a user is on (using efficient ListOwnerships endpoint)
async function getUserListMemberships(userId, skipCheck = false) {
  // If skip check mode, return empty (user will manually select)
  if (skipCheck) {
    log('Skipping membership check (quick mode)');
    return [];
  }

  // CACHE TEMPORARILY DISABLED FOR DEBUGGING
  // Check cache first
  // const cached = getCache(CACHE_KEYS.MEMBERSHIPS) || {};
  // log('🔍 DEBUG: Cache contents:', cached);
  // if (cached[userId]) {
  //   log('✅ DEBUG: Using cached memberships for user:', userId, '| Cached lists:', cached[userId]);
  //   return cached[userId];
  // }
  log('🔍 DEBUG: Cache disabled - fetching fresh data for userId:', userId);

  // Check rate limit
  if (!checkRateLimit()) {
    log('Rate limit reached - skipping membership check');
    return null; // Return null to indicate rate limit hit
  }

  // Need myUserId to be set
  if (!myUserId) {
    // Try to extract it now
    extractMyUserId();
  }

  if (!myUserId) {
    log('❌ DEBUG: myUserId not set yet, cannot fetch memberships');
    return [];
  }

  log('🔍 DEBUG: Fetching list memberships for userId:', userId, 'using ListOwnerships API');
  log('🔍 DEBUG: My user ID:', myUserId);
  trackLookup();

  const csrfToken = getCsrfToken();
  if (!csrfToken) return [];

  try {
    // Use the efficient ListOwnerships endpoint - just ONE API call!
    const result = await queueRequest(async () => {
      const params = new URLSearchParams({
        variables: JSON.stringify({
          userId: myUserId,
          isListMemberTargetUserId: userId,
          count: 100
        }),
        features: JSON.stringify({
          rweb_video_screen_enabled: false,
          profile_label_improvements_pcf_label_in_post_enabled: true,
          responsive_web_profile_redirect_enabled: false,
          rweb_tipjar_consumption_enabled: true,
          verified_phone_label_enabled: true,
          creator_subscriptions_tweet_preview_api_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          premium_content_api_read_enabled: false,
          communities_web_enable_tweet_community_results_fetch: true,
          c9s_tweet_anatomy_moderator_badge_enabled: true,
          responsive_web_grok_analyze_button_fetch_trends_enabled: false,
          responsive_web_grok_analyze_post_followups_enabled: true,
          responsive_web_jetfuel_frame: true,
          responsive_web_grok_share_attachment_enabled: true,
          articles_preview_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          tweet_awards_web_tipping_enabled: false,
          responsive_web_grok_show_grok_translated_post: false,
          responsive_web_grok_analysis_button_from_backend: true,
          creator_subscriptions_quote_tweet_preview_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_grok_image_annotation_enabled: true,
          responsive_web_grok_imagine_annotation_enabled: true,
          responsive_web_grok_community_note_auto_translation_is_enabled: false,
          responsive_web_enhance_cards_enabled: false
        })
      });

      const response = await fetch(`${GRAPHQL_ENDPOINT}/${LIST_OWNERSHIPS_QUERY_ID}/ListOwnerships?${params}`, {
        headers: {
          'authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-client-language': 'en'
        }
      });

      return response.json();
    });

    log('🔍 DEBUG: ListOwnerships API Response:', result);

    // Check for errors
    if (result.errors) {
      log('❌ DEBUG: API returned errors:', result.errors);
      return [];
    }

    // Parse the response to extract list IDs
    const memberLists = [];
    const instructions = result?.data?.user?.result?.timeline?.timeline?.instructions || [];

    log('🔍 DEBUG: Found', instructions.length, 'instructions');

    for (const instruction of instructions) {
      log('🔍 DEBUG: Processing instruction type:', instruction.type);

      if (instruction.type === 'TimelineAddEntries') {
        const entries = instruction.entries || [];
        log('🔍 DEBUG: Found', entries.length, 'entries in TimelineAddEntries');

        for (const entry of entries) {
          log('🔍 DEBUG: Entry:', entry.entryId, '| Content type:', entry.content?.entryType);

          // Extract list from entry
          const list = entry.content?.itemContent?.list;
          if (list?.id_str) {
            // Check the is_member field!
            const isMember = list.is_member;
            log('🔍 DEBUG: List:', list.name, '(ID:', list.id_str + ') | is_member:', isMember);

            if (isMember === true) {
              memberLists.push(list.id_str);
              log('✅ DEBUG: User IS on list:', list.name);
            } else {
              log('⚪ DEBUG: User is NOT on list:', list.name);
            }
          } else {
            log('🔍 DEBUG: No list found in this entry');
          }
        }
      }
    }

    log('🔍 DEBUG: Extracted list IDs where is_member=true:', memberLists);

    // CACHE TEMPORARILY DISABLED FOR DEBUGGING
    // Cache the results
    // cached[userId] = memberLists;
    // setCache(CACHE_KEYS.MEMBERSHIPS, cached);

    log('🔍 DEBUG: Final result - User is on', memberLists.length, 'lists:', memberLists);
    return memberLists;
  } catch (error) {
    log('❌ DEBUG: Error fetching list memberships:', error);
    return [];
  }
}

// Add user to list
async function addUserToList(listId, userId) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    alert('Authentication error. Please refresh the page.');
    return false;
  }

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${ADD_MEMBER_QUERY_ID}/ListAddMember`, {
      method: 'POST',
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
        'x-twitter-client-language': 'en'
      },
      body: JSON.stringify({
        variables: {
          listId: listId,
          userId: userId
        },
        features: {
          profile_label_improvements_pcf_label_in_post_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_profile_redirect_enabled: false,
          rweb_tipjar_consumption_enabled: true,
          verified_phone_label_enabled: true
        },
        queryId: ADD_MEMBER_QUERY_ID
      })
    });

    const data = await response.json();
    const success = !!data.data;

    if (success) {
      // Update cache
      const cached = getCache(CACHE_KEYS.MEMBERSHIPS) || {};
      if (!cached[userId]) cached[userId] = [];
      if (!cached[userId].includes(listId)) {
        cached[userId].push(listId);
      }
      setCache(CACHE_KEYS.MEMBERSHIPS, cached);
      updateListActivity(listId);
    }

    return success;
  } catch (error) {
    log('ERROR adding user to list:', error);
    return false;
  }
}

// Remove user from list
async function removeUserFromList(listId, userId) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    alert('Authentication error. Please refresh the page.');
    return false;
  }

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${REMOVE_MEMBER_QUERY_ID}/ListRemoveMember`, {
      method: 'POST',
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
        'x-twitter-client-language': 'en'
      },
      body: JSON.stringify({
        variables: {
          listId: listId,
          userId: userId
        },
        features: {
          profile_label_improvements_pcf_label_in_post_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_profile_redirect_enabled: false,
          rweb_tipjar_consumption_enabled: true,
          verified_phone_label_enabled: true
        },
        queryId: REMOVE_MEMBER_QUERY_ID
      })
    });

    const data = await response.json();

    if (!response.ok) {
      log('Remove API ERROR - Status:', response.status, 'Data:', data);
      return false;
    }

    const success = !!data.data;

    if (success) {
      // Update cache
      const cached = getCache(CACHE_KEYS.MEMBERSHIPS) || {};
      if (cached[userId]) {
        cached[userId] = cached[userId].filter(id => id !== listId);
      }
      setCache(CACHE_KEYS.MEMBERSHIPS, cached);
    }

    return success;
  } catch (error) {
    log('ERROR removing user from list:', error);
    return false;
  }
}

// Create a small list button for timeline tweets
function createTimelineListButton(username) {
  const button = document.createElement('button');
  // Use a class that we can style for hover effects
  button.className = 'timeline-list-btn';
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', `Add @${username} to list`);
  button.title = `Add @${username} to list`;

  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 1.25em; height: 1.25em; fill: currentColor; vertical-align: text-bottom;">
      <g>
        <path d="M4.5 3c-1.38 0-2.5 1.12-2.5 2.5v14c0 1.38 1.12 2.5 2.5 2.5h14c1.38 0 2.5-1.12 2.5-2.5v-14c0-1.38-1.12-2.5-2.5-2.5h-14zm-2.5 2.5c0-.28.22-.5.5-.5h14c.27 0 .5.22.5.5v14c0 .28-.22.5-.5.5h-14c-.27 0-.5-.22-.5-.5v-14zm10 4h-2v3h-3v2h3v3h2v-3h3v-2h-3v-3z"></path>
      </g>
    </svg>
  `;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.textContent = '...';
    button.disabled = true;

    // Look up user ID
    const userId = await getUserIdByUsername(username);
    if (!userId) {
      alert('Could not find user ID. Try again.');
      const iconUrl = chrome.runtime.getURL('icon48.png');
      button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
      button.disabled = false;
      return;
    }

    const lists = await fetchLists();

    if (lists.length === 0) {
      alert('No lists found. Create a list first on Twitter.');
      const iconUrl = chrome.runtime.getURL('icon48.png');
      button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
      button.disabled = false;
      return;
    }

    showListDropdown(lists, userId, button, username);
  });

  return button;
}

// Create a list button for TweetDeck tweets (smaller, fits the compact UI)
function createTweetDeckListButton(username, userId = null) {
  const button = document.createElement('button');
  button.className = 'tweetdeck-list-btn';
  const iconUrl = chrome.runtime.getURL('icon48.png');
  button.innerHTML = `<img src="${iconUrl}" style="width: 18px; height: 18px; vertical-align: text-bottom; display: block;" alt="Add to list">`;
  button.title = `Add @${username} to list`;

  // Store userId if we have it
  if (userId) {
    button.dataset.userId = userId;
  }

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.textContent = '...';
    button.disabled = true;

    // Use stored userId if available, otherwise look it up
    let finalUserId = button.dataset.userId;

    if (!finalUserId) {
      finalUserId = await getUserIdByUsername(username);
    }

    if (!finalUserId) {
      alert('Could not find user ID. Try again.');
      const iconUrl = chrome.runtime.getURL('icon48.png');
      button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
      button.disabled = false;
      return;
    }

    const lists = await fetchLists();

    if (lists.length === 0) {
      alert('No lists found. Create a list first on Twitter.');
      const iconUrl = chrome.runtime.getURL('icon48.png');
      button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
      button.disabled = false;
      return;
    }

    showListDropdown(lists, finalUserId, button, username);
  });

  return button;
}

// Try to extract user ID from React fiber props in the DOM
function extractUserIdFromElement(element) {
  try {
    // Look for React fiber keys that contain user data
    const keys = Object.keys(element);
    for (const key of keys) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactProps$')) {
        const fiber = element[key];

        // Traverse the fiber tree looking for user data
        const searchFiber = (node, depth = 0) => {
          if (!node || depth > 15) return null;

          // Check memoizedProps for user data
          if (node.memoizedProps) {
            const props = node.memoizedProps;

            // Look for user object with rest_id
            if (props.user?.rest_id) {
              return props.user.rest_id;
            }
            if (props.data?.user?.rest_id) {
              return props.data.user.rest_id;
            }
            if (props.tweet?.core?.user_results?.result?.rest_id) {
              return props.tweet.core.user_results.result.rest_id;
            }
            if (props.result?.core?.user_results?.result?.rest_id) {
              return props.result.core.user_results.result.rest_id;
            }
          }

          // Check child and sibling
          return searchFiber(node.child, depth + 1) ||
            searchFiber(node.sibling, depth + 1) ||
            searchFiber(node.return, depth + 1);
        };

        const userId = searchFiber(fiber);
        if (userId) return userId;
      }
    }
  } catch (e) {
    log('TweetDeck: Error extracting userId from React:', e);
  }
  return null;
}

// Add buttons to TweetDeck tweets
function addButtonsToTweetDeckTweets() {
  // TweetDeck uses article elements with data-testid="tweet" similar to regular Twitter
  // but the structure inside may differ
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');

  if (tweets.length > 0) {
    log('TweetDeck: Scanning - found', tweets.length, 'tweets');
  }

  let added = 0;
  let skipped = 0;

  tweets.forEach(tweet => {
    // Generate a unique ID for each tweet
    let tweetId = tweet.getAttribute('data-td-processed');
    if (tweetId) {
      skipped++;
      return;
    }

    // Mark as processed
    tweetId = 'td-' + Math.random().toString(36).substr(2, 9);
    tweet.setAttribute('data-td-processed', tweetId);

    // Find the user area - TweetDeck structure
    // Look for the username/handle area
    const userNameArea = tweet.querySelector('[data-testid="User-Name"]');

    if (!userNameArea) {
      log('TweetDeck: No User-Name area found');
      return;
    }

    // Check if button already exists
    if (userNameArea.querySelector('.tweetdeck-list-btn')) {
      skipped++;
      return;
    }

    // Find username from the tweet
    // Look for links that go to user profiles
    const userLinks = tweet.querySelectorAll('a[href^="/"]');
    let username = null;

    for (const link of userLinks) {
      const href = link.getAttribute('href');
      // Match profile links like /username (not /username/status/...)
      if (href && href.match(/^\/[a-zA-Z0-9_]+$/) && !href.match(/^\/(home|explore|notifications|messages|settings|compose|search|i|hashtag)/)) {
        username = href.replace('/', '').toLowerCase();
        break;
      }
    }

    if (!username) {
      // Alternative: look for @username text
      const handleElements = tweet.querySelectorAll('span, div');
      for (const el of handleElements) {
        const text = el.textContent.trim();
        if (text.match(/^@[a-zA-Z0-9_]+$/) && el.children.length === 0) {
          username = text.replace('@', '').toLowerCase();
          break;
        }
      }
    }

    if (!username) {
      log('TweetDeck: Could not extract username');
      return;
    }

    // Try to extract user ID from React fiber props
    let userId = extractUserIdFromElement(tweet);

    // Also try from the user link element
    if (!userId) {
      const userLinks = tweet.querySelectorAll('a[href^="/"]');
      for (const link of userLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/^\/[a-zA-Z0-9_]+$/) && !href.match(/^\/(home|explore|notifications|messages|settings|compose|search|i|hashtag)/)) {
          userId = extractUserIdFromElement(link);
          if (userId) break;
        }
      }
    }

    if (userId) {
      log('TweetDeck: Found userId', userId, 'for', username);
    }

    // Create and add button (pass userId if we found it)
    const button = createTweetDeckListButton(username, userId);

    const buttonContainer = document.createElement('span');
    buttonContainer.className = 'tweetdeck-list-btn-container';
    buttonContainer.style.marginLeft = '6px';
    buttonContainer.style.display = 'inline-flex';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.appendChild(button);

    // Append to user name area
    userNameArea.appendChild(buttonContainer);
    added++;
  });

  if (added > 0) {
    log('TweetDeck: Added', added, 'buttons,', skipped, 'skipped');
  }
}

// Show dropdown with lists
async function showListDropdown(lists, userId, button, username = '') {
  log('🔍 DEBUG: showListDropdown called with userId:', userId, 'username:', username);

  const existingDropdown = document.getElementById('quick-list-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'quick-list-dropdown';
  dropdown.className = 'quick-list-dropdown';

  // Check rate limit status
  const remainingLookups = MAX_LOOKUPS_PER_PERIOD - lookupHistory.filter(t => t > Date.now() - LOOKUP_PERIOD).length;
  const isNearLimit = remainingLookups < 5;

  if (username) {
    const header = document.createElement('div');
    header.className = 'quick-list-header';
    header.textContent = `Managing @${username}...`;
    dropdown.appendChild(header);

    // Add rate limit warning if near limit
    if (isNearLimit) {
      const warning = document.createElement('div');
      warning.className = 'quick-list-warning';
      warning.textContent = `⚠️ ${remainingLookups} lookups remaining (resets in ${Math.ceil((LOOKUP_PERIOD - (Date.now() - Math.min(...lookupHistory))) / 60000)} min)`;
      dropdown.appendChild(warning);
    }
  }

  // Position dropdown immediately
  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  document.body.appendChild(dropdown);

  // Determine if we should skip membership check
  // Skip if: setting enabled OR rate limit hit
  const shouldSkipCheck = currentSettings.skipMembershipCheck || !checkRateLimit();
  log('🔍 DEBUG: shouldSkipCheck:', shouldSkipCheck, '(setting:', currentSettings.skipMembershipCheck, ', rate limit ok:', checkRateLimit() + ')');

  // Fetch current memberships
  const currentMemberships = await getUserListMemberships(userId, shouldSkipCheck);

  if (currentMemberships === null) {
    // Rate limit hit
    const header = dropdown.querySelector('.quick-list-header');
    if (header) {
      header.textContent = '⚠️ Rate limit reached - using quick mode';
    }
  }

  const initialMemberships = new Set(currentMemberships || []);

  // Update header
  if (username) {
    const header = dropdown.querySelector('.quick-list-header');
    if (currentMemberships && currentMemberships.length > 0) {
      header.textContent = `@${username} is on ${currentMemberships.length} list${currentMemberships.length > 1 ? 's' : ''}`;
    } else if (currentMemberships === null) {
      header.textContent = `Add @${username} to:`;
    } else {
      header.textContent = `Add @${username} to:`;
    }
  }

  // Sort lists by last activity
  const activity = getCache(CACHE_KEYS.LIST_ACTIVITY) || {};
  const sortedLists = [...lists].sort((a, b) => {
    const aTime = activity[a.id] || 0;
    const bTime = activity[b.id] || 0;
    return bTime - aTime;
  });

  const selectedLists = new Set(currentMemberships);

  log('🔍 DEBUG: selectedLists Set:', selectedLists);
  log('🔍 DEBUG: currentMemberships array:', currentMemberships);

  sortedLists.forEach(list => {
    const item = document.createElement('div');
    item.className = 'quick-list-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'quick-list-checkbox';
    checkbox.id = `list-checkbox-${list.id}`;

    const isSelected = selectedLists.has(list.id);
    log('🔍 DEBUG: List', list.name, '| list.id:', list.id, '| type:', typeof list.id, '| isSelected:', isSelected);

    checkbox.checked = isSelected;

    const label = document.createElement('label');
    label.className = 'quick-list-label';
    label.htmlFor = `list-checkbox-${list.id}`;
    label.textContent = list.name;

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedLists.add(list.id);
      } else {
        selectedLists.delete(list.id);
      }
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    dropdown.appendChild(item);
  });

  // Add submit button
  const submitButton = document.createElement('button');
  submitButton.className = 'quick-list-submit';
  submitButton.textContent = 'Save Changes';

  submitButton.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Find what changed
    const toAdd = [...selectedLists].filter(id => !initialMemberships.has(id));
    const toRemove = [...initialMemberships].filter(id => !selectedLists.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      submitButton.textContent = 'No changes';
      setTimeout(() => {
        submitButton.textContent = 'Save Changes';
      }, 2000);
      return;
    }

    submitButton.textContent = 'Saving...';
    submitButton.disabled = true;

    let addedCount = 0;
    let removedCount = 0;
    let failCount = 0;

    // Add to new lists
    for (const listId of toAdd) {
      const success = await addUserToList(listId, userId);
      if (success) {
        addedCount++;
      } else {
        failCount++;
      }
    }

    // Remove from unchecked lists
    for (const listId of toRemove) {
      const success = await removeUserFromList(listId, userId);
      if (success) {
        removedCount++;
      } else {
        failCount++;
      }
    }

    if (failCount === 0) {
      const parts = [];
      if (addedCount > 0) parts.push(`✓ Added to ${addedCount}`);
      if (removedCount > 0) parts.push(`Removed from ${removedCount}`);
      submitButton.textContent = parts.join(', ');
      setTimeout(() => {
        dropdown.remove();
        button.innerHTML = '✓';
        button.disabled = false;
        setTimeout(() => {
          const iconUrl = chrome.runtime.getURL('icon48.png');
          button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
        }, 2000);
      }, 1000);
    } else {
      submitButton.textContent = `${failCount} failed`;
      submitButton.disabled = false;
      setTimeout(() => {
        submitButton.textContent = 'Save Changes';
      }, 3000);
    }
  });

  dropdown.appendChild(submitButton);

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && e.target !== button) {
      dropdown.remove();
      const iconUrl = chrome.runtime.getURL('icon48.png');
      button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
      button.disabled = false;
      document.removeEventListener('click', closeDropdown);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 100);
}

// Add buttons to timeline tweets
function addButtonsToTimelineTweets() {
  // Skip if on profile page (user only wants the header button there)
  const isProfilePage = window.location.pathname.match(/^\/[^\/]+$/) &&
    !window.location.pathname.match(/^\/(home|explore|notifications|messages|settings|compose|search|i|hashtag)/);
  if (isProfilePage) return;

  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  log('Scanning timeline - found', tweets.length, 'tweets');

  let added = 0;
  let skipped = 0;

  tweets.forEach(tweet => {
    const tweetId = tweet.getAttribute('data-tweet-id') || Math.random().toString();
    tweet.setAttribute('data-tweet-id', tweetId);

    if (processedTweets.has(tweetId)) {
      skipped++;
      return;
    }

    const userArea = tweet.querySelector('[data-testid="User-Name"]');
    if (!userArea) {
      log('No User-Name area found in tweet');
      return;
    }

    if (userArea.querySelector('.timeline-list-btn')) {
      processedTweets.add(tweetId);
      skipped++;
      return;
    }

    // Get username from link
    const userLink = tweet.querySelector('a[href^="/"][role="link"]');
    if (!userLink) {
      log('No user link found in tweet');
      return;
    }

    let username = userLink.getAttribute('href')?.replace('/', '').split('/')[0];
    if (!username) {
      log('Could not extract username from link');
      return;
    }

    username = username.replace('@', '').toLowerCase();

    // Create and add button
    const button = createTimelineListButton(username);

    const buttonContainer = document.createElement('span');
    buttonContainer.style.marginLeft = '8px';
    buttonContainer.style.display = 'inline-flex';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.appendChild(button);

    userArea.appendChild(buttonContainer);
    processedTweets.add(tweetId);
    added++;
  });

  if (added > 0 || tweets.length > 0) {
    log('Timeline scan complete:', added, 'buttons added,', skipped, 'already processed');
  }
}

// Profile page support
async function checkAndAddProfileButton() {
  const isProfilePage = window.location.pathname.match(/^\/[^\/]+$/) &&
    !window.location.pathname.match(/^\/(home|explore|notifications|messages|settings|compose)/);

  if (!isProfilePage) return;

  const username = window.location.pathname.replace('/', '').toLowerCase();
  const handleText = '@' + username;

  // Find the handle element by text content
  // We look for an element that exactly matches the handle text
  // On the profile page header, the handle is usually a span or div, and NOT a link (unlike in tweets)
  const allElements = document.querySelectorAll('div, span');
  let handleElement = null;

  for (const el of allElements) {
    if (el.textContent.trim().toLowerCase() === handleText &&
      el.children.length === 0 && // Ensure it's a leaf node (text container)
      el.tagName !== 'A') { // Ensure it's not a link (timeline tweets have links)

      // Verify it's in the upper part of the page (profile header)
      const rect = el.getBoundingClientRect();
      if (rect.top < 500) {
        handleElement = el;
        break;
      }
    }
  }

  if (!handleElement || document.getElementById('quick-list-add-btn')) return;

  const button = document.createElement('button');
  button.id = 'quick-list-add-btn';
  button.className = 'profile-list-btn';
  /* originalContent will be the image tag string */
  const iconUrl = chrome.runtime.getURL('icon48.png');
  button.innerHTML = `<img src="${iconUrl}" style="width: 1.25em; height: 1.25em; vertical-align: text-bottom; display: block;" alt="Add to list">`;
  button.title = 'Quick add to list';

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const originalContent = button.innerHTML;
    button.disabled = true;

    const userId = await getUserIdByUsername(username);
    if (!userId) {
      alert('Could not find user ID.');
      button.innerHTML = originalContent;
      button.disabled = false;
      return;
    }

    const lists = await fetchLists();
    if (lists.length === 0) {
      alert('No lists found. Create a list first on Twitter.');
      button.innerHTML = originalContent;
      button.disabled = false;
      return;
    }

    showListDropdown(lists, userId, button);
  });

  // Create a wrapper to ensure proper positioning
  const wrapper = document.createElement('span');
  wrapper.className = 'profile-list-btn-wrapper';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.marginLeft = '8px'; // Add spacing from handle
  wrapper.style.verticalAlign = 'middle';
  wrapper.appendChild(button);

  // Insert after the handle element
  // We want to be on the same line.
  // If the handleElement is a span/div inside a flex container, we can append to the parent.
  // Or we can insert after the handleElement.

  if (handleElement.parentElement) {
    // Check if parent is a flex container
    const parentStyle = window.getComputedStyle(handleElement.parentElement);
    if (parentStyle.display === 'flex' || parentStyle.display === 'inline-flex') {
      // If parent is flex, just appending to parent works
      handleElement.parentElement.appendChild(wrapper);
    } else {
      // Otherwise, try to insert after
      handleElement.insertAdjacentElement('afterend', wrapper);
    }
  }

  log('Profile button added for @' + username);
}

// Add buttons to User Cells (Following/Followers/Lists)
function addButtonsToUserCells() {
  const userCells = Array.from(document.querySelectorAll('[data-testid="UserCell"]'));

  if (location.pathname.includes('/following') || location.pathname.includes('/followers')) {
    const potentialCells = document.querySelectorAll('button[role="button"], div[role="button"]');
    potentialCells.forEach(el => {
      if (el.querySelector('a[href^="/"]') &&
        el.querySelector('button[role="button"]') &&
        !el.hasAttribute('data-testid')) {
        userCells.push(el);
      }
    });
  }

  userCells.forEach(cell => {
    if (cell.querySelector('.user-cell-list-btn-container')) return;

    // Extract username
    let username = null;
    const userLinks = cell.querySelectorAll('a[href^="/"]');
    for (const link of userLinks) {
      const href = link.getAttribute('href');
      const parts = href.split('/');
      if (parts.length === 2 && parts[1]) {
        const potential = parts[1].toLowerCase();
        if (!['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'settings'].includes(potential)) {
          username = potential;
          break;
        }
      }
    }

    if (!username) {
      const text = cell.innerText;
      const match = text.match(/@([a-zA-Z0-9_]+)/);
      if (match) username = match[1].toLowerCase();
    }

    if (!username) return;

    const button = createTimelineListButton(username);
    button.style.fontSize = '14px';
    button.style.background = 'transparent';
    button.style.border = 'none';
    button.style.padding = '0 4px';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';

    const container = document.createElement('div');
    container.className = 'user-cell-list-btn-container';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.zIndex = '999';
    container.style.flexShrink = '0';
    container.appendChild(button);

    // STRATEGY: Target the name text specifically

    // 1. Try to find the User-Name container
    const userNameElement = cell.querySelector('div[data-testid="User-Name"]');
    if (userNameElement) {
      const nameRow = userNameElement.querySelector('div:first-child');
      if (nameRow) {
        container.style.marginLeft = '4px';
        nameRow.appendChild(container);
        return;
      }
      // Fallback
      userNameElement.style.display = 'flex';
      userNameElement.style.flexDirection = 'row';
      userNameElement.style.alignItems = 'center';
      container.style.marginLeft = '4px';
      userNameElement.appendChild(container);
      return;
    }

    // 2. Fallback: Find the link that contains the USERNAME text (not the image/avatar)
    // This avoids injecting into the avatar link which hides overflow
    let targetLink = null;
    for (const link of userLinks) {
      // specific check: does this link have text content that isn't empty?
      // Avatar links usually have an image or empty textual content (aria-label separate)
      if (link.innerText && link.innerText.trim().length > 0) {
        // Does it match the username or display name?
        // Usually the display name link is the one we want.
        // We can check if it contains a span or div with text.
        targetLink = link;
        break;
      }
    }

    if (targetLink && targetLink.parentElement) {
      const parent = targetLink.parentElement;
      // Ensure parent flows horizontally
      container.style.marginLeft = '4px';

      // We prefer appending to the parent of the link (the wrapper)
      // But if the link itself is the flex container for text + badge, append to link? 
      // Most likely append to parent.
      // Make sure parent is flex row
      parent.style.display = 'flex';
      parent.style.flexDirection = 'row';
      parent.style.alignItems = 'center';
      parent.appendChild(container);
      return;
    }

    // 3. Last fallback: Find the node containing the handle text (@username) and append to its parent
    // This is risky but often works for obfuscated DOMs
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes('@' + username) || node.textContent.includes(username)) {
        if (node.parentElement) {
          // Often the handle is in a span, inside a div, inside a link...
          // We want to go up until we find a block container or the cell itself
          // For now, let's try appending to the parent of the text node's parent (the line wrapper)
          const rigidParent = node.parentElement.parentElement;
          if (rigidParent && rigidParent !== cell) {
            container.style.marginLeft = '4px';
            rigidParent.style.display = 'flex';
            rigidParent.style.alignItems = 'center';
            rigidParent.appendChild(container);
            return;
          }
        }
      }
    }

    // Last resort
    if (cell.children.length > 0) {
      // Try appending to the second child (usually the text content column)
      if (cell.children.length >= 2) {
        cell.children[1].appendChild(container);
      } else {
        cell.children[cell.children.length - 1].appendChild(container);
      }
    } else {
      cell.appendChild(container);
    }
  });
}

// Main initialization
function init() {
  log('Extension initialized', isTweetDeck ? '(TweetDeck mode)' : '(Standard mode)');

  // Extract user ID early
  extractMyUserId();

  if (isTweetDeck) {
    // TweetDeck mode
    addButtonsToTweetDeckTweets();
  } else {
    // Standard Twitter mode
    checkAndAddProfileButton();
    addButtonsToTimelineTweets();
    addButtonsToUserCells();
  }

  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const url = location.href;

    if (isTweetDeck) {
      // TweetDeck: just keep scanning for new tweets
      addButtonsToTweetDeckTweets();
    } else {
      // Standard Twitter
      if (url !== lastUrl) {
        lastUrl = url;
        processedTweets.clear();
        setTimeout(() => {
          checkAndAddProfileButton();
          addButtonsToTimelineTweets();
          addButtonsToUserCells();
        }, 1000);
      } else {
        addButtonsToTimelineTweets();
        addButtonsToUserCells();
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

setTimeout(init, 2000);
