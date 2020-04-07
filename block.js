/*
 * block.js of pp-interrupter-lite
 *
 * Time-stamp: <2017-12-26T10:25:05Z>
 */

const details = JSON.parse(unescape(document.location.search.substr(1)));

function $ (aSelector, aNode) {
  return (aNode || document).querySelector(aSelector);
}

$('#authority-name').textContent = details.name;
$('#authority-url').textContent = details.url;

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type == "url") {
    sendResponse(details.url);
  } else if (req.type == "go") {
    location.replace(details.url);
  }
});

window.addEventListener("pageshow", e => {
  chrome.runtime.sendMessage({type: "show-icon"});
}, false);

window.addEventListener("pagehide", e => {
  chrome.runtime.sendMessage({type: "hide-icon"});
}, false);
