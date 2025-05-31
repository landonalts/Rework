// script.js

// Firebase Initialization and DOM Elements
const firebaseConfig = {
    apiKey: "AIzaSyAdssAURPfxQKdi7KbAlSisH0j34J8A144",
    authDomain: "landkit-5e55b.firebaseapp.com",
    projectId: "landkit-5e55b",
    storageBucket: "landkit-5e55b.appspot.com",
    messagingSenderId: "920665056429",
    appId: "1:920665056429:web:c3c134404d735df9275224",
    measurementId: "G-BHFXJDEBQE"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const frontPage = document.getElementById('frontPage');
const chatChoicePage = document.getElementById('chatChoicePage');
const lobbyPage = document.getElementById('lobbyPage');
const globalPage = document.getElementById('globalPage');

const nameInput = document.getElementById('nameInput');
const proceedBtn = document.getElementById('proceedBtn');

const createLobbyBtn = document.getElementById('createLobbyBtn');
const joinLobbyInput = document.getElementById('joinLobbyInput');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const joinGlobalBtn = document.getElementById('joinGlobalBtn');

const lobbyCodeDisplay = document.getElementById('lobbyCode');
const playerCountDisplay = document.getElementById('playerCount');

const chatTabs = document.querySelectorAll('.tabBtn');
const messagesDiv = document.getElementById('messages');
const chatMessageInput = document.getElementById('chatMessageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const leaveLobbyBtn = document.getElementById('leaveLobbyBtn');

const globalMessagesDiv = document.getElementById('globalMessages');
const globalChatMessageInput = document.getElementById('globalChatMessageInput');
const sendGlobalMessageBtn = document.getElementById('sendGlobalMessageBtn');
const leaveGlobalBtn = document.getElementById('leaveGlobalBtn');

// State variables
let username = '';
let currentLobby = null;
let lobbyUnsub = null;
let lobbyPlayersUnsub = null;
let lobbyMessagesUnsub = null;
let globalMessagesUnsub = null;
let currentChat = 'lobby'; // 'lobby' or 'global'

// Helper functions
function generateLobbyCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
}

function showPage(page) {
    [frontPage, chatChoicePage, lobbyPage, globalPage].forEach(p => p.classList.add('hidden'));
    page.classList.remove('hidden');
}

function sanitizeLobbyCode(input) {
    return input.trim().toUpperCase();
}

function addMessage(container, msg) {
    const div = document.createElement('div');
    div.className = 'message';
    if (msg.username === username) div.classList.add('self');
    div.textContent = `${msg.username}: ${msg.text}`;
    container.appendChild(div);
}

function scrollMessagesToBottom(container) {
    container.scrollTop = container.scrollHeight;
}

function setActiveChatTab(chat) {
    currentChat = chat;
    chatTabs.forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-chat') === chat);
    });

    if (chat === 'lobby') {
        messagesDiv.style.display = 'block';
        chatMessageInput.disabled = false;
        sendMessageBtn.disabled = false;

        globalMessagesDiv.style.display = 'none';
        globalChatMessageInput.disabled = true;
        sendGlobalMessageBtn.disabled = true;
    } else if (chat === 'global') {
        messagesDiv.style.display = 'none';
        chatMessageInput.disabled = true;
        sendMessageBtn.disabled = true;

        globalMessagesDiv.style.display = 'block';
        globalChatMessageInput.disabled = false;
        sendGlobalMessageBtn.disabled = false;
    }
}

function addGlobalMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    if (msg.username === username) div.classList.add('self');
    div.textContent = `${msg.username}: ${msg.text}`;
    globalMessagesDiv.appendChild(div);
}

// Event listeners and functions
proceedBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) {
        alert('Please enter your name.');
        return;
    }
    username = name.slice(0, 20);
    frontPage.classList.add('hidden');
    chatChoicePage.classList.remove('hidden');
};

createLobbyBtn.onclick = async () => {
    let code = generateLobbyCode();

    let codeExists = true;
    while (codeExists) {
        const doc = await db.collection('lobbies').doc(code).get();
        if (!doc.exists) {
            codeExists = false;
        } else {
            code = generateLobbyCode();
        }
    }

    await db.collection('lobbies').doc(code).set({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        players: {},
    });

    currentLobby = code;
    await joinLobby(code);
};

joinLobbyBtn.onclick = () => {
    let code = sanitizeLobbyCode(joinLobbyInput.value);
    if (!code.match(/^[A-Z]{6}$/)) {
        alert('Please enter a valid 6-letter lobby code.');
        return;
    }
    joinLobby(code);
};

