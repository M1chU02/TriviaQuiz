const socket = io();

// DOM elements
const homeScreen = document.getElementById("home-screen");
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");

const createLobbyBtn = document.getElementById("create-lobby-btn");
const joinLobbyBtn = document.getElementById("join-lobby-btn");
const startGameBtn = document.getElementById("start-game-btn");
const playersList = document.getElementById("players-list");
const lobbySettings = document.getElementById("lobby-settings");
const questionsCount = document.getElementById("questions-count");
const categoryName = document.getElementById("category-name");
const lobbyIdDisplay = document.getElementById("lobby-id-display");

let isHost = false; // Tracks if the user is the host
let lobbyId = null;
let categories = [];

// Fetch categories from the server
socket.emit("getCategories");
socket.on("categories", (fetchedCategories) => {
  categories = fetchedCategories;
  const categorySelect = document.createElement("select");
  categorySelect.id = "category-select";
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
  document.getElementById("category-container").appendChild(categorySelect);
});

// Navigate between screens
function showScreen(screen) {
  document
    .querySelectorAll(".screen")
    .forEach((el) => el.classList.add("hidden"));
  screen.classList.remove("hidden");
}

// Handle creating a lobby
createLobbyBtn.addEventListener("click", () => {
  const username = prompt("Enter your username:");
  const numQuestions =
    parseInt(prompt("Enter the number of questions:"), 10) || 10;
  const categorySelect = document.getElementById("category-select");
  const category = categorySelect ? parseInt(categorySelect.value, 10) : 9;

  if (username) {
    socket.emit("createLobby", {
      username,
      isPrivate: false,
      numQuestions,
      category,
    });
    isHost = true;
  }
});

// Handle joining a lobby
joinLobbyBtn.addEventListener("click", () => {
  const username = prompt("Enter your username:");
  const enteredLobbyId = prompt("Enter the lobby ID:");

  if (username && enteredLobbyId) {
    socket.emit("joinLobby", { lobbyId: enteredLobbyId, username });
    isHost = false;
  }
});

// Listen for lobby creation
socket.on("lobbyCreated", ({ lobbyId: createdLobbyId }) => {
  lobbyId = createdLobbyId;
  showScreen(lobbyScreen);
  updateLobbyUI();
  if (isHost) {
    lobbyIdDisplay.textContent = `Lobby ID: ${lobbyId}`;
    lobbyIdDisplay.classList.remove("hidden");
  }
});

// Listen for players joining
socket.on("playerJoined", ({ players }) => {
  updatePlayerList(players);
  showScreen(lobbyScreen);
});

// Update lobby UI
function updateLobbyUI(settings = null) {
  if (isHost) {
    lobbySettings.classList.remove("hidden");
    startGameBtn.classList.remove("hidden");
  } else {
    lobbySettings.classList.add("hidden");
    startGameBtn.classList.add("hidden");
  }

  if (settings) {
    questionsCount.textContent = settings.numQuestions;
    categoryName.textContent = settings.categoryName;
  }
}

// Update player list
function updatePlayerList(players) {
  playersList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.username;
    playersList.appendChild(li);
  });
}

// Start the game (host only)
startGameBtn.addEventListener("click", () => {
  if (isHost && lobbyId) {
    socket.emit("startQuiz", { lobbyId });
  }
});

// Listen for quiz start
socket.on("quizStarted", ({ question }) => {
  showScreen(gameScreen);
  console.log("Quiz started:", question); // Placeholder for actual game logic
});

// Error handling
socket.on("error", (error) => {
  alert(error.message);
});

// Show the home screen by default when the page loads
showScreen(homeScreen);
