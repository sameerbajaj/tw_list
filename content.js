// Twitter List Quick Add Extension
// Adds a button to quickly add users to lists while browsing

const GRAPHQL_ENDPOINT = 'https://x.com/i/api/graphql';
const ADD_MEMBER_QUERY_ID = 'EadD8ivrhZhYQr2pDmCpjA';
const LISTS_QUERY_ID = 'xzVN0C62pNPWVfUjixdzeQ';
const USER_BY_SCREEN_NAME_QUERY_ID = '-oaLodhGbbnzJBACb1kk2Q';
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const DEBUG = true;

let cachedLists = null;
const processedTweets = new Set();
const userIdCache = new Map();
const pendingLookups = new Map(); // Track in-progress lookups to avoid duplicates

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
    return !!data.data;
  } catch (error) {
    log('ERROR adding user to list:', error);
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
function showListDropdown(lists, userId, button, username = '') {
  const existingDropdown = document.getElementById('quick-list-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'quick-list-dropdown';
  dropdown.className = 'quick-list-dropdown';

  if (username) {
    const header = document.createElement('div');
    header.className = 'quick-list-header';
    header.textContent = `Add @${username} to:`;
    dropdown.appendChild(header);
  }

  const selectedLists = new Set();

  lists.forEach(list => {
    const item = document.createElement('div');
    item.className = 'quick-list-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'quick-list-checkbox';
    checkbox.id = `list-checkbox-${list.id}`;

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
  submitButton.textContent = 'Add to Lists';

  submitButton.addEventListener('click', async (e) => {
    e.stopPropagation();

    if (selectedLists.size === 0) {
      submitButton.textContent = 'Select at least one list';
      setTimeout(() => {
        submitButton.textContent = 'Add to Lists';
      }, 2000);
      return;
    }

    submitButton.textContent = 'Adding...';
    submitButton.disabled = true;

    let successCount = 0;
    let failCount = 0;

    for (const listId of selectedLists) {
      const success = await addUserToList(listId, userId);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    if (failCount === 0) {
      submitButton.textContent = `✓ Added to ${successCount} list${successCount > 1 ? 's' : ''}`;
      setTimeout(() => {
        dropdown.remove();
        button.innerHTML = '✓';
        button.disabled = false;
        setTimeout(() => {
          button.innerHTML = '📋';
        }, 2000);
      }, 1000);
    } else {
      submitButton.textContent = `${successCount} succeeded, ${failCount} failed`;
      submitButton.disabled = false;
      setTimeout(() => {
        submitButton.textContent = 'Add to Lists';
      }, 3000);
    }
  });

  dropdown.appendChild(submitButton);

  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(dropdown);

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
