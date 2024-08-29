// @ts-check
/** @typedef {{ id: number, reply: number | null, timestamp: number, username: string, color: string, content: string }} Message */
/** @typedef {{ id: number, username: string, passwordHash: string, color: string }} User */

const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const { createHash } = require("crypto");
const { createConnection: createDatabaseConnection, escape } = require("mysql");
const { join } = require("path");
const { decode } = require("iconv-lite");
require('dotenv').config();

const app = express();

const PORT = Number(process.env.HTTP_PORT);
const server = http.createServer(app);

const webSocketServer = new WebSocket.Server({ server });

const database = createDatabaseConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

/** @type {User[]} */
const users = [];

app.use(cors());
app.use((req, res, next) => {
    const user = getUserFromCookies(req.headers.cookie);

    if (user === undefined) {
        console.log("HTTP connection rejected: " + req.headers.cookie);
        return denyAccess(res);
    }

    next();
});

app.use(express.static(`${__dirname}/static`));


webSocketServer.on("connection", async (webSocketClient, req) => {
    const user = getUserFromCookies(req.headers.cookie);

    if (user === undefined) {
        console.log("WebSocket connection rejected: " + req.headers.cookie);
        return webSocketClient.close();
    }

    console.log(`New connection (${webSocketServer.clients.size} connections open)`);

    stringifyMessagesFromSQL().then(data => webSocketClient.send(data));

    webSocketClient.on("message", message => {
        const { reply, content } = parseMessage(message.toString());

        if (content === "")
            return;

        const timestamp = Date.now();

        console.log(`New message from ${user.username}${reply ? ` in response to message ${reply}` : ""}: ${content}`);

        database.query(`INSERT INTO Messages (reply, timestamp, user, content) VALUES (${reply}, ${timestamp}, ${user.id}, ${escape(content)});`, async err => {
            if (err)
                return console.error(err);

            const messageData = await stringifyMessagesFromSQL("WHERE id=LAST_INSERT_ID()");

            for (const client of webSocketServer.clients)
                if (client.readyState === WebSocket.OPEN)
                    client.send(messageData);
        });
    });

    webSocketClient.on("close", () => {
        console.log(`Connection closed (${webSocketServer.clients.size} connections open)`);
    });

});

webSocketServer.on("error", (err) => {
    console.error("WebSocket server error:", err);
});

server.on("error", (err) => {
    console.error("HTTP server error:", err);
});



server.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
    initDatabase();
});

server.keepAliveTimeout = 60000;

process.on("exit", () => {
    database.end();
});


/**
 * @returns {void} 
 */
function initDatabase() {
    database.connect((err) => {
        if (err)
            throw err;

        database.query("SELECT * FROM Users;", (err, results) => {
            if (err)
                throw err;

            console.log("Registred users:");

            for (const { id, username, password_hash: passwordHash, color } of results) {
                console.log(`  - id: ${id}, username: ${username}, passwordHash: ${passwordHash}, color: ${color}`);
                users.push({
                    id,
                    username,
                    passwordHash,
                    color
                });
            }
        });
    });
}

/**
 * 
 * @param {string | undefined} cookies
 * @returns {User | undefined}
 */
function getUserFromCookies(cookies) {
    const { username, password } = parseCookies(cookies);

    if (username === undefined || password === undefined)
        return undefined;

    const fixedUsername = fixEncoding(username);
    const fixedPassword = fixEncoding(password);

    const passwordHash = hash(fixedPassword);

    const user = users.find(user => user.username === fixedUsername && user.passwordHash === passwordHash);

    return user;
}

/**
 * 
 * @param {string} str 
 * @returns {string}
 */
function fixEncoding(str) {
    const buffer = Buffer.from(str, "binary");
    return decode(buffer, "utf8");
}


/**
 * @param {string | undefined} cookies
 * @returns {Record<string, string>}
 */
function parseCookies(cookies) {
    if (cookies === undefined)
        return {};

    /** @type {Record<string, string>} */
    const parsedCookies = {};

    for (const cookie of cookies.split(";")) {
        const [key, value] = cookie.split("=");
        parsedCookies[key.trim()] = value
    }

    return parsedCookies;
}

/**
 * 
 * @param {string} data 
 * @returns {{ reply: number | null, content: string}}
 */
function parseMessage(data) {
    const [
        reply,
        ...content
    ] = data.replace("", "").split(";");

    return {
        reply: reply !== "" ? Number(reply) : null,
        content: content.join(";")
    };
}

/**
 * @param {string} where
 * @returns {Promise<string>}
 */
function stringifyMessagesFromSQL(where = "") {
    return new Promise((resolve, reject) => {
        database.query(`SELECT * FROM Messages ${where};`, (err, results) => {
            if (err) {
                console.error(err);
                return reject(err);
            }

            /** @type {string[]} */
            const messages = [];

            for (const { id, reply, timestamp, user: userId, content } of results) {
                const user = users.find(user => user.id === userId);
                messages.push(`${id};${reply ?? ""};${timestamp};${user?.username};${user?.color};${content}`);
            }

            resolve(messages.join(""));
        });
    })
}

/**
 * 
 * @param {import("express").Response} res 
 */
function denyAccess(res) {
    res.status(403).sendFile(join(__dirname, "static/login.html"));
}

/**
 * @param {string} string
 * @returns {string}
 */
function hash(string) {
    return createHash("sha256").update(string).digest("base64");
}