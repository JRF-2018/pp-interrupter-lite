/*
 * background.js of pp-interrupter
 *
 * Time-stamp: <2017-12-27T08:28:15Z>
 */
//console.log("background.js: ok");

var tabData = {};
var settings;
var notificationShown = false;
const notificationId = "pp-interrupter-lite-notification";
const myStorage = ('sync' in chrome.storage)?
  chrome.storage.sync : chrome.storage.local;

(async function () {
  let data = await (new Promise ((rs, rj) => {
    myStorage.get(null, x => {
      const e = chrome.runtime.lastError;
      if (e) rj(e);
      else rs(x);
    });
  }));
  if (! ('settings' in data) && myStorage != chrome.storage.local) {
    data = await (new Promise ((rs, rj) => {
      chrome.storage.local.get(null, x => {
	const e = chrome.runtime.lastError;
	if (e) rj(e);
	else rs(x);
      });
    }));
    chrome.storage.local.clear();
  }
//  console.log('background.js: storage init(a).');
  if ('settings' in data) {
    settings = data.settings;
  } else {
    settings = {};
  }
  for (let k in INIT_SETTINGS) {
    if (! (k in settings)) {
      settings[k] = INIT_SETTINGS[k];
    }
  }
  myStorage.set({
    settings: settings
  });
  updateBlocking();
})().catch(e => {
//  console.log('background.js: storage init(b).');
  settings = INIT_SETTINGS;
  myStorage.set({
    settings: settings
  });
  updateBlocking();
});

chrome.runtime.onMessageExternal.addListener(handleExternalMessage);
chrome.runtime.onMessage.addListener(handleMessage);

chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, {type: "url"}, url => {
    tabData[tab.id] = {url: url};
    chrome.tabs.sendMessage(tab.id, {type: "go"});
//    chrome.tabs.update(tab.id, {url: url, loadReplace: true});
  });
  if (tab.id in tabData) {
    delete tabData[tab.id];
  }
//  chrome.pageAction.hide(tab.id);
});

function blockRequest (details) {
//  console.log("blocking: " + details.requestId + " " + details.tabId + " " + details.url);
  if (details.tabId == -1) return {cancel: false};
  if (details.method != "GET") return {cancel: false};
  if (details.tabId in tabData 
      && 'url' in tabData[details.tabId]
      && tabData[details.tabId].url == details.url) {
    delete tabData[details.tabId];
    return {cancel: false};
  }
  let a = null;
  for (let i = 0; i < settings.authorities.length; i++) {
    const url = settings.authorities[i].url;
    if (details.url == url
	  || (details.url.length > url.length && 
	      details.url.substr(0, url.length) == url
	      && details.url.substr(url.length, 1).match(/[\?\&\/]/))) {
      a = settings.authorities[i];
      break;
    }
  }
  if (! a) return {cancel: false};
  if (details.originUrl) {
    const link = details.originUrl;
    if (link == a.url
	  || (link.length > a.url.length && 
	      link.substr(0, a.url.length) == a.url
	      && link.substr(a.url.length, 1).match(/[\?\&\/]/))) {
      return {cancel: false};
    }
  }

  const bl = "/block.html?" + escape(JSON.stringify({
    name: a.name,
    url: details.url
  }));
  chrome.tabs.update(details.tabId, {url: bl}, x => {
    chrome.pageAction.show(details.tabId);
  });

  return {cancel: true};
}

function updateBlocking () {
  if (chrome.webRequest.onBeforeRequest.hasListener(blockRequest)) {
    chrome.webRequest.onBeforeRequest.removeListener(blockRequest);
  }
  if (settings.authorities.length == 0) return;
  
  let l = [];
  for (let i = 0; i < settings.authorities.length; i++) {
    const a = settings.authorities[i];
    l.push(a.url + "*");
  }
  chrome.webRequest.onBeforeRequest.addListener(
    blockRequest,
    {
      urls: l,
      types: ["main_frame"]
    },
    ["blocking"]
  );
}

function handleExternalMessage (req, sender, sendResponse) {
  const f = {
    "permit": handlePermit
  };

  let x = false;
  for (let i = 0; i < settings.extensions.length; i++) {
    if (settings.extensions[i].id == sender.id) {
      x = true;
      break;
    }
  }
  if (! x) {
    return;
  }
  if (req.type in f) {
    return f[req.type](req, sender, sendResponse);
  } else {
//    console.log("background.js: unreacheable code.");
  }
}

function handlePermit (req, sender, sendResponse) {
//  console.log("background: permit");
  if (req.tabId in tabData) return;
//  console.log("permit: " + req.tabId + " " + req.url);
  tabData[req.tabId] = {url: req.url};
  sendResponse(true);
}

function handleMessage (req, sender, sendResponse) {
  const f = {
    "show-icon": handleShowIcon,
    "hide-icon": handleHideIcon,
    "get-settings": handleGetSettings,
    "update-settings": handleUpdateSettings,
    "add-from-pp-authorizer": handleAddFromPPAuthorizer
  };

  if (req.type in f) {
    return f[req.type](req, sender, sendResponse);
  } else {
//    console.log("background.js: unreacheable code.");
  }
}

function handleShowIcon (req, sender, sendResponse) {
  chrome.pageAction.show(sender.tab.id);
}

function handleHideIcon (req, sender, sendResponse) {
  chrome.pageAction.hide(sender.tab.id);
}

function handleGetSettings (req, sender, sendResponse) {
//  console.log("background: get-settings");
  sendResponse({settings: settings});
}

function handleUpdateSettings (req, sender, sendResponse) {
//  console.log("background: update-settings");
  settings = req.settings;
  updateBlocking();
  myStorage.set({
    settings: settings
  }, x => {
    sendResponse();
  });
  return true;
}

function handleAddFromPPAuthorizer (req, sender, sendResponse) {
//  console.log("background: add-from-pp-authorizer");
  chrome.runtime.sendMessage(PP_AUTHORIZER_ID, {type: "get-settings"}, x => {
    if (chrome.runtime.lastError) {
      sendResponse(false);
      return;
    }
    let l = Object.assign([], settings.authorities);
    for (let i = 0; i < x.authorities.length; i++) {
      const a = x.authorities[i];
      let y = false;
      for (let j = 0; j < settings.authorities.length; j++) {
	const b = settings.authorities[j];
	if (a.name == b.name && a.url == b.url) {
	  y = true;
	  break;
	}
      }
      if (! y) {
	l.push({name: a.name, url: a.url});
      }
    }
    settings.authorities = l;

    l = Object.assign([], settings.extensions);
    let y = false;
    for (let j = 0; j < settings.extensions.length; j++) {
      if (settings.extensions[j].id == PP_AUTHORIZER_ID) {
	y = true;
	break;
      }
    }
    if (! y) {
      l.push({name: "PP Authorizer", id: PP_AUTHORIZER_ID});
    }
    settings.extensions = l;
    
    updateBlocking();
    myStorage.set({
      settings: settings
    }, x => {
      sendResponse(true);
    });
  });
  return true;
}
