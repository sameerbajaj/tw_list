// Twitter List Manager & Settings Popup

// ===== TAB MANAGEMENT =====
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName).classList.add('active');
}

// ===== SETTINGS MANAGEMENT =====
const PRESETS = {
  conservative: {
    name: 'Conservative',
    requestDelay: 500,
    maxLookupsPerPeriod: 10,
    lookupPeriod: 10 * 60 * 1000
  },
  balanced: {
    name: 'Balanced',
    requestDelay: 300,
    maxLookupsPerPeriod: 20,
    lookupPeriod: 5 * 60 * 1000
  },
  aggressive: {
    name: 'Aggressive',
    requestDelay: 200,
    maxLookupsPerPeriod: 30,
    lookupPeriod: 5 * 60 * 1000
  }
};

const DEFAULT_PRESET = 'balanced';

function loadSettings() {
  const settings = localStorage.getItem('tw_list_settings');
  if (settings) {
    return JSON.parse(settings);
  }
  return {
    preset: DEFAULT_PRESET,
    ...PRESETS[DEFAULT_PRESET],
    skipMembershipCheck: false
  };
}

function saveSettings(preset, skipMembershipCheck) {
  const settings = {
    preset,
    ...PRESETS[preset],
    skipMembershipCheck
  };
  localStorage.setItem('tw_list_settings', JSON.stringify(settings));
  return settings;
}

function updateSettingsUI() {
  const settings = loadSettings();

  document.querySelectorAll('#settings .preset').forEach(el => {
    el.classList.remove('selected');
    if (el.dataset.preset === settings.preset) {
      el.classList.add('selected');
    }
  });

  document.getElementById('skip-membership-check').checked = settings.skipMembershipCheck || false;

  const cache = localStorage.getItem('tw_list_memberships');
  const cachedUsers = cache ? Object.keys(JSON.parse(cache).data || {}).length : 0;

  const statusEl = document.getElementById('current-status');
  statusEl.innerHTML = `
    <strong>Active:</strong> ${PRESETS[settings.preset].name}<br>
    <strong>Cached users:</strong> ${cachedUsers}<br>
    <strong>Request delay:</strong> ${settings.requestDelay}ms<br>
    <strong>Rate limit:</strong> ${settings.maxLookupsPerPeriod} users per ${settings.lookupPeriod / 60000} min<br>
    <strong>Check memberships:</strong> ${settings.skipMembershipCheck ? 'No (quick mode)' : 'Yes'}
  `;
}

// ===== LIST MANAGER =====
const GRAPHQL_ENDPOINT = 'https://x.com/i/api/graphql';
const LIST_MEMBERS_QUERY_ID = '8ybCIfKAYYex7FdmJ0PzwQ';
const LISTS_QUERY_ID = 'xzVN0C62pNPWVfUjixdzeQ';
const ADD_MEMBER_QUERY_ID = 'EadD8ivrhZhYQr2pDmCpjA';
const REMOVE_MEMBER_QUERY_ID = 'B5tMzrMYuFHJex_4EXFTSw';
const USER_BY_SCREEN_NAME_QUERY_ID = '-oaLodhGbbnzJBACb1kk2Q';
const DELETE_LIST_QUERY_ID = 'UnN9Th1BDbeLjpgjGSpL3Q';
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

let currentList = null;
let currentMembers = new Set();
let isProcessing = false;

async function getCsrfToken() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        resolve(null);
        return;
      }

      try {
        const cookies = await chrome.cookies.getAll({
          domain: '.x.com',
          name: 'ct0'
        });

        if (cookies && cookies.length > 0) {
          resolve(cookies[0].value);
        } else {
          resolve(null);
        }
      } catch (error) {
        console.error('Error getting CSRF token:', error);
        resolve(null);
      }
    });
  });
}

async function fetchLists() {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    showStatus('Please log in to X.com first', 'error');
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
      console.error('Lists API ERROR - Status:', response.status);
      return [];
    }

    const viewer = data?.data?.viewer;
    const instructions = viewer?.list_management_timeline?.timeline?.instructions || [];
    const addEntriesInstruction = instructions.find(inst => inst.type === 'TimelineAddEntries');

    if (!addEntriesInstruction) {
      return [];
    }

    const entries = addEntriesInstruction.entries || [];
    const lists = [];

    for (const entry of entries) {
      if (entry.content?.items) {
        for (const item of entry.content.items) {
          const list = item.item?.itemContent?.list;
          if (list && list.id_str && list.name && list.mode === 'Private') {
            lists.push({
              id: list.id_str,
              name: list.name
            });
          }
        }
      }
      else if (entry.content?.itemContent?.list) {
        const list = entry.content.itemContent.list;
        if (list.id_str && list.name && list.mode === 'Private') {
          lists.push({
            id: list.id_str,
            name: list.name
          });
        }
      }
    }

    return lists;
  } catch (error) {
    console.error('ERROR fetching lists:', error);
    showStatus('Error fetching lists: ' + error.message, 'error');
    return [];
  }
}

