# Lexicon Solo Chat Back - Server

This is the backend server for the **Lexicon Solo Chat** project. It is built using [Partykit](https://partykit.io), enabling real-time collaborative applications.

## 📂 Project Structure

- **`src/lobbies/`**: Contains the logic for managing chat lobbies and rooms.
  - `lobby.ts`: Handles lobby-related operations such as creating, joining, and leaving rooms.
  - `room.ts`: Manages individual chat rooms, including message broadcasting and user presence.
  - `users.ts`: Handles user connections and presence updates.
- **`src/schemas/`**: Defines the data schemas used across the application.
  - `lobby/`: Schemas for lobby-related events and data.
  - `chatroom/`: Schemas for chatroom events, messages, and initialization.
  - `connection-state.ts`: Defines the structure of user and room states.
- **`src/utils.ts`**: Utility functions for token decoding, user retrieval, and event broadcasting.

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/kippeves/lexicon_solo_chat_back.git
   cd lexicon_solo_chat_back/server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

Access the application at [http://localhost:1999](http://localhost:1999).

### Deployment

Deploy the application to the PartyKit cloud:
```bash
npm run deploy
```

## 📜 API Overview

### Endpoints

- **`GET /rooms`**: Fetches the list of available rooms.
- **`POST /main/room`**: Creates a new room.
- **`DELETE /main/room`**: Deletes a room by ID.

### WebSocket Events

- **Lobby Events**:
  - `create`: Broadcasts when a new room is created.
  - `close`: Broadcasts when a room is closed.
  - `update`: Updates the user list in a room.
- **Room Events**:
  - `message`: Sends a chat message.
  - `clear`: Clears all messages in a room.
  - `close`: Closes the room.

## 🛠️ Key Features

- **Real-Time Communication**: Built on WebSocket for instant updates.
- **User Presence**: Tracks and broadcasts user presence in rooms.
- **Token-Based Authentication**: Verifies users using JWT tokens.
- **Scalable Architecture**: Modular design for easy extension.

## 🛠️ Technologies Used

- **[Partykit](https://partykit.io)**: Framework for building real-time collaborative applications.
- **TypeScript**: Provides static typing for better code quality and maintainability.
- **Zod**: Schema validation library for defining and validating data structures.
- **WebSocket**: Enables real-time, bidirectional communication between the server and clients.
- **JWT (JSON Web Tokens)**: Used for secure user authentication and authorization.
- **UUID**: Generates unique identifiers for rooms and other entities.

## 📚 Documentation

Refer to the [Partykit Documentation](https://github.com/partykit/partykit/blob/main/README.md) for more details on the framework.

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📧 Support

For help or questions, reach out via:
- [Discord](https://discord.gg/g5uqHQJc3z)
- [GitHub Issues](https://github.com/kippeves/lexicon_solo_chat_back/issues)

## 📝 License

This project is licensed under the MIT License.
