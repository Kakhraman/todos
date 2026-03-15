const express = require('express');
const fs = require('fs');
const path = require('path');

const TODO_FILE = path.join(__dirname, 'todo.json');

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

  getAll({ search, filter, page = 1, limit = 10 }) {
    let todos = this.load().filter(t => !t.deleted_at);

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

    // Sort by ID descending (newest ID first)
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

  add(title, description) {
    const todos = this.load();
    const maxId = todos.reduce((max, t) => {
      const numericId = parseInt(t.id);
      return isNaN(numericId) ? max : Math.max(max, numericId);
    }, 0);
    const now = new Date().toISOString();
    const newTodo = {
      id: maxId + 1,
      title,
      description,
      created_at: now,
      modified_at: now,
      completed_at: null,
      deleted_at: null
    };
    // Add to the beginning of the array
    todos.unshift(newTodo);
    this.save(todos);
    return newTodo;
  }

  findIdx(id) {
    const todos = this.load();
    return todos.findIndex(t => String(t.id) === String(id) && !t.deleted_at);
  }

  update(id, updates) {
    const todos = this.load();
    const idx = this.findIdx(id);
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

  toggleComplete(id) {
    const todos = this.load();
    const idx = this.findIdx(id);
    if (idx === -1) return null;

    const now = new Date().toISOString();
    todos[idx].completed_at = todos[idx].completed_at ? null : now;
    todos[idx].modified_at = now;
    this.save(todos);
    return todos[idx];
  }

  delete(id) {
    const now = new Date().toISOString();
    return this.update(id, { deleted_at: now });
  }
}

const todoStore = new TodoStore(TODO_FILE);
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.get('/api/todos', (req, res) => {
  const { search, filter, page, limit } = req.query;
  res.json(todoStore.getAll({ search, filter, page, limit }));
});

app.post('/api/todos', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const todo = todoStore.add(title, description);
  res.status(201).json(todo);
});

app.put('/api/todos/:id', (req, res) => {
  const todo = todoStore.update(req.params.id, req.body);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

app.post('/api/todos/:id/toggle', (req, res) => {
  const todo = todoStore.toggleComplete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
  const todo = todoStore.delete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json({ message: 'Deleted' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
