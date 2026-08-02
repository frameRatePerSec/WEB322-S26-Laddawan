/********************************************************************************
* WEB322 – Assignment 03
* 
* I declare that this assignment is my own work in accordance with Seneca's
* Academic Integrity Policy:
* 
* https://www.senecapolytechnic.ca/about/policies/academic-integrity-policy.html
* 
* Name: Laddawan Bumrungsri Student ID: 177680238 Date: 2026-08-02
*
********************************************************************************/

const express = require("express");
const { engine } = require("express-handlebars");
const clientSessions = require("client-sessions");
const bcrypt = require("bcryptjs");
const pg = require("pg");
require("pg-hstore");
require("dotenv").config();

const { connectMongo, connectPostgres, Task } = require("./config/db");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to Databases
connectMongo();
connectPostgres();

// Handlebars Engine Configuration
app.engine(
  "handlebars",
  engine({
    helpers: {
      eq: (a, b) => a === b,
      formatDate: (dateStr) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        // Format as M/D/YYYY to match professor sample app
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", "./views");

// Body Parsing & Static Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Client Sessions Middleware
app.use(
  clientSessions({
    cookieName: "session",
    secret: process.env.SESSION_SECRET || "web322_assignment3_secret_key_177680238",
    duration: 30 * 60 * 1000, // 30 minutes
    activeDuration: 5 * 60 * 1000, // 5 minutes extension
  })
);

// Authentication Guard Middleware
function ensureLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    res.redirect("/login");
  } else {
    next();
  }
}

// Make Session User Available to all Views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// ================= ROUTING ================= //

// Root Route
app.get("/", (req, res) => {
  if (req.session && req.session.user) {
    res.redirect("/dashboard");
  } else {
    res.render("home", { title: "Task Management App" });
  }
});

// --- AUTHENTICATION ROUTES ---

// GET /register
app.get("/register", (req, res) => {
  res.render("register", { title: "Register" });
});

// POST /register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }],
    });

    if (existingUser) {
      return res.render("register", {
        title: "Register",
        errorMessage: "Username or Email already in use. Please choose another.",
        username,
        email,
      });
    }

    // Hash password using bcrypt (min 10 salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save new user in MongoDB
    const newUser = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    });

    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Registration error:", err);
    res.render("register", {
      title: "Register",
      errorMessage: "An error occurred during registration. Please try again.",
      username,
      email,
    });
  }
});

// GET /login
app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

// POST /login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find user in MongoDB
    const user = await User.findOne({ username: username.trim() });

    if (!user) {
      return res.render("login", {
        title: "Login",
        errorMessage: "Invalid username or password.",
        username,
      });
    }

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", {
        title: "Login",
        errorMessage: "Invalid username or password.",
        username,
      });
    }

    // Store user ID, email, and username in session
    req.session.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
    };

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Login error:", err);
    res.render("login", {
      title: "Login",
      errorMessage: "An error occurred during login. Please try again.",
      username,
    });
  }
});

// GET /logout
app.get("/logout", (req, res) => {
  if (req.session) {
    req.session.reset();
  }
  res.redirect("/login");
});

// --- TASK MANAGEMENT ROUTES (PROTECTED) ---

// GET /dashboard
app.get("/dashboard", ensureLogin, (req, res) => {
  res.render("dashboard", {
    title: "Dashboard",
    user: req.session.user,
  });
});

// GET /tasks
app.get("/tasks", ensureLogin, async (req, res) => {
  try {
    const rawTasks = await Task.findAll({
      where: { userId: req.session.user.id },
      order: [["createdAt", "DESC"]],
    });

    const tasks = rawTasks.map((t) => t.get({ plain: true }));

    res.render("tasks", {
      title: "Your Tasks",
      tasks,
    });
  } catch (err) {
    console.error("Fetch tasks error:", err);
    res.status(500).send("Error loading tasks");
  }
});

// GET /tasks/add
app.get("/tasks/add", ensureLogin, (req, res) => {
  res.render("task-add", { title: "Add Task" });
});

// POST /tasks/add
app.post("/tasks/add", ensureLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  try {
    await Task.create({
      title: title.trim(),
      description: description ? description.trim() : null,
      dueDate: dueDate || null,
      status: status || "pending",
      userId: req.session.user.id,
    });

    res.redirect("/tasks");
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).send("Error creating task");
  }
});

// GET /tasks/edit/:id
app.get("/tasks/edit/:id", ensureLogin, async (req, res) => {
  try {
    const taskInstance = await Task.findOne({
      where: {
        id: req.params.id,
        userId: req.session.user.id,
      },
    });

    if (!taskInstance) {
      return res.status(404).send("Task not found");
    }

    const task = taskInstance.get({ plain: true });

    res.render("task-edit", {
      title: "Edit Task",
      task,
    });
  } catch (err) {
    console.error("Fetch edit task error:", err);
    res.status(500).send("Error loading task for edit");
  }
});

// POST /tasks/edit/:id
app.post("/tasks/edit/:id", ensureLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  try {
    await Task.update(
      {
        title: title.trim(),
        description: description ? description.trim() : null,
        dueDate: dueDate || null,
        status: status || "pending",
      },
      {
        where: {
          id: req.params.id,
          userId: req.session.user.id,
        },
      }
    );

    res.redirect("/tasks");
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).send("Error updating task");
  }
});

// POST /tasks/delete/:id
app.post("/tasks/delete/:id", ensureLogin, async (req, res) => {
  try {
    await Task.destroy({
      where: {
        id: req.params.id,
        userId: req.session.user.id,
      },
    });

    res.redirect("/tasks");
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).send("Error deleting task");
  }
});

// POST /tasks/status/:id
app.post("/tasks/status/:id", ensureLogin, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: {
        id: req.params.id,
        userId: req.session.user.id,
      },
    });

    if (task) {
      const newStatus = task.status === "completed" ? "pending" : "completed";
      await task.update({ status: newStatus });
    }

    res.redirect("/tasks");
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).send("Error updating task status");
  }
});

// Start Express Server
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Express server running on port ${PORT}`);
  });
}

module.exports = app;
