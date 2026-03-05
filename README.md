# Telegram Clone

A real-time messaging application inspired by Telegram, built using React, Express, WebSockets, and SQLite.

## Features

- **Real-time Messaging**: Instant message delivery using WebSockets.
- **User Authentication**: Simple username-based login (for demonstration purposes).
- **Persistent Storage**: Messages, users, and chats are stored in a local SQLite database (\`chat.db\`).
- **Modern UI**: Clean, responsive interface built with Tailwind CSS and Lucide React icons.
- **Auto-scrolling**: Automatically scrolls to the newest message in a chat.
- **Avatars**: Auto-generated avatars based on usernames using DiceBear.

## Tech Stack

### Frontend
- **React 19**: UI library.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Lucide React**: Beautiful, consistent icons.
- **Vite**: Fast frontend build tool.
- **date-fns**: For formatting message timestamps.

### Backend
- **Express**: Web framework for serving the API and Vite middleware.
- **ws**: WebSocket library for Node.js to handle real-time communication.
- **better-sqlite3**: Fast, synchronous SQLite3 driver for Node.js.
- **uuid**: For generating unique identifiers for users, chats, and messages.

## Architecture

The application uses a full-stack architecture where a single Node.js process runs both the Express API/WebSocket server and serves the React frontend via Vite middleware.

### Database Schema

1. **Users**: Stores user information (\`id\`, \`username\`, \`avatar\`, \`last_seen\`).
2. **Chats**: Stores chat rooms (\`id\`, \`name\`, \`is_group\`, \`created_at\`).
3. **Chat Members**: Maps users to chats (\`chat_id\`, \`user_id\`).
4. **Messages**: Stores individual messages (\`id\`, \`chat_id\`, \`sender_id\`, \`content\`, \`created_at\`).

### Real-time Communication

1. When a user logs in, the React client establishes a WebSocket connection to the server, passing their \`userId\`.
2. The server maintains a map of active connections (\`clients\`).
3. When a user sends a message, it is sent over the WebSocket to the server.
4. The server saves the message to the SQLite database.
5. The server looks up all members of the chat and broadcasts the new message to any members who are currently online.

## Running the Application

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. The application will be available at \`http://localhost:3000\`.

## Development Notes
#Build by abid ali 
#New Updates are comming soon, where the user will expierienced with advanced tools and features 
## What to Include
Read recipients
last seen or online 
privacy 

- The database is automatically seeded with some initial users (Alice, Bob, Charlie) and a "General Chat" group if it is empty upon starting the server.
- The WebSocket connection automatically uses \`wss://\` if the page is loaded over HTTPS, and \`ws://\` otherwise.
