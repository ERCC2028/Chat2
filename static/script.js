// @ts-check

/** @typedef {{ id: number, reply: number | null, timestamp: number, username: string, color: string, content: string }} Message */

/** @type {HTMLDivElement} */
// @ts-ignore
const messagesDiv = document.getElementById("messages");

/** @type {HTMLDivElement} */
// @ts-ignore
const replyDiv = document.getElementById("reply");

/** @type {HTMLSpanElement} */
// @ts-ignore
const replyContent = document.getElementById("reply-content");

/** @type {HTMLInputElement} */
// @ts-ignore
const messageInput = document.getElementById("message-input");

/** @type {HTMLButtonElement} */
// @ts-ignore
const sendMessageButton = document.getElementById("send-button");


const urlPattern = /\b((?:https?):\/\/|data:)(\w+:?\w*)?(\S+)(:\d+)?(\/|\/([\w#!:.?+=&%!\-\/]))?\b/g;

const webSocketURL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;

/** @type {WebSocket} */
var webSocket;

/** @type {Message[]} */
var messages = [];

/** @type {number | null} */
var reply = null;

addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.code === "Enter")
        sendMessage();
});

setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight + messagesDiv.clientHeight;
}, 1000);

messageInput.addEventListener("input", updateMessageInputHeigth);

initWebSocket();
onWebSocketOpen();

/**
 * @param {string} url
 * @returns {void}
 */
function initWebSocket(url = webSocketURL) {
    webSocket = new WebSocket(url);
    webSocket.onopen = onWebSocketOpen;
    webSocket.onmessage = onWebSocketMessage;
    webSocket.onerror = onWebSocketError;
    webSocket.onclose = onWebSocketClose;
}

/**
 * 
 * @returns {void}
 */
function onWebSocketOpen() {
    sendMessageButton.disabled = false;
}

/**
 * 
 * @param {MessageEvent} event 
 * @returns {void}
 */
function onWebSocketMessage(event) {
    const newMessages = parseNewMessages(event.data);;

    if (newMessages.length > 1) {
        messagesDiv.innerHTML = "";
        messages = [];
    }

    for (const newMessage of newMessages)
        appendMessage(newMessage);

    var toggle = false;
    const interval = setInterval(() => {
        messagesDiv.style.borderColor = toggle ? "black" : "red";
        toggle = !toggle;
    }, 100);
    setTimeout(() => {
        messagesDiv.style.borderColor = "black";
        clearInterval(interval)
    }, 600);
}

/**
 * 
 * @param {Event} event 
 * @returns {void}
 */
function onWebSocketError(event) {
    console.error(event);
    //alert("WebSocket error !");
}

/**
 * 
 * @returns {void}
 */
function onWebSocketClose() {
    sendMessageButton.disabled = true;
    initWebSocket();
}

/**
 * @param {Message} message
 * @returns {void}
 */
function appendMessage(message) {
    messages.push(message);

    const scroll = Math.abs(messagesDiv.scrollTop + messagesDiv.clientHeight - messagesDiv.scrollHeight) < 5;

    messagesDiv.innerHTML += embedMessage(message);

    if (scroll)
        messagesDiv.scrollTop = messagesDiv.scrollHeight + messagesDiv.clientHeight;
}

function updateMessageInputHeigth() {
    messageInput.style.height = "auto";
    messageInput.style.height = `min(max(${messageInput.scrollHeight}px, 35.63px), 30vh)`;
}

/**
 * @param {number | null} messageId
 * @returns {void}
 */
function setReply(messageId) {
    reply = messageId;

    if (messageId === null) {
        replyDiv.style.display = "none";
        return;
    }

    const message = getMessageById(messageId);
    replyContent.innerHTML = message !== null ? embedMessageContent(message) : embedError("Message introuvable");

    replyDiv.style.display = "flex";
}

/**
 * @returns {void}
 */
function sendMessage(messageContent = messageInput.value) {
    if (messageContent === "!logout") {
        document.cookie = "username=";
        document.cookie = "password=";
        // @ts-ignore
        location.reload(true);
        return;
    }

    webSocket.send(`${reply ?? ""};${messageContent}`);

    messageInput.value = "";
    updateMessageInputHeigth();
    setReply(null);
}



/**
 * @param {string} data
 * @returns {Message[]}
 */
function parseNewMessages(data) {
    if (data === "")
        return [];
    const datas = data.split("");
    /** @type {Message[]} */
    const messages = [];

    for (const data of datas)
        messages.push(parseNewMessage(data));

    return messages;
}

/**
 * @param {string} data
 * @returns {Message}
 */
function parseNewMessage(data) {
    const [
        id,
        reply,
        timestamp,
        username,
        color,
        ...content
    ] = data.split(";");

    return {
        id: Number(id),
        reply: reply !== "" ? Number(reply) : null,
        timestamp: Number(timestamp),
        username,
        color,
        content: content.join(";")
    };
}

/**
 * @param {number | null} messageId
 * @returns {Message | null}
 */
function getMessageById(messageId) {
    for (const message of messages)
        if (message.id == messageId)
            return message;
    return null;
}

/**
 * @param {Message} message
 * @returns {string}
 */
function embedMessage(message) {
    const reply = getMessageById(message.reply);
    return `
    <div class="message" id="${message.id}" onclick="setReply(${message.id})">
        ${reply === null ? "" : `
        <span class="message-reply">
            ┌
            ${embedMessageContent(reply)}
        </span>
        <br>
        `}
        ${embedMessageContent(message)}
    </div>
    `;
}


/**
 * @param {Message} message
 * @returns {string}
 */
function embedMessageContent(message) {
    const content =
        message.content.startsWith("img:") && urlPattern.test(message.content.slice(4)) ?
            `<img src="${message.content.slice(4)}">` :
            escapeHTML(message.content).replace(urlPattern, url => `<a href="${url.replace(/&amp;/g, "&")}">${url}</a>`);

    return `
    <span class="message-date">${formatDate(message.timestamp)}</span>
    <span class="message-sender" style="color: ${message.color}">${message.username}</span>
    :
    <span class="message-content">${content}</span>
    `;
}

/**
 * @param {string} message
 * @returns {string}
 */
function embedError(message) {
    return `<span class="error">${message}</span>`;
}

/**
 * @param {number} timestamp
 * @returns {string} 
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * @param {string} html
 * @returns {string}
 */
function escapeHTML(html) {
    return html.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br>");
}