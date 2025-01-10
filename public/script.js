const socket = io();

// DOM elements
const homeScreen = document.getElementById("home-screen");
const createLobbyForm = document.getElementById("create-lobby-form");
const joinLobbyForm = document.getElementById("join-lobby-form");
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

const createLobbyFormElement = document.getElementById("create-lobby");
const joinLobbyFormElement = document.getElementById("join-lobby");
const createUsernameInput = document.getElementById("create-username");
const numQuestionsInput = document.getElementById("num-questions");
const categorySelect = document.getElementById("category-select");
const joinUsernameInput = document.getElementById("join-username");
const lobbyIdInput = document.getElementById("lobby-id");
const leaveLobbyBtn = document.getElementById("leave-lobby-btn");

let isHost = false; // Tracks if the user is the host
let lobbyId = null;
let categories = [];

// Fetch categories from the server
socket.emit("getCategories");
socket.on("categories", (fetchedCategories) => {
  categories = fetchedCategories;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
});

// Ensure the DOM is fully loaded before adding event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Navigate between screens
  function showScreen(screen) {
    document
      .querySelectorAll(".screen")
      .forEach((el) => el.classList.add("hidden"));
    screen.classList.remove("hidden");
  }

  // Show create lobby form
  createLobbyBtn.addEventListener("click", () => {
    showScreen(createLobbyForm);
  });

  // Show join lobby form
  joinLobbyBtn.addEventListener("click", () => {
    showScreen(joinLobbyForm);
  });

  // Handle creating a lobby
  createLobbyFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = createUsernameInput.value;
    const numQuestions = parseInt(numQuestionsInput.value, 10);
    const category = parseInt(categorySelect.value, 10);

    if (username && numQuestions && category) {
      isHost = true;
      socket.emit("createLobby", {
        username,
        isPrivate: false,
        numQuestions,
        category,
      });
    }
  });

  // Handle joining a lobby
  joinLobbyFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = joinUsernameInput.value;
    const enteredLobbyId = lobbyIdInput.value;

    if (username && enteredLobbyId) {
      isHost = false;
      socket.emit("joinLobby", { lobbyId: enteredLobbyId, username });
    }
  });

  // Handle leaving a lobby
  leaveLobbyBtn.addEventListener("click", () => {
    console.log("Leave lobby button clicked");
    if (lobbyId) {
      socket.emit("leaveLobby", { lobbyId });
    }
  });

  // Listen for lobby leave confirmation
  socket.on("lobbyLeft", () => {
    lobbyId = null; // Reset lobbyId
    showScreen(homeScreen);
  });

  // Listen for lobby creation
  socket.on(
    "lobbyCreated",
    ({ lobbyId: createdLobbyId, numQuestions, categoryName }) => {
      lobbyId = createdLobbyId;
      showScreen(lobbyScreen);
      updateLobbyUI({ numQuestions, categoryName });
      if (isHost) {
        lobbyIdDisplay.textContent = `Lobby ID: ${lobbyId}`;
        lobbyIdDisplay.classList.remove("hidden");
      }
    }
  );

  // Listen for players joining
  socket.on("playerJoined", ({ players }) => {
    updatePlayerList(players);
    showScreen(lobbyScreen);
  });

  // Listen for host reconnection
  socket.on("hostReconnected", ({ lobbyId, numQuestions, categoryName }) => {
    lobbyIdDisplay.textContent = `Lobby ID: ${lobbyId}`;
    lobbyIdDisplay.classList.remove("hidden");
    updateLobbyUI({ numQuestions, categoryName });
    showScreen(lobbyScreen);
    lobbySettings.classList.remove("hidden");
    startGameBtn.classList.remove("hidden");
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
      if (player.id === socket.id) {
        li.classList.add("highlight"); // Highlight your username
        li.style.fontWeight = "bold"; // Highlight your username
      }
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
});
