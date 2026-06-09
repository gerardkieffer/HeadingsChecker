const actions = {
    toggle: (tabId, params, options) => {
        const message = {action: 'toggle', params: params};
        sendMessage(tabId, message, {frameId: 0}, () => {
        });
    },
    getDocumentList,
    getFrames,
    getHeadingsMapFromFrame: getHeadingsCheckerFromFrame,
    showResultsFromFrame,
    highlightElementInFrame,
    scrollFrameDocumentToTop,
    closeWidget,
    initialize,
    setDocumentList,
    update,
    copyResults,
    toggleRevealElements,
    hideRevealedHeadings,
    addClassToPanel,
    removeClassFromPanel,
    highlightElementInTree,
    clearHighlightedElementsInTree,
    scrollElementInTree,
    viewportIndicator,
    documentKeydown,
    documentClick,
};

const URLBlackList = [
    'about:blank',
    'apis.google.com',
    'accounts.google.com/o/oauth',
    'doubleclick.net',
    'staticxx.facebook.com',
    'platform.twitter.com/widgets/widget_iframe',
    'platform.twitter.com/widgets/follow_button',
    'www.google.com/uviewer',
    'webshell.suite.office.com/iframe'
];

let documents = [];

// if manifest v2
chrome.browserAction?.onClicked.addListener(sendMessageToToggle);

// if manifest v3
chrome.action?.onClicked.addListener(sendMessageToToggle);

chrome.tabs.onActivated.addListener(onActivateTab);

chrome.tabs.onUpdated.addListener(onUpdated);

chrome.runtime.onMessage.addListener(messageReceiver);

chrome.tabs.onRemoved.addListener(onRemoved);

function messageReceiver(message, sender, sendResponse) {
    const tabId = sender.tab.id;
    const frameId = sender.frameId;

    if (!message.action) {
        actions[message] && actions[message](tabId, frameId);
    } else {
        actions[message.action] && actions[message.action](tabId, message.params, frameId);
    }
    sendResponse({});
}

function sendMessage(tabId, message, options, callback = () => {
}) {
    (async () => {
        const response = await chrome.tabs.sendMessage(tabId, message, options);
        callback(response);
    })();
}

function onUpdated(tabId, changeInfo, tabInfo) {
    if(changeInfo.status === 'complete') {
        const message = {action: 'isOpen', params: {}};
        sendMessage(tabId, message, {}, () => {
            sendMessage(tabId, {action: 'update', params: {}}, {frameId: 0})
        });
    }
}

function onRemoved(tabId, removeInfo) {
    if (removeInfo.isWindowClosing) {
        saveSetting('pinnedTabs', '');
    } else {
        getPinnedInfo((pinnedInfo) => {
            const pinnedTabs = (pinnedInfo && pinnedInfo.pinnedTabs?.split(',')) || [];
            const isTabIncluded = pinnedTabs.indexOf(`${tabId}`) > -1;
            if (isTabIncluded) {
                pinnedTabs.splice(pinnedTabs.indexOf(`${tabId}`), 1);
            }
            saveSetting('pinnedTabs', pinnedTabs.join(','));
        });
    }
}

function onActivateTab(activeInfo) {
    getPinnedInfo((pinnedInfo) => {
        let message = {action: 'getDomainInfo', params: {}};
        sendMessage(activeInfo.tabId, message, {}, (domainInfo) => {
            message = {action: 'updatePinnedStatus', params: {}};
            sendMessage(activeInfo.tabId, message, {}, (domainInfo) => {
                message = {action: 'isOpen', params: {}};
                sendMessage(activeInfo.tabId, message, {}, (isOpenInfo) => {
                    if (isOpenInfo?.isOpen) {
                        return;
                    }
                    const URLsToPinTo = (pinnedInfo && pinnedInfo.pinnedByURL?.split(',')) || [];
                    const URL = domainInfo?.params?.URL;
                    const isURLIncluded = URLsToPinTo.indexOf(URL) > -1 && !!URL.trim().length;
                    if (isURLIncluded) {
                        toggleExtension(activeInfo.tabId, {shouldPinToTab: true});
                        return;
                    }
                    const domainsToPinTo = (pinnedInfo && pinnedInfo.pinnedByDomain?.split(',')) || [];
                    const domain = domainInfo?.params?.domain;
                    const isDomainIncluded = domainsToPinTo.indexOf(domain) > -1 && !!domain.trim().length;
                    if (isDomainIncluded) {
                        toggleExtension(activeInfo.tabId, {shouldPinToTab: true});
                    }
                });
            });
        });
    });
}

function update(tabId, params) {
    getPinnedInfo((pinnedInfo) => {
        const pinnedTabs = (pinnedInfo && pinnedInfo.pinnedTabs?.split(',')) || [];
        const isTabIncluded = pinnedTabs.indexOf(`${tabId}`) > -1;
        const domain = params.domain;
        const domainsToPinTo = (pinnedInfo && pinnedInfo.pinnedByDomain?.split(',')) || [];
        const isDomainIncluded = domainsToPinTo.indexOf(domain) > -1 && !!domain.trim().length;
        const URLsToPinTo = (pinnedInfo && pinnedInfo.pinnedByURL?.split(',')) || [];
        const URL = params.URL;
        const isURLIncluded = URLsToPinTo.indexOf(URL) > -1;
        if (isTabIncluded || isDomainIncluded || isURLIncluded) {
            toggleExtension(tabId, {shouldPinToTab: isTabIncluded});
        }
    });
}

function sendMessageToToggle(tab, params = {shouldPinToTab: true}) {
    const tabId = tab.id;

    sendMessage(tabId, {execute: true}, {frameId: 0}, (responseMessage) => {
        toggleHeadingsChecker(tabId, params)();
    });
}

