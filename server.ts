import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

dotenv.config();

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize SQLite Database
const db = new Database('chat.db');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    location TEXT,
    website TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    is_group BOOLEAN DEFAULT 0,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT,
    user_id TEXT,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    file_url TEXT,
    status TEXT DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id),
    FOREIGN KEY (sender_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS blocked_users (
    user_id TEXT NOT NULL,
    blocked_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, blocked_user_id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (blocked_user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users (id),
    FOREIGN KEY (message_id) REFERENCES messages (id)
  );
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN password TEXT');
} catch (e) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE messages ADD COLUMN status TEXT DEFAULT "sent"');
} catch (e) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE messages ADD COLUMN type TEXT DEFAULT "text"');
} catch (e) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE messages ADD COLUMN file_url TEXT');
} catch (e) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE chats ADD COLUMN avatar TEXT');
} catch (e) {
  // Column already exists
}

// Seed some initial data if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const users = [
    { id: uuidv4(), username: 'Alice', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice' },
    { id: uuidv4(), username: 'Bob', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob' },
    { id: uuidv4(), username: 'Charlie', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie' }
  ];
  
  const insertUser = db.prepare('INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)');
  users.forEach(u => insertUser.run(u.id, u.username, u.avatar));

  const chatId = uuidv4();
  db.prepare('INSERT INTO chats (id, name, is_group) VALUES (?, ?, ?)').run(chatId, 'General Chat', 1);
  
  const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)');
  users.forEach(u => insertMember.run(chatId, u.id));

  const insertMsg = db.prepare('INSERT INTO messages (id, chat_id, sender_id, content) VALUES (?, ?, ?, ?)');
  insertMsg.run(uuidv4(), chatId, users[0].id, 'Hello everyone!');
  insertMsg.run(uuidv4(), chatId, users[1].id, 'Hi Alice!');
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
  app.use(cookieParser());
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Authentication Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      next();
    } catch (err) {
      res.status(400).json({ error: 'Invalid token' });
    }
  };

  // Upload Route
  app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.originalname, mimetype: req.file.mimetype });
  });

  // Auth Routes
  app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = uuidv4();
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      
      db.prepare('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)')
        .run(id, username, hashedPassword, avatar);
      
      const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      res.json({ user: { id, username, avatar } });
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
      if (!user) return res.status(400).json({ error: 'User not found' });

      const validPass = await bcrypt.compare(password, user.password);
      if (!validPass) return res.status(400).json({ error: 'Invalid password' });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio, location: user.location, website: user.website, joined_at: user.joined_at } });
    } catch (e) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    const user = db.prepare('SELECT id, username, avatar, bio, location, website, joined_at FROM users WHERE id = ?').get(req.user.id) as any;
    res.json(user);
  });

  // API Routes
  app.get('/api/users', authenticateToken, (req, res) => {
    const users = db.prepare('SELECT id, username, avatar, bio, location, website, joined_at, last_seen FROM users').all();
    res.json(users);
  });

  app.put('/api/users/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;
    const { username, avatar, bio, location, website } = req.body;
    
    // Ensure user can only update their own profile
    if (userId !== (req as any).user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      db.prepare('UPDATE users SET username = ?, avatar = ?, bio = ?, location = ?, website = ? WHERE id = ?').run(username, avatar, bio, location, website, userId);
      
      // Broadcast profile update to all clients
      const msg = JSON.stringify({ type: 'profile_updated', userId, username, avatar, bio, location, website });
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
      
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Failed to update profile. Username might be taken.' });
    }
  });

  app.post('/api/groups', authenticateToken, (req, res) => {
    const { name, avatar, memberIds, creatorId } = req.body;
    try {
      const groupId = uuidv4();
      db.prepare('INSERT INTO chats (id, name, is_group, avatar) VALUES (?, ?, 1, ?)').run(groupId, name, avatar || null);
      
      const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)');
      insertMember.run(groupId, creatorId);
      for (const memberId of memberIds) {
        insertMember.run(groupId, memberId);
      }
      
      res.json({ success: true, groupId });
    } catch (e) {
      res.status(500).json({ error: 'Failed to create group' });
    }
  });

  app.put('/api/groups/:groupId', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    const { name, avatar } = req.body;
    try {
      db.prepare('UPDATE chats SET name = ?, avatar = ? WHERE id = ? AND is_group = 1').run(name, avatar || null, groupId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update group' });
    }
  });

  app.get('/api/groups/:groupId/members', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    try {
      const members = db.prepare(`
        SELECT u.id, u.username, u.avatar 
        FROM users u 
        JOIN chat_members cm ON u.id = cm.user_id 
        WHERE cm.chat_id = ?
      `).all(groupId);
      res.json(members);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.post('/api/groups/:groupId/members', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    const { userIds } = req.body;
    try {
      const insertMember = db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)');
      for (const userId of userIds) {
        insertMember.run(groupId, userId);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to add members' });
    }
  });

  app.delete('/api/groups/:groupId/members/:userId', authenticateToken, (req, res) => {
    const { groupId, userId } = req.params;
    try {
      db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(groupId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to remove member' });
    }
  });

  app.get('/api/chats/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;
    
    // Ensure user can only fetch their own chats
    if (userId !== (req as any).user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Ensure private chats exist with all other users
    const otherUsers = db.prepare(`SELECT id FROM users WHERE id != ?`).all(userId) as {id: string}[];
    for (const u of otherUsers) {
      const existing = db.prepare(`
        SELECT c.id
        FROM chats c
        JOIN chat_members cm1 ON c.id = cm1.chat_id
        JOIN chat_members cm2 ON c.id = cm2.chat_id
        WHERE c.is_group = 0 AND cm1.user_id = ? AND cm2.user_id = ?
      `).get(userId, u.id) as {id: string} | undefined;
      
      if (!existing) {
        const newChatId = uuidv4();
        db.prepare('INSERT INTO chats (id, name, is_group) VALUES (?, ?, ?)').run(newChatId, '', 0);
        db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(newChatId, userId);
        db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(newChatId, u.id);
      }
    }

    const chats = db.prepare(`
      SELECT c.id, c.name, c.is_group,
        (SELECT content FROM messages WHERE chat_id = c.id AND sender_id NOT IN (SELECT blocked_user_id FROM blocked_users WHERE user_id = ?) ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE chat_id = c.id AND sender_id NOT IN (SELECT blocked_user_id FROM blocked_users WHERE user_id = ?) ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT user_id FROM chat_members WHERE chat_id = c.id AND user_id != ? LIMIT 1) as other_user_id,
        (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND sender_id != ? AND status != 'read') as unread_count
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE cm.user_id = ?
    `).all(userId, userId, userId, userId, userId) as any[];

    // Attach user details for private chats
    const enrichedChats = chats.map(c => {
      if (c.is_group === 0 && c.other_user_id) {
        const otherUser = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(c.other_user_id) as any;
        return {
          ...c,
          name: otherUser.username,
          avatar: otherUser.avatar,
          is_online: clients.has(c.other_user_id)
        };
      }
      return {
        ...c,
        avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${c.id}`,
        is_online: false
      };
    });

    enrichedChats.sort((a, b) => {
      const timeA = new Date(a.last_message_time || 0).getTime();
      const timeB = new Date(b.last_message_time || 0).getTime();
      return timeB - timeA;
    });

    res.json(enrichedChats);
  });

  app.get('/api/messages/:chatId', authenticateToken, (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.query;
    
    let messages;
    if (userId) {
      messages = db.prepare(`
        SELECT m.*, u.username, u.avatar,
          (
            SELECT json_group_array(json_object('emoji', r.emoji, 'user_id', r.user_id))
            FROM reactions r
            WHERE r.message_id = m.id
          ) as reactions
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ? AND m.sender_id NOT IN (SELECT blocked_user_id FROM blocked_users WHERE user_id = ?)
        ORDER BY m.created_at ASC
      `).all(chatId, userId) as any[];
    } else {
      messages = db.prepare(`
        SELECT m.*, u.username, u.avatar,
          (
            SELECT json_group_array(json_object('emoji', r.emoji, 'user_id', r.user_id))
            FROM reactions r
            WHERE r.message_id = m.id
          ) as reactions
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC
      `).all(chatId) as any[];
    }
    
    // Parse the JSON string from sqlite
    const parsedMessages = messages.map(m => ({
      ...m,
      reactions: m.reactions && m.reactions !== '[{}]' ? JSON.parse(m.reactions).filter((r: any) => r.emoji) : []
    }));
    
    res.json(parsedMessages);
  });

  app.post('/api/reports', authenticateToken, (req, res) => {
    const { reporterId, messageId, reason } = req.body;
    try {
      const id = uuidv4();
      db.prepare('INSERT INTO reports (id, reporter_id, message_id, reason) VALUES (?, ?, ?, ?)').run(id, reporterId, messageId, reason);
      res.json({ success: true, id });
    } catch (e) {
      res.status(500).json({ error: 'Failed to report message' });
    }
  });

  app.post('/api/blocks', authenticateToken, (req, res) => {
    const { userId, blockedUserId } = req.body;
    try {
      db.prepare('INSERT OR IGNORE INTO blocked_users (user_id, blocked_user_id) VALUES (?, ?)').run(userId, blockedUserId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  app.delete('/api/blocks', authenticateToken, (req, res) => {
    const { userId, blockedUserId } = req.body;
    try {
      db.prepare('DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?').run(userId, blockedUserId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  });

  app.get('/api/blocks/:userId', authenticateToken, (req, res) => {
    try {
      const blocks = db.prepare('SELECT blocked_user_id FROM blocked_users WHERE user_id = ?').all(req.params.userId) as {blocked_user_id: string}[];
      res.json(blocks.map(b => b.blocked_user_id));
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch blocks' });
    }
  });

  // WebSocket handling
  const clients = new Map<string, WebSocket>(); // userId -> WebSocket

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      ws.close();
      return;
    }

    clients.set(userId, ws);

    // Broadcast user online status
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    broadcast({ type: 'user_status', userId, status: 'online' });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'send_message') {
          const { chatId, content, messageType = 'text', fileUrl } = message;
          
          // Check for blocks in private chats
          const chat = db.prepare('SELECT is_group FROM chats WHERE id = ?').get(chatId) as {is_group: number};
          if (chat && chat.is_group === 0) {
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
            const otherMember = members.find(m => m.user_id !== userId);
            if (otherMember) {
              const isBlocked = db.prepare('SELECT 1 FROM blocked_users WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)').get(userId, otherMember.user_id, otherMember.user_id, userId);
              if (isBlocked) {
                // Send an error back to the sender
                ws.send(JSON.stringify({ type: 'error', message: 'Cannot send message to this user.' }));
                return;
              }
            }
          }

          const msgId = uuidv4();
          
          db.prepare('INSERT INTO messages (id, chat_id, sender_id, content, type, file_url) VALUES (?, ?, ?, ?, ?, ?)')
            .run(msgId, chatId, userId, content, messageType, fileUrl || null);

          const newMsg = db.prepare(`
            SELECT m.*, u.username, u.avatar 
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?
          `).get(msgId);

          // Get all members of the chat
          const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
          
          // Send to all online members
          members.forEach(member => {
            const clientWs = clients.get(member.user_id);
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'new_message',
                message: { ...newMsg, reactions: [] }
              }));
            }
          });
        } else if (message.type === 'mark_read') {
          const { chatId } = message;
          db.prepare('UPDATE messages SET status = "read" WHERE chat_id = ? AND sender_id != ? AND status != "read"').run(chatId, userId);
          
          const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
          members.forEach(member => {
            if (member.user_id !== userId) {
              const clientWs = clients.get(member.user_id);
              if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'messages_read',
                  chatId,
                  readBy: userId
                }));
              }
            }
          });
        } else if (message.type === 'toggle_reaction') {
          const { messageId, emoji } = message;
          const existing = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji);
          
          if (existing) {
            db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, userId, emoji);
          } else {
            db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, userId, emoji);
          }

          const msg = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId) as {chat_id: string};
          if (msg) {
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(msg.chat_id) as {user_id: string}[];
            members.forEach(member => {
              const clientWs = clients.get(member.user_id);
              if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'reaction_updated',
                  messageId,
                  userId,
                  emoji,
                  action: existing ? 'removed' : 'added',
                  chatId: msg.chat_id
                }));
              }
            });
          }
        } else if (message.type === 'delete_message') {
          const { messageId, chatId } = message;
          // Verify the message belongs to the user
          const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId) as {sender_id: string};
          if (msg && msg.sender_id === userId) {
            // Delete reactions first due to foreign key constraints
            db.prepare('DELETE FROM reactions WHERE message_id = ?').run(messageId);
            // Delete reports
            db.prepare('DELETE FROM reports WHERE message_id = ?').run(messageId);
            // Delete message
            db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
            
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
            members.forEach(member => {
              const clientWs = clients.get(member.user_id);
              if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'message_deleted',
                  messageId,
                  chatId
                }));
              }
            });
          }
        } else if (message.type === 'typing') {
          const { chatId, isTyping } = message;
          const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as {username: string};
          if (user) {
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
            members.forEach(member => {
              if (member.user_id !== userId) {
                const clientWs = clients.get(member.user_id);
                if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'typing',
                    chatId,
                    userId,
                    username: user.username,
                    isTyping
                  }));
                }
              }
            });
          }
        } else if (message.type === 'call_signal') {
          const { chatId, signal, targetUserId } = message;
          const user = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(userId) as {username: string, avatar: string};
          
          if (targetUserId) {
            const clientWs = clients.get(targetUserId);
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'call_signal',
                chatId,
                senderId: userId,
                senderName: user.username,
                senderAvatar: user.avatar,
                signal
              }));
            }
          } else {
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as {user_id: string}[];
            members.forEach(member => {
              if (member.user_id !== userId) {
                const clientWs = clients.get(member.user_id);
                if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'call_signal',
                    chatId,
                    senderId: userId,
                    senderName: user.username,
                    senderAvatar: user.avatar,
                    signal
                  }));
                }
              }
            });
          }
        }
      } catch (e) {
        console.error('Error processing message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(userId);
      db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
      broadcast({ type: 'user_status', userId, status: 'offline', last_seen: new Date().toISOString() });
    });
  });

  function broadcast(data: any) {
    const msg = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