async function fetchListMembers(listId) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    showStatus('Authentication error', 'error');
    return [];
  }

  const params = new URLSearchParams({
    variables: JSON.stringify({
      listId: listId,
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

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${LIST_MEMBERS_QUERY_ID}/ListMembers?${params}`, {
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-client-language': 'en'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ListMembers API ERROR - Status:', response.status);
      return [];
    }

    const members = [];
    const instructions = data?.data?.list?.members_timeline?.timeline?.instructions || [];

    for (const instruction of instructions) {
      if (instruction.type === 'TimelineAddEntries') {
        const entries = instruction.entries || [];

        for (const entry of entries) {
          const userResult = entry.content?.itemContent?.user_results?.result;
          if (userResult?.core?.screen_name) {
            members.push(userResult.core.screen_name);
          }
        }
      }
    }

    return members;
  } catch (error) {
    console.error('ERROR fetching list members:', error);
    showStatus('Error fetching members: ' + error.message, 'error');
    return [];
  }
}

async function getUserIdByUsername(username) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) return null;

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

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?${params}`, {
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-client-language': 'en'
      }
    });

    const data = await response.json();
    return data?.data?.user?.result?.rest_id || null;
  } catch (error) {
    console.error('Error looking up user:', username, error);
    return null;
  }
}

async function addUserToList(listId, userId) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) return false;

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

    if (!response.ok) {
      console.error('Add user API error - Status:', response.status, 'Response:', data);

      // Check if it's a "user already on list" error - that's actually OK
      const errorMessage = data.errors?.[0]?.message || '';
      if (response.status === 400 && errorMessage.includes('already')) {
        console.log('ℹ️ User already on list - treating as success');
        return true;
      }

      return false;
    }

    console.log('✅ Add user API response:', data);

    // If we got here and response was OK, consider it a success
    return true;
  } catch (error) {
    console.error('ERROR adding user to list:', error);
    return false;
  }
}

async function removeUserFromList(listId, userId) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) return false;

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
      console.error('Remove user API error - Status:', response.status, 'Response:', data);

      // Check if it's a "user not on list" error - that's actually OK
      const errorMessage = data.errors?.[0]?.message || '';
      if (response.status === 400 && (errorMessage.includes('not') || errorMessage.includes('already'))) {
        console.log('ℹ️ User not on list - treating as success');
        return true;
      }

      return false;
    }

    console.log('✅ Remove user API response:', data);

    // If we got here and response was OK, consider it a success
    return true;
  } catch (error) {
    console.error('ERROR removing user from list:', error);
    return false;
  }
}

async function deleteList(listId) {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) return false;

  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}/${DELETE_LIST_QUERY_ID}/DeleteList`, {
      method: 'POST',
      headers: {
        'authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
        'x-twitter-client-language': 'en'
      },
      body: JSON.stringify({
        variables: {
          listId: listId
        },
        queryId: DELETE_LIST_QUERY_ID
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Delete list API error - Status:', response.status, 'Response:', data);
      return false;
    }

    console.log('✅ Delete list API response:', data);

    // Check if deletion was successful
    if (data.data?.list_delete === 'Done') {
      return true;
    }

    return false;
  } catch (error) {
    console.error('ERROR deleting list:', error);
    return false;
  }
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status visible ${type}`;

  setTimeout(() => {
    statusEl.classList.remove('visible');
  }, 5000);
}

function updateMemberCount() {
  const count = currentMembers.size;
  document.getElementById('member-count').textContent =
    count > 0 ? `${count} member${count !== 1 ? 's' : ''}` : '';
}

function detectChanges() {
  if (!currentList) return { toAdd: [], toRemove: [] };

  const textarea = document.getElementById('members-textarea');
  const lines = textarea.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^@/, ''));

  const newHandles = new Set(lines);

  const toAdd = [...newHandles].filter(handle => !currentMembers.has(handle));
  const toRemove = [...currentMembers].filter(handle => !newHandles.has(handle));

  return { toAdd, toRemove };
}

