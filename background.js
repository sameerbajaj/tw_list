const GRAPHQL_ENDPOINT = 'https://x.com/i/api/graphql';

const ROOT_MENU_ID = 'twlist-root';
const REFRESH_MENU_ID = 'twlist-refresh';
const EMPTY_MENU_ID = 'twlist-empty';
const DYNAMIC_MENU_PREFIX = 'twlist-list-';
const MENU_CONTEXTS = ['page', 'link', 'selection'];
const DOCUMENT_URL_PATTERNS = [
  'https://x.com/*',
  'https://twitter.com/*',
  'https://pro.x.com/*'
];
const LISTS_CACHE_TTL = 60 * 1000;

const LISTS_QUERY_ID = 'xzVN0C62pNPWVfUjixdzeQ';
const ADD_MEMBER_QUERY_ID = 'EadD8ivrhZhYQr2pDmCpjA';
const USER_BY_SCREEN_NAME_QUERY_ID = '-oaLodhGbbnzJBACb1kk2Q';
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const LISTS_FEATURES = {
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
};

const USER_LOOKUP_FEATURES = {
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

const USER_LOOKUP_FIELD_TOGGLES = {
  withPayments: false,
  withAuxiliaryUserLabels: true
};

const MUTATION_FEATURES = {
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: true
};

const RESERVED_PATH_SEGMENTS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'i',
  'search',
  'settings',
  'compose',
  'login',
  'signup',
  'tos',
  'privacy',
  'help',
  'share'
]);

let dynamicMenuIds = [];
let listCache = {
  items: [],
  fetchedAt: 0
};

function promisifyChrome(method, target, ...args) {
  return new Promise((resolve) => {
    target[method](...args, (...callbackArgs) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ value: callbackArgs[0] });
    });
  });
}

async function createMenu(properties) {
  chrome.contextMenus.create(properties);
}

async function removeMenu(menuId) {
  await promisifyChrome('remove', chrome.contextMenus, menuId);
}

async function removeAllMenus() {
  await promisifyChrome('removeAll', chrome.contextMenus);
}

async function getCsrfToken() {
  const { value: cookies = [] } = await promisifyChrome('getAll', chrome.cookies, { name: 'ct0' });
  const cookie = cookies.find((entry) => (
    entry.domain === '.x.com' ||
    entry.domain === 'x.com' ||
    entry.domain === '.twitter.com' ||
    entry.domain === 'twitter.com'
  ));

  return cookie ? cookie.value : null;
}

async function fetchPrivateLists(forceRefresh = false) {
  const isCacheValid = !forceRefresh && (Date.now() - listCache.fetchedAt) < LISTS_CACHE_TTL;
  if (isCacheValid) {
    return listCache.items;
  }

  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    return [];
  }

  const params = new URLSearchParams({
    variables: JSON.stringify({ count: 100 }),
    features: JSON.stringify(LISTS_FEATURES)
  });

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${LISTS_QUERY_ID}/ListsManagementPageTimeline?${params}`, {
      headers: {
        authorization: BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-client-language': 'en'
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return [];
    }

    const instructions = data?.data?.viewer?.list_management_timeline?.timeline?.instructions || [];
    const addEntriesInstruction = instructions.find((item) => item.type === 'TimelineAddEntries');
    const entries = addEntriesInstruction?.entries || [];
    const lists = [];

    for (const entry of entries) {
      if (entry.content?.items) {
        for (const item of entry.content.items) {
          const list = item.item?.itemContent?.list;
          if (list?.id_str && list?.name && list?.mode === 'Private') {
            lists.push({ id: list.id_str, name: list.name });
          }
        }
      } else if (entry.content?.itemContent?.list) {
        const list = entry.content.itemContent.list;
        if (list?.id_str && list?.name && list?.mode === 'Private') {
          lists.push({ id: list.id_str, name: list.name });
        }
      }
    }

    listCache = {
      items: lists,
      fetchedAt: Date.now()
    };

    return lists;
  } catch {
    return [];
  }
}

async function getUserIdByUsername(username) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    return null;
  }

  const params = new URLSearchParams({
    variables: JSON.stringify({
      screen_name: username,
      withGrokTranslatedBio: false
    }),
    features: JSON.stringify(USER_LOOKUP_FEATURES),
    fieldToggles: JSON.stringify(USER_LOOKUP_FIELD_TOGGLES)
  });

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?${params}`, {
      headers: {
        authorization: BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-client-language': 'en'
      }
    });
    const data = await response.json();

    if (!response.ok) {
      return null;
    }

    return data?.data?.user?.result?.rest_id || null;
  } catch {
    return null;
  }
}