async function joinLobby(code) {
    const lobbyRef = db.collection('lobbies').doc(code);
    const doc = await lobbyRef.get();
    if (!doc.exists) {
        alert('Lobby not found.');
        return;
    }

    currentLobby = code;
    showPage(lobbyPage);
    lobbyCodeDisplay.textContent = code;

    const playerKey = username;

    await db.runTransaction(async (transaction) => {
        const lobbyDoc = await transaction.get(lobbyRef);
        if (!lobbyDoc.exists) throw "Lobby does not exist!";
        const players = lobbyDoc.data().players || {};
        players[playerKey] = true;
        transaction.update(lobbyRef, { players });
    });

    lobbyPlayersUnsub = lobbyRef.onSnapshot(snapshot => {
        const data = snapshot.data();
        const players = data?.players || {};
        const count = Object.keys(players).length;
        playerCountDisplay.textContent = `Players: ${count}`;
    });

    lobbyMessagesUnsub = lobbyRef.collection('messages').orderBy('timestamp')
        .onSnapshot(snapshot => {
            if (currentChat !== 'lobby') return;
            messagesDiv.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                addMessage(messagesDiv, msg);
            });
            scrollMessagesToBottom(messagesDiv);
        });

    setActiveChatTab('lobby');
}

sendMessageBtn.onclick = async () => {
    const text = chatMessageInput.value.trim();
    if (!text || !currentLobby) return;
    chatMessageInput.value = '';

    const lobbyRef = db.collection('lobbies').doc(currentLobby);
    await lobbyRef.collection('messages').add({
        username,
        text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

leaveLobbyBtn.onclick = async () => {
    if (!currentLobby) return;

    const lobbyRef = db.collection('lobbies').doc(currentLobby);
    await db.runTransaction(async (transaction) => {
        const lobbyDoc = await transaction.get(lobbyRef);
        if (!lobbyDoc.exists) return;
        const players = lobbyDoc.data().players || {};
        delete players[username];
        transaction.update(lobbyRef, { players });
    });

    if (lobbyPlayersUnsub) lobbyPlayersUnsub();
    if (lobbyMessagesUnsub) lobbyMessagesUnsub();

    currentLobby = null;
    messagesDiv.innerHTML = '';
    chatMessageInput.value = '';
    showPage(chatChoicePage);
};

chatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const chat = tab.getAttribute('data-chat');
        setActiveChatTab(chat);
    });
});

joinGlobalBtn.onclick = () => {
    chatChoicePage.classList.add('hidden');
    globalPage.classList.remove('hidden');
    subscribeGlobalChat();
};

function subscribeGlobalChat() {
    if (globalMessagesUnsub) globalMessagesUnsub();

    globalMessagesUnsub = db.collection('globalMessages').orderBy('timestamp')
        .onSnapshot(snapshot => {
            globalMessagesDiv.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                addGlobalMessage(msg);
            });
            scrollMessagesToBottom(globalMessagesDiv);
        });
}

sendGlobalMessageBtn.onclick = async () => {
    const text = globalChatMessageInput.value.trim();
    if (!text) return;
    globalChatMessageInput.value = '';

    await db.collection('globalMessages').add({
        username,
        text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

leaveGlobalBtn.onclick = () => {
    if (globalMessagesUnsub) globalMessagesUnsub();
    globalMessagesDiv.innerHTML = '';
    globalChatMessageInput.value = '';
    globalPage.classList.add('hidden');
    chatChoicePage.classList.remove('hidden');
};

chatMessageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessageBtn.click();
    }
});

globalChatMessageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendGlobalMessageBtn.click();
    }
});

// Admin Login Functionality
const adminBtn = document.getElementById('adminBtn');
const overlay = document.getElementById('overlay');
const loginModal = document.getElementById('loginModal');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('errorMsg');
const adminGUI = document.getElementById('adminGUI');
const closeAdminBtn = document.getElementById('closeAdminBtn');

adminBtn.addEventListener('click', () => {
    overlay.style.display = 'flex';
    usernameInput.value = '';
    passwordInput.value = '';
    errorMsg.textContent = '';
    usernameInput.focus();
});

loginBtn.addEventListener('click', () => {
    const user = usernameInput.value.trim().toLowerCase();
    const pass = passwordInput.value;

    if (user === 'admin' && pass === 'Landon') {
        overlay.style.display = 'none';
        adminGUI.style.display = 'flex';
    } else {
        errorMsg.textContent = 'Invalid username or password';
        passwordInput.value = '';
        passwordInput.focus();
    }
});

[usernameInput, passwordInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });
});

closeAdminBtn.addEventListener('click', () => {
    adminGUI.style.display = 'none';
});

overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
        overlay.style.display = 'none';
    }
});
