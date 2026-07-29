import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api',
  withCredentials: true,
})

export function getApiErrorMessage(error, fallbackMessage) {
  return error.response?.data?.message ?? fallbackMessage
}
