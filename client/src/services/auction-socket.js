import { io } from 'socket.io-client'

const socketUrl =
  import.meta.env.VITE_SOCKET_URL?.trim().replace(/\/+$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:5000' : undefined)

export const auctionSocket = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
})
