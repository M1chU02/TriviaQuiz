const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const dotenv = require("dotenv");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const sharedSession = require("express-socket.io-session");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware for sessions
const sessionMiddleware = session({
  secret: "your-secret-key",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }, // Set to true if using HTTPS
});

app.use(cookieParser());
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use(
  sharedSession(sessionMiddleware, {
    autoSave: true,
  })
);

// Game variables
const lobbies = {}; // Store lobbies (public/private games)
let triviaCategories = []; // Store trivia categories
const questionsCache = {}; // Cache questions to prevent repeated API calls

// Fetch trivia categories on server start
const fetchCategories = async () => {
  try {
    const response = await axios.get("https://opentdb.com/api_category.php");
    triviaCategories = response.data.trivia_categories || [];
    console.log("Fetched trivia categories:", triviaCategories);
  } catch (error) {
    console.error("Error fetching trivia categories:", error);
  }
};

fetchCategories(); // Fetch categories when the server starts

// Utility to fetch trivia questions
const fetchQuestions = async (
  amount = 10,
  category = 9,
  difficulty = "medium"
) => {
  const key = `${amount}_${category}_${difficulty}`;
  if (!questionsCache[key]) {
    try {
      const response = await axios.get("https://opentdb.com/api.php", {
        params: { amount, category, difficulty },
      });
      questionsCache[key] = response.data.results;
    } catch (error) {
      console.error("Error fetching trivia questions:", error);
      return [];
    }
  }
  return questionsCache[key];
};

// Serve static files
app.use(express.static("public"));

// Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Retrieve session ID from cookies
  const cookieHeader = socket.handshake.headers.cookie;
  const sessionId = cookieHeader
    ? cookieHeader
        .split("; ")
        .find((row) => row.startsWith("connect.sid"))
        ?.split("=")[1]
    : null;

  // Reconnect user if session exists
  if (sessionId && socket.handshake.session) {
    const userSession = socket.handshake.session[sessionId];
    if (userSession) {
      const { lobbyId, username } = userSession;
      const lobby = lobbies[lobbyId];
      if (lobby) {
        const isHost = lobby.host === socket.id;
        lobby.players.push({ id: socket.id, username, score: 0 });
        socket.join(lobbyId);
        io.to(lobbyId).emit("playerJoined", {
          players: lobby.players,
          hostId: lobby.host,
        });
        console.log(`${username} rejoined lobby ${lobbyId}`);
      }
    }
  }

  // Send trivia categories to the client
  socket.on("getCategories", () => {
    socket.emit("categories", triviaCategories);
  });

  // Create a new lobby with settings
  socket.on(
    "createLobby",
    async ({ username, isPrivate, numQuestions, category }) => {
      const lobbyId = Math.random().toString(36).substring(2, 9); // Random lobby ID

      const questions = await fetchQuestions(numQuestions, category, "medium"); // Fetch questions

      if (questions.length === 0) {
        io.to(socket.id).emit("error", {
          message: "Failed to fetch questions. Please try again.",
        });
        return;
      }

      const categoryName =
        triviaCategories.find((cat) => cat.id === category)?.name || "Unknown";

      lobbies[lobbyId] = {
        id: lobbyId,
        isPrivate,
        host: socket.id, // The player who created the lobby is the host
        players: [{ id: socket.id, username, score: 0 }],
        questions,
        currentQuestionIndex: 0,
        gameStarted: false, // Track if the game has started
      };

      // Save session
      socket.handshake.session[sessionId] = { lobbyId, username };
      socket.handshake.session.save();

      socket.join(lobbyId);
      io.to(socket.id).emit("lobbyCreated", {
        lobbyId,
        numQuestions,
        categoryName,
      });
      console.log(`Lobby ${lobbyId} created by ${username}`);
    }
  );

  // Join an existing lobby
  socket.on("joinLobby", ({ lobbyId, username }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      io.to(socket.id).emit("error", { message: "Lobby not found." });
      return;
    }

    if (lobby.isPrivate && lobby.players.length >= 4) {
      io.to(socket.id).emit("error", { message: "Lobby is full." });
      return;
    }

    const isHost = lobby.host === socket.id;
    lobby.players.push({ id: socket.id, username, score: 0 });

    // Save session
    socket.handshake.session[sessionId] = { lobbyId, username };
    socket.handshake.session.save();

    socket.join(lobbyId);
    io.to(lobbyId).emit("playerJoined", {
      players: lobby.players,
      hostId: lobby.host,
    });
    console.log(`${username} joined lobby ${lobbyId}`);
  });

  // Handle leaving a lobby
  socket.on("leaveLobby", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    lobby.players = lobby.players.filter((p) => p.id !== socket.id);

    if (lobby.players.length === 0) {
      delete lobbies[lobbyId];
      console.log(`Lobby ${lobbyId} deleted due to inactivity.`);
    } else {
      io.to(lobbyId).emit("playerLeft", { players: lobby.players });
    }

    // Clear session
    if (sessionId && socket.handshake.session) {
      delete socket.handshake.session[sessionId];
      socket.handshake.session.save();
    }

    socket.leave(lobbyId);
    io.to(socket.id).emit("lobbyLeft");
    console.log(`User ${socket.id} left lobby ${lobbyId}`);
  });

  // Start the quiz (only the host can start the quiz)
  socket.on("startQuiz", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      io.to(socket.id).emit("error", { message: "Lobby not found." });
      return;
    }

    if (lobby.host !== socket.id) {
      io.to(socket.id).emit("error", {
        message: "Only the host can start the quiz.",
      });
      return;
    }

    if (lobby.gameStarted) {
      io.to(socket.id).emit("error", {
        message: "The game has already started.",
      });
      return;
    }

    lobby.gameStarted = true; // Mark the game as started
    const firstQuestion = lobby.questions[lobby.currentQuestionIndex];
    io.to(lobbyId).emit("quizStarted", { question: firstQuestion });
    console.log(`Quiz started in lobby ${lobbyId}`);
  });

  // Handle answering a question
  socket.on("answerQuestion", ({ lobbyId, answer }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    if (!lobby.gameStarted) {
      io.to(socket.id).emit("error", {
        message: "The game has not started yet.",
      });
      return;
    }

    const player = lobby.players.find((p) => p.id === socket.id);
    const currentQuestion = lobby.questions[lobby.currentQuestionIndex];
    if (currentQuestion.correct_answer === answer) {
      player.score += 10; // Add points for correct answer
    }

    lobby.currentQuestionIndex++;

    if (lobby.currentQuestionIndex >= lobby.questions.length) {
      // End of quiz
      const results = lobby.players.map((p) => ({
        username: p.username,
        score: p.score,
      }));
      io.to(lobbyId).emit("quizEnded", { results });
      delete lobbies[lobbyId];
      console.log(`Quiz ended in lobby ${lobbyId}`);
    } else {
      // Send next question
      const nextQuestion = lobby.questions[lobby.currentQuestionIndex];
      io.to(lobbyId).emit("nextQuestion", { question: nextQuestion });
    }
  });

  // Handle player disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    for (const lobbyId in lobbies) {
      const lobby = lobbies[lobbyId];
      lobby.players = lobby.players.filter((p) => p.id !== socket.id);

      if (lobby.players.length === 0) {
        delete lobbies[lobbyId];
        console.log(`Lobby ${lobbyId} deleted due to inactivity.`);
      } else {
        io.to(lobbyId).emit("playerLeft", { players: lobby.players });
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
