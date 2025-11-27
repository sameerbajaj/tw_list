// Twitter List Quick Add Extension
// Adds a button to quickly add users to lists while browsing

const GRAPHQL_ENDPOINT = 'https://x.com/i/api/graphql';
const ADD_MEMBER_QUERY_ID = 'EadD8ivrhZhYQr2pDmCpjA';
const REMOVE_MEMBER_QUERY_ID = 'B5tMzrMYuFHJex_4EXFTSw';
const LIST_MEMBERS_QUERY_ID = '8ybCIfKAYYex7FdmJ0PzwQ';
const LISTS_QUERY_ID = 'xzVN0C62pNPWVfUjixdzeQ';
const USER_BY_SCREEN_NAME_QUERY_ID = '-oaLodhGbbnzJBACb1kk2Q';
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const DEBUG = true;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

let cachedLists = null;
const processedTweets = new Set();
const userIdCache = new Map();
const pendingLookups = new Map();

// LocalStorage cache management
const CACHE_KEYS = {
  MEMBERSHIPS: 'tw_list_memberships',
  LIST_ACTIVITY: 'tw_list_activity'
};

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

    const instructions = data?.data?.viewer?.list_management_timeline?.timeline?.instructions || [];

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
            cachedLists.push({
              id: list.id_str,
              name: list.name
            });
          }
        }
      }
      // Or a direct list entry
      else if (entry.content?.itemContent?.list) {
        const list = entry.content.itemContent.list;
        if (list.id_str && list.name) {
          cachedLists.push({
            id: list.id_str,
            name: list.name
          });
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

// Check which lists a user is on
async function getUserListMemberships(userId) {
  // Check cache first
  const cached = getCache(CACHE_KEYS.MEMBERSHIPS) || {};
  if (cached[userId]) {
    log('Using cached memberships for user:', userId);
    return cached[userId];
  }

  log('Fetching list memberships for user:', userId);

  const csrfToken = getCsrfToken();
  if (!csrfToken) return [];

  const memberLists = [];

  // Fetch members for each list
  for (const list of cachedLists || []) {
    try {
      const params = new URLSearchParams({
        variables: JSON.stringify({ listId: list.id, count: 100 }),
        features: JSON.stringify({
          rweb_video_screen_enabled: false,
          profile_label_improvements_pcf_label_in_post_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true
        })
      });

      const response = await fetch(`${GRAPHQL_ENDPOINT}/${LIST_MEMBERS_QUERY_ID}/ListMembers?${params}`, {
        headers: {
          'authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-client-language': 'en'
        }
      });

      const data = await response.json();
      const instructions = data?.data?.list?.members_timeline?.timeline?.instructions || [];
      const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries || [];

      // Check if this user is in the members
      for (const entry of entries) {
        const userResult = entry.content?.itemContent?.user_results?.result;
        if (userResult?.rest_id === userId) {
          memberLists.push(list.id);
          break;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      log('Error checking membership for list:', list.id, error);
    }
  }

  // Cache the results
  cached[userId] = memberLists;
  setCache(CACHE_KEYS.MEMBERSHIPS, cached);

  log('User is on', memberLists.length, 'lists');
  return memberLists;
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
  button.className = 'timeline-list-btn';
  button.innerHTML = '📋';
  button.title = `Add @${username} to list`;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.textContent = '...';
    button.disabled = true;

    // Look up user ID
    const userId = await getUserIdByUsername(username);
    if (!userId) {
      alert('Could not find user ID. Try again.');
      button.innerHTML = '📋';
      button.disabled = false;
      return;
    }

    const lists = await fetchLists();

    if (lists.length === 0) {
      alert('No lists found. Create a list first on Twitter.');
      button.innerHTML = '📋';
      button.disabled = false;
      return;
    }

    showListDropdown(lists, userId, button, username);
  });

  return button;
}

// Show dropdown with lists
async function showListDropdown(lists, userId, button, username = '') {
  const existingDropdown = document.getElementById('quick-list-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'quick-list-dropdown';
  dropdown.className = 'quick-list-dropdown';

  if (username) {
    const header = document.createElement('div');
    header.className = 'quick-list-header';
    header.textContent = `Managing @${username}...`;
    dropdown.appendChild(header);
  }

  // Position dropdown immediately
  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  document.body.appendChild(dropdown);

  // Fetch current memberships
  const currentMemberships = await getUserListMemberships(userId);
  const initialMemberships = new Set(currentMemberships);

  // Update header
  if (username) {
    const header = dropdown.querySelector('.quick-list-header');
    header.textContent = `Add @${username} to:`;
  }

  // Sort lists by last activity
  const activity = getCache(CACHE_KEYS.LIST_ACTIVITY) || {};
  const sortedLists = [...lists].sort((a, b) => {
    const aTime = activity[a.id] || 0;
    const bTime = activity[b.id] || 0;
    return bTime - aTime;
  });

  const selectedLists = new Set(currentMemberships);

  sortedLists.forEach(list => {
    const item = document.createElement('div');
    item.className = 'quick-list-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'quick-list-checkbox';
    checkbox.id = `list-checkbox-${list.id}`;
    checkbox.checked = selectedLists.has(list.id);

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
          button.innerHTML = '📋';
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
      button.innerHTML = '📋';
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

  const profileHeader = document.querySelector('[data-testid="userActions"]');
  if (!profileHeader || document.getElementById('quick-list-add-btn')) return;

  const username = window.location.pathname.replace('/', '').toLowerCase();

  const button = document.createElement('button');
  button.id = 'quick-list-add-btn';
  button.className = 'quick-list-add-btn';
  button.textContent = '+ List';
  button.title = 'Quick add to list';

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.textContent = 'Loading...';
    button.disabled = true;

    const userId = await getUserIdByUsername(username);
    if (!userId) {
      alert('Could not find user ID.');
      button.textContent = '+ List';
      button.disabled = false;
      return;
    }

    const lists = await fetchLists();
    if (lists.length === 0) {
      alert('No lists found. Create a list first on Twitter.');
      button.textContent = '+ List';
      button.disabled = false;
      return;
    }

    showListDropdown(lists, userId, button);
  });

  profileHeader.appendChild(button);
  log('Profile button added for @' + username);
}

// Main initialization
function init() {
  log('Extension initialized');

  checkAndAddProfileButton();
  addButtonsToTimelineTweets();

  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const url = location.href;

    if (url !== lastUrl) {
      lastUrl = url;
      processedTweets.clear();
      setTimeout(() => {
        checkAndAddProfileButton();
        addButtonsToTimelineTweets();
      }, 1000);
    } else {
      addButtonsToTimelineTweets();
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
