const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const TODO_FILE = path.join(__dirname, 'todo.json');
const USER_FILE = path.join(__dirname, 'user.json');

class UserStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
    }
  }

  load() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading user file:', err);
      return [];
    }
  }

  save(users) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(users, null, 2));
    } catch (err) {
      console.error('Error saving user file:', err);
    }
  }

  findByEmail(email) {
    const users = this.load();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  add({ name, email, bio, password }) {
    const users = this.load();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
      id: Date.now(),
      name,
      email: email.toLowerCase(),
      bio,
      password: hashedPassword,
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    this.save(users);
    return newUser;
  }
}

class TodoStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
    }
  }

  load() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading todo file:', err);
      return [];
    }
  }

  save(todos) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(todos, null, 2));
    } catch (err) {
      console.error('Error saving todo file:', err);
    }
  }

  getAll({ userId, search, filter, page = 1, limit = 10 }) {
    let todos = this.load().filter(t => !t.deleted_at && t.userId === userId);

    if (search) {
      const s = search.toLowerCase();
      todos = todos.filter(t => 
        (t.title && t.title.toLowerCase().includes(s)) || 
        (t.description && t.description.toLowerCase().includes(s))
      );
    }

    if (filter === 'completed') {
      todos = todos.filter(t => !!t.completed_at);
    } else if (filter === 'active') {
      todos = todos.filter(t => !t.completed_at);
    }

    todos.sort((a, b) => b.id - a.id);

    const total = todos.length;
    const startIndex = (page - 1) * limit;
    const paginatedTodos = todos.slice(startIndex, startIndex + parseInt(limit));

    return {
      todos: paginatedTodos,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    };
  }

  add(userId, title, description) {
    const todos = this.load();
    const maxId = todos.reduce((max, t) => {
      const numericId = parseInt(t.id);
      return isNaN(numericId) ? max : Math.max(max, numericId);
    }, 0);
    const now = new Date().toISOString();
    const newTodo = {
      id: maxId + 1,
      userId,
      title,
      description,
      created_at: now,
      modified_at: now,
      completed_at: null,
      deleted_at: null
    };
    todos.unshift(newTodo);
    this.save(todos);
    return newTodo;
  }

  findIdx(id, userId) {
    const todos = this.load();
    return todos.findIndex(t => String(t.id) === String(id) && !t.deleted_at && t.userId === userId);
  }

  update(id, userId, updates) {
    const todos = this.load();
    const idx = this.findIdx(id, userId);
    if (idx === -1) return null;

    const now = new Date().toISOString();
    todos[idx] = {
      ...todos[idx],
      ...updates,
      modified_at: now
    };
    this.save(todos);
    return todos[idx];
  }

  toggleComplete(id, userId) {
    const todos = this.load();
    const idx = this.findIdx(id, userId);
    if (idx === -1) return null;

    const now = new Date().toISOString();
    todos[idx].completed_at = todos[idx].completed_at ? null : now;
    todos[idx].modified_at = now;
    this.save(todos);
    return todos[idx];
  }

  delete(id, userId) {
    const now = new Date().toISOString();
    return this.update(id, userId, { deleted_at: now });
  }
}

const userStore = new UserStore(USER_FILE);
const todoStore = new TodoStore(TODO_FILE);
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'todo-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Auth Routes
app.post('/api/register', (req, res) => {
  const { name, email, bio, password } = req.body;
  
  // Email mask check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }

  if (userStore.findByEmail(email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const user = userStore.add({ name, email, bio, password });
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = userStore.findByEmail(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ id: user.id, name: user.name, email: user.email, bio: user.bio });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = userStore.load().find(u => u.id === req.session.userId);
  res.json({ id: user.id, name: user.name, email: user.email, bio: user.bio });
});

// Todo Routes (Protected)
app.get('/api/todos', requireAuth, (req, res) => {
  const { search, filter, page, limit } = req.query;
  res.json(todoStore.getAll({ userId: req.session.userId, search, filter, page, limit }));
});

app.post('/api/todos', requireAuth, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const todo = todoStore.add(req.session.userId, title, description);
  res.status(201).json(todo);
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const todo = todoStore.update(req.params.id, req.session.userId, req.body);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

app.post('/api/todos/:id/toggle', requireAuth, (req, res) => {
  const todo = todoStore.toggleComplete(req.params.id, req.session.userId);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const todo = todoStore.delete(req.params.id, req.session.userId);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json({ message: 'Deleted' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