function updateSaveButton() {
  const { toAdd, toRemove } = detectChanges();
  const saveBtn = document.getElementById('save-changes-btn');

  if (toAdd.length > 0 || toRemove.length > 0) {
    saveBtn.style.display = 'block';
    const changes = [];
    if (toAdd.length > 0) changes.push(`+${toAdd.length}`);
    if (toRemove.length > 0) changes.push(`-${toRemove.length}`);
    saveBtn.textContent = `Save Changes (${changes.join(', ')})`;
  } else {
    saveBtn.style.display = 'none';
  }
}

async function handleSaveChanges() {
  if (!currentList || isProcessing) return;

  const { toAdd, toRemove } = detectChanges();

  if (toAdd.length === 0 && toRemove.length === 0) {
    showStatus('No changes to save', 'info');
    return;
  }

  // Build confirmation message
  let confirmMessage = `You are about to make the following changes to "${currentList.name}":\n\n`;

  if (toAdd.length > 0) {
    confirmMessage += `➕ ADD ${toAdd.length} member${toAdd.length !== 1 ? 's' : ''}:\n`;
    toAdd.forEach(handle => {
      confirmMessage += `  • @${handle}\n`;
    });
    confirmMessage += '\n';
  }

  if (toRemove.length > 0) {
    confirmMessage += `➖ REMOVE ${toRemove.length} member${toRemove.length !== 1 ? 's' : ''}:\n`;
    toRemove.forEach(handle => {
      confirmMessage += `  • @${handle}\n`;
    });
  }

  confirmMessage += '\nDo you want to proceed?';

  if (!confirm(confirmMessage)) {
    showStatus('Changes cancelled', 'info');
    return;
  }

  isProcessing = true;
  const saveBtn = document.getElementById('save-changes-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  let successCount = 0;
  let failCount = 0;

  // Process additions
  for (const handle of toAdd) {
    showStatus(`Adding @${handle}...`, 'info');

    const userId = await getUserIdByUsername(handle);
    if (!userId) {
      showStatus(`⚠️ Could not find user @${handle}`, 'error');
      failCount++;
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }

    const success = await addUserToList(currentList.id, userId);
    if (success) {
      currentMembers.add(handle);
      successCount++;
      showStatus(`✓ Added @${handle}`, 'success');
    } else {
      failCount++;
      showStatus(`❌ Failed to add @${handle}`, 'error');
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Process removals
  for (const handle of toRemove) {
    showStatus(`Removing @${handle}...`, 'info');

    const userId = await getUserIdByUsername(handle);
    if (!userId) {
      showStatus(`⚠️ Could not find user @${handle}`, 'error');
      failCount++;
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }

    const success = await removeUserFromList(currentList.id, userId);
    if (success) {
      currentMembers.delete(handle);
      successCount++;
      showStatus(`✓ Removed @${handle}`, 'success');
    } else {
      failCount++;
      showStatus(`❌ Failed to remove @${handle}`, 'error');
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Update textarea to reflect successful changes
  const textarea = document.getElementById('members-textarea');
  textarea.value = [...currentMembers].sort().join('\n');

  updateMemberCount();
  updateSaveButton();

  saveBtn.disabled = false;

  // Show final status
  if (successCount > 0 && failCount === 0) {
    showStatus(`✅ Successfully saved ${successCount} change${successCount !== 1 ? 's' : ''}`, 'success');
  } else if (successCount > 0 && failCount > 0) {
    showStatus(`⚠️ Saved ${successCount} change${successCount !== 1 ? 's' : ''}, ${failCount} failed`, 'error');
  } else {
    showStatus(`❌ All changes failed`, 'error');
  }

  isProcessing = false;
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'settings') {
        updateSettingsUI();
      }
    });
  });

  // Settings preset selection
  document.querySelectorAll('#settings .preset').forEach(preset => {
    preset.addEventListener('click', () => {
      document.querySelectorAll('#settings .preset').forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');
    });
  });

  // Save settings button
  document.getElementById('save').addEventListener('click', () => {
    const selected = document.querySelector('#settings .preset.selected');
    if (selected) {
      const preset = selected.dataset.preset;
      const skipMembershipCheck = document.getElementById('skip-membership-check').checked;
      saveSettings(preset, skipMembershipCheck);

      const btn = document.getElementById('save');
      const originalText = btn.textContent;
      btn.textContent = '✓ Saved!';
      setTimeout(() => {
        btn.textContent = originalText;
        window.close();
      }, 1000);
    }
  });

  // Clear cache button
  document.getElementById('clear-cache').addEventListener('click', () => {
    if (confirm('Clear all cached list memberships? This will not affect your lists on Twitter.')) {
      localStorage.removeItem('tw_list_memberships');
      localStorage.removeItem('tw_list_activity');

      const btn = document.getElementById('clear-cache');
      const originalText = btn.textContent;
      btn.textContent = '✓ Cleared!';
      setTimeout(() => {
        btn.textContent = originalText;
        updateSettingsUI();
      }, 1000);
    }
  });

  // List Manager: Load lists
  const listSelect = document.getElementById('list-select');
  const fetchBtn = document.getElementById('fetch-btn');
  const textarea = document.getElementById('members-textarea');

  const lists = await fetchLists();

  if (lists.length === 0) {
    listSelect.innerHTML = '<option value="">No private lists found</option>';
    showStatus('No private lists found. Create one on X.com first.', 'error');
  } else {
    listSelect.innerHTML = '<option value="">-- Select a list --</option>';
    lists.forEach(list => {
      const option = document.createElement('option');
      option.value = list.id;
      option.textContent = list.name;
      listSelect.appendChild(option);
    });
  }

  const deleteBtn = document.getElementById('delete-list-btn');

  listSelect.addEventListener('change', () => {
    const hasSelection = !!listSelect.value;
    fetchBtn.disabled = !hasSelection;
    deleteBtn.disabled = !hasSelection;
  });

  // Delete button click handler
  deleteBtn.addEventListener('click', async () => {
    const listId = listSelect.value;
    if (!listId) return;

    const selectedList = lists.find(l => l.id === listId);
    if (!selectedList) return;

    // Confirmation dialog
    const confirmMessage = `⚠️ Are you sure you want to DELETE the list "${selectedList.name}"?\n\nThis action cannot be undone!\n\nAll members will be removed and the list will be permanently deleted.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // Disable button during deletion
    deleteBtn.disabled = true;
    deleteBtn.textContent = '⏳';

    const success = await deleteList(listId);

    if (success) {
      showStatus(`✅ List "${selectedList.name}" deleted successfully`, 'success');

      // Remove from lists array
      const index = lists.findIndex(l => l.id === listId);
      if (index > -1) {
        lists.splice(index, 1);
      }

      // Remove from dropdown
      const optionToRemove = listSelect.querySelector(`option[value="${listId}"]`);
      if (optionToRemove) {
        optionToRemove.remove();
      }

      // Reset UI
      listSelect.value = '';
      fetchBtn.disabled = true;
      deleteBtn.disabled = true;
      deleteBtn.textContent = '🗑️';

      // Clear textarea and current list
      textarea.value = '';
      currentList = null;
      currentMembers.clear();
      updateMemberCount();

      // Update dropdown message if no lists left
      if (lists.length === 0) {
        listSelect.innerHTML = '<option value="">No private lists found</option>';
      }
    } else {
      showStatus(`❌ Failed to delete list "${selectedList.name}"`, 'error');
      deleteBtn.disabled = false;
      deleteBtn.textContent = '🗑️';
    }
  });

  fetchBtn.addEventListener('click', async () => {
    const listId = listSelect.value;
    if (!listId) return;

    const selectedList = lists.find(l => l.id === listId);
    currentList = selectedList;

    fetchBtn.disabled = true;
    const originalText = fetchBtn.textContent;
    fetchBtn.innerHTML = 'Fetching<span class="loading"></span>';

    const members = await fetchListMembers(listId);

    currentMembers = new Set(members);
    textarea.value = members.join('\n');
    updateMemberCount();

    fetchBtn.disabled = false;
    fetchBtn.textContent = originalText;

    if (members.length > 0) {
      showStatus(`Loaded ${members.length} member${members.length !== 1 ? 's' : ''} from ${selectedList.name}`, 'success');
    } else {
      showStatus(`No members found in ${selectedList.name}`, 'info');
    }
  });

  // Update save button when textarea changes
  textarea.addEventListener('input', () => {
    updateSaveButton();
  });

  // Handle save button click
  document.getElementById('save-changes-btn').addEventListener('click', handleSaveChanges);
});