function getFrames(tabId, params) {
    chrome.webNavigation.getAllFrames(
        {tabId},
        function (frameDetails) {
            const frames = [];

            frameDetails.forEach((frameDetail) => {
                if (!isInBlackList(frameDetail.url)) {
                    let {frameId, url, parentFrameId, errorOccurred} = frameDetail;
                    !errorOccurred && frames.push({url, frameId, parentFrameId});
                }
            })
            const message = {action: 'setFrameIds', params: Object.assign({frames}, params)};
            sendMessage(tabId, message, {frameId: 0}, (domainInfo) => {
            });
        }
    );
}

function getDocumentList(tabId, params) {
    chrome.webNavigation.getAllFrames(
        {tabId},
        function (frameDetails) {
            documents = [];

            frameDetails.forEach((frameDetail) => {
                if (!isInBlackList(frameDetail.url)) {
                    let {frameId, url, parentFrameId, errorOccurred} = frameDetail;
                    !errorOccurred && documents.push({url, frameId, parentFrameId});
                }
            })
            documents.sort(function (a, b) {
                return a.frameId - b.frameId;
            });
            documents.forEach((document) => {
                const frameId = document.frameId;
                const updatedParams = Object.assign({withHref: true, frameId}, params)
                const message = {
                    action: 'getDocumentTitle', params: Object.assign(updatedParams, {frameId}, () => {
                    })
                };
                sendMessage(tabId, message, {}, () => {
                });
            })
        }
    );
}

function toggleRevealElements(tabId, params) {
    const message = {action: 'toggleRevealElements', params: Object.assign({}, params)};
    sendMessage(tabId, message, {}, () => {
    });
}

function hideRevealedHeadings(tabId, params) {
    const message = {action: 'removeElementsViewer', params: {}};
    sendMessage(tabId, message, {}, () => {
    });
}

function highlightElementInTree(tabId, params) {
    const message = {action: 'highlightTreeNode', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function clearHighlightedElementsInTree(tabId, params) {
    const message = {action: 'clearHighlightedTreeNodes', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function scrollElementInTree(tabId, params) {
    const message = {action: 'scrollElementInTree', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function viewportIndicator(tabId, params) {
    const message = {action: 'viewportIndicator', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function addClassToPanel(tabId, params) {
    const message = {action: 'addClassToPanel', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function removeClassFromPanel(tabId, params) {
    const message = {action: 'removeClassFromPanel', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function documentKeydown(tabId, params) {
    const message = {action: 'documentKeydown', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function documentClick(tabId, params) {
    const message = {action: 'documentClick', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function setDocumentList(tabId, params, frameId) {
    if (params && params.documentTitle) {
        const document = documents.find((document) => document.frameId === frameId);
        if (document) {
            document.title = params.documentTitle;
        }
    }
    const message = {action: 'updateListOfDocuments', params: Object.assign({documents}, params)};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function isInBlackList(urlToCheck) {
    const URLBlackListLength = URLBlackList.length;

    for (let i = 0; i < URLBlackListLength; i++) {
        if (urlToCheck.indexOf(URLBlackList[i]) >= 0) {
            return true;
        }
    }
    return false;
}


function getHeadingsCheckerFromFrame(tabId, params) {
    const frameId = params.frameId;

    let message = {action: 'connectMutationObserverInDocument', params: params};
    sendMessage(tabId, message, {frameId}, () => {
        message = {action: 'getDocumentStructure', params: Object.assign({browserLanguage: getLanguage()}, params)};
        sendMessage(tabId, message, {frameId}, () => {
        });
    });
}

function showResultsFromFrame(tabId, params) {
    const message = {action: 'showResultsFromFrame', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function copyResults(tabId, params) {
    const message = {action: 'copyTreeResults', params: params};
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function highlightElementInFrame(tabId, params) {
    const frameId = params.frameId;

    const message = {action: 'highlightElementInFrame', params: params};
    sendMessage(tabId, message, {frameId}, () => {
    });
}

function scrollFrameDocumentToTop(tabId, params) {
    const frameId = params.frameId;

    const message = {action: 'scrollFrameDocumentToTop', params: params};
    sendMessage(tabId, message, {frameId}, () => {
    });
}

function closeWidget(tabId) {
    let message = {action: 'removeElementsViewer', params: {}};
    sendMessage(tabId, message, {}, () => {
        message = {action: 'removeIntersectionObservers', params: {}};
        sendMessage(tabId, message, {}, () => {
            message = {action: 'closeWidget', params: {}};
            sendMessage(tabId, message, {}, () => {
            });
        });
    });
}

function toggleHeadingsChecker(tabId, params = {}) {
    return () => {
        actions.toggle(tabId, params);
    }
}

function initialize(tabId, params = {}) {
    const browserLanguage = getLanguage();
    const message = {
        action: 'initializeWidget', params: Object.assign(params, {
            browserLanguage: browserLanguage,
            tabId
        })
    };
    sendMessage(tabId, message, {frameId: 0}, () => {
    });
}

function toggleExtension(tabId, params = {}) {
    sendMessageToToggle({id: tabId}, params);
}

function getLanguage() {
    return chrome.i18n.getUILanguage();
}

function getPinnedInfo(callback) {
    const savedSettings = chrome.storage.local.get(['pinnedTabs', 'pinnedByDomain', 'pinnedByURL', 'pinned'], (settings) => {
        callback(settings);
    });

    try {
        // FF: chrome.storage.local.get returns a promise
        // this try-catch prevents error in Chrome
        savedSettings.then((settings) => {
            callback(settings);
        });
    } catch (err) {
    }
}

function saveSetting(optionId, value) {
    const option = {};
    option[optionId] = value;
    chrome.storage.local.set(option);
}