async function addUserToList(listId, userId) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    return false;
  }

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${ADD_MEMBER_QUERY_ID}/ListAddMember`, {
      method: 'POST',
      headers: {
        authorization: BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
        'x-twitter-client-language': 'en'
      },
      body: JSON.stringify({
        variables: {
          listId,
          userId
        },
        features: MUTATION_FEATURES,
        queryId: ADD_MEMBER_QUERY_ID
      })
    });
    const data = await response.json();
    return response.ok && !!data?.data;
  } catch {
    return false;
  }
}

function extractUsernameFromUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (!DOCUMENT_URL_PATTERNS.some((pattern) => rawUrl.startsWith(pattern.replace('*', '')))) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    const candidate = segments[0].replace(/^@/, '');
    if (RESERVED_PATH_SEGMENTS.has(candidate.toLowerCase())) {
      return null;
    }

    return /^[A-Za-z0-9_]{1,15}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function extractUsernameFromSelection(selectionText) {
  if (!selectionText) {
    return null;
  }

  const trimmed = selectionText.trim();
  const directMatch = trimmed.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (directMatch) {
    return directMatch[1];
  }

  const embeddedMatch = trimmed.match(/@([A-Za-z0-9_]{1,15})/);
  return embeddedMatch ? embeddedMatch[1] : null;
}

function extractUsernameFromInfo(info) {
  return extractUsernameFromUrl(info.linkUrl) || extractUsernameFromSelection(info.selectionText);
}

async function clearDynamicMenus() {
  const ids = [...dynamicMenuIds];
  dynamicMenuIds = [];

  for (const id of ids) {
    await removeMenu(id);
  }
}

async function rebuildBaseMenus(forceRefresh = false) {
  await removeAllMenus();

  createMenu({
    id: ROOT_MENU_ID,
    title: 'Add to X List',
    contexts: MENU_CONTEXTS,
    documentUrlPatterns: DOCUMENT_URL_PATTERNS
  });

  createMenu({
    id: REFRESH_MENU_ID,
    parentId: ROOT_MENU_ID,
    title: 'Refresh private lists',
    contexts: MENU_CONTEXTS,
    documentUrlPatterns: DOCUMENT_URL_PATTERNS
  });

  await clearDynamicMenus();

  const lists = await fetchPrivateLists(forceRefresh);

  if (lists.length === 0) {
    createMenu({
      id: EMPTY_MENU_ID,
      parentId: ROOT_MENU_ID,
      title: 'No private lists found',
      contexts: MENU_CONTEXTS,
      documentUrlPatterns: DOCUMENT_URL_PATTERNS,
      enabled: false
    });
    dynamicMenuIds.push(EMPTY_MENU_ID);
  } else {
    for (const list of lists) {
      const menuId = `${DYNAMIC_MENU_PREFIX}${list.id}`;
      createMenu({
        id: menuId,
        parentId: ROOT_MENU_ID,
        title: list.name,
        contexts: MENU_CONTEXTS,
        documentUrlPatterns: DOCUMENT_URL_PATTERNS
      });
      dynamicMenuIds.push(menuId);
    }
  }
}

async function showNotification(title, message) {
  await promisifyChrome('create', chrome.notifications, {
    type: 'basic',
    iconUrl: 'icon48.png',
    title,
    message
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildBaseMenus();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildBaseMenus();
});

rebuildBaseMenus();

chrome.contextMenus.onClicked.addListener(async (info) => {
  const username = extractUsernameFromInfo(info);

  if (info.menuItemId === REFRESH_MENU_ID) {
    await rebuildBaseMenus(true);
    const lists = await fetchPrivateLists();
    await showNotification('TwList', lists.length > 0 ? `Loaded ${lists.length} private list${lists.length === 1 ? '' : 's'}.` : 'No private lists found.');
    return;
  }

  if (!String(info.menuItemId).startsWith(DYNAMIC_MENU_PREFIX)) {
    return;
  }

  if (!username) {
    await showNotification('TwList', 'Right-click directly on a username link or a selected @handle.');
    return;
  }

  const listId = String(info.menuItemId).slice(DYNAMIC_MENU_PREFIX.length);
  const lists = await fetchPrivateLists();
  const selectedList = lists.find((list) => String(list.id) === listId);

  if (!selectedList) {
    await showNotification('TwList', 'That list is no longer available. Refresh the menu and try again.');
    return;
  }

  const userId = await getUserIdByUsername(username);
  if (!userId) {
    await showNotification('TwList', `Could not resolve @${username}.`);
    return;
  }

  const success = await addUserToList(listId, userId);
  if (success) {
    await showNotification('TwList', `Added @${username} to ${selectedList.name}.`);
  } else {
    await showNotification('TwList', `Could not add @${username} to ${selectedList.name}.`);
  }
});